import { ComponentDefinition } from '../models/component-library.model';

export const COMPONENT_LIBRARY: ComponentDefinition[] = [
  // ─── Receivers ────────────────────────────────────────
  {
    type: 'otlp',
    displayName: 'OTLP',
    description: 'Receives telemetry data via OTLP/gRPC and OTLP/HTTP protocols.',
    componentType: 'receiver',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {
      protocols: {
        grpc: { endpoint: '0.0.0.0:4317' },
        http: { endpoint: '0.0.0.0:4318' },
      },
    },
  },
  {
    type: 'prometheus',
    displayName: 'Prometheus',
    description: 'Scrapes Prometheus metrics endpoints.',
    componentType: 'receiver',
    supportedSignals: ['metrics'],
    defaultConfig: {
      config: {
        scrape_configs: [
          {
            job_name: 'default',
            scrape_interval: '10s',
            static_configs: [{ targets: ['localhost:8888'] }],
          },
        ],
      },
    },
  },
  {
    type: 'filelog',
    displayName: 'File Log',
    description: 'Reads log entries from files on the local filesystem.',
    componentType: 'receiver',
    supportedSignals: ['logs'],
    defaultConfig: {
      include: ['/var/log/**/*.log'],
      start_at: 'end',
    },
  },
  {
    type: 'hostmetrics',
    displayName: 'Host Metrics',
    description: 'Collects system-level metrics (CPU, memory, disk, network).',
    componentType: 'receiver',
    supportedSignals: ['metrics'],
    defaultConfig: {
      collection_interval: '10s',
      scrapers: { cpu: {}, memory: {}, disk: {}, network: {} },
    },
  },
  {
    type: 'jaeger',
    displayName: 'Jaeger',
    description: 'Receives trace data in Jaeger formats (Thrift, gRPC).',
    componentType: 'receiver',
    supportedSignals: ['traces'],
    defaultConfig: {
      protocols: { grpc: {}, thrift_http: {} },
    },
  },
  {
    type: 'zipkin',
    displayName: 'Zipkin',
    description: 'Receives trace data in Zipkin format.',
    componentType: 'receiver',
    supportedSignals: ['traces'],
    defaultConfig: {
      endpoint: '0.0.0.0:9411',
    },
  },
  {
    type: 'kafka',
    displayName: 'Kafka',
    description: 'Receives telemetry data from Apache Kafka topics.',
    componentType: 'receiver',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {
      brokers: ['localhost:9092'],
      topic: 'otlp_spans',
      protocol_version: '2.0.0',
    },
  },

  // ─── Processors ───────────────────────────────────────
  {
    type: 'batch',
    displayName: 'Batch',
    description: 'Batches telemetry data to reduce the number of outgoing requests.',
    componentType: 'processor',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {
      send_batch_size: 1024,
      timeout: '5s',
    },
  },
  {
    type: 'memory_limiter',
    displayName: 'Memory Limiter',
    description: 'Prevents out-of-memory situations by checking memory usage.',
    componentType: 'processor',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {
      check_interval: '1s',
      limit_mib: 512,
      spike_limit_mib: 128,
    },
  },
  {
    type: 'attributes',
    displayName: 'Attributes',
    description: 'Modifies attributes of spans, metrics, or logs (insert, update, delete).',
    componentType: 'processor',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {
      actions: [{ key: 'environment', value: 'production', action: 'insert' }],
    },
  },
  {
    type: 'filter',
    displayName: 'Filter',
    description: 'Filters telemetry data based on conditions.',
    componentType: 'processor',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {},
  },
  {
    type: 'resource',
    displayName: 'Resource',
    description: 'Modifies resource attributes on telemetry data.',
    componentType: 'processor',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {
      attributes: [{ key: 'service.name', value: 'my-service', action: 'upsert' }],
    },
  },
  {
    type: 'tail_sampling',
    displayName: 'Tail Sampling',
    description: 'Samples traces based on policies applied after all spans are received.',
    componentType: 'processor',
    supportedSignals: ['traces'],
    defaultConfig: {
      decision_wait: '10s',
      policies: [
        {
          name: 'errors',
          type: 'status_code',
          status_code: { status_codes: ['ERROR'] },
        },
      ],
    },
  },
  {
    type: 'transform',
    displayName: 'Transform',
    description: 'Transforms telemetry data using OTTL (OpenTelemetry Transformation Language).',
    componentType: 'processor',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {},
  },

  // ─── Exporters ────────────────────────────────────────
  {
    type: 'otlp',
    displayName: 'OTLP',
    description: 'Exports telemetry data via OTLP/gRPC protocol.',
    componentType: 'exporter',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {
      endpoint: 'localhost:4317',
      tls: { insecure: true },
    },
  },
  {
    type: 'otlphttp',
    displayName: 'OTLP/HTTP',
    description: 'Exports telemetry data via OTLP/HTTP protocol.',
    componentType: 'exporter',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {
      endpoint: 'http://localhost:4318',
    },
  },
  {
    type: 'prometheusremotewrite',
    displayName: 'Prometheus Remote Write',
    description: 'Exports metrics using Prometheus Remote Write protocol.',
    componentType: 'exporter',
    supportedSignals: ['metrics'],
    defaultConfig: {
      endpoint: 'http://prometheus:9090/api/v1/write',
    },
  },
  {
    type: 'loki',
    displayName: 'Loki',
    description: 'Exports logs to Grafana Loki.',
    componentType: 'exporter',
    supportedSignals: ['logs'],
    defaultConfig: {
      endpoint: 'http://loki:3100/loki/api/v1/push',
    },
  },
  {
    type: 'debug',
    displayName: 'Debug',
    description: 'Outputs telemetry data to the console for debugging.',
    componentType: 'exporter',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {
      verbosity: 'detailed',
    },
  },
  {
    type: 'kafka',
    displayName: 'Kafka',
    description: 'Exports telemetry data to Apache Kafka.',
    componentType: 'exporter',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {
      brokers: ['localhost:9092'],
      topic: 'otlp_spans',
      protocol_version: '2.0.0',
    },
  },

  // ─── Connectors ───────────────────────────────────────
  {
    type: 'spanmetrics',
    displayName: 'Span Metrics',
    description: 'Generates metrics from spans (RED metrics: rate, errors, duration).',
    componentType: 'connector',
    supportedSignals: ['traces', 'metrics'],
    defaultConfig: {},
  },
  {
    type: 'count',
    displayName: 'Count',
    description: 'Counts telemetry items and produces metrics.',
    componentType: 'connector',
    supportedSignals: ['traces', 'metrics', 'logs'],
    defaultConfig: {},
  },

  // ─── Extensions ───────────────────────────────────────
  {
    type: 'health_check',
    displayName: 'Health Check',
    description: 'Exposes an HTTP health check endpoint.',
    componentType: 'extension',
    supportedSignals: [],
    defaultConfig: {
      endpoint: '0.0.0.0:13133',
    },
  },
  {
    type: 'zpages',
    displayName: 'zPages',
    description: 'Exposes zPages for real-time diagnostic data.',
    componentType: 'extension',
    supportedSignals: [],
    defaultConfig: {
      endpoint: '0.0.0.0:55679',
    },
  },
  {
    type: 'pprof',
    displayName: 'pprof',
    description: 'Exposes Go pprof profiling endpoint.',
    componentType: 'extension',
    supportedSignals: [],
    defaultConfig: {
      endpoint: '0.0.0.0:1777',
    },
  },
  {
    type: 'basicauth',
    displayName: 'Basic Auth',
    description: 'Provides HTTP Basic Authentication for receivers and exporters.',
    componentType: 'extension',
    supportedSignals: [],
    defaultConfig: {
      htpasswd: { inline: 'user:password' },
    },
  },
];
