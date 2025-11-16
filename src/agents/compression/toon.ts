/**
 * .toon 포맷 - TableData를 TOON 명세에 맞춘 텍스트 표현으로 직렬화/역직렬화
 * https://github.com/toon-format/toon 의 공개 명세를 참고하여
 * 버전 헤더(TOON/<version>)와 사람이 읽기 좋은 JSON Payload를 조합한다.
 */
import type { Column, Row, TableData } from '../store/types';

const TOON_VERSION = '1.0';

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

/**
 * TableData를 사람이 읽기 좋은 TOON 포맷 문자열로 직렬화한다.
 */
export function compressToToon(data: TableData, onProgress?: ProgressCallback): string {
  const normalized = normalizeTableData(data);
  const payload = buildPayload(normalized);

  onProgress?.(20, 'TOON 헤더 준비 중...', {
    stage: 'compressing',
    current: 0,
    total: normalized.rows.length,
    stageProgress: 20,
  });

  const prettyJson = JSON.stringify(payload, null, 2);
  const result = `TOON/${TOON_VERSION}\n${prettyJson}`;

  onProgress?.(100, `완료 (${result.length.toLocaleString()} chars)`, {
    stage: 'complete',
    current: result.length,
    total: result.length,
    stageProgress: 100,
  });

  return result;
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

  // 1) 신규 TOON 포맷 (헤더 + JSON)
  if (trimmed.startsWith('TOON/')) {
    const [, ...rest] = trimmed.split(/\r?\n/);
    const payloadText = rest.join('\n');
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

function buildPayload(data: TableData): ToonPayload {
  return {
    version: TOON_VERSION,
    metadata: data.metadata,
    columns: data.columns.map((column) => ({ ...column })),
    rows: data.rows.map((row) => ({
      id: row.id,
      cells: { ...row.cells },
    })),
  };
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
    version: typeof candidate.version === 'string' ? candidate.version : TOON_VERSION,
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
