/**
 * @oakoliver/vhs — Evaluator for VHS tape files
 *
 * TypeScript port of Charmbracelet VHS v0.11.0 evaluation.
 *
 * @module
 */

import { Lexer } from './lexer.js';
import { Parser, formatParserError } from './parser.js';
import type { Command, ParserError } from './parser.js';
import { TokenType } from './token.js';
import { defaultVHSOptions } from './vhs.js';
import type { VHSOptions } from './vhs.js';
import { executeCommand } from './command.js';
import type { VHSContext, KeyCode, KeyModifiers } from './command.js';
import { DefaultTTY } from './tty.js';
import { PuppeteerBrowser } from './browser.js';
import { SystemClipboard } from './clipboard.js';
import type { ClipboardInterface } from './clipboard.js';
import { makeGIF, makeMP4, makeWebM, makeScreenshot } from './ffmpeg.js';
import { withResolvers } from './promise.js';
import * as fs from 'fs';
import * as path from 'path';
const defaultClipboard = new SystemClipboard();

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error for invalid syntax in tape file.
 */
export class InvalidSyntaxError extends Error {
  constructor(public errors: ParserError[]) {
    const messages = errors.map(formatParserError).join('\n');
    super(`Invalid syntax:\n${messages}`);
    this.name = 'InvalidSyntaxError';
  }
}

// ============================================================================
// Evaluator Options
// ============================================================================

/**
 * Evaluator options.
 */
export interface EvaluatorOptions {
  /** Output writer for progress messages */
  output?: (msg: string) => void;

  /** Browser automation interface */
  browser?: BrowserInterface;

  /** TTY interface */
  tty?: TTYInterface;
  /** Replace tape Output commands before rendering */
  outputPaths?: string[];

  /** Abort evaluation between commands */
  signal?: AbortSignal;

  /** Clipboard implementation for Copy and Paste */
  clipboard?: ClipboardInterface;
}

/**
 * Browser automation interface.
 * Implementations should wrap puppeteer, playwright, or similar.
 */
export interface BrowserInterface {
  /** Launch browser and navigate to URL */
  launch(url: string, options?: { width: number; height: number }): Promise<void>;

  /** Close browser */
  close(): Promise<void>;

  /** Wait for terminal to be ready */
  waitForTerminal(): Promise<void>;

  /** Type a key with optional modifiers */
  typeKey(code: KeyCode, modifiers?: KeyModifiers): Promise<void>;
  /** Type a chord while holding intermediate keys */
  typeKeyChord?(codes: KeyCode[], modifiers?: KeyModifiers): Promise<void>;

  /** Type text */
  typeText(text: string, options?: { delay?: number }): Promise<void>;

  /** Input text directly (for non-ASCII) */
  inputText(text: string): Promise<void>;

  /** Execute JavaScript in the page */
  evaluate<T>(fn: string): Promise<T>;

  /** Get current line from terminal */
  getCurrentLine(): Promise<string>;

  /** Get buffer content */
  getBuffer(): Promise<string[]>;

  /** Wait for page to be idle */
  waitForIdle(): Promise<void>;

  /** Scroll terminal viewport */
  scroll(direction: number): Promise<void>;

  /** Capture text canvas as PNG */
  captureTextCanvas(): Promise<Buffer>;

  /** Capture cursor canvas as PNG */
  captureCursorCanvas(): Promise<Buffer>;

  /** Set viewport size */
  setViewport(width: number, height: number): Promise<void>;
}

/**
 * TTY interface for spawning terminal processes.
 */
export interface TTYInterface {
  /** Start TTY server */
  start(
    port: number,
    shell: { command: string[]; env: string[] },
    env?: Record<string, string>,
  ): Promise<void>;

  /** Stop TTY server */
  stop(): Promise<void>;

  /** Get random available port */
  getPort(): Promise<number>;
}

// ============================================================================
// VHS Recording Context
// ============================================================================

/**
 * Recording state.
 */
