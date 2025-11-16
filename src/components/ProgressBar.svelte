<script lang="ts">
  export let progress: number = 0; // 0-100
  export let message: string = '';
  export let visible: boolean = false;
</script>

{#if visible}
  <div class="progress-overlay">
    <div class="progress-container">
      <div class="progress-header">
        <h3>데이터 로드 중...</h3>
        {#if message}
          <p class="progress-message">{message}</p>
        {/if}
      </div>
      <div class="progress-bar-wrapper">
        <div class="loading-spinner">
          <div class="spinner-circle"></div>
          <div class="spinner-circle"></div>
          <div class="spinner-circle"></div>
          <div class="spinner-circle"></div>
        </div>
        <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
          <div class="progress-bar-fill" style={`width: ${Math.min(100, Math.max(0, progress))}%`}></div>
        </div>
        <span class="progress-percent">{Math.min(100, Math.max(0, progress)).toFixed(0)}%</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .progress-overlay {
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
    backdrop-filter: blur(4px);
  }

  .progress-container {
    background: var(--bg-primary);
    border-radius: 12px;
    padding: 2rem;
    min-width: 400px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border);
  }

  .progress-header {
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .progress-header h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .progress-message {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .progress-bar-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .progress-bar {
    position: relative;
    flex: 1;
    height: 10px;
    background: var(--bg-secondary);
    border-radius: 999px;
    overflow: hidden;
    min-width: 200px;
    border: 1px solid var(--border);
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-hover));
    transition: width 0.2s ease;
  }

  .progress-percent {
    font-size: 0.875rem;
    color: var(--text-secondary);
    min-width: 48px;
    text-align: right;
  }

  .loading-spinner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem 0;
  }

  .spinner-circle {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    animation: loading-bounce 1.4s infinite ease-in-out both;
  }

  .spinner-circle:nth-child(1) {
    animation-delay: -0.32s;
  }

  .spinner-circle:nth-child(2) {
    animation-delay: -0.16s;
  }

  .spinner-circle:nth-child(3) {
    animation-delay: 0s;
  }

  .spinner-circle:nth-child(4) {
    animation-delay: 0.16s;
  }

  @keyframes loading-bounce {
    0%, 80%, 100% {
      transform: scale(0.6);
      opacity: 0.5;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>

