import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfigStateService } from '../../core/services/config-state.service';
import { ThemeService } from '../../core/services/theme.service';
import { ConfigUrlService, ConfigTooLargeError } from '../../core/services/config-url.service';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css'],
})
export class ToolbarComponent {
  readonly state = inject(ConfigStateService);
  readonly themeService = inject(ThemeService);
  private readonly http = inject(HttpClient);
  private readonly configUrlService = inject(ConfigUrlService);
  private readonly snackBar = inject(MatSnackBar);

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
    this.state.reset();
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
