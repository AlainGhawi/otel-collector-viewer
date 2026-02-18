import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { ConfigStateService } from '../../../core/services/config-state.service';
import { SignalType, OtelPipeline, getSignalColor } from '../../../core/models';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog.component';

type PipelineRole = 'receivers' | 'processors' | 'exporters';

@Component({
  selector: 'app-pipeline-manager-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './pipeline-manager-dialog.component.html',
  styleUrls: ['./pipeline-manager-dialog.component.css'],
})
export class PipelineManagerDialogComponent {
  readonly state = inject(ConfigStateService);
  private readonly dialogRef = inject(MatDialogRef<PipelineManagerDialogComponent>);
  private readonly dialog = inject(MatDialog);

  readonly showNewPipeline = signal(false);
  readonly newPipelineSignal = signal<SignalType>('traces');
  readonly newPipelineName = signal('');
  readonly signalTypes: SignalType[] = ['traces', 'metrics', 'logs'];

  // Track which pipeline/role has an open "add" dropdown
  readonly activeDropdown = signal<{ pipelineId: string; role: PipelineRole } | null>(null);

  getPipelinesBySignal(signal: SignalType): OtelPipeline[] {
    return this.state.config().service.pipelines.filter(p => p.signal === signal);
  }

  hasSignalPipelines(signal: SignalType): boolean {
    return this.state.config().service.pipelines.some(p => p.signal === signal);
  }

  getSignalColor(signalType: SignalType): string {
    return getSignalColor(signalType);
  }

  getAvailableComponents(pipeline: OtelPipeline, role: PipelineRole): string[] {
    const config = this.state.config();
    const existing = new Set(pipeline[role]);

    let allComponents: string[];
    switch (role) {
      case 'receivers':
        allComponents = config.receivers.map(c => c.id);
        break;
      case 'processors':
        allComponents = config.processors.map(c => c.id);
        break;
      case 'exporters':
        allComponents = config.exporters.map(c => c.id);
        break;
    }

    return allComponents.filter(id => !existing.has(id));
  }

  toggleAddDropdown(pipelineId: string, role: PipelineRole): void {
    const current = this.activeDropdown();
    if (current?.pipelineId === pipelineId && current?.role === role) {
      this.activeDropdown.set(null);
    } else {
      this.activeDropdown.set({ pipelineId, role });
    }
  }

  isDropdownOpen(pipelineId: string, role: PipelineRole): boolean {
    const current = this.activeDropdown();
    return current?.pipelineId === pipelineId && current?.role === role;
  }

  addToPipeline(pipelineId: string, componentId: string, role: PipelineRole): void {
    this.state.addComponentToPipeline(pipelineId, componentId, role);
    this.activeDropdown.set(null);
  }

  removeFromPipeline(pipelineId: string, componentId: string, role: PipelineRole): void {
    this.state.removeComponentFromPipeline(pipelineId, componentId, role);
  }

  deletePipeline(pipeline: OtelPipeline): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Pipeline',
        message: `Delete pipeline "${pipeline.id}"? Components will not be removed.`,
      } satisfies ConfirmDialogData,
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.state.removePipeline(pipeline.id);
      }
    });
  }

  toggleNewPipeline(): void {
    this.showNewPipeline.update(v => !v);
  }

  onNewSignalChange(event: Event): void {
    this.newPipelineSignal.set((event.target as HTMLSelectElement).value as SignalType);
  }

  onNewNameInput(event: Event): void {
    this.newPipelineName.set((event.target as HTMLInputElement).value);
  }

  createPipeline(): void {
    const name = this.newPipelineName().trim() || undefined;
    this.state.addPipeline(this.newPipelineSignal(), name);
    this.showNewPipeline.set(false);
    this.newPipelineName.set('');
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
