/**
 * @oakoliver/vhs — Parser for the VHS Tape language
 *
 * Zero-dependency TypeScript port of Charmbracelet's VHS parser package.
 *
 * @module
 */

import { Lexer } from './lexer';
import { Token, TokenType, TokenTypeValue, isSetting, isModifier, toCamel } from './token';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CommandType represents the type of a command.
 */
export type CommandType = TokenTypeValue;

/**
 * List of available command types.
 */
export const CommandTypes: CommandType[] = [
  TokenType.BACKSPACE,
  TokenType.DELETE,
  TokenType.INSERT,
  TokenType.CTRL,
  TokenType.ALT,
  TokenType.DOWN,
  TokenType.ENTER,
  TokenType.ESCAPE,
  TokenType.ILLEGAL,
  TokenType.LEFT,
  TokenType.PAGE_UP,
  TokenType.PAGE_DOWN,
  TokenType.SCROLL_UP,
  TokenType.SCROLL_DOWN,
  TokenType.RIGHT,
  TokenType.SET,
  TokenType.OUTPUT,
  TokenType.SLEEP,
  TokenType.SPACE,
  TokenType.HIDE,
  TokenType.REQUIRE,
  TokenType.SHOW,
  TokenType.TAB,
  TokenType.TYPE,
  TokenType.UP,
  TokenType.WAIT,
  TokenType.SOURCE,
  TokenType.SCREENSHOT,
  TokenType.COPY,
  TokenType.PASTE,
  TokenType.ENV,
];

/**
 * Command represents a parsed command with options and arguments.
 */
export interface Command {
  type: CommandType;
  options: string;
  args: string;
  source?: string;
}

/**
 * Parser error with token location and message.
 */
export interface ParserError {
  token: Token;
  msg: string;
}

/**
 * Create a new parser error.
 */
export function newParserError(token: Token, msg: string): ParserError {
  return { token, msg };
}

/**
 * Format a parser error as a string.
 */
export function formatParserError(e: ParserError): string {
  return `${e.token.line.toString().padStart(2)}:${e.token.column.toString().padEnd(2)} │ ${e.msg}`;
}

/**
 * Create a new command.
 */
export function newCommand(type: CommandType, options = '', args = ''): Command {
  return { type, options, args };
}

/**
 * Format a command as a string.
 */
export function formatCommand(c: Command): string {
  if (c.options) {
    return `${toCamel(c.type)} ${c.options} ${c.args}`;
  }
  return `${toCamel(c.type)} ${c.args}`;
}

/**
 * Parser for VHS Tape language.
 */
export class Parser {
  private lexer: Lexer;
  private errors: ParserError[] = [];
  private cur: Token;
  private peek: Token;

  constructor(lexer: Lexer) {
    this.lexer = lexer;
    // Initialize with dummy tokens
    this.cur = { type: TokenType.EOF, literal: '', line: 0, column: 0 };
    this.peek = { type: TokenType.EOF, literal: '', line: 0, column: 0 };
    // Read two tokens so cur and peek are both set
    this.nextToken();
    this.nextToken();
  }

  /**
   * Parse the input into a list of commands.
   */
  parse(): Command[] {
    const cmds: Command[] = [];

    while (this.cur.type !== TokenType.EOF) {
      if (this.cur.type === TokenType.COMMENT) {
        this.nextToken();
        continue;
      }
      cmds.push(...this.parseCommand());
      this.nextToken();
    }

    return cmds;
  }

  /**
   * Get any errors that occurred during parsing.
   */
  getErrors(): ParserError[] {
    return this.errors;
  }

  /**
   * Advance to the next token.
   */
  private nextToken(): void {
    this.cur = this.peek;
    this.peek = this.lexer.nextToken();
  }

  /**
   * Get peek token type (helper for type-safe comparisons after nextToken).
   */
  private peekType(): TokenTypeValue {
    return this.peek.type;
  }

