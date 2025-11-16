<script lang="ts">
  import { dataStore } from '../agents/store';
  import { exportToJSON, parseJSON } from '../agents/parser';
  import { compressToToon, decompressFromToon } from '../agents/compression/toon';
  import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from '../agents/compression/lzString';
  import type { TableData } from '../agents/store';
  import { onMount, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    navigateToCell: { rowId: string; columnKey: string };
    navigateToColumn: { columnKey: string };
    navigateToRow: { rowId: string };
  }>();

  let data: TableData = {
    columns: [],
    rows: [],
    metadata: { rowCount: 0, columnCount: 0, isFlat: true },
  };

  let displayFormat: 'toon' | 'json' | 'compressed' = 'toon';
  let jsonString = '';
  let compressedString = '';
  let editorContent = '';
  let error: string | null = null;
  let textarea: HTMLTextAreaElement;
  let updateTimeout: ReturnType<typeof setTimeout> | null = null;
  let isUpdatingFromStore = false;
  let isLoading = false;
  let isRendering = false;
  let lastDataHash = '';
  let isInitialized = false;
  let compressedLength = 0;
  let exceedsUrlLimit = false;
  const URL_CHAR_LIMIT = 2000;

  // 데이터 해시 계산 (간단한 버전)
  function calculateDataHash(data: TableData): string {
    return `${data.metadata.rowCount}-${data.metadata.columnCount}-${data.columns.length}-${data.rows.length}`;
  }

  onMount(() => {
    const unsubscribe = dataStore.subscribe((value) => {
      data = value;
      if (!isUpdatingFromStore) {
        const currentHash = calculateDataHash(value);
        // 데이터가 실제로 변경되었을 때만 업데이트
        if (currentHash !== lastDataHash || !isInitialized) {
          lastDataHash = currentHash;
          isInitialized = true;
          updateJSON();
        }
      }
    });

    return unsubscribe;
  });

  async function updateJSON() {
    if (isLoading || isRendering) return;

    try {
      isLoading = true;
      error = null;

      let content = '';

      const toonContent = await new Promise<string>((resolve) => {
        requestIdleCallback(() => {
          const result = compressToToon(data);
          resolve(result);
        }, { timeout: 100 });
      });

      if (displayFormat === 'json') {
        content = await new Promise<string>((resolve) => {
          requestIdleCallback(() => {
            resolve(exportToJSON(data));
          }, { timeout: 100 });
        });
        jsonString = content;
      } else if (displayFormat === 'compressed') {
        const compressed = compressToEncodedURIComponent(toonContent);
        compressedLength = compressed.length;
        exceedsUrlLimit = compressedLength > URL_CHAR_LIMIT;
        compressedString = formatCompressedForDisplay(compressed);
        content = compressedString;
      } else {
        content = toonContent;
      }

      editorContent = content;

      // 텍스트 렌더링도 청크 단위로 처리
      if (textarea && content) {
        isUpdatingFromStore = true;
        await renderTextChunked(content);
        isUpdatingFromStore = false;
      }
      
      isLoading = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
      isLoading = false;
    }
  }
  
  // displayFormat 변경 시 업데이트
  $: if (displayFormat !== undefined) {
    updateJSON();
  }

  async function renderTextChunked(text: string) {
    if (isRendering || !textarea) return;
    
    isRendering = true;
    const CHUNK_SIZE = 50000; // 약 50KB씩 처리
    
    if (text.length <= CHUNK_SIZE) {
      // 작은 텍스트는 즉시 렌더링
      textarea.value = text;
      isRendering = false;
      return;
    }
    
    // 큰 텍스트는 청크 단위로 렌더링
    textarea.value = ''; // 먼저 초기화
    
    let currentPos = 0;
    
    const renderChunk = (): Promise<void> => {
      return new Promise((resolve) => {
        requestIdleCallback(() => {
          const chunk = text.substring(currentPos, currentPos + CHUNK_SIZE);
          textarea.value += chunk;
          currentPos += CHUNK_SIZE;
          
          if (currentPos < text.length) {
            // 다음 청크를 약간의 지연 후 처리 (UI 반응성 유지)
            setTimeout(() => {
              renderChunk().then(resolve);
            }, 10);
          } else {
            isRendering = false;
            resolve();
          }
        }, { timeout: 50 });
      });
    };
    
    await renderChunk();
  }

  // 하이라이트 함수들 비활성화 - 성능 최적화
  // 하이라이트 기능이 렌더링 성능에 큰 영향을 주므로 제거됨

  // 하이라이트 기능 비활성화 - 성능 최적화


  function handleInput() {
    if (isUpdatingFromStore) return;

    const inputValue = editorContent;

    try {
      if (displayFormat === 'toon') {
        // TOON 형식 파싱
        try {
          const tableData = decompressFromToon(inputValue);
          error = null;
          const compressed = compressToEncodedURIComponent(inputValue);
          compressedString = formatCompressedForDisplay(compressed);
          compressedLength = compressed.length;
          exceedsUrlLimit = compressedLength > URL_CHAR_LIMIT;

          // 테이블 데이터로 업데이트
          if (updateTimeout) {
            clearTimeout(updateTimeout);
          }
          updateTimeout = setTimeout(() => {
            try {
              isUpdatingFromStore = true;
              dataStore.set(tableData);
              setTimeout(() => {
                isUpdatingFromStore = false;
              }, 0);
            } catch (e) {
              console.warn('Failed to update table data:', e);
            }
          }, 500); // 500ms 디바운스
        } catch (e) {
          error = e instanceof Error ? e.message : 'Invalid TOON format';
        }
      } else if (displayFormat === 'compressed') {
        const normalized = inputValue.replace(/\s+/g, '');
        const toonPayload = decompressFromEncodedURIComponent(normalized);
        const tableData = decompressFromToon(toonPayload);
        error = null;
        compressedLength = normalized.length;
        exceedsUrlLimit = compressedLength > URL_CHAR_LIMIT;
        compressedString = formatCompressedForDisplay(normalized);

        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }

        updateTimeout = setTimeout(() => {
          try {
            isUpdatingFromStore = true;
            dataStore.set(tableData);
            setTimeout(() => {
              isUpdatingFromStore = false;
            }, 0);
          } catch (e) {
            console.warn('Failed to update table data:', e);
          }
        }, 500);
      } else {
        // JSON 형식 파싱
        JSON.parse(inputValue); // 유효성 검사만
        error = null;
        jsonString = inputValue;

        // JSON이 유효하면 테이블 데이터로 파싱 및 업데이트
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }
        updateTimeout = setTimeout(() => {
          try {
            const tableData = parseJSON(jsonString);
            isUpdatingFromStore = true;
            dataStore.set(tableData);
            setTimeout(() => {
              isUpdatingFromStore = false;
            }, 0);
          } catch (e) {
            // 파싱 실패는 이미 error로 표시됨
            console.warn('Failed to update table data:', e);
          }
        }, 500); // 500ms 디바운스
      }
    } catch (e) {
      error = e instanceof Error ? e.message : `Invalid ${displayFormat.toUpperCase()}`;
    }
  }

  function handleScroll() {
    // 하이라이트 비활성화로 스크롤 처리 불필요
  }


  function formatCompressedForDisplay(compressed: string): string {
    return compressed.match(/.{1,80}/g)?.join('\n') ?? compressed;
  }


  function handleContextMenu(event: MouseEvent) {
    if (!textarea || !data) return;
    
    event.preventDefault();
    const selectionStart = textarea.selectionStart;
    const text = textarea.value;
    
    // 선택된 텍스트나 커서 위치의 값을 찾기
    const { value, path } = extractValueAtPosition(text, selectionStart);
    
    if (!value || !path) return;
    
    // path에서 rowId와 columnKey 찾기
    const location = findLocationInTable(path, value, data);
    
    if (location) {
      // 컨텍스트 메뉴 표시 대신 바로 네비게이션
      if (location.type === 'cell') {
        dispatch('navigateToCell', { rowId: location.rowId, columnKey: location.columnKey });
      } else if (location.type === 'column') {
        dispatch('navigateToColumn', { columnKey: location.columnKey });
      } else if (location.type === 'row') {
        dispatch('navigateToRow', { rowId: location.rowId });
      }
    }
  }

  function extractValueAtPosition(json: string, position: number): { value: any; path: string[] } | { value: null; path: null } {
    try {
      // 위치 주변의 텍스트 추출
      const beforePos = json.substring(0, position);
      const afterPos = json.substring(position);
      
      // 현재 위치가 문자열 안에 있는지 확인
      let inString = false;
      let escaped = false;
      let stringStart = -1;
      
      for (let i = 0; i < beforePos.length; i++) {
        const char = beforePos[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          if (inString) {
            // 문자열 끝
            inString = false;
            stringStart = -1;
          } else {
            // 문자열 시작
            inString = true;
            stringStart = i;
          }
        }
      }
      
      if (inString && stringStart !== -1) {
        // 문자열 안에 있음
        const stringEnd = beforePos.length + afterPos.indexOf('"');
        const stringValue = json.substring(stringStart + 1, stringEnd);
        
        // 경로 찾기 - 이전에 나온 키들 추출
        const beforeString = beforePos.substring(0, stringStart);
        const path = extractPath(beforeString);
        
        return { value: stringValue, path };
      }
      
      // 숫자나 boolean, null 찾기
      const match = afterPos.match(/^([-]?\d+(?:\.\d+)?|true|false|null)/);
      if (match) {
        const beforeValue = beforePos;
        const path = extractPath(beforeValue);
        let value: any = match[1];
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (value === 'null') value = null;
        else if (!isNaN(Number(value))) value = Number(value);
        
        return { value, path };
      }
      
      return { value: null, path: null };
    } catch {
      return { value: null, path: null };
    }
  }

  function extractPath(jsonBefore: string): string[] {
    const path: string[] = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let currentKey = '';
    let expectingKey = true;
    
    for (let i = 0; i < jsonBefore.length; i++) {
      const char = jsonBefore[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        if (inString) {
          // 문자열 끝
          if (expectingKey) {
            path.push(currentKey);
            currentKey = '';
            expectingKey = false;
          }
          inString = false;
        } else {
          // 문자열 시작
          inString = true;
        }
        continue;
      }
      
      if (inString) {
        if (expectingKey) {
          currentKey += char;
        }
        continue;
      }
      
      if (char === '{') {
        depth++;
        expectingKey = true;
      } else if (char === '}') {
        depth--;
      } else if (char === '[') {
        depth++;
        // 배열 인덱스 추가
        const arrayIndex = extractArrayIndex(jsonBefore, i);
        if (arrayIndex !== null) {
          path.push(String(arrayIndex));
        }
      } else if (char === ']') {
        depth--;
      } else if (char === ':' && !expectingKey) {
        expectingKey = false;
      } else if (char === ',' && !expectingKey) {
        expectingKey = true;
      }
    }
    
    return path;
  }

  function extractArrayIndex(json: string, bracketPos: number): number | null {
    // '[' 이전의 배열 요소 개수 세기
    let count = 0;
    let depth = 0;
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < bracketPos; i++) {
      const char = json[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === '[') {
        depth++;
      } else if (char === ']') {
        depth--;
      } else if (char === ',' && depth === 1) {
        count++;
      }
    }
    
    return count;
  }

  function findLocationInTable(path: string[], value: any, tableData: TableData): 
    { type: 'cell'; rowId: string; columnKey: string } | 
    { type: 'column'; columnKey: string } | 
    { type: 'row'; rowId: string } | null {
    
    if (!path || path.length === 0) return null;
    
    // path가 배열 인덱스를 포함하는 경우 (예: ["users", "0", "name"])
    if (path.length >= 2 && !isNaN(Number(path[1]))) {
      const rowIndex = Number(path[1]);
      if (rowIndex >= 0 && rowIndex < tableData.rows.length) {
        const row = tableData.rows[rowIndex];
        
        // 나머지 path가 컬럼 키를 나타내는지 확인
        if (path.length >= 3) {
          // 중첩 키 (예: "users.0.name" -> ["users", "0", "name"])
          const columnKey = path.slice(2).join('.');
          const foundColumn = tableData.columns.find(col => col.key === columnKey || col.key.endsWith(`.${columnKey}`));
          
          if (foundColumn) {
            return { type: 'cell', rowId: row.id, columnKey: foundColumn.key };
          }
        }
        
        // 행으로만 찾기
        return { type: 'row', rowId: row.id };
      }
    }
    
    // path가 컬럼 키를 직접 나타내는 경우
    const columnKey = path.join('.');
    const foundColumn = tableData.columns.find(col => {
      return col.key === columnKey || 
             col.key.endsWith(`.${columnKey}`) ||
             col.key.split('.').pop() === columnKey;
    });
    
    if (foundColumn) {
      // 값이 일치하는 행 찾기
      const matchingRow = tableData.rows.find(row => {
        const cell = row.cells[foundColumn.key];
        return cell && JSON.stringify(cell.value) === JSON.stringify(value);
      });
      
      if (matchingRow) {
        return { type: 'cell', rowId: matchingRow.id, columnKey: foundColumn.key };
      }
      
      return { type: 'column', columnKey: foundColumn.key };
    }
    
    return null;
  }
