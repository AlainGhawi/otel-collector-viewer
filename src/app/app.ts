import { Component, HostListener, ViewChild } from '@angular/core';
import { GraphViewerComponent } from './features/graph-viewer/graph-viewer.component';
import { YamlPanelComponent } from './features/yaml-panel/yaml-panel.component';
import { ToolbarComponent } from './features/toolbar/toolbar.component';
import { NodeDetailComponent } from './features/node-detail/node-detail.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GraphViewerComponent, YamlPanelComponent, ToolbarComponent, NodeDetailComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {

  @ViewChild('yamlPanel') yamlPanel!: YamlPanelComponent;
  
  yamlPanelWidthPercent = 30; // starts at 30% of viewport

  private isResizing = false;
  private readonly MIN_PERCENT = 15;
  private readonly MAX_PERCENT = 60;

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