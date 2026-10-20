export interface OutputStream {
  write(text: string): boolean;
}

export interface CommandContext {
  readonly cwd: string;
  readonly stdout: OutputStream;
  readonly stderr: OutputStream;
}

export interface BooleanOptionSpec {
  readonly type: 'boolean';
  readonly short?: string;
  readonly description: string;
}

export interface StringOptionSpec {
  readonly type: 'string';
  readonly short?: string;
  readonly description: string;
  // Placeholder shown in the help: 'path' renders as '--root <path>'
  readonly valueName: string;
  readonly default?: string;
}

export type OptionSpec = BooleanOptionSpec | StringOptionSpec;

export type OptionSpecs = Readonly<Record<string, OptionSpec>>;

// Distributive on purpose: OptionValue<OptionSpec> must be the union of every
// possible value, which the parser relies on when it builds the values
type OptionValue<TSpec extends OptionSpec> = TSpec extends BooleanOptionSpec
  ? boolean
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
}