</script>


<div class="raw-view">
  <div class="raw-toolbar">
    <div class="format-selector">
      <button
        class="format-btn"
        class:active={displayFormat === 'toon'}
        on:click={() => { displayFormat = 'toon'; }}
        title="TOON 형식 (압축, 빠름)"
      >
        TOON
      </button>
      <button
        class="format-btn"
        class:active={displayFormat === 'json'}
        on:click={() => { displayFormat = 'json'; }}
        title="JSON 형식 (읽기 쉬움)"
      >
        JSON
      </button>
      <button
        class="format-btn"
        class:active={displayFormat === 'compressed'}
        on:click={() => { displayFormat = 'compressed'; }}
        title="압축 문자열 (URL 공유)"
      >
        Compressed
      </button>
    </div>
    {#if displayFormat === 'compressed'}
      <span class="hint">
        {compressedLength.toLocaleString()} chars
        {#if exceedsUrlLimit}
          · {URL_CHAR_LIMIT}자 초과 (쿼리 공유 시 잘릴 수 있음)
        {:else}
          · URL 공유 가능
        {/if}
      </span>
    {/if}
    {#if error}
      <span class="error">{error}</span>
    {/if}
  </div>
  <div class="json-editor-wrapper">
    <pre class="json-highlight" aria-hidden="true"></pre>
    <textarea
      class="json-editor"
      bind:this={textarea}
      bind:value={editorContent}
      on:input={handleInput}
      on:scroll={handleScroll}
      on:contextmenu={handleContextMenu}
      spellcheck={false}
    ></textarea>
  </div>
</div>

<style>
  .raw-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
  }

  .raw-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .format-selector {
    display: flex;
    gap: 0.25rem;
    background: var(--bg-primary);
    border-radius: 4px;
    padding: 0.25rem;
  }

  .format-btn {
    padding: 0.25rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .format-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .format-btn.active {
    background: var(--accent);
    color: white;
  }


  .error {
    color: var(--error);
    font-size: 0.875rem;
  }

  .hint {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .json-placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    user-select: none;
  }

  .json-placeholder:hover {
    color: var(--text-primary);
  }

  .json-editor-wrapper {
    position: relative;
    flex: 1;
    overflow: hidden;
  }

  .json-highlight {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    padding: 1rem;
    margin: 0;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    background: var(--bg-primary);
    color: transparent;
    border: none;
    outline: none;
    resize: none;
    tab-size: 2;
    white-space: pre;
    overflow: auto;
    pointer-events: none;
    z-index: 1;
  }

  .json-editor {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 1rem;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    background: transparent;
    color: var(--text-primary);
    border: none;
    outline: none;
    resize: none;
    tab-size: 2;
    white-space: pre;
    overflow: auto;
    z-index: 2;
    caret-color: var(--text-primary);
  }

  .json-editor:focus {
    outline: none;
  }

  /* JSON 구문 강조 색상 (CSS 변수로 조정 가능) */
  :global(.json-bracket),
  :global(.json-brace) {
    color: var(--json-bracket-color, #808080); /* bracket, brace 색상 */
  }

  :global(.json-key) {
    color: var(--json-key-color, #0451a5); /* key 색상 */
  }

  :global(.json-string) {
    color: var(--json-string-color, #0b8000); /* string 색상 */
  }

  :global(.json-number) {
    color: var(--json-number-color, #098658); /* number 색상 */
  }

  :global(.json-boolean),
  :global(.json-null) {
    color: var(--json-boolean-color, #0451a5); /* boolean, null 색상 */
  }

  :global(.json-colon),
  :global(.json-comma) {
    color: var(--json-punctuation-color, #808080); /* colon, comma 색상 */
  }
</style>
