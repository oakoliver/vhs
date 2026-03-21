/**
 * @oakoliver/vhs — Command execution for VHS
 *
 * Zero-dependency TypeScript port of Charmbracelet's VHS command module.
 *
 * This module defines command executors that operate on a VHS instance
 * with browser automation (puppeteer/playwright).
 *
 * @module
 */

import { Command, CommandType } from './parser';
import { TokenType } from './token';
import {
  VHSOptions,
  parseDuration,
  Shells,
  findTheme,
  DefaultTheme,
  Theme,
  themeToString,
} from './vhs';
import * as path from 'path';

// ============================================================================
// Key Codes (CDP compatible)
// ============================================================================

/**
 * Key code definitions for Chrome DevTools Protocol.
 * Based on https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchKeyEvent
 */
export const KeyCodes = {
  // Letters
  KeyA: 'KeyA',
  KeyB: 'KeyB',
  KeyC: 'KeyC',
  KeyD: 'KeyD',
  KeyE: 'KeyE',
  KeyF: 'KeyF',
  KeyG: 'KeyG',
  KeyH: 'KeyH',
  KeyI: 'KeyI',
  KeyJ: 'KeyJ',
  KeyK: 'KeyK',
  KeyL: 'KeyL',
  KeyM: 'KeyM',
  KeyN: 'KeyN',
  KeyO: 'KeyO',
  KeyP: 'KeyP',
  KeyQ: 'KeyQ',
  KeyR: 'KeyR',
  KeyS: 'KeyS',
  KeyT: 'KeyT',
  KeyU: 'KeyU',
  KeyV: 'KeyV',
  KeyW: 'KeyW',
  KeyX: 'KeyX',
  KeyY: 'KeyY',
  KeyZ: 'KeyZ',

  // Digits
  Digit0: 'Digit0',
  Digit1: 'Digit1',
  Digit2: 'Digit2',
  Digit3: 'Digit3',
  Digit4: 'Digit4',
  Digit5: 'Digit5',
  Digit6: 'Digit6',
  Digit7: 'Digit7',
  Digit8: 'Digit8',
  Digit9: 'Digit9',

  // Special keys
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Escape: 'Escape',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',

  // Modifiers
  ShiftLeft: 'ShiftLeft',
  ShiftRight: 'ShiftRight',
  ControlLeft: 'ControlLeft',
  ControlRight: 'ControlRight',
  AltLeft: 'AltLeft',
  AltRight: 'AltRight',
  MetaLeft: 'MetaLeft',
  MetaRight: 'MetaRight',

  // Punctuation & symbols
  Minus: 'Minus',
  Equal: 'Equal',
  BracketLeft: 'BracketLeft',
  BracketRight: 'BracketRight',
  Backslash: 'Backslash',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  Backquote: 'Backquote',
  Comma: 'Comma',
  Period: 'Period',
  Slash: 'Slash',
} as const;

export type KeyCode = (typeof KeyCodes)[keyof typeof KeyCodes];

/**
 * Keymap from character to key code with shift modifier info.
 */
export interface KeyInfo {
  code: KeyCode;
  shift: boolean;
  key: string;
}

/**
 * Map of characters to their key info.
 */
