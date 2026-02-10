import { Injectable } from '@angular/core';
import * as yaml from 'js-yaml';
import { parseDocument } from 'yaml';
import { OtelConfig, OtelComponent, OtelPipeline } from '../models';

@Injectable({
  providedIn: 'root',
})
export class ConfigSerializerService {
  /**
   * Serialize an OtelConfig model back to a YAML string.
   * Preserves component configs for round-trip fidelity.
   */
  serializeToYaml(config: OtelConfig): string {
    const raw: Record<string, unknown> = {};

    // Only include sections that have components
    if (config.receivers.length > 0) {
      raw['receivers'] = this.serializeComponents(config.receivers);
    }

    if (config.processors.length > 0) {
      raw['processors'] = this.serializeComponents(config.processors);
    }

    if (config.exporters.length > 0) {
      raw['exporters'] = this.serializeComponents(config.exporters);
    }

    if (config.connectors.length > 0) {
      raw['connectors'] = this.serializeComponents(config.connectors);
    }

    if (config.extensions.length > 0) {
      raw['extensions'] = this.serializeComponents(config.extensions);
    }

    // Service section
    raw['service'] = this.serializeService(config);

    return yaml.dump(raw, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
  }

  /**
   * Reformat YAML while preserving comments.
   * Uses the 'yaml' package which parses to a CST that retains comments.
   */
  reformatYaml(rawYaml: string): string {
    const doc = parseDocument(rawYaml);
    return doc.toString({ indent: 2, lineWidth: 120 });
  }

  private serializeComponents(components: OtelComponent[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const component of components) {
      // Use null for components with no config (YAML renders as just the key)
      result[component.id] =
        Object.keys(component.config).length > 0 ? component.config : null;
    }

    return result;
  }

  private serializeService(config: OtelConfig): Record<string, unknown> {
    const service: Record<string, unknown> = {};

    if (config.service.extensions && config.service.extensions.length > 0) {
      service['extensions'] = config.service.extensions;
    }

    if (config.service.pipelines.length > 0) {
      service['pipelines'] = this.serializePipelines(config.service.pipelines);
    }

    if (config.service.telemetry) {
      service['telemetry'] = config.service.telemetry;
    }

    return service;
  }

  private serializePipelines(pipelines: OtelPipeline[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const pipeline of pipelines) {
      const pipelineConfig: Record<string, string[]> = {
        receivers: pipeline.receivers,
      };

      if (pipeline.processors.length > 0) {
        pipelineConfig['processors'] = pipeline.processors;
      }

      pipelineConfig['exporters'] = pipeline.exporters;

      result[pipeline.id] = pipelineConfig;
    }

    return result;
  }
}