  /**
   * Parse a single command.
   */
  private parseCommand(): Command[] {
    switch (this.cur.type) {
      case TokenType.SPACE:
      case TokenType.BACKSPACE:
      case TokenType.DELETE:
      case TokenType.INSERT:
      case TokenType.ENTER:
      case TokenType.ESCAPE:
      case TokenType.TAB:
      case TokenType.DOWN:
      case TokenType.LEFT:
      case TokenType.RIGHT:
      case TokenType.UP:
      case TokenType.PAGE_UP:
      case TokenType.PAGE_DOWN:
      case TokenType.SCROLL_UP:
      case TokenType.SCROLL_DOWN:
        return [this.parseKeypress(this.cur.type)];
      case TokenType.SET:
        return [this.parseSet()];
      case TokenType.OUTPUT:
        return [this.parseOutput()];
      case TokenType.SLEEP:
        return [this.parseSleep()];
      case TokenType.TYPE:
        return [this.parseType()];
      case TokenType.CTRL:
        return [this.parseCtrl()];
      case TokenType.ALT:
        return [this.parseAlt()];
      case TokenType.SHIFT:
        return [this.parseShift()];
      case TokenType.HIDE:
        return [this.parseHide()];
      case TokenType.REQUIRE:
        return [this.parseRequire()];
      case TokenType.SHOW:
        return [this.parseShow()];
      case TokenType.WAIT:
        return [this.parseWait()];
      case TokenType.SOURCE:
        return this.parseSource();
      case TokenType.SCREENSHOT:
        return [this.parseScreenshot()];
      case TokenType.COPY:
        return [this.parseCopy()];
      case TokenType.PASTE:
        return [this.parsePaste()];
      case TokenType.ENV:
        return [this.parseEnv()];
      default:
        this.errors.push(newParserError(this.cur, 'Invalid command: ' + this.cur.literal));
        return [newCommand(TokenType.ILLEGAL)];
    }
  }

  /**
   * Parse a Wait command.
   */
  private parseWait(): Command {
    const cmd = newCommand(TokenType.WAIT);

    if (this.peek.type === TokenType.PLUS) {
      this.nextToken();
      const nextPeekType = this.peekType();
      if (nextPeekType !== TokenType.STRING || (this.peek.literal !== 'Line' && this.peek.literal !== 'Screen')) {
        this.errors.push(newParserError(this.peek, 'Wait+ expects Line or Screen'));
        return cmd;
      }
      cmd.args = this.peek.literal;
      this.nextToken();
    } else {
      cmd.args = 'Line';
    }

    cmd.options = this.parseSpeed();
    if (cmd.options) {
      const dur = parseDuration(cmd.options);
      if (dur <= 0) {
        this.errors.push(newParserError(this.peek, 'Wait expects positive duration'));
        return cmd;
      }
    }

    if (this.peek.type !== TokenType.REGEX) {
      return cmd;
    }
    this.nextToken();

    try {
      new RegExp(this.cur.literal);
    } catch (err) {
      this.errors.push(newParserError(this.cur, `Invalid regular expression '${this.cur.literal}': ${err}`));
      return cmd;
    }

    cmd.args += ' ' + this.cur.literal;
    return cmd;
  }

  /**
   * Parse an optional typing speed (@<time>).
   */
  private parseSpeed(): string {
    if (this.peek.type === TokenType.AT) {
      this.nextToken();
      return this.parseTime();
    }
    return '';
  }

  /**
   * Parse an optional repeat count.
   */
  private parseRepeat(): string {
    if (this.peek.type === TokenType.NUMBER) {
      const count = this.peek.literal;
      this.nextToken();
      return count;
    }
    return '1';
  }

  /**
   * Parse a time argument (<number>[ms|s|m]).
   */
  private parseTime(): string {
    let t = '';

    if (this.peek.type === TokenType.NUMBER) {
      t = this.peek.literal;
      this.nextToken();
    } else {
      this.errors.push(newParserError(this.cur, 'Expected time after ' + this.cur.literal));
      return '';
    }

    const nextPeekType = this.peekType();
    if (
      nextPeekType === TokenType.MILLISECONDS ||
      nextPeekType === TokenType.SECONDS ||
      nextPeekType === TokenType.MINUTES
    ) {
      t += this.peek.literal;
      this.nextToken();
    } else {
      t += 's';
    }

    return t;
  }

