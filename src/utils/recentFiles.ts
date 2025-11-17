/**
 * 최근 파일 목록 관리 유틸리티
 */

export interface RecentFile {
  path: string;
  name: string;
  lastOpened: number; // timestamp
}

const RECENT_FILES_KEY = 'jable_recent_files';
const MAX_RECENT_FILES = 10;

/**
 * 최근 파일 목록 가져오기
 */
export function getRecentFiles(): RecentFile[] {
  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    if (!stored) return [];
    
    const files: RecentFile[] = JSON.parse(stored);
    // 타임스탬프로 정렬 (최신순)
    return files.sort((a, b) => b.lastOpened - a.lastOpened);
  } catch (error) {
    console.error('[getRecentFiles] 로드 실패:', error);
    return [];
  }
}

/**
 * 최근 파일 목록에 추가
 */
export function addRecentFile(path: string, name: string): void {
  try {
    const files = getRecentFiles();
    
    // 이미 존재하는 파일이면 제거 (중복 방지)
    const filtered = files.filter(f => f.path !== path);
    
    // 새 파일 추가
    const newFile: RecentFile = {
      path,
      name,
      lastOpened: Date.now(),
    };
    
    // 최신순으로 정렬하고 최대 개수 제한
    const updated = [newFile, ...filtered]
      .sort((a, b) => b.lastOpened - a.lastOpened)
      .slice(0, MAX_RECENT_FILES);
    
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('[addRecentFile] 저장 실패:', error);
  }
}

/**
 * 최근 파일 목록에서 제거
 */
export function removeRecentFile(path: string): void {
  try {
    const files = getRecentFiles();
    const filtered = files.filter(f => f.path !== path);
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('[removeRecentFile] 제거 실패:', error);
  }
}

/**
 * 최근 파일 목록 초기화
 */
export function clearRecentFiles(): void {
  try {
    localStorage.removeItem(RECENT_FILES_KEY);
  } catch (error) {
    console.error('[clearRecentFiles] 초기화 실패:', error);
  }
}

