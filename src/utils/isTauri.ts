/**
 * Tauri 환경 감지 유틸리티
 */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function checkTauri(): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }
  
  try {
    // Tauri API가 실제로 로드되었는지 확인
    const { invoke } = await import('@tauri-apps/api/core');
    return typeof invoke === 'function';
  } catch {
    // Tauri가 설치되지 않았거나 웹 환경일 때는 false 반환
    return false;
  }
}