export const keymap: Record<string, KeyInfo> = {
  ' ': { code: KeyCodes.Space, shift: false, key: ' ' },
  '!': { code: KeyCodes.Digit1, shift: true, key: '!' },
  '"': { code: KeyCodes.Quote, shift: true, key: '"' },
  '#': { code: KeyCodes.Digit3, shift: true, key: '#' },
  $: { code: KeyCodes.Digit4, shift: true, key: '$' },
  '%': { code: KeyCodes.Digit5, shift: true, key: '%' },
  '&': { code: KeyCodes.Digit7, shift: true, key: '&' },
  "'": { code: KeyCodes.Quote, shift: false, key: "'" },
  '(': { code: KeyCodes.Digit9, shift: true, key: '(' },
  ')': { code: KeyCodes.Digit0, shift: true, key: ')' },
  '*': { code: KeyCodes.Digit8, shift: true, key: '*' },
  '+': { code: KeyCodes.Equal, shift: true, key: '+' },
  ',': { code: KeyCodes.Comma, shift: false, key: ',' },
  '-': { code: KeyCodes.Minus, shift: false, key: '-' },
  '.': { code: KeyCodes.Period, shift: false, key: '.' },
  '/': { code: KeyCodes.Slash, shift: false, key: '/' },
  '0': { code: KeyCodes.Digit0, shift: false, key: '0' },
  '1': { code: KeyCodes.Digit1, shift: false, key: '1' },
  '2': { code: KeyCodes.Digit2, shift: false, key: '2' },
  '3': { code: KeyCodes.Digit3, shift: false, key: '3' },
  '4': { code: KeyCodes.Digit4, shift: false, key: '4' },
  '5': { code: KeyCodes.Digit5, shift: false, key: '5' },
  '6': { code: KeyCodes.Digit6, shift: false, key: '6' },
  '7': { code: KeyCodes.Digit7, shift: false, key: '7' },
  '8': { code: KeyCodes.Digit8, shift: false, key: '8' },
  '9': { code: KeyCodes.Digit9, shift: false, key: '9' },
  ':': { code: KeyCodes.Semicolon, shift: true, key: ':' },
  ';': { code: KeyCodes.Semicolon, shift: false, key: ';' },
  '<': { code: KeyCodes.Comma, shift: true, key: '<' },
  '=': { code: KeyCodes.Equal, shift: false, key: '=' },
  '>': { code: KeyCodes.Period, shift: true, key: '>' },
  '?': { code: KeyCodes.Slash, shift: true, key: '?' },
  '@': { code: KeyCodes.Digit2, shift: true, key: '@' },
  A: { code: KeyCodes.KeyA, shift: true, key: 'A' },
  B: { code: KeyCodes.KeyB, shift: true, key: 'B' },
  C: { code: KeyCodes.KeyC, shift: true, key: 'C' },
  D: { code: KeyCodes.KeyD, shift: true, key: 'D' },
  E: { code: KeyCodes.KeyE, shift: true, key: 'E' },
  F: { code: KeyCodes.KeyF, shift: true, key: 'F' },
  G: { code: KeyCodes.KeyG, shift: true, key: 'G' },
  H: { code: KeyCodes.KeyH, shift: true, key: 'H' },
  I: { code: KeyCodes.KeyI, shift: true, key: 'I' },
  J: { code: KeyCodes.KeyJ, shift: true, key: 'J' },
  K: { code: KeyCodes.KeyK, shift: true, key: 'K' },
  L: { code: KeyCodes.KeyL, shift: true, key: 'L' },
  M: { code: KeyCodes.KeyM, shift: true, key: 'M' },
  N: { code: KeyCodes.KeyN, shift: true, key: 'N' },
  O: { code: KeyCodes.KeyO, shift: true, key: 'O' },
  P: { code: KeyCodes.KeyP, shift: true, key: 'P' },
  Q: { code: KeyCodes.KeyQ, shift: true, key: 'Q' },
  R: { code: KeyCodes.KeyR, shift: true, key: 'R' },
  S: { code: KeyCodes.KeyS, shift: true, key: 'S' },
  T: { code: KeyCodes.KeyT, shift: true, key: 'T' },
  U: { code: KeyCodes.KeyU, shift: true, key: 'U' },
  V: { code: KeyCodes.KeyV, shift: true, key: 'V' },
  W: { code: KeyCodes.KeyW, shift: true, key: 'W' },
  X: { code: KeyCodes.KeyX, shift: true, key: 'X' },
  Y: { code: KeyCodes.KeyY, shift: true, key: 'Y' },
  Z: { code: KeyCodes.KeyZ, shift: true, key: 'Z' },
  '[': { code: KeyCodes.BracketLeft, shift: false, key: '[' },
  '\\': { code: KeyCodes.Backslash, shift: false, key: '\\' },
  ']': { code: KeyCodes.BracketRight, shift: false, key: ']' },
  '^': { code: KeyCodes.Digit6, shift: true, key: '^' },
  _: { code: KeyCodes.Minus, shift: true, key: '_' },
  '`': { code: KeyCodes.Backquote, shift: false, key: '`' },
  a: { code: KeyCodes.KeyA, shift: false, key: 'a' },
  b: { code: KeyCodes.KeyB, shift: false, key: 'b' },
  c: { code: KeyCodes.KeyC, shift: false, key: 'c' },
  d: { code: KeyCodes.KeyD, shift: false, key: 'd' },
  e: { code: KeyCodes.KeyE, shift: false, key: 'e' },
  f: { code: KeyCodes.KeyF, shift: false, key: 'f' },
  g: { code: KeyCodes.KeyG, shift: false, key: 'g' },
  h: { code: KeyCodes.KeyH, shift: false, key: 'h' },
  i: { code: KeyCodes.KeyI, shift: false, key: 'i' },
  j: { code: KeyCodes.KeyJ, shift: false, key: 'j' },
  k: { code: KeyCodes.KeyK, shift: false, key: 'k' },
  l: { code: KeyCodes.KeyL, shift: false, key: 'l' },
  m: { code: KeyCodes.KeyM, shift: false, key: 'm' },
  n: { code: KeyCodes.KeyN, shift: false, key: 'n' },
  o: { code: KeyCodes.KeyO, shift: false, key: 'o' },
  p: { code: KeyCodes.KeyP, shift: false, key: 'p' },
  q: { code: KeyCodes.KeyQ, shift: false, key: 'q' },
  r: { code: KeyCodes.KeyR, shift: false, key: 'r' },
  s: { code: KeyCodes.KeyS, shift: false, key: 's' },
  t: { code: KeyCodes.KeyT, shift: false, key: 't' },
  u: { code: KeyCodes.KeyU, shift: false, key: 'u' },
  v: { code: KeyCodes.KeyV, shift: false, key: 'v' },
  w: { code: KeyCodes.KeyW, shift: false, key: 'w' },
  x: { code: KeyCodes.KeyX, shift: false, key: 'x' },
  y: { code: KeyCodes.KeyY, shift: false, key: 'y' },
  z: { code: KeyCodes.KeyZ, shift: false, key: 'z' },
  '{': { code: KeyCodes.BracketLeft, shift: true, key: '{' },
  '|': { code: KeyCodes.Backslash, shift: true, key: '|' },
  '}': { code: KeyCodes.BracketRight, shift: true, key: '}' },
  '~': { code: KeyCodes.Backquote, shift: true, key: '~' },
  '\b': { code: KeyCodes.Backspace, shift: false, key: 'Backspace' },
  '\n': { code: KeyCodes.Enter, shift: false, key: 'Enter' },
  '\r': { code: KeyCodes.Enter, shift: false, key: 'Enter' },
  '\t': { code: KeyCodes.Tab, shift: false, key: 'Tab' },
  '\x1b': { code: KeyCodes.Escape, shift: false, key: 'Escape' },
};

