/**
 * 검색 Agent - 검색 엔진
 */
import type { TableData } from '../store/types';
import type { SearchResult } from './types';
import { parseQuery, type ParsedQuery } from './queryParser';

export function searchData(data: TableData, query: string, useRegex: boolean = false): SearchResult[] {
  if (!query.trim()) return [];

  const parsed = parseQuery(query);
  
  // 파싱된 쿼리 타입에 따라 다른 검색 로직 실행
  switch (parsed.type) {
    case 'normal':
      return normalSearch(data, parsed.text || '', useRegex);
    case 'column':
      // column=str은 정확히 같은 경우만 검색 (포함이 아님)
      return columnExactSearch(data, parsed.columnName || '', parsed.text || '');
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
    default:
      return normalSearch(data, query, useRegex);
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

function comparisonSearch(data: TableData, numericComparisons: Array<{ column: string; operator: '>' | '>=' | '<' | '<=' | '=' | '!='; value: number; isNumeric: true }>, stringComparisons: Array<{ column: string; operator: '>' | '>=' | '<' | '<=' | '!=' | '='; value: string; isNumeric: false }>, logicalOp: '&' | '|'): SearchResult[] {
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

function stringComparisonSearch(data: TableData, stringComparisons: Array<{ column: string; operator: '>' | '>=' | '<' | '<=' | '!=' | '='; value: string; isNumeric: false }>, logicalOp: '&' | '|'): SearchResult[] {
  return comparisonSearch(data, [], stringComparisons, logicalOp);
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

