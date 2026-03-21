/**
 * @oakoliver/vhs — Token types and structures for the VHS Tape language
 *
 * Zero-dependency TypeScript port of Charmbracelet's VHS token package.
 *
 * @module
 */

// Token types
export const TokenType = {
  // Symbols
  AT: '@',
  EQUAL: '=',
  PLUS: '+',
  PERCENT: '%',
  SLASH: '/',
  BACKSLASH: '\\',
  DOT: '.',
  DASH: '-',
  MINUS: '-',
  RIGHT_BRACKET: ']',
  LEFT_BRACKET: '[',
  CARET: '^',

  // Units
  EM: 'EM',
  MILLISECONDS: 'MILLISECONDS',
  MINUTES: 'MINUTES',
  PX: 'PX',
  SECONDS: 'SECONDS',

  // Special
  EOF: 'EOF',
  ILLEGAL: 'ILLEGAL',

  // Keys & Modifiers
  ALT: 'ALT',
  BACKSPACE: 'BACKSPACE',
  CTRL: 'CTRL',
  DELETE: 'DELETE',
  END: 'END',
  ENTER: 'ENTER',
  ESCAPE: 'ESCAPE',
  HOME: 'HOME',
  INSERT: 'INSERT',
  PAGE_DOWN: 'PAGE_DOWN',
  PAGE_UP: 'PAGE_UP',
  SCROLL_DOWN: 'SCROLL_DOWN',
  SCROLL_UP: 'SCROLL_UP',
  SLEEP: 'SLEEP',
  SPACE: 'SPACE',
  TAB: 'TAB',
  SHIFT: 'SHIFT',

  // Literals
  COMMENT: 'COMMENT',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  JSON: 'JSON',
  REGEX: 'REGEX',
  BOOLEAN: 'BOOLEAN',

  // Arrows
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  UP: 'UP',

  // Commands
  HIDE: 'HIDE',
  OUTPUT: 'OUTPUT',
  REQUIRE: 'REQUIRE',
  SET: 'SET',
  SHOW: 'SHOW',
  SOURCE: 'SOURCE',
  TYPE: 'TYPE',
  SCREENSHOT: 'SCREENSHOT',
  COPY: 'COPY',
  PASTE: 'PASTE',
  SHELL: 'SHELL',
  ENV: 'ENV',
  WAIT: 'WAIT',

  // Settings
  FONT_FAMILY: 'FONT_FAMILY',
  FONT_SIZE: 'FONT_SIZE',
  FRAMERATE: 'FRAMERATE',
  PLAYBACK_SPEED: 'PLAYBACK_SPEED',
  HEIGHT: 'HEIGHT',
  WIDTH: 'WIDTH',
  LETTER_SPACING: 'LETTER_SPACING',
  LINE_HEIGHT: 'LINE_HEIGHT',
  TYPING_SPEED: 'TYPING_SPEED',
  PADDING: 'PADDING',
  THEME: 'THEME',
  LOOP_OFFSET: 'LOOP_OFFSET',
  MARGIN_FILL: 'MARGIN_FILL',
  MARGIN: 'MARGIN',
  WINDOW_BAR: 'WINDOW_BAR',
  WINDOW_BAR_SIZE: 'WINDOW_BAR_SIZE',
  BORDER_RADIUS: 'BORDER_RADIUS',
  WAIT_TIMEOUT: 'WAIT_TIMEOUT',
  WAIT_PATTERN: 'WAIT_PATTERN',
  CURSOR_BLINK: 'CURSOR_BLINK',
} as const;

export type TokenTypeValue = (typeof TokenType)[keyof typeof TokenType];

/**
 * Token represents a lexer token.
 */
export interface Token {
  type: TokenTypeValue;
  literal: string;
  line: number;
  column: number;
}

/**
 * Keywords maps keyword strings to tokens.
 */
