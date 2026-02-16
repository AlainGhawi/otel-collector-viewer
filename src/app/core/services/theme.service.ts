import { Injectable, signal, computed, effect } from '@angular/core';

export type Theme = 'dark' | 'light';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly STORAGE_KEY = 'otel-viewer-theme';
  private readonly _currentTheme = signal<Theme>(this.loadThemeFromStorage());

  readonly currentTheme = this._currentTheme.asReadonly();
  readonly isDark = computed(() => this._currentTheme() === 'dark');
  readonly isLight = computed(() => this._currentTheme() === 'light');

  constructor() {
    // Apply theme on initialization and whenever it changes
    effect(() => {
      this.applyTheme(this._currentTheme());
    });
  }

  toggleTheme(): void {
    const newTheme: Theme = this._currentTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  setTheme(theme: Theme): void {
    this._currentTheme.set(theme);
    this.saveThemeToStorage(theme);
  }

  private loadThemeFromStorage(): Theme {
    if (typeof window === 'undefined' || !window.localStorage) {
      return 'dark';
    }
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored === 'light' ? 'light' : 'dark';
  }

  private saveThemeToStorage(theme: Theme): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(this.STORAGE_KEY, theme);
    }
  }

  private applyTheme(theme: Theme): void {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }
}
