import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { LogViewerStateService } from '../../../../core/services/log-viewer-state.service';
import {
  ParsedLogRecord,
  ALL_SEVERITY_LEVELS,
  SeverityLevel,
  HttpStatusCategory,
} from '../../../../core/models/otlp-log.model';
import { httpStatusToCategory } from '../../../../core/utils/otlp-log-helpers';
import {
  formatTimestampLocal,
  formatTimestampUTC,
} from '../../../../core/utils/otlp-log-helpers';
import { LogDetailComponent } from '../log-detail/log-detail.component';

interface ColumnDef {
  key: string;
  label: string;
  visible: boolean;
  filterable: boolean;
  width: number;
  minWidth: number;
  flex: boolean;
}

@Component({
  selector: 'app-log-table',
  standalone: true,
  imports: [ScrollingModule, LogDetailComponent],
  templateUrl: './log-table.component.html',
  styleUrl: './log-table.component.scss',
})
export class LogTableComponent implements OnDestroy {
  readonly state = inject(LogViewerStateService);

  readonly useUTC = signal(false);
  readonly expandedRowId = signal<string | null>(null);
  readonly showColumnMenu = signal(false);
  readonly openFilterColumn = signal<string | null>(null);

  readonly columns = signal<ColumnDef[]>([
    { key: 'timestamp', label: 'Timestamp', visible: true, filterable: false, width: 180, minWidth: 100, flex: false },
    { key: 'severity', label: 'Severity', visible: true, filterable: true, width: 70, minWidth: 50, flex: false },
    { key: 'service', label: 'Service', visible: true, filterable: true, width: 120, minWidth: 60, flex: false },
    { key: 'message', label: 'Message', visible: true, filterable: false, width: 200, minWidth: 120, flex: true },
    { key: 'httpMethod', label: 'Method', visible: true, filterable: true, width: 60, minWidth: 40, flex: false },
    { key: 'httpPath', label: 'Path', visible: true, filterable: true, width: 180, minWidth: 80, flex: false },
    { key: 'httpStatus', label: 'Status', visible: true, filterable: true, width: 50, minWidth: 40, flex: false },
  ]);

  // ─── Column filter computed values ──────────────────────────────

  readonly availableSeverities = computed<SeverityLevel[]>(() => {
    const records = this.state.allRecords();
    const found = new Set<SeverityLevel>();
    for (const r of records) found.add(r.severityText);
    return ALL_SEVERITY_LEVELS.filter((s) => found.has(s));
  });

  readonly availableServices = computed(() => this.state.availableServices());

  readonly availableMethods = computed<string[]>(() => {
    const methods = new Set<string>();
    for (const r of this.state.allRecords()) {
      if (r.httpMethod) methods.add(r.httpMethod);
    }
    return [...methods].sort();
  });

  readonly availableStatusCategories: HttpStatusCategory[] = ['2xx', '3xx', '4xx', '5xx'];

  // ─── Resize state ──────────────────────────────────────────────

  private resizing: {
    columnKey: string;
    startX: number;
    startWidth: number;
  } | null = null;

  private readonly boundOnResizeMove = this.onResizeMove.bind(this);
  private readonly boundOnResizeEnd = this.onResizeEnd.bind(this);

  // ─── Getters ──────────────────────────────────────────────────

  get visibleColumns(): ColumnDef[] {
    return this.columns().filter((c) => c.visible);
  }

  // ─── Record helpers ───────────────────────────────────────────

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

  // ─── Sort ─────────────────────────────────────────────────────

  toggleSort(): void {
    this.state.toggleSortDirection();
  }

  // ─── Column filters ───────────────────────────────────────────

  toggleFilterDropdown(columnKey: string, event: Event): void {
    event.stopPropagation();
    this.openFilterColumn.update((current) =>
      current === columnKey ? null : columnKey
    );
  }

  closeFilterDropdown(): void {
    this.openFilterColumn.set(null);
  }

  hasActiveFilter(columnKey: string): boolean {
    const f = this.state.filters();
    switch (columnKey) {
      case 'severity': return f.severities.length > 0;
      case 'service': return f.services.length > 0;
      case 'httpMethod': return f.httpMethods.length > 0;
      case 'httpPath': return !!f.httpPath;
      case 'httpStatus': return f.httpStatusCategories.length > 0;
      default: return false;
    }
  }

  isFilterValueActive(columnKey: string, value: string): boolean {
    const f = this.state.filters();
    switch (columnKey) {
      case 'severity': return f.severities.includes(value as SeverityLevel);
      case 'service': return f.services.includes(value);
      case 'httpMethod': return f.httpMethods.includes(value);
      case 'httpStatus': return f.httpStatusCategories.includes(value as HttpStatusCategory);
      default: return false;
    }
  }

  toggleColumnFilter(columnKey: string, value: string): void {
    const f = this.state.filters();
    switch (columnKey) {
      case 'severity': {
        const sev = value as SeverityLevel;
        const current = f.severities;
        this.state.updateFilters({
          severities: current.includes(sev)
            ? current.filter((s) => s !== sev)
            : [...current, sev],
        });
        break;
      }
      case 'service': {
        const current = f.services;
        this.state.updateFilters({
          services: current.includes(value)
            ? current.filter((s) => s !== value)
            : [...current, value],
        });
        break;
      }
      case 'httpMethod': {
        const current = f.httpMethods;
        this.state.updateFilters({
          httpMethods: current.includes(value)
            ? current.filter((m) => m !== value)
            : [...current, value],
        });
        break;
      }
      case 'httpStatus': {
        const cat = value as HttpStatusCategory;
        const current = f.httpStatusCategories;
        this.state.updateFilters({
          httpStatusCategories: current.includes(cat)
            ? current.filter((c) => c !== cat)
            : [...current, cat],
        });
        break;
      }
    }
  }

  onPathFilterInput(value: string): void {
    this.state.updateFilters({ httpPath: value });
  }

  getPathFilterValue(): string {
    return this.state.filters().httpPath;
  }

  // ─── Column resize ───────────────────────────────────────────

  onResizeStart(event: MouseEvent, columnKey: string): void {
    event.preventDefault();
    event.stopPropagation();
    const col = this.columns().find((c) => c.key === columnKey);
    if (!col) return;

    let startWidth = col.width;

    // If the column is flex, read its actual rendered width and convert to fixed
    if (col.flex) {
      const headerCell = (event.target as HTMLElement).parentElement;
      if (headerCell) {
        startWidth = headerCell.getBoundingClientRect().width;
      }
      this.columns.update((cols) =>
        cols.map((c) =>
          c.key === columnKey ? { ...c, flex: false, width: startWidth } : c
        )
      );
    }

    this.resizing = { columnKey, startX: event.clientX, startWidth };
    document.addEventListener('mousemove', this.boundOnResizeMove);
    document.addEventListener('mouseup', this.boundOnResizeEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private onResizeMove(event: MouseEvent): void {
    if (!this.resizing) return;
    const delta = event.clientX - this.resizing.startX;
    const col = this.columns().find((c) => c.key === this.resizing!.columnKey);
    if (!col) return;
    const newWidth = Math.max(col.minWidth, this.resizing.startWidth + delta);
    this.columns.update((cols) =>
      cols.map((c) =>
        c.key === this.resizing!.columnKey ? { ...c, width: newWidth } : c
      )
    );
  }

  private onResizeEnd(): void {
    this.resizing = null;
    document.removeEventListener('mousemove', this.boundOnResizeMove);
    document.removeEventListener('mouseup', this.boundOnResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.boundOnResizeMove);
    document.removeEventListener('mouseup', this.boundOnResizeEnd);
  }
}
