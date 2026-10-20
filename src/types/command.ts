export interface CapturedProcess {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunner {
  // Output captured and decoded as UTF-8
  capture(
    command: string,
    args: readonly string[],
    cwd: string,
  ): Promise<CapturedProcess>;
  // Output shown to the user as it is produced; resolves with the exit code
  run(command: string, args: readonly string[], cwd: string): Promise<number>;
}

export interface CommandContext {
  readonly cwd: string;
  readonly homeDir: string;
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  // stdin is a terminal, so questions can be asked
  readonly interactive: boolean;
  // ANSI styles are written to stdout
  readonly colors: boolean;
  // Aborted with an InterruptedError when the user presses Ctrl+C
  readonly signal: AbortSignal;
  readonly runner: ProcessRunner;
}

export interface BooleanOptionSpec {
  readonly type: 'boolean';
  readonly short?: string;
  readonly description: string;
}

interface StringOptionBase {
  readonly type: 'string';
  readonly short?: string;
  readonly description: string;
  // Placeholder shown in the help: 'path' renders as '--root <path>'
  readonly valueName: string;
}

export interface StringOptionSpec extends StringOptionBase {
  readonly multiple?: false;
  readonly default?: string;
}

// Every occurrence is kept, in command-line order, instead of the last one winning
export interface MultipleStringOptionSpec extends StringOptionBase {
  readonly multiple: true;
}

export type OptionSpec =
  | BooleanOptionSpec
  | StringOptionSpec
  | MultipleStringOptionSpec;

export type OptionSpecs = Readonly<Record<string, OptionSpec>>;

// Distributive on purpose: OptionValue<OptionSpec> must be the union of every
// possible value, which the parser relies on when it builds the values
type OptionValue<TSpec extends OptionSpec> = TSpec extends BooleanOptionSpec
  ? boolean
  : TSpec extends MultipleStringOptionSpec
    ? readonly string[]
    : TSpec extends { readonly default: string }
      ? string
      : string | undefined;

export type OptionValues<TOptions extends OptionSpecs> = {
  readonly [Name in keyof TOptions]: OptionValue<TOptions[Name]>;
};

export interface Command<TOptions extends OptionSpecs = OptionSpecs> {
  // Name typed on the command line: git-companion <name>
  readonly name: string;
  readonly summary: string;
  // Must not declare help, version, -h or -v: they are reserved for the CLI
  readonly options: TOptions;
  // Method syntax keeps the parameters bivariant, which lets a
  // Command<SpecificOptions> be stored in the readonly Command[] registry
  run(options: OptionValues<TOptions>, context: CommandContext): Promise<void>;
  // Prints the function's own message when the user interrupts it (exit code
  // 130); without it, 'Interrupted.' is printed on stderr
  onInterrupt?(context: CommandContext): void;
}
