/**
 * Lexer tests - ported from Go lexer/lexer_test.go
 */
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer';
import { TokenType } from '../src/token';

describe('Lexer', () => {
  test('TestNextToken - tokenizes VHS commands correctly', () => {
    const input = `
Output examples/out.gif
Set FontSize 42
Set Padding 5
Set CursorBlink false
Type "echo 'Hello, world!'"
Enter
Type@.1 "echo 'Hello, world!'"
Left 3
Sleep 1
Right@100ms 3
ScrollUp 3
ScrollDown@100ms 2
Sleep 500ms
Ctrl+C
Enter
Ctrl+@
Ctrl+\\
Alt+]
Shift+[
Sleep .1
Sleep 100ms
Sleep 2
Wait+Screen@1m /foobar/
Wait+Screen@1m /foo\\/bar/
Wait+Screen@1m /foo\\\\/
Wait+Screen@1m /foo\\\\\\/bar/`;

    const tests: Array<{ expectedType: string; expectedLiteral: string }> = [
      { expectedType: TokenType.OUTPUT, expectedLiteral: 'Output' },
      { expectedType: TokenType.STRING, expectedLiteral: 'examples/out.gif' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.FONT_SIZE, expectedLiteral: 'FontSize' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '42' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.PADDING, expectedLiteral: 'Padding' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '5' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.CURSOR_BLINK, expectedLiteral: 'CursorBlink' },
      { expectedType: TokenType.BOOLEAN, expectedLiteral: 'false' },
      { expectedType: TokenType.TYPE, expectedLiteral: 'Type' },
      { expectedType: TokenType.STRING, expectedLiteral: "echo 'Hello, world!'" },
      { expectedType: TokenType.ENTER, expectedLiteral: 'Enter' },
      { expectedType: TokenType.TYPE, expectedLiteral: 'Type' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '.1' },
      { expectedType: TokenType.STRING, expectedLiteral: "echo 'Hello, world!'" },
      { expectedType: TokenType.LEFT, expectedLiteral: 'Left' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.SLEEP, expectedLiteral: 'Sleep' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.RIGHT, expectedLiteral: 'Right' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '100' },
      { expectedType: TokenType.MILLISECONDS, expectedLiteral: 'ms' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.SCROLL_UP, expectedLiteral: 'ScrollUp' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.SCROLL_DOWN, expectedLiteral: 'ScrollDown' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '100' },
      { expectedType: TokenType.MILLISECONDS, expectedLiteral: 'ms' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.SLEEP, expectedLiteral: 'Sleep' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '500' },
      { expectedType: TokenType.MILLISECONDS, expectedLiteral: 'ms' },
      { expectedType: TokenType.CTRL, expectedLiteral: 'Ctrl' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: 'C' },
      { expectedType: TokenType.ENTER, expectedLiteral: 'Enter' },
      { expectedType: TokenType.CTRL, expectedLiteral: 'Ctrl' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.CTRL, expectedLiteral: 'Ctrl' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.BACKSLASH, expectedLiteral: '\\' },
      { expectedType: TokenType.ALT, expectedLiteral: 'Alt' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.RIGHT_BRACKET, expectedLiteral: ']' },
      { expectedType: TokenType.SHIFT, expectedLiteral: 'Shift' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.LEFT_BRACKET, expectedLiteral: '[' },
      { expectedType: TokenType.SLEEP, expectedLiteral: 'Sleep' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '.1' },
      { expectedType: TokenType.SLEEP, expectedLiteral: 'Sleep' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '100' },
      { expectedType: TokenType.MILLISECONDS, expectedLiteral: 'ms' },
      { expectedType: TokenType.SLEEP, expectedLiteral: 'Sleep' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.WAIT, expectedLiteral: 'Wait' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: 'Screen' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.MINUTES, expectedLiteral: 'm' },
      { expectedType: TokenType.REGEX, expectedLiteral: 'foobar' },
      { expectedType: TokenType.WAIT, expectedLiteral: 'Wait' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: 'Screen' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.MINUTES, expectedLiteral: 'm' },
      { expectedType: TokenType.REGEX, expectedLiteral: 'foo\\/bar' },
      { expectedType: TokenType.WAIT, expectedLiteral: 'Wait' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: 'Screen' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.MINUTES, expectedLiteral: 'm' },
      { expectedType: TokenType.REGEX, expectedLiteral: 'foo\\\\' },
      { expectedType: TokenType.WAIT, expectedLiteral: 'Wait' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: 'Screen' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.MINUTES, expectedLiteral: 'm' },
      { expectedType: TokenType.REGEX, expectedLiteral: 'foo\\\\\\/bar' },
    ];

    const lexer = new Lexer(input);

    for (let i = 0; i < tests.length; i++) {
      const tok = lexer.nextToken();
      const tt = tests[i];

      expect(tok.type).toBe(tt.expectedType);
      expect(tok.literal).toBe(tt.expectedLiteral);
    }
  });

  test('TestLexTapeFile - tokenizes all.tape fixture correctly', () => {
    // This is the content of examples/fixtures/all.tape
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

    const tests: Array<{ expectedType: string; expectedLiteral: string }> = [
      { expectedType: TokenType.COMMENT, expectedLiteral: ' All Commands' },
      { expectedType: TokenType.COMMENT, expectedLiteral: ' Output:' },
      { expectedType: TokenType.OUTPUT, expectedLiteral: 'Output' },
      { expectedType: TokenType.STRING, expectedLiteral: 'examples/fixtures/all.gif' },
      { expectedType: TokenType.OUTPUT, expectedLiteral: 'Output' },
      { expectedType: TokenType.STRING, expectedLiteral: 'examples/fixtures/all.mp4' },
      { expectedType: TokenType.OUTPUT, expectedLiteral: 'Output' },
      { expectedType: TokenType.STRING, expectedLiteral: 'examples/fixtures/all.webm' },
      { expectedType: TokenType.COMMENT, expectedLiteral: ' Settings:' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.SHELL, expectedLiteral: 'Shell' },
      { expectedType: TokenType.STRING, expectedLiteral: 'fish' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.FONT_SIZE, expectedLiteral: 'FontSize' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '22' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.FONT_FAMILY, expectedLiteral: 'FontFamily' },
      { expectedType: TokenType.STRING, expectedLiteral: 'DejaVu Sans Mono' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.HEIGHT, expectedLiteral: 'Height' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '600' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.WIDTH, expectedLiteral: 'Width' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1200' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.LETTER_SPACING, expectedLiteral: 'LetterSpacing' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.LINE_HEIGHT, expectedLiteral: 'LineHeight' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1.2' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.THEME, expectedLiteral: 'Theme' },
      { expectedType: TokenType.JSON, expectedLiteral: '{ "name": "Whimsy", "black": "#535178", "red": "#ef6487", "green": "#5eca89", "yellow": "#fdd877", "blue": "#65aef7", "purple": "#aa7ff0", "cyan": "#43c1be", "white": "#ffffff", "brightBlack": "#535178", "brightRed": "#ef6487", "brightGreen": "#5eca89", "brightYellow": "#fdd877", "brightBlue": "#65aef7", "brightPurple": "#aa7ff0", "brightCyan": "#43c1be", "brightWhite": "#ffffff", "background": "#29283b", "foreground": "#b3b0d6", "selectionBackground": "#3d3c58", "cursorColor": "#b3b0d6" }' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.THEME, expectedLiteral: 'Theme' },
      { expectedType: TokenType.STRING, expectedLiteral: 'Catppuccin Mocha' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.PADDING, expectedLiteral: 'Padding' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '50' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.FRAMERATE, expectedLiteral: 'Framerate' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '60' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.PLAYBACK_SPEED, expectedLiteral: 'PlaybackSpeed' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.TYPING_SPEED, expectedLiteral: 'TypingSpeed' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '.1' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.LOOP_OFFSET, expectedLiteral: 'LoopOffset' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '60.4' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.LOOP_OFFSET, expectedLiteral: 'LoopOffset' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '20.99' },
      { expectedType: TokenType.PERCENT, expectedLiteral: '%' },
      { expectedType: TokenType.SET, expectedLiteral: 'Set' },
      { expectedType: TokenType.CURSOR_BLINK, expectedLiteral: 'CursorBlink' },
      { expectedType: TokenType.BOOLEAN, expectedLiteral: 'false' },
      { expectedType: TokenType.COMMENT, expectedLiteral: ' Sleep:' },
      { expectedType: TokenType.SLEEP, expectedLiteral: 'Sleep' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.SLEEP, expectedLiteral: 'Sleep' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '500' },
      { expectedType: TokenType.MILLISECONDS, expectedLiteral: 'ms' },
      { expectedType: TokenType.SLEEP, expectedLiteral: 'Sleep' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '.5' },
      { expectedType: TokenType.SLEEP, expectedLiteral: 'Sleep' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '0.5' },
      { expectedType: TokenType.COMMENT, expectedLiteral: ' Type:' },
      { expectedType: TokenType.TYPE, expectedLiteral: 'Type' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '.5' },
      { expectedType: TokenType.STRING, expectedLiteral: 'All' },
      { expectedType: TokenType.TYPE, expectedLiteral: 'Type' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '500' },
      { expectedType: TokenType.MILLISECONDS, expectedLiteral: 'ms' },
      { expectedType: TokenType.STRING, expectedLiteral: 'All' },
      { expectedType: TokenType.TYPE, expectedLiteral: 'Type' },
      { expectedType: TokenType.STRING, expectedLiteral: 'Double Quote' },
      { expectedType: TokenType.TYPE, expectedLiteral: 'Type' },
      { expectedType: TokenType.STRING, expectedLiteral: '"Single" Quote' },
      { expectedType: TokenType.TYPE, expectedLiteral: 'Type' },
      { expectedType: TokenType.STRING, expectedLiteral: `"Backtick" 'Quote'` },
      { expectedType: TokenType.COMMENT, expectedLiteral: ' Keys:' },
      { expectedType: TokenType.BACKSPACE, expectedLiteral: 'Backspace' },
      { expectedType: TokenType.BACKSPACE, expectedLiteral: 'Backspace' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.BACKSPACE, expectedLiteral: 'Backspace' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.DELETE, expectedLiteral: 'Delete' },
      { expectedType: TokenType.DELETE, expectedLiteral: 'Delete' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.DELETE, expectedLiteral: 'Delete' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.INSERT, expectedLiteral: 'Insert' },
      { expectedType: TokenType.INSERT, expectedLiteral: 'Insert' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.INSERT, expectedLiteral: 'Insert' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.DOWN, expectedLiteral: 'Down' },
      { expectedType: TokenType.DOWN, expectedLiteral: 'Down' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.DOWN, expectedLiteral: 'Down' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.PAGE_DOWN, expectedLiteral: 'PageDown' },
      { expectedType: TokenType.PAGE_DOWN, expectedLiteral: 'PageDown' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.PAGE_DOWN, expectedLiteral: 'PageDown' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.SCROLL_DOWN, expectedLiteral: 'ScrollDown' },
      { expectedType: TokenType.SCROLL_DOWN, expectedLiteral: 'ScrollDown' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.SCROLL_DOWN, expectedLiteral: 'ScrollDown' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.ENTER, expectedLiteral: 'Enter' },
      { expectedType: TokenType.ENTER, expectedLiteral: 'Enter' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.ENTER, expectedLiteral: 'Enter' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.SPACE, expectedLiteral: 'Space' },
      { expectedType: TokenType.SPACE, expectedLiteral: 'Space' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.SPACE, expectedLiteral: 'Space' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.TAB, expectedLiteral: 'Tab' },
      { expectedType: TokenType.TAB, expectedLiteral: 'Tab' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.TAB, expectedLiteral: 'Tab' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.LEFT, expectedLiteral: 'Left' },
      { expectedType: TokenType.LEFT, expectedLiteral: 'Left' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.LEFT, expectedLiteral: 'Left' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.RIGHT, expectedLiteral: 'Right' },
      { expectedType: TokenType.RIGHT, expectedLiteral: 'Right' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.RIGHT, expectedLiteral: 'Right' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.UP, expectedLiteral: 'Up' },
      { expectedType: TokenType.UP, expectedLiteral: 'Up' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.UP, expectedLiteral: 'Up' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.PAGE_UP, expectedLiteral: 'PageUp' },
      { expectedType: TokenType.PAGE_UP, expectedLiteral: 'PageUp' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.PAGE_UP, expectedLiteral: 'PageUp' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.SCROLL_UP, expectedLiteral: 'ScrollUp' },
      { expectedType: TokenType.SCROLL_UP, expectedLiteral: 'ScrollUp' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.SCROLL_UP, expectedLiteral: 'ScrollUp' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.DOWN, expectedLiteral: 'Down' },
      { expectedType: TokenType.DOWN, expectedLiteral: 'Down' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '2' },
      { expectedType: TokenType.DOWN, expectedLiteral: 'Down' },
      { expectedType: TokenType.AT, expectedLiteral: '@' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '1' },
      { expectedType: TokenType.NUMBER, expectedLiteral: '3' },
      { expectedType: TokenType.COMMENT, expectedLiteral: ' Control:' },
      { expectedType: TokenType.CTRL, expectedLiteral: 'Ctrl' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: 'C' },
      { expectedType: TokenType.CTRL, expectedLiteral: 'Ctrl' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: 'L' },
      { expectedType: TokenType.CTRL, expectedLiteral: 'Ctrl' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: 'R' },
      { expectedType: TokenType.COMMENT, expectedLiteral: ' Alt:' },
      { expectedType: TokenType.ALT, expectedLiteral: 'Alt' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: '.' },
      { expectedType: TokenType.ALT, expectedLiteral: 'Alt' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: 'L' },
      { expectedType: TokenType.ALT, expectedLiteral: 'Alt' },
      { expectedType: TokenType.PLUS, expectedLiteral: '+' },
      { expectedType: TokenType.STRING, expectedLiteral: 'i' },
      { expectedType: TokenType.COMMENT, expectedLiteral: ' Display:' },
      { expectedType: TokenType.HIDE, expectedLiteral: 'Hide' },
      { expectedType: TokenType.SHOW, expectedLiteral: 'Show' },
    ];

    const lexer = new Lexer(input);

    for (let i = 0; i < tests.length; i++) {
      const tok = lexer.nextToken();
      const tt = tests[i];

      expect(tok.type).toBe(tt.expectedType);
      expect(tok.literal).toBe(tt.expectedLiteral);
    }
  });

  test('handles simple commands', () => {
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

  test('handles comments', () => {
    const input = '# This is a comment\nType "test"';
    const lexer = new Lexer(input);

    const comment = lexer.nextToken();
    expect(comment.type).toBe(TokenType.COMMENT);
    // Note: Comment literal excludes the leading '#', matching Go behavior
    expect(comment.literal).toBe(' This is a comment');

    expect(lexer.nextToken().type).toBe(TokenType.TYPE);
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
