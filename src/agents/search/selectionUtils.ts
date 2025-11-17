import type { Column } from '../store/types';
import type { ColumnSelection, RowSelection } from './queryParser';

export function resolveRowSelectionToIndices(selection: RowSelection, rowCount: number): number[] {
  switch (selection.kind) {
    case 'single': {
      return selection.index >= 0 && selection.index < rowCount ? [selection.index] : [];
    }
    case 'range': {
      if (rowCount === 0) return [];
      const start = clamp(selection.start, 0, rowCount - 1);
      const end = clamp(selection.end, 0, rowCount - 1);
      const [min, max] = start <= end ? [start, end] : [end, start];
      const indices: number[] = [];
      for (let i = min; i <= max; i++) {
        indices.push(i);
      }
      return indices;
    }
    case 'list': {
      if (selection.indices.length === 0) return [];
      const unique = new Set<number>();
      selection.indices.forEach(index => {
        if (index >= 0 && index < rowCount) {
          unique.add(index);
        }
      });
      return Array.from(unique).sort((a, b) => a - b);
    }
    default:
      return [];
  }
}

export function resolveColumnSelectionToKeys(columns: Column[], selection: ColumnSelection): string[] {
  const keys: string[] = [];
  const pushColumn = (column: Column | undefined) => {
    if (column && !keys.includes(column.key)) {
      keys.push(column.key);
    }
  };
  
  const getColumnBySpec = (spec: string | number): Column | undefined => {
    if (typeof spec === 'number') {
      return columns[spec];
    }
    return columns.find(col => col.key === spec || col.label === spec);
  };
  
  switch (selection.kind) {
    case 'single':
      pushColumn(getColumnBySpec(selection.value));
      break;
    case 'range': {
      if (columns.length === 0) break;
      const start = clamp(selection.start, 0, columns.length - 1);
      const end = clamp(selection.end, 0, columns.length - 1);
      const [min, max] = start <= end ? [start, end] : [end, start];
      for (let i = min; i <= max; i++) {
        pushColumn(columns[i]);
      }
      break;
    }
    case 'list':
      selection.values.forEach(value => {
        pushColumn(getColumnBySpec(value));
      });
      break;
    default:
      break;
  }
  
  return keys;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

