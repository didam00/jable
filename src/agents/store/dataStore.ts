/**
 * 데이터 스토어 Agent - 상태 관리 및 히스토리
 */
import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { TableData, Row } from './types';
import type { HistoryState } from '../../types/tab';
import { settingsStore } from '../settings/settings';

class DataStore {
  private store: Writable<TableData>;
  private currentTabId: string | null = null;
  private tabHistories: Map<string, { history: HistoryState[]; historyIndex: number }> = new Map();
  private currentData: TableData | null = null;
  private historyTimeout: ReturnType<typeof setTimeout> | null = null;
  private skipNextHistory = false; // 다음 히스토리 추가를 스킵할지 여부
  
  // 현재 탭의 히스토리 접근 헬퍼
  private getCurrentHistory() {
    if (!this.currentTabId) return null;
    if (!this.tabHistories.has(this.currentTabId)) {
      this.tabHistories.set(this.currentTabId, { history: [], historyIndex: -1 });
    }
    return this.tabHistories.get(this.currentTabId)!;
  }

  constructor() {
    this.store = writable<TableData>({
      columns: [],
      rows: [],
      metadata: {
        rowCount: 0,
        columnCount: 0,
        isFlat: true,
      },
    });
  }

  get subscribe() {
    return this.store.subscribe;
  }

  // 현재 탭 ID 설정 (탭 전환 시 호출)
  setCurrentTab(tabId: string | null) {
    this.currentTabId = tabId;
    if (tabId) {
      // 탭 히스토리 초기화 (없으면)
      if (!this.tabHistories.has(tabId)) {
        this.tabHistories.set(tabId, { history: [], historyIndex: -1 });
      }
    }
  }

  // 탭의 히스토리 복원 (탭 전환 시 호출)
  restoreTabHistory(history: HistoryState[], historyIndex: number) {
    if (!this.currentTabId) return;
    this.tabHistories.set(this.currentTabId, { history, historyIndex });
  }

  // 현재 탭의 히스토리 가져오기
  getTabHistory(): { history: HistoryState[]; historyIndex: number } | null {
    return this.getCurrentHistory();
  }

  set(data: TableData, skipHistory = false) {
    this.skipNextHistory = skipHistory;
    if (!skipHistory) {
      this.debouncedAddToHistory();
    }
    this.currentData = data;
    this.store.set(data);
  }

  update(updater: (data: TableData) => TableData, skipHistory = false) {
    this.skipNextHistory = skipHistory;
    this.store.update((data) => {
      if (!skipHistory) {
        this.debouncedAddToHistory();
      }
      const newData = updater(data);
      this.currentData = newData;
      return newData;
    });
  }
  
  // 히스토리 추가를 debounce하여 연속된 변경을 묶어서 처리
  private debouncedAddToHistory() {
    // 기존 타이머 취소
    if (this.historyTimeout !== null) {
      clearTimeout(this.historyTimeout);
    }
    
    // 새로운 타이머 설정 (데이터가 업데이트된 후 실행)
    this.historyTimeout = setTimeout(() => {
      // 타이머가 실행될 때 currentData를 다시 가져옴
      if (!this.currentData) {
        let latestData: TableData | null = null;
        const unsubscribe = this.store.subscribe((data) => {
          latestData = data;
        });
        unsubscribe();
        this.currentData = latestData;
      }
      
      if (this.currentData && !this.skipNextHistory) {
        this.addToHistoryImmediate(this.currentData);
      }
      this.historyTimeout = null;
    }, settingsStore.get().historyDelay);
  }

  // 히스토리 추가 (즉시 실행, 대용량 데이터 최적화)
  private addToHistoryImmediate(dataToSave: TableData) {
    if (!dataToSave || !this.currentTabId) return;
    
    const historyState = this.getCurrentHistory();
    if (!historyState) return;
    
    const maxHistorySize = settingsStore.get().maxHistorySize;
    const isLargeData = dataToSave.rows.length > 10000;
    const effectiveMaxHistorySize = isLargeData ? Math.min(5, maxHistorySize) : maxHistorySize;
    
    try {
      if (historyState.historyIndex < historyState.history.length - 1) {
        historyState.history = historyState.history.slice(0, historyState.historyIndex + 1);
      }
      
      // 대용량 데이터의 경우 requestIdleCallback으로 배치 처리
      if (isLargeData) {
        requestIdleCallback(() => {
          const clonedData = this.cloneDataOptimized(dataToSave);
          historyState.history.push({
            data: clonedData,
            timestamp: Date.now(),
          });
          
          if (historyState.history.length > effectiveMaxHistorySize) {
            historyState.history.shift();
          } else {
            historyState.historyIndex++;
          }
        }, { timeout: 100 });
      } else {
        // 작은 데이터는 즉시 복사
        historyState.history.push({
          data: this.cloneDataOptimized(dataToSave),
          timestamp: Date.now(),
        });
        
        if (historyState.history.length > effectiveMaxHistorySize) {
          historyState.history.shift();
        } else {
          historyState.historyIndex++;
        }
      }
    } catch (e) {
      console.warn('Failed to add to history:', e);
    }
  }
  
