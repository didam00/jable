<script lang="ts">
import { dataStore } from '../agents/store';
import type { TableData, Row, Column } from '../agents/store';
import { sortRows } from '../agents/filters';
import ColumnFilter from './ColumnFilter.svelte';
// @ts-ignore - Svelte 컴포넌트는 자동으로 default export를 생성합니다
import ColumnTransformDialog from './ColumnTransformDialog.svelte';
import ContextMenu from './ContextMenu.svelte';
import ImageViewer from './ImageViewer.svelte';
import { executeFunctionSync, DELETE_MARKER } from '../utils/safeFunctionExecutor';
import { onMount, createEventDispatcher } from 'svelte';
import { settingsStore } from '../agents/settings/settings';
import type { AppSettings } from '../agents/settings/settings';
  
const dispatch = createEventDispatcher();

const DEFAULT_COLUMN_WIDTH = 200;
const ROW_NUMBER_WIDTH = 60;
const HEADER_ROW_HEIGHT = 28;
const PRIMITIVE_ARRAY_FIELD_KEY = '__value__';

export let searchMatchedRowIds: Set<string> = new Set();
export let searchFilteredColumnKeys: string[] | null = null;

let data: TableData = {
  columns: [],
  rows: [],
  metadata: { rowCount: 0, columnCount: 0, isFlat: true },
};

let scrollLeft = 0;
let header: HTMLDivElement;
let sortColumn: string | null = null;
let sortDirection: 'asc' | 'desc' = 'asc';
let filteredRows: Row[] = [];
let renderRowCount = 0;
let columnWidths: Map<string, number> = new Map();
type ColumnFilterValue =
  | { kind: 'text'; value: string }
  | { kind: 'null' }
  | { kind: 'undefined' }
  | { kind: 'empty' };

let activeFilters: Map<string, ColumnFilterValue> = new Map();
let resizingColumn: string | null = null;
let resizeStartX = 0;
let resizeStartWidth = 0;
let resizePreviewWidth = 0;
let resizeGuideLine: { x: number; visible: boolean } = { x: 0, visible: false };
let selectedColumns: Set<string> = new Set();
let showTransformDialog = false;
let openFilterColumn: string | null = null;
let contextMenu: { x: number; y: number; items: any[] } | null = null;
let showImageViewer = false;
let imageViewerUrl = '';
let isSelectingColumns = false;
let selectionStartColumn: string | null = null;
let lastClickedColumn: string | null = null;
let draggingColumn: string | null = null;
let dragOverColumn: string | null = null;
let dragStartX = 0;
let dragCurrentX = 0;
let dragColumnElement: HTMLElement | null = null;
let dragGhost: HTMLElement | null = null;
let dragColumnElementsCache: HTMLElement[] | null = null;
let dragAnimationFrame: number | null = null;
let draggingColumnParentKey = '';
let editingCell: { rowId: string; columnKey: string } | null = null;
let editingValue: string = '';
let maxVisibleRows = 50;
let bufferRows = 25;
let renderRowLimit = -1;
let maxChildArray = -1;
let maxHeaderRows = -1;
let rowHeight = 32;
let expandedChildArrays: Set<string> = new Set();
let arrayAwareColumns: Column[] = [];
let displayColumnMeta: Map<string, DisplayColumnMeta> = new Map();
let displayColumns: Column[] = [];
let tableBodyHeight = 0;
let rowHeights: number[] = [];
let rowOffsets: number[] = [];
let totalTableHeight = 0;
let rowDisplaySlotCount: Map<string, number> = new Map();
let arrayDisplayCache: Map<string, Map<string, ArrayDisplayMetrics>> = new Map();
let tableContainer: HTMLDivElement;
let resizeObserver: ResizeObserver | null = null;
let visibleStartIndex = 0;
let visibleEndIndex = 0;
let visibleRows: Row[] = [];
let topSpacerHeight = 0;
let bottomSpacerHeight = 0;
let originalRowIndexMap = new Map<string, number>();
let lastDataRowsLength = 0;
let lastDataRowsRef: Row[] | null = null;
interface RowIndexBuildState {
  cancelled: boolean;
  idleHandle: number | null;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  rowsRef: Row[];
  cancelScheduled: (() => void) | null;
}
let rowIndexBuildState: RowIndexBuildState | null = null;
let lastScrollTop = -1;
let lastContainerHeight = -1;
let lastRenderRowCount = -1;
let scrollAnimationFrame: number | null = null;
let lastFilterState = '';
let filterUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
let lastDataRef: TableData | null = null;
let lastDataHash = '';
let lastSearchMatchedRef: Set<string> | null = null;
let lastSearchMatchedSize = 0;
let filterUpdateFrame: number | null = null;
let lastFilteredRowsRef: Row[] | null = null;
let flatColumns: Column[] = [];
let columnHeaderTree: ColumnHeaderTreeNode[] = [];
let headerGridItems: HeaderGridItem[] = [];
let headerGridTemplateColumns = '';
let headerGridRowStyle = '';
let headerDepth = 1;
let hasNestedHeaders = false;
let columnParentMap: Map<string, string> = new Map();
let headerScrollStyle = '';
const imageUrlCache = new Map<string, boolean>();
let dialogTargetRows: Row[] = [];
let dialogTargetIsFiltered = false;
let dialogTargetFilteredEmpty = false;

function sanitizeVariableIdentifier(name: string | undefined, fallback: string): string {
  if (!name) return fallback;
  const trimmed = name.trim();
  if (!trimmed) return fallback;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed) ? trimmed : fallback;
}

function hasFilterContext(): boolean {
  return activeFilters.size > 0 || (searchMatchedRowIds?.size ?? 0) > 0;
}

interface TransformSnapshotOptions {
  allowFallback?: boolean;
}

function getTransformTargetRowsSnapshot(options?: TransformSnapshotOptions): Row[] {
  const filteredCount = filteredRows.length;
  const hasContext = hasFilterContext();
  if (filteredCount > 0) {
    return filteredRows;
  }
  if (hasContext && !options?.allowFallback) {
    return [];
  }
  return data?.rows ?? [];
}
  
function applySettings(settings: AppSettings) {
  maxVisibleRows = settings.maxVisibleRows;
  bufferRows = settings.bufferRows;
  renderRowLimit = settings.renderRowLimit;
  maxChildArray = settings.maxChildArray;
  maxHeaderRows = settings.maxHeaderRows;
  rowHeight = Math.max(16, settings.rowHeight || 32);
  recomputeDisplayStructures();
}
  
applySettings(settingsStore.get());

interface ColumnHeaderTreeNode {
  path: string;
  label: string;
  depth: number;
  parentPath: string;
  column?: Column;
  children: ColumnHeaderTreeNode[];
  leafCount?: number;
  startIndex?: number;
}

interface HeaderGridItem {
  path: string;
  label: string;
  gridColumn: string;
  gridRow: string;
  column?: Column;
  isLeaf: boolean;
}

interface ArrayDisplayMetrics {
  items: any[];
  showMore: boolean;
  displayCount: number;
  totalCount: number;
}

interface DisplayColumnMeta {
  kind: 'scalar' | 'array-child';
  baseColumnKey: string;
  parentKey?: string;
  fieldPath?: string[];
}

function getColumnParentKey(columnKey: string): string {
  const parts = columnKey.split('.');
  parts.pop();
  return parts.join('.');
}

function buildColumnHeaderTree(columns: Column[]): ColumnHeaderTreeNode[] {
  const rootChildren: ColumnHeaderTreeNode[] = [];
  const pathMap = new Map<string, ColumnHeaderTreeNode>();

  columns.forEach((column) => {
    const parts = column.key.split('.');
    let parentPath = '';
    let siblings = rootChildren;

    parts.forEach((part, index) => {
      const currentPath = parentPath ? `${parentPath}.${part}` : part;
      let node = pathMap.get(currentPath);

      if (!node) {
        node = {
          path: currentPath,
          label: index === parts.length - 1 ? column.label : part,
          depth: index + 1,
          parentPath,
          column: index === parts.length - 1 ? column : undefined,
          children: [],
        };
        pathMap.set(currentPath, node);
        siblings.push(node);
      } else if (index === parts.length - 1) {
        node.column = column;
        node.label = column.label;
      }

      parentPath = currentPath;
      siblings = node.children;
    });
  });

  return rootChildren;
}

function parseFilterValue(rawValue: string): ColumnFilterValue | null {
  if (rawValue === '__SPECIAL_NULL__') {
    return { kind: 'null' };
  }
  if (rawValue === '__SPECIAL_UNDEFINED__') {
    return { kind: 'undefined' };
  }
  if (rawValue === '__SPECIAL_EMPTY__') {
    return { kind: 'empty' };
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.toLowerCase();
  if (normalized === 'null') {
    return { kind: 'null' };
  }
  if (normalized === 'undefined') {
    return { kind: 'undefined' };
  }
  if (normalized === '""' || normalized === 'empty' || normalized === '(빈 문자열)') {
    return { kind: 'empty' };
  }
  return { kind: 'text', value: rawValue };
}

function normalizeCellText(value: any): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  return String(value ?? '');
}

function matchesFilter(row: Row, columnKey: string, filter: ColumnFilterValue): boolean {
  const cell = row.cells[columnKey];
  const cellValue = cell ? cell.value : undefined;
  switch (filter.kind) {
    case 'null':
      return cellValue === null;
    case 'undefined':
      return !cell || cellValue === undefined;
    case 'empty':
      return cellValue === '';
    case 'text': {
      const haystack = normalizeCellText(cellValue).toLowerCase();
      return haystack.includes(filter.value.toLowerCase());
    }
    default:
      return true;
  }
}

function rowMatchesAllFilters(row: Row, filters: Array<[string, ColumnFilterValue]>): boolean {
  for (const [columnKey, filter] of filters) {
    if (!matchesFilter(row, columnKey, filter)) {
      return false;
    }
  }
  return true;
}

function getFilterSnapshot(): Array<[string, ColumnFilterValue]> {
  return Array.from(activeFilters.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function describeFilterValue(filter: ColumnFilterValue): string {
  switch (filter.kind) {
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'empty':
      return '(빈 문자열)';
    case 'text':
    default:
      return filter.value;
  }
}

function getMaxHeaderDepth(nodes: ColumnHeaderTreeNode[]): number {
  let maxDepth = 0;

  const traverse = (nodeList: ColumnHeaderTreeNode[]) => {
    nodeList.forEach((node) => {
      maxDepth = Math.max(maxDepth, node.depth);
      if (node.children.length > 0) {
        traverse(node.children);
      }
    });
  };

  traverse(nodes);
  return Math.max(1, maxDepth);
}

function assignHeaderMetadata(nodes: ColumnHeaderTreeNode[], leafPositions: Map<string, number>): void {
  const assignNode = (node: ColumnHeaderTreeNode): { startIndex: number; leafCount: number } => {
    if (node.children.length === 0 && node.column) {
      const startIndex = leafPositions.get(node.column.key) ?? 2;
      node.startIndex = startIndex;
      node.leafCount = 1;
      return { startIndex, leafCount: 1 };
    }

    let startIndex = Number.MAX_SAFE_INTEGER;
    let leafCount = 0;

    node.children.forEach((child) => {
      const childMeta = assignNode(child);
      startIndex = Math.min(startIndex, childMeta.startIndex);
      leafCount += childMeta.leafCount;
    });

    node.startIndex = startIndex === Number.MAX_SAFE_INTEGER ? 2 : startIndex;
    node.leafCount = leafCount;

    return { startIndex: node.startIndex, leafCount };
  };

  nodes.forEach(assignNode);
}

function collectHeaderGridItems(
  nodes: ColumnHeaderTreeNode[],
  depth: number
): HeaderGridItem[] {
  const items: HeaderGridItem[] = [];

  const visit = (node: ColumnHeaderTreeNode) => {
    if (node.children.length > 0) {
      if (node.startIndex !== undefined && node.leafCount !== undefined && node.leafCount > 0) {
        items.push({
          path: node.path,
          label: node.label,
          gridColumn: `${node.startIndex} / ${node.startIndex + node.leafCount}`,
          gridRow: `${node.depth}`,
          isLeaf: false,
        });
      }
      node.children.forEach(visit);
      return;
    }

    if (node.column && node.startIndex !== undefined) {
      items.push({
        path: node.path,
        label: node.label,
        gridColumn: `${node.startIndex}`,
        gridRow: `${node.depth} / ${depth + 1}`,
        column: node.column,
        isLeaf: true,
      });
    }
  };

  nodes.forEach(visit);
  return items;
}

function buildColumnMetadata() {
  arrayAwareColumns = data.columns.filter((col) => col.type === 'array');
  buildDisplayColumns();
}

function buildDisplayColumns() {
  displayColumns = [];
  displayColumnMeta = new Map();

  data.columns.forEach((column) => {
    if (column.type === 'array') {
      const fields = collectArrayFieldsForColumn(column.key);
      if (fields.length === 0) {
        displayColumns.push(column);
        displayColumnMeta.set(column.key, {
          kind: 'scalar',
          baseColumnKey: column.key,
        });
        return;
      }

      fields.forEach((field) => {
        const fieldPath = field === PRIMITIVE_ARRAY_FIELD_KEY ? [] : field.split('.');
        const key =
          field === PRIMITIVE_ARRAY_FIELD_KEY ? `${column.key}.${PRIMITIVE_ARRAY_FIELD_KEY}` : `${column.key}.${field}`;
        const label = field === PRIMITIVE_ARRAY_FIELD_KEY ? 'value' : fieldPath[fieldPath.length - 1];
        const pseudoColumn: Column = {
          key,
          label,
          type: 'string',
          width: column.width,
        };
        displayColumns.push(pseudoColumn);
        displayColumnMeta.set(key, {
          kind: 'array-child',
          baseColumnKey: column.key,
          parentKey: column.key,
          fieldPath,
        });
      });
    } else {
      displayColumns.push(column);
      displayColumnMeta.set(column.key, {
        kind: 'scalar',
        baseColumnKey: column.key,
      });
    }
  });
}

function collectArrayFieldsForColumn(columnKey: string): string[] {
  const fields = new Set<string>();
  const sampleLimit = Math.min(data.rows.length, 200);

  for (let i = 0; i < sampleLimit; i++) {
    const row = data.rows[i];
    if (!row) continue;
    const cell = row.cells[columnKey];
    const value = cell?.value;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        collectFieldsFromEntry(entry, '', fields);
      });
    }
  }

  if (fields.size === 0) {
    return [];
  }
  return Array.from(fields);
}

