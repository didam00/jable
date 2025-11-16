export interface Cell {
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
}

export interface Row {
  id: string;
  cells: Record<string, Cell>;
}

export interface Column {
  key: string;
  label: string;
  type: string;
  width?: number;
  frozen?: boolean;
}

export interface TableData {
  columns: Column[];
  rows: Row[];
  metadata: {
    rowCount: number;
    columnCount: number;
    isFlat: boolean;
  };
}

