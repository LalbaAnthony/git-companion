const failureExitCode = 1;
const usageExitCode = 2;

export class GCError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GCError';
    this.exitCode = exitCode;
  }
}

export class UsageError extends GCError {
  // Function whose usage is printed after the message; undefined prints the general usage
  readonly commandName: string | undefined;

  constructor(message: string, commandName?: string) {
    super(message, usageExitCode);
    this.name = 'UsageError';
    this.commandName = commandName;
  }
}

export class CommandError extends GCError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, failureExitCode, options);
    this.name = 'CommandError';
  }
}
