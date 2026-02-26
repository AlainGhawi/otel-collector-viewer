import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { LogViewerStateService } from '../../../../core/services/log-viewer-state.service';

@Component({
  selector: 'app-log-filters',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './log-filters.component.html',
  styleUrl: './log-filters.component.scss',
})
export class LogFiltersComponent implements OnInit, OnDestroy {
  readonly state = inject(LogViewerStateService);

  readonly searchText = signal('');
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

  get activeFilterCount(): number {
    const f = this.state.filters();
    let count = 0;
    if (f.searchText) count++;
    if (f.timeRange.start || f.timeRange.end) count++;
    if (f.severities.length > 0) count++;
    if (f.services.length > 0) count++;
    if (f.httpStatusCategories.length > 0) count++;
    if (f.httpMethods.length > 0) count++;
    if (f.httpPath) count++;
    return count;
  }

  clearAllFilters(): void {
    this.searchText.set('');
    this.timeStart.set('');
    this.timeEnd.set('');
    this.state.resetFilters();
  }
}
