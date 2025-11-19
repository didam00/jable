<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { searchData } from '../agents/search';
  import { parseQuery, type ColumnSelection, type ParsedQuery } from '../agents/search/queryParser';
  import { resolveColumnSelectionToKeys } from '../agents/search/selectionUtils';
  import { dataStore } from '../agents/store';
  import type { TableData } from '../agents/store';
  import type { SearchResult } from '../agents/search/types';

  const dispatch = createEventDispatcher();

  export let isStreamingMode = false;

  let query = '';
  let useRegex = false;
  let results: SearchResult[] = [];
  let data: TableData = {
    columns: [],
    rows: [],
    metadata: { rowCount: 0, columnCount: 0, isFlat: true },
  };
  let searchInput: HTMLInputElement;
  let pendingSearch = false; // 스트리밍 모드에서 검색 대기 중인지 표시

  dataStore.subscribe((value) => {
    data = value;
    if (query && !isStreamingMode) {
      performSearch();
    } else if (query && isStreamingMode && pendingSearch) {
      performSearch();
      pendingSearch = false;
    }
  });

  // query가 변경될 때마다 검색 실행 (스트리밍 모드가 아닐 때만)
  $: if (!isStreamingMode) {
    performSearch();
  }

  onMount(() => {
    function handleGlobalKeydown(event: KeyboardEvent) {
      // Ctrl+G 또는 Ctrl+F로 검색창 포커스
      if ((event.ctrlKey || event.metaKey) && (event.key === 'g' || event.key === 'f')) {
        // input 요소에 포커스가 없거나, input 외부에서 키가 눌렸을 때만
        const activeElement = document.activeElement;
        if (activeElement !== searchInput) {
          event.preventDefault();
          searchInput?.focus();
          searchInput?.select();
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
    };
  });

  function performSearch() {
    const trimmed = query.trim();
    if (!trimmed) {
      results = [];
      dispatch('searchChange', { 
        matchedRowIds: new Set<string>(),
        filteredColumnKeys: null,
      });
      return;
    }
    
    const parsed = parseQuery(trimmed);
    results = searchData(data, trimmed, useRegex);
    
    // 검색된 행 ID들을 Set으로 만들어서 전달
    const matchedRowIds = new Set<string>(results.map(r => r.rowId));
    
    const filteredColumnKeys = resolveFilteredColumns(parsed);
    
    dispatch('searchChange', { 
      matchedRowIds,
      filteredColumnKeys,
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      query = '';
      results = [];
      dispatch('searchChange', { 
        matchedRowIds: new Set<string>(),
        filteredColumnKeys: null,
      });
      return;
    }
    
    // 스트리밍 모드에서 Enter 또는 & 입력 시 검색 실행
    if (isStreamingMode) {
      if (event.key === 'Enter') {
        event.preventDefault();
        performSearch();
      } else if (event.key === '&' && !event.shiftKey) {
        // & 입력 시 검색 실행 (&가 query에 추가된 후 실행되도록 지연)
        setTimeout(() => performSearch(), 10);
      }
    }
  }

  function handleBlur() {
    // 스트리밍 모드에서 focus out 시 검색 실행
    if (isStreamingMode && query.trim()) {
      performSearch();
    }
  }

  function resolveFilteredColumns(parsed: ParsedQuery): string[] | null {
    if (!data || data.columns.length === 0) {
      return null;
    }

    if (parsed.type === 'logicalGroup' && parsed.subQueries) {
      const aggregated: string[] = [];
      parsed.subQueries.forEach(sub => {
        const subKeys = resolveFilteredColumns(sub);
        if (subKeys) {
          aggregated.push(...subKeys);
        }
      });
      const unique = Array.from(new Set(aggregated));
      return unique.length > 0 ? unique : null;
    }
    
    if (parsed.type === 'columnFilter') {
      const keys: string[] = [];
      
      if (parsed.filterColumn !== undefined) {
        const column = getColumnBySpec(parsed.filterColumn);
        if (column) {
          keys.push(column.key);
        }
      }
      
      if (parsed.filterColumnStart !== undefined && parsed.filterColumnEnd !== undefined) {
        const start = Math.max(0, Math.min(parsed.filterColumnStart, parsed.filterColumnEnd));
        const end = Math.min(data.columns.length - 1, Math.max(parsed.filterColumnStart, parsed.filterColumnEnd));
        for (let i = start; i <= end; i++) {
          if (data.columns[i]) {
            keys.push(data.columns[i].key);
          }
        }
      }
      
      if (parsed.filterColumns) {
        parsed.filterColumns.forEach(colSpec => {
          const column = getColumnBySpec(colSpec);
          if (column) {
            keys.push(column.key);
          }
        });
      }
      
      return keys.length > 0 ? Array.from(new Set(keys)) : null;
    }
    
    const columnSelection = getColumnSelectionFromQuery(parsed);
    if (!columnSelection) {
      return null;
    }
    const keys = resolveColumnSelectionToKeys(data.columns, columnSelection);
    return keys.length > 0 ? keys : null;
  }
  
  function getColumnSelectionFromQuery(parsed: ParsedQuery): ColumnSelection | null {
    switch (parsed.type) {
      case 'cell':
        if (parsed.cellColumn === undefined) return null;
        return { kind: 'single', value: parsed.cellColumn };
      case 'cellRange':
        if (parsed.cellStartColumn === undefined || parsed.cellEndColumn === undefined) return null;
        return {
          kind: 'range',
          start: parsed.cellStartColumn,
          end: parsed.cellEndColumn,
        };
      case 'cellList':
        if (!parsed.cellColumns || parsed.cellColumns.length === 0) return null;
        return {
          kind: 'list',
          values: parsed.cellColumns,
        };
      case 'rowColumn':
        return parsed.columnSelection ?? null;
      default:
        return null;
    }
  }
  
  function getColumnBySpec(spec: string | number) {
    if (typeof spec === 'number') {
      return data.columns[spec];
    }
    return data.columns.find(col => col.key === spec || col.label === spec);
  }
</script>

<div class="search-bar">
  <input
    bind:this={searchInput}
    type="text"
    class="search-input"
    placeholder={isStreamingMode ? "검색... (Enter/&/포커스 해제: 검색, Ctrl+G/F: 포커스, Esc: 닫기)" : "검색... (Ctrl+G/F: 포커스, Esc: 닫기)"}
    bind:value={query}
    on:keydown={handleKeydown}
    on:blur={handleBlur}
  />
  <button
    class="regex-toggle"
    class:active={useRegex}
    on:click={() => {
      useRegex = !useRegex;
      performSearch();
    }}
    title="정규식 사용"
  >
    <span class="material-icons">code</span>
    <span class="toggle-label">정규식</span>
  </button>
  {#if query && results.length > 0}
    <span class="result-count">{results.length}개 결과</span>
  {/if}
</div>

<style>
  .search-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    /* padding: 0.75rem 1rem; */
    background: var(--bg-primary);
    /* border-bottom: 1px solid var(--border); */
    flex-grow: 1;
  }
  
  .search-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    /* border: 1px solid var(--border); */
    border-radius: 6px;
    font-size: 0.875rem;
    /* background: var(--bg-secondary); */
    background: var(--bg-secondary);
    border: 1px solid transparent;
    transition: all 0.2s;
  }
  
  .search-input:hover {
    border: 1px solid var(--border);
  }

  .search-input:focus {
    border: 1px solid var(--border);
    /* outline: 2px solid var(--accent); */
    outline: hidden;
    outline-offset: -2px;
  }

  .regex-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.875rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .regex-toggle:hover {
    background: var(--bg-tertiary);
    border-color: var(--border);
  }

  .regex-toggle.active {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  .regex-toggle .material-icons {
    font-size: 16px;
  }

  .toggle-label {
    font-weight: 500;
  }

  .result-count {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

</style>


