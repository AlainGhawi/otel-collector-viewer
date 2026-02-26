/// <reference lib="webworker" />

import {
  OtlpExportLogsServiceRequest,
  ParsedLogRecord,
} from './core/models/otlp-log.model';
import {
  WorkerRequest,
  WorkerChunkMessage,
  WorkerProgressMessage,
  WorkerCompleteMessage,
} from './core/models/log-worker-protocol';
import {
  kvlistToRecord,
  normalizeSeverity,
  nanoTimestampToDate,
  parseBodyJson,
  generateLogRecordId,
  extractAnyValue,
} from './core/utils/otlp-log-helpers';

const activeCancellations = new Set<string>();

addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    activeCancellations.add(msg.jobId);
    return;
  }
  if (msg.type === 'parse') {
    parseFile(msg.jobId, msg.fileName, msg.content, msg.chunkSize ?? 500);
  }
});

function parseFile(
  jobId: string,
  fileName: string,
  content: string,
  chunkSize: number
): void {
  const startTime = performance.now();
  const trimmed = content.trim();

  // Detect format: if the first non-empty line is just "{" or "[",
  // the file is pretty-printed single JSON, not JSONL.
  const firstLine = trimmed.split('\n', 1)[0].trim();
  const isPrettyPrinted = firstLine === '{' || firstLine === '[';

  if (isPrettyPrinted) {
    parseSingleJson(jobId, fileName, trimmed, chunkSize, startTime);
  } else {
    parseJsonl(jobId, fileName, content, chunkSize, startTime);
  }
}

/**
 * Parse a single pretty-printed JSON file (one ExportLogsServiceRequest
 * or an array of them).
 */
function parseSingleJson(
  jobId: string,
  fileName: string,
  content: string,
  chunkSize: number,
  startTime: number
): void {
  // Report initial progress — parsing phase
  postMessage({
    type: 'progress',
    jobId,
    totalLines: 1,
    processedLines: 0,
    percent: 10,
  } satisfies WorkerProgressMessage);

  let envelopes: OtlpExportLogsServiceRequest[];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      envelopes = parsed;
    } else if (parsed && parsed.resourceLogs) {
      envelopes = [parsed];
    } else {
      postMessage({
        type: 'chunk',
        jobId,
        records: [],
        parseErrors: 1,
      } satisfies WorkerChunkMessage);
      postMessage({
        type: 'complete',
        jobId,
        totalRecords: 0,
        totalParseErrors: 1,
        elapsedMs: Math.round(performance.now() - startTime),
      } satisfies WorkerCompleteMessage);
      return;
    }
  } catch {
    // JSON.parse failed — file likely contains multiple concatenated
    // pretty-printed JSON objects (file exporter appends per flush).
    // Split on top-level object boundaries and parse each individually.
    const jsonTexts = splitConcatenatedJson(content);
    if (jsonTexts.length === 0) {
      postMessage({
        type: 'chunk',
        jobId,
        records: [],
        parseErrors: 1,
      } satisfies WorkerChunkMessage);
      postMessage({
        type: 'complete',
        jobId,
        totalRecords: 0,
        totalParseErrors: 1,
        elapsedMs: Math.round(performance.now() - startTime),
      } satisfies WorkerCompleteMessage);
      return;
    }
    envelopes = [];
    for (const text of jsonTexts) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          envelopes.push(...parsed);
        } else if (parsed && parsed.resourceLogs) {
          envelopes.push(parsed);
        }
      } catch {
        // Skip unparseable chunks
      }
    }
  }

  postMessage({
    type: 'progress',
    jobId,
    totalLines: 1,
    processedLines: 0,
    percent: 50,
  } satisfies WorkerProgressMessage);

  // Flatten all envelopes and emit in chunks
  let totalRecords = 0;
  let chunkRecords: ParsedLogRecord[] = [];

  for (let e = 0; e < envelopes.length; e++) {
    if (activeCancellations.has(jobId)) {
      activeCancellations.delete(jobId);
      return;
    }

    const records = flattenEnvelope(envelopes[e], fileName, e + 1);
    for (const record of records) {
      chunkRecords.push(record);
      totalRecords++;

      if (chunkRecords.length >= chunkSize) {
        postMessage({
          type: 'chunk',
          jobId,
          records: chunkRecords,
          parseErrors: 0,
        } satisfies WorkerChunkMessage);
        chunkRecords = [];

        postMessage({
          type: 'progress',
          jobId,
          totalLines: envelopes.length,
          processedLines: e + 1,
          percent: 50 + Math.round(((e + 1) / envelopes.length) * 50),
        } satisfies WorkerProgressMessage);
      }
    }
  }

  // Flush remaining records
  if (chunkRecords.length > 0) {
    postMessage({
      type: 'chunk',
      jobId,
      records: chunkRecords,
      parseErrors: 0,
    } satisfies WorkerChunkMessage);
  }

  postMessage({
    type: 'complete',
    jobId,
    totalRecords,
    totalParseErrors: 0,
    elapsedMs: Math.round(performance.now() - startTime),
  } satisfies WorkerCompleteMessage);
}

/**
 * Parse JSONL format (one JSON object per line).
 */
