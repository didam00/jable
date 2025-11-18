<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { EncodingOption } from '../agents/import-export/encoding';

  export let open = false;
  export let fileName = '';
  export let directoryPath = '';
  export let encoding = 'utf-8';
  export let format: 'json' | 'csv' | 'xml' | 'toon' = 'json';
  export let encodingOptions: EncodingOption[] = [];
  export let canBrowseDirectory = false;

  const dispatch = createEventDispatcher<{
    changeFileName: { value: string };
    changeDirectory: { value: string };
    changeEncoding: { value: string };
    browseDirectory: void;
    confirm: void;
    cancel: void;
  }>();

  const formatLabels: Record<'json' | 'csv' | 'xml' | 'toon', string> = {
    json: 'JSON',
    csv: 'CSV',
    xml: 'XML',
    toon: 'TOON',
  };

  $: confirmDisabled = !fileName.trim() || (canBrowseDirectory && !directoryPath.trim());

  function handleFileNameInput(event: Event) {
    dispatch('changeFileName', { value: (event.target as HTMLInputElement).value });
  }

  function handleDirectoryInput(event: Event) {
    dispatch('changeDirectory', { value: (event.target as HTMLInputElement).value });
  }

  function handleEncodingChange(event: Event) {
    dispatch('changeEncoding', { value: (event.target as HTMLSelectElement).value });
  }

  function handleRequestBrowse() {
    if (!canBrowseDirectory) {
      return;
    }
    dispatch('browseDirectory');
  }

  function handleConfirm() {
    if (confirmDisabled) {
      return;
    }
    dispatch('confirm');
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

{#if open}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="dialog">
      <header class="dialog-header">
        <h3>다른 이름으로 저장</h3>
        <p class="subtitle">형식: {formatLabels[format]}</p>
      </header>
      <div class="field">
        <label for="file-name-input">파일 이름</label>
        <input
          id="file-name-input"
          type="text"
          value={fileName}
          on:input={handleFileNameInput}
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <div class="field">
        <label for="directory-input">
          저장 경로
          {#if !canBrowseDirectory}
            <span class="hint">(브라우저 기본 다운로드 경로)</span>
          {/if}
        </label>
        <div class="directory-row">
          <input
            id="directory-input"
            type="text"
            value={directoryPath}
            on:input={handleDirectoryInput}
            placeholder={canBrowseDirectory ? '경로를 선택하세요' : ''}
            readonly={!canBrowseDirectory}
          />
          {#if canBrowseDirectory}
            <button type="button" class="browse-btn" on:click={handleRequestBrowse}>
              찾아보기
            </button>
          {/if}
        </div>
      </div>
      <div class="field">
        <label for="encoding-select">인코딩</label>
        <select id="encoding-select" on:change={handleEncodingChange} value={encoding}>
          {#each encodingOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary" on:click={handleCancel}>
          취소
        </button>
        <button type="button" class="btn btn-primary" on:click={handleConfirm} disabled={confirmDisabled}>
          저장
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1200;
    padding: 1.5rem;
  }

  .dialog {
    width: min(500px, 100%);
    background: var(--bg-primary);
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  label {
    font-size: 0.85rem;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  input,
  select {
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-radius: 10px;
    padding: 0.55rem 0.75rem;
    font-size: 0.95rem;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
  }

  .directory-row {
    display: flex;
    gap: 0.5rem;
  }

  .directory-row input {
    flex: 1;
  }

  .browse-btn {
    padding: 0.55rem 0.9rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    cursor: pointer;
  }

  .browse-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .btn {
    border: none;
    border-radius: 999px;
    padding: 0.55rem 1.25rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
</style>

