# @oakoliver/vhs

Write terminal GIFs as code. TypeScript port of [Charmbracelet's VHS](https://github.com/charmbracelet/vhs).

VHS lets you record terminal sessions and create GIFs, MP4s, and WebM videos using a simple scripting language called `.tape` files.

## Installation

```bash
npm install @oakoliver/vhs
# or
bun add @oakoliver/vhs
```

### Prerequisites

VHS requires these external tools:

- **[ttyd](https://github.com/tsl0922/ttyd)** - Terminal emulator in the browser
- **[ffmpeg](https://ffmpeg.org/)** - Video encoding

```bash
# macOS
brew install ttyd ffmpeg

# Ubuntu/Debian
apt install ttyd ffmpeg

# Windows (via scoop)
scoop install ttyd ffmpeg
```

## CLI Usage

```bash
# Record a tape file to GIF
npx @oakoliver/vhs record demo.tape

# Create a new tape file
npx @oakoliver/vhs new demo.tape

# Validate a tape file
npx @oakoliver/vhs validate demo.tape

# List available themes
npx @oakoliver/vhs themes

# Show manual/documentation
npx @oakoliver/vhs manual
```

## Tape File Syntax

Tape files use a simple, readable syntax to describe terminal recordings:

```tape
# demo.tape - A simple VHS demo
Output demo.gif

Set FontSize 18
Set Width 1200
Set Height 600
Set Theme "Dracula"

Type "echo 'Hello, World!'"
Enter
Sleep 500ms

Type "ls -la"
Enter
Sleep 1s

Type "exit"
Enter
```

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `Output` | Set output file (.gif, .mp4, .webm) | `Output demo.gif` |
| `Type` | Type text with realistic timing | `Type "hello world"` |
| `Type@<speed>` | Type with custom speed | `Type@50ms "fast"` |
| `Sleep` | Pause for duration | `Sleep 500ms` / `Sleep 2s` |
| `Enter` | Press Enter key | `Enter` / `Enter 3` |
| `Backspace` | Press Backspace | `Backspace 5` |
| `Tab` | Press Tab | `Tab` |
| `Space` | Press Space | `Space` |
| `Up/Down/Left/Right` | Arrow keys | `Up 3` |
| `Ctrl+<key>` | Control key combo | `Ctrl+c` |
| `Alt+<key>` | Alt key combo | `Alt+Tab` |
| `Hide` | Hide following commands from output | `Hide` |
| `Show` | Show commands again | `Show` |
| `Screenshot` | Take a screenshot | `Screenshot screen.png` |
| `Wait` | Wait for text/regex in terminal | `Wait /\$\s/` |
| `Env` | Set environment variable | `Env FOO "bar"` |
| `Source` | Include another tape file | `Source setup.tape` |

### Settings

```tape
Set Shell "bash"
Set FontFamily "JetBrains Mono"
Set FontSize 16
Set Width 1200
Set Height 600
Set Padding 20
Set Theme "Dracula"
Set TypingSpeed 50ms
Set Framerate 60
Set PlaybackSpeed 1.0
Set CursorBlink false
```

## Programmatic API

```typescript
import { 
  parseTape, 
  Lexer, 
  Parser,
  VHSOptions, 
  defaultVHSOptions,
  makeGIF,
  makeMP4,
  makeWebM
} from '@oakoliver/vhs';

// Parse a tape file
const { commands, errors } = parseTape(`
  Output demo.gif
  Type "hello"
  Enter
`);

if (errors.length > 0) {
  console.error('Parse errors:', errors);
} else {
  console.log('Commands:', commands);
}

// Work with the lexer directly
const lexer = new Lexer('Type "hello" Enter');
const tokens = lexer.tokenize();

// Work with the parser
const parser = new Parser(new Lexer(tapeContent));
const result = parser.parse();

// FFmpeg filter builders
const gifFilters = makeGIF(60, 15); // framerate, max colors
const mp4Filters = makeMP4();
const webmFilters = makeWebM();
```

## Themes

VHS includes 300+ terminal themes. List them with:

```bash
npx @oakoliver/vhs themes
```

Popular themes include:
- Dracula
- One Dark
- Nord
- Solarized Dark/Light
- Gruvbox
- Tokyo Night
- Catppuccin

## Examples

### Basic Demo

```tape
Output demo.gif
Set Theme "Dracula"
Set FontSize 18

Type "npm create vite@latest my-app"
Enter
Sleep 2s
```

### Hidden Setup

```tape
Output demo.gif

# Setup (hidden from recording)
Hide
Type "cd ~/projects"
Enter
Type "clear"
Enter
Show

# Visible demo
Type "node --version"
Enter
Sleep 1s
```

### Interactive Application

```tape
Output demo.gif
Set Width 1200
Set Height 800

Type "npx create-react-app my-app"
Enter
Sleep 3s

# Navigate with arrow keys
Down
Down
Enter
Sleep 500ms

# Exit with Ctrl+C
Ctrl+c
```

## Compatibility

- Node.js 18+
- Bun
- Deno

## Credits

This is a TypeScript port of [Charmbracelet's VHS](https://github.com/charmbracelet/vhs), originally written in Go.

Part of the [@oakoliver](https://github.com/oakoliver) Charm ecosystem ports:
- [@oakoliver/lipgloss](https://github.com/oakoliver/lipgloss) - Style definitions for terminal UIs
- [@oakoliver/bubbletea](https://github.com/oakoliver/bubbletea) - TUI framework
- [@oakoliver/bubbles](https://github.com/oakoliver/bubbles) - TUI components
- [@oakoliver/glamour](https://github.com/oakoliver/glamour) - Markdown rendering
- [@oakoliver/glow](https://github.com/oakoliver/glow) - Markdown viewer
- [@oakoliver/huh](https://github.com/oakoliver/huh) - Interactive forms
- [@oakoliver/gum](https://github.com/oakoliver/gum) - Shell scripting toolkit

## License

MIT - see [LICENSE](./LICENSE) for details.

Original VHS by [Charmbracelet](https://charm.sh) is also MIT licensed.
