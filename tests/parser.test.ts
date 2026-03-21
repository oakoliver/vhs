import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer';
import { Parser, parseTape, formatCommand } from '../src/parser';
import { TokenType } from '../src/token';

describe('Lexer', () => {
  test('tokenizes simple commands', () => {
    const input = 'Type "Hello, World!"';
    const lexer = new Lexer(input);
    
    const token1 = lexer.nextToken();
    expect(token1.type).toBe(TokenType.TYPE);
    expect(token1.literal).toBe('Type');
    
    const token2 = lexer.nextToken();
    expect(token2.type).toBe(TokenType.STRING);
    expect(token2.literal).toBe('Hello, World!');
    
    const token3 = lexer.nextToken();
    expect(token3.type).toBe(TokenType.EOF);
  });

  test('tokenizes Set command', () => {
    const input = 'Set FontSize 22';
    const lexer = new Lexer(input);
    
    expect(lexer.nextToken().type).toBe(TokenType.SET);
    expect(lexer.nextToken().type).toBe(TokenType.FONT_SIZE);
    const numToken = lexer.nextToken();
    expect(numToken.type).toBe(TokenType.NUMBER);
    expect(numToken.literal).toBe('22');
  });

  test('tokenizes Sleep with units', () => {
    const input = 'Sleep 500ms';
    const lexer = new Lexer(input);
    
    expect(lexer.nextToken().type).toBe(TokenType.SLEEP);
    expect(lexer.nextToken().type).toBe(TokenType.NUMBER);
    expect(lexer.nextToken().type).toBe(TokenType.MILLISECONDS);
  });

  test('handles comments', () => {
    const input = '# This is a comment\nType "test"';
    const lexer = new Lexer(input);
    
    const comment = lexer.nextToken();
    expect(comment.type).toBe(TokenType.COMMENT);
    // Note: Comment literal excludes the leading '#', matching Go behavior
    expect(comment.literal).toBe(' This is a comment');
    
    expect(lexer.nextToken().type).toBe(TokenType.TYPE);
  });

  test('tokenizes Ctrl command', () => {
    const input = 'Ctrl+c';
    const lexer = new Lexer(input);
    
    expect(lexer.nextToken().type).toBe(TokenType.CTRL);
    expect(lexer.nextToken().type).toBe(TokenType.PLUS);
    const charToken = lexer.nextToken();
    expect(charToken.type).toBe(TokenType.STRING);
    expect(charToken.literal).toBe('c');
  });

  test('tokenizes Output command', () => {
    const input = 'Output demo.gif';
    const lexer = new Lexer(input);
    
    expect(lexer.nextToken().type).toBe(TokenType.OUTPUT);
    const pathToken = lexer.nextToken();
    expect(pathToken.type).toBe(TokenType.STRING);
    expect(pathToken.literal).toBe('demo.gif');
  });

  test('tracks line and column numbers', () => {
    const input = 'Type "a"\nSleep 1s';
    const lexer = new Lexer(input);
    
    const token1 = lexer.nextToken();
    expect(token1.line).toBe(1);
    expect(token1.column).toBe(1);
    
    lexer.nextToken(); // "a"
    
    const token3 = lexer.nextToken(); // Sleep
    expect(token3.line).toBe(2);
    expect(token3.column).toBe(1);
  });
});

describe('Parser', () => {
  test('parses Type command', () => {
    const { commands, errors } = parseTape('Type "Hello"');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.TYPE);
    expect(commands[0].args).toBe('Hello');
  });

  test('parses Type with speed option', () => {
    const { commands, errors } = parseTape('Type@100ms "fast typing"');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.TYPE);
    expect(commands[0].options).toBe('100ms');
    expect(commands[0].args).toBe('fast typing');
  });

  test('parses Set command', () => {
    const { commands, errors } = parseTape('Set FontSize 24');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.SET);
    expect(commands[0].options).toBe('FontSize');
    expect(commands[0].args).toBe('24');
  });

  test('parses Sleep command', () => {
    const { commands, errors } = parseTape('Sleep 2s');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.SLEEP);
    expect(commands[0].args).toBe('2s');
  });

  test('parses Output command', () => {
    const { commands, errors } = parseTape('Output demo.gif');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.OUTPUT);
    expect(commands[0].args).toBe('demo.gif');
    expect(commands[0].options).toBe('.gif');
  });

  test('parses Ctrl command', () => {
    const { commands, errors } = parseTape('Ctrl+c');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.CTRL);
    expect(commands[0].args).toBe('c');
  });

  test('parses Ctrl+Shift command', () => {
    const { commands, errors } = parseTape('Ctrl+Shift+c');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.CTRL);
    expect(commands[0].args).toBe('Shift c');
  });

  test('parses Enter with repeat count', () => {
    const { commands, errors } = parseTape('Enter 3');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.ENTER);
    expect(commands[0].args).toBe('3');
  });

  test('parses multiple commands', () => {
    const tape = `
      Output demo.gif
      Set Theme "Dracula"
      Type "echo hello"
      Enter
      Sleep 1s
    `;
    const { commands, errors } = parseTape(tape);
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(5);
    expect(commands[0].type).toBe(TokenType.OUTPUT);
    expect(commands[1].type).toBe(TokenType.SET);
    expect(commands[2].type).toBe(TokenType.TYPE);
    expect(commands[3].type).toBe(TokenType.ENTER);
    expect(commands[4].type).toBe(TokenType.SLEEP);
  });

  test('parses Hide and Show', () => {
    const { commands, errors } = parseTape('Hide\nType "hidden"\nShow');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(3);
    expect(commands[0].type).toBe(TokenType.HIDE);
    expect(commands[1].type).toBe(TokenType.TYPE);
    expect(commands[2].type).toBe(TokenType.SHOW);
  });

  test('parses Wait command', () => {
    const { commands, errors } = parseTape('Wait');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.WAIT);
    expect(commands[0].args).toBe('Line');
  });

  test('parses Screenshot command', () => {
    const { commands, errors } = parseTape('Screenshot screenshot.png');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.SCREENSHOT);
    expect(commands[0].args).toBe('screenshot.png');
  });

  test('parses Env command', () => {
    const { commands, errors } = parseTape('Env FOO "bar"');
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe(TokenType.ENV);
    expect(commands[0].options).toBe('FOO');
    expect(commands[0].args).toBe('bar');
  });

  test('ignores comments', () => {
    const tape = `
      # This is a comment
      Type "hello"
      # Another comment
      Enter
    `;
    const { commands, errors } = parseTape(tape);
    
    expect(errors).toHaveLength(0);
    expect(commands).toHaveLength(2);
  });

  test('reports errors for invalid commands', () => {
    const { commands, errors } = parseTape('InvalidCommand');
    
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('formatCommand', () => {
  test('formats Type command', () => {
    const cmd = { type: TokenType.TYPE as const, options: '', args: 'hello' };
    expect(formatCommand(cmd)).toBe('Type hello');
  });

  test('formats Set command with options', () => {
    const cmd = { type: TokenType.SET as const, options: 'FontSize', args: '24' };
    expect(formatCommand(cmd)).toBe('Set FontSize 24');
  });
});
