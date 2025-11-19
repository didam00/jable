<script lang="ts">
  import { filterCache } from '../agents/filters/filterCache';
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
  let filteredValues: any[] = [];
  let displayedValues: any[] = [];
  let isListLoaded = false; // 목록이 로드되었는지 여부
  let filterInputElement: HTMLInputElement | null = null;

  // 이전 데이터 상태 추적 (캐시 무효화 감지용)
  let previousRowCount = 0;
  let previousDataHash = '';

  // 데이터 해시 생성 (간단한 버전)
  function generateSimpleHash(data: TableData, columnKey: string): string {
    const rowCount = data.rows.length;
    // 성능 최적화: 대용량 데이터는 행 개수만 사용
    if (rowCount > 10000) {
      return `${rowCount}:${columnKey}`;
    }
    // 작은 데이터는 행 개수와 각 행의 해당 열 값 시그니처 사용
    const signatures = data.rows.map((row) => {
      const cell = row.cells[columnKey];
      return String(cell?.value ?? '');
    });
    return `${rowCount}:${signatures.join('|')}`;
  }

  // 필터가 열릴 때 초기화만 수행 (목록은 로드하지 않음)
  $: data, data.rows, isOpen, column?.key, (() => {
    if (isOpen && data && data.rows && data.rows.length > 0 && column && column.key) {
      const currentHash = generateSimpleHash(data, column.key);
      const currentRowCount = data.rows.length;

      // 데이터가 변경되었는지 확인 (행 삭제 또는 열 값 변경)
      const dataChanged = 
        previousRowCount !== currentRowCount || 
        previousDataHash !== currentHash;

      if (dataChanged) {
        // 데이터가 변경되었으면 해당 열의 캐시 무효화 및 목록 초기화
        filterCache.invalidateColumn(column.key);
        previousRowCount = currentRowCount;
        previousDataHash = currentHash;
        isListLoaded = false;
        uniqueValues = [];
        filteredValues = [];
        displayedValues = [];
      }

      // 필터가 열릴 때 input에 포커스
      setTimeout(() => {
        if (filterInputElement) {
          filterInputElement.focus();
        }
      }, 0);
    } else {
      // 필터가 닫히거나 데이터가 없으면 값 목록 초기화
      uniqueValues = [];
      filteredValues = [];
      displayedValues = [];
      isListLoaded = false;
    }
  })();

  // 목록 불러오기 함수
  function loadValueList() {
    if (!data || !data.rows || data.rows.length === 0 || !column || !column.key) {
      return;
    }

    // 캐시를 사용하여 고유 값 가져오기
    uniqueValues = filterCache.getColumnValues(data, column.key);
    isListLoaded = true;
    filteredValues = uniqueValues;
    updateDisplayedValues();
  }

  function updateDisplayedValues() {
    displayedValues = filteredValues;
  }

  $: if (filteredValues) {
    updateDisplayedValues();
  }

  function toggleFilter() {
    if (onToggle) {
      onToggle(column.key);
    }
  }

  function closeFilter() {
    // 필터 닫을 때 현재 입력된 값으로 필터 적용 (빈 값이면 필터 제거)
    if (filterValue.trim()) {
      applyFilter();
    } else {
      // 빈 값이면 필터 제거
      onFilter(column.key, '');
    }
    if (onToggle) {
      onToggle(column.key);
    }
  }

  // 값 목록 필터링 (실시간, 필터 적용은 안 함)
  function handleFilterSearch() {
    // 목록이 로드된 경우에만 값 목록 필터링
    if (isListLoaded) {
      // 필터 입력에 따라 값 목록 필터링
      if (filterValue.trim() === '') {
        filteredValues = uniqueValues;
      } else {
        const searchTerm = filterValue.toLowerCase();
        filteredValues = uniqueValues.filter((value) => {
          const valueStr = formatDisplayValue(value).toLowerCase();
          return valueStr.includes(searchTerm);
        });
      }
      updateDisplayedValues();
    }
    // 목록이 로드되지 않아도 필터 검색 자체는 가능 (엔터나 닫을 때 적용됨)
  }

  // 실제 필터 적용 (엔터 키 또는 필터 닫을 때 호출)
  function applyFilter() {
    onFilter(column.key, filterValue);
  }

  // 필터 삭제
  function clearFilter() {
    filterValue = '';
    filteredValues = uniqueValues;
    updateDisplayedValues();
    applyFilter();
  }

  // 엔터 키 입력 처리
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyFilter();
    }
  }

  function selectValue(value: any) {
    filterValue = formatDisplayValue(value);
    const encoded = encodeFilterToken(value);
    onFilter(column.key, encoded);
  }

  function formatDisplayValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (value === '') return '';
    return String(value);
  }

  function encodeFilterToken(value: any): string {
    if (value === null) return '__SPECIAL_NULL__';
    if (value === undefined) return '__SPECIAL_UNDEFINED__';
    if (value === '') return '__SPECIAL_EMPTY__';
    return String(value);
  }

  function handleFilterClick() {
    filterInputElement?.focus();
  }

</script>

<div class="column-filter">
  <div class="filter-actions">
    <button class="filter-btn" on:click={toggleFilter} title="필터">
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
      <div class="filter-input-wrapper">
        <input
          type="text"
          class="filter-input"
          placeholder="필터 값..."
          bind:value={filterValue}
          bind:this={filterInputElement}
          on:input={handleFilterSearch}
          on:keydown={handleKeyDown}
          on:click={handleFilterClick}
        />
        {#if filterValue}
          <button class="clear-filter-btn" on:click={clearFilter} title="필터 삭제">
            <span class="material-icons">close</span>
          </button>
        {/if}
      </div>
      {#if !isListLoaded}
        <button class="load-list-btn" on:click={loadValueList}>
          목록 불러오기
        </button>
      {:else if uniqueValues.length > 0}
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

  .filter-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
  }

  .filter-input {
    width: 100%;
    padding: 0.5rem;
    padding-right: 2rem;
    border: none;
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

  .clear-filter-btn {
    position: absolute;
    right: 0.25rem;
    width: 20px;
    height: 20px;
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

  .clear-filter-btn .material-icons {
    font-size: 16px;
    color: var(--text-secondary);
  }

  .clear-filter-btn:hover {
    background: var(--bg-tertiary);
  }

  .clear-filter-btn:hover .material-icons {
    color: var(--text-primary);
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

  .load-list-btn {
    width: 100%;
    padding: 0.75rem;
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

  .load-list-btn:hover {
    background: var(--bg-tertiary);
  }

</style>

