/**
 * UI/UX Agent - 키보드 단축키 핸들러
 */
import { dataStore } from '../store/dataStore';

export interface ShortcutConfig {
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleView?: () => void;
  onSave?: () => void;
}

export function setupKeyboardShortcuts(config: ShortcutConfig) {
  function handleKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey) {
      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (config.onUndo) {
          config.onUndo();
        } else {
          dataStore.undo();
        }
      } else if ((event.key === 'y') || (event.key === 'z' && event.shiftKey)) {
        event.preventDefault();
        if (config.onRedo) {
          config.onRedo();
        } else {
          dataStore.redo();
        }
      } else if (event.key === 's') {
        event.preventDefault();
        if (config.onSave) {
          config.onSave();
        }
      } else if (event.key === 'e') {
        event.preventDefault();
        if (config.onToggleView) {
          config.onToggleView();
        }
      }
    }
  }

  window.addEventListener('keydown', handleKeydown);
  return () => window.removeEventListener('keydown', handleKeydown);
}

