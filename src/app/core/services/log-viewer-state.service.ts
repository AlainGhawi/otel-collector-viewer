import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ParsedLogRecord,
  LogFilterState,
  LogSummaryStats,
  LoadedFileMetadata,
  SeverityLevel,
  HttpStatusCategory,
  ALL_SEVERITY_LEVELS,
  createDefaultFilterState,
} from '../models/otlp-log.model';
import { httpStatusToCategory, isRotatedFile } from '../utils/otlp-log-helpers';
import { OtlpLogParserService, ParseProgress } from './otlp-log-parser.service';

@Injectable({ providedIn: 'root' })
export class LogViewerStateService {
  private readonly parser = inject(OtlpLogParserService);
  private readonly destroyRef = inject(DestroyRef);

  // ─── Core State Signals ─────────────────────────────────────────

  private readonly _allRecords = signal<ParsedLogRecord[]>([]);
  private readonly _loadedFiles = signal<LoadedFileMetadata[]>([]);
  private readonly _filters = signal<LogFilterState>(createDefaultFilterState());
  private readonly _parseProgress = signal<ParseProgress | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _selectedRecord = signal<ParsedLogRecord | null>(null);
  private readonly _totalParseErrors = signal(0);
  private readonly _sortDirection = signal<'asc' | 'desc'>('asc');

  // Track active job metadata for enrichment
  private readonly activeJobs = new Map<
    string,
    { fileName: string; fileSize: number }
  >();

  // ─── Public Readonly Signals ────────────────────────────────────

  readonly allRecords = this._allRecords.asReadonly();
  readonly loadedFiles = this._loadedFiles.asReadonly();
  readonly filters = this._filters.asReadonly();
  readonly parseProgress = this._parseProgress.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly selectedRecord = this._selectedRecord.asReadonly();
  readonly sortDirection = this._sortDirection.asReadonly();

  // ─── Computed Signals ───────────────────────────────────────────

  readonly filteredRecords = computed<ParsedLogRecord[]>(() => {
    const records = this._allRecords();
    const filters = this._filters();
    const direction = this._sortDirection();
    const filtered = this.applyFilters(records, filters);
    if (direction === 'desc') {
      return [...filtered].reverse();
    }
    return filtered;
  });

  readonly summaryStats = computed<LogSummaryStats>(() => {
    const all = this._allRecords();
    const filtered = this.filteredRecords();

    const severityCounts = Object.fromEntries(
      ALL_SEVERITY_LEVELS.map((s) => [s, 0])
    ) as Record<SeverityLevel, number>;
    const serviceCounts: Record<string, number> = {};
    const httpStatusCounts = {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0,
    } as Record<HttpStatusCategory, number>;
    let earliest: Date | null = null;
    let latest: Date | null = null;

    for (const r of all) {
      severityCounts[r.severityText]++;

      const svc = r.serviceName ?? r.workloadName;
      if (svc) {
        serviceCounts[svc] = (serviceCounts[svc] ?? 0) + 1;
      }

      const cat = httpStatusToCategory(r.httpStatusCode);
      if (cat) httpStatusCounts[cat]++;

      if (!earliest || r.timestamp < earliest) earliest = r.timestamp;
      if (!latest || r.timestamp > latest) latest = r.timestamp;
    }

    return {
      totalRecords: all.length,
      filteredRecords: filtered.length,
      severityCounts,
      serviceCounts,
      httpStatusCounts,
      timeRange: { earliest, latest },
      filesLoaded: this._loadedFiles().length,
      totalParseErrors: this._totalParseErrors(),
    };
  });

  readonly availableServices = computed<string[]>(() => {
    const services = new Set<string>();
    for (const r of this._allRecords()) {
      const svc = r.serviceName ?? r.workloadName;
      if (svc) services.add(svc);
    }
    return [...services].sort();
  });

  readonly hasRecords = computed(() => this._allRecords().length > 0);

  constructor() {
    this.subscribeToParser();
  }

  // ─── Public Methods ─────────────────────────────────────────────

  loadFile(file: File): void {
    this._isLoading.set(true);
    const jobId = this.parser.parseFile(file);
    this.activeJobs.set(jobId, {
      fileName: file.name,
      fileSize: file.size,
    });
  }

  loadText(text: string, fileName = 'pasted-text'): void {
    this._isLoading.set(true);
    const jobId = this.parser.parseText(text, fileName);
    this.activeJobs.set(jobId, {
      fileName,
      fileSize: new Blob([text]).size,
    });
  }

  updateFilters(partial: Partial<LogFilterState>): void {
    this._filters.update((current) => ({ ...current, ...partial }));
  }

  resetFilters(): void {
    this._filters.set(createDefaultFilterState());
  }

  toggleSortDirection(): void {
    this._sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
  }

  selectRecord(record: ParsedLogRecord | null): void {
    this._selectedRecord.set(record);
  }

