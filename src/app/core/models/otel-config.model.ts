/**
 * Core data models representing an OpenTelemetry Collector configuration.
 *
 * These models serve as the internal representation that bridges
 * YAML parsing and d3.js graph visualization.
 */

// ─── Component Types ────────────────────────────────────────────

export type ComponentType = 'receiver' | 'processor' | 'exporter' | 'connector' | 'extension';

export type SignalType = 'traces' | 'metrics' | 'logs';

// ─── Component Models ───────────────────────────────────────────

/**
 * Represents a single OTel Collector component (receiver, processor, exporter, etc.)
 * with its raw YAML configuration preserved.
 */
export interface OtelComponent {
  /** Unique identifier (e.g., 'otlp', 'otlp/grpc', 'batch', 'debug') */
  id: string;
  /** The base type of the component (e.g., 'otlp' from 'otlp/grpc') */
  type: string;
  /** Optional name qualifier (e.g., 'grpc' from 'otlp/grpc') */
  name?: string;
  /** Which section this component belongs to */
  componentType: ComponentType;
  /** Raw YAML config for this component, preserved for round-trip fidelity */
  config: Record<string, unknown>;
  active?: boolean;
}

// ─── Pipeline Models ────────────────────────────────────────────

/**
 * Represents a single pipeline definition within the service section.
 * Example: service.pipelines.traces/backend
 */
export interface OtelPipeline {
  /** Unique identifier (e.g., 'traces', 'traces/backend', 'metrics/prometheus') */
  id: string;
  /** The signal type this pipeline handles */
  signal: SignalType;
  /** Optional name qualifier (e.g., 'backend' from 'traces/backend') */
  name?: string;
  /** List of receiver component IDs */
  receivers: string[];
  /** List of processor component IDs (order matters!) */
  processors: string[];
  /** List of exporter component IDs */
  exporters: string[];
}

// ─── Service Models ─────────────────────────────────────────────

export interface OtelServiceTelemetry {
  logs?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  traces?: Record<string, unknown>;
}

export interface OtelService {
  extensions?: string[];
  pipelines: OtelPipeline[];
  telemetry?: OtelServiceTelemetry;
}

// ─── Top-Level Config ───────────────────────────────────────────

/**
 * Complete representation of an OTel Collector configuration file.
 */
export interface OtelConfig {
  receivers: OtelComponent[];
  processors: OtelComponent[];
  exporters: OtelComponent[];
  connectors: OtelComponent[];
  extensions: OtelComponent[];
  service: OtelService;
}

// ─── Graph Models (for d3.js) ───────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  active?: boolean;
  componentType: ComponentType;
  component: OtelComponent;

  /** Position for d3 layout */
  x?: number;
  y?: number;

  /** Fixed position flag for drag */
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  pipelineId: string;
  signal: SignalType;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Defaults ───────────────────────────────────────────────────

export function createEmptyConfig(): OtelConfig {
  return {
    receivers: [],
    processors: [],
    exporters: [],
    connectors: [],
    extensions: [],
    service: {
      pipelines: [],
    },
  };
}

// ─── Utilities ──────────────────────────────────────────────────

/**
 * Parse a component ID like 'otlp/grpc' into type and name parts.
 */
export function parseComponentId(id: string): { type: string; name?: string } {
  const slashIndex = id.indexOf('/');
  if (slashIndex === -1) {
    return { type: id };
  }
  return {
    type: id.substring(0, slashIndex),
    name: id.substring(slashIndex + 1),
  };
}

/**
 * Parse a pipeline ID like 'traces/backend' into signal and name parts.
 */
export function parsePipelineId(id: string): { signal: SignalType; name?: string } {
  const slashIndex = id.indexOf('/');
  if (slashIndex === -1) {
    return { signal: id as SignalType };
  }
  return {
    signal: id.substring(0, slashIndex) as SignalType,
    name: id.substring(slashIndex + 1),
  };
}

/**
 * Get a display-friendly color for each component type.
 */
export function getComponentColor(type: ComponentType): string {
  const colors: Record<ComponentType, string> = {
    receiver: '#4CAF50',   // Green
    processor: '#FF9800',  // Orange
    exporter: '#2196F3',   // Blue
    connector: '#9C27B0',  // Purple
    extension: '#78909C',  // Gray
  };
  return colors[type];
}

/**
 * Get a display-friendly color for each signal type.
 */
export function getSignalColor(signal: SignalType): string {
  const colors: Record<SignalType, string> = {
    traces: '#E91E63',   // Pink
    metrics: '#00BCD4',  // Cyan
    logs: '#8BC34A',     // Light Green
  };
  return colors[signal];
}