function collectFieldsFromEntry(entry: any, prefix: string, bucket: Set<string>) {
  if (entry === null || entry === undefined) {
    bucket.add(prefix || PRIMITIVE_ARRAY_FIELD_KEY);
    return;
  }
  if (Array.isArray(entry)) {
    if (entry.length === 0) {
      bucket.add(prefix || PRIMITIVE_ARRAY_FIELD_KEY);
      return;
    }
    collectFieldsFromEntry(entry[0], prefix, bucket);
    return;
  }
  if (typeof entry === 'object') {
    let hasChild = false;
    Object.entries(entry).forEach(([key, value]) => {
      hasChild = true;
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      collectFieldsFromEntry(value, nextPrefix, bucket);
    });
    if (!hasChild) {
      bucket.add(prefix || PRIMITIVE_ARRAY_FIELD_KEY);
    }
    return;
  }
  bucket.add(prefix || PRIMITIVE_ARRAY_FIELD_KEY);
}

function recomputeDisplayStructures() {
  buildColumnMetadata();
  arrayDisplayCache.clear();
  recomputeRowMetrics();
  updateVisibleRows();
}

function recomputeRowMetrics() {
  rowHeights = [];
  rowOffsets = [];
  rowDisplaySlotCount = new Map();

  const limit = renderRowLimit >= 0 ? Math.min(filteredRows.length, renderRowLimit) : filteredRows.length;
  let offset = 0;

  for (let i = 0; i < limit; i++) {
    const row = filteredRows[i];
    const slotCount = Math.max(calculateRowSlotCount(row), 1);
    const height = slotCount * rowHeight;
    rowDisplaySlotCount.set(row.id, slotCount);
    rowHeights.push(height);
    rowOffsets.push(offset);
    offset += height;
  }

  renderRowCount = limit;
  totalTableHeight = offset;
  tableBodyHeight = totalTableHeight;
}

function calculateRowSlotCount(row: Row | undefined): number {
  if (!row) {
    return 1;
  }
  if (arrayAwareColumns.length === 0) {
    return 1;
  }
  let maxSlots = 1;
  for (const column of arrayAwareColumns) {
    const metrics = getArrayDisplayData(row, column.key);
    if (!metrics || metrics.displayCount === 0) {
      continue;
    }
    maxSlots = Math.max(maxSlots, Math.max(metrics.displayCount, 1));
  }
  return maxSlots;
}

function getChildArrayKey(rowId: string, columnKey: string): string {
  return `${rowId}::${columnKey}`;
}

function getArrayDisplayData(row: Row, columnKey: string): ArrayDisplayMetrics | null {
  let rowCache = arrayDisplayCache.get(row.id);
  if (!rowCache) {
    rowCache = new Map();
    arrayDisplayCache.set(row.id, rowCache);
  }
  if (rowCache.has(columnKey)) {
    return rowCache.get(columnKey)!;
  }
  const metrics = computeArrayDisplayMetrics(row, columnKey);
  rowCache.set(columnKey, metrics);
  return metrics;
}

function computeArrayDisplayMetrics(row: Row, columnKey: string): ArrayDisplayMetrics {
  const cell = row.cells[columnKey];
  const value = cell?.value;
  const arrayValues = Array.isArray(value) ? value : [];
  const totalCount = arrayValues.length;
  if (totalCount === 0) {
    return {
      items: [],
      showMore: false,
      displayCount: 0,
      totalCount: 0,
    };
  }

  const key = getChildArrayKey(row.id, columnKey);
  const isExpanded = expandedChildArrays.has(key);

  if (maxChildArray < 0 || isExpanded || totalCount <= maxChildArray) {
    return {
      items: arrayValues,
      showMore: false,
      displayCount: Math.max(totalCount, 1),
      totalCount,
    };
  }

  const dataSlots = Math.max(maxChildArray - 1, 1);
  const items = arrayValues.slice(0, dataSlots);
  return {
    items,
    showMore: true,
    displayCount: Math.max(maxChildArray, 1),
    totalCount,
  };
}

function getArrayEntryFieldValue(entry: any, fieldPath: string[] | undefined): any {
  if (!fieldPath || fieldPath.length === 0) {
    return entry;
  }
  let current = entry;
  for (const part of fieldPath) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current?.[part];
  }
  return current;
}

  onMount(() => {
    const unsubscribe = dataStore.subscribe((value) => {
      // 데이터 참조가 실제로 변경되었을 때만 업데이트
      if (data !== value) {
        data = value;
        initializeColumnWidths();
        buildColumnMetadata();
        expandedChildArrays = new Set();
        arrayDisplayCache.clear();
        lastFilteredRowsRef = null;
        updateStateAndDispatch();
      }
    });
    
    const unsubscribeSettings = settingsStore.subscribe((value) => {
      applySettings(value);
      updateVisibleRows();
    });

    const handleClickOutside = () => {
      if (contextMenu) {
        closeContextMenu();
      }
      // 편집 중인 셀이 있으면 커밋
      if (editingCell) {
        commitCellEdit();
      }
    };
    window.addEventListener('click', handleClickOutside);
    
    // ResizeObserver로 컨테이너 크기 변경 감지 (debounce)
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    if (tableContainer) {
      resizeObserver = new ResizeObserver(() => {
        // debounce로 빠른 연속 리사이즈 방지
        if (resizeTimeout !== null) {
          clearTimeout(resizeTimeout);
        }
        resizeTimeout = setTimeout(() => {
          updateVisibleRows();
          resizeTimeout = null;
        }, 100); // 100ms debounce
      });
      resizeObserver.observe(tableContainer);
    }

    return () => {
      unsubscribe();
      unsubscribeSettings();
      window.removeEventListener('click', handleClickOutside);
      if (resizeObserver && tableContainer) {
        resizeObserver.unobserve(tableContainer);
      }
    };
  });

  function initializeColumnWidths() {
    data.columns.forEach((col) => {
      if (!columnWidths.has(col.key)) {
        columnWidths.set(col.key, col.width || DEFAULT_COLUMN_WIDTH);
      }
    });
  }

  function getColumnWidth(columnKey: string): number {
    return columnWidths.get(columnKey) || DEFAULT_COLUMN_WIDTH;
  }

  function updateColumnWidth(columnKey: string, width: number) {
    columnWidths.set(columnKey, Math.max(50, width));
    dataStore.update((data) => {
      const col = data.columns.find((c) => c.key === columnKey);
      if (col) {
        col.width = columnWidths.get(columnKey);
      }
      return data;
    });
  }

  function startResize(columnKey: string, event: MouseEvent) {
    event.preventDefault();
    resizingColumn = columnKey;
    resizeStartX = event.clientX;
    resizeStartWidth = getColumnWidth(columnKey);
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
  }

  function handleResize(event: MouseEvent) {
    if (!resizingColumn) return;
    const deltaX = event.clientX - resizeStartX;
    const newWidth = Math.max(50, resizeStartWidth + deltaX);
    resizePreviewWidth = newWidth;
    
    // 가이드라인 위치 업데이트
    const container = document.querySelector('.table-container') as HTMLElement;
    if (container) {
      // const containerRect = container.getBoundingClientRect();
      resizeGuideLine = {
        x: container.scrollLeft + event.clientX,
        visible: true
      };
    }
  }

  function stopResize() {
    if (resizingColumn) {
      // mouseup 시에만 실제 너비 업데이트
      updateColumnWidth(resizingColumn, resizePreviewWidth);
    }
    resizingColumn = null;
    resizePreviewWidth = 0;
    resizeGuideLine = { x: 0, visible: false };
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }

  // 필터링 최적화: 캐싱 및 배치 처리
  
  function updateFilteredRows() {
    if (!data || !data.rows) {
      filteredRows = [];
      recomputeRowMetrics();
      forceVisibleRowsRefresh();
      return;
    }
    
    // 현재 필터 상태를 문자열로 만들어서 비교
    const currentFilterState = JSON.stringify({
      searchCount: searchMatchedRowIds.size,
      filters: getFilterSnapshot(),
      sortColumn,
      sortDirection,
      rowsLength: data.rows.length,
    });
    
    // 필터 상태가 변경되지 않았으면 스킵
    if (lastFilterState === currentFilterState && filteredRows.length > 0) {
      return;
    }
    
    lastFilterState = currentFilterState;
    
    // 대용량 데이터의 경우 배치 처리로 최적화
    const isLargeData = data.rows.length > 10000;
    
    let rows = data.rows;
    
    // 검색 결과 필터링 적용
    if (searchMatchedRowIds.size > 0) {
      // Set을 사용하여 O(1) 조회로 최적화
      const matchedSet = searchMatchedRowIds;
      if (isLargeData) {
        // 대용량 데이터는 배치 처리
        const batchSize = 1000;
        const filtered: Row[] = [];
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          filtered.push(...batch.filter((row) => matchedSet.has(row.id)));
          // UI 블로킹 방지를 위해 yield
          if (i % (batchSize * 10) === 0) {
            // 주기적으로 yield하여 UI 반응성 유지
          }
        }
        rows = filtered;
      } else {
        rows = rows.filter((row) => matchedSet.has(row.id));
      }
    }
    
    // 컬럼 필터 적용
    if (activeFilters.size > 0) {
      const filterPairs = getFilterSnapshot();
      if (filterPairs.length > 0) {
        if (isLargeData) {
          // 대용량 데이터는 배치 처리
          const batchSize = 1000;
          const filtered: Row[] = [];
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            filtered.push(...batch.filter((row) => rowMatchesAllFilters(row, filterPairs)));
          }
          rows = filtered;
        } else {
          rows = rows.filter((row) => rowMatchesAllFilters(row, filterPairs));
        }
      }
    }
    
    // 정렬 적용 (대용량 데이터는 정렬 최적화)
    if (sortColumn) {
      if (isLargeData && rows.length > 5000) {
        // 대용량 데이터는 정렬을 지연 처리하거나 부분 정렬
        filteredRows = sortRows(rows, sortColumn, sortDirection);
      } else {
        filteredRows = sortRows(rows, sortColumn, sortDirection);
      }
    } else {
      filteredRows = rows;
    }
  
    // rowHeights가 업데이트되기 전에 updateVisibleRows가 호출되는 것을 방지하기 위해
    // requestAnimationFrame으로 동기화
    if (filterUpdateFrame !== null) {
      cancelAnimationFrame(filterUpdateFrame);
    }
    filterUpdateFrame = requestAnimationFrame(() => {
      arrayDisplayCache.clear();
      recomputeRowMetrics();
      forceVisibleRowsRefresh();
      filterUpdateFrame = null;
    });
  }
  
  function updateStateAndDispatch() {
    // debounce로 빠른 연속 호출 방지
    if (filterUpdateTimeout !== null) {
      clearTimeout(filterUpdateTimeout);
    }
    
    filterUpdateTimeout = setTimeout(() => {
      // lastFilterState가 리셋되었으면 강제로 업데이트
      if (lastFilterState === '') {
        // 캐시를 무효화하고 업데이트 실행
      }
      updateFilteredRows();
      dispatch('stateChange', {
        sortColumn,
        sortDirection,
        filters: Object.fromEntries(
          Array.from(activeFilters.entries()).map(([key, filter]) => [key, describeFilterValue(filter)])
        ),
      });
      filterUpdateTimeout = null;
    }, 0); // 다음 틱에서 실행
  }

  // data 또는 검색 결과가 변경될 때 filteredRows 자동 업데이트 (debounced)
  
  // 데이터 해시 계산 (간단한 버전)
  function calculateDataHash(data: TableData): string {
    return `${data.metadata.rowCount}-${data.metadata.columnCount}-${data.columns.length}-${data.rows.length}`;
  }
  
  $: {
    if (data) {
      const currentHash = calculateDataHash(data);
      // 데이터 참조나 해시가 실제로 변경되었을 때만 업데이트
      if (lastDataRef !== data || lastDataHash !== currentHash) {
        lastDataRef = data;
        lastDataHash = currentHash;
        lastFilterState = ''; // 강제 업데이트
        updateStateAndDispatch();
      }
    }
  }
