import { Component, inject, input } from '@angular/core';
import { ParsedLogRecord } from '../../../../core/models/otlp-log.model';
import { LogViewerStateService } from '../../../../core/services/log-viewer-state.service';

@Component({
  selector: 'app-log-detail',
  standalone: true,
  templateUrl: './log-detail.component.html',
  styleUrl: './log-detail.component.scss',
})
export class LogDetailComponent {
  readonly record = input.required<ParsedLogRecord>();

  private readonly state = inject(LogViewerStateService);

  get resourceAttrEntries(): [string, unknown][] {
    return Object.entries(this.record().resourceAttributes);
  }

  get logAttrEntries(): [string, unknown][] {
    return Object.entries(this.record().logAttributes);
  }

  get bodyAttrEntries(): [string, unknown][] {
    return this.record().bodyAttrs
      ? Object.entries(this.record().bodyAttrs!)
      : [];
  }

  get bodyParsedJson(): string {
    const r = this.record();
    const parsed: Record<string, unknown> = {};
    if (r.bodyTimestamp) parsed['timestamp'] = r.bodyTimestamp;
    if (r.bodyLevel) parsed['level'] = r.bodyLevel;
    if (r.message) parsed['message'] = r.message;
    if (r.httpMethod || r.httpPath || r.httpStatusCode) {
      parsed['http'] = {
        method: r.httpMethod,
        path: r.httpPath,
        status: r.httpStatusCode,
      };
    }
    if (r.userId || r.userSessionId || r.userIp) {
      parsed['user'] = {
        id: r.userId,
        session_id: r.userSessionId,
        ip: r.userIp,
      };
    }
    if (r.traceId || r.spanId) {
      parsed['trace'] = {
        trace_id: r.traceId,
        span_id: r.spanId,
      };
    }
    if (r.serviceVersion) parsed['service'] = { version: r.serviceVersion };
    if (r.tags?.length) parsed['tags'] = r.tags;
    if (r.bodyAttrs && Object.keys(r.bodyAttrs).length > 0) {
      parsed['attrs'] = r.bodyAttrs;
    }
    return JSON.stringify(parsed, null, 2);
  }

  filterByTraceId(traceId: string): void {
    this.state.updateFilters({ traceId });
  }

  filterByService(service: string): void {
    this.state.updateFilters({ services: [service] });
  }

  async copyRawBody(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.record().rawBody);
    } catch {
      // silent
    }
  }

  async copyFullRecord(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(this.record(), null, 2)
      );
    } catch {
      // silent
    }
  }
}
