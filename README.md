# @oakoliver/vhs

TypeScript/Node/Bun port of [Charmbracelet VHS](https://github.com/charmbracelet/vhs): write terminal recordings as `.tape` files and render GIF, MP4, WebM, PNG-frame, screenshot, and text outputs.

**Upstream parity target:** `charmbracelet/vhs` **v0.11.0**. The tape lexer, parser, command evaluator, themes, interactive tape recorder, local CLI, ttyd shell session, browser capture, and ffmpeg render pipeline track that tag. The hosted `vhs publish` workflow is intentionally outside this package's scope.

## Installation

```bash
npm install @oakoliver/vhs
# or
bun add @oakoliver/vhs
```

### Runtime prerequisites

- [ttyd](https://github.com/tsl0922/ttyd) 1.7.2 or newer
- [ffmpeg](https://ffmpeg.org/)
- A Puppeteer-compatible Chrome installation (Puppeteer installs one by default)
- SSH server mode uses the bundled Node SSH implementation; `VHS_UID`/`VHS_GID` privilege dropping is Unix-only because Windows has no process UID/GID equivalent.

Chrome sandboxing stays enabled when `VHS_NO_SANDBOX` is unset or empty. Any non-empty value, including `0`, opts out to match upstream environment semantics.

The SSH server denies authentication by default. Set `VHS_AUTHORIZED_KEYS_PATH` to a non-empty OpenSSH `authorized_keys` file. `VHS_ALLOW_UNAUTHENTICATED=1` is an explicit unsafe opt-in for isolated development only; it permits remote tape execution without credentials even when bound to a non-loopback host.

```bash
# macOS
brew install ttyd ffmpeg

# Ubuntu/Debian
sudo apt install ttyd ffmpeg

# Windows
scoop install ttyd ffmpeg
```

## CLI

```bash
# Run a tape (a file, stdin, and multiple output overrides are supported)
vhs demo.tape
cat demo.tape | vhs -
vhs -o demo.gif -o demo.mp4 demo.tape

# Record keystrokes from an interactive shell as tape source
vhs record --shell zsh > recorded.tape

# Authoring helpers
vhs new demo
vhs validate demo.tape other.tape
vhs themes
vhs man

# Run the stdin-to-media SSH service (configured with VHS_* environment variables)
VHS_AUTHORIZED_KEYS_PATH="$HOME/.ssh/authorized_keys" vhs serve
```

`--quiet`, `--help`, and `--version` are also available. `vhs themes --markdown` emits the upstream markdown list form.

## Tape language

```tape
Output demo.gif
Output demo.mp4

Set Shell bash
Set FontFamily "JetBrains Mono"
Set FontSize 22
Set Width 1200
Set Height 600
Set Padding 60
Set Theme "Dracula"
Set TypingSpeed 50ms
Set Framerate 50
Set PlaybackSpeed 1.0
Set CursorBlink true

Type "printf 'Hello from VHS\\n'"
Enter
Wait+Screen@5s /Hello from VHS/
ScrollUp 2
ScrollDown@100ms 2
Ctrl+Left
Sleep 1s
Screenshot terminal.png
```

### Commands

| Command | Form |
|---|---|
| Output | `Output <file.gif|file.mp4|file.webm|folder/|file.test>` |
| Type | `Type[@<time>] <string>` |
| Sleep | `Sleep <time>` |
| Navigation | `Backspace`, `Delete`, `Insert`, `Home`, `End`, `Enter`, `Escape`, `Tab`, `Space`, `Up`, `Down`, `Left`, `Right`, `PageUp`, `PageDown`; repeat count and `@time` are supported |
| Viewport | `ScrollUp[@<time>] [count]`, `ScrollDown[@<time>] [count]` |
| Modifiers | `Ctrl[+Alt][+Shift]+<key>`, `Alt+<key>`, `Shift+<key>` |
| Visibility | `Hide`, `Show` |
| Conditions | `Wait[+Line|+Screen][@<timeout>] [/regex/]`, `Require <binary>` |
| Composition | `Source <file.tape>` |
| Process | `Env <name> <value>` |
| Clipboard | `Copy <string>`, `Paste` |
| Image | `Screenshot <file.png>` |

Settings are `Shell`, `FontFamily`, `FontSize`, `Framerate`, `Height`, `Width`, `LetterSpacing`, `LineHeight`, `PlaybackSpeed`, `TypingSpeed`, `Padding`, `Theme`, `LoopOffset`, `MarginFill`, `Margin`, `WindowBar`, `WindowBarSize`, `BorderRadius`, `WaitTimeout`, `WaitPattern`, and `CursorBlink`.

Regex delimiters follow v0.11.0 escaping rules: a slash is escaped by an odd run of preceding backslashes and closes the regex after an even run.

## Programmatic API

```typescript
import {
  Lexer,
  Parser,
  evaluate,
  parseTape,
  defaultVHSOptions,
  type BrowserInterface,
  type TTYInterface,
} from '@oakoliver/vhs';

const { commands, errors } = parseTape('Type "hello"\nEnter');

const lexer = new Lexer('ScrollUp@100ms 3');
const tokens = lexer.tokenize();
const parser = new Parser(lexer);

// Uses the built-in Puppeteer and ttyd adapters when interfaces are omitted.
const result = await evaluate('Type "echo hello"\nEnter\nSleep 1s');

// BrowserInterface and TTYInterface may be supplied to isolate browser/TTY
// process effects in another host application.
```

The package also exports command executors, key maps, theme and shell helpers, ffmpeg builders/renderers, `PuppeteerBrowser`, `DefaultTTY`, clipboard integration, loop-offset handling, and interactive recorder conversion helpers.

## License

MIT. Original VHS is copyright Charmbracelet, Inc.; this port retains the upstream license and attribution.
