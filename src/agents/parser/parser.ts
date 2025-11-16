/**
 * 데이터 파서 Agent - 핵심 파싱 로직
 */
import Papa from 'papaparse';
import type { TableData, Column, Row, Cell } from '../store/types';

export function parseJSON(jsonString: string): TableData {
  try {
    const data = JSON.parse(jsonString);
    return convertToTableData(data);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

export function parseCSV(csvString: string): TableData {
  try {
    const result = Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    if (!result.data || result.data.length === 0) {
      return {
        columns: [],
        rows: [],
        metadata: { rowCount: 0, columnCount: 0, isFlat: true },
      };
    }

    const headers: string[] = result.meta.fields || [];
    const columns: Column[] = headers.map((header: string, index: number) => ({
      key: header || `col_${index}`,
      label: header || `Column ${index + 1}`,
      type: 'string',
    }));

    const rows: Row[] = (result.data as Record<string, unknown>[]).map((item, rowIndex) => {
      const cells: Record<string, Cell> = {};
      headers.forEach((header: string) => {
        const value = item[header];
        cells[header] = {
          value: value ?? '',
          type: inferType(value),
        };
      });
      return {
        id: `row_${rowIndex}`,
        cells,
      };
    });

    return {
      columns,
      rows,
      metadata: {
        rowCount: rows.length,
        columnCount: columns.length,
        isFlat: true,
      },
    };
  } catch (e) {
    throw new Error(`CSV 파싱 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

function convertToTableData(data: any): TableData {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return {
        columns: [],
        rows: [],
        metadata: { rowCount: 0, columnCount: 0, isFlat: true },
      };
    }

    const firstItem = data[0];
    const isFlat = isFlatObject(firstItem);
    const columns = extractColumns(firstItem, isFlat);
    const rows: Row[] = data.map((item, index) => ({
      id: `row_${index}`,
      cells: extractCells(item, columns),
    }));

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
  if (isFlat) {
    return Object.keys(obj).map((key) => ({
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

export function parseXML(xmlString: string): TableData {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // 파싱 에러 확인
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('XML 파싱 실패: 잘못된 XML 형식입니다.');
    }

    const root = xmlDoc.documentElement;
    if (!root) {
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
      return convertXMLNodeToTableData(root);
    }

    // 첫 번째 자식 요소의 구조를 분석하여 컬럼 추출
    const firstChild = children[0];
    const columns = extractXMLColumns(firstChild);

    // 모든 자식 요소를 행으로 변환
    const rows: Row[] = children.map((child, index) => {
      const cells: Record<string, Cell> = {};
      columns.forEach((col) => {
        const value = getXMLNodeValue(child, col.key);
        cells[col.key] = {
          value,
          type: inferType(value),
        };
      });
      return {
        id: `row_${index}`,
        cells,
      };
    });

    return {
      columns,
      rows,
      metadata: {
        rowCount: rows.length,
        columnCount: columns.length,
        isFlat: true,
      },
    };
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

