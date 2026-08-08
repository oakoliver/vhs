import { spawn } from 'child_process';
import { withResolvers } from './promise.js';

export interface ClipboardInterface {
  writeText(text: string, signal?: AbortSignal): Promise<void>;
  readText(signal?: AbortSignal): Promise<string>;
}

export interface ClipboardCommand {
  command: string;
  args: string[];
}

function clipboardAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Clipboard command aborted');
}

export function runClipboardCommand(
  candidate: ClipboardCommand,
  input?: string,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) return Promise.reject(clipboardAbortError(signal));
  const { promise, resolve, reject } = withResolvers<string>();
  const process = spawn(candidate.command, candidate.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const onAbort = () => {
    process.kill('SIGKILL');
    finish(clipboardAbortError(signal!));
  };
  const finish = (error?: Error, value?: string) => {
    signal?.removeEventListener('abort', onAbort);
    if (error) reject(error);
    else resolve(value ?? '');
  };
  process.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  process.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  process.once('error', (error) => finish(error));
  process.once('close', (code) => {
    if (signal?.aborted) finish(clipboardAbortError(signal));
    else if (code === 0) finish(undefined, Buffer.concat(stdout).toString('utf8'));
    else finish(new Error(`${candidate.command} exited with code ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
  });
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  else process.stdin.end(input);
  return promise;
}

function clipboardCandidates(mode: 'read' | 'write'): ClipboardCommand[] {
  switch (process.platform) {
    case 'darwin':
      return [{ command: mode === 'read' ? 'pbpaste' : 'pbcopy', args: [] }];
    case 'win32':
      return [{
        command: 'powershell.exe',
        args: mode === 'read'
          ? ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw']
          : ['-NoProfile', '-NonInteractive', '-Command', '$input | Set-Clipboard'],
      }];
    default:
      return mode === 'read'
        ? [
            { command: 'wl-paste', args: ['--no-newline'] },
            { command: 'xclip', args: ['-selection', 'clipboard', '-out'] },
            { command: 'xsel', args: ['--clipboard', '--output'] },
          ]
        : [
            { command: 'wl-copy', args: [] },
            { command: 'xclip', args: ['-selection', 'clipboard', '-in'] },
            { command: 'xsel', args: ['--clipboard', '--input'] },
          ];
  }
}

/** Clipboard implementation backed by the operating system's native tools. */
export class SystemClipboard implements ClipboardInterface {
  async writeText(text: string, signal?: AbortSignal): Promise<void> {
    const failures: string[] = [];
    for (const candidate of clipboardCandidates('write')) {
      try {
        await runClipboardCommand(candidate, text, signal);
        return;
      } catch (error) {
        if (signal?.aborted) throw clipboardAbortError(signal);
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new Error(`No system clipboard writer is available: ${failures.join('; ')}`);
  }

  async readText(signal?: AbortSignal): Promise<string> {
    const failures: string[] = [];
    for (const candidate of clipboardCandidates('read')) {
      try {
        return await runClipboardCommand(candidate, undefined, signal);
      } catch (error) {
        if (signal?.aborted) throw clipboardAbortError(signal);
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new Error(`No system clipboard reader is available: ${failures.join('; ')}`);
  }
}
