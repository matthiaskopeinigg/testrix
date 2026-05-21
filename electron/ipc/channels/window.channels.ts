export const WindowChannels = {
  minimize: 'window:minimize',
  maximizeToggle: 'window:maximizeToggle',
  close: 'window:close',
  focus: 'window:focus',
  dragStart: 'window:drag-start',
  dragMove: 'window:drag-move',
  dragEnd: 'window:drag-end',
} as const;

export type WindowChannel = (typeof WindowChannels)[keyof typeof WindowChannels];
