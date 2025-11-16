import type { TableData } from '../agents/store/types';

export interface Tab {
  id: string;
  name: string;
  data: TableData;
  isModified: boolean;
  file?: File | { path: string; name: string } | null;
  filePath?: string; // Tauri 환경에서 파일 경로 저장
  fileFormat?: 'json' | 'csv' | 'xml'; // 원본 파일 형식 저장
}

