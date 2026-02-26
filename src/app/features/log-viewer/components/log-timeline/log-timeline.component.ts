import {
  Component,
  inject,
  viewChild,
  ElementRef,
  effect,
  DestroyRef,
  afterNextRender,
} from '@angular/core';
import * as d3 from 'd3';
import { LogViewerStateService } from '../../../../core/services/log-viewer-state.service';
import { ParsedLogRecord, SeverityLevel } from '../../../../core/models/otlp-log.model';

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  TRACE: '#9e9e9e',
  DEBUG: '#64b5f6',
  INFO: '#4caf50',
  WARN: '#ffc107',
  ERROR: '#ff5252',
  FATAL: '#d50000',
};

const SEVERITY_ORDER: SeverityLevel[] = [
  'TRACE',
  'DEBUG',
  'INFO',
  'WARN',
  'ERROR',
  'FATAL',
];

const MARGIN = { top: 4, right: 16, bottom: 20, left: 16 };
const HEIGHT = 80;

@Component({
  selector: 'app-log-timeline',
  standalone: true,
  template: `<div class="timeline-container" #container>
    <svg #timelineSvg></svg>
  </div>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        flex-shrink: 0;
      }
      .timeline-container {
        width: 100%;
        height: ${HEIGHT}px;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        overflow: hidden;
        background: var(--color-bg-secondary);
      }
      svg {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class LogTimelineComponent {
  private readonly state = inject(LogViewerStateService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('timelineSvg');
  private readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>('container');

  private resizeObserver: ResizeObserver | null = null;
  private brush: d3.BrushBehavior<unknown> | null = null;
  private isBrushing = false;

  constructor() {
    afterNextRender(() => {
      this.setupResizeObserver();
    });

    effect(() => {
      const records = this.state.allRecords();
      if (records.length > 0) {
        // Read width inside the effect so it triggers on resize too
        this.render(records);
      }
    });
  }

  private setupResizeObserver(): void {
    const container = this.containerRef().nativeElement;
    this.resizeObserver = new ResizeObserver(() => {
      const records = this.state.allRecords();
      if (records.length > 0) {
        this.render(records);
      }
    });
    this.resizeObserver.observe(container);
    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());
  }

  private render(records: ParsedLogRecord[]): void {
    const svg = d3.select(this.svgRef().nativeElement);
    svg.selectAll('*').remove();

    const container = this.containerRef().nativeElement;
    const width = container.clientWidth;
    if (width <= 0) return;

    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

    // Time scale
    const timeExtent = d3.extent(records, (r) => r.timestamp) as [Date, Date];
    if (!timeExtent[0] || !timeExtent[1]) return;

    const x = d3
      .scaleTime()
      .domain(timeExtent)
      .range([0, innerWidth]);

    // Bin records by time
    const binCount = Math.min(Math.max(Math.floor(innerWidth / 6), 20), 100);
    const thresholds = x.ticks(binCount);

    // Create bins per severity
    const binnedData: Array<{
      x0: Date;
      x1: Date;
      counts: Record<SeverityLevel, number>;
      total: number;
    }> = [];

    for (let i = 0; i < thresholds.length - 1; i++) {
      const x0 = thresholds[i];
      const x1 = thresholds[i + 1];
      const counts = Object.fromEntries(
        SEVERITY_ORDER.map((s) => [s, 0])
      ) as Record<SeverityLevel, number>;
      let total = 0;

      for (const r of records) {
        if (r.timestamp >= x0 && r.timestamp < x1) {
          counts[r.severityText]++;
          total++;
        }
      }

      binnedData.push({ x0, x1, counts, total });
    }

    const maxTotal = d3.max(binnedData, (d) => d.total) ?? 1;

    const y = d3
      .scaleLinear()
      .domain([0, maxTotal])
      .range([innerHeight, 0]);

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Draw stacked bars
    const barWidth = Math.max(1, innerWidth / binnedData.length - 1);

    for (const bin of binnedData) {
      let yOffset = innerHeight;
      for (const severity of SEVERITY_ORDER) {
        const count = bin.counts[severity];
        if (count === 0) continue;
        const barHeight = (count / maxTotal) * innerHeight;
        yOffset -= barHeight;

        g.append('rect')
          .attr('x', x(bin.x0))
          .attr('y', yOffset)
          .attr('width', Math.max(1, x(bin.x1) - x(bin.x0) - 1))
          .attr('height', barHeight)
          .attr('fill', SEVERITY_COLORS[severity])
          .attr('opacity', 0.8);
      }
    }

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(Math.floor(innerWidth / 100))
          .tickFormat((d) => {
            const date = d as Date;
            return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          })
      )
      .call((g) => g.select('.domain').attr('stroke', 'var(--color-border)'))
      .call((g) =>
        g
          .selectAll('.tick text')
          .attr('fill', 'var(--color-text-muted)')
          .attr('font-size', '10px')
      )
      .call((g) =>
        g.selectAll('.tick line').attr('stroke', 'var(--color-border)')
      );

    // Brush for time range selection
    this.brush = d3
      .brushX()
      .extent([
        [0, 0],
        [innerWidth, innerHeight],
      ])
      .on('end', (event: d3.D3BrushEvent<unknown>) => {
        if (!event.selection) {
          // Brush cleared
          this.state.updateFilters({
            timeRange: { start: null, end: null },
          });
          return;
        }
        const [x0, x1] = event.selection as [number, number];
        const start = x.invert(x0);
        const end = x.invert(x1);
        this.state.updateFilters({
          timeRange: { start, end },
        });
      });

    g.append('g').attr('class', 'brush').call(this.brush);

    // Style the brush selection
    svg
      .selectAll('.brush .selection')
      .attr('fill', 'var(--color-accent)')
      .attr('fill-opacity', 0.15)
      .attr('stroke', 'var(--color-accent)')
      .attr('stroke-opacity', 0.4);
  }
}
