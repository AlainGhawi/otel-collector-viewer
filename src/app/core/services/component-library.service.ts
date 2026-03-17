import { computed, inject, Injectable } from '@angular/core';
import { ComponentDefinition } from '../models/component-library.model';
import { ComponentType } from '../models/otel-config.model';
import { ComponentRegistryService } from './component-registry.service';

@Injectable({
  providedIn: 'root',
})
export class ComponentLibraryService {
  private readonly registry = inject(ComponentRegistryService);

  readonly isLoading = computed(() => this.registry.loading());
  readonly error = computed(() => this.registry.error());

  getAll(): ComponentDefinition[] {
    return this.registry.catalog();
  }

  getByType(componentType: ComponentType): ComponentDefinition[] {
    return this.registry.catalog().filter(c => c.componentType === componentType);
  }

  search(query: string): ComponentDefinition[] {
    const lower = query.toLowerCase();
    return this.registry.catalog().filter(
      c =>
        c.type.toLowerCase().includes(lower) ||
        c.displayName.toLowerCase().includes(lower) ||
        c.description.toLowerCase().includes(lower),
    );
  }

  enrichComponent(componentType: ComponentType, type: string): void {
    this.registry.enrichComponent(componentType, type);
  }

  clearCacheAndRefresh(): void {
    this.registry.clearCacheAndRefresh();
  }
}
