<script lang="ts">
  export let show = false;
  export let imageUrl = '';

  function handleClose() {
    show = false;
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClose();
    }
  }

  function handleImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img) return;
    img.style.display = 'none';
    const errorDiv = img.nextElementSibling;
    if (errorDiv && errorDiv instanceof HTMLElement) {
      errorDiv.style.display = 'flex';
    }
  }
</script>

<svelte:window on:keydown={(event) => event.key === 'Escape' && handleOverlayKeydown(event)} />

{#if show && imageUrl}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="이미지 뷰어"
    tabindex="-1"
  >
    <button class="close-btn" on:click={handleClose} title="닫기 (ESC)">
      <span class="material-icons">close</span>
    </button>
    <div
      class="image-container"
      on:click|stopPropagation
      role="button"
      tabindex="0"
      aria-label="이미지 확대 보기"
      on:keydown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClose();
        }
      }}
    >
      <img src={imageUrl} alt="이미지 미리보기" on:error={handleImageError} />
      <div class="error-message" style="display: none;">
        <span class="material-icons">error</span>
        <span>이미지를 불러올 수 없습니다</span>
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
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
    cursor: pointer;
  }

  .close-btn {
    position: fixed;
    top: 1rem;
    right: 1rem;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
    z-index: 3001;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.1);
  }

  .close-btn .material-icons {
    font-size: 24px;
    color: white;
  }

  .image-container {
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
  }

  .image-container img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .error-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
    color: white;
    font-size: 1rem;
  }

  .error-message .material-icons {
    font-size: 48px;
    color: rgba(255, 255, 255, 0.7);
  }
</style>

