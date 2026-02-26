// ─── OTLP Raw JSON Types (input parsing) ────────────────────────────

/** AnyValue as defined by OTLP JSON encoding */
export interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string; // OTLP encodes int64 as string
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: OtlpAnyValue[] };
  kvlistValue?: { values: OtlpKeyValue[] };
  bytesValue?: string; // base64-encoded
}

export interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

export interface OtlpLogRecord {
  timeUnixNano?: string;
  observedTimeUnixNano?: string;
  severityNumber?: number;
  severityText?: string;
  body?: OtlpAnyValue;
  attributes?: OtlpKeyValue[];
  droppedAttributesCount?: number;
  flags?: number;
  traceId?: string;
  spanId?: string;
}

export interface OtlpScope {
  name?: string;
  version?: string;
  attributes?: OtlpKeyValue[];
}

export interface OtlpScopeLog {
  scope?: OtlpScope;
  logRecords?: OtlpLogRecord[];
}

export interface OtlpResource {
  attributes?: OtlpKeyValue[];
  droppedAttributesCount?: number;
}

export interface OtlpResourceLog {
  resource?: OtlpResource;
  scopeLogs?: OtlpScopeLog[];
}

export interface OtlpExportLogsServiceRequest {
  resourceLogs?: OtlpResourceLog[];
}

// ─── Severity ───────────────────────────────────────────────────────

export type SeverityLevel =
  | 'TRACE'
  | 'DEBUG'
  | 'INFO'
  | 'WARN'
  | 'ERROR'
  | 'FATAL';

export const ALL_SEVERITY_LEVELS: SeverityLevel[] = [
  'TRACE',
  'DEBUG',
  'INFO',
  'WARN',
  'ERROR',
  'FATAL',
];

// ─── HTTP Status Category ───────────────────────────────────────────

export type HttpStatusCategory = '2xx' | '3xx' | '4xx' | '5xx';

// ─── Parsed/Flattened Model (output) ────────────────────────────────

export interface ParsedLogRecord {
  /** Unique ID for deduplication and tracking */
  id: string;

  // Timestamp
  timeUnixNano: string;
  timestamp: Date;

  // Severity
  severityNumber: number;
  severityText: SeverityLevel;

  // Body
  rawBody: string;
  message: string;

  // Body inner JSON fields
  bodyLevel?: string;
  bodyTimestamp?: string;

  // HTTP fields (from inner JSON)
  httpMethod?: string;
  httpPath?: string;
  httpStatusCode?: number;

  // Identity / Correlation
  userId?: string;
  userSessionId?: string;
  userIp?: string;
  traceId?: string;
  spanId?: string;
  envelopeTraceId?: string;
  envelopeSpanId?: string;

  // Service / Context
  serviceName?: string;
  serviceVersion?: string;
  workloadName?: string;
  tags?: string[];
  bodyAttrs?: Record<string, unknown>;

  // Resource attributes
  resourceAttributes: Record<string, string | number | boolean>;

  // Scope
  scopeName?: string;
  scopeVersion?: string;

  // OTLP log record attributes
  logAttributes: Record<string, string | number | boolean>;

  // Metadata
  sourceFile: string;
  sourceLineNumber: number;
}

// ─── Filter State ───────────────────────────────────────────────────

export interface LogFilterState {
  severities: SeverityLevel[];
  searchText: string;
  timeRange: {
    start: Date | null;
    end: Date | null;
  };
  services: string[];
  httpStatusCategories: HttpStatusCategory[];
  traceId: string;
}

export function createDefaultFilterState(): LogFilterState {
  return {
    severities: [],
    searchText: '',
    timeRange: { start: null, end: null },
    services: [],
    httpStatusCategories: [],
    traceId: '',
  };
}

// ─── Summary Stats ──────────────────────────────────────────────────

export interface LogSummaryStats {
  totalRecords: number;
  filteredRecords: number;
  severityCounts: Record<SeverityLevel, number>;
  serviceCounts: Record<string, number>;
  httpStatusCounts: Record<HttpStatusCategory, number>;
  timeRange: {
    earliest: Date | null;
    latest: Date | null;
  };
  filesLoaded: number;
  totalParseErrors: number;
}

// ─── File Metadata ──────────────────────────────────────────────────

export interface LoadedFileMetadata {
  fileName: string;
  fileSize: number;
  recordCount: number;
  parseErrors: number;
  loadedAt: Date;
  isRotated: boolean;
}
