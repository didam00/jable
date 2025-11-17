<script lang="ts">
  import { onMount } from 'svelte';
  import { dataStore } from './agents/store';
  import { setupKeyboardShortcuts } from './agents/ui-ux';
  import { importFile, saveFile, saveFileAs } from './agents/import-export';
  import TableView from './components/TableView.svelte';
  import Toolbar from './components/Toolbar.svelte';
  // import SearchBar from './components/SearchBar.svelte';
  import RawView from './components/RawView.svelte';
  import StatsPanel from './components/StatsPanel.svelte';
  import Tabs from './components/Tabs.svelte';
  import ProgressBar from './components/ProgressBar.svelte';
  import SettingsDialog from './components/SettingsDialog.svelte';
  import TitleBar from './components/TitleBar.svelte';
  import { compressToToon, decompressFromToon } from './agents/compression/toon';
  import type { TableData } from './agents/store';
  import type { Tab } from './types/tab';
  import { isTauri } from './utils/isTauri';
  import logo from './assets/logo.png';

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
  let progress = 0;
  let progressMessage = '';
  let showProgress = false;
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
  let showSettings = false;
  const isTauriApp = isTauri();

  onMount(() => {
    dataStore.subscribe((value) => {
      if (!isUpdatingFromTab && activeTabId) {
        // dataStore 변경 시 현재 활성 탭 업데이트
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
          // 데이터 유효성 검사
          if (value && value.rows && Array.isArray(value.rows)) {
            // 대용량 데이터는 .toon으로 압축하여 저장
            const shouldCompress = value.rows.length > 1000;
            if (shouldCompress) {
              activeTab.data = compressToToon(value);
              activeTab.isCompressed = true;
            } else {
              activeTab.data = JSON.parse(JSON.stringify(value));
              activeTab.isCompressed = false;
            }
            activeTab.isModified = true;
            
            // 현재 탭의 히스토리도 업데이트
            const currentHistory = dataStore.getTabHistory();
            if (currentHistory) {
              activeTab.history = currentHistory.history;
              activeTab.historyIndex = currentHistory.historyIndex;
            }
            
            tabs = tabs; // Svelte reactivity
          }
        }
      }
      data = value;
    });

    // 키보드 단축키 설정
    const cleanup = setupKeyboardShortcuts({
      onToggleView: () => {
        viewMode = viewMode === 'table' ? 'raw' : 'table';
      },
      onSave: () => {
        handleSave();
      },
    });

    return cleanup;
  });

  function createNewTab(
    file: File | { path: string; name: string },
    fileData: TableData,
    fileFormat?: 'json' | 'csv' | 'xml' | 'toon'
  ): string {
    const tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileName = file instanceof File ? file.name : file.name;
    
    // 파일 형식 감지
    let format: 'json' | 'csv' | 'xml' | 'toon' | undefined = fileFormat;
    if (!format) {
      const lowerName = fileName.toLowerCase();
      if (lowerName.endsWith('.json')) format = 'json';
      else if (lowerName.endsWith('.csv')) format = 'csv';
      else if (lowerName.endsWith('.xml')) format = 'xml';
      else if (lowerName.endsWith('.toon')) format = 'toon';
    }
    
    // 데이터 유효성 검사
    if (!fileData || !fileData.rows || !Array.isArray(fileData.rows)) {
      throw new Error('유효하지 않은 데이터입니다.');
    }
    
    // 대용량 데이터는 .toon으로 압축하여 저장
    let shouldCompress = fileData.rows.length > 1000;
    let tabData: TableData | string;
    try {
      if (shouldCompress) {
        console.log(`[createNewTab] 압축 시작: ${fileName}`, {
          rowsCount: fileData.rows.length,
          columnsCount: fileData.columns.length
        });
        tabData = compressToToon(fileData);
        console.log(`[createNewTab] 압축 성공: ${fileName}`, {
          compressedLength: typeof tabData === 'string' ? tabData.length : undefined
        });
      } else {
        tabData = JSON.parse(JSON.stringify(fileData));
      }
    } catch (compressError) {
      console.error(`[createNewTab] 압축 실패: ${fileName}`, {
        error: compressError,
        errorMessage: compressError instanceof Error ? compressError.message : String(compressError)
      });
      // 압축 실패 시 압축하지 않고 저장
      console.warn(`[createNewTab] 압축 실패, 압축 없이 저장: ${fileName}`);
      tabData = JSON.parse(JSON.stringify(fileData));
      shouldCompress = false;
    }
    
    const newTab: Tab = {
      id: tabId,
      name: fileName,
      data: tabData,
      isCompressed: shouldCompress,
      isModified: false,
      file: file,
      filePath: file instanceof File ? undefined : file.path,
      fileFormat: format,
    };
    
    tabs = [...tabs, newTab];
    activeTabId = tabId;
    return tabId;
  }

  function createEmptyTab() {
    const emptyData: TableData = {
      columns: [],
      rows: [],
      metadata: { rowCount: 0, columnCount: 0, isFlat: true },
    };

    const tabId = createNewTab({ path: 'untitled.json', name: 'untitled.json' }, emptyData, 'json');
    dataStore.setCurrentTab(tabId);
    dataStore.set(emptyData, true);
    viewMode = 'table';
  }

  function switchToTab(tabId: string) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    // 현재 탭의 히스토리 저장
    if (activeTabId) {
      const currentHistory = dataStore.getTabHistory();
      if (currentHistory) {
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (currentTab) {
          currentTab.history = currentHistory.history;
          currentTab.historyIndex = currentHistory.historyIndex;
        }
      }
    }
    
    activeTabId = tabId;
    isUpdatingFromTab = true;
    
    // 새 탭으로 전환
    dataStore.setCurrentTab(tabId);
    
    // 탭의 히스토리 복원 (있으면)
    if (tab.history && tab.historyIndex !== undefined) {
      dataStore.restoreTabHistory(tab.history, tab.historyIndex);
    } else {
      // 히스토리가 없으면 초기화
      dataStore.restoreTabHistory([], -1);
    }
    
    // .toon 압축 데이터인 경우 압축 해제
    let tabData: TableData;
    try {
      if (tab.isCompressed && typeof tab.data === 'string') {
        console.log(`[switchToTab] 압축 해제 시작: ${tab.name}`, {
          dataLength: tab.data.length,
          dataPreview: tab.data.substring(0, 100)
        });
        tabData = decompressFromToon(tab.data);
        console.log(`[switchToTab] 압축 해제 성공: ${tab.name}`, {
          rowsCount: tabData?.rows?.length,
          columnsCount: tabData?.columns?.length
        });
      } else {
        tabData = typeof tab.data === 'string' 
          ? JSON.parse(tab.data) 
          : JSON.parse(JSON.stringify(tab.data));
      }
    } catch (decompressError) {
      console.error(`[switchToTab] 압축 해제 실패: ${tab.name}`, {
        error: decompressError,
        errorMessage: decompressError instanceof Error ? decompressError.message : String(decompressError),
        errorStack: decompressError instanceof Error ? decompressError.stack : undefined,
        isCompressed: tab.isCompressed,
        dataType: typeof tab.data,
        dataLength: typeof tab.data === 'string' ? tab.data.length : undefined
      });
      throw new Error(`탭 데이터 압축 해제 실패 (${tab.name}): ${decompressError instanceof Error ? decompressError.message : 'Unknown error'}`);
    }
    
    // 초기 히스토리가 없으면 현재 상태를 히스토리에 추가
    if (!tab.history || tab.history.length === 0) {
      const clonedData = JSON.parse(JSON.stringify(tabData));
      dataStore.restoreTabHistory([{
        data: clonedData,
        timestamp: Date.now(),
      }], 0);
    }
    
    dataStore.set(tabData, true); // skipHistory = true로 설정하여 초기 히스토리 추가 방지
    setTimeout(() => {
      isUpdatingFromTab = false;
    }, 0);
  }

  async function closeTab(tabId: string) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    
    const tab = tabs[tabIndex];
    
    // 수정된 파일이 있으면 저장 확인
    if (tab.isModified) {
      const shouldSave = confirm(`${tab.name} 파일이 수정되었습니다. 저장하시겠습니까?`);
      if (shouldSave) {
        await handleSave();
        // 저장 후 탭이 아직 수정 상태라면 닫기 취소
        const updatedTab = tabs.find(t => t.id === tabId);
        if (updatedTab?.isModified) {
          return; // 저장이 취소되었거나 실패한 경우
        }
      }
    }
    
    // 탭 데이터 및 히스토리 메모리 정리
    if (tab.isCompressed && typeof tab.data === 'string') {
      tab.data = '';
    } else {
      tab.data = {
        columns: [],
        rows: [],
        metadata: { rowCount: 0, columnCount: 0, isFlat: true },
      };
    }
    tab.history = undefined;
    tab.historyIndex = undefined;
    tab.file = null;
    
    // DataStore에서도 히스토리 삭제
    dataStore.deleteTabHistory(tabId);
    
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

  async function handleFileDrop(file: File | { path: string; name: string }) {
    try {
      showProgress = true;
      progress = 0;
      progressMessage = '파일 읽는 중...';
      
      const result = await importFile(file, (prog, msg) => {
        progress = prog;
        progressMessage = msg;
      });
      
      // 데이터 유효성 검사
      if (!result || !result.data) {
        throw new Error('파일 데이터를 읽을 수 없습니다.');
      }
      
      if (!result.data.rows || !Array.isArray(result.data.rows)) {
        throw new Error('유효하지 않은 데이터 형식입니다.');
      }
      
      // 항상 새 탭으로 열기
      createNewTab(file, result.data, result.format);
      switchToTab(activeTabId!);
      
      showProgress = false;
    } catch (error) {
      showProgress = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[handleFileDrop] 파일 읽기 실패:', {
        error,
        errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined
      });
      alert(errorMessage);
    }
  }

  async function handleSave() {
    if (!activeTabId) return;

    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    try {
      // 탭 데이터를 TableData로 변환
      let tabData: TableData;
      if (tab.isCompressed && typeof tab.data === 'string') {
        tabData = decompressFromToon(tab.data);
      } else {
        tabData = typeof tab.data === 'string' 
          ? JSON.parse(tab.data) 
          : tab.data;
      }

      if (tab.filePath && tab.fileFormat) {
        // 원본 파일에 저장
        const result = await saveFile(tabData, tab.filePath, tab.fileFormat);
        if (result.saved) {
          tab.isModified = false;
          tabs = tabs; // Svelte reactivity
        }
      } else {
        // Save As
        const format = tab.fileFormat || 'json';
        const result = await saveFileAs(tabData, format, tab.name);
        if (result.saved && result.filePath) {
          tab.filePath = result.filePath;
          tab.isModified = false;
          // 파일명 업데이트
          const fileName = result.filePath.split(/[/\\]/).pop() || tab.name;
          tab.name = fileName;
          tabs = tabs; // Svelte reactivity
        }
      }
    } catch (error) {
      alert(`저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function handleSaveAs() {
    if (!activeTabId) return;

    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    try {
      // 탭 데이터를 TableData로 변환
      let tabData: TableData;
      if (tab.isCompressed && typeof tab.data === 'string') {
        tabData = decompressFromToon(tab.data);
      } else {
        tabData = typeof tab.data === 'string' 
          ? JSON.parse(tab.data) 
          : tab.data;
      }

      const format = tab.fileFormat || 'json';
      const result = await saveFileAs(tabData, format, tab.name);
      if (result.saved && result.filePath) {
        tab.filePath = result.filePath;
        tab.isModified = false;
        // 파일명 업데이트
        const fileName = result.filePath.split(/[/\\]/).pop() || tab.name;
        tab.name = fileName;
        tabs = tabs; // Svelte reactivity
      }
    } catch (error) {
      alert(`저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDragging = false;

    console.log('[handleDrop] 드롭 이벤트 발생:', {
      isTauri: isTauri(),
      filesLength: event.dataTransfer?.files?.length,
      itemsLength: event.dataTransfer?.items?.length
    });

    // Tauri와 웹 모두에서 dataTransfer.files를 먼저 시도
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      console.log('[handleDrop] dataTransfer.files 사용:', files.length);
      // 여러 파일을 동시에 드롭한 경우 모두 처리
      for (const file of Array.from(files)) {
        const fileName = file.name.toLowerCase();
        console.log('[handleDrop] 파일 처리:', { name: file.name, size: file.size });
        if (fileName.endsWith('.json') || fileName.endsWith('.csv') || fileName.endsWith('.xml') || fileName.endsWith('.toon')) {
          try {
            showProgress = true;
            progress = 0;
            progressMessage = `${file.name} 읽는 중...`;
            
            const result = await importFile(file, (prog, msg) => {
              progress = prog;
              progressMessage = `${file.name}: ${msg}`;
            });
            
            createNewTab(file, result.data, result.format);
            if (file === files[files.length - 1]) {
              // 마지막 파일을 활성 탭으로 설정
              switchToTab(activeTabId!);
            }
            
            showProgress = false;
          } catch (error) {
            showProgress = false;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[handleDrop] 파일 읽기 실패:', {
              fileName: file.name,
              error,
              errorMessage,
              errorStack: error instanceof Error ? error.stack : undefined
            });
            alert(`${file.name}: ${errorMessage}`);
          }
        }
      }
    } else if (isTauri()) {
      // Tauri 환경에서 files가 비어있으면 dataTransfer.items를 통해 파일 경로 추출 시도
      console.log('[handleDrop] Tauri 환경에서 items 사용 시도');
      const items = event.dataTransfer?.items;
      if (items && items.length > 0) {
        console.log('[handleDrop] items 개수:', items.length);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          console.log('[handleDrop] item:', { kind: item.kind, type: item.type });
          if (item.kind === 'file') {
            try {
              // FileSystemEntry API 사용
              const entry = (item as any).webkitGetAsEntry?.() || (item as any).getAsEntry?.();
              console.log('[handleDrop] entry:', entry);
              
              if (entry && entry.isFile) {
                const file = await new Promise<File>((resolve, reject) => {
                  (entry as FileSystemFileEntry).file(resolve, reject);
                });
                
                console.log('[handleDrop] File 객체 생성:', { name: file.name, size: file.size });
                
                const fileName = file.name.toLowerCase();
                if (fileName.endsWith('.json') || fileName.endsWith('.csv') || fileName.endsWith('.xml') || fileName.endsWith('.toon')) {
                  try {
                    showProgress = true;
                    progress = 0;
                    progressMessage = `${file.name} 읽는 중...`;
                    
                    const result = await importFile(file, (prog, msg) => {
                      progress = prog;
                      progressMessage = `${file.name}: ${msg}`;
                    });
                    
                    createNewTab(file, result.data, result.format);
                    if (i === items.length - 1) {
                      switchToTab(activeTabId!);
                    }
                    
                    showProgress = false;
                  } catch (error) {
                    showProgress = false;
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[handleDrop] 파일 읽기 실패:', {
                      fileName: file.name,
                      error,
                      errorMessage,
                      errorStack: error instanceof Error ? error.stack : undefined
                    });
                    alert(`${file.name}: ${errorMessage}`);
                  }
                }
              } else {
                console.warn('[handleDrop] entry가 파일이 아님:', entry);
              }
            } catch (error) {
              console.error('[handleDrop] 파일 항목 처리 실패:', {
                error,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined
              });
            }
          }
        }
      } else {
        console.warn('[handleDrop] Tauri에서 files와 items 모두 비어있음');
      }
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
  {#if isTauriApp}
    <TitleBar />
  {/if}
  <Toolbar 
    on:newTab={(e) => {
      handleFileDrop(e.detail);
    }}
    on:createEmpty={createEmptyTab}
    on:save={handleSave}
    on:saveAs={handleSaveAs}
    on:searchChange={(e) => {
      searchMatchedRowIds = e.detail.matchedRowIds;
      searchFilteredColumnKeys = e.detail.filteredColumnKeys;
    }}
    on:openSettings={() => {
      showSettings = true;
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
        <img src={logo} alt="Jable" class="logo" />
        <p>파일을 업로드하거나 데이터를 붙여넣어 시작하세요</p>
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
  <ProgressBar progress={progress} message={progressMessage} visible={showProgress} />
  <SettingsDialog isOpen={showSettings} onClose={() => { showSettings = false; }} />
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

  .empty-state .logo {
    height: 100px;
    margin-top: -64px;
  }
  
  .empty-state p {
    font-size: 0.875rem;
    margin-top: -0.25rem;
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

