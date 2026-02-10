import { Injectable, signal, computed, inject } from '@angular/core';
import { OtelConfig, GraphData, createEmptyConfig, ParseError, ValidationIssue, NodeSelection, OtelComponent } from '../models';
import { ConfigParserService } from './config-parser.service';
import { ConfigSerializerService } from './config-serializer.service';
import { ConfigValidatorService } from './config-validator.service';

@Injectable({
  providedIn: 'root',
})
export class ConfigStateService {
  private readonly _config = signal<OtelConfig>(createEmptyConfig());
  private readonly _rawYaml = signal<string>('');
  private readonly _errors = signal<ParseError[]>([]);
  private readonly _validationIssues = signal<ValidationIssue[]>([]);
  private readonly _selectedNode = signal<NodeSelection | null>(null);

  private readonly parser = inject(ConfigParserService);
  private readonly serializer = inject(ConfigSerializerService);
  private readonly validator = inject(ConfigValidatorService);
  /** Current parsed config */
  readonly config = this._config.asReadonly();

  /** Current YAML string */
  readonly rawYaml = this._rawYaml.asReadonly();

  /** Any parsing or validation errors */
  readonly errors = this._errors.asReadonly();

  /** Validation issues found in the current config */
  readonly validationIssues = this._validationIssues.asReadonly();

  /** Currently selected node in the graph */
  readonly selectedNode = this._selectedNode.asReadonly();

  /** Graph data computed from the current config */
  readonly graphData = computed<GraphData>(() => {
    return this.parser.configToGraph(this._config());
  });

  /** Whether a config is currently loaded */
  readonly hasConfig = computed<boolean>(() => {
    const config = this._config();
    return (
      config.receivers.length > 0 ||
      config.exporters.length > 0 ||
      config.service.pipelines.length > 0
    );
  });

  /**
   * Update the config from visual editor changes and regenerate YAML.
   */
  updateConfig(config: OtelConfig): void {
    this._config.set(config);
    this._rawYaml.set(this.serializer.serializeToYaml(config));
    this._errors.set([]);
  }

  /**
 * Load a YAML string, parse it, and update the state.
 */
  loadYaml(yamlString: string): void {
    try {
      let config = this.parser.parseYaml(yamlString);
      config = this.validateAndRepair(config);
      this._config.set(config);
      this._rawYaml.set(yamlString);
      this._errors.set([]);
    } catch (error) {
      this._errors.set([this.extractParseError(error)]);
    }
  }

  /**
   * Update YAML from the text editor and reparse.
   */
  updateYaml(yamlString: string): void {
    try {
      let config = this.parser.parseYaml(yamlString);
      config = this.validateAndRepair(config);
      this._config.set(config);
      this._rawYaml.set(yamlString);
      this._errors.set([]);
    } catch (error) {
      // Keep the raw YAML even if it doesn't parse — user is editing
      this._rawYaml.set(yamlString);
      this._errors.set([this.extractParseError(error)]);
    }
  }

  /**
   * Export the current config as a YAML string.
   */
  exportYaml(): string {
    return this.serializer.serializeToYaml(this._config());
  }

  /**
   * Reset to empty state.
   */
  reset(): void {
    this._config.set(createEmptyConfig());
    this._rawYaml.set('');
    this._errors.set([]);
    this._validationIssues.set([]);
  }

  selectNode(component: OtelComponent): void {
    const yamlLine = this.findComponentLine(component);
    this._selectedNode.set({ component, yamlLine });
  }

  clearSelection(): void {
    this._selectedNode.set(null);
  }

  removeComponent(component: OtelComponent): void {
    const config = this._config();

    // Remove the component from its section
    const updatedConfig: OtelConfig = {
      ...config,
      receivers: config.receivers.filter(r => r.id !== component.id),
      processors: config.processors.filter(p => p.id !== component.id),
      exporters: config.exporters.filter(e => e.id !== component.id),
      connectors: config.connectors.filter(c => c.id !== component.id),
      extensions: config.extensions.filter(e => e.id !== component.id),
      service: {
        ...config.service,
        // Remove from extension list if applicable
        extensions: config.service.extensions?.filter(id => id !== component.id),
        // Remove from all pipelines
        pipelines: config.service.pipelines.map(pipeline => ({
          ...pipeline,
          receivers: pipeline.receivers.filter(id => id !== component.id),
          processors: pipeline.processors.filter(id => id !== component.id),
          exporters: pipeline.exporters.filter(id => id !== component.id),
        })),
      },
    };

    // Validate after removal
    const issues = this.validator.validate(updatedConfig);
    this._validationIssues.set(issues);
    this._config.set(updatedConfig);
    this._rawYaml.set(this.serializer.serializeToYaml(updatedConfig));
    this._selectedNode.set(null);
  }

  private findComponentLine(component: OtelComponent): number | undefined {
    const yaml = this._rawYaml();
    const lines = yaml.split('\n');

    // Find the section header first (e.g. "receivers:", "processors:")
    const sectionKey = component.componentType + 's:';
    let inSection = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();

      // Found section header
      if (trimmed === sectionKey) {
        inSection = true;
        continue;
      }

      // Left the section (another top-level key)
      if (inSection && !lines[i].startsWith(' ') && !lines[i].startsWith('#') && trimmed.length > 0) {
        inSection = false;
      }

      // Look for the component ID in the section
      if (inSection) {
        // Match "  component_id:" or "  component/name:"
        const match = trimmed.match(/^([^#\s][^:]*?):\s*$/);
        if (match && match[1] === component.id) {
          return i + 1; // 1-indexed
        }
        // Also match "  component_id: value" (inline)
        const inlineMatch = trimmed.match(/^([^#\s][^:]*?):\s+\S/);
        if (inlineMatch && inlineMatch[1] === component.id) {
          return i + 1;
        }
      }
    }

    return undefined;
  }

  /* Check for validation issues and attempt to auto-repair the config if possible. */
  private validateAndRepair(config: OtelConfig): OtelConfig {
    // Validate the ORIGINAL config first — this catches the issues
    const issues = this.validator.validate(config);
    this._validationIssues.set(issues);

    // Then repair for the graph/state if possible
    const repaired = this.validator.repair(config);
    return repaired;
  }

  /* Extract line number and message from YAML parsing errors, if available. */
  private extractParseError(error: unknown): ParseError {
    if (error instanceof Error) {
      const yamlError = error as any;
      const line = yamlError.mark?.line != null ? yamlError.mark.line + 1 : undefined;

      // js-yaml format: "short description (line:col)\n\n  context lines..."
      // Split into summary and detail
      const fullMessage = error.message;
      const firstLine = fullMessage.split('\n')[0];

      return {
        message: firstLine,
        line,
        fullError: fullMessage,
      };
    }
    return { message: 'Unknown parsing error' };
  }
}
