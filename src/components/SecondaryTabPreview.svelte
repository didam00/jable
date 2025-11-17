<script lang="ts">
import { createEventDispatcher } from 'svelte';
import type { TableData, Row, Column } from '../agents/store';

export let tabName = '';
export let data: TableData;

const dispatch = createEventDispatcher<{ close: void }>();

let previewMode: 'table' | 'json' = 'table';
const MAX_ROWS = 200;

$: visibleRows = data?.rows?.slice(0, MAX_ROWS) ?? [];
$: columns = data?.columns ?? [];
$: jsonPreview = JSON.stringify(data, null, 2);

function closePreview() {
  dispatch('close');
}

function formatCell(row: Row, column: Column): string {
  const cell = row.cells[column.key];
  if (!cell) {
    return '';
  }
  if (typeof cell.value === 'object' && cell.value !== null) {
    try {
      return JSON.stringify(cell.value);
    } catch {
      return '[object]';
    }
  }
  return String(cell.value ?? '');
}
</script>

<section class="preview">
  <header class="preview-header">
    <div class="title-group">
      <h4>{tabName}</h4>
      <span class="meta">
        {data.metadata.rowCount.toLocaleString()} rows · {data.metadata.columnCount.toLocaleString()} columns
      </span>
    </div>
    <div class="actions">
      <div class="mode-toggle" role="tablist">
        <button
          class:active={previewMode === 'table'}
          on:click={() => (previewMode = 'table')}
          role="tab"
        >
          테이블
        </button>
        <button
          class:active={previewMode === 'json'}
          on:click={() => (previewMode = 'json')}
          role="tab"
        >
          JSON
        </button>
      </div>
      <button class="close-btn" on:click={closePreview} title="함께 보기 종료">
        <span class="material-icons">close</span>
      </button>
    </div>
  </header>

  {#if previewMode === 'table'}
    <div class="table-container" role="region" aria-label="보조 탭 미리보기">
      {#if columns.length === 0}
        <div class="empty">표시할 컬럼이 없습니다.</div>
      {:else}
        <table>
          <thead>
            <tr>
              {#each columns as column}
                <th title={column.label || column.key}>{column.label || column.key}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#if visibleRows.length === 0}
              <tr>
                <td class="empty" colspan={columns.length}>표시할 행이 없습니다.</td>
              </tr>
            {:else}
              {#each visibleRows as row}
                <tr>
                  {#each columns as column}
                    <td>{formatCell(row, column)}</td>
                  {/each}
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
        {#if data.rows.length > MAX_ROWS}
          <div class="hint">상위 {MAX_ROWS.toLocaleString()}개 행만 표시됩니다.</div>
        {/if}
      {/if}
    </div>
{:else}
  <pre class="json-preview">{jsonPreview}</pre>
{/if}
</section>

<style>
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid var(--border);
  background: var(--bg-primary);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.title-group h4 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.title-group .meta {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.mode-toggle {
  background: var(--bg-secondary);
  border-radius: 999px;
  padding: 0.15rem;
  display: inline-flex;
  gap: 0.25rem;
}

.mode-toggle button {
  border: none;
  background: transparent;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.mode-toggle button.active {
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.close-btn {
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.close-btn:hover {
  background: var(--bg-secondary);
}

.close-btn .material-icons {
  font-size: 18px;
  color: var(--text-secondary);
}

.table-container {
  flex: 1;
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

th,
td {
  padding: 0.35rem 0.45rem;
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  text-align: left;
  max-width: 220px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

th {
  position: sticky;
  top: 0;
  background: var(--bg-secondary);
  z-index: 1;
  font-weight: 600;
}

tr:nth-child(even) td {
  background: var(--bg-tertiary);
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 1rem;
}

.hint {
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.json-preview {
  flex: 1;
  margin: 0;
  padding: 0.75rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
  overflow: auto;
  border-top: 1px solid var(--border);
}
</style>

