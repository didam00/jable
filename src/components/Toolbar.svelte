<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { dataStore } from '../agents/store';
  import { importFromClipboard, exportFile } from '../agents/import-export';
  import SearchBar from './SearchBar.svelte';

  const dispatch = createEventDispatcher<{
    newTab: File;
    searchChange: { matchedRowIds: Set<string>; filteredColumnKeys: string[] | null };
  }>();

  let fileInput: HTMLInputElement;
  let canUndo = false;
  let canRedo = false;

  dataStore.subscribe(() => {
    canUndo = dataStore.canUndo();
    canRedo = dataStore.canRedo();
  });

  async function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    // input 초기화
    target.value = '';

    // 새 탭으로 파일 열기
    dispatch('newTab', file);
  }

  async function handlePaste() {
    try {
      const data = await importFromClipboard();
      // 붙여넣기는 현재 활성 탭에 추가하거나 새 탭 생성하지 않음 (기존 동작 유지)
      dataStore.set(data);
    } catch (error) {
      alert(`붙여넣기 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  function handleExport(format: 'json' | 'csv' | 'xml') {
    dataStore.subscribe((data) => {
      exportFile(data, format);
    })();
  }

  function handleUndo() {
    dataStore.undo();
  }

  function handleRedo() {
    dataStore.redo();
  }
</script>

<header class="toolbar">
  <div class="toolbar-left">
    <button class="btn-icon" on:click={() => fileInput?.click()} title="파일 열기">
      <span class="material-icons">folder_open</span>
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".json,.csv,.xml"
      on:change={handleFileUpload}
      style="display: none;"
    />
    <button class="btn-icon" on:click={handlePaste} title="붙여넣기">
      <span class="material-icons">content_paste</span>
    </button>
    <div class="divider"></div>
    <button class="btn-icon" on:click={handleUndo} disabled={!canUndo} title="실행 취소 (Ctrl+Z)">
      <span class="material-icons">undo</span>
    </button>
    <button class="btn-icon" on:click={handleRedo} disabled={!canRedo} title="다시 실행 (Ctrl+Y)">
      <span class="material-icons">redo</span>
    </button>
  </div>
  <SearchBar on:searchChange={(e) => dispatch('searchChange', e.detail)} />
  <div class="toolbar-right">
    export as
    <button class="btn" on:click={() => handleExport('json')}>JSON</button><span class="split">|</span>
    <button class="btn" on:click={() => handleExport('csv')}>CSV</button><span class="split">|</span>
    <button class="btn" on:click={() => handleExport('xml')}>XML</button>
  </div>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    /* justify-content: space-between; */
    padding: 0.75rem 1rem;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border);
    gap: 1rem;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toolbar-right {
    margin-right: 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);

    & .split {
      color: var(--text-secondary);
      opacity: 0.5;
    }
  }

  .divider {
    width: 1px;
    height: 24px;
    background: var(--border);
    margin: 0 0.25rem;
  }

  .btn-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .btn-icon .material-icons {
    font-size: 20px;
    color: var(--text-primary);
  }

  .btn-icon:hover:not(:disabled) .material-icons {
    color: var(--accent);
  }

  .btn-icon:disabled .material-icons {
    opacity: 0.4;
  }

  .btn-icon:hover:not(:disabled) {
    background: var(--bg-secondary);
  }

  .btn-icon:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn {
    font-weight: 500;
    color: var(--accent);
  }
</style>