/**
 * 스트리밍 파서 - 대용량 파일 처리를 위한 스트리밍 파서
 */
import Papa from 'papaparse';
import type { TableData, Column, Row, Cell } from '../store/types';
import type { ProgressCallback, ProgressDetails } from './parser';

const CHUNK_SIZE = 64 * 1024; // 64KB 청크 크기

/**
 * JSON 스트리밍 파서 - 배열 형태의 JSON만 지원
 */
export async function parseJSONStreaming(
  file: File | ReadableStream<Uint8Array> | Uint8Array,
  onProgress?: ProgressCallback
): Promise<TableData> {
  onProgress?.(5, 'JSON 스트리밍 파싱 준비 중...');
  console.log('[parseJSONStreaming] 시작', { fileType: file instanceof File ? 'File' : file instanceof ReadableStream ? 'ReadableStream' : 'Uint8Array' });
  
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let buffer: Uint8Array | null = null;
  let decoder: TextDecoder;
  let totalSize: number;
  
  // 입력 타입에 따라 처리
  if (file instanceof File) {
    totalSize = file.size;
    const stream = file.stream();
    reader = stream.getReader();
    decoder = new TextDecoder('utf-8');
  } else if (file instanceof ReadableStream) {
    reader = file.getReader();
    decoder = new TextDecoder('utf-8');
    totalSize = 0; // 알 수 없음
  } else if (file instanceof Uint8Array) {
    buffer = file;
    totalSize = buffer.length;
    decoder = new TextDecoder('utf-8');
  } else {
    throw new Error('지원하지 않는 파일 형식입니다.');
  }
  
  let textBuffer = '';
  let position = 0;
  let isFirstChunk = true;
  let arrayStartFound = false;
  let braceDepth = 0;
  let inString = false;
  let escapeNext = false;
  let columns: Column[] = [];
  let rows: Row[] = [];
  let currentObject: any = null;
  let objectBuffer = '';
  let rowIndex = 0;
  
  try {
    // 버퍼로 처리
    if (buffer) {
      let offset = 0;
      while (offset < buffer.length) {
        const chunk = buffer.slice(offset, Math.min(offset + CHUNK_SIZE, buffer.length));
        const chunkText = decoder.decode(chunk, { stream: true });
        textBuffer += chunkText;
        
        // JSON 배열 시작 확인
        if (isFirstChunk) {
          // 공백 제거
          const trimmed = textBuffer.trim();
          if (!trimmed.startsWith('[')) {
            throw new Error('스트리밍 파서는 배열 형태의 JSON만 지원합니다.');
          }
          arrayStartFound = true;
          isFirstChunk = false;
        }
        
        // 텍스트 버퍼에서 객체 파싱
        const result = parseChunk(
          textBuffer,
          arrayStartFound,
          columns,
          rows,
          rowIndex,
          onProgress,
          totalSize,
          position
        );
        
        textBuffer = result.remainingText;
        columns = result.columns;
        rows = result.rows;
        rowIndex = result.rowIndex;
        position += chunk.length;
        
        const progress = totalSize > 0 ? Math.min(95, (position / totalSize) * 90 + 5) : 5;
        onProgress?.(progress, `파싱 중: ${rows.length.toLocaleString()}행 처리됨`);
        
        offset += CHUNK_SIZE;
      }
      
      // 마지막 버퍼 처리
      const trimmed = textBuffer.trim();
      if (trimmed.length > 1 && trimmed !== ']' && trimmed !== '] ') {
        const result = parseChunk(
          textBuffer,
          arrayStartFound,
          columns,
          rows,
          rowIndex,
          onProgress,
          totalSize,
          position
        );
        rows = result.rows;
      }
    } else if (reader) {
      // 스트림으로 처리
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunkText = decoder.decode(value, { stream: true });
        textBuffer += chunkText;
        position += value.length;
        
        // JSON 배열 시작 확인
        if (isFirstChunk) {
          const trimmed = textBuffer.trim();
          if (!trimmed.startsWith('[')) {
            throw new Error('스트리밍 파서는 배열 형태의 JSON만 지원합니다.');
          }
          arrayStartFound = true;
          isFirstChunk = false;
        }
        
        // 텍스트 버퍼에서 객체 파싱
        const result = parseChunk(
          textBuffer,
          arrayStartFound,
          columns,
          rows,
          rowIndex,
          onProgress,
          totalSize,
          position
        );
        
        textBuffer = result.remainingText;
        columns = result.columns;
        rows = result.rows;
        rowIndex = result.rowIndex;
        
        const progress = totalSize > 0 ? Math.min(95, (position / totalSize) * 90 + 5) : 5;
        onProgress?.(progress, `파싱 중: ${rows.length.toLocaleString()}행 처리됨`);
      }
      
      // 마지막 버퍼 처리
      const trimmed = textBuffer.trim();
      if (trimmed.length > 1 && trimmed !== ']' && trimmed !== '] ') {
        const result = parseChunk(
          textBuffer,
          arrayStartFound,
          columns,
          rows,
          rowIndex,
          onProgress,
          totalSize,
          position
        );
        rows = result.rows;
      }
    }
    
    onProgress?.(98, '데이터 정리 중...');
    
    // 컬럼이 없으면 첫 번째 행에서 추출
    if (columns.length === 0 && rows.length > 0) {
      const firstRow = rows[0];
      columns = Object.keys(firstRow.cells).map((key) => ({
        key,
        label: key,
        type: firstRow.cells[key].type || 'string',
      }));
    }
    
    const result: TableData = {
      columns,
      rows,
      metadata: {
        rowCount: rows.length,
        columnCount: columns.length,
        isFlat: true,
      },
    };
    
    onProgress?.(100, '완료');
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[parseJSONStreaming] 파싱 실패:', errorMessage, error);
    throw new Error(`JSON 스트리밍 파싱 실패: ${errorMessage}`);
  } finally {
    if (reader) {
      try {
        reader.releaseLock();
      } catch (e) {
        // 이미 해제된 경우 무시
      }
    }
  }
}

