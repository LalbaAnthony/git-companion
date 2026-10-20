const usageExitCode = 2;
const failureExitCode = 1;

export class GCError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GCError';
    this.exitCode = exitCode;
  }
}

export class UsageError extends GCError {
  constructor(message: string) {
    super(message, usageExitCode);
    this.name = 'UsageError';
  }
}
