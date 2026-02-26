import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { LogViewerStateService } from '../../../../core/services/log-viewer-state.service';
import {
  ALL_SEVERITY_LEVELS,
  SeverityLevel,
  HttpStatusCategory,
} from '../../../../core/models/otlp-log.model';

@Component({
  selector: 'app-log-filters',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './log-filters.component.html',
  styleUrl: './log-filters.component.scss',
})
export class LogFiltersComponent implements OnInit, OnDestroy {
  readonly state = inject(LogViewerStateService);
  readonly severityLevels = ALL_SEVERITY_LEVELS;
  readonly httpCategories: HttpStatusCategory[] = ['2xx', '3xx', '4xx', '5xx'];

  readonly searchText = signal('');
  readonly traceIdInput = signal('');
  readonly timeStart = signal('');
  readonly timeEnd = signal('');

  private readonly search$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.search$
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe((text) => {
        this.state.updateFilters({ searchText: text });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInput(value: string): void {
    this.searchText.set(value);
    this.search$.next(value);
  }

  toggleSeverity(level: SeverityLevel): void {
    const current = this.state.filters().severities;
    const updated = current.includes(level)
      ? current.filter((s) => s !== level)
      : [...current, level];
    this.state.updateFilters({ severities: updated });
  }

  isSeverityActive(level: SeverityLevel): boolean {
    const severities = this.state.filters().severities;
    return severities.length === 0 || severities.includes(level);
  }

  toggleHttpCategory(cat: HttpStatusCategory): void {
    const current = this.state.filters().httpStatusCategories;
    const updated = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat];
    this.state.updateFilters({ httpStatusCategories: updated });
  }

  isHttpCategoryActive(cat: HttpStatusCategory): boolean {
    const cats = this.state.filters().httpStatusCategories;
    return cats.length === 0 || cats.includes(cat);
  }

  onServiceChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    this.state.updateFilters({
      services: value ? [value] : [],
    });
  }

  onTimeStartChange(value: string): void {
    this.timeStart.set(value);
    this.state.updateFilters({
      timeRange: {
        ...this.state.filters().timeRange,
        start: value ? new Date(value) : null,
      },
    });
  }

  onTimeEndChange(value: string): void {
    this.timeEnd.set(value);
    this.state.updateFilters({
      timeRange: {
        ...this.state.filters().timeRange,
        end: value ? new Date(value) : null,
      },
    });
  }

  onTraceIdChange(value: string): void {
    this.traceIdInput.set(value);
    this.state.updateFilters({ traceId: value });
  }

  setTraceIdFilter(traceId: string): void {
    this.traceIdInput.set(traceId);
    this.state.updateFilters({ traceId });
  }

  get activeFilterCount(): number {
    const f = this.state.filters();
    let count = 0;
    if (f.severities.length > 0) count++;
    if (f.searchText) count++;
    if (f.timeRange.start || f.timeRange.end) count++;
    if (f.services.length > 0) count++;
    if (f.httpStatusCategories.length > 0) count++;
    if (f.traceId) count++;
    return count;
  }

  clearAllFilters(): void {
    this.searchText.set('');
    this.traceIdInput.set('');
    this.timeStart.set('');
    this.timeEnd.set('');
    this.state.resetFilters();
  }
}
