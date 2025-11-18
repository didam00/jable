/**
 * 검색 쿼리 파서
 * 특수 검색 문법 지원
 */

export type RowSelection =
  | { kind: 'single'; index: number }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'list'; indices: number[] };

export type ColumnSelection =
  | { kind: 'single'; value: string | number }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'list'; values: Array<string | number> };

export type NumericComparison = {
  column: string;
  operator: '>' | '>=' | '<' | '<=' | '=' | '!=';
  value: number;
  isNumeric: true;
};

export type StringComparison = {
  column: string;
  operator: '>' | '>=' | '<' | '<=' | '=' | '!=' | '!>' | '^=' | '$=' | '*=';
  value: string;
  isNumeric: false;
  negated?: boolean;
};

export interface ParsedQuery {
  type: 'normal' | 'column' | 'columnPresence' | 'comparison' | 'stringComparison' | 'row' | 'rowRange' | 'rowList' | 'cell' | 'cellRange' | 'cellList' | 'columnFilter' | 'rowColumn' | 'logicalGroup';
  // normal 검색
  text?: string;
  // column=key 검색 (정확한 일치)
  columnName?: string;
  // column^=value, column$=value, column*=value 검색
  columnAttributeSearch?: {
    columnName: string;
    operator: '^=' | '$=' | '*=' | '=';
    value: string;
    negated: boolean;
  };
  // column= (missing) / column!= (exists)
  presenceCheck?: 'missing' | 'exists';
  // column>number, column>=number 등 (숫자 비교)
  comparisons?: NumericComparison[];
  // column>str 등 (문자열 포함)
  stringComparisons?: StringComparison[];
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
  // 행+열 복합 필터링
  rowSelection?: RowSelection;
  columnSelection?: ColumnSelection;
  // ::b 열 필터링 (단일)
  filterColumn?: string | number;
  // ::b-c 열 범위 필터링
  filterColumnStart?: number;
  filterColumnEnd?: number;
  // ::b,c,d 열 리스트 필터링
  filterColumns?: Array<string | number>;
  // 논리 그룹 (AND / OR)
  groupOperator?: '&' | '|';
  subQueries?: ParsedQuery[];
}

export function parseQuery(query: string): ParsedQuery {
  const trimmed = query.trim();
  
  if (!trimmed) {
    return { type: 'normal', text: '' };
  }

  // & 또는 | 기준 논리 그룹 (문자열 리터럴 안의 & / | 는 무시)
  const andParts = splitQueryByOperator(trimmed, '&');
  if (andParts) {
    return {
      type: 'logicalGroup',
      groupOperator: '&',
      subQueries: andParts.map(part => parseQuery(part)),
    };
  }

  const orParts = splitQueryByOperator(trimmed, '|');
  if (orParts) {
    return {
      type: 'logicalGroup',
      groupOperator: '|',
      subQueries: orParts.map(part => parseQuery(part)),
    };
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
      const rowSelection = parseRowSelection(rowSpec);
      const columnSelection = parseColumnSelection(colSpec);
      
      if (rowSelection && columnSelection) {
        if (rowSelection.kind === 'single') {
          const rowIndex = rowSelection.index;
          // :a:b-c 형식 (행:열범위)
          if (columnSelection.kind === 'range') {
            return {
              type: 'cellRange',
              cellRow: rowIndex,
              cellStartColumn: columnSelection.start,
              cellEndColumn: columnSelection.end,
            };
          }
          
          if (columnSelection.kind === 'list') {
            return {
              type: 'cellList',
              cellRow: rowIndex,
              cellColumns: columnSelection.values,
            };
          }
          
          return {
            type: 'cell',
            cellRow: rowIndex,
            cellColumn: columnSelection.value,
          };
        }
        
        return {
          type: 'rowColumn',
          rowSelection,
          columnSelection,
        };
      }
    }
  }

  // column= (missing 값)
  const missingMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*=\s*$/);
  if (missingMatch) {
    return {
      type: 'columnPresence',
      columnName: missingMatch[1],
      presenceCheck: 'missing',
    };
  }

  // column!= (존재 여부)
  const existsMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*!=\s*$/);
  if (existsMatch) {
    return {
      type: 'columnPresence',
      columnName: existsMatch[1],
      presenceCheck: 'exists',
    };
  }

  // !column^=value, !column$=value, !column*=value, !column=value 형식 (부정 속성 검색)
  const negatedAttributeMatch = trimmed.match(/^!\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*(\^=|\$=|\*=|=)\s*(.+)$/);
  if (negatedAttributeMatch) {
    const parsedValue = parseValueLiteral(negatedAttributeMatch[3]);
    return {
      type: 'column',
      columnAttributeSearch: {
        columnName: negatedAttributeMatch[1],
        operator: negatedAttributeMatch[2] as '^=' | '$=' | '*=' | '=',
        value: parsedValue.value,
        negated: true,
      },
    };
  }

  // column^=value, column$=value, column*=value 형식 (속성 검색)
  const attributeMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(\^=|\$=|\*=)\s*(.+)$/);
  if (attributeMatch) {
    const parsedValue = parseValueLiteral(attributeMatch[3]);
    return {
      type: 'column',
      columnAttributeSearch: {
        columnName: attributeMatch[1],
        operator: attributeMatch[2] as '^=' | '$=' | '*=',
        value: parsedValue.value,
        negated: false,
      },
    };
  }

  // column=value 형식 (정확한 일치) - 먼저 처리
  const columnMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*=\s*(.+)$/);
  if (columnMatch) {
    const parsedValue = parseValueLiteral(columnMatch[2]);
    return {
      type: 'column',
      columnName: columnMatch[1],
      text: parsedValue.value,
    };
  }

  // 단일 비교 연산자 (= 제외, 이미 위에서 처리됨)
  const comp = parseComparison(trimmed);
  if (comp) {
    if (comp.isNumeric) {
      return {
        type: 'comparison',
        comparisons: [{
          column: comp.column,
          operator: comp.operator,
          value: comp.value,
          isNumeric: true,
        }],
      };
    }
    return {
      type: 'stringComparison',
      stringComparisons: [{
        column: comp.column,
        operator: comp.operator,
        value: comp.value,
        isNumeric: false,
      }],
    };
  }

  // 일반 텍스트 검색
  return {
    type: 'normal',
    text: trimmed,
  };
}

