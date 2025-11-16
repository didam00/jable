<script lang="ts">
  export let show = false;
  export let onConfirm: (merge: boolean) => void = () => {};

  function handleConfirm(merge: boolean) {
    onConfirm(merge);
    show = false;
  }
</script>

{#if show}
  <div class="overlay" on:click={() => handleConfirm(false)}>
    <div class="dialog" on:click|stopPropagation>
      <h3>파일 병합</h3>
      <p>이미 데이터가 열려있습니다. 어떻게 하시겠습니까?</p>
      <div class="buttons">
        <button class="btn btn-primary" on:click={() => handleConfirm(true)}>
          병합하기
        </button>
        <button class="btn btn-secondary" on:click={() => handleConfirm(false)}>
          교체하기
        </button>
        <button class="btn btn-cancel" on:click={() => handleConfirm(false)}>
          취소
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog {
    background: var(--bg-primary);
    border-radius: 12px;
    padding: 1.5rem;
    min-width: 320px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .dialog h3 {
    margin: 0 0 0.75rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .dialog p {
    margin: 0 0 1.5rem 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover {
    background: var(--accent-hover);
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--bg-tertiary);
  }

  .btn-cancel {
    background: transparent;
    color: var(--text-secondary);
  }

  .btn-cancel:hover {
    background: var(--bg-secondary);
  }
</style>

