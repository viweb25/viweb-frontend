import { get } from './client';

export type ModuleSection = { key: string; name: string; icon: string };

export type ProductModule = {
  key: string;
  name: string;
  summary: string;
  icon: string;
  status: 'available' | 'coming_soon';
  sections: ModuleSection[];
  highlights: string[];
};

/** Product modules for the app menu (object detection now; more AI features later). */
export function listModules(signal?: AbortSignal) {
  return get<ProductModule[]>('/api/v1/modules', signal);
}
