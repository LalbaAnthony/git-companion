import type { Command } from '../types/command.js';
import { crawl } from './crawl.js';

// Every function exposed by the CLI. Adding one: create src/commands/<name>.ts
// with defineCommand(), then list it here.
export const commands: readonly Command[] = [crawl];