$: {
  const currentSize = searchMatchedRowIds?.size ?? 0;
  const refChanged = searchMatchedRowIds !== lastSearchMatchedRef;
  if (refChanged || currentSize !== lastSearchMatchedSize) {
    lastSearchMatchedRef = searchMatchedRowIds ?? null;
    lastSearchMatchedSize = currentSize;
    lastFilterState = ''; // 강제 업데이트
    updateStateAndDispatch();
    forceVisibleRowsRefresh();
  }
}

$: {
  if (showTransformDialog) {
    const snapshot = getTransformTargetRowsSnapshot({ allowFallback: true });
    const filteredCount = filteredRows.length;
    const hasContext = hasFilterContext();
    dialogTargetRows = snapshot;
    dialogTargetIsFiltered =
      hasContext || (snapshot.length > 0 && data ? snapshot.length !== data.rows.length : false);
    dialogTargetFilteredEmpty = hasContext && filteredCount === 0;
  } else {
    dialogTargetRows = [];
    dialogTargetIsFiltered = false;
    dialogTargetFilteredEmpty = false;
  }
}

function handleSort(columnKey: string) {
  const columnMeta = displayColumnMeta.get(columnKey);
  if (!columnMeta || columnMeta.kind !== 'scalar') {
    return;
  }
  if (sortColumn === columnKey) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = columnKey;
    sortDirection = 'asc';
  }
  // 정렬 변경 시 필터 상태 캐시 리셋
  lastFilterState = '';
  updateStateAndDispatch();
}

export function clearSort() {
  sortColumn = null;
  sortDirection = 'asc';
  // 정렬 변경 시 필터 상태 캐시 리셋
  lastFilterState = '';
  updateStateAndDispatch();
}

function handleFilter(columnKey: string, value: string) {
  const parsed = parseFilterValue(value);
  if (!parsed) {
    activeFilters.delete(columnKey);
  } else {
    activeFilters.set(columnKey, parsed);
  }
  // 필터 상태 캐시 리셋 (강제 업데이트)
  lastFilterState = '';
  // Map 변경을 reactivity에 알리기 위해 새 참조 생성
  activeFilters = new Map(activeFilters);
  updateStateAndDispatch();
  forceVisibleRowsRefresh();
}

export function clearFilter(columnKey?: string) {
  if (columnKey) {
    activeFilters.delete(columnKey);
  } else {
    activeFilters.clear();
  }
  // 필터 상태 캐시 리셋 (강제 업데이트)
  lastFilterState = '';
  // Map 변경을 reactivity에 알리기 위해 새 참조 생성
  activeFilters = new Map(activeFilters);
  updateStateAndDispatch();
}

function handleScroll(event: Event) {
  handleVirtualScroll(event);
}
  
// 필터링된 행이 변경될 때 행 높이/가상 스크롤 상태 갱신
// updateFilteredRows()에서 이미 recomputeRowMetrics()를 호출하므로
// 여기서는 rowHeights가 업데이트된 후에만 updateVisibleRows()를 호출
$: {
  if (filteredRows !== lastFilteredRowsRef) {
    const currentFilteredRows = filteredRows;
    lastFilteredRowsRef = currentFilteredRows;
    if (filterUpdateFrame !== null) {
      cancelAnimationFrame(filterUpdateFrame);
    }
    filterUpdateFrame = requestAnimationFrame(() => {
      // rowHeights가 아직 업데이트되지 않았으면 recomputeRowMetrics() 호출
      if (rowHeights.length !== currentFilteredRows.length && currentFilteredRows.length > 0) {
        arrayDisplayCache.clear();
        recomputeRowMetrics();
      }
      // forceVisibleRowsRefresh()가 이미 호출되었을 수 있으므로
      // visibleRows가 비어있거나 업데이트가 필요한 경우에만 호출
      if (visibleRows.length === 0 || renderRowCount !== currentFilteredRows.length) {
        forceVisibleRowsRefresh();
      } else {
        updateVisibleRows();
      }
      filterUpdateFrame = null;
    });
  }
}

$: tableBodyHeight = totalTableHeight;
$: topSpacerHeight = getRowOffsetByIndex(visibleStartIndex);
$: bottomSpacerHeight = Math.max(totalTableHeight - getRowOffsetByIndex(visibleEndIndex), 0);
  
  // 원본 행 인덱스 맵 (성능 최적화) - 지연 업데이트 및 캐싱
  
function cancelRowIndexBuild() {
  if (!rowIndexBuildState) {
    return;
  }
  rowIndexBuildState.cancelled = true;
  if (rowIndexBuildState.cancelScheduled) {
    rowIndexBuildState.cancelScheduled();
  }
  rowIndexBuildState = null;
}

function updateOriginalRowIndexMap() {
  const currentRows = data.rows;
  if (!currentRows) {
    originalRowIndexMap.clear();
    lastDataRowsRef = null;
    lastDataRowsLength = 0;
    cancelRowIndexBuild();
    return;
  }

  if (lastDataRowsRef === currentRows && lastDataRowsLength === currentRows.length) {
    return;
  }

  if (rowIndexBuildState) {
    const sameTarget = rowIndexBuildState.rowsRef === currentRows;
    if (sameTarget) {
      return;
    }
    cancelRowIndexBuild();
  }
  
  const newMap = new Map<string, number>();
  const batchSize = 5000;
  const rowCount = currentRows.length;
  let lastLoggedProgress = -1;

  if (rowCount <= batchSize) {
    for (let i = 0; i < rowCount; i++) {
      newMap.set(currentRows[i].id, i);
    }
    originalRowIndexMap = newMap;
    lastDataRowsRef = currentRows;
    lastDataRowsLength = rowCount;
    return;
  }

  const state: RowIndexBuildState = {
    cancelled: false,
    idleHandle: null,
    timeoutHandle: null,
    rowsRef: currentRows,
    cancelScheduled: null,
  };
  rowIndexBuildState = state;
  let processed = 0;
  console.info('[TableView] Row index rebuild started', { rowCount });

  const scheduleNext = (cb: () => void) => {
    if (typeof requestIdleCallback === 'function') {
      state.idleHandle = requestIdleCallback(() => {
        state.idleHandle = null;
        state.timeoutHandle = null;
        cb();
      }, { timeout: 50 });
      state.cancelScheduled = () => {
        if (state.idleHandle !== null) {
          cancelIdleCallback(state.idleHandle);
          state.idleHandle = null;
        }
      };
    } else {
      const timer = typeof window !== 'undefined' ? window.setTimeout : setTimeout;
      state.timeoutHandle = timer(() => {
        state.idleHandle = null;
        state.timeoutHandle = null;
        cb();
      }, 16);
      state.cancelScheduled = () => {
        if (state.timeoutHandle !== null) {
          clearTimeout(state.timeoutHandle);
          state.timeoutHandle = null;
        }
      };
    }
  };

  const processBatch = () => {
    if (!rowIndexBuildState || rowIndexBuildState !== state || state.cancelled) {
      return;
    }
    const end = Math.min(processed + batchSize, rowCount);
    for (let i = processed; i < end; i++) {
      newMap.set(currentRows[i].id, i);
    }
    processed = end;
    const progress = rowCount === 0 ? 1 : processed / rowCount;
    if (progress - lastLoggedProgress >= 0.1 || processed === rowCount) {
      lastLoggedProgress = progress;
      console.info('[TableView] Row index rebuild progress', {
        processed,
        rowCount,
        progress: Math.min(progress, 1),
      });
    }

    if (processed < rowCount) {
      scheduleNext(processBatch);
      return;
    }

    if (state.cancelled) {
      return;
    }
    originalRowIndexMap = newMap;
    lastDataRowsRef = currentRows;
    lastDataRowsLength = rowCount;
    console.info('[TableView] Row index rebuild completed', { rowCount });
    rowIndexBuildState = null;
  };

  processBatch();
}
  
  // data.rows가 변경될 때만 맵 업데이트 (필요한 경우에만)
  $: {
    if (data && data.rows && (lastDataRowsRef !== data.rows || lastDataRowsLength !== data.rows.length)) {
      updateOriginalRowIndexMap();
    }
  }
  
// 가상 스크롤링: 보이는 행 계산 (최적화)

export function updateVisibleRows() {
  if (!tableContainer) {
    visibleRows = [];
    visibleStartIndex = 0;
    visibleEndIndex = 0;
    topSpacerHeight = 0;
    bottomSpacerHeight = 0;
    lastRenderRowCount = 0;
    return;
  }

  if (!tableContainer.getBoundingClientRect) {
    return;
  }

  // renderRowCount가 0이면 빈 상태로 설정
  if (renderRowCount === 0) {
    visibleRows = [];
    visibleStartIndex = 0;
    visibleEndIndex = 0;
    topSpacerHeight = 0;
    bottomSpacerHeight = 0;
    lastRenderRowCount = 0;
    return;
  }

  if (rowHeights.length !== renderRowCount) {
    if (filteredRows.length > 0) {
      recomputeRowMetrics();
      // 재계산 후에도 길이가 맞지 않으면 아직 준비되지 않은 상태
      if (rowHeights.length !== renderRowCount) {
        return;
      }
    } else {
      // filteredRows가 비어있으면 초기화
      visibleRows = [];
      visibleStartIndex = 0;
      visibleEndIndex = 0;
      topSpacerHeight = 0;
      bottomSpacerHeight = 0;
      lastRenderRowCount = 0;
      return;
    }
  }

  const containerRect = tableContainer.getBoundingClientRect();
  const newContainerHeight = containerRect.height;
  const newScrollTop = tableContainer.scrollTop;

  // 스크롤 위치, 컨테이너 높이, 렌더 행 수가 모두 동일하고
  // visibleRows가 이미 설정되어 있으면 스킵
  if (
    lastScrollTop === newScrollTop &&
    lastContainerHeight === newContainerHeight &&
    lastRenderRowCount === renderRowCount &&
    visibleRows.length > 0
  ) {
    return;
  }

  lastScrollTop = newScrollTop;
  lastContainerHeight = newContainerHeight;
  lastRenderRowCount = renderRowCount;

  let baseStart = findRowIndexByOffset(newScrollTop);
  let baseEnd = findFirstRowStartingAfter(newScrollTop + newContainerHeight);
  if (baseEnd <= baseStart) {
    baseEnd = Math.min(renderRowCount, baseStart + 1);
  }

  const visibleRange = Math.max(baseEnd - baseStart, 1);
  let bufferedStart = Math.max(0, baseStart - bufferRows);
  let bufferedEnd = Math.min(renderRowCount, baseEnd + bufferRows);
  const bufferedRange = bufferedEnd - bufferedStart;

  if (maxVisibleRows > 0 && bufferedRange > maxVisibleRows) {
    if (visibleRange >= maxVisibleRows) {
      bufferedStart = baseStart;
      bufferedEnd = Math.min(renderRowCount, baseStart + maxVisibleRows);
    } else {
      const remainingRows = maxVisibleRows - visibleRange;
      const topBuffer = Math.floor(remainingRows / 2);
      const bottomBuffer = remainingRows - topBuffer;
      bufferedStart = Math.max(0, baseStart - topBuffer);
      bufferedEnd = Math.min(renderRowCount, baseEnd + bottomBuffer);
    }
  }

  if (bufferedEnd <= bufferedStart) {
    bufferedEnd = Math.min(renderRowCount, bufferedStart + 1);
  }

  visibleStartIndex = bufferedStart;
  visibleEndIndex = bufferedEnd;
  visibleRows = filteredRows.slice(visibleStartIndex, visibleEndIndex);

  topSpacerHeight = getRowOffsetByIndex(visibleStartIndex);
  bottomSpacerHeight = Math.max(totalTableHeight - getRowOffsetByIndex(visibleEndIndex), 0);
}

