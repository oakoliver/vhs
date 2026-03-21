/**
 * @oakoliver/vhs — Lexer for the VHS Tape language
 *
 * Zero-dependency TypeScript port of Charmbracelet's VHS lexer package.
 *
 * @module
 */

import { Token, TokenType, TokenTypeValue, lookupIdentifier, newToken } from './token';

/**
 * Lexer tokenizes the input string into VHS tokens.
 */
export class Lexer {
  private input: string;
  private pos: number = 0;
  private nextPos: number = 0;
  private ch: string = '';
  private line: number = 1;
  private column: number = 0;

  constructor(input: string) {
    this.input = input;
    this.readChar();
  }

  /**
   * Advance the lexer to the next character.
   */
  private readChar(): void {
    this.column++;
    this.ch = this.peekChar();
    this.pos = this.nextPos;
    this.nextPos++;
  }

  /**
   * Peek at the next character without advancing.
   */
  private peekChar(): string {
    if (this.nextPos >= this.input.length) {
      return '\0';
    }
    return this.input[this.nextPos];
  }

  /**
   * Get the next token from the input.
   */
  nextToken(): Token {
    this.skipWhitespace();

    const line = this.line;
    const column = this.column;

    switch (this.ch) {
      case '\0':
        return newToken(TokenType.EOF, '', line, column);

      case '@':
        this.readChar();
        return newToken(TokenType.AT, '@', line, column);

      case '=':
        this.readChar();
        return newToken(TokenType.EQUAL, '=', line, column);

      case ']':
        this.readChar();
        return newToken(TokenType.RIGHT_BRACKET, ']', line, column);

      case '[':
        this.readChar();
        return newToken(TokenType.LEFT_BRACKET, '[', line, column);

      case '-':
        this.readChar();
        return newToken(TokenType.MINUS, '-', line, column);

      case '%':
        this.readChar();
        return newToken(TokenType.PERCENT, '%', line, column);

      case '^':
        this.readChar();
        return newToken(TokenType.CARET, '^', line, column);

      case '\\':
        this.readChar();
        return newToken(TokenType.BACKSLASH, '\\', line, column);

      case '#': {
        const comment = this.readComment();
        return newToken(TokenType.COMMENT, comment, line, column);
      }

      case '+':
        this.readChar();
        return newToken(TokenType.PLUS, '+', line, column);

      case '{': {
        const json = '{' + this.readJSON() + '}';
        this.readChar();
        return newToken(TokenType.JSON, json, line, column);
      }

      case '`': {
        const str = this.readString('`');
        this.readChar();
        return newToken(TokenType.STRING, str, line, column);
      }

      case "'": {
        const str = this.readString("'");
        this.readChar();
        return newToken(TokenType.STRING, str, line, column);
      }

      case '"': {
        const str = this.readString('"');
        this.readChar();
        return newToken(TokenType.STRING, str, line, column);
      }

      case '/': {
        const regex = this.readRegex('/');
        this.readChar();
        return newToken(TokenType.REGEX, regex, line, column);
      }

      default:
        if (isDigit(this.ch) || (isDot(this.ch) && isDigit(this.peekChar()))) {
          const num = this.readNumber();
          return newToken(TokenType.NUMBER, num, line, column);
        } else if (isLetter(this.ch) || isDot(this.ch)) {
          const ident = this.readIdentifier();
          const type = lookupIdentifier(ident);
          return newToken(type, ident, line, column);
        } else {
          const illegal = this.ch;
          this.readChar();
          return newToken(TokenType.ILLEGAL, illegal, line, column);
        }
    }
  }

  /**
   * Read a comment (everything after # until end of line).
   */
  private readComment(): string {
    const startPos = this.pos + 1;
    while (true) {
      this.readChar();
      if (isNewLine(this.ch) || this.ch === '\0') {
        break;
      }
    }
    return this.input.slice(startPos, this.pos);
  }

  /**
   * Read a string delimited by the given end character.
   */
  private readString(endChar: string): string {
    const startPos = this.pos + 1;
    while (true) {
      this.readChar();
      if (this.ch === endChar || this.ch === '\0' || isNewLine(this.ch)) {
        break;
      }
    }
    return this.input.slice(startPos, this.pos);
  }

  /**
   * Read a regex pattern, handling escaped delimiters.
   * Counts consecutive backslashes to determine if a delimiter is truly escaped.
   *
   * Examples:
   * - /foo\/bar/ => foo\/bar (delimiter is escaped)
   * - /foo\\/    => foo\\    (delimiter is NOT escaped, backslash is escaped)
   * - /foo\\\/bar/ => foo\\\/bar (delimiter is escaped)
   */
  private readRegex(endChar: string): string {
    const startPos = this.pos + 1;
    while (true) {
      this.readChar();
      if (this.ch === '\0' || isNewLine(this.ch)) {
        break;
      }

      if (this.ch === '\\') {
        let backslashCount = 0;

        while (this.ch === '\\' && this.pos < this.input.length) {
          backslashCount++;
          this.readChar();
        }

        if (this.ch === endChar) {
          // Odd number of backslashes = delimiter is escaped
          if (backslashCount % 2 === 1) {
            continue;
          }
          // Even number = delimiter is NOT escaped, end of regex
          break;
        }

        continue;
      }

      if (this.ch === endChar) {
        break;
      }
    }
    return this.input.slice(startPos, this.pos);
  }

  /**
   * Read a JSON object (everything between { and }).
   */
  private readJSON(): string {
    const startPos = this.pos + 1;
    while (true) {
      this.readChar();
      if (this.ch === '}' || this.ch === '\0') {
        break;
      }
    }
    return this.input.slice(startPos, this.pos);
  }

  /**
   * Read a number (digits and dots).
   */
  private readNumber(): string {
    const startPos = this.pos;
    while (isDigit(this.ch) || isDot(this.ch)) {
      this.readChar();
    }
    return this.input.slice(startPos, this.pos);
  }

  /**
   * Read an identifier (letters, dots, dashes, underscores, slashes, percent, digits).
   */
  private readIdentifier(): string {
    const startPos = this.pos;
    while (
      isLetter(this.ch) ||
      isDot(this.ch) ||
      isDash(this.ch) ||
      isUnderscore(this.ch) ||
      isSlash(this.ch) ||
      isPercent(this.ch) ||
      isDigit(this.ch)
    ) {
      this.readChar();
    }
    return this.input.slice(startPos, this.pos);
  }

  /**
   * Skip whitespace characters, incrementing line counter on newlines.
   */
  private skipWhitespace(): void {
    while (isWhitespace(this.ch)) {
      // Only count \n as newline to avoid double-counting \r\n on Windows
      if (this.ch === '\n') {
        this.line++;
        this.column = 0;
      }
      this.readChar();
    }
  }

  /**
   * Tokenize the entire input and return all tokens.
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];
    let token = this.nextToken();
    while (token.type !== TokenType.EOF) {
      tokens.push(token);
      token = this.nextToken();
    }
    tokens.push(token); // Include EOF token
    return tokens;
  }
}

// Character classification helpers

function isDot(ch: string): boolean {
  return ch === '.';
}

function isDash(ch: string): boolean {
  return ch === '-';
}

function isUnderscore(ch: string): boolean {
  return ch === '_';
}

function isPercent(ch: string): boolean {
  return ch === '%';
}

function isSlash(ch: string): boolean {
  return ch === '/';
}

function isLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isNewLine(ch: string): boolean {
  return ch === '\n' || ch === '\r';
}

/**
 * Create a new lexer for the given input.
 */
export function createLexer(input: string): Lexer {
  return new Lexer(input);
}
