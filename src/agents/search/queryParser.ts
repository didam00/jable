/**
 * 검색 쿼리 파서
 * 특수 검색 문법 지원
 */

export interface ParsedQuery {
  type: 'normal' | 'column' | 'comparison' | 'stringComparison' | 'row' | 'rowRange' | 'rowList' | 'cell' | 'cellRange' | 'cellList' | 'columnFilter';
  // normal 검색
  text?: string;
  // column=key 검색
  columnName?: string;
  // column>number, column>=number 등 (숫자 비교)
  comparisons?: Array<{
    column: string;
    operator: '>' | '>=' | '<' | '<=' | '=' | '!=';
    value: number;
    isNumeric: true;
  }>;
  // column>str 등 (문자열 포함)
  stringComparisons?: Array<{
    column: string;
    operator: '>' | '>=' | '<' | '<=' | '=' | '!=';
    value: string;
    isNumeric: false;
  }>;
  // AND/OR 연산자
  logicalOperator?: '&' | '|';
  // :number 행 필터링
  rowIndex?: number;
  // :number1-number2 행 범위
  rowStart?: number;
  rowEnd?: number;
  // :1,2,3 행 리스트
  rowIndices?: number[];
  // :a:b 셀 필터링
  cellRow?: number;
  cellColumn?: string | number;
  // :a:b-c 셀 범위
  cellStartColumn?: number;
  cellEndColumn?: number;
  // :a:b,c,d 셀 리스트
  cellColumns?: Array<string | number>;
  // ::b 열 필터링 (단일)
  filterColumn?: string | number;
  // ::b-c 열 범위 필터링
  filterColumnStart?: number;
  filterColumnEnd?: number;
  // ::b,c,d 열 리스트 필터링
  filterColumns?: Array<string | number>;
}

