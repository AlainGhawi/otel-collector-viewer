import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ConfigStateService } from '../../core/services/config-state.service';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css'],
})
export class ToolbarComponent {
  readonly state = inject(ConfigStateService);
  private readonly http = inject(HttpClient);

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
    if (this.state.hasUnsavedChanges()) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to clear?');
      if (!confirmed) return;
    }
    this.state.reset();
  }
}
