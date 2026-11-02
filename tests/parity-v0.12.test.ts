import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { evaluate, resolveRowsColumns, type BrowserInterface, type TTYInterface } from '../src/evaluator';
import { settingsExecutors, executeCommand, type VHSContext } from '../src/command';
import { parseArgs, resolveTapePath, runCLI, MANUAL, VERSION } from '../src/cli';
import { Lexer } from '../src/lexer';
import { Parser, parseTape } from '../src/parser';
import { TokenType, isSetting, Keywords } from '../src/token';
import { runFFmpeg } from '../src/ffmpeg';
import { defaultVHSOptions } from '../src/vhs';

/**
 * Ported from the VHS v0.11.0...v0.12.1 test changes
 * (command_test.go, evaluator_test.go, lexer_test.go, parser_test.go).
 */

const setting = (name: string, args: string) => ({ type: TokenType.SET, options: name, args });
const newContext = () => ({ options: defaultVHSOptions() }) as unknown as VHSContext;
const cleanup = (ctx: VHSContext) => fs.rmSync(ctx.options.video.input, { recursive: true, force: true });

/**
 * A stand-in for xterm.js's fit addon: the terminal holds floor(width / cell)
 * columns and floor(height / cell) rows for the current viewport, like the
 * real one, and the cell size depends on the font and line height.
 */
function fakeTerminal(cellWidth = 17, cellHeight = 37) {
  const state = { width: 0, height: 0, cols: 0, rows: 0, fits: 0, viewports: [] as Array<[number, number]>, measurements: 0 };
  const browser: BrowserInterface = {
    async launch() {},
    async close() {},
    async waitForTerminal() {},
    async typeKey() {},
    async typeText() {},
    async inputText() {},
    async evaluate<T>(fn: string): Promise<T> {
      if (fn.includes('term.fit()')) {
        state.fits++;
        state.cols = Math.floor(state.width / cellWidth);
        state.rows = Math.floor(state.height / cellHeight);
      }
      if (fn.includes('cols: term.cols')) {
        state.measurements++;
        return { cols: state.cols, rows: state.rows } as T;
      }
      return undefined as T;
    },
    async getCurrentLine() { return '> '; },
    async getBuffer() { return ['> ']; },
    async waitForIdle() {},
    async scroll() {},
    async captureTextCanvas() { return Buffer.from('text'); },
    async captureCursorCanvas() { return Buffer.from('cursor'); },
    async setViewport(width, height) {
      state.width = width;
      state.height = height;
      state.viewports.push([width, height]);
    },
  };
  return { browser, state, cellWidth, cellHeight };
}

/** The content size lies in [cells * cell, (cells + 1) * cell): exactly that many cells fit. */
const fitsExactly = (content: number, cell: number, cells: number) =>
  content >= cells * cell && content < (cells + 1) * cell;

const makeTTY = (): TTYInterface => ({ async start() {}, async stop() {}, async getPort() { return 7681; } });