// Special key codes for non-character keys
export const specialKeyMap: Record<string, KeyCode> = {
  Enter: KeyCodes.Enter,
  Space: KeyCodes.Space,
  Backspace: KeyCodes.Backspace,
  Tab: KeyCodes.Tab,
  Escape: KeyCodes.Escape,
  Delete: KeyCodes.Delete,
  Insert: KeyCodes.Insert,
  Home: KeyCodes.Home,
  End: KeyCodes.End,
  PageUp: KeyCodes.PageUp,
  PageDown: KeyCodes.PageDown,
  ArrowUp: KeyCodes.ArrowUp,
  ArrowDown: KeyCodes.ArrowDown,
  ArrowLeft: KeyCodes.ArrowLeft,
  ArrowRight: KeyCodes.ArrowRight,
  Up: KeyCodes.ArrowUp,
  Down: KeyCodes.ArrowDown,
  Left: KeyCodes.ArrowLeft,
  Right: KeyCodes.ArrowRight,
  Shift: KeyCodes.ShiftLeft,
  Alt: KeyCodes.AltLeft,
  Control: KeyCodes.ControlLeft,
  Ctrl: KeyCodes.ControlLeft,
  Meta: KeyCodes.MetaLeft,
};

// ============================================================================
// VHS Context Interface
// ============================================================================

