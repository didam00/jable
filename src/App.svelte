<script lang="ts">
  import { onMount } from 'svelte';
  import { dataStore } from './agents/store';
  import { setupKeyboardShortcuts } from './agents/ui-ux';
  import { importFile } from './agents/import-export';
  import TableView from './components/TableView.svelte';
  import Toolbar from './components/Toolbar.svelte';
  // import SearchBar from './components/SearchBar.svelte';
  import RawView from './components/RawView.svelte';
  import StatsPanel from './components/StatsPanel.svelte';
  import Tabs from './components/Tabs.svelte';
  import type { TableData } from './agents/store';
  import type { Tab } from './types/tab';

  let tabs: Tab[] = [];
  let activeTabId: string | null = null;
  let data: TableData = {
    columns: [],
    rows: [],
    metadata: { rowCount: 0, columnCount: 0, isFlat: true },
  };

  let viewMode: 'table' | 'raw' = 'table';
  let isDragging = false;
  let tableViewRef: any = null;
  let isUpdatingFromTab = false;
  let tableState: {
    sortColumn: string | null;
    sortDirection: 'asc' | 'desc';
    filters: Record<string, string>;
  } = {
    sortColumn: null,
    sortDirection: 'asc',
    filters: {},
  };
  let searchMatchedRowIds: Set<string> = new Set();
  let searchFilteredColumnKeys: string[] | null = null;

  onMount(() => {
    dataStore.subscribe((value) => {
      if (!isUpdatingFromTab && activeTabId) {
        // dataStore 변경 시 현재 활성 탭 업데이트
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
          activeTab.data = JSON.parse(JSON.stringify(value));
          activeTab.isModified = true;
          tabs = tabs; // Svelte reactivity
        }
      }
      data = value;
    });

    // 키보드 단축키 설정
    const cleanup = setupKeyboardShortcuts({
      onToggleView: () => {
        viewMode = viewMode === 'table' ? 'raw' : 'table';
      },
    });

    return cleanup;
  });

  function createNewTab(file: File, fileData: TableData): string {
    const tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTab: Tab = {
      id: tabId,
      name: file.name,
      data: JSON.parse(JSON.stringify(fileData)),
      isModified: false,
      file: file,
    };
    
    tabs = [...tabs, newTab];
    activeTabId = tabId;
    return tabId;
  }

  function switchToTab(tabId: string) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    activeTabId = tabId;
    isUpdatingFromTab = true;
    dataStore.set(JSON.parse(JSON.stringify(tab.data)));
    setTimeout(() => {
      isUpdatingFromTab = false;
    }, 0);
  }

  function closeTab(tabId: string) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    
    tabs = tabs.filter(t => t.id !== tabId);
    
    // 닫은 탭이 활성 탭이었다면 다른 탭으로 전환
    if (activeTabId === tabId) {
      if (tabs.length > 0) {
        // 닫은 탭의 이전 탭 또는 첫 번째 탭으로 전환
        const newActiveIndex = Math.max(0, tabIndex - 1);
        switchToTab(tabs[newActiveIndex].id);
      } else {
        activeTabId = null;
        isUpdatingFromTab = true;
        const emptyData: TableData = {
          columns: [],
          rows: [],
          metadata: { rowCount: 0, columnCount: 0, isFlat: true },
        };
        dataStore.set(emptyData);
        setTimeout(() => {
          isUpdatingFromTab = false;
        }, 0);
      }
    }
  }

  async function handleFileDrop(file: File) {
    try {
      const newData = await importFile(file);
      // 항상 새 탭으로 열기
      createNewTab(file, newData);
      switchToTab(activeTabId!);
    } catch (error) {
      alert(`파일 읽기 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDragging = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      // 여러 파일을 동시에 드롭한 경우 모두 처리
      Array.from(files).forEach(async (file) => {
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.json') || fileName.endsWith('.csv') || fileName.endsWith('.xml')) {
          try {
            const newData = await importFile(file);
            createNewTab(file, newData);
            if (file === files[files.length - 1]) {
              // 마지막 파일을 활성 탭으로 설정
              switchToTab(activeTabId!);
            }
          } catch (error) {
            alert(`파일 읽기 실패 (${file.name}): ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      });
    }
  }