describe('VHS v0.12.1 parity', () => {
  describe('Set Rows and Set Columns (v0.12.0, #763)', () => {
    test('the keywords are settings', () => {
      expect(Keywords.Rows).toBe(TokenType.ROWS);
      expect(Keywords.Columns).toBe(TokenType.COLUMNS);
      expect(isSetting(TokenType.ROWS)).toBe(true);
      expect(isSetting(TokenType.COLUMNS)).toBe(true);
      expect(Object.keys(settingsExecutors)).toEqual(expect.arrayContaining(['Rows', 'Columns']));
    });

    test('validate accepts them, where they used to be "Unknown setting"', () => {
      const result = parseTape('Set Rows 40\nSet Columns 100');
      expect(result.errors).toEqual([]);
      expect(new Parser(new Lexer('Set Rows 40')).parse()).toEqual([setting('Rows', '40')]);
    });

    test('rows and columns are stored on the style', async () => {
      const ctx = newContext();
      try {
        await settingsExecutors.Rows(setting('Rows', '40'), ctx);
        await settingsExecutors.Columns(setting('Columns', '100'), ctx);
        expect(ctx.options.video.style.rows).toBe(40);
        expect(ctx.options.video.style.columns).toBe(100);
        // Width/Height are left alone until the terminal is measured.
        expect(ctx.options.video.style.width).toBe(1200);
        expect(ctx.options.video.style.height).toBe(600);
      } finally {
        cleanup(ctx);
      }
    });

    test('rows and columns must be positive integers', async () => {
      const ctx = newContext();
      try {
        await expect(settingsExecutors.Rows(setting('Rows', '0'), ctx)).rejects.toThrow('rows must be a positive integer');
        await expect(settingsExecutors.Columns(setting('Columns', '0'), ctx)).rejects.toThrow('columns must be a positive integer');
        await expect(settingsExecutors.Rows(setting('Rows', '-3'), ctx)).rejects.toThrow('rows must be a positive integer');
        await expect(settingsExecutors.Rows(setting('Rows', 'abc'), ctx)).rejects.toThrow('rows');
        expect(ctx.options.video.style.rows).toBe(0);
        expect(ctx.options.video.style.columns).toBe(0);
      } finally {
        cleanup(ctx);
      }
    });

    test('Height then Rows conflict', async () => {
      const ctx = newContext();
      try {
        await settingsExecutors.Height(setting('Height', '600'), ctx);
        await expect(settingsExecutors.Rows(setting('Rows', '40'), ctx)).rejects.toThrow('cannot set both Height and Rows');
        expect(ctx.options.video.style.rows).toBe(0);
      } finally {
        cleanup(ctx);
      }
    });

    test('Rows then Height conflict', async () => {
      const ctx = newContext();
      try {
        await settingsExecutors.Rows(setting('Rows', '40'), ctx);
        const defaultHeight = ctx.options.video.style.height;
        await expect(settingsExecutors.Height(setting('Height', '700'), ctx)).rejects.toThrow('cannot set both Height and Rows');
        expect(ctx.options.video.style.height).toBe(defaultHeight);
      } finally {
        cleanup(ctx);
      }
    });

    test('Width then Columns conflict', async () => {
      const ctx = newContext();
      try {
        await settingsExecutors.Width(setting('Width', '1200'), ctx);
        await expect(settingsExecutors.Columns(setting('Columns', '100'), ctx)).rejects.toThrow('cannot set both Width and Columns');
        expect(ctx.options.video.style.columns).toBe(0);
      } finally {
        cleanup(ctx);
      }
    });

    test('Columns then Width conflict', async () => {
      const ctx = newContext();
      try {
        await settingsExecutors.Columns(setting('Columns', '100'), ctx);
        const defaultWidth = ctx.options.video.style.width;
        await expect(settingsExecutors.Width(setting('Width', '1300'), ctx)).rejects.toThrow('cannot set both Width and Columns');
        expect(ctx.options.video.style.width).toBe(defaultWidth);
      } finally {
        cleanup(ctx);
      }
    });

    test('Width and Rows can coexist', async () => {
      const ctx = newContext();
      try {
        await settingsExecutors.Width(setting('Width', '1200'), ctx);
        await settingsExecutors.Rows(setting('Rows', '40'), ctx);
        expect(ctx.options.video.style.rows).toBe(40);
      } finally {
        cleanup(ctx);
      }
    });

    test('Height and Columns can coexist', async () => {
      const ctx = newContext();
      try {
        await settingsExecutors.Height(setting('Height', '600'), ctx);
        await settingsExecutors.Columns(setting('Columns', '100'), ctx);
        expect(ctx.options.video.style.columns).toBe(100);
      } finally {
        cleanup(ctx);
      }
    });

    test('a Set Height equal to the default still counts as explicit', async () => {
      const ctx = newContext();
      try {
        await executeCommand(setting('Height', '600'), ctx);
        await expect(executeCommand(setting('Rows', '10'), ctx)).rejects.toThrow('cannot set both Height and Rows');
      } finally {
        cleanup(ctx);
      }
    });

    test('resolveRowsColumns derives a pixel size that fits exactly the grid', async () => {
      const { browser, state, cellWidth, cellHeight } = fakeTerminal();
      const ctx = newContext();
      try {
        const style = ctx.options.video.style;
        style.columns = 30;
        style.rows = 8;
        await resolveRowsColumns(browser, style, 60, 0, 0);
        // The estimate from the probe can sit a few pixels above the minimum, as
        // upstream's does, so assert the grid rather than one exact size.
        expect(fitsExactly(style.width - 120, cellWidth, 30)).toBe(true);
        expect(fitsExactly(style.height - 120, cellHeight, 8)).toBe(true);
        expect(style.width % 2).toBe(0);
        expect(style.height % 2).toBe(0);
        // The last measured viewport holds exactly the requested grid.
        expect(state.cols).toBe(30);
        expect(state.rows).toBe(8);
      } finally {
        cleanup(ctx);
      }
    });

    test('resolveRowsColumns adds margin and window bar, and rounds up to an even size', async () => {
      const { browser, state } = fakeTerminal(11, 23);
      const ctx = newContext();
      try {
        const style = ctx.options.video.style;
        style.columns = 41;
        style.rows = 9;
        await resolveRowsColumns(browser, style, 5, 10, 30);
        expect(fitsExactly(style.width - 30, 11, 41)).toBe(true); // padding 2 * 5 + margin 2 * 10
        expect(fitsExactly(style.height - 60, 23, 9)).toBe(true); // + window bar 30
        expect(style.width % 2).toBe(0);
        expect(style.height % 2).toBe(0);
        expect(state.cols).toBe(41);
        expect(state.rows).toBe(9);
      } finally {
        cleanup(ctx);
      }
    });

    test('Columns alone leaves the height alone, and Rows alone the width', async () => {
      const { browser } = fakeTerminal();
      const ctx = newContext();
      try {
        const style = ctx.options.video.style;
        style.columns = 50;
        await resolveRowsColumns(browser, style, 60, 0, 0);
        expect(style.height).toBe(600);
        expect(fitsExactly(style.width - 120, 17, 50)).toBe(true);
        style.columns = 0;
        style.rows = 5;
        style.width = 1200;
        await resolveRowsColumns(browser, style, 60, 0, 0);
        expect(style.width).toBe(1200);
        expect(fitsExactly(style.height - 120, 37, 5)).toBe(true);
      } finally {
        cleanup(ctx);
      }
    });

    test('a terminal that is too small is probed at a larger size until it fits', async () => {
      const { browser, state } = fakeTerminal();
      const ctx = newContext();
      try {
        const style = ctx.options.video.style;
        style.columns = 400; // 400 * 17 = 6800 px, far beyond the 1080 px probe
        await resolveRowsColumns(browser, style, 60, 0, 0);
        expect(fitsExactly(style.width - 120, 17, 400)).toBe(true);
        expect(state.cols).toBe(400);
      } finally {
        cleanup(ctx);
      }
    });

    test('a terminal that never reports a size is an error, not a 0x0 viewport', async () => {
      const { browser, state } = fakeTerminal();
      const silent: BrowserInterface = { ...browser, async evaluate<T>() { return undefined as T; } };
      const ctx = newContext();
      try {
        const style = ctx.options.video.style;
        style.columns = 30;
        await expect(resolveRowsColumns(silent, style, 60, 0, 0)).rejects.toThrow('could not fit 30 columns: terminal measured 0 columns x 0 rows');
        expect(state.viewports.some(([w, h]) => w <= 0 || h <= 0)).toBe(false);
        expect(style.width).toBe(1200);
      } finally {
        cleanup(ctx);
      }
    });

    test('a grid that never converges is an error', async () => {
      // A terminal whose grid does not move with the viewport after the probe.
      let calls = 0;
      const base = fakeTerminal();
      const stubborn: BrowserInterface = {
        ...base.browser,
        async evaluate<T>(fn: string): Promise<T> {
          if (fn.includes('cols: term.cols')) return { cols: ++calls === 1 ? 100 : 99, rows: 30 } as T;
          return undefined as T;
        },
      };
      const ctx = newContext();
      try {
        const style = ctx.options.video.style;
        style.columns = 80;
        await expect(resolveRowsColumns(stubborn, style, 60, 0, 0)).rejects.toThrow('could not resolve a viewport for 80 columns: closest match was 99 columns');
      } finally {
        cleanup(ctx);
      }
    });

    test('evaluate sizes the viewport from the grid, after the terminal options are applied', async () => {
      const { browser, state } = fakeTerminal();
      const calls: string[] = [];
      const recording: BrowserInterface = {
        ...browser,
        async evaluate<T>(fn: string) {
          calls.push(fn.includes('term.options = {') ? 'options' : fn.includes('term.fit()') ? 'fit' : 'measure');
          return browser.evaluate<T>(fn);
        },
        async setViewport(width, height) {
          calls.push('viewport');
          return browser.setViewport(width, height);
        },
      };
      const messages: string[] = [];
      const result = await evaluate('Set FontSize 32\nSet Rows 10\nSet Columns 40\nSleep 100ms', {
        browser: recording,
        tty: makeTTY(),
        output: (message) => messages.push(message),
      });
      expect(result.errors).toEqual([]);
      // The font options are applied before the first viewport is probed.
      expect(calls.indexOf('options')).toBeGreaterThanOrEqual(0);
      expect(calls.indexOf('options')).toBeLessThan(calls.indexOf('viewport'));
      expect(calls).toContain('measure');
      // Final viewport: exactly 40 columns and 10 rows of content.
      expect(state.cols).toBe(40);
      expect(state.rows).toBe(10);
      const [width, height] = state.viewports[state.viewports.length - 1];
      expect(fitsExactly(width, 17, 40)).toBe(true);
      expect(fitsExactly(height, 37, 10)).toBe(true);
      expect(calls[calls.length - 2]).toBe('viewport');
      expect(calls[calls.length - 1]).toBe('fit');
    });

    test('evaluate without Rows or Columns sets the viewport from Width and Height only', async () => {
      const { browser, state } = fakeTerminal();
      const result = await evaluate('Set Width 800\nSet Height 400\nSet Padding 10\nSleep 100ms', {
        browser, tty: makeTTY(), output: () => {},
      });
      expect(result.errors).toEqual([]);
      expect(state.measurements).toBe(0);
      expect(state.viewports).toEqual([[780, 380]]);
    });

    test('evaluate reports a conflicting Width and Columns', async () => {
      const { browser } = fakeTerminal();
      const result = await evaluate('Set Width 800\nSet Columns 40\nSleep 100ms', {
        browser, tty: makeTTY(), output: () => {},
      });
      expect(result.errors[0]?.message).toBe('cannot set both Width and Columns');
    });

    test('the manual lists them', () => {
      expect(MANUAL).toContain('Columns|Rows');
    });
  });

  describe('tape file extension is optional (v0.12.0, #654)', () => {
    const inTempDir = <T>(fn: (dir: string) => T): T => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-ext-'));
      try {
        return fn(dir);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };

    test('a name without .tape gets it', () => {
      expect(resolveTapePath('demo')).toBe('demo.tape');
      expect(resolveTapePath('dir/demo')).toBe('dir/demo.tape');
    });

    test('a name with .tape is untouched', () => {
      expect(resolveTapePath('demo.tape')).toBe('demo.tape');
    });

    test('a name without .tape that exists on its own is still read as given', () => {
      inTempDir((dir) => {
        const file = path.join(dir, 'demo.vhs');
        fs.writeFileSync(file, 'Sleep 1s\n');
        expect(resolveTapePath(file)).toBe(file);
        // ...unless the .tape file exists too, which wins as upstream.
        fs.writeFileSync(`${file}.tape`, 'Sleep 2s\n');
        expect(resolveTapePath(file)).toBe(`${file}.tape`);
      });
    });

    test('a directory is never mistaken for the tape', () => {
      inTempDir((dir) => {
        const folder = path.join(dir, 'demo');
        fs.mkdirSync(folder);
        expect(resolveTapePath(folder)).toBe(`${folder}.tape`);
      });
    });

    test('the CLI still parses a bare name as a file argument', () => {
      expect(parseArgs(['demo']).files).toEqual(['demo']);
    });
  });

  describe('context and encoder errors (v0.12.1, #788; v0.12.0 context plumbing)', () => {
    // Go: TestRenderMissingFFmpeg. runFFmpeg is the port's render step.
    test('a missing ffmpeg is reported as an error', async () => {
      const original = process.env.PATH;
      process.env.PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-nopath-'));
      try {
        await expect(runFFmpeg(['-version'])).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        process.env.PATH = original;
      }
    });

    // Go: the encoder error is returned instead of only being logged.
    test('a failing encoder fails the evaluation', async () => {
      const { browser } = fakeTerminal();
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-badout-'));
      // An output path below a regular file cannot be created, so ffmpeg fails.
      const blocker = path.join(dir, 'file');
      fs.writeFileSync(blocker, '');
      try {
        const result = await evaluate(`Output "${path.join(blocker, 'out.gif')}"\nSleep 100ms`, {
          browser, tty: makeTTY(), output: () => {},
        });
        expect(result.errors).toHaveLength(1);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    // Go: TestEvaluateGIF cancel_render=true. Cancelling during rendering is
    // reported as cancellation, and the render still gets the live context
    // (v0.12.1 stopped it being handed the recording's cancelled one).
    test('cancelling is reported as the cancellation, and an uncancelled render is not cancelled', async () => {
      const { browser } = fakeTerminal();
      const controller = new AbortController();
      const cancelled = await evaluate('Sleep 1m', {
        browser,
        tty: makeTTY(),
        output: (message) => {
          if (message === 'SLEEP 1m') controller.abort(new Error('canceled'));
        },
        signal: controller.signal,
      });
      expect(cancelled.errors[0]?.message).toBe('canceled');

      const completed = await evaluate('Sleep 100ms', { browser, tty: makeTTY(), output: () => {}, signal: new AbortController().signal });
      expect(completed.errors).toEqual([]);
    });
  });

  test('version and parity statement', () => {
    expect(VERSION).toBe(JSON.parse(fs.readFileSync(path.join(import.meta.dir, '..', 'package.json'), 'utf8')).version);
    const readme = fs.readFileSync(path.join(import.meta.dir, '..', 'README.md'), 'utf8');
    expect(readme).toContain('**v0.12.1**');
    expect(readme).toContain('Since 1.2.0 the default frame rate really is 50 fps');
    expect(JSON.parse(fs.readFileSync(path.join(import.meta.dir, '..', 'package.json'), 'utf8')).version).toBe(VERSION);
  });

  test('upstream changes to themes.json: none', () => {
    // v0.11.0...v0.12.1 does not touch themes.json; the bundled set is unchanged.
    expect(fs.existsSync(path.join(import.meta.dir, '..', 'themes.json'))).toBe(true);
  });
});
