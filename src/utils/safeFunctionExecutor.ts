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
}

/**
 * 코드를 정규화 (return 자동 추가)
 */
function normalizeCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return trimmed;

  // 세미콜론으로 구분된 줄 수 확인
  const lines = trimmed.split(';').filter(line => line.trim().length > 0);
  const hasMultipleStatements = lines.length > 1;
  const hasReturn = /\breturn\b/.test(trimmed);
  const hasControlFlow = /\b(if|while|for|switch)\s*\(/.test(trimmed);

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
    return `return ${trimmed}`;
  }

  return trimmed;
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
      
      // 배열 변환 모드: void나 undefined 반환 시 해당 인덱스 행 삭제
      let processedCode = normalizedCode;
      const deletedIndexes: number[] = [];
      
      const func = new Function('list', processedCode);
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
      let processedCode = normalizedCode;
      const rowData = options?.rowData || {};
      
      // $column-name 패턴 찾기 및 치환 (식별자: 영문자, 숫자, 언더스코어, 점)
      const columnRefPattern = /\$([a-zA-Z_][a-zA-Z0-9_\.]*)/g;
      const columnRefs = new Set<string>();
      let match;
      while ((match = columnRefPattern.exec(normalizedCode)) !== null) {
        columnRefs.add(match[1]);
      }
      
      // 각 열 참조를 실제 값으로 치환
      columnRefs.forEach((colKey) => {
        const refValue = rowData[colKey];
        const refValueStr = refValue === undefined || refValue === null 
          ? 'undefined' 
          : typeof refValue === 'string' 
          ? JSON.stringify(refValue)
          : JSON.stringify(refValue);
        processedCode = processedCode.replace(
          new RegExp(`\\$${colKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
          refValueStr
        );
      });
      
      // 단일 값 변환 모드: return; (명시적으로 undefined 반환) 시 행 삭제
      // return이 없으면 기존값 유지
      let finalCode = processedCode;
      
      // return 키워드가 있는지 확인 (명시적 반환 여부)
      const hasExplicitReturn = /\breturn\b/.test(finalCode);
      
      const func = new Function('a', finalCode);
      const result = func(value);
      
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