export interface RecordingState {
  recording: boolean;
  frameCounter: number;
  totalFrames: number;
  screenshotNextFrame: string | null;
  initializedTestOutputs: Set<string>;
}

export function newRecordingState(): RecordingState {
  return {
    recording: true,
    frameCounter: 0,
    totalFrames: 0,
    screenshotNextFrame: null,
    initializedTestOutputs: new Set(),
  };
}

/**
 * Create a VHS context from options and browser interface.
 */
export function createVHSContext(
  options: VHSOptions,
  browser: BrowserInterface,
  state: RecordingState,
  clipboard: ClipboardInterface = defaultClipboard,
  signal?: AbortSignal,
): VHSContext {
  return {
    options,
    get recording() {
      return state.recording;
    },
    clipboard,
    signal,

    pauseRecording() {
      state.recording = false;
    },

    resumeRecording() {
      state.recording = true;
    },

    async typeKey(code: KeyCode, modifiers?: KeyModifiers) {
      await browser.typeKey(code, modifiers);
    },

    async typeKeyChord(codes: KeyCode[], modifiers?: KeyModifiers) {
      if (browser.typeKeyChord) {
        await browser.typeKeyChord(codes, modifiers);
      } else {
        for (const code of codes) await browser.typeKey(code, modifiers);
      }
    },

    async typeText(text: string, opts?: { delay?: number }) {
      await browser.typeText(text, opts);
    },

    async inputText(text: string) {
      await browser.inputText(text);
    },

    async evaluate<T>(fn: string): Promise<T> {
      return browser.evaluate<T>(fn);
    },

    async getCurrentLine(): Promise<string> {
      return browser.getCurrentLine();
    },

    async getBuffer(): Promise<string[]> {
      return browser.getBuffer();
    },

    async waitForIdle() {
      await browser.waitForIdle();
    },

    async scroll(direction: number) {
      await browser.scroll(direction);
    },

    screenshotNextFrame(filePath: string) {
      state.screenshotNextFrame = filePath;
      options.screenshot.frameCaptureEnabled = true;
      options.screenshot.frameCapturePath = filePath;
    },

    async saveOutput() {
      if (!options.test.output) return;
      const outputPath = options.test.output;
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const lines = await browser.getBuffer();
      const contents = `${lines.join('\n')}\n${'─'.repeat(80)}\n`;
      if (state.initializedTestOutputs.has(outputPath)) {
        fs.appendFileSync(outputPath, contents);
      } else {
        fs.writeFileSync(outputPath, contents);
        state.initializedTestOutputs.add(outputPath);
      }
    },
  };
}

// ============================================================================
// Recording
// ============================================================================

/**
 * Recording result.
 */
export interface RecordingResult {
  totalFrames: number;
  framesDir: string;
}

/**
 * Start recording frames.
 */
function waitForFrameInterval(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  const { promise, resolve, reject } = withResolvers<void>();
  let timer: NodeJS.Timeout;
  const onAbort = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    reject(abortError(signal));
  };
  timer = setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();
  return promise;
}

async function recordFrames(
  browser: BrowserInterface,
  options: VHSOptions,
  state: RecordingState,
  abortSignal: AbortSignal
): Promise<void> {
  if (options.video.framerate <= 0) throw new Error('Framerate must be greater than zero');
  const interval = 1000 / options.video.framerate;
  const framesDir = options.video.input;

  try {
    while (!abortSignal.aborted) {
      const startTime = Date.now();

      if (state.recording) {
        const textBuffer = await raceWithAbort(browser.captureTextCanvas(), abortSignal);
        const cursorBuffer = await raceWithAbort(browser.captureCursorCanvas(), abortSignal);
        state.frameCounter++;
        const frameNum = state.frameCounter.toString().padStart(5, '0');
        fs.writeFileSync(path.join(framesDir, `frame-text-${frameNum}.png`), textBuffer);
        fs.writeFileSync(path.join(framesDir, `frame-cursor-${frameNum}.png`), cursorBuffer);

        if (state.screenshotNextFrame) {
          options.screenshot.screenshots.set(state.screenshotNextFrame, state.frameCounter);
          options.screenshot.frameCaptureEnabled = false;
          options.screenshot.frameCapturePath = '';
          state.screenshotNextFrame = null;
        }
      }

      await waitForFrameInterval(Math.max(0, interval - (Date.now() - startTime)), abortSignal);
    }
  } catch (error) {
    if (!abortSignal.aborted) throw error;
  } finally {
    state.totalFrames = state.frameCounter;
  }
}

