import type { Command, OptionSpec } from './types/command.js';

const programName = 'git-companion';

interface HelpRow {
  readonly label: string;
  readonly description: string;
}

function formatRows(rows: readonly HelpRow[]): string[] {
  const width = Math.max(...rows.map((row) => row.label.length));
  return rows.map((row) => `  ${row.label.padEnd(width)}   ${row.description}`);
}

function formatOptionLabel(name: string, spec: OptionSpec): string {
  // Long-only options are indented so that every '--' lines up
  const short = spec.short === undefined ? '    ' : `-${spec.short}, `;
  const value = spec.type === 'string' ? ` <${spec.valueName}>` : '';
  return `${short}--${name}${value}`;
}

export function formatGeneralUsage(registry: readonly Command[]): string {
  const functionLines =
    registry.length === 0
      ? ['  (none)']
      : formatRows(
          registry.map((command) => ({
            label: command.name,
            description: command.summary,
          })),
        );

  return [
    'Usage:',
    `  ${programName} <function> [options]`,
    `  ${programName} -h | --help`,
    `  ${programName} -v | --version`,
    '',
    'Functions:',
    ...functionLines,
    '',
    'Options:',
    ...formatRows([
      { label: '-h, --help', description: 'Show this help and exit' },
      { label: '-v, --version', description: 'Show the version and exit' },
    ]),
    '',
    `Run '${programName} <function> --help' to list the options of a function.`,
  ].join('\n');
}

export function formatCommandUsage(command: Command): string {
  const optionRows: HelpRow[] = Object.entries(command.options).map(
    ([name, spec]) => ({
      label: formatOptionLabel(name, spec),
      description:
        spec.type === 'string' && spec.default !== undefined
          ? `${spec.description} (default: ${spec.default})`
          : spec.description,
    }),
  );
  optionRows.push({
    label: '-h, --help',
    description: 'Show this help and exit',
  });

  return [
    'Usage:',
    `  ${programName} ${command.name} [options]`,
    '',
    command.summary,
    '',
    'Options:',
    ...formatRows(optionRows),
  ].join('\n');
}
