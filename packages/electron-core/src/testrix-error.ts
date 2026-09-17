export interface TestrixError {
  readonly code: string;
  readonly userMessage: string;
}

export class AppError extends Error implements TestrixError {
  constructor(
    readonly code: string,
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = 'AppError';
  }
}
