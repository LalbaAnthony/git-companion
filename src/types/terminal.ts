export type Style =
  | 'header'
  | 'white'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'bold'
  | 'underline';

export interface TextQuestionOptions {
  // Shown dimmed and returned when Enter is pressed on an empty input; Tab
  // copies it into the input to edit it, and Backspace on an empty input
  // discards it
  readonly default?: string | undefined;
  // An empty answer is refused and the question stays open
  readonly required?: boolean;
  // Error shown under the question, which stays open, or undefined when the
  // answer is accepted
  readonly validate?: ((answer: string) => string | undefined) | undefined;
}

export interface PromptContext {
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly signal: AbortSignal;
}
