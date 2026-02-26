import {
  OtlpAnyValue,
  OtlpKeyValue,
  SeverityLevel,
  HttpStatusCategory,
} from '../models/otlp-log.model';

// ─── AnyValue Extraction ────────────────────────────────────────────

/**
 * Extract a primitive JS value from an OTLP AnyValue.
 * Returns undefined if the value type is unrecognized.
 */
export function extractAnyValue(
  av: OtlpAnyValue | undefined
): string | number | boolean | unknown[] | Record<string, unknown> | undefined {
  if (!av) return undefined;
  if (av.stringValue !== undefined) return av.stringValue;
  if (av.intValue !== undefined) return safeParseNumber(av.intValue);
  if (av.doubleValue !== undefined) return av.doubleValue;
  if (av.boolValue !== undefined) return av.boolValue;
  if (av.arrayValue?.values) return av.arrayValue.values.map(extractAnyValue);
  if (av.kvlistValue?.values) return kvlistToRecord(av.kvlistValue.values);
  if (av.bytesValue !== undefined) return av.bytesValue;
  return undefined;
}

/**
 * Convert an array of OtlpKeyValue to a flat Record.
 * Only includes primitive values (string, number, boolean).
 */
export function kvlistToRecord(
  kvs: OtlpKeyValue[] | undefined
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!kvs) return result;
  for (const kv of kvs) {
    const val = extractAnyValue(kv.value);
    if (val !== undefined && typeof val !== 'object') {
      result[kv.key] = val as string | number | boolean;
    }
  }
  return result;
}

function safeParseNumber(val: string): number {
  return Number(val);
}

// ─── Severity Mapping ───────────────────────────────────────────────

const SEVERITY_MAP: Record<number, SeverityLevel> = {};
for (let i = 1; i <= 4; i++) SEVERITY_MAP[i] = 'TRACE';
for (let i = 5; i <= 8; i++) SEVERITY_MAP[i] = 'DEBUG';
for (let i = 9; i <= 12; i++) SEVERITY_MAP[i] = 'INFO';
for (let i = 13; i <= 16; i++) SEVERITY_MAP[i] = 'WARN';
for (let i = 17; i <= 20; i++) SEVERITY_MAP[i] = 'ERROR';
for (let i = 21; i <= 24; i++) SEVERITY_MAP[i] = 'FATAL';

/**
 * Map OTLP severity number (1-24) to a normalized severity level.
 * Falls back to parsing severityText, then defaults to 'INFO'.
 */
export function normalizeSeverity(
  severityNumber?: number,
  severityText?: string
): SeverityLevel {
  if (severityNumber && SEVERITY_MAP[severityNumber]) {
    return SEVERITY_MAP[severityNumber];
  }
  if (severityText) {
    const upper = severityText.toUpperCase();
    if (upper.includes('TRACE')) return 'TRACE';
    if (upper.includes('DEBUG')) return 'DEBUG';
    if (upper.includes('INFO')) return 'INFO';
    if (upper.includes('WARN')) return 'WARN';
    if (upper.includes('ERROR') || upper.includes('ERR')) return 'ERROR';
    if (upper.includes('FATAL') || upper.includes('CRITICAL')) return 'FATAL';
  }
  return 'INFO';
}

// ─── Timestamp Conversion ───────────────────────────────────────────

/**
 * Convert nanosecond timestamp string to Date.
 * Handles nanosecond strings (16+ digits), millisecond strings (13 digits),
 * second strings (10 digits), and ISO 8601 strings.
 * Returns epoch 0 if parsing fails.
 */
export function nanoTimestampToDate(nanoStr: string | undefined): Date {
  if (!nanoStr) return new Date(0);

  // Nanosecond string (16+ digits)
  if (/^\d{16,}$/.test(nanoStr)) {
    const ms = Math.floor(Number(nanoStr) / 1_000_000);
    return new Date(ms);
  }

  // Millisecond string (13 digits)
  if (/^\d{13}$/.test(nanoStr)) {
    return new Date(Number(nanoStr));
  }

  // Second string (10 digits)
  if (/^\d{10}$/.test(nanoStr)) {
    return new Date(Number(nanoStr) * 1000);
  }

  // ISO 8601 string
  const parsed = new Date(nanoStr);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

// ─── Body Inner JSON Parsing ────────────────────────────────────────

export interface BodyInnerJson {
  timestamp?: string;
  level?: string;
  message?: string;
  http?: {
    method?: string;
    path?: string;
    status?: number;
  };
  user?: {
    id?: string;
    session_id?: string;
    ip?: string;
  };
  trace?: {
    trace_id?: string;
    span_id?: string;
  };
  service?: {
    version?: string;
  };
  tags?: string[];
  attrs?: Record<string, unknown>;
}

/**
 * Attempt to parse body.stringValue as JSON.
 * Returns null if the body is not valid JSON or not an object.
 */
export function parseBodyJson(rawBody: string): BodyInnerJson | null {
  if (!rawBody || rawBody[0] !== '{') return null;
  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as BodyInnerJson;
  } catch {
    return null;
  }
}

// ─── Deduplication ──────────────────────────────────────────────────

/**
 * Generate a deterministic ID for a log record using FNV-1a hash.
 */
export function generateLogRecordId(
  timeUnixNano: string,
  severityNumber: number,
  rawBody: string,
  sourceFile: string,
  lineNumber: number
): string {
  const input = `${sourceFile}:${lineNumber}:${timeUnixNano}:${severityNumber}:${rawBody.slice(0, 200)}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(36) + '-' + lineNumber.toString(36);
}

// ─── HTTP Status Category ───────────────────────────────────────────

export function httpStatusToCategory(
  status: number | undefined
): HttpStatusCategory | undefined {
  if (status === undefined || status === null) return undefined;
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500) return '5xx';
  return undefined;
}

// ─── File Rotation Detection ────────────────────────────────────────

/** Detect if a filename is a rotated log file (has timestamp before extension). */
export function isRotatedFile(fileName: string): boolean {
  return /\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}\.json$/.test(fileName);
}

// ─── Format Helpers ─────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD HH:mm:ss.SSS in local time */
export function formatTimestampLocal(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  );
}

/** Format a Date as YYYY-MM-DD HH:mm:ss.SSS in UTC */
export function formatTimestampUTC(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
  );
}

/** Format bytes into human-readable size */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