function parseChunk(
  textBuffer: string,
  arrayStartFound: boolean,
  currentColumns: Column[],
  currentRows: Row[],
  currentRowIndex: number,
  onProgress?: ProgressCallback,
  totalSize: number = 0,
  position: number = 0
): { remainingText: string; columns: Column[]; rows: Row[]; rowIndex: number } {
  let remaining = textBuffer;
  const columns = [...currentColumns];
  const rows = [...currentRows];
  let rowIndex = currentRowIndex;
  
  if (!arrayStartFound) {
    return { remainingText: remaining, columns, rows, rowIndex };
  }
  
  // 배열의 시작 '[' 제거
  if (remaining.trim().startsWith('[')) {
    remaining = remaining.substring(remaining.indexOf('[') + 1).trim();
  }
  
  // 객체 파싱 시도
  while (remaining.length > 0) {
    // 쉼표나 닫는 대괄호 찾기
    let objEndIndex = -1;
    let braceDepth = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < remaining.length; i++) {
      const char = remaining[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) {
        continue;
      }
      
      if (char === '{') {
        braceDepth++;
      } else if (char === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          // 객체 끝 찾음
          objEndIndex = i + 1;
          
          // 다음 문자가 쉼표인지 확인
          const nextPart = remaining.substring(objEndIndex).trim();
          if (nextPart.startsWith(',')) {
            objEndIndex += nextPart.indexOf(',') + 1;
          } else if (nextPart.startsWith(']')) {
            // 배열 끝
            objEndIndex = remaining.length;
          }
          break;
        }
      }
    }
    
    if (objEndIndex === -1) {
      // 완전한 객체를 찾지 못함 - 다음 청크 대기
      break;
    }
    
    // 객체 추출 및 파싱
    let objText = remaining.substring(0, objEndIndex).trim();
    if (objText.endsWith(',')) {
      objText = objText.slice(0, -1).trim();
    }
    
    if (objText.length > 0 && objText.startsWith('{')) {
      try {
        const obj = JSON.parse(objText);
        
        // 첫 번째 객체에서 컬럼 추출
        if (columns.length === 0) {
          columns.push(...extractColumnsFromObject(obj));
        }
        
        // 행 생성
        const cells: Record<string, Cell> = {};
        columns.forEach((col) => {
          const value = getNestedValue(obj, col.key);
          cells[col.key] = {
            value,
            type: inferType(value),
          };
        });
        
        rows.push({
          id: `row_${rowIndex}`,
          cells,
        });
        
        rowIndex++;
      } catch (parseError) {
        // 파싱 실패 - 다음 청크와 합쳐서 다시 시도
        break;
      }
    }
    
    // 처리한 부분 제거
    remaining = remaining.substring(objEndIndex).trim();
    
    // 배열 끝 확인
    if (remaining.startsWith(']')) {
      remaining = '';
      break;
    }
  }
  
  return { remainingText: remaining, columns, rows, rowIndex };
}

