/**
 * Import/Export Agent - 파일 및 클립보드 처리
 */
import { parseJSON, parseCSV, parseXML, exportToJSON, exportToCSV, exportToXML, type ProgressCallback } from '../parser/parser';
import { compressToToon, decompressFromToon } from '../compression/toon';
import type { TableData } from '../store/types';
import { isTauri } from '../../utils/isTauri';

export interface ImportResult {
  data: TableData;
  format: 'json' | 'csv' | 'xml' | 'toon';
}


export async function importFile(
  file: File | { path: string; name: string },
  onProgress?: ProgressCallback
): Promise<ImportResult> {
  let content: string;
  let fileName: string;
  let fileSize = 0;

  if (isTauri() && 'path' in file) {
    // Tauri 환경: 파일 경로로 직접 읽기
    try {
      onProgress?.(5, '파일 읽는 중...', {
        stage: 'loading',
        current: 0,
        total: 0,
        stageProgress: 0,
      });
      const fsModule = await import('@tauri-apps/plugin-fs');
      const { readTextFile, stat } = fsModule as any;
      const fileStat = await stat(file.path);
      fileSize = fileStat.size || 0;
      
      // 파일 크기가 큰 경우 청크 단위로 읽기 시도 (Tauri는 한 번에 읽기만 지원)
      content = await readTextFile(file.path);
      
      onProgress?.(20, '파일 읽기 완료', {
        stage: 'loading',
        current: fileSize,
        total: fileSize,
        stageProgress: 100,
      });
      fileName = file.name;
    } catch (error) {
      throw new Error(`파일 읽기 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else if (file instanceof File) {
    // 웹 환경: FileReader 사용 (progress 이벤트 지원)
    fileSize = file.size;
    content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const loaded = e.loaded;
          const total = e.total || fileSize;
          const percent = Math.min(20, (loaded / total) * 20); // 파일 읽기는 0-20%
          const stageProgress = total > 0 ? (loaded / total) * 100 : 0;
          
          onProgress(percent, '파일 읽는 중...', {
            stage: 'loading',
            current: loaded,
            total,
            stageProgress,
          });
        }
      };
      
      reader.onload = (e) => {
        if (onProgress) {
          onProgress(20, '파일 읽기 완료', {
            stage: 'loading',
            current: fileSize,
            total: fileSize,
            stageProgress: 100,
          });
        }
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
        throw new Error('지원하지 않는 파일 형식입니다. (JSON, CSV, XML, TOON만 지원)');
      }

      // 디버깅: 파일 형식 확인
      console.log(`[importFile] 파일 형식 감지: ${fileName} -> ${fileFormat}`);

      let data: TableData;
      try {
        // 전체 진행률을 단계별로 조정 (파일 읽기: 0-20%, 파싱: 20-90%, 변환: 90-100%)
        const createAdjustedProgress = (stageProgress: number, stageRange: [number, number]) => {
          const [start, end] = stageRange;
          const adjustedProgress = start + (stageProgress / 100) * (end - start);
          return adjustedProgress;
        };

        if (fileFormat === 'json') {
          // JSON 파일은 반드시 parseJSON으로 처리
          // content가 Base64처럼 보이면 경고하지만 일단 JSON 파싱 시도
          const isBase64Like = content.trim().match(/^[A-Za-z0-9+/=]+$/) && content.length > 100;
          if (isBase64Like) {
            // Base64처럼 보이지만 .json 확장자면 JSON으로 처리
            console.warn(`Warning: ${fileName} looks like Base64 but has .json extension. Attempting JSON parse.`);
          }
          console.log(`[importFile] parseJSON 호출 시작`);
          
          const adjustedOnProgress: ProgressCallback | undefined = onProgress ? (
            (prog, msg, details) => {
              const adjusted = createAdjustedProgress(prog, [20, 90]);
              const adjustedDetails = details ? {
                ...details,
                stage: 'parsing' as const,
                stageProgress: details.stageProgress,
              } : {
                stage: 'parsing' as const,
                current: 0,
                total: content.length,
                stageProgress: prog,
              };
              onProgress(adjusted, msg, adjustedDetails);
            }
          ) : undefined;
          
          data = parseJSON(content, adjustedOnProgress);
          console.log(`[importFile] parseJSON 성공`, {
            rowsCount: data?.rows?.length,
            columnsCount: data?.columns?.length,
            hasMetadata: !!data?.metadata
          });
        } else if (fileFormat === 'csv') {
          const adjustedOnProgress: ProgressCallback | undefined = onProgress ? (
            (prog, msg, details) => {
              const adjusted = createAdjustedProgress(prog, [20, 90]);
              const adjustedDetails = details ? {
                ...details,
                stage: 'parsing' as const,
              } : {
                stage: 'parsing' as const,
                current: 0,
                total: content.length,
                stageProgress: prog,
              };
              onProgress(adjusted, msg, adjustedDetails);
            }
          ) : undefined;
          
          data = parseCSV(content, adjustedOnProgress);
        } else if (fileFormat === 'xml') {
          const adjustedOnProgress: ProgressCallback | undefined = onProgress ? (
            (prog, msg, details) => {
              const adjusted = createAdjustedProgress(prog, [20, 90]);
              const adjustedDetails = details ? {
                ...details,
                stage: 'parsing' as const,
              } : {
                stage: 'parsing' as const,
                current: 0,
                total: content.length,
                stageProgress: prog,
              };
              onProgress(adjusted, msg, adjustedDetails);
            }
          ) : undefined;
          
          data = parseXML(content, adjustedOnProgress);
        } else if (fileFormat === 'toon') {
          // .toon 파일만 decompressFromToon 사용
          console.log(`[importFile] decompressFromToon 호출 시작`);
          onProgress?.(25, 'TOON 압축 해제 중...', {
            stage: 'compressing',
            current: 0,
            total: content.length,
            stageProgress: 0,
          });
          
          // decompressFromToon에 진행률 콜백 전달
          data = decompressFromToon(content, (prog, msg, details) => {
            if (onProgress) {
              const adjusted = createAdjustedProgress(prog, [20, 90]);
              const adjustedDetails = details || {
                stage: 'compressing' as const,
                current: 0,
                total: content.length,
                stageProgress: prog,
              };
              onProgress(adjusted, msg, adjustedDetails);
            }
          });
          
          console.log(`[importFile] decompressFromToon 성공`);
          onProgress?.(90, 'TOON 압축 해제 완료', {
            stage: 'compressing',
            current: content.length,
            total: content.length,
            stageProgress: 100,
          });
        } else {
          throw new Error('지원하지 않는 파일 형식입니다.');
        }
      } catch (parseError) {
        // 파싱 오류를 더 명확하게 전달
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
        console.error(`[importFile] 파싱 오류 발생:`, {
          fileName,
          fileFormat,
          errorMessage,
          errorStack: parseError instanceof Error ? parseError.stack : undefined
        });
        
        // JSON 파일에서 .toon 형식 오류가 발생하면 명확한 메시지
        // (이 경우는 JSON 파일이 실제로는 .toon 형식이거나 손상된 경우)
        if (fileFormat === 'json') {
          if (errorMessage.includes('Invalid .toon format') || errorMessage.includes('.toon')) {
            throw new Error(`JSON 파일 파싱 실패 (${fileName}): 파일이 손상되었거나 유효하지 않은 JSON 형식입니다. 원본: ${errorMessage}`);
          }
          // JSON 파싱 오류는 그대로 전달 (이미 명확한 메시지)
          throw new Error(`JSON 파일 파싱 실패 (${fileName}): ${errorMessage}`);
        }
        
        // 다른 형식의 파일 파싱 오류
        throw new Error(`파일 파싱 실패 (${fileName}): ${errorMessage}`);
      }

      // 최종 데이터 유효성 검사 및 변환 (90-100%)
      onProgress?.(90, '데이터 변환 중...', {
        stage: 'converting',
        current: 0,
        total: data?.rows?.length || 0,
        stageProgress: 0,
      });
      
      console.log(`[importFile] 최종 데이터 검증 시작`, {
        hasData: !!data,
        hasRows: !!data?.rows,
        isRowsArray: Array.isArray(data?.rows),
        rowsLength: data?.rows?.length,
        hasColumns: !!data?.columns,
        isColumnsArray: Array.isArray(data?.columns),
        columnsLength: data?.columns?.length
      });
      
      if (!data || !data.rows || !Array.isArray(data.rows) || !data.columns || !Array.isArray(data.columns)) {
        console.error(`[importFile] 데이터 유효성 검사 실패`, {
          data,
          dataType: typeof data,
          rows: data?.rows,
          rowsType: typeof data?.rows,
          columns: data?.columns,
          columnsType: typeof data?.columns
        });
        throw new Error(`파일 데이터가 유효하지 않습니다 (${fileName}): rows 또는 columns가 없습니다.`);
      }
      
      onProgress?.(95, `데이터 변환 완료 (${data.rows.length.toLocaleString()}행, ${data.columns.length}열)`, {
        stage: 'converting',
        current: data.rows.length,
        total: data.rows.length,
        stageProgress: 100,
      });
      
      console.log(`[importFile] 최종 데이터 검증 성공`);

      onProgress?.(100, '완료', {
        stage: 'complete',
        current: data.rows.length,
        total: data.rows.length,
        stageProgress: 100,
      });

      return { data, format: fileFormat };
    } catch (error) {
      throw error;
    }
}

export async function importFromClipboard(onProgress?: ProgressCallback): Promise<TableData> {
  let text: string;
  
  if (isTauri()) {
    try {
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
    return parseJSON(text, onProgress);
  } catch {
    try {
      return parseCSV(text, onProgress);
    } catch {
      try {
        return parseXML(text, onProgress);
      } catch (error) {
        throw new Error(`붙여넣기 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
}

/**
 * 파일 형식 감지 함수
 */
function detectFileFormat(fileName: string): 'json' | 'csv' | 'xml' | 'toon' | null {
  const lowerName = fileName.toLowerCase();
  // 확장자 우선순위: 더 구체적인 확장자를 먼저 체크
  if (lowerName.endsWith('.toon')) return 'toon';
  if (lowerName.endsWith('.json')) return 'json';
  if (lowerName.endsWith('.csv')) return 'csv';
  if (lowerName.endsWith('.xml')) return 'xml';
  return null;
}

/**
 * 데이터를 지정된 형식으로 변환하여 문자열 반환
 */
function formatData(data: TableData, format: 'json' | 'csv' | 'xml' | 'toon'): string {
  if (format === 'json') {
    return exportToJSON(data);
  } else if (format === 'csv') {
    return exportToCSV(data);
  } else if (format === 'xml') {
    return exportToXML(data);
  } else if (format === 'toon') {
    return compressToToon(data);
  }
  throw new Error('지원하지 않는 파일 형식입니다.');
}

/**
 * 파일 저장 (Save) - 원본 파일 경로가 있으면 원본에 저장, 없으면 Save As
 */
export async function saveFile(
  data: TableData,
  filePath?: string,
  fileFormat?: 'json' | 'csv' | 'xml' | 'toon'
): Promise<{ saved: boolean; filePath?: string }> {
  if (!filePath || !fileFormat) {
    // Save As로 처리
    return saveFileAs(data, fileFormat || 'json');
  }

  if (isTauri()) {
    try {
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
  format?: 'json' | 'csv' | 'xml' | 'toon',
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
  } else if (finalFormat === 'toon') {
    content = compressToToon(data);
    filename = filename || 'data.toon';
    mimeType = 'application/octet-stream';
  }

  if (isTauri()) {
    try {
      const dialogModule = await import('@tauri-apps/plugin-dialog');
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
export async function exportFile(data: TableData, format: 'json' | 'csv' | 'xml' | 'toon'): Promise<void> {
  await saveFileAs(data, format);
}


