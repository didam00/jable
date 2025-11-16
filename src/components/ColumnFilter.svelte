<script lang="ts">
  import { getColumnValues } from '../agents/filters';
  import type { TableData, Column } from '../agents/store';

  export let data: TableData;
  export let column: Column;
  export let columnWidth: number = 200;
  export let onFilter: (columnKey: string, value: string) => void;
  export let onTransform: ((columnKey: string) => void) | undefined = undefined;
  export let isOpen: boolean = false;
  export let onToggle: ((columnKey: string) => void) | undefined = undefined;

  let filterValue = '';
  let uniqueValues: any[] = [];
  let displayedValues: any[] = [];
  let showMore = false;
  let filterBtn: HTMLButtonElement;
  const INITIAL_DISPLAY_COUNT = 5;

  // 필터가 열릴 때마다 전체 데이터에서 고유 값 가져오기
  // data와 data.rows를 명시적으로 dependency로 사용하여 데이터 변경 시 업데이트
  $: data, data.rows, isOpen, column?.key, (() => {
    if (isOpen && data && data.rows && data.rows.length > 0 && column && column.key) {
      // 항상 원본 데이터의 모든 행에서 고유 값 추출
      uniqueValues = getColumnValues(data, column.key);
      showMore = false; // 필터가 다시 열릴 때 초기화
      updateDisplayedValues();
    } else {
      // 필터가 닫히거나 데이터가 없으면 값 목록 초기화
      uniqueValues = [];
      displayedValues = [];
      showMore = false;
    }
  })();

  function updateDisplayedValues() {
    if (showMore) {
      displayedValues = uniqueValues;
    } else {
      displayedValues = uniqueValues.slice(0, INITIAL_DISPLAY_COUNT);
    }
  }

  $: if (showMore !== undefined) {
    updateDisplayedValues();
  }

  function toggleFilter() {
    if (onToggle) {
      onToggle(column.key);
    }
  }

  function closeFilter() {
    if (onToggle) {
      onToggle(column.key);
    }
  }


  function handleFilter() {
    onFilter(column.key, filterValue);
  }

  function selectValue(value: any) {
    filterValue = String(value);
    handleFilter();
  }
</script>

<div class="column-filter">
  <div class="filter-actions">
    <button class="filter-btn" bind:this={filterBtn} on:click={toggleFilter} title="필터">
      <span class="material-icons">filter_list</span>
    </button>
    {#if onTransform}
      <button class="transform-btn" on:click={() => onTransform?.(column.key)} title="열 변환">
        <span class="material-icons">functions</span>
      </button>
    {/if}
  </div>
  {#if isOpen}
    <div class="filter-dropdown" style="left: -{columnWidth - 60}px; width: {(columnWidth + 1)}px;">
      <div class="filter-header">
        <span class="filter-title">필터</span>
        <button class="close-btn" on:click={closeFilter} title="닫기">
          <span class="material-icons">close</span>
        </button>
      </div>
      <input
        type="text"
        class="filter-input"
        placeholder="필터 값..."
        bind:value={filterValue}
        on:input={handleFilter}
      />
      {#if uniqueValues.length > 0}
        <div class="value-list">
          {#each displayedValues as value}
            <button class="value-item" on:click={() => selectValue(value)}>
              {#if value === null}
                <span class="special-value">null</span>
              {:else if value === undefined}
                <span class="special-value">undefined</span>
              {:else if value === ''}
                <span class="special-value">(빈 문자열)</span>
              {:else}
                {String(value)}
              {/if}
            </button>
          {/each}
          {#if uniqueValues.length > INITIAL_DISPLAY_COUNT && !showMore}
            <button class="load-more-btn" on:click={() => { showMore = true; }}>
              더 불러오기... ({uniqueValues.length - INITIAL_DISPLAY_COUNT}개 더)
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .column-filter {
    position: relative;
  }

  .filter-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .filter-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .filter-btn .material-icons {
    font-size: 18px;
    color: var(--text-secondary);
  }

  .filter-btn:hover .material-icons {
    color: var(--accent);
  }

  .filter-btn:hover {
    background: var(--bg-tertiary);
  }

  .transform-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .transform-btn .material-icons {
    font-size: 18px;
    color: var(--text-secondary);
  }

  .transform-btn:hover .material-icons {
    color: var(--accent);
  }

  .transform-btn:hover {
    background: var(--bg-tertiary);
  }

  .filter-dropdown {
    position: absolute;
    top: calc(100% + 16px);
    left: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 0 0 6px 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    min-width: 200px;
    max-height: 300px;
    overflow-y: auto;
  }

  .filter-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    /* border-bottom: 1px solid var(--border); */
  }

  .filter-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    transition: background 0.2s;
  }

  .close-btn .material-icons {
    font-size: 18px;
    color: var(--text-secondary);
  }

  .close-btn:hover {
    background: var(--bg-tertiary);
  }

  .close-btn:hover .material-icons {
    color: var(--text-primary);
  }

  .filter-input {
    width: 100%;
    padding: 0.5rem;
    border: none;
    border-bottom: 1px solid var(--border);
    font-size: 0.875rem;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .filter-input::placeholder {
    color: var(--text-secondary);
  }

  .filter-input:focus {
    outline: none;
    /* border-bottom-color: var(--accent); */
  }

  .value-list {
    display: flex;
    flex-direction: column;
    max-height: 200px;
    overflow-y: auto;
  }

  .value-item {
    width: 100%;
    padding: 0.5rem;
    text-align: left;
    font-size: 0.875rem;
    border: none;
    /* border-bottom: 1px solid var(--border); */
    background: transparent;
    cursor: pointer;
    transition: background 0.2s;
    color: var(--text-secondary);
  }

  .value-item:hover {
    background: var(--bg-secondary);
  }

  .value-item:last-child {
    border-bottom: none;
  }

  .special-value {
    color: var(--accent);
    font-style: italic;
  }

  .load-more-btn {
    width: 100%;
    padding: 0.5rem;
    text-align: center;
    font-size: 0.875rem;
    border: none;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
    cursor: pointer;
    transition: background 0.2s;
    color: var(--accent);
    font-weight: 500;
  }

  .load-more-btn:hover {
    background: var(--bg-tertiary);
  }
</style>