function extractColumnsFromObject(obj: any): Column[] {
  if (typeof obj !== 'object' || obj === null) {
    return [];
  }
  
  const columns: Column[] = [];
  const processed = new Set<string>();
  
  function traverse(current: any, prefix: string = '') {
    if (current === null || current === undefined) {
      const key = prefix || '_value';
      if (!processed.has(key)) {
        columns.push({ key, label: key, type: 'null' });
        processed.add(key);
      }
      return;
    }
    
    if (Array.isArray(current)) {
      if (prefix && !processed.has(prefix)) {
        columns.push({ key: prefix, label: prefix, type: 'array' });
        processed.add(prefix);
      }
      const representative = current.find((item) => item && typeof item === 'object' && !Array.isArray(item));
      if (representative) {
        traverse(representative, prefix);
      }
      return;
    }
    
    if (typeof current !== 'object') {
      const key = prefix || '_value';
      if (!processed.has(key)) {
        columns.push({ key, label: key, type: inferType(current) });
        processed.add(key);
      }
      return;
    }
    
    for (const [key, value] of Object.entries(current)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        traverse(value, fullKey);
      } else {
        if (!processed.has(fullKey)) {
          columns.push({ key: fullKey, label: fullKey, type: inferType(value) });
          processed.add(fullKey);
        }
      }
    }
  }
  
  traverse(obj);
  return columns;
}

function getNestedValue(obj: any, path: string): any {
  if (!path) return obj;
  
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    if (Array.isArray(current)) {
      if (current.length > 0) {
        const firstItem = current[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          return firstItem[key];
        }
        return undefined;
      }
      return undefined;
    }
    
    if (typeof current === 'object') {
      return current[key];
    }
    
    return undefined;
  }, obj);
}

function inferType(value: any): Cell['type'] {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'string';
}

/**
 * CSV 스트리밍 파서
 */
export async function parseCSVStreaming(
  file: File | ReadableStream<Uint8Array> | Uint8Array,
  onProgress?: ProgressCallback
): Promise<TableData> {
  onProgress?.(5, 'CSV 스트리밍 파싱 준비 중...');
  
  return new Promise((resolve, reject) => {
    const columns: Column[] = [];
    const rows: Row[] = [];
    let isFirstRow = true;
    let rowIndex = 0;
    let processedRows = 0;
    
    const config: Papa.ParseConfig<string[]> = {
      skipEmptyLines: 'greedy',
      worker: false,
      step: (result) => {
        if (result.errors.length > 0) {
          const firstError = result.errors[0];
          reject(new Error(`${firstError.message} (row ${firstError.row})`));
          return;
        }
        
        const row = result.data;
        if (!row || row.length === 0) {
          return;
        }
        
        if (isFirstRow) {
          // 헤더 처리
          const header = row.map((h) => h?.replace(/^\uFEFF/, '').trim() || '');
          const maxLength = header.length;
          
          // 컬럼 생성
          const usedKeys = new Set<string>();
          header.forEach((raw, index) => {
            const base = raw || `column_${index + 1}`;
            let key = base;
            let counter = 1;
            while (usedKeys.has(key)) {
              key = `${base}_${counter}`;
              counter++;
            }
            usedKeys.add(key);
            columns.push({
              key,
              label: base,
              type: 'string',
            });
          });
          
          isFirstRow = false;
        } else {
          // 데이터 행 처리
          const cells: Record<string, Cell> = {};
          columns.forEach((column, columnIndex) => {
            const rawValue = row[columnIndex] ?? '';
            cells[column.key] = inferCsvCell(rawValue);
          });
          
          rows.push({
            id: `row_${rowIndex}`,
            cells,
          });
          
          rowIndex++;
          processedRows++;
          
          // 진행률 업데이트 (1000행마다)
          if (processedRows % 1000 === 0) {
            onProgress?.(10 + (processedRows / 100000) * 85, `파싱 중: ${processedRows.toLocaleString()}행 처리됨`);
          }
        }
      },
      complete: () => {
        onProgress?.(98, '데이터 정리 중...');
        
        const result: TableData = {
          columns,
          rows,
          metadata: {
            rowCount: rows.length,
            columnCount: columns.length,
            isFlat: true,
          },
        };
        
        onProgress?.(100, '완료');
        resolve(result);
      },
      error: (error) => {
        reject(new Error(`CSV 스트리밍 파싱 실패: ${error.message}`));
      },
    };
    
    // 파일 타입에 따라 처리
    if (file instanceof File) {
      Papa.parse(file, config);
    } else if (file instanceof ReadableStream) {
      const reader = file.getReader();
      const decoder = new TextDecoder('utf-8');
      let textBuffer = '';
      
      reader.read().then(function processChunk({ done, value }) {
        if (done) {
          if (textBuffer) {
            Papa.parse(textBuffer, { ...config, complete: () => {} });
          }
          return;
        }
        
        textBuffer += decoder.decode(value, { stream: true });
        reader.read().then(processChunk);
      });
    } else if (file instanceof Uint8Array) {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(file);
      const sanitized = text.replace(/^\uFEFF/, '');
      Papa.parse(sanitized, config);
    } else {
      reject(new Error('지원하지 않는 파일 형식입니다.'));
    }
  });
}

