<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { dataStore } from '../agents/store';
  import type { TableData } from '../agents/store';
  import { importFromClipboard } from '../agents/import-export';
  import { isTauri } from '../utils/isTauri';
  import SearchBar from './SearchBar.svelte';

  const dispatch = createEventDispatcher<{
    newTab: File | { path: string; name: string };
    createEmpty: void;
    save: void;
    saveAs: void;
    searchChange: { matchedRowIds: Set<string>; filteredColumnKeys: string[] | null };
    openSettings: void;
    export: { format: 'json' | 'csv' | 'xml' | 'toon' };
    pasteImport: { data: TableData };
  }>();

  let fileInput: HTMLInputElement;
  let canUndo = false;
  let canRedo = false;
  let isMenuOpen = false;

  dataStore.subscribe(() => {
    canUndo = dataStore.canUndo();
    canRedo = dataStore.canRedo();
  });

  async function handleFileOpen() {
    isMenuOpen = false;
    if (isTauri()) {
      try {
        const dialogModule = await import('@tauri-apps/plugin-dialog');
        const { open } = dialogModule as any;
        const selected = await open({
          multiple: true,
          filters: [{
            name: 'Data Files',
            extensions: ['json', 'csv', 'xml', 'toon'],
          }],
        });

        console.log('[handleFileOpen] Tauri dialog 반환값:', selected);

        if (selected) {
          // Tauri v2에서는 배열 또는 단일 값으로 반환될 수 있음
          const files = Array.isArray(selected) ? selected : [selected];
          console.log('[handleFileOpen] 처리할 파일들:', files);
          
          for (const file of files) {
            // Tauri v2에서는 문자열 경로 또는 객체일 수 있음
            let filePath: string;
            let fileName: string;
            
            if (typeof file === 'string') {
              filePath = file;
              fileName = file.split(/[/\\]/).pop() || 'unknown';
            } else if (file && typeof file === 'object' && 'path' in file) {
              filePath = (file as any).path;
              fileName = (file as any).name || filePath.split(/[/\\]/).pop() || 'unknown';
            } else {
              console.error('[handleFileOpen] 알 수 없는 파일 형식:', file);
              continue;
            }
            
            console.log('[handleFileOpen] 파일 처리:', { filePath, fileName });
            dispatch('newTab', { path: filePath, name: fileName });
          }
        }
      } catch (error) {
        console.error('[handleFileOpen] 파일 열기 실패:', error);
        alert(`파일 열기 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      fileInput?.click();
    }
  }

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
    isMenuOpen = false;
    try {
      const data = await importFromClipboard();
      dispatch('pasteImport', { data });
    } catch (error) {
      alert(`붙여넣기 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  function handleExport(format: 'json' | 'csv' | 'xml' | 'toon') {
    isMenuOpen = false;
    dispatch('export', { format });
  }

  function handleUndo() {
    dataStore.undo();
  }

  function handleRedo() {
    dataStore.redo();
  }

  function handleCreateEmpty() {
    dispatch('createEmpty');
  }

  function toggleMenu() {
    isMenuOpen = !isMenuOpen;
  }

  function openSettings() {
    isMenuOpen = false;
    dispatch('openSettings');
  }
</script>

<header class="toolbar">
  <div class="toolbar-left">
    <button class="btn-icon mobile-toggle" on:click={toggleMenu} title="메뉴 열기/닫기">
      <span class="material-icons">menu</span>
    </button>
    <button class="btn-icon" on:click={handleFileOpen} title="파일 열기">
      <span class="material-icons">folder_open</span>
    </button>
    {#if !isTauri()}
      <input
        bind:this={fileInput}
        type="file"
        accept=".json,.csv,.xml,.toon"
        on:change={handleFileUpload}
        style="display: none;"
      />
    {/if}
    <button class="btn-icon" on:click={handlePaste} title="붙여넣기">
      <span class="material-icons">content_paste</span>
    </button>
    <button class="btn-icon" on:click={handleCreateEmpty} title="빈 JSON 탭 만들기">
      <span class="material-icons">note_add</span>
    </button>
    <div class="divider"></div>
    <button class="btn-icon" on:click={() => dispatch('save')} title="저장 (Ctrl+S)">
      <span class="material-icons">save</span>
    </button>
    <button class="btn-icon" on:click={() => dispatch('saveAs')} title="다른 이름으로 저장">
      <span class="material-icons">save_as</span>
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
  <div class="toolbar-right" class:open={isMenuOpen}>
    <span style="white-space: nowrap;" >export as</span>
    <button class="btn" on:click={() => handleExport('toon')}>TOON</button><span class="split">|</span>
    <button class="btn" on:click={() => handleExport('json')}>JSON</button><span class="split">|</span>
    <button class="btn" on:click={() => handleExport('csv')}>CSV</button><span class="split">|</span>
    <button class="btn" on:click={() => handleExport('xml')}>XML</button>
    <button class="btn-icon" on:click={openSettings} title="설정">
      <span class="material-icons">settings</span>
    </button>
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

    .mobile-toggle {
      display: none;
    }

    @media (max-width: 768px) {
      .toolbar {
        flex-wrap: wrap;
        align-items: flex-start;
      }

      .toolbar-left {
        width: 100%;
        flex-wrap: wrap;
        gap: 0.35rem;
      }

      .toolbar-right {
        width: 100%;
        justify-content: flex-start;
        display: none;
        flex-wrap: wrap;
        padding-top: 0.25rem;
      }

      .toolbar-right.open {
        display: flex;
      }

      .mobile-toggle {
        display: inline-flex;
      }

      .toolbar-right .btn,
      .toolbar-right .btn-icon {
        margin-top: 0.25rem;
      }

      .divider {
        display: none;
      }
    }
  </style>