  /**
   * Parse a Ctrl command (Ctrl[+Alt][+Shift]+<char>).
   */
  private parseCtrl(): Command {
    const args: string[] = [];
    let inModifierChain = true;

    while (this.peek.type === TokenType.PLUS) {
      this.nextToken();
      const peekToken = this.peek;

      // Check if it's a valid modifier
      if (isModifier(peekToken.type)) {
        if (!inModifierChain) {
          this.errors.push(newParserError(this.cur, 'Modifiers must come before other characters'));
          args.length = 0;
          continue;
        }
        args.push(peekToken.literal);
        this.nextToken();
        continue;
      }

      inModifierChain = false;

      // Add key argument
      if (
        peekToken.type === TokenType.ENTER ||
        peekToken.type === TokenType.SPACE ||
        peekToken.type === TokenType.BACKSPACE ||
        peekToken.type === TokenType.MINUS ||
        peekToken.type === TokenType.AT ||
        peekToken.type === TokenType.LEFT_BRACKET ||
        peekToken.type === TokenType.RIGHT_BRACKET ||
        peekToken.type === TokenType.CARET ||
        peekToken.type === TokenType.BACKSLASH ||
        peekToken.type === TokenType.LEFT ||
        peekToken.type === TokenType.RIGHT ||
        peekToken.type === TokenType.UP ||
        peekToken.type === TokenType.DOWN ||
        (peekToken.type === TokenType.STRING && peekToken.literal.length === 1)
      ) {
        args.push(peekToken.literal);
      } else {
        this.errors.push(
          newParserError(this.cur, 'Not a valid modifier'),
          newParserError(this.cur, 'Invalid control argument: ' + this.cur.literal)
        );
      }

      this.nextToken();
    }

    if (args.length === 0) {
      this.errors.push(newParserError(this.cur, 'Expected control character with args, got ' + this.cur.literal));
    }

    return newCommand(TokenType.CTRL, '', args.join(' '));
  }

  /**
   * Parse an Alt command (Alt+<character>).
   */
  private parseAlt(): Command {
    if (this.peek.type === TokenType.PLUS) {
      this.nextToken();
      const nextPeekType = this.peekType();
      if (
        nextPeekType === TokenType.STRING ||
        nextPeekType === TokenType.ENTER ||
        nextPeekType === TokenType.LEFT_BRACKET ||
        nextPeekType === TokenType.RIGHT_BRACKET ||
        nextPeekType === TokenType.TAB
      ) {
        const c = this.peek.literal;
        this.nextToken();
        return newCommand(TokenType.ALT, '', c);
      }
    }

    this.errors.push(newParserError(this.cur, 'Expected alt character, got ' + this.cur.literal));
    return newCommand(TokenType.ALT);
  }

  /**
   * Parse a Shift command (Shift+<char>).
   */
  private parseShift(): Command {
    if (this.peek.type === TokenType.PLUS) {
      this.nextToken();
      const nextPeekType = this.peekType();
      if (
        nextPeekType === TokenType.STRING ||
        nextPeekType === TokenType.ENTER ||
        nextPeekType === TokenType.LEFT_BRACKET ||
        nextPeekType === TokenType.RIGHT_BRACKET ||
        nextPeekType === TokenType.TAB
      ) {
        const c = this.peek.literal;
        this.nextToken();
        return newCommand(TokenType.SHIFT, '', c);
      }
    }

    this.errors.push(newParserError(this.cur, 'Expected shift character, got ' + this.cur.literal));
    return newCommand(TokenType.SHIFT);
  }

  /**
   * Parse a keypress command (Key[@<time>] [count]).
   */
  private parseKeypress(ct: TokenTypeValue): Command {
    const cmd = newCommand(ct);
    cmd.options = this.parseSpeed();
    cmd.args = this.parseRepeat();
    return cmd;
  }

  /**
   * Parse an Output command (Output <path>).
   */
  private parseOutput(): Command {
    const cmd = newCommand(TokenType.OUTPUT);

    if (this.peek.type !== TokenType.STRING) {
      this.errors.push(newParserError(this.cur, 'Expected file path after output'));
      return cmd;
    }

    const ext = path.extname(this.peek.literal);
    if (ext) {
      cmd.options = ext;
    } else {
      cmd.options = '.png';
      if (!this.peek.literal.endsWith('/')) {
        this.errors.push(newParserError(this.peek, 'Expected folder with trailing slash'));
      }
    }

    cmd.args = this.peek.literal;
    this.nextToken();
    return cmd;
  }

