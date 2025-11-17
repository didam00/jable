<script lang="ts">
  import { executeFunctionSync, type TransformMode, DELETE_MARKER } from '../utils/safeFunctionExecutor';
  import type { TableData } from '../agents/store';

  export let show: boolean = false;
  export let data: TableData;
  export let selectedColumns: string[] = [];
  export let onApply: (columns: string[], code: string, mode: 'single' | 'array') => void;
  export let onClose: () => void;

  let localSelectedColumns: Set<string> = new Set(selectedColumns);
  let showColumnSelector = false;
  let transformMode: TransformMode = 'single';

  let functionCode = '';
  let errorMessage = '';
  let previewResult: { success: boolean; result?: any; error?: string } | null = null;
  let previewTestValue: string = '';
  let useCustomPreviewValue: boolean = false;


  function toggleColumn(columnKey: string) {
    if (localSelectedColumns.has(columnKey)) {
      localSelectedColumns.delete(columnKey);
    } else {
      localSelectedColumns.add(columnKey);
    }
    localSelectedColumns = localSelectedColumns; // Svelte reactivity
    validateAndPreview();
  }

  function validateAndPreview() {
    errorMessage = '';
    previewResult = null;

    if (!functionCode.trim()) {
      return;
    }

    const columns = Array.from(localSelectedColumns);
    if (columns.length === 0 || !data || data.rows.length === 0) {
      return;
    }

    if (transformMode === 'array') {
      // 배열 변환 모드: 모든 행의 값을 배열로 수집 (미리보기는 처음 5개만)
      const previewRowCount = Math.min(5, data.rows.length);
      const allValues = data.rows.slice(0, previewRowCount).map((row) => {
        if (columns.length === 1) {
          return row.cells[columns[0]]?.value;
        } else {
          const obj: Record<string, any> = {};
          columns.forEach((colKey) => {
            obj[colKey] = row.cells[colKey]?.value;
          });
          return obj;
        }
      });

      const result = executeFunctionSync(
        functionCode,
        allValues,
        undefined,
        { mode: 'array', columns }
      );
      
      // 배열 모드: 삭제된 인덱스를 '제거됨'으로 표시
      if (result.success && Array.isArray(result.result)) {
        const deletedIndexes = result.deletedIndexes || [];
        const deleteSet = new Set(deletedIndexes);
        // 원본 배열의 인덱스를 기준으로 미리보기 배열 생성
        const previewArray = allValues.map((_: any, originalIndex: number) => {
          if (deleteSet.has(originalIndex)) {
            return '제거됨';
          }
          // result.result는 필터링된 배열이므로, 원본 인덱스에서 삭제된 항목 수를 빼서 매핑
          let resultIndex = originalIndex;
          for (let i = 0; i < originalIndex; i++) {
            if (deleteSet.has(i)) {
              resultIndex--;
            }
          }
          return result.result[resultIndex];
        });
        previewResult = {
          success: true,
          result: previewArray
        };
      } else {
        previewResult = result;
      }

      if (!result.success) {
        errorMessage = result.error || '오류가 발생했습니다.';
      }
    } else {
      // 단일 값 변환 모드
      const firstColumn = columns[0];
      
      // 미리보기 테스트 값 결정
      let testValue: any;
      if (useCustomPreviewValue && previewTestValue.trim() !== '') {
        // 사용자 입력 값 사용 (타입 변환 시도)
        const trimmed = previewTestValue.trim();
        // 숫자로 변환 시도
        if (/^-?\d+\.?\d*$/.test(trimmed)) {
          testValue = trimmed.includes('.') ? parseFloat(trimmed) : parseInt(trimmed, 10);
        } else if (trimmed === 'null' || trimmed === '') {
          testValue = null;
        } else if (trimmed === 'true' || trimmed === 'false') {
          testValue = trimmed === 'true';
        } else {
          testValue = trimmed;
        }
      } else {
        // 기본값 사용 (첫 번째 행의 값)
        const firstRow = data.rows[0];
        const cell = firstRow?.cells[firstColumn];
        
        if (!cell) {
          errorMessage = '선택된 열에 데이터가 없습니다.';
          return;
        }
        
        testValue = cell.value ?? null;
      }
      
      // 같은 행의 다른 열 값들을 rowData로 전달 (사용자 정의 값이 아닌 경우에만)
      const rowData: Record<string, any> = {};
      if (!useCustomPreviewValue || previewTestValue.trim() === '') {
        const firstRow = data.rows[0];
        data.columns.forEach((col) => {
          if (col.key !== firstColumn && firstRow?.cells[col.key]) {
            rowData[col.key] = firstRow.cells[col.key].value ?? null;
          }
        });
      }

      const result = executeFunctionSync(
        functionCode, 
        testValue, 
        testValue, 
        { mode: 'single', rowData }
      );
      
      // 삭제된 경우 '제거됨'으로 표시
      if (result.success && (result.isDelete || result.result === DELETE_MARKER)) {
        previewResult = {
          success: true,
          result: '제거됨'
        };
      } else {
        previewResult = result;
      }

      if (!result.success) {
        errorMessage = result.error || '오류가 발생했습니다.';
      }
    }
  }

  function handleApply() {
    if (!functionCode.trim()) {
      errorMessage = '함수 코드를 입력해주세요.';
      return;
    }

    const columns = Array.from(localSelectedColumns);
    if (columns.length === 0) {
      errorMessage = '적용할 열을 선택해주세요.';
      return;
    }

    // 최종 검증
    validateAndPreview();
    if (!previewResult || !previewResult.success) {
      return;
    }

    onApply(columns, functionCode, transformMode);
    functionCode = '';
    errorMessage = '';
    previewResult = null;
    localSelectedColumns.clear();
    transformMode = 'single';
    onClose();
  }

  function handleClose() {
    functionCode = '';
    errorMessage = '';
    previewResult = null;
    localSelectedColumns.clear();
    showColumnSelector = false;
    transformMode = 'single';
    onClose();
  }

  // 다이얼로그가 열릴 때 selectedColumns prop으로 초기화
  let lastShowState = false;
  $: {
    if (show && !lastShowState) {
      // 다이얼로그가 새로 열릴 때만 초기화
      if (selectedColumns.length > 0) {
        localSelectedColumns = new Set(selectedColumns);
      } else {
        localSelectedColumns = new Set();
      }
    }
    lastShowState = show;
  }

  // 다이얼로그 클릭 전파 방지
  function handleDialogClick(event: MouseEvent) {
    event.stopPropagation();
  }

  // 다이얼로그 키보드 이벤트 전파 방지
  function handleDialogKeydown(event: KeyboardEvent) {
    event.stopPropagation();
  }

  // 코드 입력 키 처리 (Tab, Enter)
  function handleCodeKeydown(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      
      if (e.shiftKey) {
        // Shift+Tab: 들여쓰기 제거
        const linesBefore = value.substring(0, start).split('\n');
        const currentLine = linesBefore[linesBefore.length - 1];
        if (currentLine.startsWith('  ')) {
          const newValue = value.substring(0, start - 2) + value.substring(start);
          functionCode = newValue;
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start - 2;
          }, 0);
        }
        return;
      }
      
      // Tab: 들여쓰기 추가 (2칸)
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      functionCode = newValue;
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
      return;
    }
    
    if (e.key === 'Enter' && !e.altKey && !e.metaKey && !e.ctrlKey) {
      // 엔터 입력 후 최신 값 기준 미리보기 수행
      setTimeout(() => {
        validateAndPreview();
      }, 0);
    }
  }

