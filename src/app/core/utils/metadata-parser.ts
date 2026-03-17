import * as yaml from 'js-yaml';
import { ComponentType, SignalType } from '../models/otel-config.model';
import { ParsedMetadata } from '../models/component-registry.model';

const VALID_SIGNALS = new Set<string>(['traces', 'metrics', 'logs']);

const COMPONENT_TYPE_SUFFIXES: Record<ComponentType, string> = {
  receiver: 'receiver',
  processor: 'processor',
  exporter: 'exporter',
  connector: 'connector',
  extension: 'extension',
};

/**
 * Strip the component type suffix from a directory name.
 * e.g., "prometheusreceiver" + "receiver" → "prometheus"
 *       "batchprocessor" + "processor" → "batch"
 */
export function stripComponentSuffix(dirName: string, componentType: ComponentType): string {
  const suffix = COMPONENT_TYPE_SUFFIXES[componentType];
  if (dirName.endsWith(suffix)) {
    return dirName.slice(0, -suffix.length);
  }
  return dirName;
}

/**
 * Convert a snake_case or lowercase string to Title Case.
 * e.g., "prometheus" → "Prometheus", "health_check" → "Health Check"
 */
export function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Parse signal types from the status.stability section of metadata.yaml.
 * Handles both simple signals ("traces", "metrics", "logs") and
 * connector compound signals ("traces_to_metrics").
 */
export function parseSignalsFromStability(
  stability: Record<string, string[]> | undefined,
): SignalType[] {
  if (!stability) return [];

  const signals = new Set<SignalType>();

  for (const entries of Object.values(stability)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (VALID_SIGNALS.has(entry)) {
        signals.add(entry as SignalType);
      } else if (entry.includes('_to_')) {
        // Connector format: "traces_to_metrics"
        const parts = entry.split('_to_');
        for (const part of parts) {
          if (VALID_SIGNALS.has(part)) {
            signals.add(part as SignalType);
          }
        }
      }
    }
  }

  return [...signals];
}

/**
 * Map the `status.class` field from metadata.yaml to our ComponentType.
 */
function mapStatusClass(statusClass: string): ComponentType | null {
  const mapping: Record<string, ComponentType> = {
    receiver: 'receiver',
    processor: 'processor',
    exporter: 'exporter',
    connector: 'connector',
    extension: 'extension',
  };
  return mapping[statusClass] ?? null;
}

/**
 * Parse a metadata.yaml string into a structured ParsedMetadata object.
 */
export function parseMetadataYaml(
  yamlStr: string,
  fallbackComponentType: ComponentType,
): ParsedMetadata | null {
  try {
    const doc = yaml.load(yamlStr) as Record<string, unknown>;
    if (!doc || typeof doc !== 'object') return null;

    const status = doc['status'] as Record<string, unknown> | undefined;
    const stability = status?.['stability'] as Record<string, string[]> | undefined;
    const statusClass = status?.['class'] as string | undefined;

    return {
      type: (doc['type'] as string) ?? '',
      displayName: (doc['display_name'] as string) ?? '',
      description: ((doc['description'] as string) ?? '').trim(),
      componentType: (statusClass ? mapStatusClass(statusClass) : null) ?? fallbackComponentType,
      supportedSignals: parseSignalsFromStability(stability),
    };
  } catch {
    return null;
  }
}