</script>

<div
  class="app"
  class:dragging={isDragging}
  role="application"
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  <Toolbar 
    on:newTab={(e) => handleFileDrop(e.detail)}
    on:searchChange={(e) => {
      searchMatchedRowIds = e.detail.matchedRowIds;
      searchFilteredColumnKeys = e.detail.filteredColumnKeys;
    }}
  />
  {#if tabs.length > 0}
    <Tabs 
      {tabs} 
      {activeTabId}
      onTabClick={switchToTab}
      onTabClose={closeTab}
    />
  {/if}
  <main class="main-content">
    {#if tabs.length === 0}
      <div class="empty-state">
        <h2>JSON Table Editor</h2>
        <p>파일을 업로드하거나 데이터를 붙여넣어 시작하세요</p>
        <div class="shortcuts">
          <p>단축키:</p>
          <ul>
            <li>Ctrl+Z: 실행 취소</li>
            <li>Ctrl+Y: 다시 실행</li>
            <li>Ctrl+E: 뷰 전환</li>
          </ul>
        </div>
      </div>
    {:else}
      <div class="stats-controls-container">
        <StatsPanel 
          {data} 
          {tableState}
          tableViewRef={tableViewRef}
        />
        <div class="view-controls">
          <button
            class="view-btn"
            class:active={viewMode === 'table'}
            on:click={() => (viewMode = 'table')}
          >
            테이블
          </button>
          <button
            class="view-btn"
            class:active={viewMode === 'raw'}
            on:click={() => (viewMode = 'raw')}
          >
            Raw JSON
          </button>
        </div>
      </div>
      <div class="view-wrapper">
        <div class="view-container" class:hidden={viewMode !== 'table'}>
          <TableView 
            bind:this={tableViewRef}
            {searchMatchedRowIds}
            searchFilteredColumnKeys={searchFilteredColumnKeys}
            on:stateChange={(e) => {
              tableState = e.detail;
            }}
          />
        </div>
        <div class="view-container" class:hidden={viewMode !== 'raw'}>
          <RawView 
            on:navigateToCell={(e) => {
              viewMode = 'table';
              if (tableViewRef) {
                tableViewRef.navigateToCell(e.detail.rowId, e.detail.columnKey);
              }
            }}
            on:navigateToColumn={(e) => {
              viewMode = 'table';
              if (tableViewRef) {
                tableViewRef.navigateToColumn(e.detail.columnKey);
              }
            }}
            on:navigateToRow={(e) => {
              viewMode = 'table';
              if (tableViewRef) {
                tableViewRef.navigateToRow(e.detail.rowId);
              }
            }}
          />
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
    background: var(--bg-primary);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .view-wrapper {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .view-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
  }

  .view-container.hidden {
    display: none;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
  }

  .empty-state h2 {
    font-size: 2rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
  }

  .empty-state p {
    font-size: 1rem;
  }

  .shortcuts {
    margin-top: 2rem;
    text-align: left;
  }

  .shortcuts ul {
    list-style: none;
    padding: 0;
    margin-top: 0.5rem;
  }

  .shortcuts li {
    padding: 0.25rem 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .stats-controls-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }

  .view-controls {
    display: flex;
    gap: 0.25rem;
  }

  .view-btn {
    padding: 0.25rem 0.75rem;
    background: transparent;
    border: none;
    font-size: 0.875rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.2s;
    font-weight: 600;
  }

  .view-btn:hover {
    color: var(--text-primary);
  }

  .view-btn.active {
    color: var(--accent);
  }

  .app.dragging {
    position: relative;
  }

  .app.dragging::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 122, 255, 0.1);
    border: 2px dashed var(--accent);
    z-index: 999;
    pointer-events: none;
  }

  .app.dragging::after {
    content: '파일을 여기에 놓으세요';
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bg-primary);
    padding: 1rem 2rem;
    border-radius: 8px;
    border: 2px solid var(--accent);
    font-size: 1.125rem;
    font-weight: 500;
    color: var(--accent);
    z-index: 1000;
    pointer-events: none;
  }
</style>

