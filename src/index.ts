/**
 * @oakoliver/vhs — Terminal GIF recorder
 *
 * TypeScript port of Charmbracelet VHS v0.11.0.
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

export { Lexer, createLexer } from './lexer.js';

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
  defaultTestOptions,

  // VHS Options
  type VHSOptions,
  defaultVHSOptions,
  withSymbolsFallback,

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
  executeKey,
  executeScroll,
  executeWait,
  executeCtrl,
  executeAlt,
  executeShift,
  executeHide,
  executeShow,
  executeRequire,
  executeSleep,
  executeType,
  executeOutput,
  executeCopy,
  executePaste,
  executeEnv,
  executeScreenshot,
  executeNoop,
  settingsExecutors,
  executeSet,
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
  type RecordingState,

  // Functions
  evaluate,
  evaluateFile,
  parseTape as parseAndValidateTape,
  collectMediaOutputPaths,
  type MediaOutputPaths,
  createVHSContext,
  newRecordingState,
  applyLoopOffset,
} from './evaluator.js';

// ============================================================================
// FFmpeg exports
// ============================================================================

export {
  // Utilities
  calcTermDimensions,
  marginFillIsColor,
  parseHexColor,

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
  makeWindowBar,
  makeBorderRadiusMask,
  prepareDecorations,
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
  DefaultTTY,

  // Dependency checks
  executableCandidates,
  isCommandAvailable,
  isTTYDAvailable,
  isFFmpegAvailable,
  getTTYDVersion,
  getFFmpegVersion,
} from './tty.js';

export { PuppeteerBrowser, chromeSandboxArgs } from './browser.js';
export { SystemClipboard, type ClipboardInterface } from './clipboard.js';
export {
  EscapeSequences,
  sleepThreshold,
  quoteTapeString,
  inputToTape,
  recordInteractive,
  type InteractiveRecordOptions,
} from './record.js';
export {
  serverConfigFromEnv,
  serverOutputExtension,
  dropPrivileges,
  serveSSH,
  type ServerConfig,
  type PrivilegeOperations,
} from './server.js';
export {
  VERSION,
  HELP,
  MANUAL,
  parseArgs,
  ensureDependencies,
  runCLI,
  type CLIArgs,
} from './cli.js';
