/**
 * 데이터 스토어 Agent - 상태 관리 및 히스토리
 */
import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { TableData, Row } from './types';

interface HistoryState {
  data: TableData;
  timestamp: number;
}

class DataStore {
  private store: Writable<TableData>;
  private history: HistoryState[] = [];
  private historyIndex: number = -1;
  private maxHistorySize: number = 50;
  private currentData: TableData | null = null;

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

  set(data: TableData) {
    this.addToHistory();
    this.currentData = data;
    this.store.set(data);
    this.saveToLocalStorage(data);
  }

  update(updater: (data: TableData) => TableData) {
    this.store.update((data) => {
      this.addToHistory();
      const newData = updater(data);
      this.currentData = newData;
      this.saveToLocalStorage(newData);
      return newData;
    });
  }

  private addToHistory() {
    if (!this.currentData) {
      this.store.subscribe((data) => {
        this.currentData = data;
      })();
    }

    if (this.currentData) {
      if (this.historyIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIndex + 1);
      }
      this.history.push({
        data: JSON.parse(JSON.stringify(this.currentData)),
        timestamp: Date.now(),
      });
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      } else {
        this.historyIndex++;
      }
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const state = this.history[this.historyIndex];
      const data = JSON.parse(JSON.stringify(state.data));
      this.currentData = data;
      this.store.set(data);
      this.saveToLocalStorage(data);
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const state = this.history[this.historyIndex];
      const data = JSON.parse(JSON.stringify(state.data));
      this.currentData = data;
      this.store.set(data);
      this.saveToLocalStorage(data);
    }
  }

  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
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

  private saveToLocalStorage(data: TableData) {
    try {
      localStorage.setItem('json-editor-data', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save to localStorage', e);
    }
  }

  loadFromLocalStorage(): boolean {
    try {
      const stored = localStorage.getItem('json-editor-data');
      if (stored) {
        const data = JSON.parse(stored);
        this.currentData = data;
        this.store.set(data);
        return true;
      }
    } catch (e) {
      console.warn('Failed to load from localStorage', e);
    }
    return false;
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

