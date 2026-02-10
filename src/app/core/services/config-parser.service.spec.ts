import { TestBed } from '@angular/core/testing';
import { ConfigParserService } from './config-parser.service';

describe('ConfigParserService', () => {
  let service: ConfigParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfigParserService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should parse a minimal config', () => {
    const yaml = `
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
exporters:
  debug:
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [debug]
`;

    const config = service.parseYaml(yaml);

    expect(config.receivers.length).toBe(1);
    expect(config.receivers[0].id).toBe('otlp');
    expect(config.receivers[0].componentType).toBe('receiver');

    expect(config.exporters.length).toBe(1);
    expect(config.exporters[0].id).toBe('debug');

    expect(config.service.pipelines.length).toBe(1);
    expect(config.service.pipelines[0].signal).toBe('traces');
    expect(config.service.pipelines[0].receivers).toEqual(['otlp']);
    expect(config.service.pipelines[0].exporters).toEqual(['debug']);
  });

  it('should parse component IDs with name qualifiers', () => {
    const yaml = `
receivers:
  otlp/grpc:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
exporters:
  otlp/tempo:
    endpoint: tempo:4317
service:
  pipelines:
    traces:
      receivers: [otlp/grpc]
      exporters: [otlp/tempo]
`;

    const config = service.parseYaml(yaml);

    expect(config.receivers[0].type).toBe('otlp');
    expect(config.receivers[0].name).toBe('grpc');

    expect(config.exporters[0].type).toBe('otlp');
    expect(config.exporters[0].name).toBe('tempo');
  });

  it('should parse pipeline IDs with name qualifiers', () => {
    const yaml = `
receivers:
  otlp:
exporters:
  debug:
service:
  pipelines:
    traces/backend:
      receivers: [otlp]
      exporters: [debug]
`;

    const config = service.parseYaml(yaml);

    expect(config.service.pipelines[0].signal).toBe('traces');
    expect(config.service.pipelines[0].name).toBe('backend');
  });

  it('should return empty config for invalid YAML', () => {
    const config = service.parseYaml('');

    expect(config.receivers.length).toBe(0);
    expect(config.exporters.length).toBe(0);
    expect(config.service.pipelines.length).toBe(0);
  });

  it('should handle processors in pipelines', () => {
    const yaml = `
receivers:
  otlp:
processors:
  batch:
    timeout: 5s
  memory_limiter:
    limit_mib: 512
exporters:
  debug:
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [debug]
`;

    const config = service.parseYaml(yaml);

    expect(config.processors.length).toBe(2);
    expect(config.service.pipelines[0].processors).toEqual(['memory_limiter', 'batch']);
  });

  describe('configToGraph', () => {
    it('should create nodes and edges from a config', () => {
      const yaml = `
receivers:
  otlp:
processors:
  batch:
exporters:
  debug:
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
`;

      const config = service.parseYaml(yaml);
      const graph = service.configToGraph(config);

      expect(graph.nodes.length).toBe(3);
      expect(graph.edges.length).toBe(2); // otlp→batch, batch→debug
    });

    it('should create direct edges when no processors exist', () => {
      const yaml = `
receivers:
  otlp:
exporters:
  debug:
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [debug]
`;

      const config = service.parseYaml(yaml);
      const graph = service.configToGraph(config);

      expect(graph.edges.length).toBe(1); // otlp→debug
      expect(graph.edges[0].source).toBe('receiver/otlp');
      expect(graph.edges[0].target).toBe('exporter/debug');
    });
  });
});
