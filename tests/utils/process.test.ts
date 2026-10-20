import { describe, expect, it } from 'vitest';
import { CommandError, InterruptedError } from '../../src/errors.js';
import { createProcessRunner } from '../../src/utils/process.js';
import { captureStream } from '../fixtures/commands.js';

function node(script: string): [string, string[]] {
  return [process.execPath, ['-e', script]];
}

function createRunner(signal = new AbortController().signal) {
  const stdout = captureStream();
  const stderr = captureStream();
  return {
    stdout,
    stderr,
    runner: createProcessRunner({ signal, output: { stdout, stderr } }),
  };
}

describe('createProcessRunner: capture', () => {
  it('captures the output decoded as UTF-8 and the exit code', async () => {
    const { runner } = createRunner();
    const [command, args] = node(
      "process.stdout.write('héllo ✓'); process.stderr.write('oops'); process.exit(3)",
    );

    await expect(runner.capture(command, args, process.cwd())).resolves.toEqual(
      { exitCode: 3, stdout: 'héllo ✓', stderr: 'oops' },
    );
  });

  it('runs in the given directory', async () => {
    const { runner } = createRunner();
    const [command, args] = node('process.stdout.write(process.cwd())');

    const result = await runner.capture(command, args, import.meta.dirname);
    expect(result.stdout).toBe(import.meta.dirname);
  });

  it('reports a missing executable as a command error', async () => {
    const { runner } = createRunner();

    await expect(
      runner.capture('git-companion-missing-binary', [], process.cwd()),
    ).rejects.toThrow(
      new CommandError(
        "cannot run 'git-companion-missing-binary': not found in PATH",
      ),
    );
  });

  it('does not start anything once the signal is aborted', async () => {
    const controller = new AbortController();
    const reason = new InterruptedError();
    controller.abort(reason);
    const { runner } = createRunner(controller.signal);
    const [command, args] = node('');

    await expect(runner.capture(command, args, process.cwd())).rejects.toBe(
      reason,
    );
  });

  it('kills the child and rejects with the reason when the signal is aborted', async () => {
    const controller = new AbortController();
    const reason = new InterruptedError();
    const { runner } = createRunner(controller.signal);
    const [command, args] = node('setTimeout(() => {}, 60_000)');

    const pending = runner.capture(command, args, process.cwd());
    setTimeout(() => {
      controller.abort(reason);
    }, 50);
    await expect(pending).rejects.toBe(reason);
  });

  it.runIf(process.platform !== 'win32')(
    'reports a child stopped by SIGINT as an interruption',
    async () => {
      const { runner } = createRunner();
      const [command, args] = node("process.kill(process.pid, 'SIGINT')");

      await expect(runner.capture(command, args, process.cwd())).rejects.toThrow(
        InterruptedError,
      );
    },
  );

  it.runIf(process.platform === 'win32')(
    'reports a child stopped by Ctrl+C as an interruption',
    async () => {
      const { runner } = createRunner();
      const [command, args] = node('process.exit(0xc000013a)');

      await expect(runner.capture(command, args, process.cwd())).rejects.toThrow(
        InterruptedError,
      );
    },
  );
});

describe('createProcessRunner: run', () => {
  it('forwards the output and resolves with the exit code', async () => {
    const { runner, stdout, stderr } = createRunner();
    const [command, args] = node(
      "process.stdout.write('out'); process.stderr.write('err'); process.exit(2)",
    );

    await expect(runner.run(command, args, process.cwd())).resolves.toBe(2);
    expect(stdout.text()).toBe('out');
    expect(stderr.text()).toBe('err');
  });

  it('does not end the forwarded streams', async () => {
    const { runner, stdout } = createRunner();
    const [command, args] = node("process.stdout.write('a')");

    await runner.run(command, args, process.cwd());
    await runner.run(command, args, process.cwd());
    expect(stdout.text()).toBe('aa');
    expect(stdout.writableEnded).toBe(false);
  });

  it('reports a missing executable as a command error', async () => {
    const { runner } = createRunner();

    await expect(
      runner.run('git-companion-missing-binary', [], process.cwd()),
    ).rejects.toThrow(CommandError);
  });
});
