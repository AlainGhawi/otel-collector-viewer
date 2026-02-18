import { Component, inject, output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ConfigStateService } from '../../core/services/config-state.service';
import { getComponentColor } from '../../core/models';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-node-detail',
  standalone: true,
  templateUrl: './node-detail.component.html',
  styleUrl: './node-detail.component.css',
})
export class NodeDetailComponent {
  readonly state = inject(ConfigStateService);
  readonly goToLine = output<number>();
  private readonly dialog = inject(MatDialog);

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

    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Component',
        message: `Delete "${node.component.id}" from the configuration?`,
      } satisfies ConfirmDialogData,
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.state.removeComponent(node.component);
      }
    });
  }
}