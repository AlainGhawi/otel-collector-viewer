import { ParsedLogRecord } from './otlp-log.model';

// ─── Main Thread → Worker Messages ─────────────────────────────────

export interface WorkerParseRequest {
  type: 'parse';
  jobId: string;
  fileName: string;
  content: string;
  chunkSize?: number;
}

export interface WorkerCancelRequest {
  type: 'cancel';
  jobId: string;
}

export type WorkerRequest = WorkerParseRequest | WorkerCancelRequest;

// ─── Worker → Main Thread Messages ─────────────────────────────────

export interface WorkerProgressMessage {
  type: 'progress';
  jobId: string;
  totalLines: number;
  processedLines: number;
  percent: number;
}

export interface WorkerChunkMessage {
  type: 'chunk';
  jobId: string;
  records: ParsedLogRecord[];
  parseErrors: number;
}

export interface WorkerCompleteMessage {
  type: 'complete';
  jobId: string;
  totalRecords: number;
  totalParseErrors: number;
  elapsedMs: number;
}

export interface WorkerErrorMessage {
  type: 'error';
  jobId: string;
  error: string;
}

export type WorkerResponse =
  | WorkerProgressMessage
  | WorkerChunkMessage
  | WorkerCompleteMessage
  | WorkerErrorMessage;
