import type { TableData } from '../store/types';

export interface ParserResult {
  success: boolean;
  data?: TableData;
  error?: string;
}

