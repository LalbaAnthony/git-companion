const failureExitCode = 1;
const usageExitCode = 2;
// 128 + SIGINT: the shell convention for a command stopped by Ctrl+C
const interruptedExitCode = 130;

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

// The command already explained the failure on its own output: only the exit
// code remains to be set, nothing else is printed
export class AlreadyReportedError extends GCError {
  constructor() {
    super('failure already reported', failureExitCode);
    this.name = 'AlreadyReportedError';
  }
}

export class InterruptedError extends GCError {
  constructor(options?: ErrorOptions) {
    super('interrupted by the user', interruptedExitCode, options);
    this.name = 'InterruptedError';
  }
}
