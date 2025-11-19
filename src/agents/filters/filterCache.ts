/**
 * 필터 캐시 Agent - 컬럼별 필터 값 캐싱
 */
import type { TableData } from '../store/types';
import { getColumnValues } from './filters';

interface FilterCacheEntry {
  values: any[];
  dataHash: string;
  rowCount: number;
  columnKey: string;
}

class FilterCache {
  private cache: Map<string, FilterCacheEntry> = new Map();

  /**
   * 데이터 해시 생성 (행 개수 + 각 행의 해당 열 값 시그니처)
   */
  private generateDataHash(data: TableData, columnKey: string): string {
    const rowCount = data.rows.length;
    // 성능 최적화: 대용량 데이터는 행 개수와 샘플만 사용
    if (rowCount > 10000) {
      // 대용량 데이터는 행 개수와 처음/끝 몇 개 행의 값만 사용
      const sampleSize = 100;
      const samples: string[] = [];
      for (let i = 0; i < Math.min(sampleSize, rowCount); i++) {
        const row = data.rows[i];
        const cell = row.cells[columnKey];
        samples.push(String(cell?.value ?? ''));
      }
      for (let i = Math.max(0, rowCount - sampleSize); i < rowCount; i++) {
        const row = data.rows[i];
        const cell = row.cells[columnKey];
        samples.push(String(cell?.value ?? ''));
      }
      return `${rowCount}:${samples.join('|')}`;
    } else {
      // 작은 데이터는 모든 행의 값 사용
      const signatures = data.rows.map((row) => {
        const cell = row.cells[columnKey];
        return String(cell?.value ?? '');
      });
      return `${rowCount}:${signatures.join('|')}`;
    }
  }

  /**
   * 캐시에서 필터 값 가져오기
   */
  getCachedValues(data: TableData, columnKey: string): any[] | null {
    const cacheKey = columnKey;
    const entry = this.cache.get(cacheKey);
    
    if (!entry) {
      return null;
    }

    // 데이터 해시 비교하여 캐시 유효성 검사
    const currentHash = this.generateDataHash(data, columnKey);
    const currentRowCount = data.rows.length;

    // 행 개수가 다르거나 해시가 다르면 캐시 무효
    if (entry.rowCount !== currentRowCount || entry.dataHash !== currentHash) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.values;
  }

  /**
   * 필터 값 캐시에 저장
   */
  setCachedValues(data: TableData, columnKey: string, values: any[]): void {
    const cacheKey = columnKey;
    const dataHash = this.generateDataHash(data, columnKey);
    const rowCount = data.rows.length;

    this.cache.set(cacheKey, {
      values,
      dataHash,
      rowCount,
      columnKey,
    });
  }

  /**
   * 특정 컬럼의 캐시 무효화
   */
  invalidateColumn(columnKey: string): void {
    this.cache.delete(columnKey);
  }

  /**
   * 모든 캐시 무효화
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * 필터 값 가져오기 (캐시 사용)
   */
  getColumnValues(data: TableData, columnKey: string): any[] {
    // 캐시에서 먼저 확인
    const cached = this.getCachedValues(data, columnKey);
    if (cached !== null) {
      return cached;
    }

    // 캐시에 없으면 계산하고 캐시에 저장
    const values = getColumnValues(data, columnKey);
    this.setCachedValues(data, columnKey, values);
    return values;
  }
}

export const filterCache = new FilterCache();

