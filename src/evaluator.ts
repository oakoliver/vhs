/**
 * @oakoliver/vhs — Evaluator for VHS tape files
 *
 * Zero-dependency TypeScript port of Charmbracelet's VHS evaluator module.
 *
 * @module
 */

import { Lexer } from './lexer';
import { Parser, Command, formatParserError } from './parser';
import { TokenType } from './token';
import { VHSOptions, defaultVHSOptions, parseDuration } from './vhs';
import { executeCommand, VHSContext, KeyCode, KeyModifiers } from './command';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error for invalid syntax in tape file.
 */
export class InvalidSyntaxError extends Error {
  constructor(public errors: { msg: string }[]) {
    const messages = errors.map((e) => formatParserError(e as any)).join('\n');
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
  start(port: number, shell: { command: string[]; env: string[] }): Promise<void>;

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
interface RecordingState {
  recording: boolean;
  frameCounter: number;
  totalFrames: number;
  screenshotNextFrame: string | null;
}

/**
 * Create a VHS context from options and browser interface.
 */
function createVHSContext(
  options: VHSOptions,
  browser: BrowserInterface,
  state: RecordingState
): VHSContext {
  return {
    options,
    recording: state.recording,

    pauseRecording() {
      state.recording = false;
    },

    resumeRecording() {
      state.recording = true;
    },

    async typeKey(code: KeyCode, modifiers?: KeyModifiers) {
      await browser.typeKey(code, modifiers);
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

    screenshotNextFrame(path: string) {
      state.screenshotNextFrame = path;
    },

    async saveOutput() {
      // Save terminal output for testing
      if (options.test.output) {
        const lines = await browser.getBuffer();
        fs.writeFileSync(options.test.output, lines.join('\n'));
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
async function recordFrames(
  browser: BrowserInterface,
  options: VHSOptions,
  state: RecordingState,
  abortSignal: AbortSignal
): Promise<void> {
  const interval = 1000 / options.video.framerate;
  const framesDir = options.video.input;

  const textFrameFormat = 'frame-text-%05d.png';
  const cursorFrameFormat = 'frame-cursor-%05d.png';

  const formatFrameNumber = (n: number): string => {
    return n.toString().padStart(5, '0');
  };

  while (!abortSignal.aborted) {
    const startTime = Date.now();

    if (state.recording) {
      try {
        const textBuffer = await browser.captureTextCanvas();
        const cursorBuffer = await browser.captureCursorCanvas();

        state.frameCounter++;
        const frameNum = formatFrameNumber(state.frameCounter);

        fs.writeFileSync(path.join(framesDir, `frame-text-${frameNum}.png`), textBuffer);
        fs.writeFileSync(path.join(framesDir, `frame-cursor-${frameNum}.png`), cursorBuffer);

        // Handle screenshot request
        if (state.screenshotNextFrame) {
          fs.copyFileSync(
            path.join(framesDir, `frame-text-${frameNum}.png`),
            state.screenshotNextFrame
          );
          state.screenshotNextFrame = null;
        }
      } catch (err) {
        console.error('Error capturing frame:', err);
      }
    }

    const elapsed = Date.now() - startTime;
    const sleepTime = Math.max(0, interval - elapsed);
    await new Promise((resolve) => setTimeout(resolve, sleepTime));
  }

  state.totalFrames = state.frameCounter;
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
  const output = evalOptions.output || console.log;

  // Parse the tape
  const { commands, errors: parseErrors } = parseTape(tape);
  if (parseErrors.length > 0) {
    return { errors: parseErrors };
  }

  // Initialize options
  const options = defaultVHSOptions();
  const state: RecordingState = {
    recording: true,
    frameCounter: 0,
    totalFrames: 0,
    screenshotNextFrame: null,
  };

  // Check if browser and tty interfaces are provided
  if (!evalOptions.browser || !evalOptions.tty) {
    return {
      errors: [new Error('Browser and TTY interfaces are required. Use createDefaultEvaluator() for built-in support.')],
    };
  }

  const browser = evalOptions.browser;
  const tty = evalOptions.tty;

  try {
    // Pre-process: Execute Shell and Env settings before starting
    for (const cmd of commands) {
      if ((cmd.type === TokenType.SET && cmd.options === 'Shell') || cmd.type === TokenType.ENV) {
        const ctx = createVHSContext(options, browser, state);
        await executeCommand(cmd, ctx);
      }
    }

    // Start TTY server
    const port = await tty.getPort();
    await tty.start(port, options.shell);

    // Launch browser
    await browser.launch(`http://localhost:${port}`, {
      width: options.video.style.width,
      height: options.video.style.height,
    });

    // Wait for terminal to be ready
    await browser.waitForTerminal();

    // Find offset (first non-setting command)
    let offset = 0;
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (
        cmd.type === TokenType.SET ||
        cmd.type === TokenType.OUTPUT ||
        cmd.type === TokenType.REQUIRE
      ) {
        output(`${cmd.type} ${cmd.options} ${cmd.args}`);
        if (cmd.options !== 'Shell') {
          const ctx = createVHSContext(options, browser, state);
          await executeCommand(cmd, ctx);
        }
      } else {
        offset = i;
        break;
      }
    }

    // Validate dimensions
    const { minWidth, minHeight } = getMinDimensions(options);
    if (options.video.style.height < minHeight || options.video.style.width < minWidth) {
      return {
        errors: [new Error(`Dimensions must be at least ${minWidth} x ${minHeight}`)],
      };
    }

    // Setup terminal (viewport, theme, etc.)
    const style = options.video.style;
    const padding = style.padding;
    const margin = style.marginFill ? style.margin : 0;
    const bar = style.windowBar ? style.windowBarSize : 0;
    const width = style.width - double(padding) - double(margin);
    const height = style.height - double(padding) - double(margin) - bar;

    await browser.setViewport(width, height);
    await browser.evaluate(`() => {
      term.options = {
        fontSize: ${options.fontSize},
        fontFamily: '${options.fontFamily}',
        letterSpacing: ${options.letterSpacing},
        lineHeight: ${options.lineHeight},
        theme: ${JSON.stringify(options.theme)},
        cursorBlink: ${options.cursorBlink}
      };
      term.fit();
    }`);

    // Create frames directory
    fs.mkdirSync(options.video.input, { recursive: true });

    // Handle hidden commands before recording
    if (commands[offset]?.type === TokenType.HIDE) {
      for (let i = offset; i < commands.length; i++) {
        const cmd = commands[i];
        if (cmd.type === TokenType.SHOW) {
          offset = i;
          break;
        }
        output(`(hidden) ${cmd.type} ${cmd.args}`);
        const ctx = createVHSContext(options, browser, state);
        await executeCommand(cmd, ctx);
      }
    }

    // Start recording
    const abortController = new AbortController();
    const recordingPromise = recordFrames(browser, options, state, abortController.signal);

    // Execute remaining commands
    try {
      for (let i = offset; i < commands.length; i++) {
        const cmd = commands[i];

        // Skip settings that should have been at the top
        const isSetting = cmd.type === TokenType.SET && cmd.options !== 'TypingSpeed';
        if (isSetting) {
          output(`WARN: 'Set ${cmd.options} ${cmd.args}' has been ignored. Move the directive to the top of the file.`);
          continue;
        }

        if (cmd.type === TokenType.REQUIRE) {
          continue;
        }

        output(`${cmd.type} ${cmd.args}`);
        const ctx = createVHSContext(options, browser, state);
        await executeCommand(cmd, ctx);
      }
    } finally {
      // Stop recording
      abortController.abort();
      await recordingPromise;
    }

    // Generate output video
    await render(options);

    // Cleanup
    if (options.video.output.frames) {
      // Move frames to output directory
      fs.renameSync(options.video.input, options.video.output.frames);
    } else {
      // Remove temporary frames
      fs.rmSync(options.video.input, { recursive: true, force: true });
    }

    return { errors: [] };
  } catch (err) {
    return { errors: [err instanceof Error ? err : new Error(String(err))] };
  } finally {
    // Cleanup
    try {
      await browser.close();
    } catch {}
    try {
      await tty.stop();
    } catch {}
  }
}

/**
 * Render the final output video.
 */
async function render(options: VHSOptions): Promise<void> {
  // Import ffmpeg utilities
  const { makeGIF, makeMP4, makeWebM } = await import('./ffmpeg');

  if (options.video.output.gif) {
    await makeGIF(options.video);
  }
  if (options.video.output.mp4) {
    await makeMP4(options.video);
  }
  if (options.video.output.webm) {
    await makeWebM(options.video);
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

// ============================================================================
// Exports
// ============================================================================

export { createVHSContext };
