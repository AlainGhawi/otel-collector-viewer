import { Injectable } from '@angular/core';
import { OtelConfig, OtelPipeline, ValidationIssue } from '../models';


@Injectable({
  providedIn: 'root',
})
export class ConfigValidatorService {

  /**
   * Validate the config and return all issues found.
   */
  validate(config: OtelConfig): ValidationIssue[] {
    return [
      ...this.checkDanglingPipelineRefs(config),
      ...this.checkUnusedComponents(config),
      ...this.checkEmptyPipelines(config),
      ...this.checkEmptyRequiredFields(config),
      ...this.checkDanglingExtensionRefs(config),
    ];
  }

  /**
   * Auto-repair: remove dangling references from pipelines.
   * Returns a new config (does not mutate the original).
   */
  repair(config: OtelConfig): OtelConfig {
    const receiverIds = new Set(config.receivers.map(r => r.id));
    const processorIds = new Set(config.processors.map(p => p.id));
    const exporterIds = new Set(config.exporters.map(e => e.id));
    const extensionIds = new Set(config.extensions.map(e => e.id));

    const repairedPipelines: OtelPipeline[] = config.service.pipelines.map(pipeline => ({
      ...pipeline,
      receivers: pipeline.receivers.filter(id => receiverIds.has(id)),
      processors: pipeline.processors.filter(id => processorIds.has(id)),
      exporters: pipeline.exporters.filter(id => exporterIds.has(id)),
    }));

    return {
      ...config,
      service: {
        ...config.service,
        extensions: config.service.extensions?.filter(id => extensionIds.has(id)),
        pipelines: repairedPipelines,
      },
    };
  }

  /**
   * Pipeline references a component that doesn't exist in its section.
   * e.g. pipeline says processors: [batch] but batch isn't defined.
   */
  private checkDanglingPipelineRefs(config: OtelConfig): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const receiverIds = new Set(config.receivers.map(r => r.id));
    const processorIds = new Set(config.processors.map(p => p.id));
    const exporterIds = new Set(config.exporters.map(e => e.id));

    for (const pipeline of config.service.pipelines) {
      for (const id of pipeline.receivers) {
        if (!receiverIds.has(id)) {
          issues.push({
            severity: 'error',
            message: `Pipeline "${pipeline.id}" references undefined receiver "${id}"`,
            pipelineId: pipeline.id,
            componentId: id,
            autoFixable: true,
          });
        }
      }

      for (const id of pipeline.processors) {
        if (!processorIds.has(id)) {
          issues.push({
            severity: 'error',
            message: `Pipeline "${pipeline.id}" references undefined processor "${id}"`,
            pipelineId: pipeline.id,
            componentId: id,
            autoFixable: true,
          });
        }
      }

      for (const id of pipeline.exporters) {
        if (!exporterIds.has(id)) {
          issues.push({
            severity: 'error',
            message: `Pipeline "${pipeline.id}" references undefined exporter "${id}"`,
            pipelineId: pipeline.id,
            componentId: id,
            autoFixable: true,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Component is defined but not used in any pipeline.
   */
  private checkUnusedComponents(config: OtelConfig): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const usedReceivers = new Set(config.service.pipelines.flatMap(p => p.receivers));
    const usedProcessors = new Set(config.service.pipelines.flatMap(p => p.processors));
    const usedExporters = new Set(config.service.pipelines.flatMap(p => p.exporters));

    for (const r of config.receivers) {
      if (!usedReceivers.has(r.id)) {
        issues.push({
          severity: 'warning',
          message: `Receiver "${r.id}" is defined but not used in any pipeline`,
          componentId: r.id,
          autoFixable: false,
        });
      }
    }

    for (const p of config.processors) {
      if (!usedProcessors.has(p.id)) {
        issues.push({
          severity: 'warning',
          message: `Processor "${p.id}" is defined but not used in any pipeline`,
          componentId: p.id,
          autoFixable: false,
        });
      }
    }

    for (const e of config.exporters) {
      if (!usedExporters.has(e.id)) {
        issues.push({
          severity: 'warning',
          message: `Exporter "${e.id}" is defined but not used in any pipeline`,
          componentId: e.id,
          autoFixable: false,
        });
      }
    }

    return issues;
  }

  /**
   * Pipeline has no receivers or no exporters (invalid).
   */
  private checkEmptyPipelines(config: OtelConfig): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const pipeline of config.service.pipelines) {
      if (pipeline.receivers.length === 0) {
        issues.push({
          severity: 'error',
          message: `Pipeline "${pipeline.id}" has no receivers`,
          pipelineId: pipeline.id,
          autoFixable: false,
        });
      }

      if (pipeline.exporters.length === 0) {
        issues.push({
          severity: 'error',
          message: `Pipeline "${pipeline.id}" has no exporters`,
          pipelineId: pipeline.id,
          autoFixable: false,
        });
      }
    }

    return issues;
  }

  /**
   * Receivers/exporters defined with no configuration might be intentional
   * but worth flagging.
   */
  private checkEmptyRequiredFields(config: OtelConfig): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (config.service.pipelines.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'No pipelines defined in the service section',
        autoFixable: false,
      });
    }

    return issues;
  }

  /**
 * Extension referenced in service.extensions but not defined in extensions section.
 */
  private checkDanglingExtensionRefs(config: OtelConfig): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const extensionIds = new Set(config.extensions.map(e => e.id));

    for (const id of config.service.extensions ?? []) {
      if (!extensionIds.has(id)) {
        issues.push({
          severity: 'error',
          message: `Service references undefined extension "${id}"`,
          componentId: id,
          autoFixable: true,
        });
      }
    }

    return issues;
  }
}