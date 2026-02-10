export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  pipelineId?: string;
  componentId?: string;
  autoFixable: boolean;
}