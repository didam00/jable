<script lang="ts">
  import { settingsStore } from '../agents/settings/settings';
  import type { AppSettings } from '../agents/settings/settings';

  export let isOpen: boolean = false;
  export let onClose: () => void = () => {};

  let settings: AppSettings = {
    maxHistorySize: 50,
    maxVisibleRows: 50,
    bufferRows: 25,
    historyDelay: 500,
  };

  $: settingsStore.subscribe((value) => {
    settings = { ...value };
  })();

  function handleSave() {
    settingsStore.set(settings);
    onClose();
  }

  function handleReset() {
    settingsStore.reset();
  }

  function handleCancel() {
    // 설정을 원래대로 복원
    settingsStore.subscribe((value) => {
      settings = { ...value };
    })();
    onClose();
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }
</script>

{#if isOpen}
  <div
    class="settings-overlay"
    role="presentation"
    tabindex="-1"
    on:click={handleOverlayClick}
    on:keydown={(e) => e.key === 'Escape' && handleCancel()}
  >
    <div
      class="settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="설정"
      tabindex="-1"
    >
      <div class="settings-header">
        <h2>설정</h2>
        <button class="close-btn" on:click={handleCancel} title="닫기">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="settings-content">
        <div class="settings-group">
          <label class="settings-label">
            <span>최대 히스토리 개수</span>
            <input
              type="number"
              min="1"
              max="200"
              bind:value={settings.maxHistorySize}
              class="settings-input"
            />
          </label>
          <p class="settings-description">Undo/Redo 기능에서 저장할 최대 히스토리 개수입니다.</p>
        </div>

        <div class="settings-group">
          <label class="settings-label">
            <span>최대 표시 행 개수</span>
            <input
              type="number"
              min="10"
              max="200"
              bind:value={settings.maxVisibleRows}
              class="settings-input"
            />
          </label>
          <p class="settings-description">가상 스크롤링에서 한 번에 표시할 최대 행 개수입니다.</p>
        </div>

        <div class="settings-group">
          <label class="settings-label">
            <span>버퍼 행 개수</span>
            <input
              type="number"
              min="5"
              max="100"
              bind:value={settings.bufferRows}
              class="settings-input"
            />
          </label>
          <p class="settings-description">스크롤 시 위/아래에 미리 로드할 행 개수입니다.</p>
        </div>

        <div class="settings-group">
          <label class="settings-label">
            <span>히스토리 추가 지연 시간 (ms)</span>
            <input
              type="number"
              min="0"
              max="2000"
              step="100"
              bind:value={settings.historyDelay}
              class="settings-input"
            />
          </label>
          <p class="settings-description">연속된 변경을 묶어서 히스토리에 추가하기 위한 지연 시간입니다.</p>
        </div>
      </div>
      <div class="settings-footer">
        <button class="btn btn-secondary" on:click={handleReset}>기본값으로 재설정</button>
        <div class="btn-group">
          <button class="btn btn-secondary" on:click={handleCancel}>취소</button>
          <button class="btn btn-primary" on:click={handleSave}>저장</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  }

  .settings-dialog {
    background: var(--bg-primary);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .settings-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    transition: background 0.2s;
  }

  .close-btn .material-icons {
    font-size: 20px;
    color: var(--text-secondary);
  }

  .close-btn:hover {
    background: var(--bg-tertiary);
  }

  .close-btn:hover .material-icons {
    color: var(--text-primary);
  }

  .settings-content {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .settings-group {
    margin-bottom: 2rem;
  }

  .settings-group:last-child {
    margin-bottom: 0;
  }

  .settings-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .settings-input {
    width: 120px;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .settings-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .settings-description {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .settings-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border);
  }

  .btn-group {
    display: flex;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-tertiary);
  }
</style>

