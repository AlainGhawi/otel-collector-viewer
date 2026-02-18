import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { ComponentLibraryService } from '../../../core/services/component-library.service';
import { ConfigStateService } from '../../../core/services/config-state.service';
import { ComponentDefinition } from '../../../core/models/component-library.model';
import { ComponentType, SignalType, getComponentColor, getSignalColor } from '../../../core/models';

type TabFilter = 'all' | ComponentType;

export interface AddComponentDialogResult {
  definition: ComponentDefinition;
  instanceName?: string;
  pipelineIds: string[];
  newPipeline?: { signal: SignalType; name?: string };
}

@Component({
  selector: 'app-add-component-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, FormsModule],
  templateUrl: './add-component-dialog.component.html',
  styleUrls: ['./add-component-dialog.component.css'],
})
export class AddComponentDialogComponent {
  private readonly library = inject(ComponentLibraryService);
  private readonly dialogRef = inject(MatDialogRef<AddComponentDialogComponent>);
  private readonly state = inject(ConfigStateService);

  readonly searchQuery = signal('');
  readonly activeTab = signal<TabFilter>('all');
  readonly selectedDefinition = signal<ComponentDefinition | null>(null);
  readonly instanceName = signal('');
  readonly selectedPipelines = signal<Set<string>>(new Set());
  readonly showNewPipeline = signal(false);
  readonly newPipelineSignal = signal<SignalType>('traces');
  readonly newPipelineName = signal('');

  readonly signalTypes: SignalType[] = ['traces', 'metrics', 'logs'];

  readonly availablePipelines = computed(() => {
    const def = this.selectedDefinition();
    if (!def || def.componentType === 'extension') return [];
    return this.state.config().service.pipelines;
  });

  readonly tabs: { value: TabFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'receiver', label: 'Receivers' },
    { value: 'processor', label: 'Processors' },
    { value: 'exporter', label: 'Exporters' },
    { value: 'connector', label: 'Connectors' },
    { value: 'extension', label: 'Extensions' },
  ];

  readonly filteredComponents = computed(() => {
    const tab = this.activeTab();
    const query = this.searchQuery();

    let results = tab === 'all'
      ? this.library.getAll()
      : this.library.getByType(tab);

    if (query.trim()) {
      const lower = query.toLowerCase();
      results = results.filter(
        c =>
          c.type.toLowerCase().includes(lower) ||
          c.displayName.toLowerCase().includes(lower) ||
          c.description.toLowerCase().includes(lower),
      );
    }

    return results;
  });

  getColor(type: ComponentType): string {
    return getComponentColor(type);
  }

  selectTab(tab: TabFilter): void {
    this.activeTab.set(tab);
    this.selectedDefinition.set(null);
  }

  selectComponent(def: ComponentDefinition): void {
    this.selectedDefinition.set(def);
    this.instanceName.set('');
    this.selectedPipelines.set(new Set());
    this.showNewPipeline.set(false);
    this.newPipelineName.set('');
  }

  getSignalColor(signal: SignalType): string {
    return getSignalColor(signal);
  }

  togglePipeline(pipelineId: string): void {
    const current = new Set(this.selectedPipelines());
    if (current.has(pipelineId)) {
      current.delete(pipelineId);
    } else {
      current.add(pipelineId);
    }
    this.selectedPipelines.set(current);
  }

  isPipelineSelected(pipelineId: string): boolean {
    return this.selectedPipelines().has(pipelineId);
  }

  toggleNewPipeline(): void {
    this.showNewPipeline.update(v => !v);
  }

  onNewPipelineSignalChange(event: Event): void {
    this.newPipelineSignal.set((event.target as HTMLSelectElement).value as SignalType);
  }

  onNewPipelineNameInput(event: Event): void {
    this.newPipelineName.set((event.target as HTMLInputElement).value);
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onInstanceNameInput(event: Event): void {
    this.instanceName.set((event.target as HTMLInputElement).value);
  }

  onAdd(): void {
    const def = this.selectedDefinition();
    if (!def) return;

    const result: AddComponentDialogResult = {
      definition: def,
      instanceName: this.instanceName().trim().replace(/\//g, '') || undefined,
      pipelineIds: [...this.selectedPipelines()],
      newPipeline: this.showNewPipeline()
        ? { signal: this.newPipelineSignal(), name: this.newPipelineName().trim() || undefined }
        : undefined,
    };

    this.dialogRef.close(result);
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }
}
