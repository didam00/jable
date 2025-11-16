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
  
  const dispatch = createEventDispatcher();

  let data: TableData = {
    columns: [],
    rows: [],
    metadata: { rowCount: 0, columnCount: 0, isFlat: true },
  };
  
  export let searchMatchedRowIds: Set<string> = new Set(); // 검색된 행 ID들
  export let searchFilteredColumnKeys: string[] | null = null; // 검색으로 필터링된 열 키들
  
  let scrollLeft = 0;
  let header: HTMLDivElement;
  let sortColumn: string | null = null;
  let sortDirection: 'asc' | 'desc' = 'asc';
  let filteredRows: Row[] = [];
  let columnWidths: Map<string, number> = new Map();
  let activeFilters: Map<string, string> = new Map(); // 컬럼 키 -> 필터 값
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
  let dragColumnElementsCache: HTMLElement[] | null = null; // 열 요소 캐시
  let dragAnimationFrame: number | null = null; // requestAnimationFrame ID
  
  // 셀 편집 상태
  let editingCell: { rowId: string; columnKey: string } | null = null;
  let editingValue: string = '';

  const ROW_HEIGHT = 32;
  const DEFAULT_COLUMN_WIDTH = 200;
  const ROW_NUMBER_WIDTH = 60;
  
  // 설정에서 동적으로 가져오기
  let maxVisibleRows = 50;
  let bufferRows = 25;
  
  $: {
    const settings = settingsStore.get();
    maxVisibleRows = settings.maxVisibleRows;
    bufferRows = settings.bufferRows;
  }

  interface ColumnGroup {
    key: string;
    label: string;
    columns: Column[];
    startIndex: number;
  }

  // 컨테이너 크기 변경 감지
  let resizeObserver: ResizeObserver | null = null;
  
  onMount(() => {
    const unsubscribe = dataStore.subscribe((value) => {
      // 데이터 참조가 실제로 변경되었을 때만 업데이트
      if (data !== value) {
        data = value;
        initializeColumnWidths();
        // updateFilteredRows()는 reactive 문에서 처리하므로 여기서는 제거
      }
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

  // getColumnGroups 캐시 (성능 최적화)
  let lastColumnsRef: Column[] | null = null;
  let cachedColumnGroups: ColumnGroup[] = [];
  
  function getColumnGroups(): ColumnGroup[] {
    if (data.metadata.isFlat) {
      return [];
    }

    // 컬럼 참조가 변경되지 않았으면 캐시 반환
    if (data.columns === lastColumnsRef && cachedColumnGroups.length >= 0) {
      return cachedColumnGroups;
    }

    const groups = new Map<string, Column[]>();
    
    data.columns.forEach((col) => {
      const parts = col.key.split('.');
      if (parts.length > 1) {
        const groupKey = parts[0];
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(col);
      }
    });

    const result: ColumnGroup[] = [];
    let currentIndex = 0;
    
    data.columns.forEach((col) => {
      const parts = col.key.split('.');
      if (parts.length > 1) {
        const groupKey = parts[0];
        if (groups.has(groupKey) && !result.find((g) => g.key === groupKey)) {
          const groupColumns = groups.get(groupKey)!;
          result.push({
            key: groupKey,
            label: groupKey,
            columns: groupColumns,
            startIndex: currentIndex,
          });
          currentIndex += groupColumns.length;
        }
      } else {
        currentIndex++;
      }
    });

    // 캐시 업데이트
    lastColumnsRef = data.columns;
    cachedColumnGroups = result;
    return result;
  }


  // 필터링 최적화: 캐싱 및 배치 처리
  let lastFilterState: string = '';
  let filterUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  
  function updateFilteredRows() {
    if (!data || !data.rows) {
      filteredRows = [];
      return;
    }
    
    // 현재 필터 상태를 문자열로 만들어서 비교
    const currentFilterState = JSON.stringify({
      searchCount: searchMatchedRowIds.size,
      filters: Array.from(activeFilters.entries()).sort(),
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
      const filterLower = new Map<string, string>();
      activeFilters.forEach((value, key) => {
        filterLower.set(key, value.toLowerCase());
      });
      
      if (isLargeData) {
        // 대용량 데이터는 배치 처리
        const batchSize = 1000;
        const filtered: Row[] = [];
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          filtered.push(...batch.filter((row) => {
            for (const [columnKey, filterValue] of filterLower.entries()) {
              const cell = row.cells[columnKey];
              const cellValue = cell?.value ?? '';
              if (!String(cellValue).toLowerCase().includes(filterValue)) {
                return false;
              }
            }
            return true;
          }));
        }
        rows = filtered;
      } else {
        rows = rows.filter((row) => {
          for (const [columnKey, filterValue] of filterLower.entries()) {
            const cell = row.cells[columnKey];
            const cellValue = cell?.value ?? '';
            if (!String(cellValue).toLowerCase().includes(filterValue)) {
              return false;
            }
          }
          return true;
        });
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
        filters: Object.fromEntries(activeFilters),
      });
      filterUpdateTimeout = null;
    }, 0); // 다음 틱에서 실행
  }

  // data 또는 검색 결과가 변경될 때 filteredRows 자동 업데이트 (debounced)
  let lastDataRef: TableData | null = null;
  let lastDataHash = '';
  
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
  
  // searchMatchedRowIds 변경 감지 (Set의 size 변경만 체크)
  let lastSearchMatchedSize = 0;
  $: {
    const currentSize = searchMatchedRowIds?.size ?? 0;
    if (currentSize !== lastSearchMatchedSize) {
      lastSearchMatchedSize = currentSize;
      lastFilterState = ''; // 강제 업데이트
      updateStateAndDispatch();
    }
  }

  function handleSort(columnKey: string) {
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
    if (!value.trim()) {
      activeFilters.delete(columnKey);
    } else {
      activeFilters.set(columnKey, value);
    }
    // 필터 상태 캐시 리셋 (강제 업데이트)
    lastFilterState = '';
    // Map 변경을 reactivity에 알리기 위해 새 참조 생성
    activeFilters = new Map(activeFilters);
    updateStateAndDispatch();
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
  
  // 필터링된 행이 변경될 때 보이는 행 업데이트 (requestAnimationFrame으로 최적화)
  let filterUpdateFrame: number | null = null;
  let lastFilteredRowsRef: Row[] | null = null;
  
  $: {
    // filteredRows 참조나 길이가 실제로 변경되었을 때만 업데이트
    if (filteredRows !== lastFilteredRowsRef || filteredRows.length !== lastFilteredRowsLength) {
      lastFilteredRowsRef = filteredRows;
      lastFilteredRowsLength = filteredRows.length;
      
      if (filterUpdateFrame !== null) {
        cancelAnimationFrame(filterUpdateFrame);
      }
      
      filterUpdateFrame = requestAnimationFrame(() => {
        if (filteredRows.length > 0) {
          updateVisibleRows();
        } else {
          visibleRows = [];
          visibleStartIndex = 0;
          visibleEndIndex = 0;
          lastFilteredRowsLength = 0;
        }
        filterUpdateFrame = null;
      });
    }
  }
  
  let tableContainer: HTMLDivElement;
  let scrollTop = 0;
  let containerHeight = 0;
  
  // 가상 스크롤링: 보이는 행 범위 계산
  let visibleStartIndex = 0;
  let visibleEndIndex = 0;
  let visibleRows: Row[] = [];
  
  // 원본 행 인덱스 맵 (성능 최적화) - 지연 업데이트 및 캐싱
  let originalRowIndexMap = new Map<string, number>();
  let lastDataRowsLength = 0;
  let lastDataRowsRef: Row[] | null = null;
  
  function updateOriginalRowIndexMap() {
    // 데이터가 변경되지 않았으면 업데이트 스킵
    if (lastDataRowsRef === data.rows && lastDataRowsLength === data.rows.length) {
      return;
    }
    
    // 대용량 데이터의 경우 배치 처리로 성능 최적화
    const newMap = new Map<string, number>();
    const batchSize = 5000; // 한 번에 처리할 행 수
    
    if (data.rows.length > batchSize) {
      // 대용량 데이터는 배치로 처리
      let processed = 0;
      const processBatch = () => {
        const end = Math.min(processed + batchSize, data.rows.length);
        for (let i = processed; i < end; i++) {
          newMap.set(data.rows[i].id, i);
        }
        processed = end;
        
        if (processed < data.rows.length) {
          // 다음 배치를 다음 프레임에서 처리
          requestIdleCallback(processBatch, { timeout: 50 });
        } else {
          originalRowIndexMap = newMap;
          lastDataRowsRef = data.rows;
          lastDataRowsLength = data.rows.length;
        }
      };
      processBatch();
    } else {
      // 작은 데이터는 즉시 처리
      for (let i = 0; i < data.rows.length; i++) {
        newMap.set(data.rows[i].id, i);
      }
      originalRowIndexMap = newMap;
      lastDataRowsRef = data.rows;
      lastDataRowsLength = data.rows.length;
    }
  }
  
  // data.rows가 변경될 때만 맵 업데이트 (필요한 경우에만)
  $: {
    if (data && data.rows && (lastDataRowsRef !== data.rows || lastDataRowsLength !== data.rows.length)) {
      updateOriginalRowIndexMap();
    }
  }
  
  // 가상 스크롤링: 보이는 행 계산 (최적화)
  let lastScrollTop = -1;
  let lastContainerHeight = -1;
  let lastFilteredRowsLength = -1;
  
  function updateVisibleRows() {
    if (!tableContainer || filteredRows.length === 0) {
      visibleRows = [];
      visibleStartIndex = 0;
      visibleEndIndex = 0;
      lastFilteredRowsLength = 0;
      return;
    }
    
    // tableContainer가 아직 마운트되지 않았으면 스킵
    if (!tableContainer.getBoundingClientRect) {
      return;
    }
    
    const containerRect = tableContainer.getBoundingClientRect();
    const newContainerHeight = containerRect.height;
    const newScrollTop = tableContainer.scrollTop;
    
    // 스크롤 위치나 컨테이너 크기, 필터링된 행 수가 변경되지 않았으면 스킵
    if (
      lastScrollTop === newScrollTop &&
      lastContainerHeight === newContainerHeight &&
      lastFilteredRowsLength === filteredRows.length &&
      visibleRows.length > 0
    ) {
      return;
    }
    
    scrollTop = newScrollTop;
    containerHeight = newContainerHeight;
    lastScrollTop = newScrollTop;
    lastContainerHeight = newContainerHeight;
    lastFilteredRowsLength = filteredRows.length;
    
    // 보이는 행 범위 계산
    const startRowIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
    const endRowIndex = Math.min(filteredRows.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT));
    
    // 실제로 보이는 영역 크기 (이건 항상 렌더링되어야 함)
    const visibleRange = endRowIndex - startRowIndex;
    
    // 버퍼 추가 (위/아래 각각 bufferRows)
    const bufferedStart = Math.max(0, startRowIndex - bufferRows);
    const bufferedEnd = Math.min(filteredRows.length, endRowIndex + bufferRows);
    
    // 버퍼 영역의 크기
    const bufferedRange = bufferedEnd - bufferedStart;
    
    // 실제 보이는 영역은 항상 포함되어야 하므로, 최소한 보이는 영역만큼은 렌더링
    // maxVisibleRows는 추가로 렌더링할 수 있는 최대 행 수
    let newStartIndex = bufferedStart;
    let newEndIndex = bufferedEnd;
    
    // 전체 버퍼 영역이 maxVisibleRows를 넘으면, 보이는 영역 중심으로 제한
    if (bufferedRange > maxVisibleRows) {
      // 보이는 영역이 maxVisibleRows보다 크면, 보이는 영역만 렌더링
      if (visibleRange >= maxVisibleRows) {
        newStartIndex = startRowIndex;
        newEndIndex = endRowIndex;
      } else {
        // 보이는 영역 중심으로 위아래 버퍼 추가 (최대 maxVisibleRows개)
        const remainingRows = maxVisibleRows - visibleRange;
        const topBuffer = Math.floor(remainingRows / 2);
        const bottomBuffer = remainingRows - topBuffer;
        
        newStartIndex = Math.max(0, startRowIndex - topBuffer);
        newEndIndex = Math.min(filteredRows.length, endRowIndex + bottomBuffer);
      }
    }
    
    // 범위가 변경되지 않았으면 스킵
    if (visibleStartIndex === newStartIndex && visibleEndIndex === newEndIndex && visibleRows.length > 0) {
      return;
    }
    
    visibleStartIndex = newStartIndex;
    visibleEndIndex = newEndIndex;
    
    // 보이는 행 추출
    visibleRows = filteredRows.slice(visibleStartIndex, visibleEndIndex);
  }
  
  // 스크롤 이벤트 핸들러 최적화 (requestAnimationFrame 사용)
  let scrollAnimationFrame: number | null = null;
  
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
    const rowIndex = filteredRows.findIndex(row => row.id === rowId);
    if (rowIndex === -1) return;
    
    // 행으로 스크롤
    const targetScrollTop = rowIndex * ROW_HEIGHT;
    if (tableContainer) {
      tableContainer.scrollTop = Math.max(0, targetScrollTop - 100); // 약간의 여유 공간
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

  export function navigateToRow(rowId: string) {
    const rowIndex = filteredRows.findIndex(row => row.id === rowId);
    if (rowIndex === -1) return;
    
    const targetScrollTop = rowIndex * ROW_HEIGHT;
    if (tableContainer) {
      tableContainer.scrollTop = Math.max(0, targetScrollTop - 100);
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
  
  function handleCellClick(rowId: string, columnKey: string, event: MouseEvent) {
    // 이미 편집 중인 셀이 있으면 커밋
    if (editingCell) {
      if (editingCell.rowId !== rowId || editingCell.columnKey !== columnKey) {
        commitCellEdit();
      } else {
        // 같은 셀을 다시 클릭한 경우 편집 모드 유지
        return;
      }
    }
    
    // 새 셀 편집 시작
    startCellEdit(rowId, columnKey);
    event.stopPropagation();
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

  // 이미지 URL 캐시 (성능 최적화)
  const imageUrlCache = new Map<string, boolean>();
  
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

    dataStore.update((data) => {
      if (mode === 'array') {
        // 배열 변환 모드: 모든 행의 값을 배열로 수집
        const allValues = data.rows.map((row) => {
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
          { mode: 'array', columns }
        );

        if (result.success && Array.isArray(result.result)) {
          const deletedIndexes = result.deletedIndexes || [];
          const deleteSet = new Set(deletedIndexes);
          
          // 삭제되지 않은 행들만 남기기
          const remainingRows: typeof data.rows = [];
          let resultIndex = 0;
          
          data.rows.forEach((row, originalIndex) => {
            if (deleteSet.has(originalIndex)) {
              // 이 행은 삭제됨
              return;
            }
            
            // 결과 배열에서 해당 항목 가져오기
            if (resultIndex < result.result.length) {
              const item = result.result[resultIndex];
              
              if (columns.length === 1) {
                // 단일 열: 배열의 각 요소를 해당 열에 적용
                const cell = row.cells[columns[0]];
                if (cell) {
                  // 빈 문자열은 null로 저장
                  cell.value = item === '' || item === null || item === undefined ? null : item;
                }
              } else {
                // 여러 열: 객체의 각 속성을 해당 열에 적용
                columns.forEach((colKey) => {
                  const cell = row.cells[colKey];
                  if (cell && item && typeof item === 'object' && colKey in item) {
                    const val = item[colKey];
                    // 빈 문자열은 null로 저장
                    cell.value = val === '' || val === null || val === undefined ? null : val;
                  }
                });
              }
              
              resultIndex++;
            }
            
            remainingRows.push(row);
          });
          
          // 행 수 업데이트
          data.rows = remainingRows;
          data.metadata.rowCount = data.rows.length;
        }
      } else {
        // 단일 값 변환 모드
        const rowsToDelete: string[] = [];
        
        columns.forEach((columnKey) => {
          data.rows.forEach((row) => {
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
                { mode: 'single', rowData }
              );
              
              if (result.success) {
                // return; (undefined)로 행 삭제 표시
                if (result.isDelete || result.result === DELETE_MARKER) {
                  rowsToDelete.push(row.id);
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
        if (rowsToDelete.length > 0) {
          const deleteSet = new Set(rowsToDelete);
          data.rows = data.rows.filter(row => !deleteSet.has(row.id));
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
  function handleColumnClick(columnKey: string, event: MouseEvent) {
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
        if (!colKey || colKey === draggingColumn) return;
        
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
        el.classList.remove('drag-over-left', 'drag-over-right');
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
    
    document.removeEventListener('mousemove', handleColumnDrag);
    document.removeEventListener('mouseup', endColumnDrag);
  }

  function moveColumn(sourceColumnKey: string, targetColumnKey: string, insertBefore: boolean) {
    if (sourceColumnKey === targetColumnKey) return;
    
    dataStore.update((data) => {
      const sourceIndex = data.columns.findIndex(c => c.key === sourceColumnKey);
      const targetIndex = data.columns.findIndex(c => c.key === targetColumnKey);
      
      if (sourceIndex === -1 || targetIndex === -1) return data;
      
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
    dataStore.update((data) => {
      const newColumnKey = `column_${Date.now()}`;
      const columnName = generateColumnName(data);
      
      let finalKey = newColumnKey;
      let finalLabel = columnName;
      
      // 그룹 내부/외부 추가 처리
      if (position === 'inside' && referenceColumnKey && groupName) {
        // 그룹 내부에 추가 (예: "user.name" -> "user.newColumn")
        const refColumn = data.columns.find(c => c.key === referenceColumnKey);
        if (refColumn) {
          const parts = refColumn.key.split('.');
          if (parts.length > 1) {
            // 이미 그룹 내부에 있음 - 같은 그룹에 추가
            const groupPrefix = parts[0];
            finalKey = `${groupPrefix}.${newColumnKey}`;
            finalLabel = columnName;
          } else {
            // 그룹이 없으면 새로 생성
            finalKey = `${groupName}.${newColumnKey}`;
            finalLabel = columnName;
          }
        } else {
          // 참조 열을 찾을 수 없으면 그룹 이름으로 생성
          finalKey = `${groupName}.${newColumnKey}`;
          finalLabel = columnName;
        }
      } else if (position === 'outside' && referenceColumnKey) {
        // 그룹 외부에 추가 (그룹 해제)
        finalKey = newColumnKey;
        finalLabel = columnName;
      }
      
      const newColumn: Column = {
        key: finalKey,
        label: finalLabel,
        type: 'string',
        width: DEFAULT_COLUMN_WIDTH,
      };

      let insertIndex = 0;
      if (referenceColumnKey) {
        const refIndex = data.columns.findIndex((c) => c.key === referenceColumnKey);
        if (refIndex !== -1) {
          if (position === 'left') {
            insertIndex = refIndex;
          } else if (position === 'right') {
            insertIndex = refIndex + 1;
          } else if (position === 'inside') {
            // 그룹 내부에 추가: 참조 열 다음에 같은 그룹의 열들이 있으면 그 뒤에 추가
            const refColumn = data.columns[refIndex];
            const parts = refColumn.key.split('.');
            if (parts.length > 1) {
              // 이미 그룹 내부에 있음
              const groupPrefix = parts[0];
              let nextIndex = refIndex + 1;
              while (nextIndex < data.columns.length) {
                const nextCol = data.columns[nextIndex];
                if (nextCol.key.startsWith(groupPrefix + '.')) {
                  nextIndex++;
                } else {
                  break;
                }
              }
              insertIndex = nextIndex;
            } else {
              // 그룹이 없으면 참조 열 다음에 추가
              insertIndex = refIndex + 1;
            }
          } else {
            insertIndex = refIndex + 1;
          }
        } else {
          insertIndex = position === 'left' ? 0 : data.columns.length;
        }
      } else {
        insertIndex = position === 'left' ? 0 : data.columns.length;
      }

      data.columns.splice(insertIndex, 0, newColumn);

      // 모든 행에 새 열의 셀 추가
      data.rows.forEach((row) => {
        row.cells[finalKey] = { value: '', type: 'string' };
      });

      data.metadata.columnCount = data.columns.length;
      return data;
    });
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
      return data;
    });
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
  function handleContextMenu(event: MouseEvent, target: { type: 'column' | 'row' | 'cell' | 'group'; key?: string; rowId?: string; groupKey?: string }) {
    event.preventDefault();
    event.stopPropagation();

    const items: any[] = [];

    if (target.type === 'group' && target.groupKey) {
      items.push(
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


  // Grid 컬럼 템플릿 계산 (캐싱 최적화)
  let headerGridTemplateColumns = '';
  let headerGridItems: Array<{
    element: 'row-number' | 'group-header' | 'ungrouped-header' | 'grouped-header';
    gridColumn: string;
    gridRow: string;
    column?: Column;
    group?: ColumnGroup;
    width: number;
  }> = [];
  let lastTopHeaderColumnsRef: typeof topHeaderColumns | null = null;
  let lastColumnWidthsHash = '';

  $: {
    // topHeaderColumns나 columnWidths가 변경되었을 때만 재계산
    const currentColumnWidthsHash = Array.from(columnWidths.entries()).sort().join(',');
    const needsUpdate = 
      columnGroups.length > 0 && 
      (topHeaderColumns !== lastTopHeaderColumnsRef || currentColumnWidthsHash !== lastColumnWidthsHash);
    
    if (needsUpdate) {
      lastTopHeaderColumnsRef = topHeaderColumns;
      lastColumnWidthsHash = currentColumnWidthsHash;
      
      // Grid 템플릿 컬럼 계산
      const columns: string[] = [`${ROW_NUMBER_WIDTH}px`];
      const items: typeof headerGridItems = [];
      
      let colStart = 2; // row-number가 1부터 시작하므로 2부터
      
      // Row number는 1층과 2층 모두 차지
      items.push({
        element: 'row-number',
        gridColumn: '1',
        gridRow: '1 / 3',
        width: ROW_NUMBER_WIDTH,
      });

      // 각 topHeaderColumn을 처리
      topHeaderColumns.forEach((item) => {
        if (item.type === 'group' && item.group) {
          const groupColCount = item.group.columns.length;
          
          // 그룹 내 각 컬럼의 너비를 columns에 추가
          item.group.columns.forEach((col) => {
            const colWidth = getColumnWidth(col.key);
            columns.push(`${colWidth}px`);
          });
          
          // 그룹 헤더 (1층, 그룹의 모든 컬럼 span)
          items.push({
            element: 'group-header',
            gridColumn: `${colStart} / ${colStart + groupColCount}`,
            gridRow: '1',
            group: item.group,
            width: item.group.columns.reduce((sum, col) => sum + getColumnWidth(col.key), 0),
          });
          
          // 그룹 내 각 컬럼 (2층)
          item.group.columns.forEach((col, idx) => {
            items.push({
              element: 'grouped-header',
              gridColumn: `${colStart + idx}`,
              gridRow: '2',
              column: col,
              width: getColumnWidth(col.key),
            });
          });
          
          colStart += groupColCount;
        } else if (item.type === 'column' && item.column) {
          const colWidth = getColumnWidth(item.column.key);
          columns.push(`${colWidth}px`);
          
          // 그룹화되지 않은 컬럼 (1층과 2층 병합)
          items.push({
            element: 'ungrouped-header',
            gridColumn: `${colStart}`,
            gridRow: '1 / 3',
            column: item.column,
            width: colWidth,
          });
          colStart++;
        }
      });
      
      headerGridTemplateColumns = columns.join(' ');
      headerGridItems = items;
    } else if (columnGroups.length === 0) {
      headerGridTemplateColumns = '';
      headerGridItems = [];
    }
  }

  let columnGroups: ColumnGroup[] = [];
  let flatColumns: Column[] = [];
  let topHeaderColumns: Array<{ type: 'group' | 'column'; group?: ColumnGroup; column?: Column }> = [];

  // data 또는 열 필터링이 변경될 때 컬럼 정보 업데이트
  // searchFilteredColumnKeys를 명시적으로 dependency로 포함
  $: if (data && data.columns && searchFilteredColumnKeys !== undefined) {
    if (data.columns.length > 0) {
      // 열 필터링 적용
      let columnsToShow = data.columns;
      if (searchFilteredColumnKeys && searchFilteredColumnKeys.length > 0) {
        // 여러 열 필터링
        columnsToShow = data.columns.filter(col => searchFilteredColumnKeys!.includes(col.key));
      }
      
      columnGroups = getColumnGroups();
      flatColumns = columnsToShow; // 필터링된 컬럼 사용
      
      // 1층 헤더용 컬럼 순서 (그룹화된 컬럼은 첫 번째만, 그룹화되지 않은 컬럼은 모두)
      const result: Array<{ type: 'group' | 'column'; group?: ColumnGroup; column?: Column }> = [];
      const processedGroups = new Set<string>();
      
      flatColumns.forEach((col) => {
        const group = columnGroups.find((g) => g.columns.some((c) => c.key === col.key));
        if (group && !processedGroups.has(group.key)) {
          processedGroups.add(group.key);
          result.push({ type: 'group', group });
        } else if (!group) {
          result.push({ type: 'column', column: col });
        }
      });
      
      topHeaderColumns = result;
    } else {
      columnGroups = [];
      flatColumns = [];
      topHeaderColumns = [];
    }
  }
</script>

<div class="table-container" bind:this={tableContainer} on:scroll={handleScroll}>
  <div class="table-header" bind:this={header}>
    {#if columnGroups.length > 0}
      <!-- 2층 헤더 구조 (Grid) -->
      <div
        class="header-grid"
        style="grid-template-columns: {headerGridTemplateColumns};"
      >
        {#each headerGridItems as item}
          {#if item.element === 'row-number'}
            <div
              class="table-cell header-cell row-number-header"
              style="grid-row: {item.gridRow}; display: flex; justify-content: center; font-size: 1rem"
            >
              #
            </div>
          {:else if item.element === 'group-header' && item.group}
            {@const group = item.group}
            <div
              class="table-cell header-cell group-header {group.key ? '' : 'empty-group'}"
              style="grid-column: {item.gridColumn}; grid-row: {item.gridRow};"
              role="columnheader"
              tabindex="-1"
              on:contextmenu={(e) => handleContextMenu(e, { type: 'group', groupKey: group.key })}
            >
              {group.label || group.key || ''}
            </div>
          {:else if item.element === 'ungrouped-header' && item.column}
            {@const col = item.column}
            <div
              class="table-cell header-cell merged-header {selectedColumns.has(col.key) ? 'selected' : ''} {draggingColumn === col.key ? 'dragging' : ''}"
              style="grid-column: {item.gridColumn}; grid-row: {item.gridRow};"
              data-column-key={col.key}
              role="columnheader"
              tabindex="-1"
              on:contextmenu={(e) => handleContextMenu(e, { type: 'column', key: col.key })}
              on:mousedown={(e) => handleColumnMouseDown(col.key, e)}
            >
              <div class="header-content">
                <span
                  class="header-label"
                  role="button"
                  tabindex="0"
                  on:click={(e) => {
                    handleColumnClick(col.key, e);
                    if (!e.defaultPrevented) {
                      handleSort(col.key);
                    }
                  }}
                  on:keydown={(e) => e.key === 'Enter' && handleSort(col.key)}
                >
                  {col.label}
                </span>
                {#if sortColumn === col.key}
                  <span class="sort-indicator material-icons">{sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                {/if}
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
              </div>
              <div
                class="resize-handle"
                role="button"
                tabindex="0"
                on:mousedown={(e) => startResize(col.key, e)}
              ></div>
            </div>
          {:else if item.element === 'grouped-header' && item.column}
            {@const col = item.column}
            <div
              class="table-cell header-cell {selectedColumns.has(col.key) ? 'selected' : ''} {draggingColumn === col.key ? 'dragging' : ''}"
              style="grid-column: {item.gridColumn}; grid-row: {item.gridRow};"
              data-column-key={col.key}
              role="columnheader"
              tabindex="-1"
              on:contextmenu={(e) => handleContextMenu(e, { type: 'column', key: col.key })}
              on:mousedown={(e) => handleColumnMouseDown(col.key, e)}
            >
              <div class="header-content">
                <span
                  class="header-label"
                  role="button"
                  tabindex="0"
                  on:click={(e) => {
                    handleColumnClick(col.key, e);
                    if (!e.defaultPrevented) {
                      handleSort(col.key);
                    }
                  }}
                  on:keydown={(e) => e.key === 'Enter' && handleSort(col.key)}
                >
                  {col.key.split('.').slice(1).join('.') || col.label}
                </span>
                {#if sortColumn === col.key}
                  <span class="sort-indicator material-icons">{sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                {/if}
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
              </div>
              <div
                class="resize-handle"
                role="button"
                tabindex="0"
                on:mousedown={(e) => startResize(col.key, e)}
              ></div>
            </div>
          {/if}
        {/each}
      </div>
    {:else}
      <!-- 1층 헤더 구조 (flat 데이터) -->
      <div class="table-row header-row">
        <div class="table-cell header-cell" style="width: {ROW_NUMBER_WIDTH}px;">#</div>
        {#each flatColumns as column}
          <div 
            class="table-cell header-cell {selectedColumns.has(column.key) ? 'selected' : ''} {draggingColumn === column.key ? 'dragging' : ''}" 
            style="width: {getColumnWidth(column.key)}px;"
            data-column-key={column.key}
            role="columnheader"
            tabindex="-1"
            on:contextmenu={(e) => handleContextMenu(e, { type: 'column', key: column.key })}
            on:mousedown={(e) => handleColumnMouseDown(column.key, e)}
          >
            <div class="header-content">
              <span
                class="header-label"
                role="button"
                tabindex="0"
                on:click={(e) => {
                  handleColumnClick(column.key, e);
                  if (!e.defaultPrevented) {
                    handleSort(column.key);
                  }
                }}
                on:keydown={(e) => e.key === 'Enter' && handleSort(column.key)}
              >
                {column.label}
              </span>
              {#if sortColumn === column.key}
                <span class="sort-indicator material-icons">{sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
              {/if}
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
  <div class="table-body" style="height: {filteredRows.length * ROW_HEIGHT}px;">
    <!-- 가상 스크롤링: 위쪽 패딩 -->
    {#if visibleStartIndex > 0}
      <div class="spacer" style="height: {visibleStartIndex * ROW_HEIGHT}px;"></div>
    {/if}
    <!-- 실제 렌더링되는 행들 -->
    {#each visibleRows as row (row.id)}
      {@const originalIndex = originalRowIndexMap.get(row.id) ?? -1}
      <div class="table-row">
        <div 
          class="table-cell row-number" 
          style="width: {ROW_NUMBER_WIDTH}px;"
          role="rowheader"
          tabindex="-1"
          on:contextmenu={(e) => handleContextMenu(e, { type: 'row', rowId: row.id })}
          title={originalIndex >= 0 ? `원본 행 번호: ${originalIndex + 1}` : ''}
        >
          {originalIndex >= 0 ? originalIndex + 1 : '-'}
        </div>
        {#each flatColumns as column}
          {@const cell = row.cells[column.key]}
          {@const cellValue = cell?.value}
          {@const isImage = isImageUrl(cellValue)}
          {@const isEditing = editingCell?.rowId === row.id && editingCell?.columnKey === column.key}
          <div 
            class="table-cell cell-wrapper" 
            style="width: {getColumnWidth(column.key)}px;"
            role="cell"
            tabindex="-1"
            data-row-id={row.id}
            data-column-key={column.key}
            on:click={(e) => handleCellClick(row.id, column.key, e)}
            on:contextmenu={(e) => handleContextMenu(e, { type: 'cell', rowId: row.id, key: column.key })}
          >
            {#if isEditing}
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
            {/if}
            {#if isImage && !isEditing}
              <button
                class="image-icon-btn"
                on:click|stopPropagation={() => openImageViewer(String(cellValue))}
                title="이미지 보기"
              >
                <span class="material-icons">image</span>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
    <!-- 가상 스크롤링: 아래쪽 패딩 -->
    {#if visibleEndIndex < filteredRows.length}
      <div class="spacer" style="height: {(filteredRows.length - visibleEndIndex) * ROW_HEIGHT}px;"></div>
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
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border);
    width: fit-content;
    min-width: 100%;
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
    height: 32px;
    border-bottom: 1px solid var(--border);
    width: 100%;
    box-sizing: border-box;
  }

  .table-row.header-row {
    min-height: 28px;
  }

  .header-grid .table-cell {
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
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
  }

  .row-number-header {
    position: sticky;
    left: 0;
    z-index: 1015;
  }

  .cell-wrapper {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    position: relative;
    cursor: cell;
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
  }

  .cell-display.has-image {
    padding-right: 1.75rem;
  }

  .cell-input {
    flex: 1;
    min-width: 0;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    padding: 0.25rem;
    border: 1px solid var(--accent);
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
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
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