/**
 * Interface for VHS browser context.
 * This is an abstraction over puppeteer/playwright page.
 */
export interface VHSContext {
  /** Current options */
  options: VHSOptions;

  /** Whether currently recording */
  recording: boolean;

  /** Pause recording */
  pauseRecording(): void;

  /** Resume recording */
  resumeRecording(): void;

  /** Type a key */
  typeKey(code: KeyCode, modifiers?: KeyModifiers): Promise<void>;

  /** Type text character by character */
  typeText(text: string, options?: { delay?: number }): Promise<void>;

  /** Input text directly (for non-ASCII) */
  inputText(text: string): Promise<void>;

  /** Execute JavaScript in the page */
  evaluate<T>(fn: string): Promise<T>;

  /** Get current line from terminal */
  getCurrentLine(): Promise<string>;

  /** Get buffer content from terminal */
  getBuffer(): Promise<string[]>;

  /** Wait for page to be idle */
  waitForIdle(): Promise<void>;

  /** Scroll terminal viewport */
  scroll(direction: number): Promise<void>;

  /** Screenshot next frame */
  screenshotNextFrame(path: string): void;

  /** Save output for testing */
  saveOutput(): Promise<void>;
}

/**
 * Key modifiers.
 */
export interface KeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

// ============================================================================
// Command Executor Types
// ============================================================================

/**
 * Command function type.
 */
export type CommandFunc = (c: Command, ctx: VHSContext) => Promise<void>;

/**
 * Sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Key Press Commands
// ============================================================================

/**
 * Create a key press executor for a given key.
 */
function executeKey(code: KeyCode): CommandFunc {
  return async (c: Command, ctx: VHSContext) => {
    let typingSpeed = ctx.options.typingSpeed;
    if (c.options) {
      typingSpeed = parseDuration(c.options);
    }

    let repeat = 1;
    if (c.args) {
      const parsed = parseInt(c.args, 10);
      if (!isNaN(parsed)) {
        repeat = parsed;
      }
    }

    for (let i = 0; i < repeat; i++) {
      await ctx.typeKey(code);
      await sleep(typingSpeed);
    }
  };
}

/**
 * Create a scroll executor for a given direction.
 */
function executeScroll(direction: number): CommandFunc {
  return async (c: Command, ctx: VHSContext) => {
    let typingSpeed = ctx.options.typingSpeed;
    if (c.options) {
      typingSpeed = parseDuration(c.options);
    }

    let repeat = 1;
    if (c.args) {
      const parsed = parseInt(c.args, 10);
      if (!isNaN(parsed)) {
        repeat = parsed;
      }
    }

    for (let i = 0; i < repeat; i++) {
      await ctx.scroll(direction);
      await sleep(typingSpeed);
    }
  };
}

// ============================================================================
// Command Executors
// ============================================================================

/**
 * Execute Wait command - wait for a pattern match.
 */
const executeWait: CommandFunc = async (c: Command, ctx: VHSContext) => {
  const parts = c.args.split(' ');
  const scope = parts[0] || 'Line';
  const rxStr = parts.slice(1).join(' ');

  let pattern = ctx.options.waitPattern;
  if (rxStr) {
    pattern = new RegExp(rxStr);
  }

  let timeout = ctx.options.waitTimeout;
  if (c.options) {
    timeout = parseDuration(c.options);
  }

  const checkInterval = 10; // ms
  const startTime = Date.now();
  let lastValue = '';

  while (Date.now() - startTime < timeout) {
    if (scope === 'Line') {
      lastValue = await ctx.getCurrentLine();
      if (pattern.test(lastValue)) {
        return;
      }
    } else if (scope === 'Screen') {
      const lines = await ctx.getBuffer();
      lastValue = lines.join('\n');
      if (pattern.test(lastValue)) {
        return;
      }
    } else {
      throw new Error(`Invalid scope "${scope}"`);
    }

    await sleep(checkInterval);
  }

  throw new Error(`Timeout waiting for "${c.args}" to match ${pattern}; last value was: ${lastValue}`);
};

