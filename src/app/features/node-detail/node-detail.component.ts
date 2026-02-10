import { Component, inject, output } from '@angular/core';
import { ConfigStateService } from '../../core/services/config-state.service';
import { getComponentColor } from '../../core/models';

@Component({
  selector: 'app-node-detail',
  standalone: true,
  templateUrl: './node-detail.component.html',
  styleUrl: './node-detail.component.css',
})
export class NodeDetailComponent {
  readonly state = inject(ConfigStateService);
  readonly goToLine = output<number>();

  getColor(): string {
    const node = this.state.selectedNode();
    return node ? getComponentColor(node.component.componentType) : '#ffffff';
  }

  formatConfig(): string {
    const node = this.state.selectedNode();
    if (!node) return '';

    const config = node.component.config;
    if (!config || Object.keys(config).length === 0) {
      return 'No configuration';
    }

    return JSON.stringify(config, null, 2);
  }

  onGoToYaml(): void {
    const node = this.state.selectedNode();
    if (node?.yamlLine) {
      this.goToLine.emit(node.yamlLine);
    }
  }

  onClose(): void {
    this.state.clearSelection();
  }

  onDelete(): void {
    const node = this.state.selectedNode();
    if (!node) return;

    const confirmed = confirm(`Delete "${node.component.id}" from the configuration?`);
    if (!confirmed) return;

    this.state.removeComponent(node.component);
  }
}