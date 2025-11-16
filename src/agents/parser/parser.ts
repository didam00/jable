/**
 * 데이터 파서 Agent - 핵심 파싱 로직
 */
import Papa from 'papaparse';
import type { TableData, Column, Row, Cell } from '../store/types';

export interface ProgressDetails {
  stage: 'loading' | 'parsing' | 'converting' | 'compressing' | 'complete';
  current: number;
  total: number;
  stageProgress: number;
}

export type ProgressCallback = (
  progress: number,
  message: string,
  details?: ProgressDetails
) => void;

export function parseJSON(jsonString: string, onProgress?: ProgressCallback): TableData {
  try {
    onProgress?.(10, 'JSON 파싱 중...');
    
    // JSON 파싱 시도
    let data: any;
    try {
      const trimmed = jsonString.trim();
      // Base64처럼 보이는 문자열이면 경고
      if (trimmed.match(/^[A-Za-z0-9+/=]+$/) && trimmed.length > 100 && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        throw new Error('파일 내용이 Base64로 인코딩된 것 같습니다. .toon 파일 형식일 수 있습니다.');
      }
      data = JSON.parse(trimmed);
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
      throw new Error(`JSON 파싱 실패: ${errorMsg}`);
    }
    
    // 파싱 결과가 문자열이면 에러 (JSON은 객체나 배열이어야 함)
    if (typeof data === 'string') {
      throw new Error('JSON 파싱 결과가 문자열입니다. 유효한 JSON 객체나 배열이 아닙니다.');
    }
    
    onProgress?.(50, '데이터 구조 분석 중...');
    
    // convertToTableData 호출
    let result: TableData;
    try {
      console.log(`[parseJSON] convertToTableData 호출 시작`, { dataType: typeof data, isArray: Array.isArray(data) });
      result = convertToTableData(data, onProgress);
      console.log(`[parseJSON] convertToTableData 성공`, {
        rowsCount: result?.rows?.length,
        columnsCount: result?.columns?.length,
        hasMetadata: !!result?.metadata
      });
    } catch (convertError) {
      // convertToTableData에서 발생한 에러는 JSON 변환 오류로 처리
      const errorMsg = convertError instanceof Error ? convertError.message : 'Unknown error';
      console.error(`[parseJSON] convertToTableData 실패:`, errorMsg);
      throw new Error(`JSON을 테이블 데이터로 변환 실패: ${errorMsg}`);
    }
    
    // 결과 유효성 검사
    console.log(`[parseJSON] 결과 유효성 검사 시작`);
    if (!result || typeof result !== 'object') {
      console.error(`[parseJSON] 결과가 객체가 아님:`, { result, resultType: typeof result });
      throw new Error('JSON을 테이블 데이터로 변환 실패: 결과가 객체가 아닙니다');
    }
    
    if (!result.rows || !Array.isArray(result.rows)) {
      console.error(`[parseJSON] rows 배열이 없거나 유효하지 않음:`, { rows: result.rows, rowsType: typeof result.rows });
      throw new Error('JSON을 테이블 데이터로 변환 실패: rows 배열이 없거나 유효하지 않습니다');
    }
    
    if (!result.columns || !Array.isArray(result.columns)) {
      console.error(`[parseJSON] columns 배열이 없거나 유효하지 않음:`, { columns: result.columns, columnsType: typeof result.columns });
      throw new Error('JSON을 테이블 데이터로 변환 실패: columns 배열이 없거나 유효하지 않습니다');
    }
    
    if (!result.metadata || typeof result.metadata !== 'object') {
      console.error(`[parseJSON] metadata가 없거나 유효하지 않음:`, { metadata: result.metadata, metadataType: typeof result.metadata });
      throw new Error('JSON을 테이블 데이터로 변환 실패: metadata가 없거나 유효하지 않습니다');
    }
    
    console.log(`[parseJSON] 모든 검증 통과`);
    onProgress?.(100, '완료');
    return result;
  } catch (e) {
    console.error(`[parseJSON] 예외 발생:`, {
      error: e,
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined
    });
    
    // .toon 형식 오류는 절대 발생하지 않아야 함 (JSON 파싱이므로)
    // 만약 발생한다면 다른 곳에서 잘못 전달된 것
    if (e instanceof Error && e.message.includes('Invalid .toon format')) {
      // 이 경우는 예상치 못한 상황이므로 원래 에러를 감싸서 전달
      console.error(`[parseJSON] 예상치 못한 .toon 형식 오류 발생!`);
      throw new Error(`JSON 파싱 중 예상치 못한 오류: ${e.message}`);
    }
    // 일반적인 JSON 파싱 오류
    throw e instanceof Error ? e : new Error(`Invalid JSON: ${String(e)}`);
  }
}