/**
 * Execute Ctrl command - press keys with Ctrl modifier.
 */
const executeCtrl: CommandFunc = async (c: Command, ctx: VHSContext) => {
  const keys = c.args.split(' ');
  const modifiers: KeyModifiers = { ctrl: true };

  for (const key of keys) {
    // Check for additional modifiers
    if (key === 'Shift') {
      modifiers.shift = true;
      continue;
    }
    if (key === 'Alt') {
      modifiers.alt = true;
      continue;
    }

    // Get key code
    let code: KeyCode | undefined;
    if (specialKeyMap[key]) {
      code = specialKeyMap[key];
    } else if (key.length === 1 && keymap[key]) {
      code = keymap[key].code;
    }

    if (code) {
      await ctx.typeKey(code, modifiers);
    }
  }
};

/**
 * Execute Alt command - press key with Alt modifier.
 */
const executeAlt: CommandFunc = async (c: Command, ctx: VHSContext) => {
  const key = c.args;
  const modifiers: KeyModifiers = { alt: true };

  let code: KeyCode | undefined;
  if (specialKeyMap[key]) {
    code = specialKeyMap[key];
  } else if (key.length === 1 && keymap[key]) {
    code = keymap[key].code;
  }

  if (code) {
    await ctx.typeKey(code, modifiers);
  }
};

/**
 * Execute Shift command - press key with Shift modifier.
 */
const executeShift: CommandFunc = async (c: Command, ctx: VHSContext) => {
  const key = c.args;
  const modifiers: KeyModifiers = { shift: true };

  let code: KeyCode | undefined;
  if (specialKeyMap[key]) {
    code = specialKeyMap[key];
  } else if (key.length === 1 && keymap[key]) {
    code = keymap[key].code;
  }

  if (code) {
    await ctx.typeKey(code, modifiers);
  }
};

/**
 * Execute Hide command - pause recording.
 */
const executeHide: CommandFunc = async (_c: Command, ctx: VHSContext) => {
  ctx.pauseRecording();
};

/**
 * Execute Show command - resume recording.
 */
const executeShow: CommandFunc = async (_c: Command, ctx: VHSContext) => {
  ctx.resumeRecording();
};

/**
 * Execute Require command - check if binary exists.
 */
const executeRequire: CommandFunc = async (c: Command, _ctx: VHSContext) => {
  const { execSync } = await import('child_process');
  try {
    execSync(`which ${c.args}`, { stdio: 'ignore' });
  } catch {
    throw new Error(`Required binary not found: ${c.args}`);
  }
};

/**
 * Execute Sleep command.
 */
const executeSleep: CommandFunc = async (c: Command, _ctx: VHSContext) => {
  const duration = parseDuration(c.args);
  await sleep(duration);
};

/**
 * Execute Type command - type text.
 */
const executeType: CommandFunc = async (c: Command, ctx: VHSContext) => {
  let typingSpeed = ctx.options.typingSpeed;
  if (c.options) {
    typingSpeed = parseDuration(c.options);
  }

  for (const char of c.args) {
    const keyInfo = keymap[char];
    if (keyInfo) {
      const modifiers: KeyModifiers = keyInfo.shift ? { shift: true } : {};
      await ctx.typeKey(keyInfo.code, modifiers);
    } else {
      // For non-ASCII characters, input directly
      await ctx.inputText(char);
      await ctx.waitForIdle();
    }
    await sleep(typingSpeed);
  }
};

/**
 * Execute Output command - set output paths.
 */
const executeOutput: CommandFunc = async (c: Command, ctx: VHSContext) => {
  switch (c.options) {
    case '.mp4':
      ctx.options.video.output.mp4 = c.args;
      break;
    case '.test':
    case '.ascii':
    case '.txt':
      ctx.options.test.output = c.args;
      break;
    case '.png':
      ctx.options.video.output.frames = c.args;
      break;
    case '.webm':
      ctx.options.video.output.webm = c.args;
      break;
    default:
      ctx.options.video.output.gif = c.args;
      break;
  }
};

