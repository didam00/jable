import type { TableData } from '../agents/store/types';

export interface HistoryState {
  data: TableData;
  timestamp: number;
}

export interface Tab {
  id: string;
  name: string;
  data: TableData | string; // TableData 또는 .toon 압축 문자열
  isCompressed?: boolean; // .toon 압축 여부
  isModified: boolean;
  file?: File | { path: string; name: string } | null;
  filePath?: string; // Tauri 환경에서 파일 경로 저장
  fileFormat?: 'json' | 'csv' | 'xml' | 'toon'; // 원본 파일 형식 저장
  history?: HistoryState[]; // 탭별 히스토리
  historyIndex?: number; // 현재 히스토리 인덱스
}

