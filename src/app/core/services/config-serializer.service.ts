import { Injectable } from '@angular/core';
import * as yaml from 'js-yaml';
import { isMap, isSeq, parseDocument, YAMLSeq } from 'yaml';
import { OtelConfig, OtelComponent, OtelPipeline, ALL_SECTION_KEYS, PIPELINE_ROLES, SectionKey } from '../models';

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
    for (const section of ALL_SECTION_KEYS) {
      if (config[section].length > 0) {
        raw[section] = this.serializeComponents(config[section]);
      }
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
   * Patch an existing YAML string with changes from an OtelConfig model.
   * Preserves comments and formatting by modifying the YAML document tree
   * rather than rebuilding from scratch.
   */
  patchYaml(existingYaml: string, config: OtelConfig): string {
    if (!existingYaml.trim()) {
      return this.serializeToYaml(config);
    }

    const doc = parseDocument(existingYaml);

    for (const section of ALL_SECTION_KEYS) {
      this.patchSection(doc, section, config[section]);
    }
    this.patchServiceNode(doc, config);

    return doc.toString({ indent: 2, lineWidth: 120 });
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
            for (const field of PIPELINE_ROLES) {
              const seq = pipeline.get(field, true);
              if (isSeq(seq)) seq.flow = true;
            }
          }
        }
      }
    }

    // Flow-style short scalar arrays elsewhere (e.g. targets)
    for (const section of ALL_SECTION_KEYS) {
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

  private patchSection(doc: any, sectionName: SectionKey, components: OtelComponent[]): void {
    const sectionNode = doc.get(sectionName, true);

    if (components.length === 0) {
      if (doc.has(sectionName)) {
        doc.delete(sectionName);
      }
      return;
    }

    if (!isMap(sectionNode)) {
      // Section doesn't exist — create it
      const obj: Record<string, unknown> = {};
      for (const comp of components) {
        obj[comp.id] = Object.keys(comp.config).length > 0 ? comp.config : null;
      }
      doc.set(sectionName, doc.createNode(obj));
      return;
    }

    // Collect existing keys
    const existingKeys: string[] = [];
    for (const pair of sectionNode.items) {
      existingKeys.push(String(pair.key));
    }
    const targetIds = new Set(components.map(c => c.id));

    // Remove components not in the new config
    for (const key of existingKeys) {
      if (!targetIds.has(key)) {
        sectionNode.delete(key);
      }
    }

    // Add new components that don't exist yet
    const existingIdSet = new Set(existingKeys);
    for (const comp of components) {
      if (!existingIdSet.has(comp.id)) {
        const value = Object.keys(comp.config).length > 0 ? comp.config : null;
        sectionNode.set(doc.createNode(comp.id), doc.createNode(value));
      }
    }
  }

  private patchServiceNode(doc: any, config: OtelConfig): void {
    const serviceNode = doc.get('service', true);

    if (!isMap(serviceNode)) {
      doc.set('service', doc.createNode(this.serializeService(config)));
      return;
    }

    // Patch extensions list
    if (config.service.extensions && config.service.extensions.length > 0) {
      const extSeq = doc.createNode(config.service.extensions) as YAMLSeq;
      extSeq.flow = true;
      serviceNode.set('extensions', extSeq);
    } else {
      serviceNode.delete('extensions');
    }

    // Patch pipelines
    this.patchPipelinesNode(doc, serviceNode, config.service.pipelines);
  }

  private patchPipelinesNode(doc: any, serviceNode: any, pipelines: OtelPipeline[]): void {
    const pipelinesNode = serviceNode.get('pipelines', true);

    if (pipelines.length === 0) {
      serviceNode.delete('pipelines');
      return;
    }

    if (!isMap(pipelinesNode)) {
      const node = doc.createNode(this.serializePipelines(pipelines));
      serviceNode.set('pipelines', node);
      const created = serviceNode.get('pipelines', true);
      if (isMap(created)) this.applyPipelineFlowStyle(created);
      return;
    }

    // Collect existing pipeline keys
    const existingKeys: string[] = [];
    for (const pair of pipelinesNode.items) {
      existingKeys.push(String(pair.key));
    }
    const targetIds = new Set(pipelines.map(p => p.id));

    // Remove pipelines not in config
    for (const key of existingKeys) {
      if (!targetIds.has(key)) {
        pipelinesNode.delete(key);
      }
    }

    // Add or update pipelines
    const existingIdSet = new Set(existingKeys);
    for (const pipeline of pipelines) {
      if (!existingIdSet.has(pipeline.id)) {
        // New pipeline
        const pipelineObj: Record<string, string[]> = { receivers: pipeline.receivers };
        if (pipeline.processors.length > 0) {
          pipelineObj['processors'] = pipeline.processors;
        }
        pipelineObj['exporters'] = pipeline.exporters;
        const node = doc.createNode(pipelineObj);
        if (isMap(node)) this.applyPipelineFlowStyle(node);
        pipelinesNode.set(doc.createNode(pipeline.id), node);
      } else {
        // Existing pipeline — update role arrays
        const pipelineNode = pipelinesNode.get(pipeline.id, true);
        if (isMap(pipelineNode)) {
          this.patchPipelineRoles(doc, pipelineNode, pipeline);
        }
      }
    }
  }

  private patchPipelineRoles(doc: any, pipelineNode: any, pipeline: OtelPipeline): void {
    for (const role of PIPELINE_ROLES) {
      const items = pipeline[role];
      if (items.length > 0) {
        const seq = doc.createNode(items) as YAMLSeq;
        seq.flow = true;
        pipelineNode.set(role, seq);
      } else if (role === 'processors') {
        pipelineNode.delete(role);
      } else {
        const seq = doc.createNode([]) as YAMLSeq;
        seq.flow = true;
        pipelineNode.set(role, seq);
      }
    }
  }

  private applyPipelineFlowStyle(mapNode: any): void {
    for (const pair of mapNode.items) {
      if (isSeq(pair.value)) {
        pair.value.flow = true;
      }
      if (isMap(pair.value)) {
        this.applyPipelineFlowStyle(pair.value);
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
