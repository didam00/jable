/**
 * 검색 Agent - 검색 엔진
 */
import type { TableData } from '../store/types';
import type { SearchResult } from './types';
import { parseQuery, type ColumnSelection, type RowSelection, type NumericComparison, type StringComparison, type ParsedQuery } from './queryParser';
import { resolveColumnSelectionToKeys, resolveRowSelectionToIndices } from './selectionUtils';

export function searchData(data: TableData, query: string, useRegex: boolean = false): SearchResult[] {
  if (!query.trim()) return [];

  const parsed = parseQuery(query);
  return searchDataWithParsed(data, parsed, useRegex);
}

function searchDataWithParsed(data: TableData, parsed: ParsedQuery, useRegex: boolean): SearchResult[] {
  // 파싱된 쿼리 타입에 따라 다른 검색 로직 실행
  switch (parsed.type) {
    case 'normal':
      return normalSearch(data, parsed.text || '', useRegex);
    case 'column':
      // columnAttributeSearch가 있으면 속성 검색
      if (parsed.columnAttributeSearch) {
        return columnAttributeSearch(
          data, 
          parsed.columnAttributeSearch.columnName, 
          parsed.columnAttributeSearch.operator, 
          parsed.columnAttributeSearch.value,
          parsed.columnAttributeSearch.negated,
          useRegex
        );
      }
      // column=str은 정확히 같은 경우만 검색 (포함이 아님)
      return columnExactSearch(data, parsed.columnName || '', parsed.text || '');
    case 'columnPresence':
      return columnPresenceSearch(data, parsed.columnName || '', parsed.presenceCheck || 'missing');
    case 'comparison':
      return comparisonSearch(data, parsed.comparisons || [], parsed.stringComparisons || [], parsed.logicalOperator || '&');
    case 'stringComparison':
      return stringComparisonSearch(data, parsed.stringComparisons || [], parsed.logicalOperator || '&');
    case 'row':
      return rowSearch(data, parsed.rowIndex ?? -1);
    case 'rowRange':
      return rowRangeSearch(data, parsed.rowStart ?? -1, parsed.rowEnd ?? -1);
    case 'rowList':
      return rowListSearch(data, parsed.rowIndices || []);
    case 'cell':
      return cellSearch(data, parsed.cellRow ?? -1, parsed.cellColumn);
    case 'cellRange':
      return cellRangeSearch(data, parsed.cellRow ?? -1, parsed.cellStartColumn ?? -1, parsed.cellEndColumn ?? -1);
    case 'cellList':
      return cellListSearch(data, parsed.cellRow ?? -1, parsed.cellColumns || []);
    case 'columnFilter':
      return columnFilterSearch(data, parsed.filterColumn);
    case 'rowColumn':
      if (parsed.rowSelection && parsed.columnSelection) {
        return rowColumnSearch(data, parsed.rowSelection, parsed.columnSelection);
      }
      return [];
    case 'logicalGroup':
      return logicalGroupSearch(data, parsed.subQueries || [], parsed.groupOperator || '&', useRegex);
    default:
      return normalSearch(data, parsed.text || '', useRegex);
  }
}

function normalSearch(data: TableData, query: string, useRegex: boolean): SearchResult[] {
  const results: SearchResult[] = [];
  const searchRegex = useRegex
    ? (() => {
        try {
          return new RegExp(query, 'gi');
        } catch {
          return null;
        }
      })()
    : null;

  if (!searchRegex && useRegex) return [];

  data.rows.forEach((row) => {
    data.columns.forEach((column) => {
      const cell = row.cells[column.key];
      if (!cell) return;

      const cellValue = String(cell.value ?? '');
      let matches = 0;

      if (useRegex && searchRegex) {
        const matchArray = cellValue.match(searchRegex);
        matches = matchArray ? matchArray.length : 0;
      } else {
        const lowerQuery = query.toLowerCase();
        const lowerValue = cellValue.toLowerCase();
        let index = lowerValue.indexOf(lowerQuery);
        while (index !== -1) {
          matches++;
          index = lowerValue.indexOf(lowerQuery, index + 1);
        }
      }

      if (matches > 0) {
        results.push({
          rowId: row.id,
          columnKey: column.key,
          matches,
        });
      }
    });
  });

  return results;
}

// column=str: 정확히 같은 경우만 검색
function columnExactSearch(data: TableData, columnName: string, text: string): SearchResult[] {
  const results: SearchResult[] = [];
  const column = data.columns.find(col => col.key === columnName || col.label === columnName);
  
  if (!column) return [];

  data.rows.forEach((row) => {
    const cell = row.cells[column.key];
    if (!cell) return;

    const cellValue = String(cell.value ?? '');
    
    // 정확히 같은 경우만 검색 (대소문자 구분 없음)
    if (cellValue.toLowerCase() === text.toLowerCase()) {
      results.push({
        rowId: row.id,
        columnKey: column.key,
        matches: 1,
      });
    }
  });

  return results;
}

