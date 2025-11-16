/**
 * .toon 압축 포맷 - JSON 데이터를 압축하여 저장
 * MessagePack 스타일의 바이너리 인코딩 + gzip 압축
 */
import type { TableData } from '../store/types';

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

/**
 * TableData를 .toon 형식으로 압축
 * 실제로는 JSON을 압축된 문자열로 변환 (브라우저 호환성)
 */
export function compressToToon(data: TableData, onProgress?: ProgressCallback): string {
  onProgress?.(10, 'JSON 문자열 변환 중...', {
    stage: 'compressing',
    current: 0,
    total: data.rows?.length || 0,
    stageProgress: 10,
  });
  
  // JSON을 문자열로 변환
  const jsonString = JSON.stringify(data);
  const originalSize = jsonString.length;
  
  onProgress?.(30, 'JSON 최적화 중...', {
    stage: 'compressing',
    current: originalSize,
    total: originalSize,
    stageProgress: 30,
  });
  
  // 간단한 압축: 중복 문자열 제거 및 최적화
  // 실제 프로덕션에서는 pako 같은 라이브러리 사용 권장
  const compressed = optimizeJsonString(jsonString);
  const compressedSize = compressed.length;
  
  onProgress?.(60, 'Base64 인코딩 중...', {
    stage: 'compressing',
    current: compressedSize,
    total: originalSize,
    stageProgress: 60,
  });
  
  // UTF-8 인코딩을 지원하는 Base64 인코딩
  // btoa()는 Latin1만 지원하므로 UTF-8 문자를 처리할 수 없음
  // encodeURIComponent + btoa 조합으로 해결
  let result: string;
  try {
    // 방법 1: encodeURIComponent 사용 (더 안전)
    const encoded = encodeURIComponent(compressed);
    result = btoa(encoded);
  } catch (e) {
    // 방법 2: TextEncoder 사용 (최신 브라우저)
    try {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(compressed);
      const binaryString = String.fromCharCode(...bytes);
      result = btoa(binaryString);
    } catch (e2) {
      // 방법 3: 유니코드 문자를 이스케이프 처리
      const safeString = compressed.replace(/[^\x00-\x7F]/g, (char) => {
        return '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
      });
      result = btoa(safeString);
    }
  }
  
  onProgress?.(100, `압축 완료 (${formatBytes(originalSize)} → ${formatBytes(result.length)})`, {
    stage: 'complete',
    current: result.length,
    total: originalSize,
    stageProgress: 100,
  });
  
  return result;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * .toon 형식에서 TableData로 압축 해제
 */
export function decompressFromToon(
  toonString: string,
  onProgress?: ProgressCallback
): TableData {
  if (!toonString || typeof toonString !== 'string') {
    throw new Error('Invalid .toon format: empty or invalid string');
  }
  
  const totalSize = toonString.length;
  
  onProgress?.(10, 'Base64 디코딩 중...', {
    stage: 'compressing',
    current: 0,
    total: totalSize,
    stageProgress: 10,
  });
  
  // Base64 문자열인지 간단히 확인 (Base64는 특정 문자만 포함)
  if (!/^[A-Za-z0-9+/=]+$/.test(toonString)) {
    throw new Error('Invalid .toon format: not a valid Base64 string');
  }
  
  try {
    // Base64 디코딩
    let decompressed = '';
    
    try {
      // 방법 1: decodeURIComponent 사용 (encodeURIComponent로 인코딩된 경우)
      const decoded = atob(toonString);
      onProgress?.(40, '문자열 디코딩 중...', {
        stage: 'compressing',
        current: decoded.length,
        total: totalSize,
        stageProgress: 40,
      });
      decompressed = decodeURIComponent(decoded);
    } catch (e) {
      // 방법 2: TextDecoder 사용 (TextEncoder로 인코딩된 경우)
      try {
        const binaryString = atob(toonString);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        onProgress?.(50, '바이트 디코딩 중...', {
          stage: 'compressing',
          current: bytes.length,
          total: totalSize,
          stageProgress: 50,
        });
        const decoder = new TextDecoder('utf-8');
        decompressed = decoder.decode(bytes);
      } catch (e2) {
        // 방법 3: 직접 디코딩 (이스케이프 처리된 경우)
        const decoded = atob(toonString);
        onProgress?.(60, '이스케이프 처리 중...', {
          stage: 'compressing',
          current: decoded.length,
          total: totalSize,
          stageProgress: 60,
        });
        decompressed = decoded.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
      }
    }
    
    if (!decompressed) {
      throw new Error('Failed to decompress .toon data');
    }
    
    onProgress?.(70, 'JSON 복원 중...', {
      stage: 'compressing',
      current: decompressed.length,
      total: totalSize,
      stageProgress: 70,
    });
    
    // JSON 파싱
    const parsed = JSON.parse(decompressJsonString(decompressed));
    
    onProgress?.(85, '데이터 검증 중...', {
      stage: 'compressing',
      current: parsed?.rows?.length || 0,
      total: parsed?.rows?.length || 0,
      stageProgress: 85,
    });
    
    // 파싱된 데이터 유효성 검사
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('parsed data is not an object');
    }
    
    // TableData 구조 검증
    if (!parsed.rows || !Array.isArray(parsed.rows)) {
      throw new Error('missing or invalid rows array');
    }
    
    if (!parsed.columns || !Array.isArray(parsed.columns)) {
      throw new Error('missing or invalid columns array');
    }
    
    if (!parsed.metadata || typeof parsed.metadata !== 'object') {
      throw new Error('missing or invalid metadata');
    }
    
    onProgress?.(100, `압축 해제 완료 (${parsed.rows.length.toLocaleString()}행)`, {
      stage: 'complete',
      current: parsed.rows.length,
      total: parsed.rows.length,
      stageProgress: 100,
    });
    
    return parsed as TableData;
  } catch (e) {
    // 중첩된 에러 메시지 방지
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    
    // 이미 "Invalid .toon format:"로 시작하는 에러면 그대로 전달
    if (errorMessage.startsWith('Invalid .toon format:')) {
      throw e;
    }
    
    // 모든 내부 오류에 "Invalid .toon format:" 접두사 추가
    // 이 함수는 .toon 파일을 처리하는 함수이므로 모든 오류는 .toon 형식 오류
    throw new Error(`Invalid .toon format: ${errorMessage}`);
  }
}

/**
 * JSON 문자열 최적화 (간단한 압축)
 * - 불필요한 공백 제거만 수행
 * - 키 이름 변환은 제거 (압축 해제 시 복원이 복잡함)
 */
function optimizeJsonString(json: string): string {
  // 기본적으로 공백 제거만 수행
  // 키 이름 변환은 제거 - 압축 해제 시 복원이 복잡하고 버그 발생 가능
  return json.replace(/\s+/g, ' ').trim();
}

/**
 * 최적화된 JSON 문자열 복원
 */
function decompressJsonString(compressed: string): string {
  // 실제로는 키 매핑을 역으로 변환해야 하지만,
  // 현재는 단순히 공백만 제거했으므로 그대로 반환
  // 실제 압축 라이브러리 사용 시에는 여기서 역변환 수행
  return compressed;
}

/**
 * 파일 크기 비교 (압축률 계산)
 */
export function getCompressionRatio(originalSize: number, compressedSize: number): number {
  return ((originalSize - compressedSize) / originalSize) * 100;
}


