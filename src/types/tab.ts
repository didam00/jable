import type { TableData } from '../agents/store/types';

export interface Tab {
  id: string;
  name: string;
  data: TableData;
  isModified: boolean;
  file?: File | null;
}