  /**
   * Parse a Set command (Set <setting> <value>).
   */
  private parseSet(): Command {
    const cmd = newCommand(TokenType.SET);

    if (isSetting(this.peek.type)) {
      cmd.options = this.peek.literal;
    } else {
      this.errors.push(newParserError(this.peek, 'Unknown setting: ' + this.peek.literal));
    }
    this.nextToken();

    switch (this.cur.type) {
      case TokenType.WAIT_TIMEOUT:
        cmd.args = this.parseTime();
        break;

      case TokenType.WAIT_PATTERN:
        cmd.args = this.peek.literal;
        try {
          new RegExp(this.peek.literal);
        } catch {
          this.errors.push(newParserError(this.peek, 'Invalid regexp pattern: ' + this.peek.literal));
        }
        this.nextToken();
        break;

      case TokenType.LOOP_OFFSET:
        cmd.args = this.peek.literal;
        this.nextToken();
        cmd.args += '%';
        if (this.peek.type === TokenType.PERCENT) {
          this.nextToken();
        }
        break;

      case TokenType.TYPING_SPEED:
        cmd.args = this.peek.literal;
        this.nextToken();
        if (this.peek.type === TokenType.MILLISECONDS || this.peek.type === TokenType.SECONDS) {
          cmd.args += this.peek.literal;
          this.nextToken();
        } else if (cmd.options === 'TypingSpeed') {
          cmd.args += 's';
        }
        break;

      case TokenType.WINDOW_BAR:
        cmd.args = this.peek.literal;
        this.nextToken();

        const windowBar = this.cur.literal;
        if (!isValidWindowBar(windowBar)) {
          this.errors.push(newParserError(this.cur, windowBar + ' is not a valid bar style.'));
        }
        break;

      case TokenType.MARGIN_FILL:
        cmd.args = this.peek.literal;
        this.nextToken();

        const marginFill = this.cur.literal;
        if (marginFill.startsWith('#')) {
          const hex = marginFill.slice(1);
          if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
            this.errors.push(newParserError(this.cur, '"' + marginFill + '" is not a valid color.'));
          }
        }
        break;

      case TokenType.CURSOR_BLINK:
        cmd.args = this.peek.literal;
        this.nextToken();

        // Check if the literal is a valid boolean value
        if (this.cur.literal !== 'true' && this.cur.literal !== 'false') {
          this.errors.push(newParserError(this.cur, 'expected boolean value.'));
        }
        break;

      default:
        cmd.args = this.peek.literal;
        this.nextToken();
        break;
    }