function inferCsvCell(rawValue: string): Cell {
  const original = rawValue ?? '';
  const trimmed = original.trim();
  if (trimmed.length === 0) {
    return { value: '', type: 'string' };
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'true' || lower === 'false') {
    return { value: lower === 'true', type: 'boolean' };
  }
  if (lower === 'null') {
    return { value: null, type: 'null' };
  }
  if (isNumericValue(trimmed)) {
    return { value: Number(trimmed), type: 'number' };
  }
  return { value: original, type: 'string' };
}

function isNumericValue(value: string): boolean {
  if (!/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(value)) {
    return false;
  }
  if (
    value.startsWith('0') &&
    value.length > 1 &&
    !value.startsWith('0.') &&
    !value.startsWith('0e') &&
    !value.startsWith('0E') &&
    !value.startsWith('-0') &&
    !value.startsWith('+0')
  ) {
    return false;
  }
  return true;
}

/**
 * XML 스트리밍 파서 (SAX 방식)
 */
export async function parseXMLStreaming(
  file: File | ReadableStream<Uint8Array> | Uint8Array,
  onProgress?: ProgressCallback
): Promise<TableData> {
  onProgress?.(5, 'XML 스트리밍 파싱 준비 중...');
  
  // XML 스트리밍은 복잡하므로, 일단 전체를 읽은 후 파싱하되
  // 청크 단위로 처리하도록 최적화
  // 향후 SAX 파서로 개선 가능
  
  let buffer: Uint8Array;
  let totalSize: number;
  
  if (file instanceof File) {
    totalSize = file.size;
    const arrayBuffer = await file.arrayBuffer();
    buffer = new Uint8Array(arrayBuffer);
  } else if (file instanceof ReadableStream) {
    const reader = file.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
    }
    
    const combined = new Uint8Array(loaded);
    let offset = 0;
    chunks.forEach((chunk) => {
      combined.set(chunk, offset);
      offset += chunk.length;
    });
    
    buffer = combined;
    totalSize = buffer.length;
  } else if (file instanceof Uint8Array) {
    buffer = file;
    totalSize = buffer.length;
  } else {
    throw new Error('지원하지 않는 파일 형식입니다.');
  }
  
  onProgress?.(20, 'XML 파싱 중...');
  
  const decoder = new TextDecoder('utf-8');
  const xmlString = decoder.decode(buffer);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  // 파싱 에러 확인
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('XML 파싱 실패: 잘못된 XML 형식입니다.');
  }
  
  const root = xmlDoc.documentElement;
  if (!root) {
    onProgress?.(100, '완료');
    return {
      columns: [],
      rows: [],
      metadata: { rowCount: 0, columnCount: 0, isFlat: true },
    };
  }
  
  // 루트 요소의 자식 요소들을 찾기
  const children = Array.from(root.children);
  if (children.length === 0) {
    // 루트 요소 자체가 데이터인 경우
    onProgress?.(50, '루트 요소 분석 중...');
    const result = convertXMLNodeToTableData(root);
    onProgress?.(100, '완료');
    return result;
  }
  
  onProgress?.(40, `컬럼 추출 중 (${children.length.toLocaleString()}개 요소)...`);
  
  // 첫 번째 자식 요소의 구조를 분석하여 컬럼 추출
  const firstChild = children[0];
  const columns = extractXMLColumns(firstChild);
  
  onProgress?.(50, `컬럼 추출 완료 (${columns.length}개)`);
  
  // 모든 자식 요소를 행으로 변환
  const rows: Row[] = [];
  const totalChildren = children.length;
  const batchSize = Math.max(100, Math.floor(totalChildren / 100));
  
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    const cells: Record<string, Cell> = {};
    columns.forEach((col) => {
      const value = getXMLNodeValue(child, col.key);
      cells[col.key] = {
        value,
        type: inferType(value),
      };
    });
    rows.push({
      id: `row_${index}`,
      cells,
    });
    
    // 진행률 업데이트 (50% ~ 95%)
    if ((index + 1) % batchSize === 0 || index === children.length - 1) {
      const progress = 50 + ((index + 1) / totalChildren) * 45;
      onProgress?.(progress, `행 처리 중: ${(index + 1).toLocaleString()} / ${totalChildren.toLocaleString()}`);
    }
  }
  
  onProgress?.(98, '데이터 정리 중...');
  
  const result = {
    columns,
    rows,
    metadata: {
      rowCount: rows.length,
      columnCount: columns.length,
      isFlat: true,
    },
  };
  
  onProgress?.(100, '완료');
  return result;
}

