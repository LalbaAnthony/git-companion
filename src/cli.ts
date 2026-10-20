#!/usr/bin/env node
import { commands } from './commands/index.js';
import { main } from './main.js';

process.exitCode = await main({
  argv: process.argv.slice(2),
  registry: commands,
  context: {
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
  },
  debug: process.env.DEBUG === '1',
});
