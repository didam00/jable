/**
 * Import/Export Agent - 파일 및 클립보드 처리
 */
import { parseJSON, parseCSV, parseXML, exportToJSON, exportToCSV, exportToXML } from '../parser/parser';
import type { TableData } from '../store/types';

export async function importFile(file: File): Promise<TableData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.json')) {
          resolve(parseJSON(content));
        } else if (fileName.endsWith('.csv')) {
          resolve(parseCSV(content));
        } else if (fileName.endsWith('.xml')) {
          resolve(parseXML(content));
        } else {
          reject(new Error('지원하지 않는 파일 형식입니다. (JSON, CSV, XML만 지원)'));
        }
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file);
  });
}

export async function importFromClipboard(): Promise<TableData> {
  const text = await navigator.clipboard.readText();
  try {
    return parseJSON(text);
  } catch {
    try {
      return parseCSV(text);
    } catch {
      try {
        return parseXML(text);
      } catch (error) {
        throw new Error(`붙여넣기 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
}

export function exportFile(data: TableData, format: 'json' | 'csv' | 'xml'): void {
  let content = '';
  let filename = '';
  let mimeType = '';

  if (format === 'json') {
    content = exportToJSON(data);
    filename = 'data.json';
    mimeType = 'application/json';
  } else if (format === 'csv') {
    content = exportToCSV(data);
    filename = 'data.csv';
    mimeType = 'text/csv';
  } else if (format === 'xml') {
    content = exportToXML(data);
    filename = 'data.xml';
    mimeType = 'application/xml';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

