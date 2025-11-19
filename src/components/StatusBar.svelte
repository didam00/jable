<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import type { EncodingOption } from "../agents/import-export/encoding";

  export let encoding = "utf-8";
  export let options: EncodingOption[] = [];
  export let canChangeEncoding = false;
  export let filteredRows = 0;
  export let totalRows = 0;
  export let searchCount = 0;
  export let hasData = false;
  export let duplicateInfo: {
    columns: string[];
    groups: number;
    totalDuplicates: number;
    isFiltered: boolean;
  } | null = null;

  const dispatch = createEventDispatcher<{
    changeEncoding: { encoding: string };
    findDuplicates: { columns: string[] };
    clearDuplicateFilter: void;
    removeDuplicates: { columns: string[] };
  }>();
  let menuOpen = false;

  function toggleMenu() {
    if (!canChangeEncoding) {
      return;
    }
    menuOpen = !menuOpen;
  }

  function selectEncoding(value: string) {
    menuOpen = false;
    dispatch("changeEncoding", { encoding: value });
  }

  function handleOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest(".encoding-control")) {
      menuOpen = false;
    }
  }

  onMount(() => {
    window.addEventListener("click", handleOutsideClick);
    return () => {
      window.removeEventListener("click", handleOutsideClick);
    };
  });
</script>

<div class="status-bar">
  <button
    type="button"
    class="status-item encoding-control"
    class:clickable={canChangeEncoding}
    on:click|stopPropagation={toggleMenu}
    aria-haspopup="listbox"
    aria-expanded={menuOpen}
    disabled={!canChangeEncoding}
  >
    <span>인코딩</span>
    <strong>{hasData ? encoding?.toUpperCase() : "—"}</strong>
    {#if menuOpen && canChangeEncoding}
      <div class="encoding-menu">
        {#each options as option}
          <button
            class:selected={option.value === encoding}
            on:click|stopPropagation={() => selectEncoding(option.value)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    {/if}
  </button>
  <div class="status-item">
    <span>행</span>
    <strong>
      {#if hasData}
        {filteredRows.toLocaleString()} / {totalRows.toLocaleString()}
      {:else}
        —
      {/if}
    </strong>
  </div>
  <div class="status-item">
    <span>검색</span>
    <strong>{hasData ? searchCount.toLocaleString() : "—"}</strong>
  </div>
  {#if duplicateInfo && duplicateInfo.columns.length > 0 && duplicateInfo.groups > 0}
    <div class="status-item duplicate-info">
      <span>중복</span>
      <strong class="duplicate-count">
        {duplicateInfo.groups}그룹 ({duplicateInfo.totalDuplicates}행)
      </strong>
      {#if duplicateInfo.isFiltered}
        <button
          class="duplicate-action-btn"
          on:click|stopPropagation={() => dispatch('clearDuplicateFilter')}
          title="중복 필터 해제"
        >
          <span class="material-icons">close</span>
        </button>
      {/if}
      <button
        class="duplicate-action-btn"
        on:click|stopPropagation={() => dispatch('removeDuplicates', { columns: duplicateInfo.columns })}
        title="중복행 제거"
      >
        <span class="material-icons">delete_sweep</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    padding: 0.35rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
    font-size: 0.85rem;
  }

  .status-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text-secondary);
    user-select: none;
  }

  .status-item strong {
    color: var(--text-primary);
    font-weight: 600;
    font-size: 0.9rem;
  }

  .encoding-control.clickable {
    cursor: pointer;
  }

  .encoding-control {
    border: none;
    background: transparent;
    padding: 0;
    font: inherit;
  }

  .encoding-control.clickable strong {
    color: var(--accent);
  }

  .encoding-menu {
    position: absolute;
    bottom: calc(100% + 0.4rem);
    left: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
    min-width: 160px;
    z-index: 2000;
  }

  .encoding-menu button {
    border: none;
    background: transparent;
    padding: 0.4rem 0.8rem;
    text-align: left;
    color: var(--text-primary);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .encoding-menu button:hover,
  .encoding-menu button.selected {
    background: var(--bg-secondary);
    color: var(--accent);
  }

  .duplicate-info {
    gap: 0.5rem;
  }

  .duplicate-count {
    color: var(--accent);
  }

  .duplicate-action-btn {
    border: none;
    background: transparent;
    padding: 0.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    border-radius: 4px;
    transition: all 0.2s;
    margin-left: 0.25rem;
  }

  .duplicate-action-btn:hover {
    background: var(--bg-tertiary);
    color: var(--accent);
  }

  .duplicate-action-btn .material-icons {
    font-size: 16px;
  }
</style>
