export const WindowChannels = {
  minimize: 'window:minimize',
  maximizeToggle: 'window:maximizeToggle',
  close: 'window:close',
  focus: 'window:focus',
} as const;

export type WindowChannel = (typeof WindowChannels)[keyof typeof WindowChannels];
