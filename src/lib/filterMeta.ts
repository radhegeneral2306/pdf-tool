import type { FilterId } from '../types';

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'clearScan', label: 'Clear Scan' },
  { id: 'bw', label: 'B&W' },
  { id: 'color', label: 'Color' },
];

export const filterLabel = (id: FilterId) => FILTERS.find((f) => f.id === id)?.label ?? id;
