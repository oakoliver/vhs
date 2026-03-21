/**
 * @oakoliver/vhs — VHS core types and options
 *
 * Zero-dependency TypeScript port of Charmbracelet's VHS.
 *
 * @module
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Get directory name in both ESM and CJS environments
function getDirname(): string {
  // Try ESM first
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      const { fileURLToPath } = require('url') as typeof import('url');
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // Fallback to CJS
  }
  // CJS fallback
  return typeof __dirname !== 'undefined' ? __dirname : process.cwd();
}

const currentDir = getDirname();

// ============================================================================
// Theme
// ============================================================================

/**
 * Terminal theme for xterm.js.
 * https://xtermjs.org/docs/api/terminal/interfaces/itheme/
 */
export interface Theme {
  name?: string;
  background: string;
  foreground: string;
  selection?: string;
  cursor: string;
  cursorAccent?: string;
  black: string;
  brightBlack: string;
  red: string;
  brightRed: string;
  green: string;
  brightGreen: string;
  yellow: string;
  brightYellow: string;
  blue: string;
  brightBlue: string;
  magenta: string;
  brightMagenta: string;
  cyan: string;
  brightCyan: string;
  white: string;
  brightWhite: string;
}

// Default theme colors
const Background = '#171717';
const Foreground = '#dddddd';
const Black = '#282a2e';
const BrightBlack = '#4d4d4d';
const Red = '#D74E6F';
const BrightRed = '#FE5F86';
const Green = '#31BB71';
const BrightGreen = '#00D787';
const Yellow = '#D3E561';
const BrightYellow = '#EBFF71';
const Blue = '#8056FF';
const BrightBlue = '#9B79FF';
const Magenta = '#ED61D7';
const BrightMagenta = '#FF7AEA';
const Cyan = '#04D7D7';
const BrightCyan = '#00FEFE';
const White = '#bfbfbf';
const BrightWhite = '#e6e6e6';

/**
 * Default VHS theme (from meowgorithm's dotfiles).
 */
export const DefaultTheme: Theme = {
  background: Background,
  foreground: Foreground,
  cursor: Foreground,
  cursorAccent: Background,
  black: Black,
  brightBlack: BrightBlack,
  red: Red,
  brightRed: BrightRed,
  green: Green,
  brightGreen: BrightGreen,
  yellow: Yellow,
  brightYellow: BrightYellow,
  blue: Blue,
  brightBlue: BrightBlue,
  magenta: Magenta,
  brightMagenta: BrightMagenta,
  cyan: Cyan,
  brightCyan: BrightCyan,
  white: White,
  brightWhite: BrightWhite,
};

// Cache for loaded themes
let themesCache: Theme[] | null = null;

/**
 * Load themes from themes.json.
 */
export function loadThemes(themesPath?: string): Theme[] {
  if (themesCache) {
    return themesCache;
  }

  // Try to find themes.json in common locations
  const searchPaths = [
    themesPath,
    path.join(currentDir, '..', 'themes.json'),
    path.join(currentDir, 'themes.json'),
    path.join(process.cwd(), 'themes.json'),
  ].filter(Boolean) as string[];

  for (const p of searchPaths) {
    try {
      const data = fs.readFileSync(p, 'utf-8');
      themesCache = JSON.parse(data);
      return themesCache!;
    } catch {
      continue;
    }
  }

  return [];
}

/**
 * Error thrown when a theme is not found.
 */
export class ThemeNotFoundError extends Error {
  constructor(
    public theme: string,
    public suggestions: string[] = []
  ) {
    const msg =
      suggestions.length > 0
        ? `invalid \`Set Theme "${theme}"\`: did you mean "${suggestions.join('", "')}"`
        : `invalid \`Set Theme "${theme}"\`: theme does not exist`;
    super(msg);
    this.name = 'ThemeNotFoundError';
  }
}

/**
 * Find a theme by name.
 */
export function findTheme(name: string, themesPath?: string): Theme {
  const themes = loadThemes(themesPath);

  for (const theme of themes) {
    if (theme.name === name) {
      return theme;
    }
  }

  // Find similar themes using simple string distance
  const lname = name.toLowerCase();
  const suggestions: string[] = [];

  for (const theme of themes) {
    if (!theme.name) continue;
    const ltheme = theme.name.toLowerCase();
    if (ltheme.startsWith(lname) || lname.startsWith(ltheme) || levenshteinDistance(lname, ltheme) <= 2) {
      suggestions.push(theme.name);
    }
  }

  throw new ThemeNotFoundError(name, suggestions.slice(0, 5));
}

/**
 * Get sorted theme names.
 */
export function getSortedThemeNames(themesPath?: string): string[] {
  const themes = loadThemes(themesPath);
  const names = themes.map((t) => t.name).filter(Boolean) as string[];
  return names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/**
 * Serialize theme to JSON string for xterm.js.
 */
export function themeToString(theme: Theme): string {
  return JSON.stringify(theme);
}

// Simple Levenshtein distance implementation
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }

  return matrix[b.length][a.length];
}

