import { Component, inject, input, output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ConfigStateService } from '../../core/services/config-state.service';
import { ComponentType, PipelineRole, COMPONENT_TYPE_TO_ROLE } from '../../core/models';
import { ThemeService } from '../../core/services/theme.service';
import { ConfigUrlService, ConfigTooLargeError } from '../../core/services/config-url.service';
import { AddComponentDialogComponent, AddComponentDialogResult } from '../../shared/components/add-component-dialog/add-component-dialog.component';
import { PipelineManagerDialogComponent } from '../../shared/components/pipeline-manager-dialog/pipeline-manager-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css',
})
export class ToolbarComponent {
  readonly activeTab = input.required<'config' | 'logs'>();
  readonly tabChange = output<'config' | 'logs'>();

  readonly state = inject(ConfigStateService);
  readonly themeService = inject(ThemeService);
  private readonly http = inject(HttpClient);
  private readonly configUrlService = inject(ConfigUrlService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  openAddComponent(): void {
    this.dialog
      .open(AddComponentDialogComponent, {
        width: '600px',
        maxHeight: '80vh',
      })
      .afterClosed()
      .subscribe((result: AddComponentDialogResult | null) => {
        if (result) {
          const addedId = this.state.addComponent(result.definition, result.instanceName);
          const role = this.getComponentRole(result.definition.componentType);

          // Create new pipeline if requested
          if (result.newPipeline) {
            const newPipelineId = this.state.addPipeline(result.newPipeline.signal, result.newPipeline.name);
            if (role) {
              this.state.addComponentToPipeline(newPipelineId, addedId, role);
            }
          }

          // Add to selected existing pipelines
          if (role) {
            for (const pipelineId of result.pipelineIds) {
              this.state.addComponentToPipeline(pipelineId, addedId, role);
            }
          }

          this.snackBar.open(
            `Added ${result.definition.componentType} "${addedId}"`,
            'Dismiss',
            { duration: 3000 },
          );
        }
      });
  }

  openPipelineManager(): void {
    this.dialog.open(PipelineManagerDialogComponent, {
      width: '650px',
      maxHeight: '80vh',
    });
  }

  private getComponentRole(componentType: ComponentType): PipelineRole | null {
    return COMPONENT_TYPE_TO_ROLE[componentType] ?? null;
  }

  loadSampleConfig(): void {
    this.http
      .get('sample-configs/full-observability-stack.yaml', { responseType: 'text' })
      .subscribe({
        next: (yaml) => this.state.loadYaml(yaml),
        error: (err) => console.error('Failed to load sample config:', err),
      });
  }

  importFile(): void {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    input?.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const yaml = reader.result as string;
      this.state.loadYaml(yaml);
    };
    reader.readAsText(file);

    // Reset input so the same file can be loaded again
    input.value = '';
  }

  exportFile(): void {
    const yaml = this.state.exportYaml();
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'otel-collector-config.yaml';
    a.click();

    URL.revokeObjectURL(url);
  }

  reset(): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Clear Configuration',
        message: 'Are you sure you want to clear the configuration?',
        confirmText: 'Clear',
      } satisfies ConfirmDialogData,
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.state.reset();
      }
    });
  }

  async shareConfig(): Promise<void> {
    try {
      const yaml = this.state.exportYaml();
      const url = this.configUrlService.generateShareableUrl(yaml);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        this.snackBar.open('Link copied to clipboard!', 'Dismiss', { duration: 3000 });
      } else {
        prompt('Copy this shareable link:', url);
      }
    } catch (error) {
      const message = error instanceof ConfigTooLargeError
        ? 'Config too large to share via URL. Use Export instead.'
        : 'Failed to create shareable link';
      this.snackBar.open(message, 'Dismiss', { duration: 5000 });
    }
  }
}
