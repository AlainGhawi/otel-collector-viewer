import { ComponentType, SignalType } from './otel-config.model';

/**
 * A catalog entry representing a known OTel Collector component type.
 * This is a template, not an instance — it describes what can be added.
 */
export interface ComponentDefinition {
  /** The base type identifier (e.g., 'otlp', 'batch', 'debug') */
  type: string;

  /** Human-readable display name (e.g., 'OTLP') */
  displayName: string;

  /** Short description of what this component does */
  description: string;

  /** Which section this belongs to */
  componentType: ComponentType;

  /** Signal types this component can handle (empty for extensions) */
  supportedSignals: SignalType[];

  /** Default/starter config template */
  defaultConfig: Record<string, unknown>;
}
