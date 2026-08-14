/** True when the keydown is Ctrl/Cmd+Space (VS Code–style trigger suggest). */
export function isSuggestTriggerKeydown(ev: KeyboardEvent): boolean {
  const mod = ev.ctrlKey === true || ev.metaKey === true;
  return ev.key === ' ' && mod && ev.altKey !== true && ev.shiftKey !== true;
}
