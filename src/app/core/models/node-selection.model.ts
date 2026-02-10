import { OtelComponent } from './otel-config.model';

export interface NodeSelection {
  component: OtelComponent;
  /** The line number in the YAML where this component starts */
  yamlLine?: number;
}