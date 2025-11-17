<script lang="ts">
  import type { TableData } from '../agents/store';

  export let data: TableData;
  export let tableState: {
    sortColumn: string | null;
    sortDirection: 'asc' | 'desc';
    filters: Record<string, string>;
  };
  export let tableViewRef: any;

  function getColumnLabel(columnKey: string): string {
    const column = data.columns.find((c) => c.key === columnKey);
    return column?.label || columnKey;
  }

  function clearSort() {
    if (tableViewRef?.clearSort) {
      tableViewRef.clearSort();
    }
  }

  function clearFilter(columnKey: string) {
    if (tableViewRef?.clearFilter) {
      tableViewRef.clearFilter(columnKey);
    }
  }

  function refresh() {
    if (tableViewRef?.refresh) {
      tableViewRef.refresh();
    }
  }

  $: hasActiveSort = tableState?.sortColumn !== null;
  $: hasActiveFilters = Object.keys(tableState?.filters || {}).length > 0;
</script>

<div class="stats-panel">
  <div class="stat-item">
    <span class="stat-label">행:</span>
    <span class="stat-value">{data.metadata.rowCount.toLocaleString()}</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">열:</span>
    <span class="stat-value">{data.metadata.columnCount}</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">타입:</span>
    <span class="stat-value">{data.metadata.isFlat ? 'Flat' : 'Nested'}</span>
  </div>
  
  <button class="refresh-button" on:click={refresh} title="테이블 새로고침">
    <span class="material-icons">refresh</span>
  </button>
  
  {#if hasActiveSort && tableState.sortColumn}
    <div class="filter-badge">
      <span class="badge-label">
        정렬: {getColumnLabel(tableState.sortColumn)} ({tableState.sortDirection === 'asc' ? '오름차순' : '내림차순'})
      </span>
      <button class="badge-close" on:click={clearSort} title="정렬 제거">
        <span class="material-icons">close</span>
      </button>
    </div>
  {/if}
  
  {#if hasActiveFilters}
    {#each Object.entries(tableState.filters) as [columnKey, filterValue]}
      <div class="filter-badge">
        <span class="badge-label">
          필터: {getColumnLabel(columnKey)} = "{filterValue}"
        </span>
        <button class="badge-close" on:click={() => clearFilter(columnKey)} title="필터 제거">
          <span class="material-icons">close</span>
        </button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .stats-panel {
    display: flex;
    gap: 1.5rem;
    font-size: 0.875rem;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .stat-label {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .stat-value {
    color: var(--text-primary);
    font-weight: 600;
  }

  .filter-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0;
    background: var(--bg-secondary);
    border-radius: 4px;
    font-size: 0.75rem;
    margin-right: -8px;
    max-width: 200px;
  }
  
  .badge-label {
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
    font-size: 1rem;
  }

  .badge-close .material-icons {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .badge-close:hover {
    background: var(--bg-secondary);
  }

  .badge-close:hover .material-icons {
    color: var(--text-primary);
  }

  .refresh-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    margin: 0 -1rem;
  }

  .refresh-button .material-icons {
    font-size: 16px;
    color: var(--text-secondary);
  }

  .refresh-button:hover {
    rotate: 20deg;
  }

  .refresh-button:hover .material-icons {
    color: var(--text-primary);
  }

  .refresh-button:active {
    transform: rotate(180deg);
    transition: transform 0.3s;
  }
</style>

