export type TxNotificationTone = 'success' | 'error' | 'info' | 'warning';

export interface TxNotificationPayload {
  readonly id: string;
  readonly message: string;
  readonly tone: TxNotificationTone;
  readonly durationMs: number;
}