// column^=value, column$=value, column*=value: CSS 속성 선택자 스타일 검색
function columnAttributeSearch(
  data: TableData, 
  columnName: string, 
  operator: '^=' | '$=' | '*=' | '=',
  value: string,
  negated: boolean,
  useRegex: boolean
): SearchResult[] {
  const results: SearchResult[] = [];
  const column = data.columns.find(col => col.key === columnName || col.label === columnName);
  
  if (!column) return [];

  let regex: RegExp | null = null;
  if (useRegex) {
    try {
      regex = new RegExp(value, 'gi');
    } catch {
      // 정규식 파싱 실패 시 일반 검색으로 폴백
      regex = null;
    }
  }

  data.rows.forEach((row) => {
    const cell = row.cells[column.key];
    if (!cell) {
      // 셀이 없으면 negated인 경우에만 매치
      if (negated) {
        results.push({
          rowId: row.id,
          columnKey: column.key,
          matches: 1,
        });
      }
      return;
    }

    const cellValue = String(cell.value ?? '');
    let matches = false;

    if (useRegex && regex) {
      // 정규식 검색
      const match = cellValue.match(regex);
      const regexMatch = match !== null;
      
      switch (operator) {
        case '^=':
          // 시작하는지 확인 (정규식)
          if (regexMatch && match && match.index === 0) {
            matches = true;
          }
          break;
        case '$=':
          // 끝나는지 확인 (정규식)
          if (regexMatch && match && match[0]) {
            const matchEnd = (match.index || 0) + match[0].length;
            matches = matchEnd === cellValue.length;
          }
          break;
        case '*=':
          // 포함하는지 확인 (정규식)
          matches = regexMatch;
          break;
        case '=':
          // 정확히 일치하는지 확인 (정규식)
          if (regexMatch && match && match[0] === cellValue) {
            matches = true;
          }
          break;
      }
    } else {
      // 일반 문자열 검색 (대소문자 구분 없음)
      const lowerCellValue = cellValue.toLowerCase();
      const lowerValue = value.toLowerCase();
      
      switch (operator) {
        case '^=':
          matches = lowerCellValue.startsWith(lowerValue);
          break;
        case '$=':
          matches = lowerCellValue.endsWith(lowerValue);
          break;
        case '*=':
          matches = lowerCellValue.includes(lowerValue);
          break;
        case '=':
          matches = lowerCellValue === lowerValue;
          break;
      }
    }

    // 부정 처리
    if (negated) {
      matches = !matches;
    }

    if (matches) {
      results.push({
        rowId: row.id,
        columnKey: column.key,
        matches: 1,
      });
    }
  });

  return results;
}

function columnPresenceSearch(data: TableData, columnName: string, check: 'missing' | 'exists'): SearchResult[] {
  const results: SearchResult[] = [];
  const column = data.columns.find(col => col.key === columnName || col.label === columnName);

  if (!column) return [];

  data.rows.forEach((row) => {
    const cell = row.cells[column.key];
    const hasValue = cell !== undefined && cell.value !== null && cell.value !== undefined;
    const matchesCheck = check === 'missing' ? !hasValue : hasValue;

    if (matchesCheck) {
      results.push({
        rowId: row.id,
        columnKey: column.key,
        matches: 1,
      });
    }
  });

  return results;
}