// ============================================================================
// Shell
// ============================================================================

/**
 * Shell configuration.
 */
export interface Shell {
  command: string[];
  env: string[];
}

/**
 * Supported shell configurations.
 */
export const Shells: Record<string, Shell> = {
  bash: {
    env: ['PS1=\\[\\e[38;2;90;86;224m\\]> \\[\\e[0m\\]', 'BASH_SILENCE_DEPRECATION_WARNING=1'],
    command: ['bash', '--noprofile', '--norc', '--login', '+o', 'history'],
  },
  zsh: {
    env: ['PROMPT=%F{#5B56E0}> %F{reset_color}'],
    command: ['zsh', '--histnostore', '--no-rcs'],
  },
  fish: {
    env: [],
    command: [
      'fish',
      '--login',
      '--no-config',
      '--private',
      '-C',
      'function fish_greeting; end',
      '-C',
      'function fish_prompt; set_color 5B56E0; echo -n "> "; set_color normal; end',
    ],
  },
  powershell: {
    env: [],
    command: [
      'powershell',
      '-NoLogo',
      '-NoExit',
      '-NoProfile',
      '-Command',
      "Set-PSReadLineOption -HistorySaveStyle SaveNothing; function prompt { Write-Host '>' -NoNewLine -ForegroundColor Blue; return ' ' }",
    ],
  },
  pwsh: {
    env: [],
    command: [
      'pwsh',
      '-Login',
      '-NoLogo',
      '-NoExit',
      '-NoProfile',
      '-Command',
      "Set-PSReadLineOption -HistorySaveStyle SaveNothing; Function prompt { Write-Host -ForegroundColor Blue -NoNewLine '>'; return ' ' }",
    ],
  },
  cmd: {
    env: [],
    command: ['cmd.exe', '/k', 'prompt=^> '],
  },
  nu: {
    env: [],
    command: [
      'nu',
      '--execute',
      "$env.PROMPT_COMMAND = {'\\033[;38;2;91;86;224m>\\033[m '}; $env.PROMPT_COMMAND_RIGHT = {''}",
    ],
  },
  osh: {
    env: ['PS1=\\[\\e[38;2;90;86;224m\\]> \\[\\e[0m\\]'],
    command: ['osh', '--norc'],
  },
  xonsh: {
    env: [],
    command: ['xonsh', '--no-rc', '-D', 'PROMPT=\x1b[;38;2;91;86;224m>\x1b[m '],
  },
};

/**
 * Get the default shell based on platform.
 */
export function getDefaultShell(): string {
  const platform = os.platform();
  if (platform === 'win32') {
    return 'powershell';
  }
  return 'bash';
}

// ============================================================================
// Style Options
// ============================================================================

const defaultWidth = 1200;
const defaultHeight = 600;
const defaultPadding = 60;
const defaultWindowBarSize = 30;
const defaultMaxColors = 256;
const defaultPlaybackSpeed = 1.0;

/**
 * Style options for video and screenshots.
 */
export interface StyleOptions {
  width: number;
  height: number;
  padding: number;
  backgroundColor: string;
  marginFill: string;
  margin: number;
  windowBar: string;
  windowBarSize: number;
  windowBarColor: string;
  borderRadius: number;
}

/**
 * Default style options.
 */
export function defaultStyleOptions(): StyleOptions {
  return {
    width: defaultWidth,
    height: defaultHeight,
    padding: defaultPadding,
    marginFill: DefaultTheme.background,
    margin: 0,
    windowBar: '',
    windowBarSize: defaultWindowBarSize,
    windowBarColor: DefaultTheme.background,
    borderRadius: 0,
    backgroundColor: DefaultTheme.background,
  };
}

// ============================================================================
// Video Options
// ============================================================================

const textFrameFormat = 'frame-text-%05d.png';
const cursorFrameFormat = 'frame-cursor-%05d.png';

const defaultFramerate = 50;
const defaultStartingFrame = 1;

/**
 * Video output paths.
 */
export interface VideoOutputs {
  gif: string;
  webm: string;
  mp4: string;
  frames: string;
}

/**
 * Video generation options.
 */
export interface VideoOptions {
  framerate: number;
  playbackSpeed: number;
  input: string;
  maxColors: number;
  output: VideoOutputs;
  startingFrame: number;
  style: StyleOptions;
}

/**
 * Create a random temporary directory for frames.
 */
