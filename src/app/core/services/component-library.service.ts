import { Injectable } from '@angular/core';
import { ComponentDefinition } from '../models/component-library.model';
import { ComponentType } from '../models/otel-config.model';
import { COMPONENT_LIBRARY } from '../data/component-library.data';

@Injectable({
  providedIn: 'root',
})
export class ComponentLibraryService {
  getAll(): ComponentDefinition[] {
    return COMPONENT_LIBRARY;
  }

  getByType(componentType: ComponentType): ComponentDefinition[] {
    return COMPONENT_LIBRARY.filter(c => c.componentType === componentType);
  }

  search(query: string): ComponentDefinition[] {
    const lower = query.toLowerCase();
    return COMPONENT_LIBRARY.filter(
      c =>
        c.type.toLowerCase().includes(lower) ||
        c.displayName.toLowerCase().includes(lower) ||
        c.description.toLowerCase().includes(lower),
    );
  }
}
