/**
 * Import/Export Agent - 파일 및 클립보드 처리
 */
import { parseJSON, parseCSV, parseXML, exportToJSON, exportToCSV, exportToXML, type ProgressCallback, type ProgressDetails } from '../parser/parser';
import { compressToToon, decompressFromToon } from '../compression/toon';
import type { TableData } from '../store/types';
import { isTauri } from '../../utils/isTauri';
import { detectEncodingFromBuffer, decodeBuffer, buildFileNameForFormat, encodeBuffer } from './encoding';

export interface ImportResult {
  data: TableData;
  format: 'json' | 'csv' | 'xml' | 'toon';
  encoding?: string;
  binarySource?: Uint8Array;
}

export interface ImportOptions {
  encoding?: string;
  binarySource?: Uint8Array;
}

export interface EncodingPreviewResult {
  buffer: Uint8Array;
  detectedEncoding: string | null;
  confidence: number;
  initialEncoding: string;
  previewText: string;
  previewError?: string;
}


export async function importFile(
  file: File | { path: string; name: string },
  onProgress?: ProgressCallback,
  options?: ImportOptions
): Promise<ImportResult> {
  let content = '';
  let fileName = getFileDisplayName(file);
  let fileSize = 0;
  let buffer: Uint8Array | null = null;

  try {
    if (options?.binarySource) {
      buffer = options.binarySource;
      fileSize = buffer.length;
      onProgress?.(20, '파일 읽기 완료', {
        stage: 'loading',
        current: fileSize,
        total: fileSize,
        stageProgress: 100,
      });
    } else {
      const readResult = await readBinaryFileForImport(file, onProgress);
      buffer = readResult.buffer;
      fileName = readResult.fileName;
      fileSize = readResult.fileSize;
    }
    if (!buffer) {
      throw new Error('파일을 읽을 수 없습니다.');
    }
    const detection = detectEncodingFromBuffer(buffer);
    const fileFormat = detectFileFormat(fileName);
    if (!fileFormat) {
      throw new Error('지원하지 않는 파일 형식입니다. (JSON, CSV, XML, TOON만 지원)');
    }

    let appliedEncoding = options?.encoding || detection.encoding || 'utf-8';
    if (fileFormat !== 'csv') {
      appliedEncoding = options?.encoding || 'utf-8';
    }
    try {
      content = decodeBuffer(buffer, appliedEncoding);
    } catch (decodeError) {
      if (!options?.encoding && appliedEncoding !== 'utf-8') {
        appliedEncoding = 'utf-8';
        content = decodeBuffer(buffer, appliedEncoding);
      } else {
        throw new Error(
          decodeError instanceof Error ? decodeError.message : '인코딩 변환에 실패했습니다.'
        );
      }
    }

    console.log(`[importFile] 파일 형식 감지: ${fileName} -> ${fileFormat}`, {
      encoding: appliedEncoding,
      size: fileSize,
    });

    let data: TableData;
    try {
      const createAdjustedProgress = (stageProgress: number, stageRange: [number, number]) => {
        const [start, end] = stageRange;
        return start + (stageProgress / 100) * (end - start);
      };

      if (fileFormat === 'json') {
        const isBase64Like =
          content.trim().match(/^[A-Za-z0-9+/=]+$/) && content.length > 100;
        if (isBase64Like) {
          console.warn(
            `Warning: ${fileName} looks like Base64 but has .json extension. Attempting JSON parse.`
          );
        }
        const adjustedOnProgress = onProgress
          ? (prog: number, msg: string, details?: ProgressDetails) => {
              const adjusted = createAdjustedProgress(prog, [20, 90]);
              const adjustedDetails = details
                ? {
                    ...details,
                    stage: 'parsing' as const,
                  }
                : {
                    stage: 'parsing' as const,
                    current: 0,
                    total: content.length,
                    stageProgress: prog,
                  };
              onProgress(adjusted, msg, adjustedDetails);
            }
          : undefined;
        data = parseJSON(content, adjustedOnProgress);
      } else if (fileFormat === 'csv') {
        const adjustedOnProgress = onProgress
          ? (prog: number, msg: string, details?: ProgressDetails) => {
              const adjusted = createAdjustedProgress(prog, [20, 90]);
              const adjustedDetails = details
                ? {
                    ...details,
                    stage: 'parsing' as const,
                  }
                : {
                    stage: 'parsing' as const,
                    current: 0,
                    total: content.length,
                    stageProgress: prog,
                  };
              onProgress(adjusted, msg, adjustedDetails);
            }
          : undefined;
        data = parseCSV(content, adjustedOnProgress);
      } else if (fileFormat === 'xml') {
        const adjustedOnProgress = onProgress
          ? (prog: number, msg: string, details?: ProgressDetails) => {
              const adjusted = createAdjustedProgress(prog, [20, 90]);
              const adjustedDetails = details
                ? {
                    ...details,
                    stage: 'parsing' as const,
                  }
                : {
                    stage: 'parsing' as const,
                    current: 0,
                    total: content.length,
                    stageProgress: prog,
                  };
              onProgress(adjusted, msg, adjustedDetails);
            }
          : undefined;
        data = parseXML(content, adjustedOnProgress);
      } else if (fileFormat === 'toon') {
        onProgress?.(25, 'TOON 압축 해제 중...', {
          stage: 'compressing',
          current: 0,
          total: content.length,
          stageProgress: 0,
        });
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
      const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
      if (fileFormat === 'json') {
        if (errorMessage.includes('Invalid .toon format') || errorMessage.includes('.toon')) {
          throw new Error(
            `JSON 파일 파싱 실패 (${fileName}): 파일이 손상되었거나 유효하지 않은 JSON 형식입니다. 원본: ${errorMessage}`
          );
        }
        throw new Error(`JSON 파일 파싱 실패 (${fileName}): ${errorMessage}`);
      }
      throw new Error(`파일 파싱 실패 (${fileName}): ${errorMessage}`);
    }

    onProgress?.(90, '데이터 변환 중...', {
      stage: 'converting',
      current: 0,
      total: data?.rows?.length || 0,
      stageProgress: 0,
    });

    if (
      !data ||
      !data.rows ||
      !Array.isArray(data.rows) ||
      !data.columns ||
      !Array.isArray(data.columns)
    ) {
      throw new Error(`파일 데이터가 유효하지 않습니다 (${fileName}): rows 또는 columns가 없습니다.`);
    }

    onProgress?.(
      95,
      `데이터 변환 완료 (${data.rows.length.toLocaleString()}행, ${data.columns.length}열)`,
      {
        stage: 'converting',
        current: data.rows.length,
        total: data.rows.length,
        stageProgress: 100,
      }
    );

    onProgress?.(100, '완료', {
      stage: 'complete',
      current: data.rows.length,
      total: data.rows.length,
      stageProgress: 100,
    });

    return { data, format: fileFormat, encoding: appliedEncoding, binarySource: buffer };
  } catch (error) {
    throw error;
  }
}

async function readBinaryFileForImport(
  file: File | { path: string; name: string },
  onProgress?: ProgressCallback
): Promise<{ buffer: Uint8Array; fileName: string; fileSize: number }> {
  const fileName = getFileDisplayName(file);
  const buffer = await readBinarySource(file, (loaded, total) => {
    if (!onProgress || total === 0) {
      return;
    }
    const percent = Math.min(20, (loaded / total) * 20);
    const stageProgress = Math.min(100, (loaded / total) * 100);
    onProgress(percent, '파일 읽는 중...', {
      stage: 'loading',
      current: loaded,
      total,
      stageProgress,
    });
  });
  const fileSize = buffer.length;
  onProgress?.(20, '파일 읽기 완료', {
    stage: 'loading',
    current: fileSize,
    total: fileSize,
    stageProgress: 100,
  });
  return { buffer, fileName, fileSize };
}

function getFileDisplayName(file: File | { path: string; name: string }): string {
  return file instanceof File ? file.name : file.name;
}

async function readBinarySource(
  file: File | { path: string; name: string },
  onChunk?: (loaded: number, total: number) => void
): Promise<Uint8Array> {
  if (isTauri() && 'path' in file) {
    if (!file.path || typeof file.path !== 'string') {
      throw new Error('파일 경로가 유효하지 않습니다.');
    }
    const fsModule = await import('@tauri-apps/plugin-fs');
    const { readFile } = fsModule as {
      readFile: (path: string) => Promise<Uint8Array | number[]>;
    };
    const raw = await readFile(file.path);
    const buffer = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    onChunk?.(buffer.length, buffer.length);
    return buffer;
  }
  if (file instanceof File) {
    return readBrowserFile(file, onChunk);
  }
  throw new Error('지원하지 않는 파일 형식입니다.');
}

async function readBrowserFile(
  file: File,
  onChunk?: (loaded: number, total: number) => void
): Promise<Uint8Array> {
  if (file.stream) {
    const reader = file.stream().getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    const total = file.size || 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
        loaded += value.length;
        onChunk?.(loaded, total);
      }
    }
    const buffer = new Uint8Array(loaded);
    let offset = 0;
    chunks.forEach((chunk) => {
      buffer.set(chunk, offset);
      offset += chunk.length;
    });
    if (chunks.length === 0 && total === 0) {
      onChunk?.(0, 0);
    }
    return buffer;
  }
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  onChunk?.(buffer.length, buffer.length);
  return buffer;
}

