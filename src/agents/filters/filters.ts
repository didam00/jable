/**
 * 필터 Agent - 필터링 및 정렬 로직
 */
import type { TableData, Row } from '../store/types';

export interface Filter {
  columnKey: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'regex';
  value: string;
}

export function applyFilters(data: TableData, filters: Filter[]): Row[] {
  if (filters.length === 0) return data.rows;

  return data.rows.filter((row) => {
    return filters.every((filter) => {
      const cell = row.cells[filter.columnKey];
      if (!cell) return false;

      const cellValue = String(cell.value ?? '').toLowerCase();
      const filterValue = filter.value.toLowerCase();

      switch (filter.operator) {
        case 'equals':
          return cellValue === filterValue;
        case 'contains':
          return cellValue.includes(filterValue);
        case 'startsWith':
          return cellValue.startsWith(filterValue);
        case 'endsWith':
          return cellValue.endsWith(filterValue);
        case 'greaterThan':
          return Number(cell.value) > Number(filter.value);
        case 'lessThan':
          return Number(cell.value) < Number(filter.value);
        case 'regex':
          try {
            const regex = new RegExp(filter.value, 'i');
            return regex.test(String(cell.value));
          } catch {
            return false;
          }
        default:
          return true;
      }
    });
  });
}

export function sortRows(rows: Row[], columnKey: string, direction: 'asc' | 'desc'): Row[] {
  return [...rows].sort((a, b) => {
    const aValue = a.cells[columnKey]?.value;
    const bValue = b.cells[columnKey]?.value;

    if (aValue === bValue) return 0;

    const comparison = aValue < bValue ? -1 : 1;
    return direction === 'asc' ? comparison : -comparison;
  });
}

export function getColumnValues(data: TableData, columnKey: string): any[] {
  const values = new Set<any>();
  data.rows.forEach((row) => {
    const cell = row.cells[columnKey];
    if (cell) {
      values.add(cell.value);
    }
  });
  return Array.from(values);
}

