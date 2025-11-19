<script lang="ts">
  import type { TableData, Row } from '../agents/store';

  export let show: boolean = false;
  export let data: TableData;
  export let targetRows: Row[] = [];
  export let targetIsFiltered: boolean = false;
  export let targetFilteredResultEmpty: boolean = false;
  export let preselectedColumns: string[] = [];
  export let onApply: (columnKeys: string[], strategy: 'first' | 'last' | 'all' | 'none') => void;
  export let onClose: () => void;

  type Strategy = 'first' | 'last' | 'all' | 'none';

  let selectedColumnKeys: Set<string> = new Set();
  let strategy: Strategy = 'first';
  let previewStats: {
    duplicateGroups: number;
    rowsToRemove: number;
    totalRows: number;
  } | null = null;

  // 스칼라 열만 필터링 (배열 열은 제외)
  $: scalarColumns = data?.columns?.filter(col => col.type !== 'array') ?? [];

  // 다이얼로그가 열릴 때 초기화
  $: if (show) {
    // 미리 선택된 열이 있으면 사용, 없으면 첫 번째 스칼라 열 선택
    if (preselectedColumns.length > 0) {
      // 스칼라 열만 필터링하여 선택
      const validColumns = preselectedColumns.filter(key => 
        scalarColumns.some(col => col.key === key)
      );
      if (validColumns.length > 0) {
        selectedColumnKeys = new Set(validColumns);
      } else if (scalarColumns.length > 0) {
        selectedColumnKeys = new Set([scalarColumns[0].key]);
      }
    } else if (selectedColumnKeys.size === 0 && scalarColumns.length > 0) {
      selectedColumnKeys = new Set([scalarColumns[0].key]);
    }
    updatePreview();
  }

  function getEffectiveRows(): Row[] {
    if (targetFilteredResultEmpty) {
      return [];
    }
    if (!targetIsFiltered) {
      return data?.rows ?? [];
    }
    if (targetRows && Array.isArray(targetRows) && targetRows.length > 0) {
      return targetRows;
    }
    return data?.rows ?? [];
  }

  function getRowKey(row: Row, columnKeys: string[]): string {
    const keyParts: string[] = [];
    for (const colKey of columnKeys) {
      const cell = row.cells[colKey];
      const value = cell?.value;
      // null, undefined를 문자열로 변환하여 비교
      const normalizedValue = value === null ? '__NULL__' : 
                              value === undefined ? '__UNDEFINED__' : 
                              String(value);
      keyParts.push(normalizedValue);
    }
    return keyParts.join('|');
  }

  function findDuplicates(rows: Row[], columnKeys: string[]): {
    groups: Map<string, Row[]>;
    duplicateGroups: number;
    rowsToRemove: number;
  } {
    const groups = new Map<string, Row[]>();
    
    for (const row of rows) {
      const key = getRowKey(row, columnKeys);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    }

    let duplicateGroups = 0;
    let rowsToRemove = 0;

    for (const [, groupRows] of groups.entries()) {
      if (groupRows.length > 1) {
        duplicateGroups++;
        if (strategy === 'first') {
          rowsToRemove += groupRows.length - 1; // 첫 번째 제외
        } else if (strategy === 'last') {
          rowsToRemove += groupRows.length - 1; // 마지막 제외
        } else if (strategy === 'all') {
          rowsToRemove += groupRows.length; // 모두 삭제
        }
        // 'none'은 삭제하지 않음
      }
    }

    return { groups, duplicateGroups, rowsToRemove };
  }

  function updatePreview() {
    if (selectedColumnKeys.size === 0) {
      previewStats = null;
      return;
    }

    const effectiveRows = getEffectiveRows();
    const columnKeys = Array.from(selectedColumnKeys);
    const result = findDuplicates(effectiveRows, columnKeys);

    previewStats = {
      duplicateGroups: result.duplicateGroups,
      rowsToRemove: result.rowsToRemove,
      totalRows: effectiveRows.length,
    };
  }

  function toggleColumn(columnKey: string) {
    if (selectedColumnKeys.has(columnKey)) {
      selectedColumnKeys.delete(columnKey);
    } else {
      selectedColumnKeys.add(columnKey);
    }
    selectedColumnKeys = new Set(selectedColumnKeys); // Svelte reactivity
    updatePreview();
  }

  function handleStrategyChange(newStrategy: Strategy) {
    strategy = newStrategy;
    updatePreview();
  }

  function handleApply() {
    if (selectedColumnKeys.size === 0) {
      return;
    }
    onApply(Array.from(selectedColumnKeys), strategy);
    show = false;
  }

  function handleClose() {
    show = false;
    onClose();
  }

  // 전략 변경 시 미리보기 업데이트
  $: if (strategy) {
    updatePreview();
  }
</script>