function comparisonSearch(data: TableData, numericComparisons: NumericComparison[], stringComparisons: StringComparison[], logicalOp: '&' | '|'): SearchResult[] {
  const results: SearchResult[] = [];
  const allComparisons = [...numericComparisons, ...stringComparisons];

  data.rows.forEach((row) => {
    const matchResults: boolean[] = [];

    // 숫자 비교
    for (const comp of numericComparisons) {
      const column = data.columns.find(col => col.key === comp.column || col.label === comp.column);
      if (!column) {
        matchResults.push(false);
        continue;
      }

      const cell = row.cells[column.key];
      if (!cell) {
        matchResults.push(false);
        continue;
      }

      const cellValue = cell.value;
      const numValue = typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue));

      if (isNaN(numValue)) {
        matchResults.push(false);
        continue;
      }

      let matches = false;
      switch (comp.operator) {
        case '>':
          matches = numValue > comp.value;
          break;
        case '>=':
          matches = numValue >= comp.value;
          break;
        case '<':
          matches = numValue < comp.value;
          break;
        case '<=':
          matches = numValue <= comp.value;
          break;
        case '=':
          matches = numValue === comp.value;
          break;
        case '!=':
          matches = numValue !== comp.value;
          break;
      }
      matchResults.push(matches);
    }

    // 문자열 비교 (포함 검색)
    for (const comp of stringComparisons) {
      const column = data.columns.find(col => col.key === comp.column || col.label === comp.column);
      if (!column) {
        matchResults.push(false);
        continue;
      }

      const cell = row.cells[column.key];
      if (!cell) {
        matchResults.push(false);
        continue;
      }

      const cellValue = String(cell.value ?? '').toLowerCase();
      const searchValue = comp.value.toLowerCase();
      let matches = false;

      switch (comp.operator) {
        case '>':
          // 포함 검색
          matches = cellValue.includes(searchValue);
          break;
        case '>=':
          matches = cellValue.includes(searchValue) || cellValue === searchValue;
          break;
        case '<':
          matches = searchValue.includes(cellValue);
          break;
        case '<=':
          matches = searchValue.includes(cellValue) || cellValue === searchValue;
          break;
        case '=':
          matches = cellValue === searchValue;
          break;
        case '!=':
          matches = cellValue !== searchValue;
          break;
        case '!>':
          matches = !cellValue.includes(searchValue);
          break;
      }
      matchResults.push(matches);
    }

    // AND 또는 OR 연산
    let finalMatch = false;
    if (logicalOp === '&') {
      finalMatch = matchResults.length > 0 && matchResults.every(m => m);
    } else {
      finalMatch = matchResults.some(m => m);
    }

    if (finalMatch) {
      // 모든 컬럼에 대해 결과 추가
      allComparisons.forEach(comp => {
        const column = data.columns.find(col => col.key === comp.column || col.label === comp.column);
        if (column) {
          results.push({
            rowId: row.id,
            columnKey: column.key,
            matches: 1,
          });
        }
      });
    }
  });

  return results;
}

function stringComparisonSearch(data: TableData, stringComparisons: StringComparison[], logicalOp: '&' | '|'): SearchResult[] {
  return comparisonSearch(data, [], stringComparisons, logicalOp);
}

function logicalGroupSearch(data: TableData, subQueries: ParsedQuery[], operator: '&' | '|', useRegex: boolean): SearchResult[] {
  if (subQueries.length === 0) {
    return [];
  }

  const grouped = subQueries.map(query => {
    const results = searchDataWithParsed(data, query, useRegex);
    return {
      rowMap: groupResultsByRow(results),
    };
  });

  const rowSets = grouped.map(entry => new Set(entry.rowMap.keys()));
  const targetRows = operator === '&'
    ? intersectRowSets(rowSets)
    : unionRowSets(rowSets);

  if (targetRows.size === 0) {
    return [];
  }

  const mergedRowMap = new Map<string, Map<string, number>>();

  targetRows.forEach(rowId => {
    const columnMap = new Map<string, number>();
    grouped.forEach(({ rowMap }) => {
      const sourceColumns = rowMap.get(rowId);
      if (!sourceColumns) {
        return;
      }
      sourceColumns.forEach((matches, columnKey) => {
        const current = columnMap.get(columnKey) ?? 0;
        columnMap.set(columnKey, current + matches);
      });
    });

    if (columnMap.size > 0) {
      mergedRowMap.set(rowId, columnMap);
    }
  });

  return flattenRowColumnMap(mergedRowMap);
}

function groupResultsByRow(results: SearchResult[]): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  results.forEach(result => {
    const columnMap = map.get(result.rowId) ?? new Map<string, number>();
    const current = columnMap.get(result.columnKey) ?? 0;
    columnMap.set(result.columnKey, current + result.matches);
    map.set(result.rowId, columnMap);
  });
  return map;
}

function intersectRowSets(rowSets: Array<Set<string>>): Set<string> {
  if (rowSets.length === 0) {
    return new Set();
  }
  const [first, ...rest] = rowSets;
  const result = new Set<string>();
  first.forEach(rowId => {
    if (rest.every(set => set.has(rowId))) {
      result.add(rowId);
    }
  });
  return result;
}

function unionRowSets(rowSets: Array<Set<string>>): Set<string> {
  const result = new Set<string>();
  rowSets.forEach(set => {
    set.forEach(rowId => result.add(rowId));
  });
  return result;
}

function flattenRowColumnMap(rowMap: Map<string, Map<string, number>>): SearchResult[] {
  const results: SearchResult[] = [];
  rowMap.forEach((columns, rowId) => {
    columns.forEach((matches, columnKey) => {
      results.push({
        rowId,
        columnKey,
        matches,
      });
    });
  });
  return results;
}

