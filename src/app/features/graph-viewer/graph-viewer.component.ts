import {
  Component,
  ElementRef,
  AfterViewInit,
  DestroyRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import * as d3 from 'd3';
import { ConfigStateService } from '../../core/services/config-state.service';
import {
  GraphNode,
  GraphEdge,
  GraphData,
  ComponentType,
  getComponentColor,
} from '../../core/models';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 52;
const COLUMN_GAP = 260;   // horizontal space between receiver → processor → exporter
const ROW_GAP = 80;       // vertical space between nodes in the same column
const PADDING_X = 80;
const PADDING_Y = 80;

const PIPELINE_COLORS = [
  '#f472b6', // pink
  '#38bdf8', // cyan
  '#4ade80', // green
  '#fb923c', // orange
  '#a78bfa', // purple
  '#facc15', // yellow
  '#f87171', // red
  '#2dd4bf', // teal
];

const COLUMN_ORDER: ComponentType[] = ['extension', 'receiver', 'processor', 'exporter', 'connector'];

interface PositionedNode extends GraphNode {
  px: number;
  py: number;
}

@Component({
  selector: 'app-graph-viewer',
  standalone: true,
  templateUrl: './graph-viewer.component.html',
  styleUrl: './graph-viewer.component.css',
})
export class GraphViewerComponent implements AfterViewInit {
  readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('graphSvg');
  readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>('graphContainer');

  private readonly state = inject(ConfigStateService);
  private readonly destroyRef = inject(DestroyRef);
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private rootGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private resizeObserver: ResizeObserver | null = null;

  private currentNodes: PositionedNode[] = [];
  private currentEdges: GraphEdge[] = [];
  private edgeGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private pipelineColorMap = new Map<string, string>();

  constructor() {
    effect(() => {
      const graphData = this.state.graphData();
      if (this.svg) {
        this.renderGraph(graphData);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
      d3.select('body').on('keydown.graph', null);
    });
  }

  ngAfterViewInit(): void {
    this.initializeSvg();
    this.setupResizeObserver();
  }

  private initializeSvg(): void {
    this.svg = d3.select(this.svgRef().nativeElement);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        this.rootGroup.attr('transform', event.transform);
      });

    this.svg.call(zoom);

    // Click background to deselect
    this.svg.on('click', () => {
      this.state.clearSelection();
    });

    this.rootGroup = this.svg.append('g').attr('class', 'root');

    // This way traces edges get pink arrows, metrics get cyan, logs get green.

    // Keyboard shortcut to delete selected node
    d3.select('body').on('keydown.graph', (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const tag = (event.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement).closest('.cm-editor')) {
          return;
        }

        const selected = this.state.selectedNode();
        if (selected) {
          event.preventDefault();
          this.state.removeComponent(selected.component);
        }
      }
    });
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      const graphData = this.state.graphData();
      if (graphData.nodes.length > 0) {
        this.renderGraph(graphData);
      }
    });
    this.resizeObserver.observe(this.containerRef().nativeElement);
  }

  private renderGraph(data: GraphData): void {
    this.rootGroup.selectAll('*').remove();

    if (data.nodes.length === 0) {
      this.renderEmptyState();
      return;
    }

    this.currentNodes = this.layoutNodes(data.nodes);
    this.currentEdges = data.edges;
    this.buildPipelineColors(data.edges);

    const nodeMap = new Map(this.currentNodes.map(n => [n.id, n]));

    this.renderColumnHeaders(this.currentNodes);
    this.edgeGroup = this.rootGroup.append('g').attr('class', 'edges');
    this.redrawEdges(nodeMap);
    this.renderNodes(this.currentNodes);
    this.fitToView(this.currentNodes);
  }

  private layoutNodes(nodes: GraphNode[]): PositionedNode[] {
    const columns = new Map<ComponentType, GraphNode[]>();
    for (const type of COLUMN_ORDER) {
      columns.set(type, []);
    }
    for (const node of nodes) {
      const col = columns.get(node.componentType);
      if (col) col.push(node);
    }

    // Only include columns that have nodes (no empty gaps)
    const activeColumns = COLUMN_ORDER.filter(type => {
      const col = columns.get(type);
      return col && col.length > 0;
    });

    // Find tallest column for vertical centering
    let maxColumnHeight = 0;
    for (const type of activeColumns) {
      const colNodes = columns.get(type)!;
      const height = colNodes.length * (NODE_HEIGHT + ROW_GAP) - ROW_GAP;
      maxColumnHeight = Math.max(maxColumnHeight, height);
    }

    const positioned: PositionedNode[] = [];

    for (let colIndex = 0; colIndex < activeColumns.length; colIndex++) {
      const type = activeColumns[colIndex];
      const colNodes = columns.get(type)!;
      const colHeight = colNodes.length * (NODE_HEIGHT + ROW_GAP) - ROW_GAP;
      const offsetY = (maxColumnHeight - colHeight) / 2;

      for (let rowIndex = 0; rowIndex < colNodes.length; rowIndex++) {
        positioned.push({
          ...colNodes[rowIndex],
          px: PADDING_X + colIndex * COLUMN_GAP,
          py: PADDING_Y + offsetY + rowIndex * (NODE_HEIGHT + ROW_GAP),
        });
      }
    }

    return positioned;
  }

  private renderColumnHeaders(nodes: PositionedNode[]): void {
    const headerGroup = this.rootGroup.append('g').attr('class', 'column-headers');

    // Deduplicate: one header per column that has nodes
    const seen = new Set<ComponentType>();

    for (const node of nodes) {
      if (seen.has(node.componentType)) continue;
      seen.add(node.componentType);

      const nodesInCol = nodes.filter(n => n.componentType === node.componentType);
      const x = nodesInCol[0].px + NODE_WIDTH / 2;

      headerGroup.append('text')
        .attr('x', x)
        .attr('y', PADDING_Y - 30)
        .attr('text-anchor', 'middle')
        .attr('fill', getComponentColor(node.componentType))
        .attr('font-size', '12px')
        .attr('font-weight', '700')
        .attr('letter-spacing', '1.5px')
        .text(node.componentType.toUpperCase() + 'S');
    }
  }

  /**
   * Draws (or redraws) all edges. Called on initial render and during drag.
   */
  private redrawEdges(nodeMap: Map<string, PositionedNode>): void {
    this.edgeGroup.selectAll('*').remove();

    for (const edge of this.currentEdges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);

      if (!source || !target) {
        console.warn(`Edge skipped: ${edge.source} → ${edge.target} (node not found)`);
        continue;
      }

      let path: string;

      if (Math.abs(source.px - target.px) < 10) {
        // Same column — arc out to the left so it doesn't cross horizontal edges
        const x1 = source.px;
        const y1 = source.py + NODE_HEIGHT;
        const x2 = target.px;
        const y2 = target.py;

        const distance = Math.abs(y2 - y1);
        const arcOffset = Math.min(distance * 0.4, 60);

        path = `M ${x1} ${y1} C ${x1 - arcOffset} ${y1 + distance * 0.3}, ${x2 - arcOffset} ${y2 - distance * 0.3}, ${x2} ${y2}`;
      } else {
        // Different columns — horizontal bezier from right side to left side
        const x1 = source.px + NODE_WIDTH;
        const y1 = source.py + NODE_HEIGHT / 2;
        const x2 = target.px;
        const y2 = target.py + NODE_HEIGHT / 2;

        const midX = (x1 + x2) / 2;
        path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
      }

      this.edgeGroup.append('path')
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', this.pipelineColorMap.get(edge.pipelineId) ?? '#888')
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.45)
        .attr('marker-end', `url(#arrow-${edge.pipelineId.replace(/[^a-zA-Z0-9]/g, '-')})`);
    }
  }

  private renderNodes(nodes: PositionedNode[]): void {
    const nodeGroup = this.rootGroup.append('g').attr('class', 'nodes');

    const nodeSelection = nodeGroup
      .selectAll<SVGGElement, PositionedNode>('g')
      .data(nodes, (d: PositionedNode) => d.id)
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.px}, ${d.py})`)
      .style('cursor', 'grab')
      .call(this.createDragBehavior());  // ← drag support

    // Background rect
    nodeSelection.append('rect')
      .attr('width', NODE_WIDTH)
      .attr('height', NODE_HEIGHT)
      .attr('rx', 10)
      .attr('ry', 10)
      .attr('fill', d => getComponentColor(d.componentType))
      .attr('fill-opacity', 0.1)
      .attr('stroke', d => getComponentColor(d.componentType))
      .attr('stroke-width', 1.5);

    // Left accent bar
    nodeSelection.append('rect')
      .attr('width', 4)
      .attr('height', NODE_HEIGHT - 16)
      .attr('x', 8)
      .attr('y', 8)
      .attr('rx', 2)
      .attr('fill', d => getComponentColor(d.componentType))
      .attr('fill-opacity', 0.6);

    // Component type label
    nodeSelection.append('text')
      .attr('x', 20)
      .attr('y', 20)
      .attr('font-size', '9px')
      .attr('font-weight', '600')
      .attr('letter-spacing', '0.8px')
      .attr('fill', d => getComponentColor(d.componentType))
      .attr('fill-opacity', 0.8)
      .text(d => d.componentType.toUpperCase());

    // Component name
    nodeSelection.append('text')
      .attr('x', 20)
      .attr('y', 38)
      .attr('font-size', '13px')
      .attr('font-weight', '500')
      .attr('fill', 'var(--color-text-secondary)')
      .text(d => d.label);

    // Hover effects
    nodeSelection
      .on('mouseenter', function () {
        d3.select(this).select('rect').transition().duration(150)
          .attr('fill-opacity', 0.2)
          .attr('stroke-width', 2.5);
      })
      .on('mouseleave', function () {
        d3.select(this).select('rect').transition().duration(150)
          .attr('fill-opacity', 0.1)
          .attr('stroke-width', 1.5);
      });
  }

  /**
   * Drag behavior that updates node positions and redraws edges in real time.
   * No force simulation — just direct position updates.
   */
  private createDragBehavior(): d3.DragBehavior<SVGGElement, PositionedNode, PositionedNode | d3.SubjectPosition> {
    let dragStartX = 0;
    let dragStartY = 0;
    let hasDragged = false;

    return d3.drag<SVGGElement, PositionedNode>()
      .on('start', function (event) {
        dragStartX = event.x;
        dragStartY = event.y;
        hasDragged = false;
        d3.select(this).raise().style('cursor', 'grabbing');
      })
      .on('drag', (event, d) => {
        const dx = event.x - dragStartX;
        const dy = event.y - dragStartY;

        // Only start moving after a minimum threshold
        if (!hasDragged && Math.abs(dx) < 5 && Math.abs(dy) < 5) {
          return;
        }

        hasDragged = true;
        d.px = event.x;
        d.py = event.y;

        this.rootGroup.selectAll<SVGGElement, PositionedNode>('.node')
          .filter(n => n.id === d.id)
          .attr('transform', `translate(${d.px}, ${d.py})`);

        const nodeMap = new Map(this.currentNodes.map(n => [n.id, n]));
        this.redrawEdges(nodeMap);
      })
      .on('end', (event, d) => {
        // If mouse barely moved, treat as a click
        if (!hasDragged) {
          this.state.selectNode(d.component);
        }

        this.rootGroup.selectAll<SVGGElement, PositionedNode>('.node')
          .filter(n => n.id === d.id)
          .style('cursor', 'grab');
      });
  }

  private fitToView(nodes: PositionedNode[]): void {
    if (nodes.length === 0) return;

    const containerWidth = this.containerRef().nativeElement.clientWidth;
    const containerHeight = this.containerRef().nativeElement.clientHeight;

    const maxX = Math.max(...nodes.map(n => n.px + NODE_WIDTH));
    const maxY = Math.max(...nodes.map(n => n.py + NODE_HEIGHT));
    const contentWidth = maxX + PADDING_X;
    const contentHeight = maxY + PADDING_Y;

    const scale = Math.min(
      containerWidth / contentWidth,
      containerHeight / contentHeight,
      1.2
    );

    const translateX = (containerWidth - contentWidth * scale) / 2;
    const translateY = (containerHeight - contentHeight * scale) / 2;

    this.svg.call(
      d3.zoom<SVGSVGElement, unknown>().transform as any,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale)
    );
  }

  private renderEmptyState(): void {
    const width = this.containerRef().nativeElement.clientWidth;
    const height = this.containerRef().nativeElement.clientHeight;

    const g = this.rootGroup.append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--color-text-muted)')
      .attr('font-size', '20px')
      .attr('font-weight', '500')
      .text('Load an OTel Collector config to visualize');

    g.append('text')
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--color-empty-state)')
      .attr('font-size', '14px')
      .text('Use "Load Sample" or paste YAML in the panel →');
  }

  private buildPipelineColors(edges: GraphEdge[]): void {
    this.pipelineColorMap.clear();
    const pipelineIds = [...new Set(edges.map(e => e.pipelineId))];

    for (let i = 0; i < pipelineIds.length; i++) {
      this.pipelineColorMap.set(pipelineIds[i], PIPELINE_COLORS[i % PIPELINE_COLORS.length]);
    }

    // Create arrow markers per pipeline
    let defs = this.svg.select<SVGDefsElement>('defs');
    if (defs.empty()) {
      defs = this.svg.append('defs');
    }
    defs.selectAll('*').remove();

    for (const [pipelineId, color] of this.pipelineColorMap) {
      const safeId = pipelineId.replace(/[^a-zA-Z0-9]/g, '-');
      defs.append('marker')
        .attr('id', `arrow-${safeId}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 10)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .append('path')
        .attr('d', 'M 0,-4 L 10,0 L 0,4')
        .attr('fill', color);
    }
  }
}