function forceVisibleRowsRefresh() {
  lastScrollTop = -1;
  lastContainerHeight = -1;
  lastRenderRowCount = -1;
  updateVisibleRows();
}

function findRowIndexByOffset(offset: number): number {
  if (renderRowCount === 0) {
    return 0;
  }
  let low = 0;
  let high = renderRowCount - 1;
  let result = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = rowOffsets[mid] ?? 0;
    const height = rowHeights[mid] ?? rowHeight;
    const end = start + height;
    if (offset < start) {
      result = mid;
      high = mid - 1;
    } else if (offset >= end) {
      low = mid + 1;
      result = Math.min(low, renderRowCount - 1);
    } else {
      return mid;
    }
  }
  return Math.max(0, Math.min(result, renderRowCount - 1));
}

function findFirstRowStartingAfter(offset: number): number {
  if (renderRowCount === 0) {
    return 0;
  }
  let low = 0;
  let high = renderRowCount - 1;
  let result = renderRowCount;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = rowOffsets[mid] ?? 0;
    if (start >= offset) {
      result = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return Math.min(Math.max(result, 0), renderRowCount);
}

function getRowOffsetByIndex(index: number): number {
  if (index <= 0) {
    return 0;
  }
  if (index >= rowOffsets.length) {
    return totalTableHeight;
  }
  return rowOffsets[index] ?? totalTableHeight;
}
  
  // 스크롤 이벤트 핸들러 최적화 (requestAnimationFrame 사용)
  
  function handleVirtualScroll(event: Event) {
    const target = event.target as HTMLDivElement;
    scrollLeft = target.scrollLeft;
    
    // 헤더 스크롤은 즉시 업데이트 (사용자 경험)
    if (header) {
      header.scrollLeft = scrollLeft;
    }
    
    // 가상 스크롤링 업데이트는 requestAnimationFrame으로 최적화
    if (scrollAnimationFrame !== null) {
      cancelAnimationFrame(scrollAnimationFrame);
    }
    
    scrollAnimationFrame = requestAnimationFrame(() => {
      updateVisibleRows();
      scrollAnimationFrame = null;
    });
  }

  // 외부에서 호출 가능한 네비게이션 함수
export function navigateToCell(rowId: string, columnKey: string) {
  const rowIndex = filteredRows.findIndex((row) => row.id === rowId);
  if (rowIndex === -1) {
    return;
  }

  if (tableContainer) {
    const targetScrollTop = Math.max(0, getRowOffsetByIndex(rowIndex) - rowHeight);
    tableContainer.scrollTop = targetScrollTop;
  }
    
    // 컬럼으로 스크롤
    const columnIndex = flatColumns.findIndex(col => col.key === columnKey);
    if (columnIndex !== -1 && tableContainer) {
      let scrollLeft = 0;
      for (let i = 0; i < columnIndex; i++) {
        scrollLeft += getColumnWidth(flatColumns[i].key);
      }
      tableContainer.scrollLeft = Math.max(0, scrollLeft - 100);
    }
    
    // 해당 셀 하이라이트 (선택 사항)
    setTimeout(() => {
      const cellElement = tableContainer?.querySelector(`[data-row-id="${rowId}"][data-column-key="${columnKey}"]`) as HTMLElement;
      if (cellElement) {
        cellElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
        cellElement.style.backgroundColor = 'var(--accent)';
        cellElement.style.opacity = '0.3';
        setTimeout(() => {
          cellElement.style.backgroundColor = '';
          cellElement.style.opacity = '';
        }, 2000);
      }
    }, 100);
  }

  export function navigateToColumn(columnKey: string) {
    const columnIndex = flatColumns.findIndex(col => col.key === columnKey);
    if (columnIndex !== -1 && tableContainer) {
      let scrollLeft = 0;
      for (let i = 0; i < columnIndex; i++) {
        scrollLeft += getColumnWidth(flatColumns[i].key);
      }
      tableContainer.scrollLeft = Math.max(0, scrollLeft - 100);
      
      // 헤더도 함께 스크롤
      if (header) {
        header.scrollLeft = tableContainer.scrollLeft;
      }
    }
  }

  function scrollToColumn(columnKey: string) {
    if (!columnKey) return;
    requestAnimationFrame(() => {
      navigateToColumn(columnKey);
    });
  }

export function navigateToRow(rowId: string) {
  const rowIndex = filteredRows.findIndex((row) => row.id === rowId);
  if (rowIndex === -1) {
    return;
  }

  if (tableContainer) {
    const targetScrollTop = Math.max(0, getRowOffsetByIndex(rowIndex) - rowHeight);
    tableContainer.scrollTop = targetScrollTop;
  }
  }

  function startCellEdit(rowId: string, columnKey: string) {
    const row = data.rows.find((r) => r.id === rowId);
    if (!row) return;
    
    const cell = row.cells[columnKey];
    editingCell = { rowId, columnKey };
    editingValue = formatCellValue(cell?.value);
  }
  
  function commitCellEdit() {
    if (!editingCell) return;
    
    const { rowId, columnKey } = editingCell;
    const finalValue = editingValue === '' || editingValue === null || editingValue === undefined ? null : editingValue;
    
    // 성능 최적화: 현재 값과 같으면 업데이트 스킵
    const currentRow = data.rows.find((r) => r.id === rowId);
    if (currentRow && currentRow.cells[columnKey]) {
      const currentValue = currentRow.cells[columnKey].value;
      if (currentValue === finalValue) {
        editingCell = null;
        editingValue = '';
        return;
      }
    }
    
    // 값이 실제로 변경된 경우에만 업데이트
    dataStore.update((data) => {
      const row = data.rows.find((r) => r.id === rowId);
      if (row && row.cells[columnKey]) {
        row.cells[columnKey].value = finalValue;
      }
      return data;
    });
    
    editingCell = null;
    editingValue = '';
  }
  
  function cancelCellEdit() {
    editingCell = null;
    editingValue = '';
  }
  
  function handleCellClick(rowId: string, columnKey: string, event: MouseEvent | KeyboardEvent) {
    const meta = displayColumnMeta.get(columnKey);
    if (!meta || meta.kind !== 'scalar') {
      event.stopPropagation();
      return;
    }
    // 이미 편집 중인 셀이 있으면 커밋
    if (editingCell) {
      if (editingCell.rowId !== rowId || editingCell.columnKey !== columnKey) {
        commitCellEdit();
      } else {
        // 같은 셀을 다시 클릭한 경우 편집 모드 유지
        event.stopPropagation();
        return;
      }
    }
    
    // 새 셀 편집 시작
    startCellEdit(rowId, columnKey);
    event.stopPropagation();
  }

  function handleCellKeyActivation(event: KeyboardEvent, rowId: string, columnKey: string) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    handleCellClick(rowId, columnKey, event);
  }

  function getColumnDisplayLabel(column: Column): string {
    const baseLabel = column.label ?? column.key;
    const shouldTrim = baseLabel.includes('.') || column.key.includes('.');
    if (!shouldTrim) {
      return baseLabel;
    }
    const source = baseLabel.includes('.') ? baseLabel : column.key;
    const parts = source.split('.');
    const last = parts[parts.length - 1];
    return last || baseLabel;
  }
  
  function handleCellKeydown(event: KeyboardEvent, rowId: string, columnKey: string) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitCellEdit();
      
      // 다음 행으로 이동 (선택 사항)
      const currentRowIndex = filteredRows.findIndex(r => r.id === rowId);
      if (currentRowIndex < filteredRows.length - 1) {
        const nextRow = filteredRows[currentRowIndex + 1];
        setTimeout(() => {
          startCellEdit(nextRow.id, columnKey);
        }, 0);
      }
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitCellEdit();
      
      // 다음/이전 열로 이동
      const currentColumnIndex = flatColumns.findIndex(c => c.key === columnKey);
      if (event.shiftKey) {
        // 이전 열
        if (currentColumnIndex > 0) {
          const prevColumn = flatColumns[currentColumnIndex - 1];
          setTimeout(() => {
            startCellEdit(rowId, prevColumn.key);
          }, 0);
        }
      } else {
        // 다음 열
        if (currentColumnIndex < flatColumns.length - 1) {
          const nextColumn = flatColumns[currentColumnIndex + 1];
          setTimeout(() => {
            startCellEdit(rowId, nextColumn.key);
          }, 0);
        }
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelCellEdit();
    }
  }

  function formatCellValue(cell: any): string {
    // null 값은 빈 문자열로 표시 (결측값)
    if (cell === null || cell === undefined) return '';
    if (typeof cell === 'object') return JSON.stringify(cell);
    return String(cell);
  }
function formatNestedArrayValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatNestedArrayValue(item)).join('\n');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function toggleChildArrayExpansion(rowId: string, columnKey: string) {
  const key = getChildArrayKey(rowId, columnKey);
  if (expandedChildArrays.has(key)) {
    expandedChildArrays.delete(key);
  } else {
    expandedChildArrays.add(key);
  }
  expandedChildArrays = new Set(expandedChildArrays);
  arrayDisplayCache.delete(rowId);
  recomputeRowMetrics();
  updateVisibleRows();
}

  // 이미지 URL 캐시 (성능 최적화)
  
  function isImageUrl(value: any): boolean {
    if (typeof value !== 'string') return false;
    const url = value.trim();
    if (!url) return false;
    
    // 캐시 확인
    if (imageUrlCache.has(url)) {
      return imageUrlCache.get(url)!;
    }
    
    // 이미지 확장자 확인
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    const lowerUrl = url.toLowerCase();
    const hasImageExtension = imageExtensions.some(ext => lowerUrl.includes(ext));
    
    if (!hasImageExtension) {
      imageUrlCache.set(url, false);
      return false;
    }
    
    // 유효한 URL 형식인지 확인
    try {
      const urlObj = new URL(url);
      const result = urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
      imageUrlCache.set(url, result);
      return result;
    } catch {
      // 상대 경로나 다른 형식은 false 반환
      imageUrlCache.set(url, false);
      return false;
    }
  }

  function openImageViewer(imageUrl: string) {
    imageViewerUrl = imageUrl;
    showImageViewer = true;
  }

  function openTransformDialog(columnKey: string) {
    selectedColumns.clear();
    selectedColumns.add(columnKey);
    selectedColumns = selectedColumns; // Svelte reactivity
    showTransformDialog = true;
  }

  function handleTransformApply(columns: string[], code: string, mode: 'single' | 'array') {
    if (columns.length === 0 || !code.trim()) {
      return;
    }
    const targetRowsSnapshot = getTransformTargetRowsSnapshot({ allowFallback: false });
    if (targetRowsSnapshot.length === 0) {
      return;
    }
    const targetRowIds = targetRowsSnapshot.map((row) => row.id);
    const settings = settingsStore.get();
    const singleVarName = sanitizeVariableIdentifier(settings.transformVariableName, 'a');
    const arrayVarName = sanitizeVariableIdentifier(settings.transformArrayVariableName, 'list');
    dataStore.update((data) => {
      const rowMap = new Map<string, Row>();
      data.rows.forEach((row) => {
        rowMap.set(row.id, row);
      });
      const targetRows = targetRowIds
        .map((rowId) => rowMap.get(rowId))
        .filter((row): row is Row => Boolean(row));
      if (targetRows.length === 0) {
        return data;
      }

      if (mode === 'array') {
        // 배열 변환 모드: 모든 행의 값을 배열로 수집
        const allValues = targetRows.map((row) => {
          if (columns.length === 1) {
            // 단일 열: 값 배열
            return row.cells[columns[0]]?.value;
          } else {
            // 여러 열: 객체 배열
            const obj: Record<string, any> = {};
            columns.forEach((colKey) => {
              obj[colKey] = row.cells[colKey]?.value;
            });
            return obj;
          }
        });

        // 함수 실행
        const result = executeFunctionSync(
          code,
          allValues,
          undefined,
          { mode: 'array', columns, arrayVariableName: arrayVarName }
        );

        if (result.success && Array.isArray(result.result)) {
          const deletedIndexes = result.deletedIndexes || [];
          const deleteRowIds = new Set<string>();
          deletedIndexes.forEach((idx) => {
            const row = targetRows[idx];
            if (row) {
              deleteRowIds.add(row.id);
            }
          });
          let resultIndex = 0;

          targetRows.forEach((row) => {
            if (deleteRowIds.has(row.id)) {
              return;
            }
            if (resultIndex >= result.result.length) {
              return;
            }
            const item = result.result[resultIndex];

            if (columns.length === 1) {
              const cell = row.cells[columns[0]];
              if (cell) {
                cell.value = item === '' || item === null || item === undefined ? null : item;
              }
            } else {
              columns.forEach((colKey) => {
                const cell = row.cells[colKey];
                if (cell && item && typeof item === 'object' && colKey in item) {
                  const val = item[colKey];
                  cell.value = val === '' || val === null || val === undefined ? null : val;
                }
              });
            }

            resultIndex++;
          });

          if (deleteRowIds.size > 0) {
            data.rows = data.rows.filter((row) => !deleteRowIds.has(row.id));
            data.metadata.rowCount = data.rows.length;
          }
        }
      } else {
        // 단일 값 변환 모드
        const rowsToDelete = new Set<string>();
        
        columns.forEach((columnKey) => {
          targetRows.forEach((row) => {
            const cell = row.cells[columnKey];
            if (cell) {
              // 같은 행의 다른 열 값들을 rowData로 전달 (null 처리)
              const rowData: Record<string, any> = {};
              data.columns.forEach((col) => {
                if (col.key !== columnKey) {
                  const otherCell = row.cells[col.key];
                  // 셀이 없거나 값이 null이면 null로 저장
                  rowData[col.key] = otherCell?.value ?? null;
                }
              });
              
              // null 값을 제대로 전달 (셀이 없는 경우도 null)
              const cellValue = cell.value ?? null;
              
              const result = executeFunctionSync(
                code, 
                cellValue, 
                cellValue, 
                { mode: 'single', rowData, singleVariableName: singleVarName }
              );
              
              if (result.success) {
                // return; (undefined)로 행 삭제 표시
                if (result.isDelete || result.result === DELETE_MARKER) {
                  rowsToDelete.add(row.id);
                } else if (result.result !== undefined) {
                  // 빈 문자열은 null로 저장
                  cell.value = result.result === '' || result.result === null ? null : result.result;
                }
                // result.result가 undefined이고 return이 없으면 기존값 유지 (이미 처리됨)
              }
            }
          });
        });
        
        // 삭제할 행 제거
        if (rowsToDelete.size > 0) {
          data.rows = data.rows.filter(row => !rowsToDelete.has(row.id));
          data.metadata.rowCount = data.rows.length;
        }
      }
      return data;
    });

    showTransformDialog = false;
    selectedColumns.clear();
    selectedColumns = selectedColumns; // Svelte reactivity
  }

  function handleTransformClose() {
    showTransformDialog = false;
  }

  // 열 이름 생성 함수 (중복 체크)
  function generateColumnName(data: TableData): string {
    const existingNames = new Set(data.columns.map(col => col.label.toLowerCase()));
    let counter = 1;
    let name = `column${counter}`;
    while (existingNames.has(name.toLowerCase())) {
      counter++;
      name = `column${counter}`;
    }
    return name;
  }

  // 열 선택 핸들러
  function handleColumnClick(columnKey: string, event: MouseEvent | KeyboardEvent) {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + 클릭: 토글 선택
      if (selectedColumns.has(columnKey)) {
        selectedColumns.delete(columnKey);
      } else {
        selectedColumns.add(columnKey);
      }
      selectedColumns = selectedColumns; // Svelte reactivity
      lastClickedColumn = columnKey;
    } else if (event.shiftKey && lastClickedColumn) {
      // Shift + 클릭: 범위 선택
      const allKeys = flatColumns.map(col => col.key);
      const startIndex = allKeys.indexOf(lastClickedColumn);
      const endIndex = allKeys.indexOf(columnKey);
      if (startIndex !== -1 && endIndex !== -1) {
        const min = Math.min(startIndex, endIndex);
        const max = Math.max(startIndex, endIndex);
        for (let i = min; i <= max; i++) {
          selectedColumns.add(allKeys[i]);
        }
        selectedColumns = selectedColumns; // Svelte reactivity
      }
    } else {
      // 일반 클릭: 단일 선택
      if (!event.defaultPrevented) {
        selectedColumns.clear();
        selectedColumns.add(columnKey);
        selectedColumns = selectedColumns; // Svelte reactivity
        lastClickedColumn = columnKey;
      }
    }
  }

  function handleHeaderKeydown(event: KeyboardEvent, columnKey: string) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    handleColumnClick(columnKey, event);
    if (!event.defaultPrevented) {
      handleSort(columnKey);
    }
  }

  function handleColumnMouseDown(columnKey: string, event: MouseEvent) {
    if (event.button !== 0) return; // 왼쪽 버튼만
    if (event.ctrlKey || event.metaKey || event.shiftKey) return; // Ctrl/Shift는 클릭 핸들러에서 처리
    
    // 리사이즈 핸들 영역인지 확인
    const target = event.target as HTMLElement;
    if (target.classList.contains('resize-handle') || target.closest('.resize-handle')) {
      return; // 리사이즈 핸들은 드래그에서 제외
    }
    
    isSelectingColumns = true;
    selectionStartColumn = columnKey;
    selectedColumns.clear();
    selectedColumns.add(columnKey);
    selectedColumns = selectedColumns; // Svelte reactivity
    lastClickedColumn = columnKey;
    
    dragStartX = event.clientX;
    dragCurrentX = event.clientX;
    const columnElement = target.closest('[data-column-key]') as HTMLElement;
    if (!columnElement) return;
    
    event.preventDefault();
    
    let hasMoved = false;
    const DRAG_THRESHOLD = 5; // 픽셀 단위
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = Math.abs(e.clientX - dragStartX);
      
      if (!hasMoved && deltaX > DRAG_THRESHOLD) {
        // 드래그 시작
        hasMoved = true;
        isSelectingColumns = false;
        startColumnDrag(columnKey, e, columnElement);
        return;
      }
      
      if (hasMoved && draggingColumn) {
        // 드래그 진행
        handleColumnDrag(e);
      } else if (isSelectingColumns && !hasMoved) {
        // 선택 모드
        const target = e.target as HTMLElement;
        const columnElement = target.closest('[data-column-key]') as HTMLElement;
        if (columnElement && selectionStartColumn) {
          const currentColumnKey = columnElement.dataset.columnKey;
          if (currentColumnKey) {
            const allKeys = flatColumns.map(col => col.key);
            const startIndex = allKeys.indexOf(selectionStartColumn);
            const endIndex = allKeys.indexOf(currentColumnKey);
            if (startIndex !== -1 && endIndex !== -1) {
              selectedColumns.clear();
              const min = Math.min(startIndex, endIndex);
              const max = Math.max(startIndex, endIndex);
              for (let i = min; i <= max; i++) {
                selectedColumns.add(allKeys[i]);
              }
              selectedColumns = selectedColumns; // Svelte reactivity
            }
          }
        }
      }
    };
    
    const handleMouseUp = () => {
      if (hasMoved && draggingColumn) {
        endColumnDrag();
      } else {
        isSelectingColumns = false;
        selectionStartColumn = null;
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function startColumnDrag(columnKey: string, event: MouseEvent, element: HTMLElement) {
    draggingColumn = columnKey;
    draggingColumnParentKey = columnParentMap.get(columnKey) ?? getColumnParentKey(columnKey);
    dragColumnElement = element;
    dragStartX = event.clientX;
    dragCurrentX = event.clientX;
    
    // 열 요소 캐시 (한 번만 쿼리)
    dragColumnElementsCache = Array.from(
      document.querySelectorAll('[data-column-key]')
    ) as HTMLElement[];
    
    // 원본 요소의 위치 저장
    const rect = element.getBoundingClientRect();
    
    // 고스트 요소 생성 (드래그 중 표시용)
    dragGhost = element.cloneNode(true) as HTMLElement;
    dragGhost.style.position = 'fixed';
    dragGhost.style.left = `${rect.left}px`;
    dragGhost.style.top = `${rect.top}px`;
    dragGhost.style.width = `${rect.width}px`;
    dragGhost.style.opacity = '0.8';
    dragGhost.style.pointerEvents = 'none';
    dragGhost.style.zIndex = '3000';
    dragGhost.style.transform = 'scale(1.05)';
    dragGhost.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    dragGhost.classList.add('dragging-ghost');
    document.body.appendChild(dragGhost);
    
    // 원본 요소 스타일 변경
    element.style.opacity = '0.5';
    element.style.transition = 'none';
    
    // 모든 헤더 셀의 transition 비활성화 (성능 향상)
    if (header) {
      const headerCells = header.querySelectorAll('.header-cell, .table-cell');
      headerCells.forEach((cell: Element) => {
        (cell as HTMLElement).style.transition = 'none';
      });
    }
    
    document.addEventListener('mousemove', handleColumnDrag);
    document.addEventListener('mouseup', endColumnDrag);
  }

  function handleColumnDrag(event: MouseEvent) {
    if (!draggingColumn || !dragGhost || !dragColumnElement) return;
    
    dragCurrentX = event.clientX;
    
    // requestAnimationFrame으로 업데이트 최적화
    if (dragAnimationFrame !== null) {
      cancelAnimationFrame(dragAnimationFrame);
    }
    
    dragAnimationFrame = requestAnimationFrame(() => {
      if (!draggingColumn || !dragGhost || !dragColumnElement) return;
      
      // 고스트 요소 위치 업데이트
      const rect = dragColumnElement.getBoundingClientRect();
      const deltaX = dragCurrentX - dragStartX;
      dragGhost.style.left = `${rect.left + deltaX}px`;
      
      // 드래그 오버 중인 열 찾기 (캐시된 요소 사용)
      if (!dragColumnElementsCache) return;
      
      let newDragOverColumn: string | null = null;
      const clientX = dragCurrentX; // 클로저로 캡처
      
      dragColumnElementsCache.forEach((el) => {
        const colKey = el.dataset.columnKey;
        if (!colKey || colKey === draggingColumn) {
          el.classList.remove('drag-over-left', 'drag-over-right', 'drag-disabled');
          return;
        }

        const targetParent = columnParentMap.get(colKey) ?? getColumnParentKey(colKey);
        if (targetParent !== draggingColumnParentKey) {
          el.classList.remove('drag-over-left', 'drag-over-right');
          el.classList.add('drag-disabled');
          return;
        }
        el.classList.remove('drag-disabled');
        
        const elRect = el.getBoundingClientRect();
        const centerX = elRect.left + elRect.width / 2;
        
        if (clientX >= elRect.left && clientX <= elRect.right) {
          if (clientX < centerX) {
            // 왼쪽에 삽입
            newDragOverColumn = colKey;
            el.classList.add('drag-over-left');
            el.classList.remove('drag-over-right');
          } else {
            // 오른쪽에 삽입
            newDragOverColumn = colKey;
            el.classList.add('drag-over-right');
            el.classList.remove('drag-over-left');
          }
        } else {
          el.classList.remove('drag-over-left', 'drag-over-right');
        }
      });
      
      if (newDragOverColumn !== dragOverColumn) {
        // 이전 드래그 오버 제거
        if (dragOverColumn && dragColumnElementsCache) {
          const prevEl = dragColumnElementsCache.find(
            el => el.dataset.columnKey === dragOverColumn
          );
          if (prevEl) {
            prevEl.classList.remove('drag-over-left', 'drag-over-right');
          }
        }
        dragOverColumn = newDragOverColumn;
      }
      
      dragAnimationFrame = null;
    });
  }

  function endColumnDrag() {
    if (!draggingColumn) return;
    
    // requestAnimationFrame 취소
    if (dragAnimationFrame !== null) {
      cancelAnimationFrame(dragAnimationFrame);
      dragAnimationFrame = null;
    }
    
    const sourceColumnKey = draggingColumn;
    let targetColumnKey = dragOverColumn;
    let insertBefore = false;
    
    if (targetColumnKey && dragColumnElementsCache) {
      // 드롭 위치 결정 (캐시된 요소 사용)
      const targetEl = dragColumnElementsCache.find(
        el => el.dataset.columnKey === targetColumnKey
      );
      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        insertBefore = dragCurrentX < centerX;
      }
      
      // 드래그 오버 클래스 제거 (캐시된 요소 사용)
      dragColumnElementsCache.forEach(el => {
        el.classList.remove('drag-over-left', 'drag-over-right', 'drag-disabled');
      });
      
      moveColumn(sourceColumnKey, targetColumnKey, insertBefore);
    }
    
    // 모든 헤더 셀의 transition 복원
    if (header) {
      const headerCells = header.querySelectorAll('.header-cell, .table-cell');
      headerCells.forEach((cell: Element) => {
        (cell as HTMLElement).style.transition = '';
      });
    }
    
    // 정리
    if (dragGhost) {
      dragGhost.remove();
      dragGhost = null;
    }
    
    if (dragColumnElement) {
      dragColumnElement.style.opacity = '';
      dragColumnElement.style.transition = '';
      dragColumnElement = null;
    }
    
    draggingColumn = null;
    dragOverColumn = null;
    dragColumnElementsCache = null; // 캐시 정리
    draggingColumnParentKey = '';
    
    document.removeEventListener('mousemove', handleColumnDrag);
    document.removeEventListener('mouseup', endColumnDrag);
  }

  function moveColumn(sourceColumnKey: string, targetColumnKey: string, insertBefore: boolean) {
    if (sourceColumnKey === targetColumnKey) return;
    
    dataStore.update((data) => {
      const sourceIndex = data.columns.findIndex(c => c.key === sourceColumnKey);
      const targetIndex = data.columns.findIndex(c => c.key === targetColumnKey);
      
      if (sourceIndex === -1 || targetIndex === -1) return data;
      
      const sourceColumn = data.columns[sourceIndex];
      const targetColumn = data.columns[targetIndex];
      const sourceParent = getColumnParentKey(sourceColumn.key);
      const targetParent = getColumnParentKey(targetColumn.key);
      if (sourceParent !== targetParent) {
        return data;
      }
      
      // 열 제거
      const [movedColumn] = data.columns.splice(sourceIndex, 1);
      
      // 새 위치에 삽입
      let newIndex = targetIndex;
      if (sourceIndex < targetIndex) {
        // 뒤에서 앞으로 이동하는 경우
        newIndex = insertBefore ? targetIndex - 1 : targetIndex;
      } else {
        // 앞에서 뒤로 이동하는 경우
        newIndex = insertBefore ? targetIndex : targetIndex + 1;
      }
      
      data.columns.splice(newIndex, 0, movedColumn);
      return data;
    });
  }

  // 열 추가/삭제 함수
  function addColumn(position: 'left' | 'right' | 'inside' | 'outside', referenceColumnKey?: string, groupName?: string) {
    let createdColumnKey: string | null = null;
    
    dataStore.update((data) => {
      const newColumnId = `column_${Date.now()}`;
      const columnName = generateColumnName(data);
      const referenceColumn = referenceColumnKey ? data.columns.find((c) => c.key === referenceColumnKey) : undefined;
      const referenceParent = referenceColumn ? getColumnParentKey(referenceColumn.key) : '';
      
      let parentPath = '';
      if (position === 'inside') {
        parentPath = referenceParent || groupName || '';
      }
      
      let finalKey = parentPath ? `${parentPath}.${newColumnId}` : newColumnId;
      const newColumn: Column = {
        key: finalKey,
        label: columnName,
        type: 'string',
        width: DEFAULT_COLUMN_WIDTH,
      };

      let insertIndex = data.columns.length;
      if (referenceColumnKey) {
        const refIndex = data.columns.findIndex((c) => c.key === referenceColumnKey);
        if (refIndex !== -1) {
          if (position === 'left') {
            insertIndex = refIndex;
          } else if (position === 'right' || position === 'outside') {
            insertIndex = refIndex + 1;
          } else if (position === 'inside') {
            if (parentPath) {
              let lastIndex = refIndex;
              for (let i = refIndex + 1; i < data.columns.length; i += 1) {
                if (getColumnParentKey(data.columns[i].key) === parentPath) {
                  lastIndex = i;
                } else {
                  break;
                }
              }
              insertIndex = lastIndex + 1;
            } else {
              insertIndex = refIndex + 1;
            }
          }
        } else {
          insertIndex = position === 'left' ? 0 : data.columns.length;
        }
      } else if (position === 'left') {
        insertIndex = 0;
      }

      data.columns.splice(insertIndex, 0, newColumn);

      data.rows.forEach((row) => {
        row.cells[finalKey] = { value: '', type: 'string' };
      });

      data.metadata.columnCount = data.columns.length;
      createdColumnKey = finalKey;
      return data;
    });

    if (createdColumnKey) {
      scrollToColumn(createdColumnKey);
    }
  }

  function addColumnAtEnd() {
    addColumn('right');
  }

  function addColumnToGroup(groupKey: string) {
    if (!groupKey) return;
    let createdColumnKey: string | null = null;

    dataStore.update((data) => {
      const newColumnId = `column_${Date.now()}`;
      const columnName = generateColumnName(data);
      const finalKey = `${groupKey}.${newColumnId}`;
      const newColumn: Column = {
        key: finalKey,
        label: columnName,
        type: 'string',
        width: DEFAULT_COLUMN_WIDTH,
      };

      let insertIndex = data.columns.length;
      for (let i = 0; i < data.columns.length; i += 1) {
        if (data.columns[i].key.startsWith(`${groupKey}.`)) {
          insertIndex = i + 1;
        }
      }

      data.columns.splice(insertIndex, 0, newColumn);
      data.rows.forEach((row) => {
        row.cells[finalKey] = { value: '', type: 'string' };
      });
      data.metadata.columnCount = data.columns.length;
      createdColumnKey = finalKey;
      return data;
    });

    if (createdColumnKey) {
      scrollToColumn(createdColumnKey);
    }
  }

  function deleteColumn(columnKey: string) {
    dataStore.update((data) => {
      const index = data.columns.findIndex((c) => c.key === columnKey);
      if (index === -1) return data;

      data.columns.splice(index, 1);

      // 모든 행에서 해당 열의 셀 제거
      data.rows.forEach((row) => {
        delete row.cells[columnKey];
      });

      data.metadata.columnCount = data.columns.length;
      return data;
    });
  }

  function deleteSelectedColumns() {
    if (selectedColumns.size === 0) return;
    
    const columnsToDelete = Array.from(selectedColumns);
    dataStore.update((data) => {
      columnsToDelete.forEach(columnKey => {
        const index = data.columns.findIndex((c) => c.key === columnKey);
        if (index !== -1) {
          data.columns.splice(index, 1);
          data.rows.forEach((row) => {
            delete row.cells[columnKey];
          });
        }
      });

      data.metadata.columnCount = data.columns.length;
      return data;
    });
    
    selectedColumns.clear();
    selectedColumns = selectedColumns; // Svelte reactivity
  }

  function groupSelectedColumns(groupName?: string) {
    if (selectedColumns.size < 2) return;
    
    const name = groupName || prompt('그룹 이름을 입력하세요:', 'group');
    if (!name || !name.trim()) return;
    
    dataStore.update((data) => {
      const columnsToGroup = Array.from(selectedColumns)
        .map(key => data.columns.find(c => c.key === key))
        .filter((col): col is Column => col !== undefined)
        .sort((a, b) => {
          const aIndex = data.columns.indexOf(a);
          const bIndex = data.columns.indexOf(b);
          return aIndex - bIndex;
        });
      
      if (columnsToGroup.length === 0) return data;
      
      // 첫 번째 열의 위치 찾기
      const firstIndex = data.columns.indexOf(columnsToGroup[0]);
      
      // 기존 열들을 제거하고 새 그룹 열들로 교체
      columnsToGroup.forEach(col => {
        const index = data.columns.findIndex(c => c.key === col.key);
        if (index !== -1) {
          data.columns.splice(index, 1);
        }
      });
      
      // 새 그룹 열들 생성
      const newColumns: Column[] = columnsToGroup.map(col => {
        const newKey = `${name}.${col.key.split('.').pop() || col.key}`;
        const newColumn: Column = {
          key: newKey,
          label: col.label,
          type: col.type,
          width: col.width || DEFAULT_COLUMN_WIDTH,
        };
        
        // 모든 행의 셀 키 변경
        data.rows.forEach((row) => {
          if (row.cells[col.key]) {
            row.cells[newKey] = row.cells[col.key];
            delete row.cells[col.key];
          }
        });
        
        return newColumn;
      });
      
      // 새 열들을 첫 번째 열이 있던 위치에 삽입
      data.columns.splice(firstIndex, 0, ...newColumns);
      
      data.metadata.columnCount = data.columns.length;
      return data;
    });
    
    selectedColumns.clear();
    selectedColumns = selectedColumns; // Svelte reactivity
  }

  function filterSelectedColumns() {
    if (selectedColumns.size === 0) return;
    
    const filterValue = prompt('필터 값을 입력하세요:', '');
    if (filterValue === null) return;
    
    const columnsToFilter = Array.from(selectedColumns);
    columnsToFilter.forEach(columnKey => {
      handleFilter(columnKey, filterValue);
    });
  }

  // 열 이름 변경 함수
  function renameColumn(columnKey: string) {
    dataStore.update((data) => {
      const column = data.columns.find((c) => c.key === columnKey);
      if (!column) return data;

      const newName = prompt('열 이름을 입력하세요:', column.label);
      if (newName === null || newName.trim() === '') return data;

      // 중복 체크
      const existingNames = data.columns
        .filter(c => c.key !== columnKey)
        .map(c => c.label.toLowerCase());
      if (existingNames.includes(newName.trim().toLowerCase())) {
        alert('이미 존재하는 열 이름입니다.');
        return data;
      }

      column.label = newName.trim();
      return data;
    });
  }

  // 열 복사 함수
  function duplicateColumn(columnKey: string, position: 'left' | 'right') {
    let duplicatedColumnKey: string | null = null;
    
    dataStore.update((data) => {
      const sourceColumn = data.columns.find((c) => c.key === columnKey);
      if (!sourceColumn) return data;

      const newColumnKey = `column_${Date.now()}`;
      const columnName = generateColumnName(data);
      const newColumn: Column = {
        key: newColumnKey,
        label: columnName,
        type: sourceColumn.type,
        width: sourceColumn.width || DEFAULT_COLUMN_WIDTH,
      };

      let insertIndex = 0;
      const refIndex = data.columns.findIndex((c) => c.key === columnKey);
      if (refIndex !== -1) {
        insertIndex = position === 'left' ? refIndex : refIndex + 1;
      } else {
        insertIndex = position === 'left' ? 0 : data.columns.length;
      }

      data.columns.splice(insertIndex, 0, newColumn);

      // 모든 행에 새 열의 셀 추가 (원본 열의 값 복사)
      data.rows.forEach((row) => {
        const sourceCell = row.cells[columnKey];
        row.cells[newColumnKey] = sourceCell 
          ? { value: sourceCell.value, type: sourceCell.type }
          : { value: '', type: 'string' };
      });

      data.metadata.columnCount = data.columns.length;
      duplicatedColumnKey = newColumnKey;
      return data;
    });

    if (duplicatedColumnKey) {
      scrollToColumn(duplicatedColumnKey);
    }
  }

  // 행 추가/삭제 함수
  function addRow(position: 'above' | 'below', referenceRowId?: string) {
    dataStore.update((data) => {
      const maxRowId = Math.max(
        ...data.rows.map((row) => {
          const match = row.id.match(/row_(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        }),
        0
      );
      const newRowId = `row_${maxRowId + 1}`;

      const newRow: Row = {
        id: newRowId,
        cells: {},
      };

      // 모든 열에 대해 빈 셀 추가
      data.columns.forEach((col) => {
        newRow.cells[col.key] = { value: '', type: 'string' };
      });

      let insertIndex = 0;
      if (referenceRowId) {
        const refIndex = data.rows.findIndex((r) => r.id === referenceRowId);
        if (refIndex !== -1) {
          insertIndex = position === 'above' ? refIndex : refIndex + 1;
        } else {
          insertIndex = position === 'above' ? 0 : data.rows.length;
        }
      } else {
        insertIndex = position === 'above' ? 0 : data.rows.length;
      }

      data.rows.splice(insertIndex, 0, newRow);
      data.metadata.rowCount = data.rows.length;
      return data;
    });
  }

  function deleteRow(rowId: string) {
    dataStore.update((data) => {
      const index = data.rows.findIndex((r) => r.id === rowId);
      if (index === -1) return data;

      data.rows.splice(index, 1);
      data.metadata.rowCount = data.rows.length;
      return data;
    });
  }

  // 그룹 삭제 함수들
  function ungroupColumns(groupKey: string) {
    dataStore.update((data) => {
      // 그룹에 속한 모든 열 찾기
      const groupColumns = data.columns.filter(col => col.key.startsWith(groupKey + '.'));
      
      groupColumns.forEach(col => {
        // 그룹 prefix 제거
        const oldKey = col.key;
        const newKey = oldKey.substring(groupKey.length + 1); // groupKey + '.' 제거
        
        // 열 키 업데이트
        col.key = newKey;
        
        // 모든 행의 셀 키 업데이트
        data.rows.forEach((row) => {
          if (row.cells[oldKey]) {
            row.cells[newKey] = row.cells[oldKey];
            delete row.cells[oldKey];
          }
        });
      });
      
      return data;
    });
  }

  function deleteGroupWithColumns(groupKey: string) {
    dataStore.update((data) => {
      // 그룹에 속한 모든 열 찾기
      const groupColumns = data.columns.filter(col => col.key.startsWith(groupKey + '.'));
      const columnKeysToDelete = groupColumns.map(col => col.key);
      
      // 열 삭제
      columnKeysToDelete.forEach(columnKey => {
        const index = data.columns.findIndex((c) => c.key === columnKey);
        if (index !== -1) {
          data.columns.splice(index, 1);
        }
        
        // 모든 행에서 해당 열의 셀 제거
        data.rows.forEach((row) => {
          delete row.cells[columnKey];
        });
      });
      
      data.metadata.columnCount = data.columns.length;
      return data;
    });
  }

  // 컨텍스트 메뉴 핸들러
  function handleContextMenu(
    event: MouseEvent,
    target: { type: 'column' | 'row' | 'cell' | 'group' | 'header-empty'; key?: string; rowId?: string; groupKey?: string }
  ) {
    event.preventDefault();
    event.stopPropagation();

    const items: any[] = [];

    if (target.type === 'group' && target.groupKey) {
      items.push(
        { label: '하위에 열 추가', icon: 'add', action: () => addColumnToGroup(target.groupKey!) },
        { divider: true },
        { label: '그룹만 삭제 (그룹 해제)', icon: 'ungroup', action: () => ungroupColumns(target.groupKey!) },
        { label: '그룹과 모든 열 삭제', icon: 'delete', action: () => deleteGroupWithColumns(target.groupKey!) }
      );
    } else if (target.type === 'column' && target.key) {
      const hasSelection = selectedColumns.size > 1 || (selectedColumns.size === 1 && selectedColumns.has(target.key));
      const refColumn = data.columns.find(c => c.key === target.key);
      const isGrouped = refColumn && refColumn.key.includes('.');
      
      items.push(
        { label: '왼쪽에 열 추가', icon: 'add', action: () => addColumn('left', target.key) },
        { label: '오른쪽에 열 추가', icon: 'add', action: () => addColumn('right', target.key) },
        { label: '오른쪽에 복사하여 추가', icon: 'content_copy', action: () => duplicateColumn(target.key!, 'right') },
        { divider: true }
      );
      
      if (isGrouped) {
        items.push(
          { label: '그룹 외부에 열 추가', icon: 'add', action: () => addColumn('outside', target.key) }
        );
      } else {
        items.push(
          { label: '그룹 내부에 열 추가', icon: 'add', action: () => {
            const groupNameForNew = prompt('그룹 이름을 입력하세요:', 'group');
            if (groupNameForNew) {
              addColumn('inside', target.key, groupNameForNew);
            }
          }}
        );
      }
      
      items.push(
        { divider: true },
        { label: '이름 변경', icon: 'edit', action: () => renameColumn(target.key!) },
        { divider: true },
        { label: '열 삭제', icon: 'delete', action: () => deleteColumn(target.key!) }
      );
      
      // 여러 열이 선택된 경우 추가 옵션
      if (hasSelection && selectedColumns.size > 1) {
        items.push(
          { divider: true },
          { label: `선택된 ${selectedColumns.size}개 열 필터링`, icon: 'filter_list', action: () => filterSelectedColumns() },
          { label: `선택된 ${selectedColumns.size}개 열 그룹화`, icon: 'group', action: () => groupSelectedColumns() },
          { label: `선택된 ${selectedColumns.size}개 열 삭제`, icon: 'delete', action: () => deleteSelectedColumns() }
        );
      }
    } else if (target.type === 'row' && target.rowId) {
      items.push(
        { label: '위에 행 추가', icon: 'add', action: () => addRow('above', target.rowId) },
        { label: '아래에 행 추가', icon: 'add', action: () => addRow('below', target.rowId) },
        { divider: true },
        { label: '행 삭제', icon: 'delete', action: () => deleteRow(target.rowId!) }
      );
    } else if (target.type === 'cell' && target.rowId) {
      items.push(
        { label: '위에 행 추가', icon: 'add', action: () => addRow('above', target.rowId) },
        { label: '아래에 행 추가', icon: 'add', action: () => addRow('below', target.rowId) },
        { divider: true },
        { label: '행 삭제', icon: 'delete', action: () => deleteRow(target.rowId!) }
      );
    } else if (target.type === 'header-empty') {
      items.push(
        { label: '마지막에 열 추가', icon: 'add', action: () => addColumnAtEnd() }
      );
    }

    contextMenu = {
      x: event.clientX,
      y: event.clientY,
      items,
    };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function handleHeaderContextMenu(event: MouseEvent) {
    const targetElement = event.target as HTMLElement;
    if (targetElement.closest('[data-column-key]') || targetElement.closest('[data-group-path]')) {
      return;
    }
    handleContextMenu(event, { type: 'header-empty' });
  }

$: headerScrollStyle =
  maxHeaderRows > 0 ? `max-height: ${maxHeaderRows * HEADER_ROW_HEIGHT}px; overflow-y: auto;` : '';

// data 또는 열 필터링이 변경될 때 컬럼 정보 업데이트
$: if (data && displayColumns) {
  if (displayColumns.length > 0) {
    let columnsToShow = displayColumns;
    if (searchFilteredColumnKeys && searchFilteredColumnKeys.length > 0) {
      columnsToShow = displayColumns.filter((col) => {
        const meta = displayColumnMeta.get(col.key);
        if (!meta) return true;
        if (meta.kind === 'scalar') {
          return searchFilteredColumnKeys!.includes(meta.baseColumnKey);
        }
        return (
          (meta.baseColumnKey && searchFilteredColumnKeys!.includes(meta.baseColumnKey)) ||
          (meta.parentKey && searchFilteredColumnKeys!.includes(meta.parentKey))
        );
      });
    }

    flatColumns = columnsToShow;
    columnParentMap = new Map(flatColumns.map((col) => [col.key, getColumnParentKey(col.key)]));

    columnHeaderTree = buildColumnHeaderTree(columnsToShow);
    headerDepth = getMaxHeaderDepth(columnHeaderTree);
    hasNestedHeaders = headerDepth > 1;

    const leafPositions = new Map<string, number>();
    flatColumns.forEach((col, index) => {
      leafPositions.set(col.key, index + 2);
    });

    assignHeaderMetadata(columnHeaderTree, leafPositions);
    headerGridItems = collectHeaderGridItems(columnHeaderTree, headerDepth);

    const columns: string[] = [`${ROW_NUMBER_WIDTH}px`];
    flatColumns.forEach((col) => {
      columns.push(`${getColumnWidth(col.key)}px`);
    });
    headerGridTemplateColumns = columns.join(' ');
    headerGridRowStyle = `grid-template-rows: repeat(${headerDepth}, ${HEADER_ROW_HEIGHT}px);`;
  } else {
    flatColumns = [];
    columnHeaderTree = [];
    headerGridItems = [];
    headerGridTemplateColumns = `${ROW_NUMBER_WIDTH}px`;
    headerGridRowStyle = `grid-template-rows: repeat(1, ${HEADER_ROW_HEIGHT}px);`;
    headerDepth = 1;
    hasNestedHeaders = false;
    columnParentMap = new Map();
  }
} else {
  flatColumns = [];
  columnHeaderTree = [];
  headerGridItems = [];
  headerGridTemplateColumns = `${ROW_NUMBER_WIDTH}px`;
  headerGridRowStyle = `grid-template-rows: repeat(1, ${HEADER_ROW_HEIGHT}px);`;
  headerDepth = 1;
  hasNestedHeaders = false;
  columnParentMap = new Map();
}
</script>

<div class="table-container" bind:this={tableContainer} on:scroll={handleScroll}>
  <div class="table-header" bind:this={header} role="presentation" on:contextmenu={handleHeaderContextMenu}>
    {#if hasNestedHeaders}
      <div class="header-grid-wrapper" style={headerScrollStyle}>
        <div
          class="header-grid"
          style={`grid-template-columns: ${headerGridTemplateColumns}; ${headerGridRowStyle}`}
        >
        <div
          class="table-cell header-cell row-number-header"
          style={`grid-column: 1 / 2; grid-row: 1 / ${headerDepth + 1}; display: flex; justify-content: center; font-size: 1rem`}
        >
          #
        </div>
        {#each headerGridItems as item (item.path)}
          {#if item.isLeaf && item.column}
            {@const col = item.column}
            {@const columnMeta = displayColumnMeta.get(col.key)}
            <div
              class="table-cell header-cell {selectedColumns.has(col.key) ? 'selected' : ''} {draggingColumn === col.key ? 'dragging' : ''}"
              style={`grid-column: ${item.gridColumn}; grid-row: ${item.gridRow};`}
              data-column-key={col.key}
              role="columnheader"
              tabindex="-1"
              on:contextmenu={(e) => {
                if (columnMeta?.kind !== 'scalar') {
                  e.preventDefault();
                  return;
                }
                handleContextMenu(e, { type: 'column', key: col.key });
              }}
              on:mousedown={(e) => handleColumnMouseDown(col.key, e)}
            >
              <div class="header-content">
                <span
                  class="header-label"
                  role="button"
                  tabindex="0"
                  on:click={(e) => {
                    handleColumnClick(col.key, e);
                    if (!e.defaultPrevented && columnMeta?.kind === 'scalar') {
                      handleSort(col.key);
                    }
                  }}
                  on:keydown={(e) => handleHeaderKeydown(e, col.key)}
                >
                  {getColumnDisplayLabel(col)}
                </span>
                {#if sortColumn === col.key}
                  <span class="sort-indicator material-icons">{sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                {/if}
                {#if columnMeta?.kind === 'scalar'}
                  <ColumnFilter
                    {data}
                    column={col}
                    columnWidth={getColumnWidth(col.key)}
                    onFilter={handleFilter}
                    onTransform={openTransformDialog}
                    isOpen={openFilterColumn === col.key}
                    onToggle={(key) => {
                      openFilterColumn = openFilterColumn === key ? null : key;
                    }}
                  />
                {/if}
              </div>
              <div
                class="resize-handle"
                role="button"
                tabindex="0"
                on:mousedown={(e) => startResize(col.key, e)}
              ></div>
            </div>
          {:else}
            <div
              class="table-cell header-cell group-header {item.path ? '' : 'empty-group'}"
              style={`grid-column: ${item.gridColumn}; grid-row: ${item.gridRow};`}
              role="columnheader"
              tabindex="-1"
              data-group-path={item.path}
              on:contextmenu={(e) => handleContextMenu(e, { type: 'group', groupKey: item.path })}
            >
              {item.label}
            </div>
          {/if}
        {/each}
        </div>
      </div>
    {:else}
      <!-- 1층 헤더 구조 (flat 데이터) -->
      <div class="table-row header-row" style="margin-left: {ROW_NUMBER_WIDTH}px;">
        <div class="table-cell header-cell" style="position: fixed; width: {ROW_NUMBER_WIDTH}px;">#</div>
        {#each flatColumns as column}
          {@const columnMeta = displayColumnMeta.get(column.key)}
          <div 
            class="table-cell header-cell {selectedColumns.has(column.key) ? 'selected' : ''} {draggingColumn === column.key ? 'dragging' : ''}" 
            style="width: {getColumnWidth(column.key)}px;"
            data-column-key={column.key}
            role="columnheader"
            tabindex="-1"
            on:contextmenu={(e) => {
              if (columnMeta?.kind !== 'scalar') {
                e.preventDefault();
                return;
              }
              handleContextMenu(e, { type: 'column', key: column.key });
            }}
            on:mousedown={(e) => handleColumnMouseDown(column.key, e)}
          >
            <div class="header-content">
                <span
                  class="header-label"
                  role="button"
                  tabindex="0"
                  on:click={(e) => {
                    handleColumnClick(column.key, e);
                    if (!e.defaultPrevented && columnMeta?.kind === 'scalar') {
                      handleSort(column.key);
                    }
                  }}
                  on:keydown={(e) => handleHeaderKeydown(e, column.key)}
                >
                {getColumnDisplayLabel(column)}
              </span>
              {#if sortColumn === column.key}
                <span class="sort-indicator material-icons">{sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
              {/if}
              {#if columnMeta?.kind === 'scalar'}
                <ColumnFilter 
                  {data} 
                  {column} 
                  columnWidth={getColumnWidth(column.key)}
                  onFilter={handleFilter} 
                  onTransform={openTransformDialog}
                  isOpen={openFilterColumn === column.key}
                  onToggle={(key) => {
                    openFilterColumn = openFilterColumn === key ? null : key;
                  }}
                />
              {/if}
            </div>
            <div
              class="resize-handle"
              role="button"
              tabindex="0"
              on:mousedown={(e) => startResize(column.key, e)}
            ></div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  <div class="table-body" style="height: {tableBodyHeight}px;">
    {#if topSpacerHeight > 0}
      <div class="spacer" style="height: {topSpacerHeight}px;"></div>
    {/if}
    {#each visibleRows as row, index (row.id)}
      {@const rowIndex = visibleStartIndex + index}
      {@const slotCount = rowDisplaySlotCount.get(row.id) ?? 1}
      {@const rowBlockHeight = rowHeights[rowIndex] ?? slotCount * rowHeight}
      {@const originalIndex = originalRowIndexMap.get(row.id) ?? -1}
      <div class="table-row" style="height: {rowBlockHeight}px;">
        <div
          class="table-cell row-number merged"
          style="width: {ROW_NUMBER_WIDTH}px;"
          role="rowheader"
          tabindex="-1"
          on:contextmenu={(e) => handleContextMenu(e, { type: 'row', rowId: row.id })}
        >
          <div class="row-number-content">
            {originalIndex >= 0 ? originalIndex + 1 : '-'}
          </div>
        </div>
        {#each flatColumns as column (column.key)}
          {@const columnMeta = displayColumnMeta.get(column.key)}
          {@const isScalarColumn = !columnMeta || columnMeta.kind === 'scalar'}
          {@const baseColumnKey = columnMeta?.baseColumnKey ?? column.key}
          {@const cell = row.cells[baseColumnKey]}
          {@const cellValue = cell?.value}
          {@const isImage = isScalarColumn && isImageUrl(cellValue)}
          {@const isEditing = isScalarColumn && editingCell?.rowId === row.id && editingCell?.columnKey === column.key}
          <div
            class="table-cell cell-wrapper {isScalarColumn ? '' : 'array-wrapper'}"
            style="width: {getColumnWidth(column.key)}px; height: {rowBlockHeight}px;"
            role="cell"
            tabindex="0"
            data-row-id={row.id}
            data-column-key={column.key}
            on:click={(e) => {
              if (isScalarColumn) {
                handleCellClick(row.id, column.key, e);
              } else {
                e.stopPropagation();
              }
            }}
            on:keydown={(e) => isScalarColumn && handleCellKeyActivation(e, row.id, column.key)}
            on:contextmenu={(e) => handleContextMenu(e, { type: 'cell', rowId: row.id, key: column.key })}
          >
            {#if isScalarColumn}
              {#if isEditing}
                <!-- svelte-ignore a11y-autofocus -->
                <input
                  type="text"
                  class="cell-input editing"
                  class:has-image={isImage}
                  bind:value={editingValue}
                  on:keydown={(e) => handleCellKeydown(e, row.id, column.key)}
                  on:blur={commitCellEdit}
                  autofocus
                />
              {:else}
                <div class="cell-display" class:has-image={isImage}>
                  {formatCellValue(cellValue)}
                </div>
                {#if isImage}
                  <button
                    class="image-icon-btn"
                    on:click|stopPropagation={() => openImageViewer(String(cellValue))}
                    title="이미지 보기"
                  >
                    <span class="material-icons">image</span>
                  </button>
                {/if}
              {/if}
            {:else}
              {@const parentKey = columnMeta?.parentKey}
              {@const arrayInfo = parentKey ? getArrayDisplayData(row, parentKey) : null}
              {@const displayCount = arrayInfo ? Math.max(arrayInfo.displayCount, 1) : slotCount}
              {@const dataCount = arrayInfo ? arrayInfo.items.length : 0}
              {@const hasMore = !!(arrayInfo && arrayInfo.showMore && parentKey)}
              {@const fillerRows = Math.max(displayCount - dataCount - (hasMore ? 1 : 0), 0)}
              {@const trailingPlaceholders = Math.max(slotCount - displayCount, 0)}
              <div class="cell-array" style={`grid-template-rows: repeat(${slotCount}, ${rowHeight}px);`}>
                {#if arrayInfo}
                  {#each arrayInfo.items as entry}
                    <div class="cell-array-row">
                      {formatNestedArrayValue(getArrayEntryFieldValue(entry, columnMeta?.fieldPath))}
                    </div>
                  {/each}
                  {#if hasMore && parentKey}
                    <button
                      class="cell-array-more"
                      on:click|stopPropagation={() => toggleChildArrayExpansion(row.id, parentKey)}
                    >
                      <span class="material-icons">
                        {expandedChildArrays.has(getChildArrayKey(row.id, parentKey)) ? 'expand_less' : 'more_horiz'}
                      </span>
                      {#if !expandedChildArrays.has(getChildArrayKey(row.id, parentKey))}
                        <span class="more-label">+{arrayInfo.totalCount - arrayInfo.items.length}</span>
                      {/if}
                    </button>
                  {/if}
                  {#each Array.from({ length: fillerRows }) as _}
                    <div class="cell-array-row placeholder"></div>
                  {/each}
                  {#each Array.from({ length: trailingPlaceholders }) as _}
                    <div class="cell-array-row placeholder"></div>
                  {/each}
                {:else}
                  {#each Array.from({ length: slotCount }) as _}
                    <div class="cell-array-row placeholder"></div>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
    {#if bottomSpacerHeight > 0}
      <div class="spacer" style="height: {bottomSpacerHeight}px;"></div>
    {/if}
  </div>
  
  {#if resizeGuideLine.visible}
    <div 
      class="resize-guide-line" 
      style="left: {resizeGuideLine.x}px;"
    ></div>
  {/if}
</div>

<ColumnTransformDialog
  show={showTransformDialog}
  {data}
  targetRows={dialogTargetRows}
  targetIsFiltered={dialogTargetIsFiltered}
  targetFilteredResultEmpty={dialogTargetFilteredEmpty}
  selectedColumns={Array.from(selectedColumns)}
  onApply={handleTransformApply}
  onClose={handleTransformClose}
/>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={contextMenu.items}
    onClose={closeContextMenu}
  />
{/if}

<ImageViewer bind:show={showImageViewer} imageUrl={imageViewerUrl} />

<style>
  .table-container {
    width: 100%;
    height: 100%;
    max-height: 100%;
    overflow: auto;
    position: relative;
    /* 성능 최적화 */
    will-change: scroll-position;
    contain: layout style paint;
  }

  .table-header {
    position: sticky;
    top: 0;
    z-index: 1010;
    background: var(--bg-secondary);
    width: fit-content;
    min-width: 100%;
    border-bottom: 1px solid var(--border);
  }

  .table-body {
    position: relative;
    width: fit-content;
    min-width: 100%;
    contain: layout style paint;
  }

  .table-row {
    display: flex;
    min-height: 32px;
    border-bottom: 1px solid var(--border);
    width: 100%;
    box-sizing: border-box;
    align-items: stretch;
  }

  .table-row.header-row {
    min-height: 28px;
  }

  .header-grid .table-cell {
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
  }


  .header-grid-wrapper {
    width: fit-content;
    max-width: 100%;
    overflow-y: visible;
  }

  .header-grid {
    display: grid;
    grid-template-rows: 28px 28px;
    min-height: 56px;
    width: fit-content;
    min-width: 100%;
  }

  .table-row:hover {
    background: var(--bg-secondary);
  }

  .spacer {
    width: 100%;
    flex-shrink: 0;
  }

  .table-cell {
    padding: 0.5rem;
    display: flex;
    align-items: center;
    border-right: 1px solid var(--border);
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
    flex-shrink: 0;
    overflow: visible;
    
    &:has(.cell-input.editing) {
      border: 1px solid var(--accent);
      background: var(--accent-alpha);
    }
  }

  .header-cell {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    overflow: visible;
    user-select: none;
    cursor: grab;
  }

  .header-cell:active {
    cursor: grabbing;
  }

  .header-cell.dragging {
    cursor: grabbing;
  }

  .header-cell.selected {
    background: var(--bg-tertiary);
  }

  .header-cell.selected .header-label {
    color: var(--accent);
    font-weight: 700;
  }

  /* 동적으로 추가되는 클래스 - 드래그 중 표시용 */
  :global(.header-cell.drag-over-left::before) {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--accent);
    z-index: 10;
    animation: drag-indicator-pulse 0.6s ease-in-out infinite;
  }

  /* 동적으로 추가되는 클래스 - 드래그 중 표시용 */
  :global(.header-cell.drag-over-right::after) {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--accent);
    z-index: 10;
    animation: drag-indicator-pulse 0.6s ease-in-out infinite;
  }

  @keyframes drag-indicator-pulse {
    0%, 100% {
      opacity: 0.6;
      transform: scaleY(1);
    }
    50% {
      opacity: 1;
      transform: scaleY(1.1);
    }
  }

  /* 동적으로 생성되는 고스트 요소용 스타일 */
  :global(.dragging-ghost) {
    transition: transform 0.1s ease-out;
  }

  .header-cell {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s ease;
  }
  
  /* 드래그 중에는 transition 비활성화 */
  .header-cell.dragging {
    transition: none !important;
  }

  .table-cell {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .group-header {
    justify-content: center;
    border-bottom: 1px solid var(--border);
  }

  .group-header.empty-group {
    background: var(--bg-tertiary);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    flex: 1;
  }

  .header-label {
    flex: 1;
    cursor: inherit;
    user-select: none;
  }

  .header-label:hover {
    color: var(--accent);
  }

  .sort-indicator {
    font-size: 16px;
    color: var(--accent);
    display: inline-flex;
    align-items: center;
  }

  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    background: transparent;
    z-index: 1;
  }

  .resize-handle:hover {
    background: var(--accent);
  }

  .resize-guide-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
    pointer-events: none;
    z-index: 2000;
    opacity: 0.8;
  }

  .row-number {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    justify-content: center;
    font-weight: 500;
    flex-shrink: 0;
    position: sticky;
    left: 0;
    z-index: 1005;
    display: flex;
    align-items: center;
  }

  .row-number.merged {
    padding: 0;
    align-items: stretch;
  }

  .row-number-content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .row-number-header {
    position: sticky;
    left: 0;
    z-index: 1015;
  }

  .cell-wrapper {
    display: flex;
    align-items: stretch;
    gap: 0.25rem;
    position: relative;
    cursor: cell;
    height: 100%;
  }

  .array-wrapper {
    padding: 0;
  }

  .cell-display {
    flex: 1;
    min-width: 0;
    color: var(--text-primary);
    font-size: 0.875rem;
    padding: 0.25rem;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    display: flex;
    align-items: center;
  }

  .cell-display.has-image {
    padding-right: 1.75rem;
  }

  .cell-array {
    display: grid;
    width: 100%;
    height: 100%;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    overflow: hidden;
  }

  .cell-array-row {
    display: flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 0.8125rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .cell-array-row:last-child {
    border-bottom: none;
  }

  .cell-array-row.placeholder {
    opacity: 0.2;
  }

  .cell-array-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    min-height: 32px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.75rem;
  }

  .cell-array-more .material-icons {
    font-size: 18px;
  }

  .cell-array-more .more-label {
    font-size: 0.75rem;
  }

  .cell-array-more:hover {
    color: var(--accent);
  }


  .cell-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    padding: 0.25rem;
    /* border: 1px solid var(--accent); */
    outline: none;
    border-radius: 4px;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
  
  .cell-input.editing {
    white-space: normal;
    overflow: visible;
    word-wrap: break-word;
  }

  .cell-input.has-image {
    padding-right: 1.75rem;
  }

  .image-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
    padding: 0;
  }

  .image-icon-btn:hover {
    background: var(--bg-tertiary);
    border-color: var(--border);
    scale: 1.05;
  }

  .image-icon-btn .material-icons {
    font-size: 16px;
    color: var(--text-secondary);
  }

  /* .image-icon-btn:hover .material-icons {
    color: var(--text-primary);
  } */

</style>