export const Keywords: Record<string, TokenTypeValue> = {
  em: TokenType.EM,
  px: TokenType.PX,
  ms: TokenType.MILLISECONDS,
  s: TokenType.SECONDS,
  m: TokenType.MINUTES,
  Set: TokenType.SET,
  Sleep: TokenType.SLEEP,
  Type: TokenType.TYPE,
  Enter: TokenType.ENTER,
  Space: TokenType.SPACE,
  Backspace: TokenType.BACKSPACE,
  Delete: TokenType.DELETE,
  Insert: TokenType.INSERT,
  Ctrl: TokenType.CTRL,
  Alt: TokenType.ALT,
  Shift: TokenType.SHIFT,
  Down: TokenType.DOWN,
  Left: TokenType.LEFT,
  Right: TokenType.RIGHT,
  Up: TokenType.UP,
  PageUp: TokenType.PAGE_UP,
  PageDown: TokenType.PAGE_DOWN,
  ScrollUp: TokenType.SCROLL_UP,
  ScrollDown: TokenType.SCROLL_DOWN,
  Tab: TokenType.TAB,
  Escape: TokenType.ESCAPE,
  End: TokenType.END,
  Hide: TokenType.HIDE,
  Require: TokenType.REQUIRE,
  Show: TokenType.SHOW,
  Output: TokenType.OUTPUT,
  Shell: TokenType.SHELL,
  FontFamily: TokenType.FONT_FAMILY,
  MarginFill: TokenType.MARGIN_FILL,
  Margin: TokenType.MARGIN,
  WindowBar: TokenType.WINDOW_BAR,
  WindowBarSize: TokenType.WINDOW_BAR_SIZE,
  BorderRadius: TokenType.BORDER_RADIUS,
  FontSize: TokenType.FONT_SIZE,
  Framerate: TokenType.FRAMERATE,
  Height: TokenType.HEIGHT,
  LetterSpacing: TokenType.LETTER_SPACING,
  LineHeight: TokenType.LINE_HEIGHT,
  PlaybackSpeed: TokenType.PLAYBACK_SPEED,
  TypingSpeed: TokenType.TYPING_SPEED,
  Padding: TokenType.PADDING,
  Theme: TokenType.THEME,
  Width: TokenType.WIDTH,
  LoopOffset: TokenType.LOOP_OFFSET,
  WaitTimeout: TokenType.WAIT_TIMEOUT,
  WaitPattern: TokenType.WAIT_PATTERN,
  Wait: TokenType.WAIT,
  Source: TokenType.SOURCE,
  CursorBlink: TokenType.CURSOR_BLINK,
  true: TokenType.BOOLEAN,
  false: TokenType.BOOLEAN,
  Screenshot: TokenType.SCREENSHOT,
  Copy: TokenType.COPY,
  Paste: TokenType.PASTE,
  Env: TokenType.ENV,
};

/**
 * Settings token types
 */
const SettingTypes = new Set<TokenTypeValue>([
  TokenType.SHELL,
  TokenType.FONT_FAMILY,
  TokenType.FONT_SIZE,
  TokenType.LETTER_SPACING,
  TokenType.LINE_HEIGHT,
  TokenType.FRAMERATE,
  TokenType.TYPING_SPEED,
  TokenType.THEME,
  TokenType.PLAYBACK_SPEED,
  TokenType.HEIGHT,
  TokenType.WIDTH,
  TokenType.PADDING,
  TokenType.LOOP_OFFSET,
  TokenType.MARGIN_FILL,
  TokenType.MARGIN,
  TokenType.WINDOW_BAR,
  TokenType.WINDOW_BAR_SIZE,
  TokenType.BORDER_RADIUS,
  TokenType.CURSOR_BLINK,
  TokenType.WAIT_TIMEOUT,
  TokenType.WAIT_PATTERN,
]);

/**
 * Command token types
 */
const CommandTypes = new Set<TokenTypeValue>([
  TokenType.TYPE,
  TokenType.SLEEP,
  TokenType.UP,
  TokenType.DOWN,
  TokenType.RIGHT,
  TokenType.LEFT,
  TokenType.PAGE_UP,
  TokenType.PAGE_DOWN,
  TokenType.SCROLL_UP,
  TokenType.SCROLL_DOWN,
  TokenType.ENTER,
  TokenType.BACKSPACE,
  TokenType.DELETE,
  TokenType.TAB,
  TokenType.ESCAPE,
  TokenType.HOME,
  TokenType.INSERT,
  TokenType.END,
  TokenType.CTRL,
  TokenType.SOURCE,
  TokenType.SCREENSHOT,
  TokenType.COPY,
  TokenType.PASTE,
  TokenType.WAIT,
]);

/**
 * Modifier token types
 */
const ModifierTypes = new Set<TokenTypeValue>([TokenType.ALT, TokenType.SHIFT]);

/**
 * Check if a token type is a setting.
 */
export function isSetting(t: TokenTypeValue): boolean {
  return SettingTypes.has(t);
}

/**
 * Check if a token type is a command.
 */
export function isCommand(t: TokenTypeValue): boolean {
  return CommandTypes.has(t);
}

/**
 * Check if a token type is a modifier.
 */
export function isModifier(t: TokenTypeValue): boolean {
  return ModifierTypes.has(t);
}

/**
 * Convert snake_case to CamelCase.
 */
export function toCamel(s: string): string {
  const parts = s.split('_');
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}

/**
 * Convert token type to human readable string.
 */
export function tokenTypeToString(t: TokenTypeValue): string {
  if (isCommand(t) || isSetting(t)) {
    return toCamel(t);
  }
  return t;
}

/**
 * Look up an identifier and return its token type.
 * In VHS, there are no actual identifiers (no variables).
 * Identifiers are simply strings (bare words).
 */
export function lookupIdentifier(ident: string): TokenTypeValue {
  const t = Keywords[ident];
  if (t !== undefined) {
    return t;
  }
  return TokenType.STRING;
}

/**
 * Create a new token.
 */
export function newToken(
  type: TokenTypeValue,
  literal: string,
  line: number,
  column: number
): Token {
  return { type, literal, line, column };
}
