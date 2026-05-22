/** IPC channels for the ported api-workbench E2E browser runner. */
export const E2eChannels = {
  execute: 'e2e:execute',
  signalCancel: 'e2e:signal-cancel',
  clearRunnerSession: 'e2e:clear-runner-session',
  visibleRunnerInputLock: 'e2e:visible-runner-input-lock',
  pickElementStart: 'e2e:pick-element:start',
  pickElementResult: 'e2e:pick-element:result',
  pickElementCancel: 'e2e:pick-element:cancel',
  pickScrollPositionStart: 'e2e:pick-scroll-position:start',
  httpCapture: 'e2e:http-capture',
} as const;

export type E2eChannel = (typeof E2eChannels)[keyof typeof E2eChannels];
