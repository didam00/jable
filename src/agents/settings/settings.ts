/**
 * 설정 Agent - 애플리케이션 설정 관리
 */
import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

export interface AppSettings {
  maxHistorySize: number; // 최대 히스토리 개수
  maxVisibleRows: number; // 최대로 위아래 불러와지는 행의 개수
  bufferRows: number; // 버퍼 행 수
  historyDelay: number; // 히스토리 추가 지연 시간 (ms)
  renderRowLimit: number; // 렌더링할 최대 행 수 (-1은 제한 없음)
  maxChildArray: number; // 배열형 하위 열의 최대 세로 표시 개수 (-1은 제한 없음)
  maxHeaderRows: number; // 헤더에서 표시할 최대 층수 (-1은 제한 없음)
  rowHeight: number; // 슬롯(행) 높이
  transformVariableName: string; // 단일 값 변환 변수명
  transformArrayVariableName: string; // 배열 변환 변수명
  streamingThresholdKB: number; // 스트리밍 모드 임계값 (KB, 기본값: 204800 = 200MB)
}

const DEFAULT_SETTINGS: AppSettings = {
  maxHistorySize: 50,
  maxVisibleRows: 50,
  bufferRows: 25,
  historyDelay: 500,
  renderRowLimit: -1,
  maxChildArray: -1,
  maxHeaderRows: -1,
  rowHeight: 32,
  transformVariableName: 'cell',
  transformArrayVariableName: 'list',
  streamingThresholdKB: 204800, // 기본값: 204800KB (200MB)
};

const SETTINGS_STORAGE_KEY = 'json-editor-settings';

class SettingsStore {
  private store: Writable<AppSettings>;

  constructor() {
    // 로컬스토리지에서 설정 로드
    const savedSettings = this.loadFromStorage();
    const initialSettings = savedSettings || DEFAULT_SETTINGS;
    
    this.store = writable<AppSettings>(initialSettings);
    
    // 설정 변경 시 로컬스토리지에 저장
    this.store.subscribe((settings) => {
      this.saveToStorage(settings);
    });
  }

  get subscribe() {
    return this.store.subscribe;
  }

  update(updater: (settings: AppSettings) => AppSettings) {
    this.store.update(updater);
  }

  set(settings: AppSettings) {
    this.store.set(settings);
  }

  get(): AppSettings {
    let currentSettings: AppSettings = DEFAULT_SETTINGS;
    const unsubscribe = this.store.subscribe((settings) => {
      currentSettings = settings;
    });
    unsubscribe();
    return currentSettings;
  }

  reset() {
    this.store.set(DEFAULT_SETTINGS);
  }

  private loadFromStorage(): AppSettings | null {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // 기본값과 병합하여 누락된 설정 추가
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load settings from storage:', e);
    }
    return null;
  }

  private saveToStorage(settings: AppSettings) {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings to storage:', e);
    }
  }
}

export const settingsStore = new SettingsStore();

