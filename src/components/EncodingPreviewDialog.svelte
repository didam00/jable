<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { EncodingOption } from '../agents/import-export/encoding';

  export let open = false;
  export let fileName = '';
  export let options: EncodingOption[] = [];
  export let detectedEncoding: string | null = null;
  export let detectedConfidence = 0;
  export let selectedEncoding = 'utf-8';
  export let previewText = '';
  export let isLoading = false;
  export let errorMessage: string | undefined;

  const dispatch = createEventDispatcher<{
    changeEncoding: { encoding: string };
    confirm: void;
    cancel: void;
  }>();

  const formatConfidence = (value: number) => {
    const percent = Math.round((Math.min(Math.max(value, 0), 1)) * 100);
    return `${percent}%`;
  };

  $: detectionLabel = detectedEncoding
    ? `${detectedEncoding.toUpperCase()} · ${formatConfidence(detectedConfidence)}`
    : '감지 실패';

  function handleEncodingChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    dispatch('changeEncoding', { encoding: value });
  }

  function handleConfirm() {
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
        <h3>CSV 인코딩 선택</h3>
        <p class="file-name">{fileName}</p>
      </header>
      <div class="field-row">
        <label for="encoding-select">인코딩</label>
        <select
          id="encoding-select"
          on:change={handleEncodingChange}
          bind:value={selectedEncoding}
          disabled={isLoading}
        >
          {#each options as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
      <p class="hint">자동 감지: {detectionLabel}</p>
      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
      <div class="preview">
        {#if isLoading}
          <div class="preview-loading">미리보기 생성 중...</div>
        {:else if previewText}
          <pre>{previewText}</pre>
        {:else}
          <div class="preview-empty">미리볼 수 있는 내용이 없습니다.</div>
        {/if}
      </div>
      <div class="actions">
        <button class="btn btn-secondary" on:click={handleCancel}>취소</button>
        <button class="btn btn-primary" on:click={handleConfirm} disabled={isLoading}>
          확인
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 13000;
  }

  .dialog {
    width: min(620px, 92vw);
    max-height: 90vh;
    background: var(--bg-primary);
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: 0 20px 55px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .dialog-header .file-name {
    margin: 0.15rem 0 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
    word-break: break-all;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field-row label {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.95rem;
  }

  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.85rem;
  }

  .preview {
    flex: 1;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-secondary);
    min-height: 180px;
    max-height: 320px;
    overflow: hidden;
    display: flex;
  }

  .preview pre {
    margin: 0;
    padding: 1rem;
    font-size: 0.85rem;
    line-height: 1.4;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
    overflow-y: auto;
    flex: 1;
  }

  .preview-loading,
  .preview-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    color: var(--text-secondary);
    padding: 1rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .btn {
    border: none;
    border-radius: 10px;
    padding: 0.55rem 1.25rem;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary {
    background: var(--accent);
    color: #fff;
  }

  .btn-primary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }

  @media (max-width: 520px) {
    .dialog {
      padding: 1.2rem;
    }

    .preview {
      min-height: 140px;
    }
  }
</style>

