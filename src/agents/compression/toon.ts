/**
 * .toon 포맷 - TableData를 TOON 명세에 맞춘 텍스트 표현으로 직렬화/역직렬화
 * https://github.com/toon-format/toon 의 공개 명세를 따르며
 * 실제 데이터 구조를 사람이 읽기 쉬운 TOON 텍스트로 변환한다.
 */
import { encode, decode } from '@toon-format/toon';
import type { Column, Row, TableData } from '../store/types';
import { exportToJSON, parseJSON } from '../parser';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from './lzString';

export type ProgressCallback = (
  progress: number,
  message: string,
  details?: {
    stage: 'compressing' | 'complete';
    current: number;
    total: number;
    stageProgress: number;
  }
) => void;

interface ToonPayload {
  version: string;
  metadata: TableData['metadata'];
  columns: Column[];
  rows: Row[];
}

const DEFAULT_SHARE_BASE_URL = 'https://jable.app/share?toon=';

export interface ToonShareOptions {
  baseUrl?: string;
  onProgress?: ProgressCallback;
}

export interface ToonShareResult {
  toon: string;
  encoded: string;
  url: string;
  plainLength: number;
  compressedLength: number;
}

/**
 * TableData를 사람이 읽기 좋은 TOON 포맷 문자열로 직렬화한다.
 */
export function compressToToon(data: TableData, onProgress?: ProgressCallback): string {
  onProgress?.(20, '데이터 구조화 중...', {
    stage: 'compressing',
    current: 0,
    total: data.rows.length,
    stageProgress: 20,
  });

  const structured = tableDataToStructuredValue(data);

  onProgress?.(60, 'TOON 인코딩 중...', {
    stage: 'compressing',
    current: 0,
    total: Array.isArray(structured) ? structured.length : 1,
    stageProgress: 60,
  });

  let result: string;
  try {
    result = encode(structured, { indent: 2 }).trimEnd();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`TOON 인코딩 실패: ${message}`);
  }

  onProgress?.(100, `완료 (${result.length.toLocaleString()} chars)`, {
    stage: 'complete',
    current: result.length,
    total: result.length,
    stageProgress: 100,
  });

  return result;
}

export function createToonShareLink(data: TableData, options?: ToonShareOptions): ToonShareResult {
  const toon = compressToToon(data, options?.onProgress);
  const encoded = compressToEncodedURIComponent(toon);
  const baseUrl =
    options?.baseUrl && options.baseUrl.trim().length > 0 ? options.baseUrl.trim() : DEFAULT_SHARE_BASE_URL;

  return {
    toon,
    encoded,
    url: `${baseUrl}${encoded}`,
    plainLength: toon.length,
    compressedLength: encoded.length,
  };
}

/**
 * .toon 형식 문자열을 TableData로 역직렬화한다.
 * - TOON/버전 헤더가 붙은 정식 포맷
 * - JSON만 포함된 신규 포맷
 * - 기존 Base64 포맷(레거시) 모두 허용한다.
 */
export function decompressFromToon(toonString: string, onProgress?: ProgressCallback): TableData {
  if (!toonString || typeof toonString !== 'string') {
    throw new Error('Invalid .toon format: empty or invalid string');
  }

  const trimmed = toonString.trim();
  const withoutHeader = stripToonHeader(trimmed);

  const decodedValue = tryDecodeToStructuredValue(withoutHeader);
  if (decodedValue !== null) {
    const tableData = structuredValueToTableData(decodedValue);
    onProgress?.(100, 'TOON 파싱 완료', {
      stage: 'complete',
      current: tableData.rows.length,
      total: tableData.rows.length,
      stageProgress: 100,
    });
    return tableData;
  }

  // 1) 신규 TOON 포맷 (헤더 + JSON)
  if (trimmed.startsWith('TOON/')) {
    const payloadText = withoutHeader;
    const payload = safeParseJson(payloadText);
    const tableData = normalizeTableData(parsePayload(payload));

    onProgress?.(100, 'TOON 파싱 완료', {
      stage: 'complete',
      current: tableData.rows.length,
      total: tableData.rows.length,
      stageProgress: 100,
    });

    return tableData;
  }

  // 2) JSON만 있는 경우 (헤더 없는 신규 포맷)
  if (looksLikeJson(trimmed)) {
    const payload = safeParseJson(trimmed);
    const tableData = normalizeTableData(parsePayload(payload));
    onProgress?.(100, 'JSON 파싱 완료', {
      stage: 'complete',
      current: tableData.rows.length,
      total: tableData.rows.length,
      stageProgress: 100,
    });
    return tableData;
  }

  // 3) 레거시 Base64 압축 포맷 호환
  if (looksLikeBase64(trimmed)) {
    return parseLegacyBase64(trimmed, onProgress);
  }

  throw new Error('Invalid .toon format: unsupported content');
}

