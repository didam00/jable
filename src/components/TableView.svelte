<script lang="ts">
  import { dataStore } from '../agents/store';
  import type { TableData, Row, Column } from '../agents/store';
  import { sortRows } from '../agents/filters';
  import ColumnFilter from './ColumnFilter.svelte';
  import ColumnTransformDialog from './ColumnTransformDialog.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import { executeFunctionSync } from '../utils/safeFunctionExecutor';
  import { onMount, createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();

  let data: TableData = {
    columns: [],
    rows: [],
    metadata: { rowCount: 0, columnCount: 0, isFlat: true },
  };
  
  export let searchMatchedRowIds: Set<string> = new Set(); // 검색된 행 ID들
  export let searchFilteredColumnKeys: string[] | null = null; // 검색으로 필터링된 열 키들
  
  let scrollLeft = 0;
  let scrollTop = 0;
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

  const ROW_HEIGHT = 32;
  const VISIBLE_ROWS = 25; // 최소 25개 행 표시
  const DEFAULT_COLUMN_WIDTH = 200;
  const ROW_NUMBER_WIDTH = 60;

  interface ColumnGroup {
    key: string;
    label: string;
    columns: Column[];
    startIndex: number;
  }

  onMount(() => {
    const unsubscribe = dataStore.subscribe((value) => {
      data = value;
      initializeColumnWidths();
      updateFilteredRows();
    });

    const handleClickOutside = () => {
      if (contextMenu) {
        closeContextMenu();
      }
    };
    window.addEventListener('click', handleClickOutside);

    return () => {
      unsubscribe();
      window.removeEventListener('click', handleClickOutside);
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

  function getColumnGroups(): ColumnGroup[] {
    if (data.metadata.isFlat) {
      return [];
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

    return result;
  }


  function updateFilteredRows() {
    if (data && data.rows) {
      let rows = data.rows;
      
      // 검색 결과 필터링 적용
      if (searchMatchedRowIds.size > 0) {
        rows = rows.filter((row) => searchMatchedRowIds.has(row.id));
      }
      
      // 컬럼 필터 적용
      if (activeFilters.size > 0) {
        rows = rows.filter((row) => {
          for (const [columnKey, filterValue] of activeFilters.entries()) {
            const cell = row.cells[columnKey];
            if (!cell || !String(cell.value ?? '').toLowerCase().includes(filterValue.toLowerCase())) {
              return false;
            }
          }
          return true;
        });
      }
      
      // 정렬 적용
      filteredRows = sortColumn
        ? sortRows(rows, sortColumn, sortDirection)
        : rows;
    } else {
      filteredRows = [];
    }
  }
  
  function updateStateAndDispatch() {
    updateFilteredRows();
    dispatch('stateChange', {
      sortColumn,
      sortDirection,
      filters: Object.fromEntries(activeFilters),
    });
  }

  // data 또는 검색 결과가 변경될 때 filteredRows 자동 업데이트
  $: {
    if (data) {
      updateStateAndDispatch();
    }
  }
  
  $: {
    if (searchMatchedRowIds) {
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
    updateStateAndDispatch();
  }
  
  export function clearSort() {
    sortColumn = null;
    sortDirection = 'asc';
    updateStateAndDispatch();
  }

  function handleFilter(columnKey: string, value: string) {
    if (!value.trim()) {
      activeFilters.delete(columnKey);
    } else {
      activeFilters.set(columnKey, value);
    }
    updateStateAndDispatch();
  }
  
  export function clearFilter(columnKey?: string) {
    if (columnKey) {
      activeFilters.delete(columnKey);
    } else {
      activeFilters.clear();
    }
    updateStateAndDispatch();
  }

  function handleScroll(event: Event) {
    const target = event.target as HTMLDivElement;
    scrollLeft = target.scrollLeft;
    scrollTop = target.scrollTop;

    if (header) {
      header.scrollLeft = scrollLeft;
    }
  }

  let visibleRows: Array<Row & { index: number; originalIndex: number }> = [];
  let tableBodyHeight = 0;
  let tableContainer: HTMLDivElement;
  
  // 원본 행 인덱스 맵 (성능 최적화)
  $: originalRowIndexMap = new Map(data.rows.map((row, index) => [row.id, index]));
  
  $: {
    if (filteredRows.length === 0) {
      visibleRows = [];
      tableBodyHeight = 0;
    } else {
      const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
      const end = Math.min(start + VISIBLE_ROWS + 10, filteredRows.length);
      const rows = filteredRows.slice(start, end);
      
      visibleRows = rows.map((row, index) => {
        // 원본 데이터에서의 행 인덱스 찾기 (맵에서 빠르게 조회)
        const originalIndex = originalRowIndexMap.get(row.id) ?? -1;
        return {
          ...row,
          index: start + index, // 필터링된 인덱스 (가상 스크롤링용)
          originalIndex, // 원본 인덱스
        };
      });
      
      // 전체 테이블 높이 계산
      tableBodyHeight = filteredRows.length * ROW_HEIGHT;
    }
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

  function updateCell(rowId: string, columnKey: string, value: any) {
    dataStore.update((data) => {
      const row = data.rows.find((r) => r.id === rowId);
      if (row && row.cells[columnKey]) {
        row.cells[columnKey].value = value;
      }
      return data;
    });
  }

  function formatCellValue(cell: any): string {
    if (cell === null || cell === undefined) return '';
    if (typeof cell === 'object') return JSON.stringify(cell);
    return String(cell);
  }

  function isImageUrl(value: any): boolean {
    if (typeof value !== 'string') return false;
    const url = value.trim();
    if (!url) return false;
    
    // 이미지 확장자 확인
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    const lowerUrl = url.toLowerCase();
    const hasImageExtension = imageExtensions.some(ext => lowerUrl.includes(ext));
    
    if (!hasImageExtension) return false;
    
    // 유효한 URL 형식인지 확인
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      // 상대 경로나 다른 형식은 false 반환
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
          // 결과 배열을 각 행에 적용
          result.result.forEach((item: any, index: number) => {
            if (index < data.rows.length) {
              const row = data.rows[index];
              if (columns.length === 1) {
                // 단일 열: 배열의 각 요소를 해당 열에 적용
                const cell = row.cells[columns[0]];
                if (cell) {
                  cell.value = item;
                }
              } else {
                // 여러 열: 객체의 각 속성을 해당 열에 적용
                columns.forEach((colKey) => {
                  const cell = row.cells[colKey];
                  if (cell && item && typeof item === 'object' && colKey in item) {
                    cell.value = item[colKey];
                  }
                });
              }
            }
          });
        }
      } else {
        // 단일 값 변환 모드
        columns.forEach((columnKey) => {
          data.rows.forEach((row) => {
            const cell = row.cells[columnKey];
            if (cell) {
              // 같은 행의 다른 열 값들을 rowData로 전달
              const rowData: Record<string, any> = {};
              data.columns.forEach((col) => {
                if (col.key !== columnKey && row.cells[col.key]) {
                  rowData[col.key] = row.cells[col.key].value;
                }
              });
              
              const result = executeFunctionSync(
                code, 
                cell.value, 
                cell.value, 
                { mode: 'single', rowData }
              );
              if (result.success && result.result !== undefined) {
                cell.value = result.result;
              }
            }
          });
        });
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
    
    isSelectingColumns = true;
    selectionStartColumn = columnKey;
    selectedColumns.clear();
    selectedColumns.add(columnKey);
    selectedColumns = selectedColumns; // Svelte reactivity
    lastClickedColumn = columnKey;
    
    event.preventDefault();
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isSelectingColumns) return;
      
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
    };
    
    const handleMouseUp = () => {
      isSelectingColumns = false;
      selectionStartColumn = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
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


  // Grid 컬럼 템플릿 계산
  let headerGridTemplateColumns = '';
  let headerGridItems: Array<{
    element: 'row-number' | 'group-header' | 'ungrouped-header' | 'grouped-header';
    gridColumn: string;
    gridRow: string;
    column?: Column;
    group?: ColumnGroup;
    width: number;
  }> = [];

  $: {
    if (columnGroups.length > 0) {
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
    } else {
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
              on:contextmenu={(e) => handleContextMenu(e, { type: 'group', groupKey: group.key })}
            >
              {group.label || group.key || ''}
            </div>
          {:else if item.element === 'ungrouped-header' && item.column}
            {@const col = item.column}
            <div
              class="table-cell header-cell merged-header {selectedColumns.has(col.key) ? 'selected' : ''}"
              style="grid-column: {item.gridColumn}; grid-row: {item.gridRow};"
              data-column-key={col.key}
              role="columnheader"
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
              class="table-cell header-cell {selectedColumns.has(col.key) ? 'selected' : ''}"
              style="grid-column: {item.gridColumn}; grid-row: {item.gridRow};"
              data-column-key={col.key}
              role="columnheader"
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
            class="table-cell header-cell {selectedColumns.has(column.key) ? 'selected' : ''}" 
            style="width: {getColumnWidth(column.key)}px;"
            data-column-key={column.key}
            role="columnheader"
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
  <div
    class="table-body"
    style="height: {tableBodyHeight > 0 ? tableBodyHeight : VISIBLE_ROWS * ROW_HEIGHT}px;"
  >
    <div class="table-spacer" style="height: {Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5) * ROW_HEIGHT}px;"></div>
    {#each visibleRows as row (row.id)}
      <div class="table-row">
        <div 
          class="table-cell row-number" 
          style="width: {ROW_NUMBER_WIDTH}px;"
          role="rowheader"
          on:contextmenu={(e) => handleContextMenu(e, { type: 'row', rowId: row.id })}
          title={row.originalIndex >= 0 ? `원본 행 번호: ${row.originalIndex + 1}` : ''}
        >
          {row.originalIndex >= 0 ? row.originalIndex + 1 : '-'}
        </div>
        {#each flatColumns as column}
          {@const cell = row.cells[column.key]}
          {@const cellValue = cell?.value}
          {@const isImage = isImageUrl(cellValue)}
          <div 
            class="table-cell cell-wrapper" 
            style="width: {getColumnWidth(column.key)}px;"
            role="cell"
            data-row-id={row.id}
            data-column-key={column.key}
            on:contextmenu={(e) => handleContextMenu(e, { type: 'cell', rowId: row.id, key: column.key })}
          >
            <input
              type="text"
              class="cell-input"
              class:has-image={isImage}
              value={formatCellValue(cellValue)}
              on:blur={(e) => updateCell(row.id, column.key, e.currentTarget.value)}
            />
            {#if isImage}
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
  }

  .table-row {
    display: flex;
    min-height: 32px;
    border-bottom: 1px solid var(--border);
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
  }

  .header-cell.selected {
    background: var(--bg-tertiary);
  }

  .header-cell.selected .header-label {
    color: var(--accent);
    font-weight: 700;
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
    cursor: pointer;
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
  }

  .cell-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    padding: 0.25rem;
    border: none;
    outline: none;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }

  .cell-input.has-image {
    padding-right: 1.75rem;
  }

  .cell-input:focus {
    background: var(--bg-secondary);
    border-radius: 4px;
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

  .table-spacer {
    width: 100%;
  }
</style>
