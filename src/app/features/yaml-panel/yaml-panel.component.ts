import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, inject, effect } from '@angular/core';
import { ConfigStateService } from '../../core/services/config-state.service';
import { ThemeService } from '../../core/services/theme.service';
import { EditorState, StateEffect, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

@Component({
  selector: 'app-yaml-panel',
  standalone: true,
  templateUrl: './yaml-panel.component.html',
  styleUrl: './yaml-panel.component.css',
})
export class YamlPanelComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorContainer', { static: true }) editorContainerRef!: ElementRef<HTMLDivElement>;

  readonly state = inject(ConfigStateService);
  readonly theme = inject(ThemeService);

  expandedErrors = new Set<string>();

  private editorView: EditorView | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressUpdate = false; // prevents feedback loops
  private themeCompartment = new Compartment();

  constructor() {
    // When config changes externally (e.g. Load Sample), update the editor
    effect(() => {
      const yamlContent = this.state.rawYaml();
      if (this.editorView && !this.suppressUpdate) {
        const currentContent = this.editorView.state.doc.toString();
        if (yamlContent !== currentContent) {
          this.editorView.dispatch({
            changes: {
              from: 0,
              to: this.editorView.state.doc.length,
              insert: yamlContent,
            },
          });
        }
      }
    });

    // React to theme changes
    effect(() => {
      const isDark = this.theme.isDark();
      if (this.editorView) {
        this.updateEditorTheme(isDark);
      }
    });
  }

  ngAfterViewInit(): void {
    this.initEditor();
  }

  ngOnDestroy(): void {
    this.editorView?.destroy();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  toggleErrorDetail(key: string): void {
    if (this.expandedErrors.has(key)) {
      this.expandedErrors.delete(key);
    } else {
      this.expandedErrors.add(key);
    }
  }

  copyToClipboard(): void {
    const yamlContent = this.state.exportYaml();
    navigator.clipboard.writeText(yamlContent).catch(console.error);
  }

  goToLine(line?: number): void {
    if (!this.editorView || !line) return;

    const docLine = this.editorView.state.doc.line(line);
    this.editorView.dispatch({
      selection: { anchor: docLine.from },
      scrollIntoView: true,
      effects: EditorView.scrollIntoView(docLine.from, { y: 'center' }),
    });
    this.editorView.focus();
  }

  reformatYaml(): void {
    if (this.state.errors().length > 0) return;
    const reformatted = this.state.reformatYaml();
    // Update editor content directly
    if (reformatted && this.editorView) {
      this.editorView.dispatch({
        changes: {
          from: 0,
          to: this.editorView.state.doc.length,
          insert: reformatted,
        },
      });
    }
  }

  private initEditor(): void {
    const startState = EditorState.create({
      doc: this.state.rawYaml(),
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          { key: 'Tab', run: indentMore },
          { key: 'Shift-Tab', run: indentLess },
        ]),
        yaml(),
        this.themeCompartment.of(this.getEditorTheme(this.theme.isDark())),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.onEditorChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '13px',
          },
          '.cm-scroller': {
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            overflow: 'auto',
          },
          '.cm-content': {
            padding: '12px 0',
          },
        }),
      ],
    });

    this.editorView = new EditorView({
      state: startState,
      parent: this.editorContainerRef.nativeElement,
    });
  }

  private updateEditorTheme(isDark: boolean): void {
    if (!this.editorView) return;

    this.editorView.dispatch({
      effects: this.themeCompartment.reconfigure(this.getEditorTheme(isDark))
    });
  }

  private getEditorTheme(isDark: boolean) {
    if (isDark) {
      return oneDark;
    } else {
      // Custom light theme
      return EditorView.theme({
        '&': {
          backgroundColor: '#ffffff',
          color: '#2c3e50',
        },
        '.cm-content': {
          caretColor: '#2c3e50',
        },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: '#2c3e50',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: '#d7d4f0',
        },
        '.cm-activeLine': {
          backgroundColor: '#f0f0f0',
        },
        '.cm-selectionMatch': {
          backgroundColor: '#e6f3ff',
        },
        '.cm-gutters': {
          backgroundColor: '#f8f8f8',
          color: '#6c6c6c',
          border: 'none',
        },
        '.cm-activeLineGutter': {
          backgroundColor: '#e8e8e8',
        },
      }, { dark: false });
    }
  }

  private onEditorChange(value: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.suppressUpdate = true;
      this.state.updateYaml(value);
      this.suppressUpdate = false;
    }, 400);
  }

}