{#if show}
  <div class="overlay" on:click={handleClose} role="dialog" aria-modal="true">
    <div class="dialog" on:click|stopPropagation>
      <div class="dialog-header">
        <h3>중복행 제거</h3>
        <button class="close-btn" on:click={handleClose} aria-label="닫기">
          <span class="material-icons">close</span>
        </button>
      </div>

      <div class="dialog-content">
        <div class="section">
          <label class="section-label">기준 열 선택</label>
          <p class="section-hint">중복을 확인할 열을 선택하세요. 여러 열을 선택하면 모든 열의 값이 동일한 행을 중복으로 간주합니다.</p>
          <div class="column-list">
            {#each scalarColumns as column}
              {@const isSelected = selectedColumnKeys.has(column.key)}
              <label class="column-item">
                <input
                  type="checkbox"
                  checked={isSelected}
                  on:change={() => toggleColumn(column.key)}
                />
                <span class="column-label">{column.label || column.key}</span>
              </label>
            {/each}
          </div>
          {#if scalarColumns.length === 0}
            <p class="empty-message">선택 가능한 열이 없습니다.</p>
          {/if}
        </div>

        <div class="section">
          <label class="section-label">처리 방식</label>
          <div class="strategy-options">
            <label class="strategy-option">
              <input
                type="radio"
                name="strategy"
                value="first"
                checked={strategy === 'first'}
                on:change={() => handleStrategyChange('first')}
              />
              <div class="strategy-content">
                <span class="strategy-title">첫 번째 행 유지</span>
                <span class="strategy-desc">각 중복 그룹에서 첫 번째 행만 남기고 나머지 삭제</span>
              </div>
            </label>
            <label class="strategy-option">
              <input
                type="radio"
                name="strategy"
                value="last"
                checked={strategy === 'last'}
                on:change={() => handleStrategyChange('last')}
              />
              <div class="strategy-content">
                <span class="strategy-title">마지막 행 유지</span>
                <span class="strategy-desc">각 중복 그룹에서 마지막 행만 남기고 나머지 삭제</span>
              </div>
            </label>
            <label class="strategy-option">
              <input
                type="radio"
                name="strategy"
                value="all"
                checked={strategy === 'all'}
                on:change={() => handleStrategyChange('all')}
              />
              <div class="strategy-content">
                <span class="strategy-title">중복 행 모두 삭제</span>
                <span class="strategy-desc">중복된 행을 모두 삭제 (고유한 행만 유지)</span>
              </div>
            </label>
            <label class="strategy-option">
              <input
                type="radio"
                name="strategy"
                value="none"
                checked={strategy === 'none'}
                on:change={() => handleStrategyChange('none')}
              />
              <div class="strategy-content">
                <span class="strategy-title">아무것도 하지 않음</span>
                <span class="strategy-desc">중복을 확인만 하고 삭제하지 않음</span>
              </div>
            </label>
          </div>
        </div>

        {#if previewStats && selectedColumnKeys.size > 0}
          <div class="preview-section">
            <div class="preview-stats">
              <div class="stat-item">
                <span class="stat-label">총 행 수</span>
                <span class="stat-value">{previewStats.totalRows}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">중복 그룹</span>
                <span class="stat-value highlight">{previewStats.duplicateGroups}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">삭제될 행</span>
                <span class="stat-value highlight">{previewStats.rowsToRemove}</span>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="dialog-footer">
        <button class="btn btn-secondary" on:click={handleClose}>
          취소
        </button>
        <button
          class="btn btn-primary"
          on:click={handleApply}
          disabled={selectedColumnKeys.size === 0 || (previewStats?.rowsToRemove ?? 0) === 0}
        >
          적용
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
  }

  .dialog {
    background: var(--bg-primary);
    border-radius: 12px;
    padding: 0;
    width: min(600px, 90vw);
    max-height: 90vh;
    box-shadow: 0 18px 45px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .close-btn .material-icons {
    font-size: 20px;
  }

  .dialog-content {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .section {
    margin-bottom: 2rem;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  .section-hint {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0 0 1rem 0;
    line-height: 1.5;
  }

  .column-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem;
    background: var(--bg-secondary);
  }

  .column-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .column-item:hover {
    background: var(--bg-tertiary);
  }

  .column-item input[type="checkbox"] {
    cursor: pointer;
  }

  .column-label {
    font-size: 0.875rem;
    color: var(--text-primary);
    user-select: none;
  }

  .empty-message {
    font-size: 0.875rem;
    color: var(--text-secondary);
    text-align: center;
    padding: 1rem;
  }

  .strategy-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .strategy-option {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .strategy-option:hover {
    background: var(--bg-secondary);
    border-color: var(--accent);
  }

  .strategy-option input[type="radio"] {
    margin-top: 0.125rem;
    cursor: pointer;
  }

  .strategy-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .strategy-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .strategy-desc {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .preview-section {
    margin-top: 1.5rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .preview-stats {
    display: flex;
    gap: 1.5rem;
    justify-content: space-around;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stat-value.highlight {
    color: var(--accent);
  }

  .dialog-footer {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    padding: 1.5rem;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .btn-secondary:hover {
    background: var(--bg-primary);
  }
</style>