    return cmd;
  }

  /**
   * Parse a Sleep command (Sleep <time>).
   */
  private parseSleep(): Command {
    const cmd = newCommand(TokenType.SLEEP);
    cmd.args = this.parseTime();
    return cmd;
  }

  /**
   * Parse a Hide command.
   */
  private parseHide(): Command {
    return newCommand(TokenType.HIDE);
  }

  /**
   * Parse a Require command (Require <string>).
   */
  private parseRequire(): Command {
    const cmd = newCommand(TokenType.REQUIRE);

    if (this.peek.type !== TokenType.STRING) {
      this.errors.push(newParserError(this.peek, this.cur.literal + ' expects one string'));
    }

    cmd.args = this.peek.literal;
    this.nextToken();

    return cmd;
  }

  /**
   * Parse a Show command.
   */
  private parseShow(): Command {
    return newCommand(TokenType.SHOW);
  }

  /**
   * Parse a Type command (Type "string").
   */
  private parseType(): Command {
    const cmd = newCommand(TokenType.TYPE);

    cmd.options = this.parseSpeed();

    if (this.peek.type !== TokenType.STRING) {
      this.errors.push(newParserError(this.peek, this.cur.literal + ' expects string'));
    }

    while (this.peek.type === TokenType.STRING) {
      this.nextToken();
      cmd.args += this.cur.literal;

      // Add space between consecutive strings
      if (this.peek.type === TokenType.STRING) {
        cmd.args += ' ';
      }
    }

    return cmd;
  }

  /**
   * Parse a Copy command (Copy "string").
   */
  private parseCopy(): Command {
    const cmd = newCommand(TokenType.COPY);

    if (this.peek.type !== TokenType.STRING) {
      this.errors.push(newParserError(this.peek, this.cur.literal + ' expects string'));
    }

    while (this.peek.type === TokenType.STRING) {
      this.nextToken();
      cmd.args += this.cur.literal;

      if (this.peek.type === TokenType.STRING) {
        cmd.args += ' ';
      }
    }

    return cmd;
  }

  /**
   * Parse a Paste command.
   */
  private parsePaste(): Command {
    return newCommand(TokenType.PASTE);
  }

  /**
   * Parse an Env command (Env key "value").
   */
  private parseEnv(): Command {
    const cmd = newCommand(TokenType.ENV);

    cmd.options = this.peek.literal;
    this.nextToken();

    if (this.peek.type !== TokenType.STRING) {
      this.errors.push(newParserError(this.peek, this.cur.literal + ' expects string'));
    }

    cmd.args = this.peek.literal;
    this.nextToken();

    return cmd;
  }

  /**
   * Parse a Source command (Source <path>).
   * Recursively parses the included tape file.
   */
  private parseSource(): Command[] {
    const cmd = newCommand(TokenType.SOURCE);

    if (this.peek.type !== TokenType.STRING) {
      this.errors.push(newParserError(this.cur, 'Expected path after Source'));
      this.nextToken();
      return [cmd];
    }

    const srcPath = this.peek.literal;

    // Check if path has .tape extension
    const ext = path.extname(srcPath);
    if (ext !== '.tape') {
      this.errors.push(newParserError(this.peek, 'Expected file with .tape extension'));
      this.nextToken();
      return [cmd];
    }

    // Check if tape exists
    if (!fs.existsSync(srcPath)) {
      this.errors.push(newParserError(this.peek, `File ${srcPath} not found`));
      this.nextToken();
      return [cmd];
    }

    // Read source tape
    let srcTape: string;
    try {
      srcTape = fs.readFileSync(srcPath, 'utf-8');
    } catch (err) {
      this.errors.push(newParserError(this.peek, `Unable to read file: ${srcPath}`));
      this.nextToken();
      return [cmd];
    }

    // Check source tape is not empty
    if (srcTape.length === 0) {
      this.errors.push(newParserError(this.peek, `Source tape: ${srcPath} is empty`));
      this.nextToken();
      return [cmd];
    }

    // Parse source tape
    const srcLexer = new Lexer(srcTape);
    const srcParser = new Parser(srcLexer);
    const srcCmds = srcParser.parse();

    // Check for nested Source commands
    for (const srcCmd of srcCmds) {
      if (srcCmd.type === TokenType.SOURCE) {
        this.errors.push(newParserError(this.peek, 'Nested Source detected'));
        this.nextToken();
        return [cmd];
      }
    }

    // Check for parse errors in source
    const srcErrors = srcParser.getErrors();
    if (srcErrors.length > 0) {
      this.errors.push(newParserError(this.peek, `${srcPath} has ${srcErrors.length} errors`));
      this.nextToken();
      return [cmd];
    }

    // Filter out Source and Output commands
    const filtered = srcCmds.filter((c) => c.type !== TokenType.SOURCE && c.type !== TokenType.OUTPUT);

    this.nextToken();
    return filtered;
  }

  /**
   * Parse a Screenshot command (Screenshot <path>).
   */
  private parseScreenshot(): Command {
    const cmd = newCommand(TokenType.SCREENSHOT);

    if (this.peek.type !== TokenType.STRING) {
      this.errors.push(newParserError(this.cur, 'Expected path after Screenshot'));
      this.nextToken();
      return cmd;
    }

    const filePath = this.peek.literal;

    // Check if path has .png extension
    const ext = path.extname(filePath);
    if (ext !== '.png') {
      this.errors.push(newParserError(this.peek, 'Expected file with .png extension'));
      this.nextToken();
      return cmd;
    }

    cmd.args = filePath;
    this.nextToken();

    return cmd;
  }
}

/**
 * Check if a window bar style is valid.
 */
function isValidWindowBar(w: string): boolean {
  return w === '' || w === 'Colorful' || w === 'ColorfulRight' || w === 'Rings' || w === 'RingsRight';
}

/**
 * Parse a duration string (e.g., "100ms", "2s", "1m") to milliseconds.
 */
function parseDuration(s: string): number {
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
 * Create a parser for the given input string.
 */
export function createParser(input: string): Parser {
  const lexer = new Lexer(input);
  return new Parser(lexer);
}

/**
 * Parse a tape file and return commands.
 */
export function parseTape(input: string): { commands: Command[]; errors: ParserError[] } {
  const parser = createParser(input);
  const commands = parser.parse();
  const errors = parser.getErrors();
  return { commands, errors };
}