export function parseCSV(csvString: string, onProgress?: ProgressCallback): TableData {
  try {
    onProgress?.(5, 'CSV 파싱 준비 중...');
    
    let totalRows = 0;
    let processedRows = 0;
    const rows: Row[] = [];
    let headers: string[] = [];
    let columns: Column[] = [];
    
    Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      step: (result: Papa.ParseStepResult<Record<string, unknown>>) => {
        if (!headers.length && result.meta.fields) {
          headers = result.meta.fields;
          columns = headers.map((header: string, index: number) => ({
            key: header || `col_${index}`,
            label: header || `Column ${index + 1}`,
            type: 'string',
          }));
          onProgress?.(10, 'CSV 헤더 분석 완료');
        }
        
        if (result.data) {
          const item = result.data as Record<string, unknown>;
          const cells: Record<string, Cell> = {};
          headers.forEach((header: string) => {
            const value = item[header];
            cells[header] = {
              value: value ?? '',
              type: inferType(value),
            };
          });
          rows.push({
            id: `row_${rows.length}`,
            cells,
          });
          
          processedRows++;
          // 진행률 업데이트 (10% ~ 90%)
          if (processedRows % 100 === 0 || processedRows === 1) {
            const progress = Math.min(90, 10 + (processedRows / Math.max(1, totalRows || processedRows * 2)) * 80);
            onProgress?.(progress, `행 처리 중: ${processedRows.toLocaleString()}개`);
          }
        }
      },
      complete: () => {
        // Papa.parse의 step 콜백에서 처리됨
      },
    });
    
    // 전체 행 수 추정 (정확하지 않을 수 있음)
    totalRows = rows.length;

    if (rows.length === 0) {
      onProgress?.(100, '완료');
      return {
        columns: [],
        rows: [],
        metadata: { rowCount: 0, columnCount: 0, isFlat: true },
      };
    }

    onProgress?.(95, '데이터 정리 중...');
    
    const finalResult = {
      columns,
      rows,
      metadata: {
        rowCount: rows.length,
        columnCount: columns.length,
        isFlat: true,
      },
    };
    
    onProgress?.(100, '완료');
    return finalResult;
  } catch (e) {
    throw new Error(`CSV 파싱 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

function convertToTableData(data: any, onProgress?: ProgressCallback): TableData {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return {
        columns: [],
        rows: [],
        metadata: { rowCount: 0, columnCount: 0, isFlat: true },
      };
    }

    const totalItems = data.length;
    onProgress?.(60, `데이터 구조 분석 중 (${totalItems.toLocaleString()}개 항목)...`);

    const firstItem = data[0];
    if (!firstItem || typeof firstItem !== 'object') {
      throw new Error('Invalid data: first item is not an object');
    }
    
    const isFlat = isFlatObject(firstItem);
    const columns = extractColumns(firstItem, isFlat);
    
    if (!columns || !Array.isArray(columns)) {
      throw new Error('Invalid data: failed to extract columns');
    }
    
    onProgress?.(70, `컬럼 추출 완료 (${columns.length}개)`);
    
    const rows: Row[] = [];
    const batchSize = Math.max(100, Math.floor(totalItems / 100)); // 100개씩 또는 1%씩
    
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      rows.push({
        id: `row_${i}`,
        cells: extractCells(item, columns),
      });
      
      // 진행률 업데이트 (70% ~ 95%)
      if ((i + 1) % batchSize === 0 || i === data.length - 1) {
        const progress = 70 + ((i + 1) / totalItems) * 25;
        onProgress?.(progress, `행 처리 중: ${(i + 1).toLocaleString()} / ${totalItems.toLocaleString()}`);
      }
    }

    return {
      columns,
      rows,
      metadata: {
        rowCount: rows.length,
        columnCount: columns.length,
        isFlat,
      },
    };
  } else if (typeof data === 'object' && data !== null) {
    const isFlat = isFlatObject(data);
    const columns = extractColumns(data, isFlat);
    
    if (!columns || !Array.isArray(columns)) {
      throw new Error('Invalid data: failed to extract columns');
    }

    const rows: Row[] = [
      {
        id: 'row_0',
        cells: extractCells(data, columns),
      },
    ];

    return {
      columns,
      rows,
      metadata: {
        rowCount: 1,
        columnCount: columns.length,
        isFlat,
      },
    };
  }

  return {
    columns: [],
    rows: [],
    metadata: { rowCount: 0, columnCount: 0, isFlat: true },
  };
}

function isFlatObject(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return true;
  }

  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      return false;
    }
  }
  return true;
}

function extractColumns(obj: any, isFlat: boolean): Column[] {
  // null/undefined 체크
  if (obj === null || obj === undefined) {
    return [];
  }
  
  if (typeof obj !== 'object') {
    return [];
  }
  
  if (isFlat) {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return [];
    }
    return keys.map((key) => ({
      key,
      label: key,
      type: inferType(obj[key]),
    }));
  }

  const columns: Column[] = [];
  const processed = new Set<string>();

  const addColumn = (key: string, value: any) => {
    if (!key) {
      return;
    }
    if (!processed.has(key)) {
      columns.push({
        key,
        label: key,
        type: inferType(value),
      });
      processed.add(key);
    }
  };

  function traverse(current: any, prefix: string = '') {
    if (current === null || current === undefined) {
      addColumn(prefix, current);
      return;
    }

    if (Array.isArray(current)) {
      addColumn(prefix, current);
      return;
    }

    if (typeof current !== 'object') {
      addColumn(prefix, current);
      return;
    }

    for (const [key, value] of Object.entries(current)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        traverse(value, fullKey);
      } else {
        addColumn(fullKey, value);
      }
    }
  }

  traverse(obj);
  return columns;
}

function extractCells(obj: any, columns: Column[]): Record<string, Cell> {
  const cells: Record<string, Cell> = {};
  columns.forEach((col) => {
    const value = getNestedValue(obj, col.key);
    cells[col.key] = {
      value,
      type: inferType(value),
    };
  });
  return cells;
}

function getNestedValue(obj: any, path: string): any {
  if (!path) return obj;
  
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    // 배열인 경우 첫 번째 요소를 선택
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
    
    // 객체인 경우 키로 접근
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

export function exportToJSON(data: TableData): string {
  const result: any[] = [];
  data.rows.forEach((row) => {
    const obj: any = {};
    data.columns.forEach((col) => {
      const cell = row.cells[col.key];
      if (cell) {
        setNestedValue(obj, col.key, cell.value);
      }
    });
    result.push(obj);
  });
  return JSON.stringify(result, null, 2);
}

function setNestedValue(obj: any, path: string, value: any) {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
}

export function exportToCSV(data: TableData): string {
  const headers = data.columns.map((col) => col.label);
  const lines = [headers.join(',')];

  data.rows.forEach((row) => {
    const values = data.columns.map((col) => {
      const cell = row.cells[col.key];
      const value = cell ? String(cell.value ?? '') : '';
      return `"${value.replace(/"/g, '""')}"`;
    });
    lines.push(values.join(','));
  });

  return lines.join('\n');
}

