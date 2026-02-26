import { Component, inject } from '@angular/core';
import { LogViewerStateService } from '../../core/services/log-viewer-state.service';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { LogSummaryComponent } from './components/log-summary/log-summary.component';
import { LogFiltersComponent } from './components/log-filters/log-filters.component';
import { LogTableComponent } from './components/log-table/log-table.component';
import { LogTimelineComponent } from './components/log-timeline/log-timeline.component';

@Component({
  selector: 'app-log-viewer',
  standalone: true,
  imports: [
    FileUploadComponent,
    LogSummaryComponent,
    LogFiltersComponent,
    LogTableComponent,
    LogTimelineComponent,
  ],
  templateUrl: './log-viewer.component.html',
  styleUrl: './log-viewer.component.scss',
})
export class LogViewerComponent {
  readonly state = inject(LogViewerStateService);
}