/**
 * Execute Copy command - copy text to clipboard.
 */
const executeCopy: CommandFunc = async (c: Command, _ctx: VHSContext) => {
  // In a real implementation, this would use a clipboard library
  // For now, store in a module-level variable
  clipboardContent = c.args;
};

let clipboardContent = '';

/**
 * Execute Paste command - paste from clipboard.
 */
const executePaste: CommandFunc = async (_c: Command, ctx: VHSContext) => {
  for (const char of clipboardContent) {
    const keyInfo = keymap[char];
    if (keyInfo) {
      const modifiers: KeyModifiers = keyInfo.shift ? { shift: true } : {};
      await ctx.typeKey(keyInfo.code, modifiers);
    } else {
      await ctx.inputText(char);
      await ctx.waitForIdle();
    }
  }
};

/**
 * Execute Env command - set environment variable.
 */
const executeEnv: CommandFunc = async (c: Command, ctx: VHSContext) => {
  ctx.options.envVars[c.options] = c.args;
  process.env[c.options] = c.args;
};

/**
 * Execute Screenshot command.
 */
const executeScreenshot: CommandFunc = async (c: Command, ctx: VHSContext) => {
  ctx.screenshotNextFrame(c.args);
};

/**
 * Execute Noop command.
 */
const executeNoop: CommandFunc = async () => {
  // Do nothing
};

// ============================================================================
// Set Command Executors
// ============================================================================

/**
 * Settings executors map.
 */
const settingsExecutors: Record<string, CommandFunc> = {
  FontFamily: async (c, ctx) => {
    ctx.options.fontFamily = c.args;
    await ctx.evaluate(`() => term.options.fontFamily = '${c.args}'`);
  },

  FontSize: async (c, ctx) => {
    const fontSize = parseInt(c.args, 10);
    ctx.options.fontSize = fontSize;
    await ctx.evaluate(`() => term.options.fontSize = ${fontSize}`);
    await ctx.evaluate('term.fit');
  },

  Framerate: async (c, ctx) => {
    ctx.options.video.framerate = parseInt(c.args, 10);
  },

  Height: async (c, ctx) => {
    ctx.options.video.style.height = parseInt(c.args, 10);
  },

  Width: async (c, ctx) => {
    ctx.options.video.style.width = parseInt(c.args, 10);
  },

  LetterSpacing: async (c, ctx) => {
    const letterSpacing = parseFloat(c.args);
    ctx.options.letterSpacing = letterSpacing;
    await ctx.evaluate(`() => term.options.letterSpacing = ${letterSpacing}`);
  },

  LineHeight: async (c, ctx) => {
    const lineHeight = parseFloat(c.args);
    ctx.options.lineHeight = lineHeight;
    await ctx.evaluate(`() => term.options.lineHeight = ${lineHeight}`);
  },

  PlaybackSpeed: async (c, ctx) => {
    ctx.options.video.playbackSpeed = parseFloat(c.args);
  },

  Padding: async (c, ctx) => {
    ctx.options.video.style.padding = parseInt(c.args, 10);
  },

  Theme: async (c, ctx) => {
    let theme: Theme;
    const arg = c.args.trim();

    if (arg.startsWith('{')) {
      // JSON theme
      theme = JSON.parse(arg);
    } else if (arg === '') {
      theme = DefaultTheme;
    } else {
      theme = findTheme(arg);
    }

    ctx.options.theme = theme;
    await ctx.evaluate(`() => term.options.theme = ${themeToString(theme)}`);
    ctx.options.video.style.backgroundColor = theme.background;
    ctx.options.video.style.windowBarColor = theme.background;
  },

  TypingSpeed: async (c, ctx) => {
    ctx.options.typingSpeed = parseDuration(c.args);
  },

  Shell: async (c, ctx) => {
    const shell = Shells[c.args];
    if (!shell) {
      throw new Error(`Invalid shell: ${c.args}`);
    }
    ctx.options.shell = shell;
  },

  LoopOffset: async (c, ctx) => {
    const value = parseFloat(c.args.replace('%', ''));
    ctx.options.loopOffset = value;
  },

  MarginFill: async (c, ctx) => {
    ctx.options.video.style.marginFill = c.args;
  },

  Margin: async (c, ctx) => {
    ctx.options.video.style.margin = parseInt(c.args, 10);
  },

  WindowBar: async (c, ctx) => {
    ctx.options.video.style.windowBar = c.args;
  },

  WindowBarSize: async (c, ctx) => {
    ctx.options.video.style.windowBarSize = parseInt(c.args, 10);
  },

  BorderRadius: async (c, ctx) => {
    ctx.options.video.style.borderRadius = parseInt(c.args, 10);
  },

  WaitPattern: async (c, ctx) => {
    ctx.options.waitPattern = new RegExp(c.args);
  },

  WaitTimeout: async (c, ctx) => {
    ctx.options.waitTimeout = parseDuration(c.args);
  },

  CursorBlink: async (c, ctx) => {
    ctx.options.cursorBlink = c.args === 'true';
  },
};

