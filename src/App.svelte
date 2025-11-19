<script lang="ts">
  import { onMount } from 'svelte';
  import { dataStore } from './agents/store';
  import { setupKeyboardShortcuts } from './agents/ui-ux';
import {
  importFile,
  saveFile,
  saveFileAs,
  exportFile,
  prepareEncodingPreview,
  type ImportOptions,
  type EncodingPreviewResult,
} from './agents/import-export';
import EncodingPreviewDialog from './components/EncodingPreviewDialog.svelte';
import SaveAsDialog from './components/SaveAsDialog.svelte';
  import TableView from './components/TableView.svelte';
  import Toolbar from './components/Toolbar.svelte';
  // import SearchBar from './components/SearchBar.svelte';
  import StatsPanel from './components/StatsPanel.svelte';
  import Tabs from './components/Tabs.svelte';
import ProgressBar from './components/ProgressBar.svelte';
  import SettingsDialog from './components/SettingsDialog.svelte';
  import TitleBar from './components/TitleBar.svelte';
  import ImportChoiceDialog from './components/ImportChoiceDialog.svelte';
import SecondaryTabPreview from './components/SecondaryTabPreview.svelte';
import StatusBar from './components/StatusBar.svelte';
import { compressToToon, decompressFromToon } from './agents/compression/toon';
  import type { TableData } from './agents/store';
  import type { Tab } from './types/tab';
import { isTauri } from './utils/isTauri';
import { decodePreview, ENCODING_OPTIONS, type EncodingOption, buildFileNameForFormat } from './agents/import-export/encoding';
  import { getRecentFiles, addRecentFile, removeRecentFile, type RecentFile } from './utils/recentFiles';
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
  filteredRowCount: number;
  totalRowCount: number;
  duplicateInfo?: {
    columns: string[];
    groups: number;
    totalDuplicates: number;
    isFiltered: boolean;
  };
} = {
  sortColumn: null,
  sortDirection: 'asc',
  filters: {},
  filteredRowCount: 0,
  totalRowCount: 0,
};
  let searchMatchedRowIds: Set<string> = new Set();
  let searchFilteredColumnKeys: string[] | null = null;
$: searchMatchCount = searchMatchedRowIds ? searchMatchedRowIds.size : 0;
  let showSettings = false;
const isTauriApp = isTauri();
let recentFiles: RecentFile[] = [];
const encodingOptions: EncodingOption[] = ENCODING_OPTIONS;
let currentEncoding = 'utf-8';
let canChangeEncoding = false;
  type RawViewComponentType = typeof import('./components/RawView.svelte').default;
  let RawViewComponent: RawViewComponentType | null = null;
  let rawViewLoadPromise: Promise<void> | null = null;
interface EncodingDialogState {
  fileName: string;
  buffer: Uint8Array;
  detectedEncoding: string | null;
  detectedConfidence: number;
  selectedEncoding: string;
  previewText: string;
  previewError?: string;
  isLoadingPreview: boolean;
}
interface EncodingSelection {
  encoding: string;
  buffer: Uint8Array;
}
let encodingDialogOpen = false;
let encodingDialogState: EncodingDialogState | null = null;
let encodingDialogResolver: ((value: EncodingSelection | null) => void) | null = null;

interface SaveAsDialogState {
  format: 'json' | 'csv' | 'xml' | 'toon';
  fileName: string;
  directoryPath: string;
  encoding: string;
  canBrowseDirectory: boolean;
}

interface SaveAsSelection {
  fileName: string;
  directoryPath: string;
  encoding: string;
}

