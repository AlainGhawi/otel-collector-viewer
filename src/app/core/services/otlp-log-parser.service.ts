import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { ParsedLogRecord } from '../models/otlp-log.model';
import {
  WorkerRequest,
  WorkerResponse,
} from '../models/log-worker-protocol';

export interface ParseProgress {
  jobId: string;
  fileName: string;
  percent: number;
  totalLines: number;
  processedLines: number;
}

export interface ParseChunkResult {
  jobId: string;
  records: ParsedLogRecord[];
  parseErrors: number;
}

export interface ParseCompleteResult {
  jobId: string;
  fileName: string;
  fileSize: number;
  totalRecords: number;
  totalParseErrors: number;
  elapsedMs: number;
}

@Injectable({ providedIn: 'root' })
export class OtlpLogParserService implements OnDestroy {
  private worker: Worker | null = null;
  private jobCounter = 0;

  /** Emits as chunks of records arrive from the worker */
  readonly chunk$ = new Subject<ParseChunkResult>();
  /** Emits progress updates for the active parse job */
  readonly progress$ = new Subject<ParseProgress>();
  /** Emits when a parse job is fully complete */
  readonly complete$ = new Subject<ParseCompleteResult>();
  /** Emits on worker-level errors */
  readonly error$ = new Subject<{ jobId: string; error: string }>();

  /**
   * Parse a File object. Reads the file as text, then sends to worker.
   * Returns the jobId for tracking/cancellation.
   */
  parseFile(file: File): string {
    const jobId = this.generateJobId();
    const reader = new FileReader();

    reader.onload = () => {
      const content = reader.result as string;
      this.sendToWorker({
        type: 'parse',
        jobId,
        fileName: file.name,
        content,
        chunkSize: 500,
      });
    };

    reader.onerror = () => {
      this.error$.next({ jobId, error: `Failed to read file: ${file.name}` });
    };

    reader.readAsText(file);
    return jobId;
  }

  /**
   * Parse raw text content directly.
   * Returns the jobId for tracking/cancellation.
   */
  parseText(text: string, fileName = 'pasted-text'): string {
    const jobId = this.generateJobId();
    this.sendToWorker({
      type: 'parse',
      jobId,
      fileName,
      content: text,
      chunkSize: 500,
    });
    return jobId;
  }

  cancelJob(jobId: string): void {
    this.getWorker().postMessage({
      type: 'cancel',
      jobId,
    } satisfies WorkerRequest);
  }

  ngOnDestroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.chunk$.complete();
    this.progress$.complete();
    this.complete$.complete();
    this.error$.complete();
  }

  private sendToWorker(request: WorkerRequest): void {
    this.getWorker().postMessage(request);
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../../log-parse.worker', import.meta.url),
        { type: 'module' }
      );
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };
      this.worker.onerror = (event) => {
        this.error$.next({ jobId: '', error: event.message });
      };
    }
    return this.worker;
  }

  private handleWorkerMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case 'chunk':
        this.chunk$.next({
          jobId: msg.jobId,
          records: msg.records,
          parseErrors: msg.parseErrors,
        });
        break;
      case 'progress':
        this.progress$.next({
          jobId: msg.jobId,
          fileName: '',
          percent: msg.percent,
          totalLines: msg.totalLines,
          processedLines: msg.processedLines,
        });
        break;
      case 'complete':
        this.complete$.next({
          jobId: msg.jobId,
          fileName: '',
          fileSize: 0,
          totalRecords: msg.totalRecords,
          totalParseErrors: msg.totalParseErrors,
          elapsedMs: msg.elapsedMs,
        });
        break;
      case 'error':
        this.error$.next({ jobId: msg.jobId, error: msg.error });
        break;
    }
  }

  private generateJobId(): string {
    return `job-${++this.jobCounter}-${Date.now().toString(36)}`;
  }
}