// ============================================================================
// Evaluation
// ============================================================================

/**
 * Parse and validate a tape file.
 */
export function parseTape(tape: string): { commands: Command[]; errors: Error[] } {
  const lexer = new Lexer(tape);
  const parser = new Parser(lexer);
  const commands = parser.parse();
  const parseErrors = parser.getErrors();

  if (parseErrors.length > 0 || commands.length === 0) {
    return {
      commands: [],
      errors: [new InvalidSyntaxError(parseErrors)],
    };
  }

  return { commands, errors: [] };
}

export interface MediaOutputPaths {
  gif: string[];
  mp4: string[];
  webm: string[];
}

export function collectMediaOutputPaths(
  commands: Command[],
  overrides?: string[],
): MediaOutputPaths {
  const outputs: MediaOutputPaths = { gif: [], mp4: [], webm: [] };
  if (overrides && overrides.length > 0) {
    for (const outputPath of overrides) {
      const extension = path.extname(outputPath).toLowerCase();
      if (extension === '.gif') outputs.gif.push(outputPath);
      else if (extension === '.mp4') outputs.mp4.push(outputPath);
      else if (extension === '.webm') outputs.webm.push(outputPath);
      else throw new Error(`Unsupported output override: ${outputPath}`);
    }
    return outputs;
  }
  for (const command of commands) {
    if (command.type !== TokenType.OUTPUT) continue;
    if (command.options === '.mp4') outputs.mp4.push(command.args);
    else if (command.options === '.webm') outputs.webm.push(command.args);
    else if (!['.png', '.test', '.ascii', '.txt'].includes(command.options)) {
      outputs.gif.push(command.args);
    }
  }
  return outputs;
}

/**
 * Double a value (utility function).
 */
function double(n: number): number {
  return n * 2;
}

/**
 * Calculate minimum dimensions.
 */
