/**
 * 안전한 JavaScript 함수 실행 유틸리티
 * 보안을 위해 위험한 키워드와 패턴을 필터링합니다.
 */

const DANGEROUS_PATTERNS = [
  /\bimport\s+/,
  /\brequire\s*\(/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\blocation\b/,
  /\bnavigator\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bconstructor\b/,
  /\b__proto__\b/,
  /\bprototype\b/,
  /\bsetTimeout\s*\(/,
  /\bsetInterval\s*\(/,
  /\bprocess\b/,
  /\bglobal\b/,
  /\bthis\b/,
  /\balert\b/,
  /\bconfirm\b/,
  /\bprompt\b/,
  /\bopen\b/,
  /\bclose\b/,
  /\bwrite\b/,
  /\bwriteln\b/,
  /\bprint\b/,
  /\bprintln\b/,
  /\bconsole\b/,
  /\bprint\b/,
];

const MAX_EXECUTION_TIME = 1000; // 1초

export const DELETE_MARKER = Symbol('DELETE_ROW');
export const ARRAY_DELETE_INDEXES = Symbol('ARRAY_DELETE_INDEXES');

export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  isDelete?: boolean; // 단일 값 모드에서 행 삭제 표시
  deletedIndexes?: number[]; // 배열 모드에서 삭제된 인덱스
}

export type TransformMode = 'single' | 'array';

export interface TransformOptions {
  mode: TransformMode;
  columns?: string[];
  rowData?: Record<string, any>; // 단일 값 변환에서 같은 행의 다른 열 값을 가져오기 위해
  singleVariableName?: string;
  arrayVariableName?: string;
}

function getValidIdentifier(name: string | undefined, fallback: string): string {
  if (!name) return fallback;
  const trimmed = name.trim();
  if (!trimmed) return fallback;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed) ? trimmed : fallback;
}

/**
 * 코드를 정규화 (return 자동 추가)
 */
function normalizeCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return trimmed;

  // return void; → return void 0;
  const voidAdjusted = trimmed.replace(/return\s+void\s*;/g, 'return void 0;');

  // 세미콜론으로 구분된 줄 수 확인
  const lines = voidAdjusted.split(';').filter(line => line.trim().length > 0);
  const hasMultipleStatements = lines.length > 1;
  const hasReturn = /\breturn\b/.test(voidAdjusted);
  const hasControlFlow = /\b(if|while|for|switch)\s*\(/.test(voidAdjusted);

  // 여러 줄이거나 제어문이 있으면 return 필요
  if (hasMultipleStatements || hasControlFlow) {
    if (!hasReturn) {
      // 마지막 줄에 return 추가
      const lastLine = lines[lines.length - 1].trim();
      if (lastLine && !lastLine.startsWith('return')) {
        lines[lines.length - 1] = `return ${lastLine}`;
        return lines.join(';');
      }
    }
  }

  // 한 줄이고 return이 없으면 자동 추가
  if (!hasReturn && lines.length === 1) {
    return `return ${voidAdjusted}`;
  }

  return voidAdjusted;
}

/**
 * 함수 코드가 안전한지 검증
 */
function isSafeCode(code: string): { safe: boolean; reason?: string } {
  const trimmed = code.trim();
  
  // 빈 코드 체크
  if (!trimmed) {
    return { safe: false, reason: '코드가 비어있습니다.' };
  }

  // 위험한 패턴 체크
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: '허용되지 않은 키워드나 함수가 포함되어 있습니다.' };
    }
  }

  return { safe: true };
}

/**
 * 값의 타입을 유지하면서 변환
 */
