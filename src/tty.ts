/**
 * @oakoliver/vhs — TTY spawning utilities
 *
 * TypeScript port of Charmbracelet VHS v0.11.0 ttyd behavior.
 *
 * @module
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import type { Shell } from './vhs.js';
import { withResolvers } from './promise.js';

// ============================================================================
// Port Utilities
// ============================================================================

/**
 * Find a random available port.
 */
export function randomPort(): Promise<number> {
  const { promise, resolve, reject } = withResolvers<number>();
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address === 'object') {
      server.close(() => resolve(address.port));
    } else {
      server.close();
      reject(new Error('Failed to get random port'));
    }
  });
  server.once('error', reject);
  return promise;
}

// ============================================================================
// TTY Process Management
// ============================================================================

/**
 * Options for spawning ttyd.
 */
export interface TTYOptions {
  port: number;
  shell: Shell;
  /** Additional environment variables */
  env?: Record<string, string>;
}

/**
 * Build ttyd command arguments.
 */
export function buildTTYArgs(options: TTYOptions): string[] {
  const { port, shell } = options;

  const args: string[] = [
    `--port=${port}`,
    '--interface', '127.0.0.1',
    '-t', 'rendererType=canvas',
    '-t', 'disableResizeOverlay=true',
    '-t', 'enableSixel=true',
    '-t', 'customGlyphs=true',
    '--once', // Will allow one connection and exit
    '--writable',
  ];

  // Add shell command
  args.push(...shell.command);

  return args;
}

/**
 * TTY process wrapper.
 */
export class TTYProcess {
  private process: ChildProcess | null = null;
  private _port = 0;
  private _url = '';
  private started = false;

  get port(): number {
    return this._port;
  }

  get url(): string {
    return this._url;
  }

  get isRunning(): boolean {
    return this.started && this.process !== null && this.process.exitCode === null;
  }

  async start(shell: Shell, env?: Record<string, string>): Promise<void> {
    await this.startAt(await randomPort(), shell, env);
  }

  async startAt(port: number, shell: Shell, env?: Record<string, string>): Promise<void> {
    if (this.started) throw new Error('TTY process already started');
    this._port = port;
    this._url = `http://127.0.0.1:${port}`;

    const processEnv: NodeJS.ProcessEnv = { ...process.env };
    for (const assignment of shell.env) {
      const separator = assignment.indexOf('=');
      if (separator > 0) {
        processEnv[assignment.slice(0, separator)] = assignment.slice(separator + 1);
      }
    }
    if (env) Object.assign(processEnv, env);

    this.process = spawn('ttyd', buildTTYArgs({ port, shell, env }), {
      env: processEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.started = true;
    try {
      await this.waitForReady();
    } catch (error) {
      this.kill();
      throw error;
    }
  }

  private waitForReady(timeout = 10_000): Promise<void> {
    const child = this.process;
    if (!child) throw new Error('TTY process has not been spawned');

    const { promise, resolve, reject } = withResolvers<void>();
    let output = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve();
    };
    const onData = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (/listening (?:on|at)|server started|ttyd .* started/i.test(output)) finish();
    };
    const onError = (error: Error) => finish(error);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(new Error(`ttyd exited before becoming ready (code ${code}, signal ${signal}): ${output.trim()}`));
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
    timer = setTimeout(
      () => finish(new Error(`ttyd did not become ready within ${timeout}ms: ${output.trim()}`)),
      timeout
    );
    return promise;
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.started = false;
  }

  kill(): void {
    if (this.process) {
      this.process.kill('SIGKILL');
      this.process = null;
    }
    this.started = false;
  }
}

/** TTYInterface implementation used by evaluate() when no adapter is supplied. */
export class DefaultTTY {
  private process: TTYProcess | null = null;

  getPort(): Promise<number> {
    return randomPort();
  }

  async start(port: number, shell: Shell, env?: Record<string, string>): Promise<void> {
    const process = new TTYProcess();
    await process.startAt(port, shell, env);
    this.process = process;
  }

  async stop(): Promise<void> {
    this.process?.kill();
    this.process = null;
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  const { promise, resolve } = withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export function executableCandidates(
  command: string,
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const windows = platform === 'win32';
  const pathApi = windows ? path.win32 : path.posix;
  const delimiter = pathApi.delimiter;
  let pathValue = environment.PATH;
  let pathExtValue = environment.PATHEXT;
  if (windows && (pathValue === undefined || pathExtValue === undefined)) {
    for (const [key, value] of Object.entries(environment)) {
      const normalized = key.toUpperCase();
      if (normalized === 'PATH' && pathValue === undefined) pathValue = value;
      else if (normalized === 'PATHEXT' && pathExtValue === undefined) pathExtValue = value;
    }
  }
  const hasPath = command.includes('/') || (windows && command.includes('\\'));
  const extensions = windows
    ? (pathExtValue || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  const names = windows && pathApi.extname(command) === ''
    ? extensions.map((extension) => `${command}${extension}`)
    : [command];
  if (hasPath) return names;
  return (pathValue || '')
    .split(delimiter)
    .flatMap((directory) => names.map((name) => pathApi.join(directory || '.', name)));
}

export async function isCommandAvailable(
  command: string,
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  for (const candidate of executableCandidates(command, environment, platform)) {
    try {
      const stats = fs.statSync(candidate);
      if (!stats.isFile()) continue;
      if (platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {}
  }
  return false;
}

export function isTTYDAvailable(): Promise<boolean> {
  const { promise, resolve } = withResolvers<boolean>();
  const process = spawn('ttyd', ['--version'], { stdio: 'ignore', windowsHide: true });
  process.once('error', () => resolve(false));
  process.once('close', (code) => resolve(code === 0));
  return promise;
}

export function isFFmpegAvailable(): Promise<boolean> {
  const { promise, resolve } = withResolvers<boolean>();
  const process = spawn('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true });
  process.once('error', () => resolve(false));
  process.once('close', (code) => resolve(code === 0));
  return promise;
}

/**
 * Get the version of ttyd.
 */
export function getTTYDVersion(): Promise<string | null> {
  const { promise, resolve } = withResolvers<string | null>();
  const process = spawn('ttyd', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  let output = '';
  process.stdout?.on('data', (data) => {
    output += data.toString();
  });
  process.once('error', () => resolve(null));
  process.once('close', (code) => {
    if (code === 0 && output) {
      const match = output.match(/ttyd\s+version\s+(\S+)/i);
      resolve(match ? match[1] : output.trim());
    } else {
      resolve(null);
    }
  });
  return promise;
}

/**
 * Get the version of ffmpeg.
 */
export function getFFmpegVersion(): Promise<string | null> {
  const { promise, resolve } = withResolvers<string | null>();
  const process = spawn('ffmpeg', ['-version'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  let output = '';
  process.stdout?.on('data', (data) => {
    output += data.toString();
  });
  process.once('error', () => resolve(null));
  process.once('close', (code) => {
    if (code === 0 && output) {
      const match = output.match(/ffmpeg\s+version\s+(\S+)/i);
      resolve(match ? match[1] : null);
    } else {
      resolve(null);
    }
  });
  return promise;
}