function getMinDimensions(options: VHSOptions): { minWidth: number; minHeight: number } {
  const style = options.video.style;
  let minWidth = double(style.padding) + double(style.margin);
  let minHeight = double(style.padding) + double(style.margin);

  if (style.windowBar) {
    minHeight += style.windowBarSize;
  }

  return { minWidth, minHeight };
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Evaluation aborted');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

async function raceWithAbort<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
  cleanupAfterLateCompletion?: () => void,
): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) {
    const settle = cleanupAfterLateCompletion ?? (() => {});
    void operation.then(settle, settle);
    throw abortError(signal);
  }
  const aborted = withResolvers<never>();
  const onAbort = () => aborted.reject(abortError(signal));
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal.aborted) onAbort();
    return await Promise.race([operation, aborted.promise]);
  } catch (error) {
    if (signal.aborted && cleanupAfterLateCompletion) {
      void operation.then(cleanupAfterLateCompletion, cleanupAfterLateCompletion);
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Evaluate a VHS tape file.
 *
 * This is the main entry point for executing a tape file.
 * It parses the tape, sets up the browser and TTY, executes commands,
 * records frames, and generates the output video.
 */
export async function evaluate(
  tape: string,
  evalOptions: EvaluatorOptions = {}
): Promise<{ errors: Error[] }> {
  const output = evalOptions.output ?? console.log;
  const { commands, errors: parseErrors } = parseTape(tape);
  if (parseErrors.length > 0) return { errors: parseErrors };

  const options = defaultVHSOptions();
  const state = newRecordingState();
  const browser = evalOptions.browser ?? new PuppeteerBrowser();
  const tty = evalOptions.tty ?? new DefaultTTY();
  const clipboard = evalOptions.clipboard ?? defaultClipboard;
  const context = createVHSContext(options, browser, state, clipboard, evalOptions.signal);
  let preserveFrames = false;

  try {
    throwIfAborted(evalOptions.signal);
    for (const command of commands) {
      throwIfAborted(evalOptions.signal);
      if ((command.type === TokenType.SET && command.options === 'Shell') || command.type === TokenType.ENV) {
        await raceWithAbort(executeCommand(command, context), evalOptions.signal);
      }
    }

    const port = await raceWithAbort(tty.getPort(), evalOptions.signal);
    throwIfAborted(evalOptions.signal);
    const ttyStart = tty.start(port, options.shell, options.envVars);
    await raceWithAbort(ttyStart, evalOptions.signal, () => {
      void tty.stop().catch(() => {});
    });
    throwIfAborted(evalOptions.signal);
    const browserLaunch = browser.launch(`http://127.0.0.1:${port}`, {
      width: options.video.style.width,
      height: options.video.style.height,
    });
    await raceWithAbort(browserLaunch, evalOptions.signal, () => {
      void browser.close().catch(() => {});
    });
    await raceWithAbort(browser.waitForTerminal(), evalOptions.signal);

    let offset = commands.length;
    for (let index = 0; index < commands.length; index++) {
      throwIfAborted(evalOptions.signal);
      const command = commands[index];
      if (
        command.type === TokenType.SET ||
        command.type === TokenType.OUTPUT ||
        command.type === TokenType.REQUIRE
      ) {
        output(`${command.type} ${command.options} ${command.args}`);
        if (command.options !== 'Shell') {
          await raceWithAbort(executeCommand(command, context), evalOptions.signal);
        }
      } else {
        offset = index;
        break;
      }
    }

    const { minWidth, minHeight } = getMinDimensions(options);
    if (options.video.style.height < minHeight || options.video.style.width < minWidth) {
      throw new Error(`Dimensions must be at least ${minWidth} x ${minHeight}`);
    }

    const style = options.video.style;
    const margin = style.marginFill ? style.margin : 0;
    const windowBar = style.windowBar ? style.windowBarSize : 0;
    const width = style.width - 2 * style.padding - 2 * margin;
    const height = style.height - 2 * style.padding - 2 * margin - windowBar;
    await raceWithAbort(browser.setViewport(width, height), evalOptions.signal);
    await raceWithAbort(browser.evaluate(`() => {
      term.options = {
        fontSize: ${options.fontSize},
        fontFamily: ${JSON.stringify(options.fontFamily)},
        letterSpacing: ${options.letterSpacing},
        lineHeight: ${options.lineHeight},
        theme: ${JSON.stringify(options.theme)},
        cursorBlink: ${options.cursorBlink}
      };
      term.fit();
    }`), evalOptions.signal);

    fs.rmSync(options.video.input, { recursive: true, force: true });
    fs.mkdirSync(options.video.input, { recursive: true });

    if (commands[offset]?.type === TokenType.HIDE) {
      for (let index = offset; index < commands.length; index++) {
        throwIfAborted(evalOptions.signal);
        const command = commands[index];
        if (command.type === TokenType.SHOW) {
          offset = index;
          break;
        }
        output(`(hidden) ${command.type} ${command.args}`);
        await raceWithAbort(executeCommand(command, context), evalOptions.signal);
      }
    }

    const recordingAbort = new AbortController();
    const onExternalAbort = () => recordingAbort.abort(evalOptions.signal?.reason);
    if (evalOptions.signal?.aborted) recordingAbort.abort(evalOptions.signal.reason);
    evalOptions.signal?.addEventListener('abort', onExternalAbort, { once: true });
    const recordingPromise = recordFrames(browser, options, state, recordingAbort.signal);
    try {
      for (let index = offset; index < commands.length; index++) {
        throwIfAborted(evalOptions.signal);

        const command = commands[index];
        const lateSetting = command.type === TokenType.SET && command.options !== 'TypingSpeed';
        if (lateSetting) {
          output(
            `WARN: 'Set ${command.options} ${command.args}' has been ignored. ` +
              'Move the directive to the top of the file.'
          );
          continue;
        }
        if (command.type === TokenType.REQUIRE) continue;

        output(`${command.type} ${command.args}`);
        await raceWithAbort(executeCommand(command, context), evalOptions.signal);
      }
    } finally {
      recordingAbort.abort();
      evalOptions.signal?.removeEventListener('abort', onExternalAbort);
      await recordingPromise;
    }

    const mediaOutputs = collectMediaOutputPaths(commands, evalOptions.outputPaths);
    options.video.output.gif = '';
    options.video.output.mp4 = '';
    options.video.output.webm = '';
    await render(options, state.totalFrames, mediaOutputs, evalOptions.signal);
    throwIfAborted(evalOptions.signal);
    if (options.video.output.frames) {
      fs.renameSync(options.video.input, options.video.output.frames);
      preserveFrames = true;
    }
    return { errors: [] };
  } catch (error) {
    return { errors: [error instanceof Error ? error : new Error(String(error))] };
  } finally {
    try {
      await browser.close();
    } catch {}
    try {
      await tty.stop();
    } catch {}
    if (!preserveFrames) {
      fs.rmSync(options.video.input, { recursive: true, force: true });
    }
  }
}

/** Rotate the encoded frame sequence according to Set LoopOffset. */
export function applyLoopOffset(options: VHSOptions, totalFrames: number): void {
  if (totalFrames <= 0) throw new Error('no frames');
  const offsetFrames = Math.ceil((options.loopOffset / 100) * totalFrames) % totalFrames;
  if (offsetFrames <= 0) return;

  const firstFrame = options.video.startingFrame;
  for (let frame = firstFrame; frame <= offsetFrames; frame++) {
    const sourceNumber = frame.toString().padStart(5, '0');
    const targetNumber = (frame + totalFrames).toString().padStart(5, '0');
    fs.renameSync(
      path.join(options.video.input, `frame-cursor-${sourceNumber}.png`),
      path.join(options.video.input, `frame-cursor-${targetNumber}.png`)
    );
    fs.renameSync(
      path.join(options.video.input, `frame-text-${sourceNumber}.png`),
      path.join(options.video.input, `frame-text-${targetNumber}.png`)
    );
  }
  for (const [screenshotPath, frame] of options.screenshot.screenshots) {
    if (frame >= firstFrame && frame <= offsetFrames) {
      options.screenshot.screenshots.set(screenshotPath, frame + totalFrames);
    }
  }
  options.video.startingFrame = offsetFrames + 1;
}

async function render(
  options: VHSOptions,
  totalFrames: number,
  outputs: MediaOutputPaths,
  signal?: AbortSignal,
): Promise<void> {
  applyLoopOffset(options, totalFrames);
  for (const outputPath of outputs.gif) {
    options.video.output.gif = outputPath;
    await makeGIF(options.video, signal);
  }
  for (const outputPath of outputs.mp4) {
    options.video.output.mp4 = outputPath;
    await makeMP4(options.video, signal);
  }
  for (const outputPath of outputs.webm) {
    options.video.output.webm = outputPath;
    await makeWebM(options.video, signal);
  }
  for (const [outputPath, frame] of options.screenshot.screenshots) {
    const frameNumber = frame.toString().padStart(5, '0');
    await makeScreenshot(
      path.join(options.screenshot.input, `frame-text-${frameNumber}.png`),
      path.join(options.screenshot.input, `frame-cursor-${frameNumber}.png`),
      options.screenshot.style,
      outputPath,
      signal,
    );
  }
}

/**
 * Evaluate a tape file by path.
 */
export async function evaluateFile(
  tapePath: string,
  options: EvaluatorOptions = {}
): Promise<{ errors: Error[] }> {
  const tape = fs.readFileSync(tapePath, 'utf-8');
  return evaluate(tape, options);
}