</script>

{#if show}
  <div 
    class="dialog-overlay" 
    role="presentation"
    on:keydown={(e) => e.key === 'Escape' && handleClose()}
  >
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="dialog" 
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      tabindex="-1"
      on:click|stopPropagation={handleDialogClick}
      on:keydown|stopPropagation={handleDialogKeydown}
    >
      <div class="dialog-header">
        <h3 id="dialog-title">열 변환 함수 적용</h3>
        <button class="close-btn" on:click={handleClose} title="닫기">
          <span class="material-icons">close</span>
        </button>
      </div>

      <div class="dialog-content">
        {#if errorMessage}
          <div class="error-banner">{errorMessage}</div>
        {/if}
        <div class="section">
          <div class="section-header">
            <div class="label">선택된 열 ({Array.from(localSelectedColumns).length}개)</div>
            <button class="toggle-selector-btn" on:click={() => (showColumnSelector = !showColumnSelector)}>
              <span class="material-icons">{showColumnSelector ? 'expand_less' : 'expand_more'}</span>
              {showColumnSelector ? '숨기기' : '열 선택'}
            </button>
          </div>
          <div class="selected-columns">
            {#each Array.from(localSelectedColumns) as colKey}
              <span class="column-tag">
                {colKey}
                <button class="remove-column-btn" on:click={() => toggleColumn(colKey)}>
                  <span class="material-icons">close</span>
                </button>
              </span>
            {/each}
          </div>
          {#if showColumnSelector && data && data.columns.length > 0}
            <div class="column-selector">
              {#each data.columns as col}
                {@const isSelected = localSelectedColumns.has(col.key)}
                <button
                  class="column-option {isSelected ? 'selected' : ''}"
                  on:click={() => toggleColumn(col.key)}
                >
                  <span class="material-icons">{isSelected ? 'check_box' : 'check_box_outline_blank'}</span>
                  <span>{col.label || col.key}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <div class="section">
          <div class="label">변환 모드</div>
          <div class="mode-selector">
            <button
              class="mode-btn {transformMode === 'single' ? 'active' : ''}"
              on:click={() => { transformMode = 'single'; validateAndPreview(); }}
            >
              <span class="mode-top">
                <span class="material-icons">edit</span>
                <span>단일 값 변환</span>
              </span>
              <span class="mode-desc">각 셀을 개별적으로 변환 (a 변수 사용)</span>
            </button>
            <button
              class="mode-btn {transformMode === 'array' ? 'active' : ''}"
              on:click={() => { transformMode = 'array'; validateAndPreview(); }}
            >
              <span class="mode-top">
                <span class="material-icons">list</span>
                <span>배열 변환</span>
              </span>
              <span class="mode-desc">전체 열을 배열로 변환 (list 변수 사용)</span>
            </button>
          </div>
          {#if transformMode === 'array'}
            <div class="mode-info">
              <span class="material-icons">info</span>
              <div>
                {#if Array.from(localSelectedColumns).length === 1}
                  <p><code>list</code>는 선택된 열의 모든 값 배열입니다: <code>타입[]</code></p>
                  <p>리턴값도 배열이어야 합니다: <code>return list.map(...)</code></p>
                {:else}
                  <p><code>list</code>는 선택된 열들의 객체 배열입니다: <code>{'{'}{Array.from(localSelectedColumns).map(c => `${c}: 타입`).join(', ')}{'}'}[]</code></p>
                  <p>리턴값도 같은 형식의 객체 배열이어야 합니다: <code>return list.map((val) => {'{'}{Array.from(localSelectedColumns).map(c => `${c}: val.${c}`).join(', ')}{'}'})</code></p>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <div class="section">
          <label for="function-code-input" class="label">함수 코드</label>
          <textarea
            id="function-code-input"
            class="code-input"
            bind:value={functionCode}
            placeholder={
              transformMode === 'array'
                ? Array.from(localSelectedColumns).length === 1
                  ? '예: list.map(val => val * 2)'
                  : `예: list.map((val) => { return {${Array.from(localSelectedColumns).map(c => `${c}: val.${c}`).join(', ')}}; })`
                : '예: a * 2'
            }
            rows="4"
            on:keydown={handleCodeKeydown}
            on:blur={validateAndPreview}
          ></textarea>
          <div class="section">
            <div class="label">미리보기</div>
            {#if previewResult}
              {#if previewResult.success}
                <div class="preview success">
                  <span class="preview-label">결과:</span>
                  <code class="preview-value">{JSON.stringify(previewResult.result)}</code>
                </div>
              {:else}
                <div class="preview error">
                  <span class="preview-label">오류:</span>
                  <span class="preview-error">{previewResult.error}</span>
                </div>
              {/if}
            {:else}
              <div class="preview success">
                <span class="preview-value">-</span>
              </div>
            {/if}
          </div>
          <div class="hint">
            <span class="material-icons">info</span>
            <span>
              {#if transformMode === 'array'}
                <code>list</code> 변수를 사용하여 변환하세요. 리턴값은 배열이어야 합니다. <code>void</code> 또는 <code>undefined</code> 반환으로 행 삭제 가능.
              {:else}
                <code>a</code> 변수를 사용하여 변환하세요. 같은 행의 다른 열 값은 <code>$column-name</code> 형식으로 참조할 수 있습니다. 한 줄이면 return 생략 가능, 여러 줄이면 return 필요. <code>return;</code> 또는 <code>return undefined;</code>로 행 삭제. 반환값이 없으면 기존값 유지.
              {/if}
            </span>
          </div>
          <div class="hint" style="margin-top: 0.5rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 4px;">
            <span class="material-icons">help_outline</span>
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 0.25rem;">특수 기능:</div>
              <div style="font-size: 0.8125rem; line-height: 1.6;">
                <p>• 단일 값 모드: <code>return;</code> 또는 <code>return undefined;</code>로 행 삭제</p>
                <p>• 배열 모드: <code>void</code> 또는 <code>undefined</code> 반환으로 행 삭제</p>
                <p>• 반환값 없음: 기존값 유지 (단일 값 모드)</p>
                <p>• 빈 값: <code>null</code>로 저장 (<code>column=null</code>은 비어있음, <code>column="null"</code>은 문자열 'null')</p>
                <p>• 예시: <code>if (a {'<'} 10) {'{'} return; {'}'}</code> - 10 미만인 행 삭제</p>
                <p>• 예시: <code>if (a === null) {'{'} return; {'}'}</code> - 결측값 삭제</p>
                <p>• 예시: <code>list.map(v => v {'<'} 10 ? void 0 : v)</code> - 10 미만인 행 삭제 (배열 모드)</p>
              </div>
            </div>
          </div>
        </div>

        {#if transformMode === 'single'}
          <div class="section">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
              <input
                type="checkbox"
                id="custom-preview-checkbox"
                bind:checked={useCustomPreviewValue}
                on:change={validateAndPreview}
              />
              <label for="custom-preview-checkbox" class="label" style="margin: 0; cursor: pointer;">
                테스트 값 직접 입력
              </label>
            </div>
            {#if useCustomPreviewValue}
              <input
                type="text"
                class="code-input"
                style="width: 100%; padding: 0.5rem; margin-bottom: 0.5rem;"
                bind:value={previewTestValue}
                on:input={validateAndPreview}
                placeholder="테스트할 값을 입력하세요 (예: 20000, null, true)"
              />
            {/if}
          </div>
        {/if}
      </div>

      <div class="dialog-footer">
        <button class="btn-secondary" on:click={handleClose}>취소</button>
        <button class="btn-primary" on:click={handleApply} disabled={!functionCode.trim() || !previewResult?.success}>
          적용
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .dialog {
    background: var(--bg-primary);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .close-btn:hover {
    background: var(--bg-secondary);
  }

  .close-btn .material-icons {
    font-size: 20px;
    color: var(--text-secondary);
  }

  .dialog-content {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .section {
    margin-bottom: 1.5rem;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .toggle-selector-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
    color: var(--accent);
    transition: background 0.2s;
    border-radius: 4px;
  }

  .toggle-selector-btn:hover {
    background: var(--bg-secondary);
  }

  .toggle-selector-btn .material-icons {
    font-size: 18px;
  }

  .selected-columns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .column-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    background: var(--bg-secondary);
    border-radius: 4px;
    font-size: 0.8125rem;
    color: var(--text-primary);
  }

  .remove-column-btn {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 50%;
    transition: background 0.2s;
  }

  .remove-column-btn:hover {
    background: var(--bg-tertiary);
  }

  .remove-column-btn .material-icons {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .column-selector {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 6px;
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .column-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    text-align: left;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .column-option:hover {
    background: var(--bg-tertiary);
  }

  .column-option.selected {
    background: rgba(0, 113, 227, 0.1);
  }

  .column-option .material-icons {
    font-size: 20px;
    color: var(--text-secondary);
  }

  .column-option.selected .material-icons {
    color: var(--accent);
  }

  .mode-selector {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    margin-top: 0.25rem;
  }

  .mode-top {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    & .material-icons {
      font-size: 1rem !important;
    }
  }

  .mode-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    background: var(--bg-primary);
    transition: all 0.2s;
    cursor: pointer;
  }

  .mode-btn:hover {
    border-color: var(--accent);
    background: var(--bg-secondary);
  }

  .mode-btn.active {
    border-color: var(--accent);
    background: rgba(0, 113, 227, 0.1);
  }

  .mode-btn .material-icons {
    font-size: 24px;
    color: var(--accent);
  }

  .mode-btn span:not(.material-icons):not(.mode-desc) {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .mode-desc {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .mode-info {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 6px;
    margin-top: 0.75rem;
    font-size: 0.8125rem;
  }

  .mode-info .material-icons {
    font-size: 20px;
    color: var(--accent);
    flex-shrink: 0;
  }

  .mode-info div {
    flex: 1;
  }

  .mode-info p {
    margin: 0.25rem 0;
    color: var(--text-secondary);
  }

  .mode-info code {
    background: var(--bg-tertiary);
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-family: 'Cascadia Code', monospace;
    font-size: 0.75rem;
  }

  .code-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: 'Cascadia Code', monospace;
    font-size: 0.875rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    resize: vertical;
    margin-top: 0.25rem;
  }

  .code-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .hint {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .hint .material-icons {
    font-size: 16px;
  }

  .preview {
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .preview.success {
    background: var(--bg-secondary);
  }

  .preview.error {
    background: rgba(255, 59, 48, 0.1);
    color: var(--error);
  }

  .error-banner {
    background: rgba(255, 59, 48, 0.15);
    color: var(--error);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
  }

  .preview-label {
    font-weight: 700;
    /* margin-right: 0.25rem; */
  }

  .preview-value {
    font-family: 'Cascadia Code', monospace;
  }

  .preview-error {
    color: var(--error);
  }


  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border);
  }

  .btn-secondary,
  .btn-primary {
    padding: 0.5rem 1.5rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .btn-secondary:hover {
    background: var(--bg-tertiary);
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
</style>