function preserveType(originalValue: any, newValue: any): any {
  if (originalValue === null || originalValue === undefined) {
    return newValue;
  }

  const originalType = typeof originalValue;
  
  // 원본이 숫자인 경우
  if (originalType === 'number') {
    const num = Number(newValue);
    return isNaN(num) ? newValue : num;
  }

  // 원본이 불린인 경우
  if (originalType === 'boolean') {
    if (typeof newValue === 'boolean') return newValue;
    if (newValue === 'true' || newValue === 1) return true;
    if (newValue === 'false' || newValue === 0) return false;
    return Boolean(newValue);
  }

  // 원본이 객체나 배열인 경우
  if (originalType === 'object') {
    if (Array.isArray(originalValue) && Array.isArray(newValue)) {
      return newValue;
    }
    if (typeof newValue === 'object' && newValue !== null) {
      return newValue;
    }
    // 객체를 문자열로 변환하려는 경우
    try {
      return JSON.parse(String(newValue));
    } catch {
      return String(newValue);
    }
  }

  return newValue;
}

interface ColumnReferenceToken {
  start: number;
  end: number;
  identifier: string;
}

interface ColumnResolution {
  columnKey: string;
  remainder: string;
}

function extractColumnReferenceTokens(code: string): ColumnReferenceToken[] {
  const tokens: ColumnReferenceToken[] = [];
  const templateStack: Array<{ braceDepthStack: number[] }> = [];
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let index = 0;

  while (index < code.length) {
    const char = code[index];
    const next = code[index + 1];
    const currentTemplate = templateStack[templateStack.length - 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (inSingleQuote) {
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === '\'') {
        inSingleQuote = false;
      }
      index += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === '"') {
        inDoubleQuote = false;
      }
      index += 1;
      continue;
    }

    if (currentTemplate && currentTemplate.braceDepthStack.length === 0) {
      if (char === '`') {
        templateStack.pop();
        index += 1;
        continue;
      }
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === '$' && next === '{') {
        currentTemplate.braceDepthStack.push(0);
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (currentTemplate && currentTemplate.braceDepthStack.length > 0) {
      if (char === '{') {
        currentTemplate.braceDepthStack[currentTemplate.braceDepthStack.length - 1] += 1;
        index += 1;
        continue;
      }
      if (char === '}') {
        const depthIndex = currentTemplate.braceDepthStack.length - 1;
        if (currentTemplate.braceDepthStack[depthIndex] === 0) {
          currentTemplate.braceDepthStack.pop();
        } else {
          currentTemplate.braceDepthStack[depthIndex] -= 1;
        }
        index += 1;
        continue;
      }
      if (char === '$' && next === '{') {
        currentTemplate.braceDepthStack.push(0);
        index += 2;
        continue;
      }
    }

    if (char === '`') {
      templateStack.push({ braceDepthStack: [] });
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 2;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 2;
      continue;
    }

    if (char === '\'') {
      inSingleQuote = true;
      index += 1;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }

    if (char === '$' && next && /[A-Za-z_]/.test(next)) {
      let end = index + 2;
      while (end < code.length && /[A-Za-z0-9_.]/.test(code[end])) {
        end += 1;
      }
      const identifier = code.slice(index + 1, end);
      tokens.push({ start: index, end, identifier });
      index = end;
      continue;
    }

    index += 1;
  }

  return tokens;
}

function resolveColumnReference(
  reference: string,
  availableColumns: Set<string>
): ColumnResolution | null {
  if (availableColumns.has(reference)) {
    return { columnKey: reference, remainder: '' };
  }

  const segments = reference.split('.');
  for (let i = segments.length - 1; i >= 1; i -= 1) {
    const candidate = segments.slice(0, i).join('.');
    if (availableColumns.has(candidate)) {
      const remainderSegments = segments.slice(i);
      const remainder = remainderSegments.length > 0 ? `.${remainderSegments.join('.')}` : '';
      return { columnKey: candidate, remainder };
    }
  }

  return null;
}

interface ProcessedCodeResult {
  code: string;
  hasColumnReference: boolean;
  error?: string;
}

