<script lang="ts">
import { createEventDispatcher } from 'svelte';

type ImportChoice = 'merge' | 'new-tab' | 'cancel';

export let open = false;
export let fileName = '';
export let canMerge = false;

const dispatch = createEventDispatcher<{ select: ImportChoice }>();

function handleSelect(choice: ImportChoice) {
  dispatch('select', choice);
}
</script>

{#if open}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="dialog">
      <h3>파일 가져오기</h3>
      <p>
        {#if canMerge}
          <strong>{fileName}</strong> 파일을 현재 탭에 병합할까요?<br />
          새 탭으로 열 수도 있습니다.
        {:else}
          <strong>{fileName}</strong> 파일을 새 탭으로 열 수 있습니다.
        {/if}
      </p>
      <div class="buttons">
        {#if canMerge}
          <button class="btn btn-primary" on:click={() => handleSelect('merge')}>
            현재 탭에 병합
          </button>
        {/if}
        <button class="btn btn-secondary" on:click={() => handleSelect('new-tab')}>
          새 탭으로 열기
        </button>
        <button class="btn btn-ghost" on:click={() => handleSelect('cancel')}>
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
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 12000;
}

.dialog {
  background: var(--bg-primary);
  border-radius: 12px;
  padding: 1.5rem;
  width: min(420px, 90vw);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.25);
}

.dialog h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.dialog p {
  margin: 0 0 1.25rem 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
  line-height: 1.5;
}

.buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.btn {
  border: none;
  border-radius: 8px;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-secondary:hover {
  background: var(--bg-tertiary);
}

.btn-ghost:hover {
  background: var(--bg-secondary);
}
</style>