function parseJsonl(
  jobId: string,
  fileName: string,
  content: string,
  chunkSize: number,
  startTime: number
): void {
  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;
  let processedLines = 0;
  let totalRecords = 0;
  let totalParseErrors = 0;

  let chunkRecords: ParsedLogRecord[] = [];
  let chunkErrors = 0;

  for (let i = 0; i < totalLines; i++) {
    // Check cancellation every 100 lines
    if (i % 100 === 0 && activeCancellations.has(jobId)) {
      activeCancellations.delete(jobId);
      return;
    }

    const line = lines[i].trim();
    if (!line) {
      processedLines++;
      continue;
    }

    try {
      const envelope: OtlpExportLogsServiceRequest = JSON.parse(line);
      const records = flattenEnvelope(envelope, fileName, i + 1);
      chunkRecords.push(...records);
      totalRecords += records.length;
    } catch {
      chunkErrors++;
      totalParseErrors++;
    }

    processedLines++;

    // Emit chunk when buffer is full
    if (chunkRecords.length >= chunkSize) {
      postMessage({
        type: 'chunk',
        jobId,
        records: chunkRecords,
        parseErrors: chunkErrors,
      } satisfies WorkerChunkMessage);
      chunkRecords = [];
      chunkErrors = 0;

      postMessage({
        type: 'progress',
        jobId,
        totalLines,
        processedLines,
        percent: Math.round((processedLines / totalLines) * 100),
      } satisfies WorkerProgressMessage);
    }
  }

  // Flush remaining records
  if (chunkRecords.length > 0 || chunkErrors > 0) {
    postMessage({
      type: 'chunk',
      jobId,
      records: chunkRecords,
      parseErrors: chunkErrors,
    } satisfies WorkerChunkMessage);
  }

  postMessage({
    type: 'complete',
    jobId,
    totalRecords,
    totalParseErrors,
    elapsedMs: Math.round(performance.now() - startTime),
  } satisfies WorkerCompleteMessage);
}

/**
 * Split concatenated pretty-printed JSON objects.
 * The file exporter appends one JSON object per flush, so a file may
 * contain multiple top-level objects like: {...}\n{...}\n{...}
 * Top-level braces are at column 0; nested braces are indented.
 */
function splitConcatenatedJson(content: string): string[] {
  const results: string[] = [];
  let objectStart = -1;
  let pos = 0;
  const len = content.length;

  while (pos < len) {
    const nlPos = content.indexOf('\n', pos);
    const lineEnd = nlPos === -1 ? len : nlPos;
    const line = content.substring(pos, lineEnd).trimEnd();

    if (line === '{' && objectStart === -1) {
      objectStart = pos;
    } else if (line === '}' && objectStart !== -1) {
      results.push(content.substring(objectStart, lineEnd));
      objectStart = -1;
    }

    pos = lineEnd + 1;
  }

  return results;
}

function flattenEnvelope(
  envelope: OtlpExportLogsServiceRequest,
  fileName: string,
  lineNumber: number
): ParsedLogRecord[] {
  const results: ParsedLogRecord[] = [];

  for (const resourceLog of envelope.resourceLogs ?? []) {
    const resourceAttrs = kvlistToRecord(resourceLog.resource?.attributes);
    const serviceName = resourceAttrs['service.name'] as string | undefined;
    const workloadName = resourceAttrs['workload.name'] as string | undefined;

    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      const scopeName = scopeLog.scope?.name;
      const scopeVersion = scopeLog.scope?.version;

      for (const logRecord of scopeLog.logRecords ?? []) {
        const timeNano =
          logRecord.timeUnixNano ?? logRecord.observedTimeUnixNano ?? '';

        // Extract body value
        let rawBody = '';
        if (logRecord.body) {
          const bodyVal = extractAnyValue(logRecord.body);
          rawBody = typeof bodyVal === 'string' ? bodyVal : JSON.stringify(bodyVal ?? '');
        }

        const severityNum = logRecord.severityNumber ?? 0;
        const severityTxt = normalizeSeverity(
          logRecord.severityNumber,
          logRecord.severityText
        );
        const logAttrs = kvlistToRecord(logRecord.attributes);

        // Parse inner JSON from body
        const inner = parseBodyJson(rawBody);

        const record: ParsedLogRecord = {
          id: generateLogRecordId(
            timeNano,
            severityNum,
            rawBody,
            fileName,
            lineNumber
          ),
          timeUnixNano: timeNano,
          timestamp: nanoTimestampToDate(timeNano),
          severityNumber: severityNum,
          severityText: severityTxt,
          rawBody,
          message: inner?.message ?? rawBody.slice(0, 500),
          bodyLevel: inner?.level,
          bodyTimestamp: inner?.timestamp,
          httpMethod: inner?.http?.method,
          httpPath: inner?.http?.path,
          httpStatusCode: inner?.http?.status,
          userId: inner?.user?.id,
          userSessionId: inner?.user?.session_id,
          userIp: inner?.user?.ip,
          traceId: inner?.trace?.trace_id ?? logRecord.traceId,
          spanId: inner?.trace?.span_id ?? logRecord.spanId,
          envelopeTraceId: logRecord.traceId,
          envelopeSpanId: logRecord.spanId,
          serviceName: serviceName,
          serviceVersion: inner?.service?.version,
          workloadName: workloadName,
          tags: inner?.tags,
          bodyAttrs: inner?.attrs,
          resourceAttributes: resourceAttrs,
          scopeName,
          scopeVersion,
          logAttributes: logAttrs,
          sourceFile: fileName,
          sourceLineNumber: lineNumber,
        };

        results.push(record);
      }
    }
  }

  return results;
}