/**
 * Execute Set command.
 */
const executeSet: CommandFunc = async (c: Command, ctx: VHSContext) => {
  const executor = settingsExecutors[c.options];
  if (executor) {
    await executor(c, ctx);
  } else {
    throw new Error(`Unknown setting: ${c.options}`);
  }
};

// ============================================================================
// Command Functions Map
// ============================================================================

/**
 * Map of command types to their executors.
 */
export const CommandFuncs: Partial<Record<CommandType, CommandFunc>> = {
  [TokenType.BACKSPACE]: executeKey(KeyCodes.Backspace),
  [TokenType.DELETE]: executeKey(KeyCodes.Delete),
  [TokenType.INSERT]: executeKey(KeyCodes.Insert),
  [TokenType.DOWN]: executeKey(KeyCodes.ArrowDown),
  [TokenType.ENTER]: executeKey(KeyCodes.Enter),
  [TokenType.LEFT]: executeKey(KeyCodes.ArrowLeft),
  [TokenType.RIGHT]: executeKey(KeyCodes.ArrowRight),
  [TokenType.SPACE]: executeKey(KeyCodes.Space),
  [TokenType.UP]: executeKey(KeyCodes.ArrowUp),
  [TokenType.TAB]: executeKey(KeyCodes.Tab),
  [TokenType.ESCAPE]: executeKey(KeyCodes.Escape),
  [TokenType.PAGE_UP]: executeKey(KeyCodes.PageUp),
  [TokenType.PAGE_DOWN]: executeKey(KeyCodes.PageDown),
  [TokenType.SCROLL_UP]: executeScroll(-1),
  [TokenType.SCROLL_DOWN]: executeScroll(1),
  [TokenType.HIDE]: executeHide,
  [TokenType.REQUIRE]: executeRequire,
  [TokenType.SHOW]: executeShow,
  [TokenType.SET]: executeSet,
  [TokenType.OUTPUT]: executeOutput,
  [TokenType.SLEEP]: executeSleep,
  [TokenType.TYPE]: executeType,
  [TokenType.CTRL]: executeCtrl,
  [TokenType.ALT]: executeAlt,
  [TokenType.SHIFT]: executeShift,
  [TokenType.ILLEGAL]: executeNoop,
  [TokenType.SCREENSHOT]: executeScreenshot,
  [TokenType.COPY]: executeCopy,
  [TokenType.PASTE]: executePaste,
  [TokenType.ENV]: executeEnv,
  [TokenType.WAIT]: executeWait,
};

/**
 * Execute a command on the VHS context.
 */
export async function executeCommand(c: Command, ctx: VHSContext): Promise<void> {
  const executor = CommandFuncs[c.type];
  if (!executor) {
    throw new Error(`Unknown command type: ${c.type}`);
  }

  await executor(c, ctx);

  // Save output for testing if enabled
  if (ctx.recording && ctx.options.test.output) {
    await ctx.saveOutput();
  }
}

/**
 * Execute multiple commands sequentially.
 */
export async function executeCommands(commands: Command[], ctx: VHSContext): Promise<void> {
  for (const cmd of commands) {
    await executeCommand(cmd, ctx);
  }
}
