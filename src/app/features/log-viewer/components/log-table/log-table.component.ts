import { Component, inject, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { LogViewerStateService } from '../../../../core/services/log-viewer-state.service';
import { ParsedLogRecord } from '../../../../core/models/otlp-log.model';
import {
  formatTimestampLocal,
  formatTimestampUTC,
} from '../../../../core/utils/otlp-log-helpers';
import { LogDetailComponent } from '../log-detail/log-detail.component';

interface ColumnDef {
  key: string;
  label: string;
  visible: boolean;
}

@Component({
  selector: 'app-log-table',
  standalone: true,
  imports: [ScrollingModule, LogDetailComponent],
  templateUrl: './log-table.component.html',
  styleUrl: './log-table.component.scss',
})
export class LogTableComponent {
  readonly state = inject(LogViewerStateService);

  readonly useUTC = signal(false);
  readonly expandedRowId = signal<string | null>(null);
  readonly showColumnMenu = signal(false);

  readonly columns = signal<ColumnDef[]>([
    { key: 'timestamp', label: 'Timestamp', visible: true },
    { key: 'severity', label: 'Severity', visible: true },
    { key: 'service', label: 'Service', visible: true },
    { key: 'message', label: 'Message', visible: true },
    { key: 'httpMethod', label: 'Method', visible: true },
    { key: 'httpPath', label: 'Path', visible: true },
    { key: 'httpStatus', label: 'Status', visible: true },
    { key: 'traceId', label: 'Trace ID', visible: true },
  ]);

  get visibleColumns(): ColumnDef[] {
    return this.columns().filter((c) => c.visible);
  }

  trackByRecord(_index: number, record: ParsedLogRecord): string {
    return record.id;
  }

  formatTimestamp(date: Date): string {
    return this.useUTC() ? formatTimestampUTC(date) : formatTimestampLocal(date);
  }

  toggleTimezone(): void {
    this.useUTC.update((v) => !v);
  }

  toggleRow(record: ParsedLogRecord): void {
    this.expandedRowId.update((current) =>
      current === record.id ? null : record.id
    );
  }

  isExpanded(record: ParsedLogRecord): boolean {
    return this.expandedRowId() === record.id;
  }

  toggleColumn(key: string): void {
    this.columns.update((cols) =>
      cols.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
  }

  toggleColumnMenu(): void {
    this.showColumnMenu.update((v) => !v);
  }

  severityClass(record: ParsedLogRecord): string {
    return `severity-${record.severityText.toLowerCase()}`;
  }

  getServiceDisplay(record: ParsedLogRecord): string {
    return record.serviceName ?? record.workloadName ?? '';
  }

  async copyRecord(record: ParsedLogRecord, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    } catch {
      // Clipboard access denied — silent fail
    }
  }

  statusClass(code: number): string {
    return `status-${Math.floor(code / 100)}xx`;
  }

  onTraceClick(traceId: string, event: Event): void {
    event.stopPropagation();
    this.state.updateFilters({ traceId });
  }
}
