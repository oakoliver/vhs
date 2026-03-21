/**
 * @oakoliver/vhs — TTY spawning utilities
 *
 * Zero-dependency TypeScript port of Charmbracelet's VHS tty.go.
 *
 * @module
 */

import * as net from 'net';
import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import type { Shell } from './vhs.js';

// ============================================================================
// Port Utilities
// ============================================================================

/**
 * Find a random available port.
 */
export async function randomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close();
        reject(new Error('Failed to get random port'));
      }
    });
    server.on('error', reject);
  });
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
  private _port: number = 0;
  private _url: string = '';
  private started: boolean = false;

  /**
   * Get the port the TTY is running on.
   */
  get port(): number {
    return this._port;
  }

  /**
   * Get the URL to connect to the TTY.
   */
  get url(): string {
    return this._url;
  }

  /**
   * Check if the TTY process is running.
   */
  get isRunning(): boolean {
    return this.started && this.process !== null && this.process.exitCode === null;
  }

  /**
   * Start the TTY process.
   */
  async start(shell: Shell, env?: Record<string, string>): Promise<void> {
    if (this.started) {
      throw new Error('TTY process already started');
    }

    // Get a random available port
    this._port = await randomPort();
    this._url = `http://127.0.0.1:${this._port}`;

    const args = buildTTYArgs({ port: this._port, shell, env });

    // Build environment
    const processEnv: NodeJS.ProcessEnv = { ...process.env };
    
    // Add shell environment variables
    for (const envVar of shell.env) {
      const eqIndex = envVar.indexOf('=');
      if (eqIndex > 0) {
        const key = envVar.slice(0, eqIndex);
        const value = envVar.slice(eqIndex + 1);
        processEnv[key] = value;
      }
    }

    // Add custom environment variables
    if (env) {
      Object.assign(processEnv, env);
    }

    const spawnOptions: SpawnOptions = {
      env: processEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    };

    this.process = spawn('ttyd', args, spawnOptions);
    this.started = true;

    // Wait for ttyd to be ready
    await this.waitForReady();
  }

  /**
   * Wait for ttyd to be ready to accept connections.
   */
  private async waitForReady(timeout: number = 10000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 100;

    while (Date.now() - startTime < timeout) {
      try {
        const isReady = await this.checkConnection();
        if (isReady) {
          return;
        }
      } catch {
        // Connection not ready yet
      }
      await sleep(checkInterval);
    }

    throw new Error(`TTY process failed to start within ${timeout}ms`);
  }

  /**
   * Check if we can connect to the TTY server.
   */
  private checkConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(this._port, '127.0.0.1');
    });
  }

  /**
   * Stop the TTY process.
   */
  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.started = false;
  }

  /**
   * Force kill the TTY process.
   */
  kill(): void {
    if (this.process) {
      this.process.kill('SIGKILL');
      this.process = null;
    }
    this.started = false;
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if ttyd is installed and available.
 */
export async function isTTYDAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ttyd', ['--version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Check if ffmpeg is installed and available.
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Get the version of ttyd.
 */
export async function getTTYDVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('ttyd', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code === 0 && output) {
        // ttyd output format: "ttyd version X.Y.Z"
        const match = output.match(/ttyd\s+version\s+(\S+)/i);
        resolve(match ? match[1] : output.trim());
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Get the version of ffmpeg.
 */
export async function getFFmpegVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code === 0 && output) {
        // ffmpeg output format: "ffmpeg version X.Y.Z ..."
        const match = output.match(/ffmpeg\s+version\s+(\S+)/i);
        resolve(match ? match[1] : null);
      } else {
        resolve(null);
      }
    });
  });
}
