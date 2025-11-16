<script lang="ts">
  export let x: number = 0;
  export let y: number = 0;
  export let onClose: () => void;
  export let items: Array<{
    label: string;
    icon?: string;
    action: () => void;
    divider?: boolean;
  }> = [];

  function handleMenuKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }
</script>

<div
  class="context-menu"
  style="left: {x}px; top: {y}px;"
  role="menu"
  aria-label="컨텍스트 메뉴"
  tabindex="-1"
  on:click|stopPropagation
  on:keydown={handleMenuKeydown}
>
  {#each items as item}
    {#if item.divider}
      <div class="divider"></div>
    {:else}
      <button class="menu-item" on:click={() => { item.action(); onClose(); }}>
        {#if item.icon}
          <span class="material-icons">{item.icon}</span>
        {/if}
        <span>{item.label}</span>
      </button>
    {/if}
  {/each}
</div>

<style>
  .context-menu {
    position: fixed;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 2000;
    min-width: 160px;
    padding: 0.25rem;
  }

  .menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-size: 0.875rem;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
    color: var(--text-primary);
  }

  .menu-item:hover {
    background: var(--bg-secondary);
  }

  .menu-item .material-icons {
    font-size: 18px;
    color: var(--text-secondary);
  }

  .divider {
    height: 1px;
    background: var(--border);
    margin: 0.25rem 0;
  }
</style>

