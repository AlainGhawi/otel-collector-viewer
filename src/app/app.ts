import { Component, HostListener, ViewChild, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs';
import { GraphViewerComponent } from './features/graph-viewer/graph-viewer.component';
import { YamlPanelComponent } from './features/yaml-panel/yaml-panel.component';
import { ToolbarComponent } from './features/toolbar/toolbar.component';
import { NodeDetailComponent } from './features/node-detail/node-detail.component';
import { ConfigStateService, ConfigUrlService } from './core/services';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GraphViewerComponent, YamlPanelComponent, ToolbarComponent, NodeDetailComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent implements OnInit {

  @ViewChild('yamlPanel') yamlPanel!: YamlPanelComponent;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly configState = inject(ConfigStateService);
  private readonly configUrlService = inject(ConfigUrlService);
  
  yamlPanelWidthPercent = 30; // starts at 30% of viewport

  private isResizing = false;
  private readonly MIN_PERCENT = 15;
  private readonly MAX_PERCENT = 60;

  ngOnInit(): void {
    // Try Angular Router first
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      let encodedConfig = params['config'];

      // Fallback: parse URL directly if Angular Router doesn't have it
      if (!encodedConfig && window.location.search) {
        const urlParams = new URLSearchParams(window.location.search);
        encodedConfig = urlParams.get('config');
      }

      if (encodedConfig) {
        this.loadConfigFromUrl(encodedConfig);
      }
    });
  }

  private loadConfigFromUrl(encoded: string): void {
    try {
      const yaml = this.configUrlService.decodeConfig(encoded);
      this.configState.loadYaml(yaml);

      // Clean URL (remove query param) for cleaner UX
      this.router.navigate([], {
        relativeTo: this.route,
        replaceUrl: true
      });
    } catch (error) {
      alert('Failed to load config from URL: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  onResizeStart(event: MouseEvent): void {
    this.isResizing = true;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isResizing) return;

    const percent = ((window.innerWidth - event.clientX) / window.innerWidth) * 100;
    this.yamlPanelWidthPercent = Math.min(this.MAX_PERCENT, Math.max(this.MIN_PERCENT, percent));
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isResizing = false;
  }

  onGoToLine(line: number): void {
    this.yamlPanel.goToLine(line);
  }
}