<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { searchData } from '../agents/search';
  import { parseQuery } from '../agents/search/queryParser';
  import { dataStore } from '../agents/store';
  import type { TableData } from '../agents/store';
  import type { SearchResult } from '../agents/search/types';

  const dispatch = createEventDispatcher();

  let query = '';
  let useRegex = false;
  let results: SearchResult[] = [];
  let data: TableData = {
    columns: [],
    rows: [],
    metadata: { rowCount: 0, columnCount: 0, isFlat: true },
  };
  let searchInput: HTMLInputElement;

  dataStore.subscribe((value) => {
    data = value;
    if (query) {
      performSearch();
    }
  });

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
    if (!query.trim()) {
      results = [];
      dispatch('searchChange', { 
        matchedRowIds: new Set<string>(),
        filteredColumnKey: null,
      });
      return;
    }
    
    const parsed = parseQuery(query);
    results = searchData(data, query, useRegex);
    
    // 검색된 행 ID들을 Set으로 만들어서 전달
    const matchedRowIds = new Set<string>(results.map(r => r.rowId));
    
    // 열 필터링 정보 추출
    let filteredColumnKeys: string[] | null = null;
    if (parsed.type === 'columnFilter') {
      const keys: string[] = [];
      
      // 단일 열
      if (parsed.filterColumn !== undefined) {
        if (typeof parsed.filterColumn === 'number') {
          const column = data.columns[parsed.filterColumn];
          if (column) {
            keys.push(column.key);
          }
        } else {
          const column = data.columns.find(col => col.key === parsed.filterColumn || col.label === parsed.filterColumn);
          if (column) {
            keys.push(column.key);
          }
        }
      }
      
      // 열 범위 (::2-4)
      if (parsed.filterColumnStart !== undefined && parsed.filterColumnEnd !== undefined) {
        const start = Math.max(0, Math.min(parsed.filterColumnStart, parsed.filterColumnEnd));
        const end = Math.min(data.columns.length - 1, Math.max(parsed.filterColumnStart, parsed.filterColumnEnd));
        for (let i = start; i <= end; i++) {
          if (data.columns[i]) {
            keys.push(data.columns[i].key);
          }
        }
      }
      
      // 열 리스트 (::1,2,3)
      if (parsed.filterColumns) {
        parsed.filterColumns.forEach(colSpec => {
          if (typeof colSpec === 'number') {
            const column = data.columns[colSpec];
            if (column) {
              keys.push(column.key);
            }
          } else {
            const column = data.columns.find(col => col.key === colSpec || col.label === colSpec);
            if (column) {
              keys.push(column.key);
            }
          }
        });
      }
      
      if (keys.length > 0) {
        filteredColumnKeys = keys;
      }
    }
    
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
    } else if (event.key === 'Enter' && event.ctrlKey) {
      performSearch();
    }
  }
</script>

<div class="search-bar">
  <input
    bind:this={searchInput}
    type="text"
    class="search-input"
    placeholder="검색... (Ctrl+G/F: 포커스, Ctrl+Enter: 검색, Esc: 닫기)"
    bind:value={query}
    on:input={performSearch}
    on:keydown={handleKeydown}
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

