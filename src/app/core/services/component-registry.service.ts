import { Injectable, signal } from '@angular/core';
import { ALL_COMPONENT_TYPES, ComponentType, SignalType } from '../models/otel-config.model';
import {
  RegistryComponentEntry,
  GitHubDirectoryEntry,
  CacheEntry,
} from '../models/component-registry.model';
import {
  stripComponentSuffix,
  toTitleCase,
  parseMetadataYaml,
} from '../utils/metadata-parser';

const CORE_REPO = 'open-telemetry/opentelemetry-collector';
const CONTRIB_REPO = 'open-telemetry/opentelemetry-collector-contrib';

const DIR_CACHE_TTL = 24 * 60 * 60 * 1000;  // 24 hours
const META_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;  // 7 days

@Injectable({ providedIn: 'root' })
export class ComponentRegistryService {
  private readonly _catalog = signal<RegistryComponentEntry[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly enrichingKeys = new Set<string>();

  readonly catalog = this._catalog.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  constructor() {
    this.loadCatalog();
  }

  /**
   * Fetch directory listings from both repos and build catalog.
   */
  private async loadCatalog(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const fetches = ALL_COMPONENT_TYPES.flatMap(type => [
        this.fetchDirectoryListing(CORE_REPO, type, 'core'),
        this.fetchDirectoryListing(CONTRIB_REPO, type, 'contrib'),
      ]);

      const results = await Promise.allSettled(fetches);
      const entries: RegistryComponentEntry[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          entries.push(...result.value);
        }
      }

      this.mergeCatalog(entries);
    } catch {
      this._error.set('Failed to fetch component catalog from GitHub.');
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Fetch a directory listing for a component type from a repo.
   * Uses localStorage cache with TTL.
   */
  private async fetchDirectoryListing(
    repo: string,
    componentType: ComponentType,
    source: 'core' | 'contrib',
  ): Promise<RegistryComponentEntry[]> {
    const cacheKey = `otel-registry:dirs:${source}:${componentType}`;
    const cached = this.getCached<string[]>(cacheKey, DIR_CACHE_TTL);

    let dirNames: string[];

    if (cached) {
      dirNames = cached;
    } else {
      const url = `https://api.github.com/repos/${repo}/contents/${componentType}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 403) {
          this._error.set('GitHub API rate limit reached. Showing cached components only.');
        }
        return [];
      }

      const entries: GitHubDirectoryEntry[] = await response.json();
      dirNames = entries
        .filter(e => e.type === 'dir')
        .map(e => e.name);

      this.setCache(cacheKey, dirNames);
    }

    return dirNames.map(dirName => {
      const type = stripComponentSuffix(dirName, componentType);
      return {
        type,
        displayName: toTitleCase(type),
        description: '',
        componentType,
        supportedSignals: [],
        defaultConfig: {},
        source,
        enriched: false,
      };
    });
  }

  /**
   * Merge entries from both repos, deduplicating.
   * Core entries take priority over contrib for the same component.
   */
  private mergeCatalog(entries: RegistryComponentEntry[]): void {
    const seen = new Set<string>();
    const merged: RegistryComponentEntry[] = [];

    // Core entries first so they win on duplicates
    const coreFirst = [...entries].sort((a, b) => {
      if (a.source === 'core' && b.source !== 'core') return -1;
      if (a.source !== 'core' && b.source === 'core') return 1;
      return 0;
    });

    for (const entry of coreFirst) {
      const key = this.entryKey(entry);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(entry);
      }
    }

    // Sort alphabetically by type within each componentType
    merged.sort((a, b) => {
      if (a.componentType !== b.componentType) {
        return ALL_COMPONENT_TYPES.indexOf(a.componentType) - ALL_COMPONENT_TYPES.indexOf(b.componentType);
      }
      return a.type.localeCompare(b.type);
    });

    this._catalog.set(merged);
  }

  /**
   * Lazily fetch and parse metadata.yaml for a specific component.
   * Updates the catalog entry with real displayName, description, and signals.
   */
  async enrichComponent(componentType: ComponentType, type: string): Promise<void> {
    const key = `${componentType}:${type}`;
    if (this.enrichingKeys.has(key)) return;
    this.enrichingKeys.add(key);

    try {
      const metaCacheKey = `otel-registry:meta:${componentType}:${type}`;
      const cached = this.getCached<{ displayName: string; description: string; supportedSignals: SignalType[] }>(
        metaCacheKey, META_CACHE_TTL,
      );

      if (cached) {
        this.applyEnrichment(componentType, type, cached.displayName, cached.description, cached.supportedSignals);
        return;
      }

      const entry = this._catalog().find(e => e.componentType === componentType && e.type === type);
      if (!entry || entry.enriched) return;

      const repo = entry.source === 'core' ? CORE_REPO : CONTRIB_REPO;
      const dirName = this.guessDirectoryName(type, componentType);
      const url = `https://raw.githubusercontent.com/${repo}/main/${componentType}/${dirName}/metadata.yaml`;

      const response = await fetch(url);
      if (!response.ok) return;

      const yamlStr = await response.text();
      const parsed = parseMetadataYaml(yamlStr, componentType);
      if (!parsed) return;

      this.setCache(metaCacheKey, {
        displayName: parsed.displayName,
        description: parsed.description,
        supportedSignals: parsed.supportedSignals,
      });

      this.applyEnrichment(
        componentType, type,
        parsed.displayName, parsed.description, parsed.supportedSignals,
      );
    } finally {
      this.enrichingKeys.delete(key);
    }
  }

  private applyEnrichment(
    componentType: ComponentType,
    type: string,
    displayName: string,
    description: string,
    supportedSignals: SignalType[],
  ): void {
    const updated = this._catalog().map(e => {
      if (e.componentType === componentType && e.type === type && !e.enriched) {
        return {
          ...e,
          displayName: displayName || e.displayName,
          description: description || e.description,
          supportedSignals: supportedSignals.length > 0 ? supportedSignals : e.supportedSignals,
          enriched: true,
        };
      }
      return e;
    });
    this._catalog.set(updated);
  }

  /**
   * Guess the directory name for a component type.
   * Convention: <type><componentType> (e.g., "prometheus" + "receiver" → "prometheusreceiver")
   */
  private guessDirectoryName(type: string, componentType: ComponentType): string {
    return `${type.replace(/_/g, '')}${componentType}`;
  }

  private entryKey(entry: { componentType: ComponentType; type: string }): string {
    return `${entry.componentType}:${entry.type}`;
  }

  // ─── Cache helpers ───────────────────────────────────────────

  private getCached<T>(key: string, ttlMs: number): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      if (Date.now() - entry.timestamp > ttlMs) {
        localStorage.removeItem(key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  private setCache<T>(key: string, data: T): void {
    try {
      const entry: CacheEntry<T> = { data, timestamp: Date.now() };
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }

  /** Clear all registry caches and re-fetch from GitHub. */
  clearCacheAndRefresh(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('otel-registry:')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {
      // ignore
    }
    this._catalog.set([]);
    this.loadCatalog();
  }
}
