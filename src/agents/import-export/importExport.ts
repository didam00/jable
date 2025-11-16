/**
 * Import/Export Agent - 파일 및 클립보드 처리
 */
import { parseJSON, parseCSV, parseXML, exportToJSON, exportToCSV, exportToXML } from '../parser/parser';
import type { TableData } from '../store/types';
import { isTauri } from '../../utils/isTauri';

export interface ImportResult {
  data: TableData;
  format: 'json' | 'csv' | 'xml';
}

export async function importFile(file: File | { path: string; name: string }): Promise<ImportResult> {
  let content: string;
  let fileName: string;

  if (isTauri() && 'path' in file) {
    // Tauri 환경: 파일 경로로 직접 읽기
    try {
      // @ts-expect-error - Tauri plugin types may not be available at compile time
      const fsModule = await import('@tauri-apps/plugin-fs');
      const { readTextFile } = fsModule as any;
      content = await readTextFile(file.path);
      fileName = file.name;
    } catch (error) {
      throw new Error(`파일 읽기 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else if (file instanceof File) {
    // 웹 환경: FileReader 사용
    content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
      reader.readAsText(file);
    });
    fileName = file.name;
  } else {
    throw new Error('지원하지 않는 파일 형식입니다.');
  }

  try {
    const fileFormat = detectFileFormat(fileName);
    if (!fileFormat) {
      throw new Error('지원하지 않는 파일 형식입니다. (JSON, CSV, XML만 지원)');
    }

    let data: TableData;
    if (fileFormat === 'json') {
      data = parseJSON(content);
    } else if (fileFormat === 'csv') {
      data = parseCSV(content);
    } else if (fileFormat === 'xml') {
      data = parseXML(content);
    } else {
      throw new Error('지원하지 않는 파일 형식입니다.');
    }

    return { data, format: fileFormat };
  } catch (error) {
    throw error;
  }
}

export async function importFromClipboard(): Promise<TableData> {
  let text: string;
  
  if (isTauri()) {
    try {
      // @ts-expect-error - Tauri plugin types may not be available at compile time
      const clipboardModule = await import('@tauri-apps/plugin-clipboard-manager');
      const { readText } = clipboardModule as any;
      text = await readText();
      if (!text) {
        throw new Error('클립보드가 비어있습니다.');
      }
    } catch (error) {
      throw new Error(`클립보드 읽기 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    text = await navigator.clipboard.readText();
  }

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

/**
 * 파일 형식 감지 함수
 */
function detectFileFormat(fileName: string): 'json' | 'csv' | 'xml' | null {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.json')) return 'json';
  if (lowerName.endsWith('.csv')) return 'csv';
  if (lowerName.endsWith('.xml')) return 'xml';
  return null;
}

/**
 * 데이터를 지정된 형식으로 변환하여 문자열 반환
 */
function formatData(data: TableData, format: 'json' | 'csv' | 'xml'): string {
  if (format === 'json') {
    return exportToJSON(data);
  } else if (format === 'csv') {
    return exportToCSV(data);
  } else if (format === 'xml') {
    return exportToXML(data);
  }
  throw new Error('지원하지 않는 파일 형식입니다.');
}

/**
 * 파일 저장 (Save) - 원본 파일 경로가 있으면 원본에 저장, 없으면 Save As
 */
export async function saveFile(
  data: TableData,
  filePath?: string,
  fileFormat?: 'json' | 'csv' | 'xml'
): Promise<{ saved: boolean; filePath?: string }> {
  if (!filePath || !fileFormat) {
    // Save As로 처리
    return saveFileAs(data, fileFormat || 'json');
  }

  if (isTauri()) {
    try {
      // @ts-expect-error - Tauri plugin types may not be available at compile time
      const fsModule = await import('@tauri-apps/plugin-fs');
      const { writeTextFile } = fsModule as any;
      const content = formatData(data, fileFormat);
      await writeTextFile(filePath, content);
      return { saved: true, filePath };
    } catch (error) {
      throw new Error(`파일 저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // 웹 환경에서는 Save As만 가능
    return saveFileAs(data, fileFormat);
  }
}

/**
 * 파일 다른 이름으로 저장 (Save As)
 */
export async function saveFileAs(
  data: TableData,
  format?: 'json' | 'csv' | 'xml',
  defaultFileName?: string
): Promise<{ saved: boolean; filePath?: string }> {
  const finalFormat = format || 'json';
  let content = '';
  let filename = defaultFileName || '';
  let mimeType = '';

  if (finalFormat === 'json') {
    content = exportToJSON(data);
    filename = filename || 'data.json';
    mimeType = 'application/json';
  } else if (finalFormat === 'csv') {
    content = exportToCSV(data);
    filename = filename || 'data.csv';
    mimeType = 'text/csv';
  } else if (finalFormat === 'xml') {
    content = exportToXML(data);
    filename = filename || 'data.xml';
    mimeType = 'application/xml';
  }

  if (isTauri()) {
    try {
      // @ts-expect-error - Tauri plugin types may not be available at compile time
      const dialogModule = await import('@tauri-apps/plugin-dialog');
      // @ts-expect-error - Tauri plugin types may not be available at compile time
      const fsModule = await import('@tauri-apps/plugin-fs');
      const { save } = dialogModule as any;
      const { writeTextFile } = fsModule as any;
      
      const filePath = await save({
        defaultPath: filename,
        filters: [{
          name: finalFormat.toUpperCase(),
          extensions: [finalFormat],
        }],
      });

      if (filePath) {
        await writeTextFile(filePath, content);
        return { saved: true, filePath };
      }
      return { saved: false };
    } catch (error) {
      throw new Error(`파일 저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // 웹 환경: Blob 다운로드
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return { saved: true };
  }
}

/**
 * 파일 내보내기 (Export) - 항상 Save As 다이얼로그 표시
 */
export async function exportFile(data: TableData, format: 'json' | 'csv' | 'xml'): Promise<void> {
  await saveFileAs(data, format);
}