export function parseXML(xmlString: string, onProgress?: ProgressCallback): TableData {
  try {
    onProgress?.(10, 'XML 파싱 중...');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    onProgress?.(30, 'XML 구조 분석 중...');
    
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
  } catch (e) {
    throw new Error(`XML 파싱 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
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
    // 직접 자식이 없을 때만 텍스트 반환
    if (node.children.length === 0) {
      return node.textContent?.trim() || '';
    }
    return '';
  }

  // 직접 자식 요소 찾기 (querySelector는 모든 하위 요소를 검색하므로 직접 자식만 확인)
  const directChildren = Array.from(node.children);
  const child = directChildren.find((c) => c.tagName === key);
  if (child) {
    // 자식 요소가 있으면 텍스트 반환
    // 자식 요소가 있으면 빈 문자열, 없으면 텍스트 반환
    if (child.children.length === 0) {
      return child.textContent?.trim() || '';
    } else {
      // 자식 요소가 있으면 빈 문자열 반환 (복잡한 구조는 처리하지 않음)
      return '';
    }
  }

  return '';
}

export function exportToXML(data: TableData): string {
  const rootName = 'root';
  const itemName = 'item';

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<${rootName}>\n`;

  data.rows.forEach((row) => {
    xml += `  <${itemName}`;

    // 속성으로 저장할 컬럼과 일반 컬럼 구분
    const attributes: Array<{ key: string; value: string }> = [];
    const elements: Array<{ key: string; value: any }> = [];

    data.columns.forEach((col) => {
      const cell = row.cells[col.key];
      if (cell) {
        if (col.key.startsWith('@')) {
          attributes.push({
            key: col.key.substring(1),
            value: String(cell.value ?? ''),
          });
        } else if (col.key !== '_text') {
          elements.push({
            key: col.key,
            value: cell.value,
          });
        }
      }
    });

    // 속성 추가
    attributes.forEach((attr) => {
      const escapedValue = escapeXML(String(attr.value));
      xml += ` ${attr.key}="${escapedValue}"`;
    });

    if (elements.length === 0) {
      xml += ' />\n';
    } else {
      xml += '>\n';
      elements.forEach((elem) => {
        const value = elem.value != null ? String(elem.value) : '';
        const escapedValue = escapeXML(value);
        xml += `    <${elem.key}>${escapedValue}</${elem.key}>\n`;
      });
      xml += `  </${itemName}>\n`;
    }
  });

  xml += `</${rootName}>`;
  return xml;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