function processColumnReferences(
  code: string,
  rowData: Record<string, unknown>
): ProcessedCodeResult {
  const tokens = extractColumnReferenceTokens(code);
  if (tokens.length === 0) {
    return {
      code,
      hasColumnReference: false,
    };
  }

  const availableColumns = new Set(Object.keys(rowData));
  const parts: string[] = [];
  let lastIndex = 0;

  for (const token of tokens) {
    const resolved = resolveColumnReference(token.identifier, availableColumns);
    if (!resolved) {
      return {
        code,
        hasColumnReference: false,
        error: `${token.identifier} 열을 찾을 수 없습니다`,
      };
    }
    parts.push(code.slice(lastIndex, token.start));
    parts.push(
      `__accessColumn(${JSON.stringify(resolved.columnKey)})${resolved.remainder}`
    );
    lastIndex = token.end;
  }

  parts.push(code.slice(lastIndex));

  return {
    code: parts.join(''),
    hasColumnReference: true,
  };
}

const COLUMN_ACCESSOR_PREAMBLE = `
const __accessColumn = (columnKey) => {
  if (!Object.prototype.hasOwnProperty.call(__rowData, columnKey)) {
    __missingColumn(columnKey);
  }
  return __rowData[columnKey];
};
`;

/**
 * 안전하게 함수를 실행 (비동기, 타임아웃 지원)
 * @param code 함수 본문 (예: "return value * 2")
 * @param value 입력 값
 * @param originalValue 원본 값 (타입 보존용)
 */
export function executeFunction(
  code: string,
  value: any,
  originalValue?: any
): Promise<ExecutionResult> {
  // 안전성 검증
  const safetyCheck = isSafeCode(code);
  if (!safetyCheck.safe) {
    return Promise.resolve({
      success: false,
      error: safetyCheck.reason || '코드가 안전하지 않습니다.',
    });
  }

  // 타임아웃을 위한 Promise 래퍼
  const executionPromise = new Promise<ExecutionResult>((resolve) => {
    try {
      // Function 생성자 사용 (eval보다 안전)
      const func = new Function('a', code);
      
      // 실행
      const result = func(value);
      
      // 타입 보존
      const preserved = originalValue !== undefined 
        ? preserveType(originalValue, result)
        : result;
      
      resolve({
        success: true,
        result: preserved,
      });
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      });
    }
  });

  // 타임아웃 설정
  const timeoutPromise = new Promise<ExecutionResult>((resolve) => {
    setTimeout(() => {
      resolve({
        success: false,
        error: '실행 시간이 초과되었습니다.',
      });
    }, MAX_EXECUTION_TIME);
  });

  // Promise.race로 타임아웃 처리
  return Promise.race([executionPromise, timeoutPromise]);
}

/**
 * 배열 변환 모드에서 리턴값 검증
 */
