import { Injectable } from '@angular/core';
import * as yaml from 'js-yaml';
import { isMap, isSeq, parseDocument } from 'yaml';
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

  reformatYaml(rawYaml: string): string {
    const doc = parseDocument(rawYaml);
    // Force flow style on service.extensions
    const service = doc.get('service', true);
    if (isMap(service)) {
      const ext = service.get('extensions', true);
      if (isSeq(ext)) ext.flow = true;

      const pipelines = service.get('pipelines', true);
      if (isMap(pipelines)) {
        for (const pair of pipelines.items) {
          const pipeline = pair.value;
          if (isMap(pipeline)) {
            for (const field of ['receivers', 'processors', 'exporters']) {
              const seq = pipeline.get(field, true);
              if (isSeq(seq)) seq.flow = true;
            }
          }
        }
      }
    }

    // Flow-style short scalar arrays elsewhere (e.g. targets)
    for (const section of ['receivers', 'processors', 'exporters', 'extensions']) {
      const node = doc.get(section, true);
      if (isMap(node)) this.flowShortArrays(node);
    }

    return doc.toString({ indent: 2, lineWidth: 120 });
  }

  private flowShortArrays(node: unknown): void {
    if (isMap(node)) {
      for (const pair of (node as any).items) {
        if (isSeq(pair.value) && pair.value.items.length <= 5 && pair.value.items.every((i: unknown) => !isMap(i) && !isSeq(i))) {
          pair.value.flow = true;
        } else {
          this.flowShortArrays(pair.value);
        }
      }
    } else if (isSeq(node)) {
      for (const item of (node as any).items) {
        this.flowShortArrays(item);
      }
    }
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
