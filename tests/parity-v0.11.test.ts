import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { Lexer } from '../src/lexer';
import { Parser } from '../src/parser';
import { TokenType } from '../src/token';
import { collectMediaOutputPaths, evaluate, type BrowserInterface, type TTYInterface } from '../src/evaluator';
import type { KeyCode, KeyModifiers } from '../src/command';
import { isDirectExecution, parseArgs, runCLI } from '../src/cli';
import { dropPrivileges, forceCloseSSHResources, serveSSH, serverConfigFromEnv, serverOutputExtension } from '../src/server';
import { buildFFmpegArgs, marginFillIsColor, parseHexColor, runFFmpeg } from '../src/ffmpeg';
import { chromeSandboxArgs, closeBrowserWithTimeout, PuppeteerBrowser } from '../src/browser';
import { executableCandidates, isCommandAvailable } from '../src/tty';
import { inputToTape } from '../src/record';
import { defaultVideoOptions } from '../src/vhs';
import { withResolvers } from '../src/promise';
import { runClipboardCommand } from '../src/clipboard';

describe('VHS v0.11.0 parity', () => {
  test('lexer keeps delimiters escaped only by an odd backslash run', () => {
    const tokens = new Lexer(String.raw`Wait /foo\/bar/
Wait /foo\\/
Wait /foo\\\/bar/`).tokenize();
    expect(tokens.filter((token) => token.type === TokenType.REGEX).map((token) => token.literal)).toEqual([
      String.raw`foo\/bar`,
      String.raw`foo\\`,
      String.raw`foo\\\/bar`,
    ]);
  });

  test('parser accepts the full repeatable navigation surface', () => {
    const parser = new Parser(new Lexer(`
Home
End 2
ScrollUp@100ms 3
ScrollDown 4
Ctrl+Left
Ctrl+Alt+Right
Ctrl+Shift+Up
Ctrl+Alt+Shift+Down
`));
    expect(parser.parse()).toEqual([
      { type: TokenType.HOME, options: '', args: '1' },
      { type: TokenType.END, options: '', args: '2' },
      { type: TokenType.SCROLL_UP, options: '100ms', args: '3' },
      { type: TokenType.SCROLL_DOWN, options: '', args: '4' },
      { type: TokenType.CTRL, options: '', args: 'Left' },
      { type: TokenType.CTRL, options: '', args: 'Alt Right' },
      { type: TokenType.CTRL, options: '', args: 'Shift Up' },
      { type: TokenType.CTRL, options: '', args: 'Alt Shift Down' },
    ]);
    expect(parser.getErrors()).toEqual([]);
  });

  test('evaluator performs scrolls, Ctrl arrows, and modifier strings through browser interfaces', async () => {
    const scrolls: number[] = [];
    const chords: Array<{ codes: KeyCode[]; modifiers?: KeyModifiers }> = [];
    const keys: Array<{ code: KeyCode; modifiers?: KeyModifiers }> = [];
    const browser: BrowserInterface = {
      async launch() {},
      async close() {},
      async waitForTerminal() {},
      async typeKey(code, modifiers) { keys.push({ code, modifiers }); },
      async typeKeyChord(codes, modifiers) {
        chords.push({ codes, modifiers });
      },
      async typeText() {},
      async inputText() {},
      async evaluate<T>() { return undefined as T; },
      async getCurrentLine() { return '> '; },
      async getBuffer() { return ['> ']; },
      async waitForIdle() {},
      async scroll(direction) { scrolls.push(direction); },
      async captureTextCanvas() { return Buffer.from('text'); },
      async captureCursorCanvas() { return Buffer.from('cursor'); },
      async setViewport() {},
    };
    const tty: TTYInterface = {
      async start() {},
      async stop() {},
      async getPort() { return 7681; },
    };

    const result = await evaluate(`
Set TypingSpeed 0ms
ScrollUp 2
ScrollDown 1
Ctrl+Left
Alt+"ab"
Shift+"xy"
`, { browser, tty, output: () => {} });

    expect(result.errors).toEqual([]);
    expect(scrolls).toEqual([-1, -1, 1]);
    expect(chords).toEqual([
      { codes: ['ArrowLeft'], modifiers: { ctrl: true } },
    ]);
    expect(keys).toEqual([
      { code: 'KeyA', modifiers: { alt: true, shift: undefined } },
      { code: 'KeyB', modifiers: { alt: true, shift: undefined } },
      { code: 'KeyX', modifiers: { shift: true } },
      { code: 'KeyY', modifiers: { shift: true } },
    ]);
  });

  test('CLI exposes v0.11 SSH serving and environment configuration', () => {
    expect(parseArgs(['serve']).command).toBe('serve');
    expect(serverConfigFromEnv({
      VHS_HOST: '127.0.0.1',
      VHS_PORT: '2200',
      VHS_UID: '501',
      VHS_GID: '20',
      VHS_KEY_PATH: '/keys/vhs',
      VHS_AUTHORIZED_KEYS_PATH: '/keys/authorized_keys',
    })).toEqual({
      allowUnauthenticated: false,
      host: '127.0.0.1',
      port: 2200,
      uid: 501,
      gid: 20,
      keyPath: '/keys/vhs',
      authorizedKeysPath: '/keys/authorized_keys',
    });
  });

  test('CLI direct-execution detection follows package-bin symlinks', () => {
    if (process.platform === 'win32') return;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-cli-symlink-'));
    const distDirectory = path.join(directory, 'dist');
    const binDirectory = path.join(directory, 'node_modules', '.bin');
    const cliPath = path.join(distDirectory, 'cli.js');
    const binPath = path.join(binDirectory, 'vhs');
    try {
      fs.mkdirSync(distDirectory, { recursive: true });
      fs.mkdirSync(binDirectory, { recursive: true });
      fs.writeFileSync(cliPath, '');
      fs.symlinkSync(path.relative(binDirectory, cliPath), binPath);

      expect(isDirectExecution(binPath, pathToFileURL(cliPath).href)).toBe(true);
      expect(isDirectExecution(path.join(directory, 'other.js'), pathToFileURL(cliPath).href)).toBe(false);
      expect(isDirectExecution(undefined, pathToFileURL(cliPath).href)).toBe(false);
      expect(isDirectExecution(binPath, undefined)).toBe(false);
      expect(isDirectExecution(binPath, null as unknown as string)).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('CLI direct-execution detection rejects missing and malformed paths', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-cli-missing-'));
    const missingPath = path.join(directory, 'missing.js');
    try {
      expect(isDirectExecution(missingPath, pathToFileURL(missingPath).href)).toBe(false);
      expect(isDirectExecution(null as unknown as string, pathToFileURL(missingPath).href)).toBe(false);
      expect(isDirectExecution(missingPath, 'https://example.com/cli.js')).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('new refuses overwrite and named margin colors remain distinct from image paths', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-parity-'));
    const base = path.join(directory, 'existing');
    const tapePath = `${base}.tape`;
    const imagePath = path.join(directory, 'black');
    try {
      fs.writeFileSync(tapePath, 'preserve me');
      fs.writeFileSync(imagePath, 'image');
      await expect(runCLI(['new', base])).rejects.toThrow('already exists');
      expect(fs.readFileSync(tapePath, 'utf8')).toBe('preserve me');
      expect(marginFillIsColor('black')).toBe(true);
      expect(marginFillIsColor('DarkSlateGrey@0.5')).toBe(true);
      expect(marginFillIsColor(imagePath)).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('CLI validate rejects an empty or comment-only tape like evaluate does', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-validate-'));
    const tapePath = path.join(directory, 'empty.tape');
    try {
      fs.writeFileSync(tapePath, '# no commands\n');
      expect(await runCLI(['validate', tapePath])).toBe(1);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('Node 18 resolver helper settles without Promise.withResolvers', async () => {
    const { promise, resolve } = withResolvers<number>();
    resolve(42);
    expect(await promise).toBe(42);
  });

  test('configured authorized_keys cannot silently enable anonymous SSH', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-auth-'));
    const authorizedKeysPath = path.join(directory, 'authorized_keys');
    try {
      fs.writeFileSync(authorizedKeysPath, '# no usable keys\n');
      expect(() => serveSSH({
        host: '127.0.0.1',
        port: 0,
        uid: 0,
        gid: 0,
        keyPath: path.join(directory, 'host-key'),
        authorizedKeysPath,
      })).toThrow('No authorized keys found');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('SSH authentication is deny-by-default with one explicit unsafe opt-in', () => {
    expect(() => serveSSH({
      host: '127.0.0.1',
      port: 0,
      uid: 0,
      gid: 0,
      keyPath: '/unused',
      authorizedKeysPath: '',
    })).toThrow('SSH server authentication is required');
    expect(serverConfigFromEnv({ VHS_ALLOW_UNAUTHENTICATED: '1' }).allowUnauthenticated).toBe(true);
    expect(serverConfigFromEnv({ VHS_ALLOW_UNAUTHENTICATED: '0' }).allowUnauthenticated).toBe(false);
  });

  test('SSH rendering overrides media traversal and rejects every file-writing output class', () => {
    expect(serverOutputExtension('Output ../../outside.gif')).toBe('.gif');
    expect(() => serverOutputExtension('Output ../../outside.test')).toThrow('not allowed');
    expect(() => serverOutputExtension('Output ../../frames/')).toThrow('not allowed');
    expect(() => serverOutputExtension('Screenshot ../../outside.png')).toThrow('not allowed');
  });

  test('partial UID/GID configuration applies every requested privilege in safe order', () => {
    const base = {
      host: 'localhost',
      port: 1976,
      keyPath: 'key',
      authorizedKeysPath: 'authorized_keys',
    };
    const calls: string[] = [];
    const operations = {
      setgid: (gid: number) => calls.push(`gid:${gid}`),
      setuid: (uid: number) => calls.push(`uid:${uid}`),
    };
    dropPrivileges({ ...base, gid: 20, uid: 0 }, operations);
    dropPrivileges({ ...base, gid: 0, uid: 501 }, operations);
    dropPrivileges({ ...base, gid: 21, uid: 502 }, operations);
    expect(calls).toEqual(['gid:20', 'uid:501', 'gid:21', 'uid:502']);

    expect(() => dropPrivileges({ ...base, gid: 20, uid: 0 }, {})).toThrow('VHS_GID');
    expect(() => dropPrivileges({ ...base, gid: 0, uid: 501 }, {})).toThrow('VHS_UID');
  });
  test('forced SSH shutdown destroys stuck connections and aborts active renders', () => {
    let connectionOpen = true;
    const controller = new AbortController();
    forceCloseSSHResources(
      [{ end() {}, _sock: { destroy() { connectionOpen = false; } } }],
      [{ controller }],
    );
    expect(connectionOpen).toBe(false);
    expect(controller.signal.aborted).toBe(true);
  });

  test('decoration colors accept short, long, prefixed, and unprefixed hex', () => {
    expect(parseHexColor('#fff')).toEqual([255, 255, 255, 255]);
    expect(parseHexColor('#1234')).toEqual([17, 34, 51, 68]);
    expect(parseHexColor('abcdef')).toEqual([171, 205, 239, 255]);
    expect(parseHexColor('abcdef80')).toEqual([171, 205, 239, 128]);
  });

  test('Set MarginFill accepts every CSS hex width with and without a prefix', () => {
    for (const color of ['#fff', '#ffff', '#ffffff', '#ffffffff', 'fff', 'ffff', 'ffffff', 'ffffffff']) {
      const value = color.startsWith('#') ? `"${color}"` : color;
      const parser = new Parser(new Lexer(`Set MarginFill ${value}`));
      parser.parse();
      expect(parser.getErrors()).toEqual([]);
    }
  });

  test('an already-aborted ffmpeg render never spawns a process', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancel render'));
    await expect(runFFmpeg([], controller.signal)).rejects.toThrow('cancel render');
  });

  test('abort kills a stuck clipboard helper process', async () => {
    const controller = new AbortController();
    const pending = runClipboardCommand(
      { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] },
      undefined,
      controller.signal,
    );
    controller.abort(new Error('stop clipboard'));
    await expect(pending).rejects.toThrow('stop clipboard');
  });

  test('browser close timeout force-kills a process when graceful close never settles', async () => {
    let killed = false;
    await closeBrowserWithTimeout({
      close: () => new Promise<void>(() => {}),
      process: () => ({
        kill: () => {
          killed = true;
          return true;
        },
      }),
    }, 0);
    expect(killed).toBe(true);
  });

  test('abort releases a never-resolving frame capture and closes browser and TTY resources', async () => {
    const controller = new AbortController();
    let browserClosed = false;
    let ttyStopped = false;
    const browser: BrowserInterface = {
      async launch() {},
      async close() { browserClosed = true; },
      async waitForTerminal() {},
      async typeKey() {},
      async typeText() {},
      async inputText() {},
      async evaluate<T>() { return undefined as T; },
      async getCurrentLine() { return ''; },
      async getBuffer() { return []; },
      async waitForIdle() {},
      async scroll() {},
      captureTextCanvas() { return new Promise<Buffer>(() => {}); },
      async captureCursorCanvas() { return Buffer.from('cursor'); },
      async setViewport() {},
    };
    const tty: TTYInterface = {
      async start() {},
      async stop() { ttyStopped = true; },
      async getPort() { return 7681; },
    };
    const result = await evaluate('Sleep 1m', {
      browser,
      tty,
      output: (message) => {
        if (message === 'SLEEP 1m') controller.abort(new Error('stop evaluation'));
      },
      signal: controller.signal,
    });
    expect(result.errors[0]?.message).toBe('stop evaluation');
    expect(browserClosed).toBe(true);
    expect(ttyStopped).toBe(true);
  });

  test('visible buffer lookup includes viewportY and sandbox opt-out requires a non-empty value', async () => {
    expect(chromeSandboxArgs(undefined)).toEqual([]);
    expect(chromeSandboxArgs('')).toEqual([]);
    expect(chromeSandboxArgs('0')).toEqual(['--no-sandbox', '--disable-setuid-sandbox']);

    const browser = new PuppeteerBrowser();
    const requestedLines: number[] = [];
    const globalWithTerm = globalThis as typeof globalThis & { term?: unknown };
    const previousTerm = globalWithTerm.term;
    Object.assign(browser, {
      page: {
        evaluate: async (reader: () => unknown) => {
          globalWithTerm.term = {
            rows: 2,
            buffer: {
              active: {
                viewportY: 7,
                getLine: (index: number) => {
                  requestedLines.push(index);
                  return { translateToString: () => `line-${index}` };
                },
              },
            },
          };
          try {
            return reader();
          } finally {
            globalWithTerm.term = previousTerm;
          }
        },
      },
    });
    expect(await browser.getBuffer()).toEqual(['line-7', 'line-8']);
    expect(requestedLines).toEqual([7, 8]);
  });

  test('recorder normalizes uppercase and underscore command tokens before compression', () => {
    expect(inputToTape('SLEEP\nSLEEP\nBACKSPACE\nPAGE_UP\nPAGE_UP\n')).toBe(
      'Sleep 1s\nBackspace\nPageUp 2\n',
    );
  });

  test('recorder quoting round-trips every tape delimiter and a trailing slash', () => {
    const value = "a\"b'c`d\\";
    const parser = new Parser(new Lexer(inputToTape(value)));
    expect(parser.parse()[0]?.args).toBe(value);
    expect(parser.getErrors()).toEqual([]);
  });

  test('command lookup uses PATH directly and treats Windows environment keys case-insensitively', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-path-'));
    const executable = path.join(directory, 'tool');
    try {
      fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      expect(await isCommandAvailable('tool', { PATH: directory }, 'darwin')).toBe(true);
      expect(executableCandidates(
        'tool',
        { Path: 'C:\\bin;D:\\tools', Pathext: '.EXE;.CMD' },
        'win32',
      )).toEqual([
        'C:\\bin\\tool.EXE',
        'C:\\bin\\tool.CMD',
        'D:\\tools\\tool.EXE',
        'D:\\tools\\tool.CMD',
      ]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('concurrent evaluations keep Env state local to their own TTY process', async () => {
    const variable = 'VHS_PARITY_ENV_ISOLATION';
    const previous = process.env[variable];
    const received: Array<Record<string, string> | undefined> = [];
    const makeBrowser = (): BrowserInterface => ({
      async launch() {},
      async close() {},
      async waitForTerminal() {},
      async typeKey() {},
      async typeText() {},
      async inputText() {},
      async evaluate<T>() { return undefined as T; },
      async getCurrentLine() { return ''; },
      async getBuffer() { return []; },
      async waitForIdle() {},
      async scroll() {},
      async captureTextCanvas() { return Buffer.from('text'); },
      async captureCursorCanvas() { return Buffer.from('cursor'); },
      async setViewport() {},
    });
    const makeTTY = (): TTYInterface => ({
      async start(_port, _shell, env) { received.push(env); },
      async stop() {},
      async getPort() { return 7681; },
    });
    try {
      const [left, right] = await Promise.all([
        evaluate(`Env ${variable} left`, { browser: makeBrowser(), tty: makeTTY(), output: () => {} }),
        evaluate(`Env ${variable} right`, { browser: makeBrowser(), tty: makeTTY(), output: () => {} }),
      ]);
      expect(left.errors).toEqual([]);
      expect(right.errors).toEqual([]);
      expect(received.map((env) => env?.[variable]).sort()).toEqual(['left', 'right']);
      expect(process.env[variable]).toBe(previous);
    } finally {
      if (previous === undefined) delete process.env[variable];
      else process.env[variable] = previous;
    }
  });

  test('repeatable outputs preserve every path and unknown extensions retain GIF fallback', () => {
    const parser = new Parser(new Lexer(`
Output first.gif
Output second.gif
Output first.mp4
Output second.mp4
`));
    const commands = parser.parse();
    expect(collectMediaOutputPaths([
      ...commands,
      { type: TokenType.OUTPUT, options: '.foo', args: 'fallback.foo' },
    ])).toEqual({
      gif: ['first.gif', 'second.gif', 'fallback.foo'],
      mp4: ['first.mp4', 'second.mp4'],
      webm: [],
    });
    expect(collectMediaOutputPaths(commands, ['a.webm', 'b.webm'])).toEqual({
      gif: [],
      mp4: [],
      webm: ['a.webm', 'b.webm'],
    });
  });

  test('frame sequences use image2 framerate before each input', () => {
    const video = defaultVideoOptions();
    try {
      const args = buildFFmpegArgs({
        textFrames: 'text-%05d.png',
        cursorFrames: 'cursor-%05d.png',
        framerate: 30,
        videoOpts: video,
        outputPath: 'out.gif',
        format: 'gif',
      });
      expect(args.slice(0, 13)).toEqual([
        '-y',
        '-framerate', '30',
        '-start_number', String(video.startingFrame),
        '-i', 'text-%05d.png',
        '-framerate', '30',
        '-start_number', String(video.startingFrame),
        '-i', 'cursor-%05d.png',
      ]);
    } finally {
      fs.rmSync(video.input, { recursive: true, force: true });
    }
  });
});