function convertXMLNodeToTableData(node: Element): TableData {
  const columns: Column[] = [];
  const cells: Record<string, Cell> = {};
  
  // 요소의 속성과 텍스트 내용을 컬럼으로 변환
  Array.from(node.attributes).forEach((attr) => {
    columns.push({
      key: `@${attr.name}`,
      label: `@${attr.name}`,
      type: 'string',
    });
    cells[`@${attr.name}`] = {
      value: attr.value,
      type: 'string',
    };
  });
  
  // 자식 요소들을 컬럼으로 변환
  Array.from(node.children).forEach((child) => {
    const key = child.tagName;
    if (!columns.find((col) => col.key === key)) {
      columns.push({
        key,
        label: key,
        type: inferType(getXMLNodeValue(node, key)),
      });
    }
    cells[key] = {
      value: getXMLNodeValue(node, key),
      type: inferType(getXMLNodeValue(node, key)),
    };
  });
  
  // 텍스트 내용이 있으면 추가
  const textContent = node.textContent?.trim();
  if (textContent && node.children.length === 0) {
    columns.push({
      key: '_text',
      label: '_text',
      type: 'string',
    });
    cells['_text'] = {
      value: textContent,
      type: 'string',
    };
  }
  
  return {
    columns,
    rows: [
      {
        id: 'row_0',
        cells,
      },
    ],
    metadata: {
      rowCount: 1,
      columnCount: columns.length,
      isFlat: true,
    },
  };
}

function extractXMLColumns(node: Element): Column[] {
  const columns: Column[] = [];
  const processed = new Set<string>();
  
  // 속성들을 컬럼으로 추가
  Array.from(node.attributes).forEach((attr) => {
    const key = `@${attr.name}`;
    if (!processed.has(key)) {
      columns.push({
        key,
        label: `@${attr.name}`,
        type: 'string',
      });
      processed.add(key);
    }
  });
  
  // 자식 요소들을 컬럼으로 추가
  Array.from(node.children).forEach((child) => {
    const key = child.tagName;
    if (!processed.has(key)) {
      columns.push({
        key,
        label: key,
        type: inferType(getXMLNodeValue(node, key)),
      });
      processed.add(key);
    }
  });
  
  // 텍스트 내용이 있고 자식이 없으면 추가
  const textContent = node.textContent?.trim();
  if (textContent && node.children.length === 0 && !processed.has('_text')) {
    columns.push({
      key: '_text',
      label: '_text',
      type: 'string',
    });
  }
  
  return columns;
}

function getXMLNodeValue(node: Element, key: string): any {
  // 속성인 경우
  if (key.startsWith('@')) {
    const attrName = key.substring(1);
    return node.getAttribute(attrName) || '';
  }
  
  // 특수 키 _text인 경우
  if (key === '_text') {
    if (node.children.length === 0) {
      return node.textContent?.trim() || '';
    }
    return '';
  }
  
  // 직접 자식 요소 찾기
  const directChildren = Array.from(node.children);
  const child = directChildren.find((c) => c.tagName === key);
  if (child) {
    if (child.children.length === 0) {
      return child.textContent?.trim() || '';
    } else {
      return '';
    }
  }
  
  return '';
}