  removeFile(fileName: string): void {
    this._allRecords.update((records) =>
      records.filter((r) => r.sourceFile !== fileName)
    );
    this._loadedFiles.update((files) =>
      files.filter((f) => f.fileName !== fileName)
    );
  }

  clearAll(): void {
    this._allRecords.set([]);
    this._loadedFiles.set([]);
    this._filters.set(createDefaultFilterState());
    this._selectedRecord.set(null);
    this._parseProgress.set(null);
    this._isLoading.set(false);
    this._totalParseErrors.set(0);
  }

  // ─── Private: Parser Subscription ───────────────────────────────

  private subscribeToParser(): void {
    this.parser.chunk$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((chunk) => {
        this._allRecords.update((existing) => {
          const existingIds = new Set(existing.map((r) => r.id));
          const newRecords = chunk.records.filter(
            (r) => !existingIds.has(r.id)
          );
          const merged = [...existing, ...newRecords];
          merged.sort(
            (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
          );
          return merged;
        });
        if (chunk.parseErrors > 0) {
          this._totalParseErrors.update((n) => n + chunk.parseErrors);
        }
      });

    this.parser.progress$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((progress) => {
        const meta = this.activeJobs.get(progress.jobId);
        if (meta) {
          progress.fileName = meta.fileName;
        }
        this._parseProgress.set({ ...progress });
      });

    this.parser.complete$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((complete) => {
        const meta = this.activeJobs.get(complete.jobId);
        if (meta) {
          this._loadedFiles.update((files) => [
            ...files,
            {
              fileName: meta.fileName,
              fileSize: meta.fileSize,
              recordCount: complete.totalRecords,
              parseErrors: complete.totalParseErrors,
              loadedAt: new Date(),
              isRotated: isRotatedFile(meta.fileName),
            },
          ]);
        }
        this.activeJobs.delete(complete.jobId);
        if (this.activeJobs.size === 0) {
          this._isLoading.set(false);
          this._parseProgress.set(null);
        }
      });

    this.parser.error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((err) => {
        console.error(`Parse error [${err.jobId}]:`, err.error);
        this.activeJobs.delete(err.jobId);
        if (this.activeJobs.size === 0) {
          this._isLoading.set(false);
        }
      });
  }

  // ─── Private: Filtering Logic ───────────────────────────────────

  private applyFilters(
    records: ParsedLogRecord[],
    filters: LogFilterState
  ): ParsedLogRecord[] {
    let result = records;

    // Severity filter (cheap)
    if (filters.severities.length > 0) {
      const severitySet = new Set(filters.severities);
      result = result.filter((r) => severitySet.has(r.severityText));
    }

    // Time range filter (cheap)
    if (filters.timeRange.start) {
      const startMs = filters.timeRange.start.getTime();
      result = result.filter((r) => r.timestamp.getTime() >= startMs);
    }
    if (filters.timeRange.end) {
      const endMs = filters.timeRange.end.getTime();
      result = result.filter((r) => r.timestamp.getTime() <= endMs);
    }

    // Service filter
    if (filters.services.length > 0) {
      const serviceSet = new Set(filters.services);
      result = result.filter((r) => {
        const svc = r.serviceName ?? r.workloadName;
        return svc && serviceSet.has(svc);
      });
    }

    // HTTP status category filter
    if (filters.httpStatusCategories.length > 0) {
      const catSet = new Set(filters.httpStatusCategories);
      result = result.filter((r) => {
        const cat = httpStatusToCategory(r.httpStatusCode);
        return cat && catSet.has(cat);
      });
    }

    // HTTP method filter
    if (filters.httpMethods.length > 0) {
      const methodSet = new Set(filters.httpMethods);
      result = result.filter((r) => r.httpMethod && methodSet.has(r.httpMethod));
    }

    // HTTP path filter (substring match)
    if (filters.httpPath) {
      const pathLower = filters.httpPath.toLowerCase();
      result = result.filter(
        (r) => r.httpPath?.toLowerCase().includes(pathLower) ?? false
      );
    }

    // Text search (most expensive, run last)
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      result = result.filter((r) => this.matchesTextSearch(r, searchLower));
    }

    return result;
  }

  private matchesTextSearch(
    record: ParsedLogRecord,
    searchLower: string
  ): boolean {
    return (
      record.message.toLowerCase().includes(searchLower) ||
      (record.httpPath?.toLowerCase().includes(searchLower) ?? false) ||
      (record.userId?.toLowerCase().includes(searchLower) ?? false) ||
      (record.traceId?.toLowerCase().includes(searchLower) ?? false) ||
      (record.tags?.some((t) => t.toLowerCase().includes(searchLower)) ??
        false) ||
      (record.serviceName?.toLowerCase().includes(searchLower) ?? false) ||
      (record.workloadName?.toLowerCase().includes(searchLower) ?? false)
    );
  }
}
