import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { LogViewerStateService } from '../../../../core/services/log-viewer-state.service';
import { ALL_SEVERITY_LEVELS, SeverityLevel } from '../../../../core/models/otlp-log.model';
import { formatTimestampLocal } from '../../../../core/utils/otlp-log-helpers';

@Component({
  selector: 'app-log-summary',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './log-summary.component.html',
  styleUrl: './log-summary.component.scss',
})
export class LogSummaryComponent {
  readonly state = inject(LogViewerStateService);
  readonly severityLevels = ALL_SEVERITY_LEVELS;
  readonly formatTimestamp = formatTimestampLocal;

  severityClass(level: SeverityLevel): string {
    return `severity-${level.toLowerCase()}`;
  }
}