export function parseQuery(query: string): ParsedQuery {
  const trimmed = query.trim();
  
  if (!trimmed) {
    return { type: 'normal', text: '' };
  }

  // ::b 형식 (열 필터링)
  if (trimmed.startsWith('::')) {
    const columnSpec = trimmed.substring(2).trim();
    
    // ::2-4 형식 (범위)
    const rangeMatch = columnSpec.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      return {
        type: 'columnFilter',
        filterColumnStart: parseInt(rangeMatch[1], 10) - 1, // 0-based
        filterColumnEnd: parseInt(rangeMatch[2], 10) - 1,
      };
    }
    
    // ::1,2,3 형식 (리스트)
    if (columnSpec.includes(',')) {
      const columns = columnSpec.split(',').map(c => c.trim()).map(c => parseColumnSpec(c));
      return {
        type: 'columnFilter',
        filterColumns: columns,
      };
    }
    
    // ::b 형식 (단일)
    return {
      type: 'columnFilter',
      filterColumn: parseColumnSpec(columnSpec),
    };
  }

  // :a:b 형식 (행:열)
  if (trimmed.startsWith(':')) {
    const parts = trimmed.substring(1).split(':');
    
    if (parts.length === 1) {
      // :number, :number1-number2, 또는 :1,2,3
      const rowSpec = parts[0].trim();
      
      // :1,2,3 형식 (행 리스트)
      if (rowSpec.includes(',')) {
        const rowIndices = rowSpec.split(',').map(r => r.trim()).map(r => {
          const num = parseInt(r, 10);
          return isNaN(num) ? -1 : num - 1; // 0-based
        }).filter(r => r >= 0);
        
        if (rowIndices.length > 0) {
          return {
            type: 'rowList',
            rowIndices,
          };
        }
      }
      
      // :number1-number2 형식 (행 범위)
      const rangeMatch = rowSpec.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        return {
          type: 'rowRange',
          rowStart: parseInt(rangeMatch[1], 10) - 1, // 0-based
          rowEnd: parseInt(rangeMatch[2], 10) - 1,
        };
      }
      
      // :number 형식 (단일 행)
      const rowIndex = parseInt(rowSpec, 10);
      if (!isNaN(rowIndex)) {
        return {
          type: 'row',
          rowIndex: rowIndex - 1, // 0-based
        };
      }
    } else if (parts.length === 2) {
      const rowSpec = parts[0].trim();
      const colSpec = parts[1].trim();
      const rowIndex = parseInt(rowSpec, 10);
      
      if (!isNaN(rowIndex)) {
        // :a:b-c 형식 (행:열범위)
        const rangeMatch = colSpec.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          return {
            type: 'cellRange',
            cellRow: rowIndex - 1, // 0-based
            cellStartColumn: parseInt(rangeMatch[1], 10) - 1,
            cellEndColumn: parseInt(rangeMatch[2], 10) - 1,
          };
        }
        
        // :a:b,c,d 형식 (행:열리스트)
        if (colSpec.includes(',')) {
          const columns = colSpec.split(',').map(c => c.trim()).map(c => parseColumnSpec(c));
          return {
            type: 'cellList',
            cellRow: rowIndex - 1, // 0-based
            cellColumns: columns,
          };
        }
        
        // :a:b 형식 (행:열)
        return {
          type: 'cell',
          cellRow: rowIndex - 1, // 0-based
          cellColumn: parseColumnSpec(colSpec),
        };
      }
    }
  }

  // column=value 형식 (정확한 일치) - 먼저 처리
  const columnMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*=\s*(.+)$/);
  if (columnMatch) {
    return {
      type: 'column',
      columnName: columnMatch[1],
      text: columnMatch[2],
    };
  }

  // & 또는 | 연산자 지원
  const hasAnd = trimmed.includes('&');
  const hasOr = trimmed.includes('|');
  const logicalOp = hasAnd ? '&' as const : (hasOr ? '|' as const : undefined);
  
  if (hasAnd || hasOr) {
    const separator = hasAnd ? '&' : '|';
    const parts = trimmed.split(separator);
    const numericComparisons: ParsedQuery['comparisons'] = [];
    const stringComparisons: ParsedQuery['stringComparisons'] = [];
    
    for (const part of parts) {
      const comp = parseComparison(part.trim());
      if (comp) {
        if (comp.isNumeric) {
          numericComparisons.push({
            column: comp.column,
            operator: comp.operator,
            value: comp.value as number,
            isNumeric: true,
          });
        } else {
          stringComparisons.push({
            column: comp.column,
            operator: comp.operator,
            value: comp.value as string,
            isNumeric: false,
          });
        }
      }
    }
    
    if (numericComparisons.length > 0 || stringComparisons.length > 0) {
      // 숫자 비교와 문자열 비교가 혼합된 경우도 처리
      if (numericComparisons.length > 0 && stringComparisons.length > 0) {
        // 혼합 타입 - 두 가지 모두 반환 (둘 다 처리 필요)
        return {
          type: 'comparison',
          comparisons: numericComparisons,
          stringComparisons,
          logicalOperator: logicalOp,
        };
      } else if (numericComparisons.length > 0) {
        return {
          type: 'comparison',
          comparisons: numericComparisons,
          logicalOperator: logicalOp,
        };
      } else {
        return {
          type: 'stringComparison',
          stringComparisons,
          logicalOperator: logicalOp,
        };
      }
    }
  } else {
    // 단일 비교 연산자 (= 제외, 이미 위에서 처리됨)
    const comp = parseComparison(trimmed);
    if (comp) {
      if (comp.isNumeric) {
        return {
          type: 'comparison',
          comparisons: [{
            column: comp.column,
            operator: comp.operator,
            value: comp.value as number,
            isNumeric: true,
          }],
        };
      } else {
        return {
          type: 'stringComparison',
          stringComparisons: [{
            column: comp.column,
            operator: comp.operator,
            value: comp.value as string,
            isNumeric: false,
          }],
        };
      }
    }
  }

  // 일반 텍스트 검색
  return {
    type: 'normal',
    text: trimmed,
  };
}

function parseComparison(str: string): { column: string; operator: '>' | '>=' | '<' | '<=' | '!=' | '='; value: number | string; isNumeric: boolean } | null {
  // column>number, column>=number, column<number, column<=number, column!=number, column>str
  // = 연산자는 숫자 비교가 아니므로 제외 (column=str은 이미 위에서 처리됨)
  const patterns = [
    { regex: /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*>=\s*(.+)$/, operator: '>=' as const },
    { regex: /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*<=\s*(.+)$/, operator: '<=' as const },
    { regex: /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*!=\s*(.+)$/, operator: '!=' as const },
    { regex: /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*>\s*(.+)$/, operator: '>' as const },
    { regex: /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*<\s*(.+)$/, operator: '<' as const },
  ];

  for (const pattern of patterns) {
    const match = str.match(pattern.regex);
    if (match) {
      const column = match[1];
      const valueStr = match[2].trim();
      const numValue = parseFloat(valueStr);
      
      // 숫자로 파싱 가능하면 숫자 비교, 아니면 문자열 포함 검색
      if (!isNaN(numValue) && valueStr === numValue.toString()) {
        return {
          column,
          operator: pattern.operator,
          value: numValue,
          isNumeric: true,
        };
      } else {
        // 문자열 포함 검색 (>, >=, <, <=, !=)
        return {
          column,
          operator: pattern.operator,
          value: valueStr,
          isNumeric: false,
        };
      }
    }
  }

  return null;
}

function parseColumnSpec(spec: string): string | number {
  // 숫자면 인덱스로, 아니면 열 이름으로
  const num = parseInt(spec, 10);
  return isNaN(num) ? spec : num - 1; // 0-based
}