export function randomDir(): string {
  const tmpBase = os.tmpdir();
  const dirName = `vhs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dir = path.join(tmpBase, dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Default video options.
 */
export function defaultVideoOptions(): VideoOptions {
  return {
    framerate: defaultFramerate,
    input: randomDir(),
    maxColors: defaultMaxColors,
    output: { gif: '', webm: '', mp4: '', frames: '' },
    playbackSpeed: defaultPlaybackSpeed,
    startingFrame: defaultStartingFrame,
    style: defaultStyleOptions(),
  };
}

/**
 * Get text frame filename format.
 */
export function getTextFrameFormat(): string {
  return textFrameFormat;
}

/**
 * Get cursor frame filename format.
 */
export function getCursorFrameFormat(): string {
  return cursorFrameFormat;
}

// ============================================================================
// Screenshot Options
// ============================================================================

/**
 * Screenshot options.
 */
export interface ScreenshotOptions {
  input: string;
  style: StyleOptions;
  frameCaptureEnabled: boolean;
  frameCapturePath: string;
}

/**
 * Create screenshot options.
 */
export function newScreenshotOptions(input: string, style: StyleOptions): ScreenshotOptions {
  return {
    input,
    style,
    frameCaptureEnabled: false,
    frameCapturePath: '',
  };
}

// ============================================================================
// Test Options
// ============================================================================

/**
 * Test options for VHS.
 */
export interface TestOptions {
  output: string;
}

// ============================================================================
// VHS Options
// ============================================================================

const defaultFontSize = 22;
const defaultTypingSpeed = 50; // milliseconds
const defaultLineHeight = 1.0;
const defaultLetterSpacing = 1.0;
const defaultCursorBlink = true;
const defaultWaitTimeout = 15000; // milliseconds

const fontsSeparator = ',';

const symbolsFallback = ['Apple Symbols'];

function withSymbolsFallback(font: string): string {
  return font + fontsSeparator + symbolsFallback.join(fontsSeparator);
}

const defaultFontFamily = withSymbolsFallback(
  [
    'JetBrains Mono',
    'DejaVu Sans Mono',
    'Menlo',
    'Bitstream Vera Sans Mono',
    'Inconsolata',
    'Roboto Mono',
    'Hack',
    'Consolas',
    'ui-monospace',
    'monospace',
  ].join(fontsSeparator)
);

/**
 * VHS Options.
 */
export interface VHSOptions {
  shell: Shell;
  fontFamily: string;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  typingSpeed: number;
  theme: Theme;
  test: TestOptions;
  video: VideoOptions;
  loopOffset: number;
  waitTimeout: number;
  waitPattern: RegExp;
  cursorBlink: boolean;
  screenshot: ScreenshotOptions;
  style: StyleOptions;
  envVars: Record<string, string>;
}

/**
 * Default VHS options.
 */
export function defaultVHSOptions(): VHSOptions {
  const style = defaultStyleOptions();
  const video = defaultVideoOptions();
  video.style = style;
  const screenshot = newScreenshotOptions(video.input, style);

  return {
    fontFamily: defaultFontFamily,
    fontSize: defaultFontSize,
    letterSpacing: defaultLetterSpacing,
    lineHeight: defaultLineHeight,
    typingSpeed: defaultTypingSpeed,
    shell: Shells[getDefaultShell()],
    theme: DefaultTheme,
    cursorBlink: defaultCursorBlink,
    video,
    screenshot,
    waitTimeout: defaultWaitTimeout,
    waitPattern: />$/,
    loopOffset: 0,
    test: { output: '' },
    style,
    envVars: {},
  };
}

// ============================================================================
// VHS Instance
// ============================================================================

/**
 * VHS recording state.
 */
export interface VHSState {
  options: VHSOptions;
  errors: Error[];
  started: boolean;
  recording: boolean;
  totalFrames: number;
}

/**
 * Create a new VHS instance state.
 */
export function newVHSState(): VHSState {
  return {
    options: defaultVHSOptions(),
    errors: [],
    started: false,
    recording: true,
    totalFrames: 0,
  };
}

// ============================================================================
// Duration Helpers
// ============================================================================

/**
 * Parse a duration string (e.g., "100ms", "2s", "1m") to milliseconds.
 */
export function parseDuration(s: string): number {
  const match = s.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2] || 's';

  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    default:
      return value * 1000;
  }
}

/**
 * Format milliseconds as a duration string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${ms / 1000}s`;
  }
  return `${ms / 60000}m`;
}

// ============================================================================
// Exports
// ============================================================================

export {
  Background,
  Foreground,
  Black,
  BrightBlack,
  Red,
  BrightRed,
  Green,
  BrightGreen,
  Yellow,
  BrightYellow,
  Blue,
  BrightBlue,
  Magenta,
  BrightMagenta,
  Cyan,
  BrightCyan,
  White,
  BrightWhite,
  defaultFontFamily,
  defaultFontSize,
  defaultTypingSpeed,
  defaultLineHeight,
  defaultLetterSpacing,
  defaultCursorBlink,
  defaultWaitTimeout,
  defaultFramerate,
  defaultMaxColors,
  defaultPlaybackSpeed,
  defaultWidth,
  defaultHeight,
  defaultPadding,
  defaultWindowBarSize,
};