function parseComparison(str: string): NumericComparison | StringComparison | null {
  // column>number, column>=number, column<number, column<=number, column!=number, column>str
  // = 연산자는 숫자 비교가 아니므로 제외 (column=str은 이미 위에서 처리됨)
  const patterns = [
    { regex: /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*!>\s*(.+)$/, operator: '!>' as const },
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
      const parsedValue = parseValueLiteral(match[2]);
      const valueStr = parsedValue.value.trim();
      const numValue = parsedValue.wasQuoted ? NaN : parseFloat(valueStr);
      
      if (pattern.operator === '!>') {
        return {
          column,
          operator: pattern.operator,
          value: valueStr,
          isNumeric: false,
        };
      }
      
      // 숫자로 파싱 가능하면 숫자 비교, 아니면 문자열 포함 검색
      if (!isNaN(numValue) && valueStr === numValue.toString()) {
        return {
          column,
          operator: pattern.operator,
          value: numValue,
          isNumeric: true,
        };
      }
      
      // 문자열 포함 검색 (>, >=, <, <=, !=)
      return {
        column,
        operator: pattern.operator,
        value: valueStr,
        isNumeric: false,
      };
    }
  }

  return null;
}

function parseColumnSpec(spec: string): string | number {
  // 숫자면 인덱스로, 아니면 열 이름으로
  const num = parseInt(spec, 10);
  return isNaN(num) ? spec : num - 1; // 0-based
}

function parseRowSelection(rowSpec: string): RowSelection | null {
  const trimmed = rowSpec.trim();
  
  // 리스트
  if (trimmed.includes(',')) {
    const indices = trimmed
      .split(',')
      .map(value => parseInt(value.trim(), 10) - 1)
      .filter(index => !isNaN(index) && index >= 0);
    if (indices.length > 0) {
      return { kind: 'list', indices };
    }
  }
  
  // 범위
  const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    return {
      kind: 'range',
      start: parseInt(rangeMatch[1], 10) - 1,
      end: parseInt(rangeMatch[2], 10) - 1,
    };
  }
  
  const rowIndex = parseInt(trimmed, 10);
  if (!isNaN(rowIndex)) {
    return { kind: 'single', index: rowIndex - 1 };
  }
  
  return null;
}

function parseColumnSelection(colSpec: string): ColumnSelection | null {
  const trimmed = colSpec.trim();
  
  if (trimmed.includes(',')) {
    const values = trimmed
      .split(',')
      .map(value => parseColumnSpec(value.trim()));
    return { kind: 'list', values };
  }
  
  const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    return {
      kind: 'range',
      start: parseInt(rangeMatch[1], 10) - 1,
      end: parseInt(rangeMatch[2], 10) - 1,
    };
  }
  
  const singleValue = parseColumnSpec(trimmed);
  return { kind: 'single', value: singleValue };
}

function splitQueryByOperator(input: string, operator: '&' | '|'): string[] | null {
  if (!input.includes(operator)) {
    return null;
  }

  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;
  let usedOperator = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (inQuotes && char === '\\') {
      current += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (!inQuotes && char === operator) {
      if (current.trim().length > 0) {
        parts.push(current.trim());
      }
      current = '';
      usedOperator = true;
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    return null;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return usedOperator && parts.length > 1 ? parts : null;
}

function parseValueLiteral(raw: string): { value: string; wasQuoted: boolean } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('"')) {
    return { value: trimmed, wasQuoted: false };
  }

  let result = '';
  let escaped = false;
  for (let i = 1; i < trimmed.length; i += 1) {
    const char = trimmed[i];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      const remainder = trimmed.slice(i + 1).trim();
      if (remainder.length === 0) {
        return { value: result, wasQuoted: true };
      }
      break;
    }

    result += char;
  }

  return { value: trimmed, wasQuoted: false };
}