let saveAsDialogOpen = false;
let saveAsDialogState: SaveAsDialogState | null = null;
let saveAsDialogResolver: ((value: SaveAsSelection | null) => void) | null = null;
let lastSaveDirectory = '';
  async function ensureRawViewLoaded() {
    if (RawViewComponent || rawViewLoadPromise) {
      await rawViewLoadPromise;
      return;
    }
    rawViewLoadPromise = import('./components/RawView.svelte').then((module) => {
      RawViewComponent = module.default;
    }).finally(() => {
      rawViewLoadPromise = null;
    });
    await rawViewLoadPromise;
  }

  type ImportChoice = 'merge' | 'new-tab' | 'cancel';
  type TabContextAction = 'merge' | 'subtract' | 'intersect' | 'split';
  interface PendingImport {
    file: File | { path: string; name: string };
    data: TableData;
    format?: 'json' | 'csv' | 'xml' | 'toon';
    encoding?: string;
    binarySource?: Uint8Array | null;
  }

  let importDialogOpen = false;
  let importDialogFileName = '';
  let importDialogCanMerge = false;
  let importDialogResolver: ((choice: ImportChoice) => void) | null = null;
  let splitViewTabId: string | null = null;
  let splitViewState: { tabId: string; tabName: string; data: TableData } | null = null;
  $: splitViewState = splitViewTabId ? buildSplitViewState(splitViewTabId) : null;

  function buildSplitViewState(tabId: string) {
    const targetTab = tabs.find((tab) => tab.id === tabId);
    if (!targetTab) {
      return null;
    }
    try {
      return {
        tabId,
        tabName: targetTab.name,
        data: resolveTabData(targetTab),
      };
    } catch (error) {
      console.error('[buildSplitViewState] 데이터 로드 실패', error);
      return null;
    }
  }

  function resolveTabData(tab: Tab): TableData {
    if (tab.isCompressed && typeof tab.data === 'string') {
      return decompressFromToon(tab.data);
    }
    if (typeof tab.data === 'string') {
      return JSON.parse(tab.data);
    }
    return JSON.parse(JSON.stringify(tab.data));
  }

function getFileDisplayName(file: File | { path: string; name: string }): string {
  return file instanceof File ? file.name : file.name;
}

function isCsvFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.csv');
}

function extractDirectoryPath(filePath?: string | null): string {
  if (!filePath) {
    return '';
  }
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index === -1) {
    return '';
  }
  return normalized.slice(0, index);
}

function updateSaveAsDialogState(patch: Partial<SaveAsDialogState>) {
  if (!saveAsDialogState) {
    return;
  }
  saveAsDialogState = {
    ...saveAsDialogState,
    ...patch,
  };
}

function closeSaveAsDialog(selection: SaveAsSelection | null) {
  saveAsDialogOpen = false;
  if (selection?.directoryPath) {
    lastSaveDirectory = selection.directoryPath;
  }
  saveAsDialogResolver?.(selection);
  saveAsDialogResolver = null;
  saveAsDialogState = null;
}

function handleSaveAsDialogConfirm() {
  if (!saveAsDialogState) {
    closeSaveAsDialog(null);
    return;
  }
  const trimmedName = saveAsDialogState.fileName.trim();
  if (!trimmedName) {
    return;
  }
  if (saveAsDialogState.canBrowseDirectory && !saveAsDialogState.directoryPath.trim()) {
    return;
  }
  closeSaveAsDialog({
    fileName: trimmedName,
    directoryPath: saveAsDialogState.directoryPath.trim(),
    encoding: saveAsDialogState.encoding,
  });
}

function handleSaveAsDialogCancel() {
  closeSaveAsDialog(null);
}

function handleSaveAsDialogFileNameChange(event: CustomEvent<{ value: string }>) {
  updateSaveAsDialogState({ fileName: event.detail.value });
}

function handleSaveAsDialogEncodingChange(event: CustomEvent<{ value: string }>) {
  updateSaveAsDialogState({ encoding: event.detail.value });
}

function handleSaveAsDialogDirectoryChange(event: CustomEvent<{ value: string }>) {
  updateSaveAsDialogState({ directoryPath: event.detail.value });
}

