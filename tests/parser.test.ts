/**
 * Parser tests - ported from Go parser/parser_test.go
 */
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer';
import { Parser, parseTape } from '../src/parser';
import { TokenType } from '../src/token';

describe('Parser', () => {
  test('TestParser - parses VHS commands correctly', () => {
    const input = `
Set TypingSpeed 100ms
Set WaitTimeout 1m
Set WaitPattern /foo/
Type "echo 'Hello, World!'"
Enter
Backspace@0.1 5
Backspace@.1 5
Backspace@1 5
Backspace@100ms 5
Delete 2
Insert 2
Right 3
Left 3
Up@50ms
Down 2
ScrollUp 4
ScrollDown@100ms 2
Ctrl+C
Ctrl+L
Alt+.
Sleep 100ms
Sleep 3
Wait
Wait+Screen
Wait@100ms /foobar/`;

    const expected = [
      { type: TokenType.SET, options: 'TypingSpeed', args: '100ms' },
      { type: TokenType.SET, options: 'WaitTimeout', args: '1m' },
      { type: TokenType.SET, options: 'WaitPattern', args: 'foo' },
      { type: TokenType.TYPE, options: '', args: "echo 'Hello, World!'" },
      { type: TokenType.ENTER, options: '', args: '1' },
      { type: TokenType.BACKSPACE, options: '0.1s', args: '5' },
      { type: TokenType.BACKSPACE, options: '.1s', args: '5' },
      { type: TokenType.BACKSPACE, options: '1s', args: '5' },
      { type: TokenType.BACKSPACE, options: '100ms', args: '5' },
      { type: TokenType.DELETE, options: '', args: '2' },
      { type: TokenType.INSERT, options: '', args: '2' },
      { type: TokenType.RIGHT, options: '', args: '3' },
      { type: TokenType.LEFT, options: '', args: '3' },
      { type: TokenType.UP, options: '50ms', args: '1' },
      { type: TokenType.DOWN, options: '', args: '2' },
      { type: TokenType.SCROLL_UP, options: '', args: '4' },
      { type: TokenType.SCROLL_DOWN, options: '100ms', args: '2' },
      { type: TokenType.CTRL, options: '', args: 'C' },
      { type: TokenType.CTRL, options: '', args: 'L' },
      { type: TokenType.ALT, options: '', args: '.' },
      { type: TokenType.SLEEP, options: '', args: '100ms' },
      { type: TokenType.SLEEP, options: '', args: '3s' },
      { type: TokenType.WAIT, options: '', args: 'Line' },
      { type: TokenType.WAIT, options: '', args: 'Screen' },
      { type: TokenType.WAIT, options: '100ms', args: 'Line foobar' },
    ];

    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const cmds = parser.parse();

    expect(cmds.length).toBe(expected.length);

    for (let i = 0; i < cmds.length; i++) {
      expect(cmds[i].type).toBe(expected[i].type);
      expect(cmds[i].args).toBe(expected[i].args);
      expect(cmds[i].options).toBe(expected[i].options);
    }
  });

  test('TestParserErrors - reports parse errors correctly', () => {
    const input = `
Type Enter
Type "echo 'Hello, World!'" Enter
Foo
Sleep Bar`;

    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    parser.parse();

    const errors = parser.getErrors();

    // Should have errors for: Type without string, invalid Foo command, Sleep without time, invalid Bar
    expect(errors.length).toBeGreaterThan(0);

    // Check that we got the expected error messages (format may differ slightly)
    const errorMessages = errors.map((e) => e.msg);
    expect(errorMessages.some((msg) => msg.includes('Type') || msg.includes('string'))).toBe(true);
    expect(errorMessages.some((msg) => msg.includes('Foo') || msg.includes('Invalid'))).toBe(true);
  });

  test('TestParseTapeFile - parses all.tape fixture correctly', () => {
    const input = `# All Commands

# Output:
Output examples/fixtures/all.gif
Output examples/fixtures/all.mp4
Output examples/fixtures/all.webm

# Settings:
Set Shell "fish"
Set FontSize 22
Set FontFamily "DejaVu Sans Mono"
Set Height 600
Set Width 1200
Set LetterSpacing 1
Set LineHeight 1.2
Set Theme { "name": "Whimsy", "black": "#535178", "red": "#ef6487", "green": "#5eca89", "yellow": "#fdd877", "blue": "#65aef7", "purple": "#aa7ff0", "cyan": "#43c1be", "white": "#ffffff", "brightBlack": "#535178", "brightRed": "#ef6487", "brightGreen": "#5eca89", "brightYellow": "#fdd877", "brightBlue": "#65aef7", "brightPurple": "#aa7ff0", "brightCyan": "#43c1be", "brightWhite": "#ffffff", "background": "#29283b", "foreground": "#b3b0d6", "selectionBackground": "#3d3c58", "cursorColor": "#b3b0d6" }
Set Theme "Catppuccin Mocha"
Set Padding 50
Set Framerate 60
Set PlaybackSpeed 2
Set TypingSpeed .1
Set LoopOffset 60.4
Set LoopOffset 20.99%
Set CursorBlink false

# Sleep:
Sleep 1
Sleep 500ms
Sleep .5
Sleep 0.5

# Type:
Type@.5 "All"
Type@500ms "All"
Type "Double Quote"
Type '"Single" Quote'
Type \`"Backtick" 'Quote'\`

# Keys:
Backspace
Backspace 2
Backspace@1 3

Delete
Delete 2
Delete@1 3

Insert
Insert 2
Insert@1 3

Down
Down 2
Down@1 3

PageDown
PageDown 2
PageDown@1 3

ScrollDown
ScrollDown 2
ScrollDown@1 3

Enter
Enter 2
Enter@1 3

Space
Space 2
Space@1 3

Tab
Tab 2
Tab@1 3

Left
Left 2
Left@1 3

Right
Right 2
Right@1 3

Up
Up 2
Up@1 3

PageUp
PageUp 2
PageUp@1 3

ScrollUp
ScrollUp 2
ScrollUp@1 3

Down
Down 2
Down@1 3

# Control:
Ctrl+C
Ctrl+L
Ctrl+R

# Alt:
Alt+.
Alt+L
Alt+i

# Display:
Hide
Show`;

    const expected = [
      { type: TokenType.OUTPUT, options: '.gif', args: 'examples/fixtures/all.gif' },
      { type: TokenType.OUTPUT, options: '.mp4', args: 'examples/fixtures/all.mp4' },
      { type: TokenType.OUTPUT, options: '.webm', args: 'examples/fixtures/all.webm' },
      { type: TokenType.SET, options: 'Shell', args: 'fish' },
      { type: TokenType.SET, options: 'FontSize', args: '22' },
      { type: TokenType.SET, options: 'FontFamily', args: 'DejaVu Sans Mono' },
      { type: TokenType.SET, options: 'Height', args: '600' },
      { type: TokenType.SET, options: 'Width', args: '1200' },
      { type: TokenType.SET, options: 'LetterSpacing', args: '1' },
      { type: TokenType.SET, options: 'LineHeight', args: '1.2' },
      {
        type: TokenType.SET,
        options: 'Theme',
        args: '{ "name": "Whimsy", "black": "#535178", "red": "#ef6487", "green": "#5eca89", "yellow": "#fdd877", "blue": "#65aef7", "purple": "#aa7ff0", "cyan": "#43c1be", "white": "#ffffff", "brightBlack": "#535178", "brightRed": "#ef6487", "brightGreen": "#5eca89", "brightYellow": "#fdd877", "brightBlue": "#65aef7", "brightPurple": "#aa7ff0", "brightCyan": "#43c1be", "brightWhite": "#ffffff", "background": "#29283b", "foreground": "#b3b0d6", "selectionBackground": "#3d3c58", "cursorColor": "#b3b0d6" }',
      },
      { type: TokenType.SET, options: 'Theme', args: 'Catppuccin Mocha' },
      { type: TokenType.SET, options: 'Padding', args: '50' },
      { type: TokenType.SET, options: 'Framerate', args: '60' },
      { type: TokenType.SET, options: 'PlaybackSpeed', args: '2' },
      { type: TokenType.SET, options: 'TypingSpeed', args: '.1s' },
      { type: TokenType.SET, options: 'LoopOffset', args: '60.4%' },
      { type: TokenType.SET, options: 'LoopOffset', args: '20.99%' },
      { type: TokenType.SET, options: 'CursorBlink', args: 'false' },
      { type: TokenType.SLEEP, options: '', args: '1s' },
      { type: TokenType.SLEEP, options: '', args: '500ms' },
      { type: TokenType.SLEEP, options: '', args: '.5s' },
      { type: TokenType.SLEEP, options: '', args: '0.5s' },
      { type: TokenType.TYPE, options: '.5s', args: 'All' },
      { type: TokenType.TYPE, options: '500ms', args: 'All' },
      { type: TokenType.TYPE, options: '', args: 'Double Quote' },
      { type: TokenType.TYPE, options: '', args: '"Single" Quote' },
      { type: TokenType.TYPE, options: '', args: `"Backtick" 'Quote'` },
      { type: TokenType.BACKSPACE, options: '', args: '1' },
      { type: TokenType.BACKSPACE, options: '', args: '2' },
      { type: TokenType.BACKSPACE, options: '1s', args: '3' },
      { type: TokenType.DELETE, options: '', args: '1' },
      { type: TokenType.DELETE, options: '', args: '2' },
      { type: TokenType.DELETE, options: '1s', args: '3' },
      { type: TokenType.INSERT, options: '', args: '1' },
      { type: TokenType.INSERT, options: '', args: '2' },
      { type: TokenType.INSERT, options: '1s', args: '3' },
      { type: TokenType.DOWN, options: '', args: '1' },
      { type: TokenType.DOWN, options: '', args: '2' },
      { type: TokenType.DOWN, options: '1s', args: '3' },
      { type: TokenType.PAGE_DOWN, options: '', args: '1' },
      { type: TokenType.PAGE_DOWN, options: '', args: '2' },
      { type: TokenType.PAGE_DOWN, options: '1s', args: '3' },
      { type: TokenType.SCROLL_DOWN, options: '', args: '1' },
      { type: TokenType.SCROLL_DOWN, options: '', args: '2' },
      { type: TokenType.SCROLL_DOWN, options: '1s', args: '3' },
      { type: TokenType.ENTER, options: '', args: '1' },
      { type: TokenType.ENTER, options: '', args: '2' },
      { type: TokenType.ENTER, options: '1s', args: '3' },
      { type: TokenType.SPACE, options: '', args: '1' },
      { type: TokenType.SPACE, options: '', args: '2' },
      { type: TokenType.SPACE, options: '1s', args: '3' },
      { type: TokenType.TAB, options: '', args: '1' },
      { type: TokenType.TAB, options: '', args: '2' },
      { type: TokenType.TAB, options: '1s', args: '3' },
      { type: TokenType.LEFT, options: '', args: '1' },
      { type: TokenType.LEFT, options: '', args: '2' },
      { type: TokenType.LEFT, options: '1s', args: '3' },
      { type: TokenType.RIGHT, options: '', args: '1' },
      { type: TokenType.RIGHT, options: '', args: '2' },
      { type: TokenType.RIGHT, options: '1s', args: '3' },
      { type: TokenType.UP, options: '', args: '1' },
      { type: TokenType.UP, options: '', args: '2' },
      { type: TokenType.UP, options: '1s', args: '3' },
      { type: TokenType.PAGE_UP, options: '', args: '1' },
      { type: TokenType.PAGE_UP, options: '', args: '2' },
      { type: TokenType.PAGE_UP, options: '1s', args: '3' },
      { type: TokenType.SCROLL_UP, options: '', args: '1' },
      { type: TokenType.SCROLL_UP, options: '', args: '2' },
      { type: TokenType.SCROLL_UP, options: '1s', args: '3' },
      { type: TokenType.DOWN, options: '', args: '1' },
      { type: TokenType.DOWN, options: '', args: '2' },
      { type: TokenType.DOWN, options: '1s', args: '3' },
      { type: TokenType.CTRL, options: '', args: 'C' },
      { type: TokenType.CTRL, options: '', args: 'L' },
      { type: TokenType.CTRL, options: '', args: 'R' },
      { type: TokenType.ALT, options: '', args: '.' },
      { type: TokenType.ALT, options: '', args: 'L' },
      { type: TokenType.ALT, options: '', args: 'i' },
      { type: TokenType.HIDE, options: '', args: '' },
      { type: TokenType.SHOW, options: '', args: '' },
    ];

    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const cmds = parser.parse();

    expect(cmds.length).toBe(expected.length);

    for (let i = 0; i < cmds.length; i++) {
      expect(cmds[i].type).toBe(expected[i].type);
      expect(cmds[i].args).toBe(expected[i].args);
      expect(cmds[i].options).toBe(expected[i].options);
    }
  });

  describe('TestParseAlt', () => {
    const altTests = [
      { name: 'Alt+letter', tape: 'Alt+a', wantArgs: 'a', wantErr: false },
      { name: 'Alt+uppercase', tape: 'Alt+A', wantArgs: 'A', wantErr: false },
      { name: 'Alt+dot', tape: 'Alt+.', wantArgs: '.', wantErr: false },
      { name: 'Alt+number 1', tape: 'Alt+1', wantArgs: '1', wantErr: false },
      { name: 'Alt+number 9', tape: 'Alt+9', wantArgs: '9', wantErr: false },
      { name: 'Alt+Enter', tape: 'Alt+Enter', wantArgs: 'Enter', wantErr: false },
      { name: 'Alt+Tab', tape: 'Alt+Tab', wantArgs: 'Tab', wantErr: false },
      { name: 'Alt+[', tape: 'Alt+[', wantArgs: '[', wantErr: false },
      { name: 'Alt+]', tape: 'Alt+]', wantArgs: ']', wantErr: false },
    ];

    for (const tc of altTests) {
      test(tc.name, () => {
        const { commands, errors } = parseTape(tc.tape);

        if (tc.wantErr) {
          expect(errors.length).toBeGreaterThan(0);
          return;
        }

        expect(errors.length).toBe(0);
        expect(commands.length).toBe(1);
        expect(commands[0].type).toBe(TokenType.ALT);
        expect(commands[0].args).toBe(tc.wantArgs);
      });
    }
  });

  describe('TestParseShift', () => {
    const shiftTests = [
      { name: 'Shift+letter', tape: 'Shift+a', wantArgs: 'a', wantErr: false },
      { name: 'Shift+uppercase', tape: 'Shift+A', wantArgs: 'A', wantErr: false },
      { name: 'Shift+number 1', tape: 'Shift+1', wantArgs: '1', wantErr: false },
      { name: 'Shift+number 9', tape: 'Shift+9', wantArgs: '9', wantErr: false },
      { name: 'Shift+Enter', tape: 'Shift+Enter', wantArgs: 'Enter', wantErr: false },
      { name: 'Shift+Tab', tape: 'Shift+Tab', wantArgs: 'Tab', wantErr: false },
      { name: 'Shift+[', tape: 'Shift+[', wantArgs: '[', wantErr: false },
      { name: 'Shift+]', tape: 'Shift+]', wantArgs: ']', wantErr: false },
    ];

    for (const tc of shiftTests) {
      test(tc.name, () => {
        const { commands, errors } = parseTape(tc.tape);

        if (tc.wantErr) {
          expect(errors.length).toBeGreaterThan(0);
          return;
        }

        expect(errors.length).toBe(0);
        expect(commands.length).toBe(1);
        expect(commands[0].type).toBe(TokenType.SHIFT);
        expect(commands[0].args).toBe(tc.wantArgs);
      });
    }
  });

  describe('TestParseCtrl', () => {
    const ctrlTests = [
      {
        name: 'should parse with multiple modifiers',
        tape: 'Ctrl+Shift+Alt+C',
        wantArgs: ['Shift', 'Alt', 'C'],
        wantErr: false,
      },
      {
        name: 'should not parse with out of order modifiers',
        tape: 'Ctrl+Shift+C+Alt',
        wantErr: true,
      },
      {
        name: 'should not parse with out of order modifiers 2',
        tape: 'Ctrl+Shift+C+Alt+C',
        wantErr: true,
      },
      {
        name: 'should parse Ctrl+Left',
        tape: 'Ctrl+Left',
        wantArgs: ['Left'],
        wantErr: false,
      },
      {
        name: 'should parse Ctrl+Right',
        tape: 'Ctrl+Right',
        wantArgs: ['Right'],
        wantErr: false,
      },
      {
        name: 'should parse Ctrl+Up',
        tape: 'Ctrl+Up',
        wantArgs: ['Up'],
        wantErr: false,
      },
      {
        name: 'should parse Ctrl+Down',
        tape: 'Ctrl+Down',
        wantArgs: ['Down'],
        wantErr: false,
      },
      {
        name: 'should parse Ctrl+Alt+Left',
        tape: 'Ctrl+Alt+Left',
        wantArgs: ['Alt', 'Left'],
        wantErr: false,
      },
      {
        name: 'should parse Ctrl+Alt+Right',
        tape: 'Ctrl+Alt+Right',
        wantArgs: ['Alt', 'Right'],
        wantErr: false,
      },
      {
        name: 'should parse Ctrl+Alt+Up',
        tape: 'Ctrl+Alt+Up',
        wantArgs: ['Alt', 'Up'],
        wantErr: false,
      },
      {
        name: 'should parse Ctrl+Alt+Down',
        tape: 'Ctrl+Alt+Down',
        wantArgs: ['Alt', 'Down'],
        wantErr: false,
      },
      {
        name: 'Ctrl+Backspace',
        tape: 'Ctrl+Backspace',
        wantArgs: ['Backspace'],
        wantErr: false,
      },
      {
        name: 'Ctrl+Space',
        tape: 'Ctrl+Space',
        wantArgs: ['Space'],
        wantErr: false,
      },
    ];

    for (const tc of ctrlTests) {
      test(tc.name, () => {
        const { commands, errors } = parseTape(tc.tape);

        if (tc.wantErr) {
          expect(errors.length).toBeGreaterThan(0);
          return;
        }

        expect(errors.length).toBe(0);
        expect(commands.length).toBe(1);

        const args = commands[0].args.split(' ');
        expect(args).toEqual(tc.wantArgs);
      });
    }
  });

  describe('TestParseScreenshot', () => {
    test('should return error when screenshot extension is NOT .png', () => {
      const { errors } = parseTape('Screenshot step_one_screenshot.jpg');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.msg.includes('.png'))).toBe(true);
    });

    test('should return error when screenshot path is missing', () => {
      const { errors } = parseTape('Screenshot');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.msg.includes('path') || e.msg.includes('Screenshot'))).toBe(true);
    });
  });

  // Basic tests from original parser.test.ts
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
    const { errors } = parseTape('InvalidCommand');

    expect(errors.length).toBeGreaterThan(0);
  });
});
