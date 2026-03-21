/**
 * @oakoliver/vhs — Terminal GIF recorder
 *
 * Zero-dependency TypeScript port of Charmbracelet's VHS.
 *
 * @example
 * ```typescript
 * import { parseTape, evaluate, Lexer, Parser } from '@oakoliver/vhs';
 *
 * // Parse a tape file
 * const { commands, errors } = parseTape(`
 *   Output demo.gif
 *   Set Theme "Dracula"
 *   Type "echo 'Hello, World!'"
 *   Enter
 *   Sleep 2s
 * `);
 *
 * // Evaluate with browser automation
 * const result = await evaluate(tape, {
 *   browser: myBrowserInterface,
 *   tty: myTTYInterface,
 * });
 * ```
 *
 * @module
 */

// ============================================================================
// Token exports
// ============================================================================

export {
  TokenType,
  type TokenTypeValue,
  type Token,
  Keywords,
  isSetting,
  isCommand,
  isModifier,
  toCamel,
  tokenTypeToString,
  lookupIdentifier,
  newToken,
} from './token.js';

// ============================================================================
// Lexer exports
// ============================================================================

export { Lexer } from './lexer.js';

// ============================================================================
// Parser exports
// ============================================================================

export {
  Parser,
  type Command,
  type CommandType,
  CommandTypes,
  type ParserError,
  newParserError,
  formatParserError,
  newCommand,
  formatCommand,
  createParser,
  parseTape,
} from './parser.js';

// ============================================================================
// VHS core exports
// ============================================================================

export {
  // Theme
  type Theme,
  DefaultTheme,
  loadThemes,
  findTheme,
  getSortedThemeNames,
  themeToString,
  ThemeNotFoundError,

  // Shell
  type Shell,
  Shells,
  getDefaultShell,

  // Style Options
  type StyleOptions,
  defaultStyleOptions,

  // Video Options
  type VideoOutputs,
  type VideoOptions,
  defaultVideoOptions,
  randomDir,
  getTextFrameFormat,
  getCursorFrameFormat,

  // Screenshot Options
  type ScreenshotOptions,
  newScreenshotOptions,

  // Test Options
  type TestOptions,

  // VHS Options
  type VHSOptions,
  defaultVHSOptions,

  // VHS State
  type VHSState,
  newVHSState,

  // Duration
  parseDuration,
  formatDuration,

  // Constants
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
} from './vhs.js';

// ============================================================================
// Command exports
// ============================================================================

export {
  // Key codes
  KeyCodes,
  type KeyCode,
  type KeyInfo,
  keymap,
  specialKeyMap,

  // Context
  type VHSContext,
  type KeyModifiers,
  type CommandFunc,

  // Command functions
  CommandFuncs,
  executeCommand,
  executeCommands,
} from './command.js';

// ============================================================================
// Evaluator exports
// ============================================================================

export {
  // Errors
  InvalidSyntaxError,

  // Interfaces
  type EvaluatorOptions,
  type BrowserInterface,
  type TTYInterface,
  type RecordingResult,

  // Functions
  evaluate,
  evaluateFile,
  parseTape as parseAndValidateTape,
  createVHSContext,
} from './evaluator.js';

// ============================================================================
// FFmpeg exports
// ============================================================================

export {
  // Utilities
  calcTermDimensions,
  marginFillIsColor,

  // Builders
  FilterComplexBuilder,
  StreamBuilder,
  type OutputFormat,

  // Functions
  buildFFmpegArgs,
  buildScreenshotFFmpegArgs,
  runFFmpeg,
  makeGIF,
  makeMP4,
  makeWebM,
  makeScreenshot,

  // Window bar
  type WindowBarStyle,
  generateWindowBarSVG,
  generateBorderRadiusMaskSVG,
} from './ffmpeg.js';

// ============================================================================
// TTY exports
// ============================================================================

export {
  // Port utilities
  randomPort,

  // TTY process
  type TTYOptions,
  buildTTYArgs,
  TTYProcess,

  // Dependency checks
  isTTYDAvailable,
  isFFmpegAvailable,
  getTTYDVersion,
  getFFmpegVersion,
} from './tty.js';