function validateArrayResult(
  result: any,
  columns: string[],
  expectedType: 'array' | 'object-array'
): { valid: boolean; error?: string } {
  if (!Array.isArray(result)) {
    return {
      valid: false,
      error: `리턴값이 배열이 아닙니다. ${expectedType === 'object-array' ? `{${columns.map(c => `${c}: 타입`).join(', ')}}[]` : '타입[]'} 형식으로 주세요.`,
    };
  }

  if (expectedType === 'object-array') {
    // 객체 배열인지 확인
    if (result.length > 0) {
      const firstItem = result[0];
      if (typeof firstItem !== 'object' || firstItem === null || Array.isArray(firstItem)) {
        return {
          valid: false,
          error: `리턴값이 객체 배열이 아닙니다. {${columns.map(c => `${c}: 타입`).join(', ')}}[] 형식으로 주세요.`,
        };
      }

      // 모든 객체에 필요한 열이 있는지 확인
      for (const col of columns) {
        if (!(col in firstItem)) {
          return {
            valid: false,
            error: `리턴값 객체에 '${col}' 속성이 없습니다. {${columns.map(c => `${c}: 타입`).join(', ')}}[] 형식으로 주세요.`,
          };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * 동기적으로 함수 실행 (간단한 변환용)
 */
export function executeFunctionSync(
  code: string,
  value: any,
  originalValue?: any,
  options?: TransformOptions
): ExecutionResult {
  // 코드 정규화 (return 자동 추가)
  const normalizedCode = normalizeCode(code);
  
  const safetyCheck = isSafeCode(normalizedCode);
  if (!safetyCheck.safe) {
    return {
      success: false,
      error: safetyCheck.reason || '코드가 안전하지 않습니다.',
    };
  }

  try {
    const mode = options?.mode || 'single';
    const columns = options?.columns || [];

    if (mode === 'array') {
      // 배열 변환 모드: list 변수 제공
      const list = Array.isArray(value) ? value : [value];
      const arrayVariableName = getValidIdentifier(options?.arrayVariableName, 'list');
      
      // 배열 변환 모드: void나 undefined 반환 시 해당 인덱스 행 삭제
      let processedCode = normalizedCode;
      const deletedIndexes: number[] = [];
      
      const func = new Function(arrayVariableName, processedCode);
      let result = func(list);
      
      // undefined나 void가 포함된 배열인 경우 필터링
      if (Array.isArray(result)) {
        const filtered: any[] = [];
        result.forEach((item, idx) => {
          // undefined나 void인 경우 삭제 (배열 변환에서 void나 undefined 반환 시 해당 행 삭제)
          if (item !== undefined && item !== void 0) {
            filtered.push(item);
          } else {
            // 삭제된 항목은 deletedIndexes에 인덱스로 추가
            deletedIndexes.push(idx);
          }
        });
        result = filtered;
      }
      
      // 리턴값 검증
      const validation = validateArrayResult(
        result,
        columns,
        columns.length > 1 ? 'object-array' : 'array'
      );

      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      return {
        success: true,
        result,
        deletedIndexes: deletedIndexes.length > 0 ? deletedIndexes : undefined,
      };
    } else {
      // 단일 값 변환 모드
      // $column-name 형식을 실제 값으로 치환
      const rowData = (options?.rowData || {}) as Record<string, unknown>;
      const columnProcessing = processColumnReferences(normalizedCode, rowData);
      if (columnProcessing.error) {
        return {
          success: false,
          error: columnProcessing.error,
        };
      }

      let processedCode = columnProcessing.code;
      if (columnProcessing.hasColumnReference) {
        processedCode = `${COLUMN_ACCESSOR_PREAMBLE}\n${processedCode}`;
      }
      
      // 단일 값 변환 모드: return; (명시적으로 undefined 반환) 시 행 삭제
      // return이 없으면 기존값 유지
      let finalCode = processedCode;
      
      // return 키워드가 있는지 확인 (명시적 반환 여부)
      const hasExplicitReturn = /\breturn\b/.test(finalCode);
      
      const singleVariableName = getValidIdentifier(options?.singleVariableName, 'a');
      const missingColumnHandler = (columnKey: string): never => {
        throw new Error(`${columnKey} 열을 찾을 수 없습니다`);
      };
      const func = new Function(singleVariableName, '__rowData', '__missingColumn', finalCode);
      const result = func(value, rowData, missingColumnHandler);
      
      // 명시적으로 return이 있고 결과가 undefined면 행 삭제
      // (return; 또는 return undefined; 같은 경우)
      if (hasExplicitReturn && result === undefined) {
        return {
          success: true,
          result: DELETE_MARKER,
          isDelete: true,
        };
      }
      
      // return이 없고 결과가 undefined면 기존값 유지
      if (!hasExplicitReturn && result === undefined) {
        return {
          success: true,
          result: originalValue,
        };
      }
      
      const preserved = originalValue !== undefined 
        ? preserveType(originalValue, result)
        : result;
      
      return {
        success: true,
        result: preserved,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '실행 중 오류가 발생했습니다.',
    };
  }
}

