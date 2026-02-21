import { Injectable } from '@angular/core';
import * as yaml from 'js-yaml';
import {
  OtelConfig,
  OtelComponent,
  OtelPipeline,
  ComponentType,
  GraphData,
  GraphNode,
  GraphEdge,
  createEmptyConfig,
  parseComponentId,
  parsePipelineId,
  COMPONENT_TYPE_TO_SECTION,
  PIPELINE_ROLES,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class ConfigParserService {
  /**
   * Parse a YAML string into an OtelConfig model.
   */
  parseYaml(yamlString: string): OtelConfig {
    const raw = yaml.load(yamlString) as Record<string, unknown>;

    if (!raw || typeof raw !== 'object') {
      return createEmptyConfig();
    }

    const config = createEmptyConfig();
    for (const [componentType, sectionKey] of Object.entries(COMPONENT_TYPE_TO_SECTION)) {
      config[sectionKey] = this.parseComponents(raw[sectionKey], componentType as ComponentType);
    }
    config.service = this.parseService(raw['service']);
    return config;
  }

  /**
   * Convert an OtelConfig into GraphData for d3.js rendering.
   */
  configToGraph(config: OtelConfig): GraphData {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Create nodes for all components referenced in pipelines
    const allComponents = [
      ...config.receivers,
      ...config.processors,
      ...config.exporters,
      ...config.connectors,
      ...config.extensions,
    ];

    for (const component of allComponents) {
      const nodeId = `${component.componentType}/${component.id}`;
      const node: GraphNode = {
        id: nodeId,
        label: component.id,
        componentType: component.componentType,
        component,
      };
      nodes.push(node);
      nodeMap.set(nodeId, node);
    }

    // Create edges from pipeline definitions
    for (const pipeline of config.service.pipelines) {
      if (pipeline.processors.length > 0) {
        // Every receiver → every processor
        for (const receiverId of pipeline.receivers) {
          for (const processorId of pipeline.processors) {
            const edgeId = `${pipeline.id}:receiver/${receiverId}->processor/${processorId}`;
            edges.push({
              id: edgeId,
              source: `receiver/${receiverId}`,
              target: `processor/${processorId}`,
              pipelineId: pipeline.id,
              signal: pipeline.signal,
            });
          }
        }

        // Every processor → every exporter
        for (const processorId of pipeline.processors) {
          for (const exporterId of pipeline.exporters) {
            const edgeId = `${pipeline.id}:processor/${processorId}->exporter/${exporterId}`;
            edges.push({
              id: edgeId,
              source: `processor/${processorId}`,
              target: `exporter/${exporterId}`,
              pipelineId: pipeline.id,
              signal: pipeline.signal,
            });
          }
        }
      } else {
        // No processors: every receiver → every exporter
        for (const receiverId of pipeline.receivers) {
          for (const exporterId of pipeline.exporters) {
            const edgeId = `${pipeline.id}:receiver/${receiverId}->exporter/${exporterId}`;
            edges.push({
              id: edgeId,
              source: `receiver/${receiverId}`,
              target: `exporter/${exporterId}`,
              pipelineId: pipeline.id,
              signal: pipeline.signal,
            });
          }
        }
      }
    }

    // Add edges from extensions to a virtual "service" concept
    // For now, just mark extension nodes as present — they'll render in their column
    // If extensions are listed in service.extensions, add a visual indicator
    if (config.service.extensions) {
      for (const extId of config.service.extensions) {
        const extNodeId = `extension/${extId}`;
        const extNode = nodeMap.get(extNodeId);
        if (extNode) {
          // Tag the node so the graph can style it differently
          (extNode as any).active = true;
        }
      }
    }
    
    return { nodes, edges };
  }

  private parseComponents(raw: unknown, componentType: ComponentType): OtelComponent[] {
    if (!raw || typeof raw !== 'object') {
      return [];
    }

    return Object.entries(raw as Record<string, unknown>).map(([id, config]) => {
      const { type, name } = parseComponentId(id);
      return {
        id,
        type,
        name,
        componentType,
        config: (config as Record<string, unknown>) ?? {},
      };
    });
  }

  private parseService(raw: unknown): OtelConfig['service'] {
    if (!raw || typeof raw !== 'object') {
      return { pipelines: [] };
    }

    const service = raw as Record<string, unknown>;

    return {
      extensions: Array.isArray(service['extensions']) ? service['extensions'] : undefined,
      pipelines: this.parsePipelines(service['pipelines']),
      telemetry: (service['telemetry'] as OtelConfig['service']['telemetry']) ?? undefined,
    };
  }

  private parsePipelines(raw: unknown): OtelPipeline[] {
    if (!raw || typeof raw !== 'object') {
      return [];
    }

    return Object.entries(raw as Record<string, unknown>).map(([id, config]) => {
      const { signal, name } = parsePipelineId(id);
      const pipelineConfig = (config as Record<string, unknown>) ?? {};

      const pipeline: OtelPipeline = { id, signal, name, receivers: [], processors: [], exporters: [] };
      for (const role of PIPELINE_ROLES) {
        pipeline[role] = this.toStringArray(pipelineConfig[role]);
      }
      return pipeline;
    });
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String);
    }
    return [];
  }
}
