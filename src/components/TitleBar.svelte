<script lang="ts">
  import { onMount } from 'svelte';
  import { isTauri } from '../utils/isTauri';
  import type { UnlistenFn } from '@tauri-apps/api/event';
  import type { Window as TauriWindow } from '@tauri-apps/api/window';

  let appWindow: TauriWindow | null = null;
  let isMaximized = false;

  async function getWindowHandle(): Promise<TauriWindow | null> {
    if (appWindow) {
      return appWindow;
    }
    if (!isTauri()) {
      return null;
    }
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    appWindow = getCurrentWindow();
    return appWindow;
  }

  onMount(() => {
    let resizeUnlisten: UnlistenFn | null = null;

    async function setupTauriWindow() {
      const currentWindow = await getWindowHandle();
      if (!currentWindow) {
        return;
      }
      isMaximized = await currentWindow.isMaximized();
      resizeUnlisten = await currentWindow.onResized(async () => {
        isMaximized = await currentWindow.isMaximized();
      });
    }

    setupTauriWindow();

    return () => {
      if (resizeUnlisten) {
        resizeUnlisten();
      }
    };
  });

  async function handleMinimize() {
    const windowHandle = await getWindowHandle();
    if (!windowHandle) {
      return;
    }
    await windowHandle.minimize();
  }

  async function handleMaximizeToggle() {
    const windowHandle = await getWindowHandle();
    if (!windowHandle) {
      return;
    }
    if (await windowHandle.isMaximized()) {
      await windowHandle.unmaximize();
      isMaximized = false;
      return;
    }
    await windowHandle.maximize();
    isMaximized = true;
  }

  async function handleClose() {
    const windowHandle = await getWindowHandle();
    if (!windowHandle) {
      return;
    }
    await windowHandle.close();
  }

  function handleTitlebarDoubleClick() {
    handleMaximizeToggle();
  }
</script>

<div
  class="titlebar"
  data-tauri-drag-region="true"
  role="banner"
  on:dblclick={handleTitlebarDoubleClick}
>
  <div class="titlebar__info">
    <!-- <img src={icon} alt="JSON Table Editor" draggable="false" /> -->
    <!-- <span class="title">JSON Table Editor</span> -->
  </div>
  <div class="titlebar__controls" data-tauri-drag-region="false">
    <button
      class="titlebar__button"
      type="button"
      aria-label="Minimize window"
      data-tauri-drag-region="false"
      on:click|stopPropagation={handleMinimize}
    >
      <span class="material-icons" aria-hidden="true">horizontal_rule</span>
    </button>
    <button
      class="titlebar__button"
      type="button"
      aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
      class:maximized={isMaximized}
      data-tauri-drag-region="false"
      on:click|stopPropagation={handleMaximizeToggle}
    >
      <span class="material-icons" aria-hidden="true">{isMaximized ? 'web_asset' : 'crop_square'}</span>
    </button>
    <button
      class="titlebar__button titlebar__button--close"
      type="button"
      aria-label="Close window"
      data-tauri-drag-region="false"
      on:click|stopPropagation={handleClose}
    >
      <span class="material-icons" aria-hidden="true">close</span>
    </button>
  </div>
</div>

<style>
  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding-left: 0.75rem;
    background: #fff;
    color: #444;
    /* border-bottom: 1px solid rgba(0, 0, 0, 0.08); */
    -webkit-user-select: none;
    user-select: none;
    -webkit-app-region: drag;
  }

  .titlebar__controls {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    -webkit-app-region: no-drag;
  }

  .titlebar__button {
    width: 54px;
    height: 32px;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease;
    -webkit-app-region: no-drag;
  }

  .titlebar__button:hover {
    background: rgba(0, 0, 0, 0.08);
  }

  .titlebar__button:active {
    background: rgba(0, 0, 0, 0.15);
  }

  .titlebar__button .material-icons {
    font-size: 16px;
  }
</style>

