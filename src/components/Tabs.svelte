<script lang="ts">
  import type { Tab } from '../types/tab';

  export let tabs: Tab[] = [];
  export let activeTabId: string | null = null;
  export let onTabClick: (tabId: string) => void = () => {};
  export let onTabClose: (tabId: string, event: MouseEvent) => void = () => {};

  function handleTabClick(tabId: string) {
    onTabClick(tabId);
  }

  function handleTabClose(tabId: string, event: MouseEvent) {
    event.stopPropagation();
    onTabClose(tabId, event);
  }
</script>

<div class="tabs-container">
  <div class="tabs-list">
    {#each tabs as tab (tab.id)}
      <button
        class="tab"
        class:active={tab.id === activeTabId}
        on:click={() => handleTabClick(tab.id)}
        title={tab.name}
      >
        <span class="tab-name">{tab.name}</span>
        {#if tab.isModified}
          <span class="modified-indicator" title="수정됨">●</span>
        {/if}
        <button
          class="tab-close"
          on:click={(e) => handleTabClose(tab.id, e)}
          title="탭 닫기"
        >
          <span class="material-icons">close</span>
        </button>
      </button>
    {/each}
  </div>
</div>

<style>
  .tabs-container {
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .tabs-list {
    display: flex;
    min-width: fit-content;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-primary);
    border: none;
    border-right: 1px solid var(--border);
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    min-width: 120px;
    max-width: 200px;
    position: relative;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .tab:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .tab.active {
    background: var(--bg-primary);
    border-bottom-color: var(--accent);
    color: var(--text-primary);
    font-weight: 500;
  }

  .tab-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .modified-indicator {
    color: var(--accent);
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .tab-close {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    opacity: 0.6;
    transition: all 0.2s;
    flex-shrink: 0;
    padding: 0;
  }

  .tab-close:hover {
    background: var(--bg-secondary);
    opacity: 1;
  }

  .tab-close .material-icons {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .tab.active .tab-close .material-icons {
    color: var(--text-primary);
  }
</style>

