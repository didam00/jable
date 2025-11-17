<script lang="ts">
import { onMount } from 'svelte';
import type { Tab } from '../types/tab';

type TabContextAction = 'merge' | 'subtract' | 'intersect' | 'split';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  tabId: string | null;
}

export let tabs: Tab[] = [];
export let activeTabId: string | null = null;
export let onTabClick: (tabId: string) => void = () => {};
export let onTabClose: (tabId: string, event: MouseEvent) => void = () => {};
export let onTabContextAction: (tabId: string, action: TabContextAction) => void = () => {};

let contextMenu: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  tabId: null,
};

const menuItems: { label: string; action: TabContextAction; description: string }[] = [
  { label: '병합', action: 'merge', description: '현재 탭과 데이터 합치기' },
  { label: '빼기 (차집합)', action: 'subtract', description: '현재 탭에서 선택 탭 데이터 제거' },
  { label: '교차 (교집합)', action: 'intersect', description: '두 탭에 모두 있는 행만 남기기' },
  { label: '함께 보기', action: 'split', description: '두 탭을 나란히 비교' },
];

function handleTabClick(tabId: string) {
  onTabClick(tabId);
}

function handleTabClose(tabId: string, event: MouseEvent) {
  event.stopPropagation();
  onTabClose(tabId, event);
}

function openContextMenu(event: MouseEvent, tabId: string) {
  event.preventDefault();
  contextMenu = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    tabId,
  };
}

function closeContextMenu() {
  if (contextMenu.visible) {
    contextMenu = { visible: false, x: 0, y: 0, tabId: null };
  }
}

function handleMenuSelect(action: TabContextAction) {
  if (contextMenu.tabId) {
    onTabContextAction(contextMenu.tabId, action);
  }
  closeContextMenu();
}

onMount(() => {
  const handleGlobalClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.tab-context-menu')) {
      closeContextMenu();
    }
  };
  window.addEventListener('click', handleGlobalClick);
  window.addEventListener('scroll', closeContextMenu, true);
  window.addEventListener('resize', closeContextMenu);
  return () => {
    window.removeEventListener('click', handleGlobalClick);
    window.removeEventListener('scroll', closeContextMenu, true);
    window.removeEventListener('resize', closeContextMenu);
  };
});
</script>

<div class="tabs-container">
  <div class="tabs-list">
    {#each tabs as tab (tab.id)}
      <button
        class="tab"
        class:active={tab.id === activeTabId}
        on:click={() => handleTabClick(tab.id)}
        title={tab.name}
        on:contextmenu={(event) => openContextMenu(event, tab.id)}
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
  {#if contextMenu.visible && contextMenu.tabId}
    <div
      class="tab-context-menu"
      style={`top: ${contextMenu.y}px; left: ${contextMenu.x}px;`}
    >
      {#each menuItems as item}
        <button on:click={() => handleMenuSelect(item.action)}>
          <div class="menu-label">{item.label}</div>
          <div class="menu-desc">{item.description}</div>
        </button>
      {/each}
    </div>
  {/if}
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

  .tab-context-menu {
    position: fixed;
    min-width: 200px;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
    padding: 0.25rem;
    z-index: 1500;
  }

  .tab-context-menu button {
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
    padding: 0.45rem 0.6rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .tab-context-menu button:hover {
    background: var(--bg-secondary);
  }

  .menu-label {
    font-size: 0.85rem;
    color: var(--text-primary);
    font-weight: 500;
  }

  .menu-desc {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
</style>

