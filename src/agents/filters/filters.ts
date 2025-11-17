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
  const specialValues: any[] = []; // null, undefined, 빈 문자열 등 특이값
  const normalValues: any[] = []; // 일반 값들
  
  data.rows.forEach((row) => {
    const cell = row.cells[columnKey];
    if (cell) {
      const value = cell.value;
      // 특이값 체크 (null, undefined, 빈 문자열)
      if (value === null || value === undefined || value === '') {
        if (!specialValues.includes(value)) {
          specialValues.push(value);
        }
      } else {
        if (!normalValues.includes(value)) {
          normalValues.push(value);
        }
      }
    } else {
      // 셀이 없는 경우도 undefined로 처리
      if (!specialValues.includes(undefined)) {
        specialValues.push(undefined);
      }
    }
  });
  
  // 특이값을 먼저, 그 다음 일반 값들을 정렬해서 반환
  // 특이값 순서: undefined -> null -> ''
  const sortedSpecialValues = [
    ...specialValues.filter(v => v === undefined),
    ...specialValues.filter(v => v === null),
    ...specialValues.filter(v => v === '')
  ];
  
  // 일반 값들을 문자열로 변환해서 정렬
  const sortedNormalValues = normalValues.sort((a, b) => {
    const aStr = String(a);
    const bStr = String(b);
    return aStr.localeCompare(bStr);
  });
  
  return [...sortedSpecialValues, ...sortedNormalValues];
}

