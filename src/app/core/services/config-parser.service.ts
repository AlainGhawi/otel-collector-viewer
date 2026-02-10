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

    return {
      receivers: this.parseComponents(raw['receivers'], 'receiver'),
      processors: this.parseComponents(raw['processors'], 'processor'),
      exporters: this.parseComponents(raw['exporters'], 'exporter'),
      connectors: this.parseComponents(raw['connectors'], 'connector'),
      extensions: this.parseComponents(raw['extensions'], 'extension'),
      service: this.parseService(raw['service']),
    };
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
      // Receiver → Processor edges
      if (pipeline.processors.length > 0) {
        for (const receiverId of pipeline.receivers) {
          const edgeId = `${pipeline.id}:receiver/${receiverId}->processor/${pipeline.processors[0]}`;
          edges.push({
            id: edgeId,
            source: `receiver/${receiverId}`,
            target: `processor/${pipeline.processors[0]}`,
            pipelineId: pipeline.id,
            signal: pipeline.signal,
          });
        }

        // Processor → Processor chain edges
        for (let i = 0; i < pipeline.processors.length - 1; i++) {
          const edgeId = `${pipeline.id}:processor/${pipeline.processors[i]}->processor/${pipeline.processors[i + 1]}`;
          edges.push({
            id: edgeId,
            source: `processor/${pipeline.processors[i]}`,
            target: `processor/${pipeline.processors[i + 1]}`,
            pipelineId: pipeline.id,
            signal: pipeline.signal,
          });
        }

        // Last Processor → Exporter edges
        const lastProcessor = pipeline.processors[pipeline.processors.length - 1];
        for (const exporterId of pipeline.exporters) {
          const edgeId = `${pipeline.id}:processor/${lastProcessor}->exporter/${exporterId}`;
          edges.push({
            id: edgeId,
            source: `processor/${lastProcessor}`,
            target: `exporter/${exporterId}`,
            pipelineId: pipeline.id,
            signal: pipeline.signal,
          });
        }
      } else {
        // Direct Receiver → Exporter edges (no processors)
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

      return {
        id,
        signal,
        name,
        receivers: this.toStringArray(pipelineConfig['receivers']),
        processors: this.toStringArray(pipelineConfig['processors']),
        exporters: this.toStringArray(pipelineConfig['exporters']),
      };
    });
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String);
    }
    return [];
  }
}
