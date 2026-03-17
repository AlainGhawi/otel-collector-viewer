import { ComponentType, SignalType } from './otel-config.model';
import { ComponentDefinition } from './component-library.model';

/**
 * Extended component definition that tracks its origin and enrichment state.
 * Backwards-compatible with ComponentDefinition.
 */
export interface RegistryComponentEntry extends ComponentDefinition {
  /** Which repo this component was discovered from */
  source: 'core' | 'contrib';
  /** Whether metadata.yaml has been fetched and parsed */
  enriched: boolean;
}

/** Raw directory entry from GitHub Contents API */
export interface GitHubDirectoryEntry {
  name: string;
  type: string;
  path: string;
}

/** Parsed fields from a component's metadata.yaml */
export interface ParsedMetadata {
  type: string;
  displayName: string;
  description: string;
  componentType: ComponentType;
  supportedSignals: SignalType[];
}

/** Shape of cached data in localStorage */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