function rowColumnSearch(data: TableData, rowSelection: RowSelection, columnSelection: ColumnSelection): SearchResult[] {
  const rowIndices = resolveRowSelectionToIndices(rowSelection, data.rows.length);
  const columnKeys = resolveColumnSelectionToKeys(data.columns, columnSelection);
  if (rowIndices.length === 0 || columnKeys.length === 0) {
    return [];
  }
  
  const results: SearchResult[] = [];
  rowIndices.forEach(rowIndex => {
    const row = data.rows[rowIndex];
    if (!row) {
      return;
    }
    columnKeys.forEach(columnKey => {
      if (row.cells[columnKey]) {
        results.push({
          rowId: row.id,
          columnKey,
          matches: 1,
        });
      } else {
        // 열이 존재하지 않아도 행 필터링을 위해 placeholder 추가
        results.push({
          rowId: row.id,
          columnKey,
          matches: 0,
        });
      }
    });
  });
  
  return results;
}

function rowSearch(data: TableData, rowIndex: number): SearchResult[] {
  if (rowIndex < 0 || rowIndex >= data.rows.length) return [];

  const row = data.rows[rowIndex];
  const results: SearchResult[] = [];

  data.columns.forEach(column => {
    if (row.cells[column.key]) {
      results.push({
        rowId: row.id,
        columnKey: column.key,
        matches: 1,
      });
    }
  });

  return results;
}

function rowRangeSearch(data: TableData, rowStart: number, rowEnd: number): SearchResult[] {
  const results: SearchResult[] = [];
  const start = Math.max(0, Math.min(rowStart, rowEnd));
  const end = Math.min(data.rows.length - 1, Math.max(rowStart, rowEnd));

  for (let i = start; i <= end; i++) {
    const row = data.rows[i];
    data.columns.forEach(column => {
      if (row.cells[column.key]) {
        results.push({
          rowId: row.id,
          columnKey: column.key,
          matches: 1,
        });
      }
    });
  }

  return results;
}

function rowListSearch(data: TableData, rowIndices: number[]): SearchResult[] {
  const results: SearchResult[] = [];

  rowIndices.forEach(rowIndex => {
    if (rowIndex >= 0 && rowIndex < data.rows.length) {
      const row = data.rows[rowIndex];
      data.columns.forEach(column => {
        if (row.cells[column.key]) {
          results.push({
            rowId: row.id,
            columnKey: column.key,
            matches: 1,
          });
        }
      });
    }
  });

  return results;
}

function cellSearch(data: TableData, rowIndex: number, columnSpec: string | number | undefined): SearchResult[] {
  if (rowIndex < 0 || rowIndex >= data.rows.length || columnSpec === undefined) return [];

  const row = data.rows[rowIndex];
  const column = typeof columnSpec === 'number'
    ? data.columns[columnSpec]
    : data.columns.find(col => col.key === columnSpec || col.label === columnSpec);

  if (!column || !row.cells[column.key]) return [];

  return [{
    rowId: row.id,
    columnKey: column.key,
    matches: 1,
  }];
}

function cellRangeSearch(data: TableData, rowIndex: number, startCol: number, endCol: number): SearchResult[] {
  if (rowIndex < 0 || rowIndex >= data.rows.length) return [];

  const results: SearchResult[] = [];
  const row = data.rows[rowIndex];
  const start = Math.max(0, Math.min(startCol, endCol));
  const end = Math.min(data.columns.length - 1, Math.max(startCol, endCol));

  for (let i = start; i <= end; i++) {
    const column = data.columns[i];
    if (column && row.cells[column.key]) {
      results.push({
        rowId: row.id,
        columnKey: column.key,
        matches: 1,
      });
    }
  }

  return results;
}

function cellListSearch(data: TableData, rowIndex: number, columns: Array<string | number>): SearchResult[] {
  if (rowIndex < 0 || rowIndex >= data.rows.length) return [];

  const results: SearchResult[] = [];
  const row = data.rows[rowIndex];

  columns.forEach(colSpec => {
    const column = typeof colSpec === 'number'
      ? data.columns[colSpec]
      : data.columns.find(col => col.key === colSpec || col.label === colSpec);

    if (column && row.cells[column.key]) {
      results.push({
        rowId: row.id,
        columnKey: column.key,
        matches: 1,
      });
    }
  });

  return results;
}

function columnFilterSearch(data: TableData, columnSpec: string | number | undefined): SearchResult[] {
  if (columnSpec === undefined) return [];

  const results: SearchResult[] = [];
  const column = typeof columnSpec === 'number'
    ? data.columns[columnSpec]
    : data.columns.find(col => col.key === columnSpec || col.label === columnSpec);

  if (!column) return [];

  data.rows.forEach(row => {
    if (row.cells[column.key]) {
      results.push({
        rowId: row.id,
        columnKey: column.key,
        matches: 1,
      });
    }
  });

  return results;
}

