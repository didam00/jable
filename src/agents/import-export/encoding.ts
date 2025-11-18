import jschardet from 'jschardet';
import iconv from 'iconv-lite';

export type SupportedFormat = 'json' | 'csv' | 'xml' | 'toon';

export interface EncodingOption {
  value: string;
  label: string;
  hint?: string;
}

export interface EncodingDetectionResult {
  encoding: string | null;
  confidence: number;
  source: 'bom' | 'analysis' | 'fallback';
}

const PREVIEW_BYTE_LIMIT = 64 * 1024;

const ENCODING_ALIAS_MAP: Record<string, string> = {
  utf8: 'utf-8',
  'utf_8': 'utf-8',
  'unicodefffe': 'utf-16le',
  'utf-16': 'utf-16le',
  'utf16': 'utf-16le',
  'utf16le': 'utf-16le',
  'utf16be': 'utf-16be',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
  cp949: 'euc-kr',
  ms949: 'euc-kr',
  'windows-949': 'euc-kr',
  'shift-jis': 'shift_jis',
  shiftjis: 'shift_jis',
};

export const ENCODING_OPTIONS: EncodingOption[] = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'euc-kr', label: 'EUC-KR (CP949 호환)' },
  { value: 'utf-16le', label: 'UTF-16 Little Endian' },
  { value: 'utf-16be', label: 'UTF-16 Big Endian' },
  { value: 'windows-1252', label: 'Windows-1252' },
  { value: 'iso-8859-1', label: 'ISO-8859-1' },
  { value: 'shift_jis', label: 'Shift-JIS' },
  { value: 'gbk', label: 'GBK' },
];

export function normalizeEncodingLabel(label: string | null | undefined): string {
  if (!label) {
    return 'utf-8';
  }
  const lower = label.toLowerCase();
  if (ENCODING_ALIAS_MAP[lower]) {
    return ENCODING_ALIAS_MAP[lower];
  }
  return lower;
}

export function detectEncodingFromBuffer(buffer: Uint8Array): EncodingDetectionResult {
  const bom = detectBom(buffer);
  if (bom) {
    return { encoding: bom, confidence: 1, source: 'bom' };
  }
  const encodedSample = buildBinaryStringSample(buffer);
  const result = jschardet.detect(encodedSample);
  if (result && result.encoding) {
    return {
      encoding: normalizeEncodingLabel(result.encoding),
      confidence: result.confidence ?? 0,
      source: 'analysis',
    };
  }
  return { encoding: null, confidence: 0, source: 'fallback' };
}

export function decodeBuffer(
  buffer: Uint8Array,
  encoding: string,
  limit?: number
): string {
  const normalizedEncoding = normalizeEncodingLabel(encoding);
  const view = limit ? buffer.slice(0, limit) : buffer;
  try {
    const decoder = new TextDecoder(normalizedEncoding as any, { fatal: false });
    return decoder.decode(view);
  } catch (error) {
    throw new Error(
      `브라우저가 ${normalizedEncoding.toUpperCase()} 인코딩을 지원하지 않습니다.`
    );
  }
}

export function decodePreview(
  buffer: Uint8Array,
  encoding: string,
  limit = PREVIEW_BYTE_LIMIT
): string {
  return decodeBuffer(buffer, encoding, limit);
}

export function encodeBuffer(content: string, encoding: string): Uint8Array {
  const normalizedEncoding = normalizeEncodingLabel(encoding);
  if (normalizedEncoding === 'utf-8') {
    return new TextEncoder().encode(content);
  }
  if (iconv.encodingExists(normalizedEncoding)) {
    const encoded = iconv.encode(content, normalizedEncoding);
    return Uint8Array.from(encoded);
  }
  return new TextEncoder().encode(content);
}

export function buildFileNameForFormat(
  baseName: string | undefined,
  format: SupportedFormat
): string {
  const fallback = `data.${format}`;
  if (!baseName) {
    return fallback;
  }
  const sanitized = baseName.replace(/[\\/:*?"<>|]+/g, '_').trim();
  if (!sanitized) {
    return fallback;
  }
  const knownExt = ['.json', '.csv', '.xml', '.toon'];
  const lower = sanitized.toLowerCase();
  const matched = knownExt.find((ext) => lower.endsWith(ext));
  if (matched) {
    return `${sanitized.slice(0, sanitized.length - matched.length)}.${format}`;
  }
  if (sanitized.endsWith('.')) {
    return `${sanitized}${format}`;
  }
  return sanitized.includes('.') ? `${sanitized}.${format}` : `${sanitized}.${format}`;
}

function buildBinaryStringSample(buffer: Uint8Array, limit = 128 * 1024): string {
  const decoder = new TextDecoder('iso-8859-1');
  const slice = buffer.length > limit ? buffer.subarray(0, limit) : buffer;
  return decoder.decode(slice);
}

function detectBom(buffer: Uint8Array): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8';
  }
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return 'utf-16le';
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return 'utf-16be';
    }
  }
  return null;
}

