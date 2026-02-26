import { Component, inject, output, signal } from '@angular/core';
import { LogViewerStateService } from '../../../../core/services/log-viewer-state.service';
import { formatFileSize, isRotatedFile } from '../../../../core/utils/otlp-log-helpers';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  templateUrl: './file-upload.component.html',
  styleUrl: './file-upload.component.scss',
})
export class FileUploadComponent {
  readonly state = inject(LogViewerStateService);
  readonly isDragOver = signal(false);

  readonly formatFileSize = formatFileSize;
  readonly isRotatedFile = isRotatedFile;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files) {
      this.loadFiles(files);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.loadFiles(input.files);
      input.value = ''; // reset so same file can be re-selected
    }
  }

  removeFile(fileName: string): void {
    this.state.removeFile(fileName);
  }

  private loadFiles(files: FileList): void {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.endsWith('.json')) {
        this.state.loadFile(file);
      }
    }
  }
}