export async function prepareEncodingPreview(
  file: File | { path: string; name: string },
  options?: { previewBytes?: number }
): Promise<EncodingPreviewResult> {
  const buffer = await readBinarySource(file);
  const detection = detectEncodingFromBuffer(buffer);
  const suggestedEncoding = detection.encoding || 'utf-8';
  const previewLimit = options?.previewBytes ?? 64 * 1024;
  let previewText = '';
  let previewError: string | undefined;
  let previewEncoding = suggestedEncoding;
  try {
    previewText = decodeBuffer(buffer, previewEncoding, previewLimit);
  } catch (error) {
    previewError = error instanceof Error ? error.message : String(error);
    previewEncoding = 'utf-8';
    try {
      previewText = decodeBuffer(buffer, previewEncoding, previewLimit);
    } catch (fallbackError) {
      previewError = fallbackError instanceof Error
        ? fallbackError.message
        : String(fallbackError);
    }
  }
  return {
    buffer,
    detectedEncoding: detection.encoding,
    confidence: detection.confidence,
    initialEncoding: previewEncoding,
    previewText,
    previewError,
  };
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
export interface SaveOptions {
  encoding?: string;
}

export interface SaveAsOptions extends SaveOptions {
  defaultFileName?: string;
  directoryPath?: string;
}

export async function saveFile(
  data: TableData,
  filePath?: string,
  fileFormat?: 'json' | 'csv' | 'xml' | 'toon',
  options?: SaveOptions
): Promise<{ saved: boolean; filePath?: string }> {
  if (!filePath || !fileFormat) {
    return saveFileAs(data, fileFormat || 'json', {
      defaultFileName: filePath,
      encoding: options?.encoding,
    });
  }

  if (isTauri()) {
    try {
      const fsModule = await import('@tauri-apps/plugin-fs');
      const { writeFile } = fsModule as any;
      const content = formatData(data, fileFormat);
      const encodedContent = encodeBuffer(content, options?.encoding || 'utf-8');
      await writeFile(filePath, encodedContent);
      return { saved: true, filePath };
    } catch (error) {
      throw new Error(`파일 저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return saveFileAs(data, fileFormat, {
    defaultFileName: filePath?.split(/[/\\]/).pop(),
    encoding: options?.encoding,
  });
}

export async function saveFileAs(
  data: TableData,
  format?: 'json' | 'csv' | 'xml' | 'toon',
  options?: SaveAsOptions
): Promise<{ saved: boolean; filePath?: string }> {
  const finalFormat = format || 'json';
  const filename = buildFileNameForFormat(options?.defaultFileName, finalFormat);
  let mimeType = '';
  let content = '';

  if (finalFormat === 'json') {
    content = exportToJSON(data);
    mimeType = 'application/json';
  } else if (finalFormat === 'csv') {
    content = exportToCSV(data);
    mimeType = 'text/csv';
  } else if (finalFormat === 'xml') {
    content = exportToXML(data);
    mimeType = 'application/xml';
  } else if (finalFormat === 'toon') {
    content = compressToToon(data);
    mimeType = 'application/octet-stream';
  }

  const encodedContent = encodeBuffer(content, options?.encoding || 'utf-8');

  if (isTauri()) {
    try {
      const fsModule = await import('@tauri-apps/plugin-fs');
      const { writeFile, createDir } = fsModule as any;
      if (options?.directoryPath) {
        const pathModule = await import('@tauri-apps/api/path');
        const { join } = pathModule;
        const normalizedDirectory = options.directoryPath.trim();
        const targetPath = await join(normalizedDirectory, filename);
        if (createDir) {
          await createDir(normalizedDirectory, { recursive: true }).catch(() => undefined);
        }
        await writeFile(targetPath, encodedContent);
        return { saved: true, filePath: targetPath };
      }

      const dialogModule = await import('@tauri-apps/plugin-dialog');
      const { save } = dialogModule as any;
      const filePath = await save({
        defaultPath: filename,
        filters: [
          {
            name: finalFormat.toUpperCase(),
            extensions: [finalFormat],
          },
        ],
      });

      if (filePath) {
        await writeFile(filePath, encodedContent);
        return { saved: true, filePath };
      }
      return { saved: false };
    } catch (error) {
      throw new Error(`파일 저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  const safeCopy = new Uint8Array(encodedContent);
  const blob = new Blob([safeCopy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { saved: true };
}

export async function exportFile(
  data: TableData,
  format: 'json' | 'csv' | 'xml' | 'toon',
  options?: { defaultFileName?: string; encoding?: string }
): Promise<void> {
  await saveFileAs(data, format, options);
}
