import type { FolderDocsMode } from '@testrix/contracts';

const DOCS_MODES: readonly FolderDocsMode[] = ['write', 'split', 'preview'];

/** Slide direction when switching Write / Split / Preview (matches request Docs). */
export function docsModeSlideDir(from: FolderDocsMode, to: FolderDocsMode): 'left' | 'right' {
  return DOCS_MODES.indexOf(to) < DOCS_MODES.indexOf(from) ? 'left' : 'right';
}