export function parseToonSharePayload(payload: string, onProgress?: ProgressCallback): TableData {
  if (!payload) {
    throw new Error('공유 문자열이 비어 있습니다.');
  }

  const toon = decompressFromEncodedURIComponent(payload);
  if (!toon) {
    throw new Error('공유 문자열을 해석할 수 없습니다.');
  }

  return decompressFromToon(toon, onProgress);
}

function parsePayload(payload: unknown): ToonPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid .toon format: payload is not an object');
  }

  const candidate = payload as Partial<ToonPayload>;

  if (!candidate.columns || !Array.isArray(candidate.columns)) {
    throw new Error('Invalid .toon format: missing columns');
  }

  if (!candidate.rows || !Array.isArray(candidate.rows)) {
    throw new Error('Invalid .toon format: missing rows');
  }

  const metadata = candidate.metadata || {
    rowCount: candidate.rows.length,
    columnCount: candidate.columns.length,
    isFlat: true,
  };

  return {
    version: candidate.version!,
    metadata: {
      rowCount: candidate.rows.length,
      columnCount: candidate.columns.length,
      isFlat: metadata.isFlat ?? true,
    },
    columns: candidate.columns as Column[],
    rows: (candidate.rows as Row[]).map((row, index) => ({
      id: row.id || `row-${index + 1}`,
      cells: row.cells || {},
    })),
  };
}

function normalizeTableData(data: TableData): TableData {
  const columns: Column[] = data.columns.map((column) => ({
    key: column.key,
    label: column.label,
    type: column.type,
    width: column.width,
    frozen: column.frozen,
  }));

  const rows: Row[] = data.rows.map((row, rowIndex) => ({
    id: row.id || `row-${rowIndex + 1}`,
    cells: { ...row.cells },
  }));

  return {
    columns,
    rows,
    metadata: {
      rowCount: rows.length,
      columnCount: columns.length,
      isFlat: data.metadata?.isFlat ?? true,
    },
  };
}

function looksLikeJson(content: string): boolean {
  return content.startsWith('{') || content.startsWith('[');
}

function looksLikeBase64(content: string): boolean {
  return /^[A-Za-z0-9+/=]+$/.test(content) && !content.includes('{') && !content.includes('[');
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Invalid .toon format: ${message}`);
  }
}

function parseLegacyBase64(toonString: string, onProgress?: ProgressCallback): TableData {
  onProgress?.(30, '레거시 TOON 디코딩 중...', {
    stage: 'compressing',
    current: 0,
    total: toonString.length,
    stageProgress: 30,
  });

  const decoded = decodeBase64(toonString);
  const parsed = safeParseJson(decoded) as Partial<TableData>;
  const normalized = normalizeTableData({
    columns: parsed.columns || [],
    rows: parsed.rows || [],
    metadata: parsed.metadata || {
      rowCount: parsed.rows?.length ?? 0,
      columnCount: parsed.columns?.length ?? 0,
      isFlat: true,
    },
  });

  onProgress?.(100, '레거시 TOON 파싱 완료', {
    stage: 'complete',
    current: normalized.rows.length,
    total: normalized.rows.length,
    stageProgress: 100,
  });

  return normalized;
}

function decodeBase64(input: string): string {
  try {
    const decoded = atob(input);
    try {
      return decodeURIComponent(decoded);
    } catch {
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(bytes);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Invalid .toon format: ${message}`);
  }
}

/**
 * 파일 크기 비교 (압축률 계산)
 */
export function getCompressionRatio(originalSize: number, compressedSize: number): number {
  return ((originalSize - compressedSize) / originalSize) * 100;
}

function tableDataToStructuredValue(data: TableData): unknown {
  const jsonString = exportToJSON(data);
  const parsed = safeParseJson(jsonString);

  if (!Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed.length === 0) {
    return [];
  }

  if (parsed.length === 1) {
    return parsed[0];
  }

  return parsed;
}

function structuredValueToTableData(value: unknown): TableData {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    const jsonString = JSON.stringify(value, null, 2);
    return parseJSON(jsonString);
  }

  throw new Error('Invalid .toon format: root value must be object or array');
}

function stripToonHeader(content: string): string {
  if (!content.startsWith('TOON/')) {
    return content;
  }

  const [, ...rest] = content.split(/\r?\n/);
  return rest.join('\n').trimStart();
}

function tryDecodeToStructuredValue(content: string): unknown | null {
  if (!content) {
    return null;
  }

  try {
    return decode(content, { strict: true });
  } catch {
    return null;
  }
}