async function handleSaveAsDialogBrowse() {
  if (!isTauriApp || !saveAsDialogState) {
    return;
  }
  try {
    const dialogModule = await import('@tauri-apps/plugin-dialog');
    const { open } = dialogModule as any;
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: saveAsDialogState.directoryPath || lastSaveDirectory || undefined,
    });
    if (typeof selected === 'string') {
      updateSaveAsDialogState({ directoryPath: selected });
    }
  } catch (error) {
    console.error('[handleSaveAsDialogBrowse] 디렉토리 선택 실패', error);
  }
}

function requestSaveAsOptions(tab: Tab, format: 'json' | 'csv' | 'xml' | 'toon'): Promise<SaveAsSelection | null> {
  const initialFileName = buildFileNameForFormat(tab.name, format);
  const initialDirectory = extractDirectoryPath(tab.filePath) || lastSaveDirectory;
  saveAsDialogState = {
    format,
    fileName: initialFileName,
    directoryPath: initialDirectory,
    encoding: tab.encoding || 'utf-8',
    canBrowseDirectory: isTauriApp,
  };
  saveAsDialogOpen = true;
  return new Promise((resolve) => {
    saveAsDialogResolver = resolve;
  });
}

  function cloneTableData(table: TableData): TableData {
    return JSON.parse(JSON.stringify(table));
  }

  function canMergeIntoActiveTab(): boolean {
    if (!activeTabId) {
      return false;
    }
    const current = dataStore.getCurrentData();
    return current.rows.length > 0 || current.columns.length > 0;
  }

  function requestImportChoice(pending: PendingImport): Promise<ImportChoice> {
    importDialogFileName = pending.file instanceof File ? pending.file.name : pending.file.name;
    importDialogCanMerge = canMergeIntoActiveTab();
    importDialogOpen = true;
    return new Promise((resolve) => {
      importDialogResolver = resolve;
    });
  }

  function handleImportDialogSelect(event: CustomEvent<ImportChoice>) {
    importDialogOpen = false;
    importDialogResolver?.(event.detail);
    importDialogResolver = null;
  }

  async function integrateImportedData(pending: PendingImport) {
    if (canMergeIntoActiveTab()) {
      const choice = await requestImportChoice(pending);
      if (choice === 'cancel') {
        return;
      }
      if (choice === 'merge') {
        const merged = dataStore.mergeWith(cloneTableData(pending.data));
        dataStore.set(merged);
        return;
      }
    }

    const tabId = createNewTab(
      pending.file,
      pending.data,
      pending.format,
      pending.encoding,
      pending.binarySource ?? null
    );
    switchToTab(tabId);
  }

  async function handleClipboardImport(data: TableData) {
    try {
      await integrateImportedData({
        file: { path: '', name: 'clipboard.json' },
        data,
        format: 'json',
      });
    } catch (error) {
      console.error('[handleClipboardImport] 붙여넣기 데이터 처리 실패:', error);
      alert(`붙여넣기 데이터를 불러오지 못했습니다: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  function closeSplitView() {
    splitViewTabId = null;
  }

  async function handleTabContextAction(targetTabId: string, action: TabContextAction) {
    if (!activeTabId || targetTabId === activeTabId) {
      return;
    }
    const targetTab = tabs.find((tab) => tab.id === targetTabId);
    if (!targetTab) {
      return;
    }
    if (action === 'split') {
      splitViewTabId = targetTabId;
      return;
    }
    const targetData = resolveTabData(targetTab);
    try {
      if (action === 'merge') {
        const merged = dataStore.mergeWith(targetData);
        dataStore.set(merged);
      } else if (action === 'subtract') {
        const updated = dataStore.subtractWith(targetData);
        dataStore.set(updated);
      } else if (action === 'intersect') {
        const updated = dataStore.intersectWith(targetData);
        dataStore.set(updated);
      }
    } catch (error) {
      console.error('[handleTabContextAction] 데이터 처리 실패', error);
      alert(`데이터 처리 중 오류가 발생했습니다: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  $: if (viewMode === 'raw') {
    ensureRawViewLoaded();
  }

  onMount(() => {
    let fileDropUnlisten: (() => void) | null = null;
    
    // 최근 파일 목록 로드 (Tauri 환경에서만)
    if (isTauriApp) {
      recentFiles = getRecentFiles();
      
      // Tauri 파일 드롭 이벤트 리스너 설정
      (async () => {
        try {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          
          // Tauri 2.x의 onDragDropEvent 사용
          fileDropUnlisten = await webview.onDragDropEvent((event) => {
            console.log('[onDragDropEvent] Tauri 파일 드롭 이벤트:', event);
            
            if (event.payload.type === 'over') {
              // 파일이 창 위에 호버 중
              console.log('[onDragDropEvent] 파일 호버 중:', event.payload.position);
              isDragging = true;
            } else if (event.payload.type === 'drop') {
              // 파일 드롭됨
              const paths = event.payload.paths as string[];
              console.log('[onDragDropEvent] 파일 드롭됨:', paths);
              
              isDragging = false;
              
              if (paths && Array.isArray(paths)) {
                // 각 파일 경로를 처리
                for (const filePath of paths) {
                  const fileName = filePath.split(/[/\\]/).pop() || 'untitled';
                  const lowerName = fileName.toLowerCase();
                  
                  // 지원하는 파일 형식만 처리
                  if (lowerName.endsWith('.json') || lowerName.endsWith('.csv') || lowerName.endsWith('.xml') || lowerName.endsWith('.toon')) {
                    handleFileDrop({ path: filePath, name: fileName });
                  }
                }
              }
            } else {
              // 파일 드롭 취소됨
              console.log('[onDragDropEvent] 파일 드롭 취소됨');
              isDragging = false;
            }
          });
        } catch (error) {
          console.error('[onMount] Tauri 파일 드롭 이벤트 설정 실패:', error);
        }
      })();
    }
    
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

    return () => {
      cleanup();
      if (fileDropUnlisten) {
        fileDropUnlisten();
      }
    };
  });

  function createNewTab(
    file: File | { path: string; name: string },
    fileData: TableData,
    fileFormat?: 'json' | 'csv' | 'xml' | 'toon',
    encoding?: string,
    binarySource?: Uint8Array | null
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
    
    const { payload, compressed } = buildTabDataPayload(fileData);
    
    const newTab: Tab = {
      id: tabId,
      name: fileName,
      data: payload,
      isCompressed: compressed,
      isModified: false,
      file: file,
      filePath: file instanceof File ? undefined : file.path,
      fileFormat: format,
      encoding: encoding || 'utf-8',
      binarySource: binarySource || null,
    };
    
    tabs = [...tabs, newTab];
    activeTabId = tabId;
    updateActiveEncodingState();
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
    updateActiveEncodingState();
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
    if (splitViewTabId === tabId) {
      splitViewTabId = null;
    }
    
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
    updateActiveEncodingState();
  }

  async function prepareImportOptions(
    file: File | { path: string; name: string }
  ): Promise<ImportOptions | null> {
    const fileName = getFileDisplayName(file);
    if (!isCsvFileName(fileName)) {
      return {};
    }
    try {
      showProgress = true;
      progress = 10;
      progressMessage = `${fileName} 미리보기 준비 중...`;
      const preview = await prepareEncodingPreview(file);
      showProgress = false;
      const selection = await requestEncodingSelection(fileName, preview);
      if (!selection) {
        return null;
      }
      return {
        encoding: selection.encoding,
        binarySource: selection.buffer,
      };
    } catch (error) {
      showProgress = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`인코딩 미리보기를 준비하지 못했습니다: ${message}`);
      return null;
    }
  }

  function requestEncodingSelection(
    fileName: string,
    preview: EncodingPreviewResult
  ): Promise<EncodingSelection | null> {
    encodingDialogState = {
      fileName,
      buffer: preview.buffer,
      detectedEncoding: preview.detectedEncoding,
      detectedConfidence: preview.confidence,
      selectedEncoding: preview.initialEncoding,
      previewText: preview.previewText ?? '',
      previewError: preview.previewError,
      isLoadingPreview: false,
    };
    encodingDialogOpen = true;
    return new Promise((resolve) => {
      encodingDialogResolver = resolve;
    });
  }

  function buildTabDataPayload(fileData: TableData): { payload: TableData | string; compressed: boolean } {
    let shouldCompress = fileData.rows.length > 1000;
    let payload: TableData | string;
    try {
      if (shouldCompress) {
        console.log(`[buildTabDataPayload] 압축 시작`, {
          rowsCount: fileData.rows.length,
          columnsCount: fileData.columns.length,
        });
        payload = compressToToon(fileData);
      } else {
        payload = JSON.parse(JSON.stringify(fileData));
      }
    } catch (error) {
      console.error(`[buildTabDataPayload] 압축 실패`, {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      payload = JSON.parse(JSON.stringify(fileData));
      shouldCompress = false;
    }
    return { payload, compressed: shouldCompress };
  }

  function updateActiveEncodingState() {
    if (!activeTabId) {
      currentEncoding = 'utf-8';
      canChangeEncoding = false;
      return;
    }
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab) {
      currentEncoding = 'utf-8';
      canChangeEncoding = false;
      return;
    }
    currentEncoding = (activeTab.encoding || 'utf-8').toLowerCase();
    canChangeEncoding = activeTab.fileFormat === 'csv' && Boolean(activeTab.binarySource);
  }

  function closeEncodingDialog(result: EncodingSelection | null) {
    encodingDialogOpen = false;
    const resolver = encodingDialogResolver;
    encodingDialogResolver = null;
    encodingDialogState = null;
    resolver?.(result);
  }

  function handleEncodingDialogConfirm() {
    if (!encodingDialogState) {
      closeEncodingDialog(null);
      return;
    }
    closeEncodingDialog({
      encoding: encodingDialogState.selectedEncoding,
      buffer: encodingDialogState.buffer,
    });
  }

  function handleEncodingDialogCancel() {
    closeEncodingDialog(null);
  }

  function handleEncodingDialogEncodingChange(
    event: CustomEvent<{ encoding: string }>
  ) {
    if (!encodingDialogState) {
      return;
    }
    const nextEncoding = event.detail.encoding;
    encodingDialogState = {
      ...encodingDialogState,
      selectedEncoding: nextEncoding,
      isLoadingPreview: true,
      previewError: undefined,
    };
    const buffer = encodingDialogState.buffer;
    try {
      const previewText = decodePreview(buffer, nextEncoding);
      encodingDialogState = {
        ...encodingDialogState,
        previewText,
        isLoadingPreview: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      encodingDialogState = {
        ...encodingDialogState,
        previewError: message,
        isLoadingPreview: false,
      };
    }
  }

  async function handleEncodingChangeRequest(newEncoding: string) {
    if (!activeTabId) {
      return;
    }
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || tab.fileFormat !== 'csv' || !tab.binarySource) {
      alert('이 탭에서는 인코딩을 변경할 수 없습니다.');
      return;
    }
    if (!newEncoding || tab.encoding === newEncoding) {
      return;
    }
    try {
      showProgress = true;
      progress = 0;
      progressMessage = `${tab.name} 인코딩 변경 중...`;
      const fileRef = tab.file ?? (tab.filePath ? { path: tab.filePath, name: tab.name } : { path: '', name: tab.name });
      const result = await importFile(
        fileRef,
        (prog, msg) => {
          progress = prog;
          progressMessage = `${tab.name}: ${msg}`;
        },
        { encoding: newEncoding, binarySource: tab.binarySource }
      );
      const { payload, compressed } = buildTabDataPayload(result.data);
      tab.data = payload;
      tab.isCompressed = compressed;
      tab.encoding = newEncoding;
      tab.fileFormat = result.format;
      tab.isModified = false;
      tabs = [...tabs];
      isUpdatingFromTab = true;
      dataStore.setCurrentTab(tab.id);
      dataStore.restoreTabHistory([{
        data: JSON.parse(JSON.stringify(result.data)),
        timestamp: Date.now(),
      }], 0);
      dataStore.set(result.data, true);
      setTimeout(() => {
        isUpdatingFromTab = false;
      }, 0);
      currentEncoding = newEncoding;
      updateActiveEncodingState();
      showProgress = false;
    } catch (error) {
      showProgress = false;
      alert(`인코딩 변경 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function processInputFile(
    file: File | { path: string; name: string }
  ): Promise<boolean> {
    const importOptions = await prepareImportOptions(file);
    if (importOptions === null) {
      return false;
    }
    try {
      const fileName = getFileDisplayName(file);
      showProgress = true;
      progress = 0;
      progressMessage = `${fileName} 읽는 중...`;
      const result = await importFile(
        file,
        (prog, msg) => {
          progress = prog;
          progressMessage = `${fileName}: ${msg}`;
        },
        importOptions
      );
      if (!result || !result.data) {
        throw new Error('파일 데이터를 읽을 수 없습니다.');
      }
      if (!result.data.rows || !Array.isArray(result.data.rows)) {
        throw new Error('유효하지 않은 데이터 형식입니다.');
      }
      await integrateImportedData({
        file,
        data: result.data,
        format: result.format,
        encoding: result.encoding,
        binarySource: importOptions?.binarySource ?? result.binarySource ?? null,
      });
      showProgress = false;
      return true;
    } catch (error) {
      showProgress = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[processInputFile] 파일 처리 실패:', {
        file: getFileDisplayName(file),
        error,
      });
      alert(message);
      return false;
    }
  }

  async function handleFileDrop(file: File | { path: string; name: string }) {
    const succeeded = await processInputFile(file);
    if (
      succeeded &&
      isTauriApp &&
      'path' in file &&
      file.path
    ) {
      addRecentFile(file.path, file.name);
      recentFiles = getRecentFiles();
    }
  }

async function saveTabAs(tab: Tab, tabData: TableData): Promise<boolean> {
  const format = tab.fileFormat || 'json';
  const selection = await requestSaveAsOptions(tab, format);
  if (!selection) {
    return false;
  }
  try {
    const result = await saveFileAs(tabData, format, {
      defaultFileName: selection.fileName,
      directoryPath: selection.directoryPath || undefined,
      encoding: selection.encoding,
    });
    if (result.saved) {
      if (result.filePath) {
        tab.filePath = result.filePath;
        const fileName = result.filePath.split(/[/\\]/).pop() || tab.name;
        tab.name = fileName;
        if (isTauriApp) {
          addRecentFile(result.filePath, tab.name);
          recentFiles = getRecentFiles();
        }
      } else {
        tab.name = buildFileNameForFormat(selection.fileName, format);
      }
      tab.fileFormat = format;
      tab.encoding = selection.encoding;
      tab.isModified = false;
      tabs = tabs;
      return true;
    }
  } catch (error) {
    alert(`저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  return false;
}

async function handleSave() {
  if (!activeTabId) return;

  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;

  try {
    let tabData: TableData;
    if (tab.isCompressed && typeof tab.data === 'string') {
      tabData = decompressFromToon(tab.data);
    } else {
      tabData = typeof tab.data === 'string'
        ? JSON.parse(tab.data)
        : tab.data;
    }

    if (!tab.filePath || !tab.fileFormat) {
      await saveTabAs(tab, tabData);
      return;
    }

    const result = await saveFile(tabData, tab.filePath, tab.fileFormat, {
      encoding: tab.encoding,
    });
    if (result.saved) {
      tab.isModified = false;
      tabs = tabs;
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

    await saveTabAs(tab, tabData);
    } catch (error) {
      alert(`저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function handleExport(format: 'json' | 'csv' | 'xml' | 'toon') {
    try {
      const dataToExport = dataStore.getCurrentData();
      const activeTab = activeTabId ? tabs.find((tab) => tab.id === activeTabId) : null;
    await exportFile(dataToExport, format, {
      defaultFileName: activeTab?.name,
      encoding: activeTab?.encoding,
    });
    } catch (error) {
      alert(`내보내기 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
          await processInputFile(file);
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
              await processInputFile(file);
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
    on:export={(e) => handleExport(e.detail.format)}
    on:searchChange={(e) => {
      searchMatchedRowIds = e.detail.matchedRowIds;
      searchFilteredColumnKeys = e.detail.filteredColumnKeys;
    }}
    on:openSettings={() => {
      showSettings = true;
    }}
    on:pasteImport={(e) => handleClipboardImport(e.detail.data)}
  />
  {#if tabs.length > 0}
    <Tabs 
      {tabs} 
      {activeTabId}
      onTabClick={switchToTab}
      onTabClose={closeTab}
      onTabContextAction={handleTabContextAction}
    />
  {/if}
  <main class="main-content">
    {#if tabs.length === 0}
      <div class="empty-state">
        <img src={logo} alt="Jable" class="logo" />
        <p>파일을 업로드하거나 데이터를 붙여넣어 시작하세요</p>
        {#if isTauriApp && recentFiles.length > 0}
          <div class="recent-files">
            <h3>최근 파일</h3>
            <div class="recent-files-list">
              {#each recentFiles as file (file.path)}
                <div class="recent-file-item">
                  <button
                    class="recent-file-button"
                    on:click={async () => {
                      try {
                        await handleFileDrop({ path: file.path, name: file.name });
                      } catch (error) {
                        console.error('[recentFileClick] 파일 열기 실패:', error);
                        const errorMessage = error instanceof Error 
                          ? error.message 
                          : (typeof error === 'string' ? error : String(error) || '알 수 없는 오류가 발생했습니다.');
                        alert(`파일을 열 수 없습니다: ${errorMessage}`);
                      }
                    }}
                    title={file.path}
                  >
                    <span class="material-icons">description</span>
                    <span class="file-name">{file.name}</span>
                    <span class="file-path">{file.path}</span>
                  </button>
                  <button
                    class="recent-file-remove"
                    on:click|stopPropagation={(e) => {
                      e.stopPropagation();
                      removeRecentFile(file.path);
                      recentFiles = getRecentFiles();
                    }}
                    title="최근 파일 목록에서 제거"
                  >
                    <span class="material-icons">close</span>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
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
      <div class="view-wrapper" class:with-split={Boolean(splitViewState)}>
        <div class="primary-pane">
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
            {#if viewMode === 'raw' && RawViewComponent}
              <svelte:component
                this={RawViewComponent}
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
            {/if}
          </div>
        </div>
        {#if splitViewState}
          <div class="secondary-pane">
            <SecondaryTabPreview
              tabName={splitViewState.tabName}
              data={splitViewState.data}
              on:close={closeSplitView}
            />
          </div>
        {/if}
      </div>
    {/if}
  </main>
  <ProgressBar progress={progress} message={progressMessage} visible={showProgress} />
  <SettingsDialog isOpen={showSettings} onClose={() => { showSettings = false; }} />
  <ImportChoiceDialog
    open={importDialogOpen}
    fileName={importDialogFileName}
    canMerge={importDialogCanMerge}
    on:select={handleImportDialogSelect}
  />
  <EncodingPreviewDialog
    open={encodingDialogOpen}
    fileName={encodingDialogState?.fileName ?? ''}
    options={encodingOptions}
    detectedEncoding={encodingDialogState?.detectedEncoding ?? null}
    detectedConfidence={encodingDialogState?.detectedConfidence ?? 0}
    selectedEncoding={encodingDialogState?.selectedEncoding ?? 'utf-8'}
    previewText={encodingDialogState?.previewText ?? ''}
    isLoading={encodingDialogState?.isLoadingPreview ?? false}
    errorMessage={encodingDialogState?.previewError}
    on:changeEncoding={handleEncodingDialogEncodingChange}
    on:confirm={handleEncodingDialogConfirm}
    on:cancel={handleEncodingDialogCancel}
  />
  <SaveAsDialog
    open={saveAsDialogOpen}
    fileName={saveAsDialogState?.fileName ?? ''}
    directoryPath={saveAsDialogState?.directoryPath ?? ''}
    encoding={saveAsDialogState?.encoding ?? 'utf-8'}
    format={saveAsDialogState?.format ?? 'json'}
    encodingOptions={encodingOptions}
    canBrowseDirectory={saveAsDialogState?.canBrowseDirectory ?? false}
    on:changeFileName={handleSaveAsDialogFileNameChange}
    on:changeEncoding={handleSaveAsDialogEncodingChange}
    on:changeDirectory={handleSaveAsDialogDirectoryChange}
    on:browseDirectory={handleSaveAsDialogBrowse}
    on:confirm={handleSaveAsDialogConfirm}
    on:cancel={handleSaveAsDialogCancel}
  />
  <StatusBar
    encoding={currentEncoding}
    options={encodingOptions}
    canChangeEncoding={canChangeEncoding}
    filteredRows={tableState.filteredRowCount}
    totalRows={tableState.totalRowCount || data.metadata.rowCount}
    searchCount={searchMatchCount}
    hasData={data.rows.length > 0 || data.columns.length > 0}
    duplicateInfo={tableState.duplicateInfo || null}
    on:changeEncoding={(e) => handleEncodingChangeRequest(e.detail.encoding)}
    on:findDuplicates={(e) => {
      if (tableViewRef?.findDuplicates) {
        tableViewRef.findDuplicates(e.detail.columns);
      }
    }}
    on:clearDuplicateFilter={() => {
      if (tableViewRef?.clearDuplicateFilter) {
        tableViewRef.clearDuplicateFilter();
      }
    }}
    on:removeDuplicates={(e) => {
      if (tableViewRef) {
        // 중복행 제거 다이얼로그 열기
        const openDialog = tableViewRef.openRemoveDuplicatesDialog;
        if (openDialog) {
          openDialog(e.detail.columns);
        }
      }
    }}
  />
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
    gap: 0;
  }

  .view-wrapper.with-split {
    flex-direction: row;
  }

  .primary-pane {
    flex: 1;
    min-width: 0;
    position: relative;
  }

  .secondary-pane {
    width: 38%;
    min-width: 320px;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
  }

  @media (max-width: 1400px) {
    .secondary-pane {
      width: 45%;
    }
  }

  @media (max-width: 1100px) {
    .view-wrapper.with-split {
      flex-direction: column;
    }
    .secondary-pane {
      width: 100%;
      min-height: 40%;
      border-left: none;
      border-top: 1px solid var(--border);
    }
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

  .recent-files {
    margin-top: 2rem;
    width: 100%;
    max-width: 600px;
  }

  .recent-files h3 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 1rem 0;
    text-align: left;
  }

  .recent-files-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .recent-file-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    border-radius: 8px;
    transition: all 0.2s;
    width: 100%;
    overflow: hidden;
  }

  .recent-file-item:hover:not(:has(.recent-file-remove:hover)) {
    background: var(--bg-tertiary);
    /* border-color: var(--text-secondary); */
  }

  .recent-file-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    flex: 1;
    min-width: 0;
    transition: all 0.2s;
  }

  .recent-file-button:hover {
    background: transparent;
  }

  .recent-file-button .material-icons {
    font-size: 20px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .recent-file-button .file-name {
    font-weight: 500;
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-file-button .file-path {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    flex: 2;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-file-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    margin-right: 0.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: 16px;
    transition: all 0.2s;
    flex-shrink: 0;
    color: var(--border);
  }

  .recent-file-remove:hover {
    /* background: var(--bg-tertiary); */
    color: var(--text-secondary);
  }

  .recent-file-remove .material-icons {
    font-size: 18px;
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