  // 데이터 복사 최적화 (구조적 공유 시도)
  private cloneDataOptimized(data: TableData): TableData {
    // 대용량 데이터는 깊은 복사 최소화
    if (data.rows.length > 10000) {
      // 메타데이터만 복사하고 참조 유지 시도 (하지만 Svelte reactivity를 위해 완전 복사 필요)
      // 일단 JSON.parse(JSON.stringify()) 사용하되, 배치 처리로 실행
      return JSON.parse(JSON.stringify(data));
    }
    return JSON.parse(JSON.stringify(data));
  }

  undo() {
    const historyState = this.getCurrentHistory();
    if (!historyState || historyState.historyIndex <= 0) return;
    
    historyState.historyIndex--;
    const state = historyState.history[historyState.historyIndex];
    const data = JSON.parse(JSON.stringify(state.data));
    this.currentData = data;
    this.skipNextHistory = true; // undo 시 히스토리 추가 스킵
    this.set(data, true); // 내부 set 메서드 호출
  }

  redo() {
    const historyState = this.getCurrentHistory();
    if (!historyState || historyState.historyIndex >= historyState.history.length - 1) return;
    
    historyState.historyIndex++;
    const state = historyState.history[historyState.historyIndex];
    const data = JSON.parse(JSON.stringify(state.data));
    this.currentData = data;
    this.skipNextHistory = true; // redo 시 히스토리 추가 스킵
    this.set(data, true); // 내부 set 메서드 호출
  }

  canUndo(): boolean {
    const historyState = this.getCurrentHistory();
    return historyState ? historyState.historyIndex > 0 : false;
  }

  canRedo(): boolean {
    const historyState = this.getCurrentHistory();
    return historyState ? historyState.historyIndex < historyState.history.length - 1 : false;
  }

  // 탭의 히스토리 삭제 (탭 닫기 시 호출)
  deleteTabHistory(tabId: string) {
    this.tabHistories.delete(tabId);
  }

  getCurrentData(): TableData {
    if (!this.currentData) {
      let data: TableData = {
        columns: [],
        rows: [],
        metadata: { rowCount: 0, columnCount: 0, isFlat: true },
      };
      this.store.subscribe((value) => {
        data = value;
      })();
      this.currentData = data;
    }
    return this.currentData;
  }


  merge(newData: TableData): TableData {
    if (!this.currentData) {
      this.store.subscribe((data) => {
        this.currentData = data;
      })();
    }

    if (!this.currentData || this.currentData.rows.length === 0) {
      return newData;
    }

    // 컬럼 병합 (중복 제거)
    const existingColumnKeys = new Set(this.currentData.columns.map((col) => col.key));
    const newColumns = this.currentData.columns.slice();
    newData.columns.forEach((col) => {
      if (!existingColumnKeys.has(col.key)) {
        newColumns.push(col);
        existingColumnKeys.add(col.key);
      }
    });

    // 행 병합 (모든 행 추가)
    const mergedRows = [...this.currentData.rows];
    const maxRowId = Math.max(
      ...mergedRows.map((row) => {
        const match = row.id.match(/row_(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      }),
      0
    );

    newData.rows.forEach((row, index) => {
      const newRow: Row = {
        id: `row_${maxRowId + index + 1}`,
        cells: { ...row.cells },
      };
      // 기존 컬럼에 대한 빈 셀 추가
      this.currentData!.columns.forEach((col) => {
        if (!newRow.cells[col.key]) {
          newRow.cells[col.key] = { value: '', type: 'string' };
        }
      });
      mergedRows.push(newRow);
    });

    const merged: TableData = {
      columns: newColumns,
      rows: mergedRows,
      metadata: {
        rowCount: mergedRows.length,
        columnCount: newColumns.length,
        isFlat: this.currentData.metadata.isFlat && newData.metadata.isFlat,
      },
    };

    return merged;
  }
}

export const dataStore = new DataStore();

