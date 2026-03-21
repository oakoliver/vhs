/**
 * @oakoliver/vhs — CLI for VHS tape execution
 *
 * Zero-dependency TypeScript port of Charmbracelet's VHS.
 *
 * @module
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseTape } from './parser.js';
import { formatParserError } from './parser.js';
import { getSortedThemeNames } from './vhs.js';
import { isTTYDAvailable, isFFmpegAvailable, getTTYDVersion, getFFmpegVersion } from './tty.js';

// ============================================================================
// Version
// ============================================================================

const VERSION = '0.1.0';

// ============================================================================
// Colors (ANSI)
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function c(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// Help
// ============================================================================

const HELP = `
${c('bold', 'VHS')} — Terminal GIF recorder

${c('bold', 'USAGE')}
  vhs <file.tape>           Record a tape file to GIF/MP4/WebM
  vhs new <file.tape>       Create a new tape file
  vhs validate <file.tape>  Validate a tape file
  vhs themes                List available themes
  vhs manual                Show the manual/documentation

${c('bold', 'FLAGS')}
  -o, --output <file>       Output file (overrides tape Output command)
  -q, --quiet               Suppress output
  -h, --help                Show this help
  -v, --version             Show version

${c('bold', 'EXAMPLES')}
  vhs demo.tape                   Record demo.tape
  vhs demo.tape -o out.gif        Record to out.gif
  vhs new my-demo.tape            Create a new tape
  vhs validate demo.tape          Check tape syntax
  vhs themes | grep -i tokyo      Find Tokyo-themed themes

${c('bold', 'DOCUMENTATION')}
  https://github.com/charmbracelet/vhs
`;

const MANUAL = `
${c('bold', 'VHS TAPE FILE FORMAT')}

A tape file is a script that tells VHS what to type and what commands to run.
Lines starting with # are comments.

${c('bold', 'COMMANDS')}

  ${c('cyan', 'Output')} <file>              Set output file (.gif, .mp4, .webm, .png)
  ${c('cyan', 'Type')} "text"                Type text
  ${c('cyan', 'Type@<time>')} "text"         Type text with custom speed (e.g., Type@100ms)
  ${c('cyan', 'Sleep')} <time>               Sleep for duration (e.g., Sleep 2s)
  ${c('cyan', 'Enter')}                      Press Enter key
  ${c('cyan', 'Backspace')} [count]          Press Backspace key
  ${c('cyan', 'Tab')}                        Press Tab key
  ${c('cyan', 'Space')}                      Press Space key
  ${c('cyan', 'Escape')}                     Press Escape key
  ${c('cyan', 'Up')}, ${c('cyan', 'Down')}, ${c('cyan', 'Left')}, ${c('cyan', 'Right')}   Arrow keys
  ${c('cyan', 'PageUp')}, ${c('cyan', 'PageDown')}           Page navigation
  ${c('cyan', 'Ctrl+')}char                  Press Ctrl+char
  ${c('cyan', 'Alt+')}char                   Press Alt+char
  ${c('cyan', 'Hide')}                       Stop recording
  ${c('cyan', 'Show')}                       Resume recording
  ${c('cyan', 'Wait')} [timeout] [pattern]   Wait for text to appear
  ${c('cyan', 'Screenshot')} <file.png>      Take a screenshot
  ${c('cyan', 'Source')} <file.tape>         Include another tape
  ${c('cyan', 'Require')} <binary>           Check if binary exists

${c('bold', 'SETTINGS')} (use with Set command)

  ${c('yellow', 'Shell')} bash|zsh|fish|...     Set shell
  ${c('yellow', 'FontFamily')} "name"           Set font
  ${c('yellow', 'FontSize')} 22                 Set font size
  ${c('yellow', 'Theme')} "Dracula"             Set color theme
  ${c('yellow', 'Width')} 1200                  Set width in pixels
  ${c('yellow', 'Height')} 600                  Set height in pixels
  ${c('yellow', 'Padding')} 60                  Set padding in pixels
  ${c('yellow', 'Framerate')} 50                Set framerate
  ${c('yellow', 'TypingSpeed')} 50ms            Set typing speed
  ${c('yellow', 'PlaybackSpeed')} 1.0           Set playback speed
  ${c('yellow', 'CursorBlink')} true|false      Toggle cursor blink
  ${c('yellow', 'WindowBar')} Colorful          Add window bar style
  ${c('yellow', 'BorderRadius')} 10             Add rounded corners
  ${c('yellow', 'MarginFill')} "#ff0000"        Set margin background

${c('bold', 'EXAMPLE TAPE')}

  # demo.tape
  Output demo.gif

  Set FontSize 24
  Set Theme "Dracula"
  Set Width 1000
  Set Height 500

  Type "echo 'Hello, World!'"
  Enter
  Sleep 2s

  Type "exit"
  Enter
`;

const NEW_TAPE_TEMPLATE = `# VHS Tape File
# https://github.com/charmbracelet/vhs

Output example.gif

Set FontSize 22
Set Width 1200
Set Height 600

Type "echo 'Hello, World!'"
Enter
Sleep 2s

Type "exit"
Enter
`;

// ============================================================================
// Argument Parsing
// ============================================================================

interface Args {
  command: 'record' | 'new' | 'validate' | 'themes' | 'manual' | 'help' | 'version';
  file?: string;
  output?: string;
  quiet?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: 'help' };
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      args.command = 'help';
      return args;
    }

    if (arg === '-v' || arg === '--version') {
      args.command = 'version';
      return args;
    }

    if (arg === '-q' || arg === '--quiet') {
      args.quiet = true;
      i++;
      continue;
    }

    if (arg === '-o' || arg === '--output') {
      args.output = argv[i + 1];
      i += 2;
      continue;
    }

    if (arg === 'new') {
      args.command = 'new';
      args.file = argv[i + 1];
      i += 2;
      continue;
    }

    if (arg === 'validate') {
      args.command = 'validate';
      args.file = argv[i + 1];
      i += 2;
      continue;
    }

    if (arg === 'themes') {
      args.command = 'themes';
      return args;
    }

    if (arg === 'manual') {
      args.command = 'manual';
      return args;
    }

    // Default: treat as tape file
    if (arg.endsWith('.tape') || fs.existsSync(arg)) {
      args.command = 'record';
      args.file = arg;
      i++;
      continue;
    }

    i++;
  }

  return args;
}

// ============================================================================
// Commands
// ============================================================================

async function cmdVersion(): Promise<number> {
  console.log(`vhs version ${VERSION}`);
  
  // Check dependencies
  const [ttydAvailable, ffmpegAvailable] = await Promise.all([
    isTTYDAvailable(),
    isFFmpegAvailable(),
  ]);

  if (ttydAvailable) {
    const version = await getTTYDVersion();
    console.log(`ttyd: ${c('green', version || 'installed')}`);
  } else {
    console.log(`ttyd: ${c('red', 'not found')}`);
  }

  if (ffmpegAvailable) {
    const version = await getFFmpegVersion();
    console.log(`ffmpeg: ${c('green', version || 'installed')}`);
  } else {
    console.log(`ffmpeg: ${c('red', 'not found')}`);
  }

  return 0;
}

function cmdHelp(): number {
  console.log(HELP);
  return 0;
}

function cmdManual(): number {
  console.log(MANUAL);
  return 0;
}

function cmdThemes(): number {
  const themes = getSortedThemeNames();
  for (const theme of themes) {
    console.log(theme);
  }
  return 0;
}

function cmdNew(file: string | undefined): number {
  if (!file) {
    console.error(c('red', 'Error: No file specified'));
    console.error('Usage: vhs new <file.tape>');
    return 1;
  }

  if (!file.endsWith('.tape')) {
    file += '.tape';
  }

  if (fs.existsSync(file)) {
    console.error(c('red', `Error: File already exists: ${file}`));
    return 1;
  }

  fs.writeFileSync(file, NEW_TAPE_TEMPLATE);
  console.log(c('green', `Created ${file}`));
  return 0;
}

function cmdValidate(file: string | undefined, quiet: boolean): number {
  if (!file) {
    console.error(c('red', 'Error: No file specified'));
    console.error('Usage: vhs validate <file.tape>');
    return 1;
  }

  if (!fs.existsSync(file)) {
    console.error(c('red', `Error: File not found: ${file}`));
    return 1;
  }

  const tape = fs.readFileSync(file, 'utf-8');
  const { commands, errors } = parseTape(tape);

  if (errors.length > 0) {
    console.error(c('red', `Found ${errors.length} error(s) in ${file}:`));
    for (const err of errors) {
      console.error(`  ${formatParserError(err)}`);
    }
    return 1;
  }

  if (!quiet) {
    console.log(c('green', `✓ ${file} is valid (${commands.length} commands)`));
  }
  return 0;
}

async function cmdRecord(file: string | undefined, output: string | undefined, quiet: boolean): Promise<number> {
  if (!file) {
    console.error(c('red', 'Error: No tape file specified'));
    console.error('Usage: vhs <file.tape>');
    return 1;
  }

  if (!fs.existsSync(file)) {
    console.error(c('red', `Error: File not found: ${file}`));
    return 1;
  }

  // Check dependencies
  const [ttydAvailable, ffmpegAvailable] = await Promise.all([
    isTTYDAvailable(),
    isFFmpegAvailable(),
  ]);

  if (!ttydAvailable) {
    console.error(c('red', 'Error: ttyd is not installed'));
    console.error('Install it with: brew install ttyd');
    return 1;
  }

  if (!ffmpegAvailable) {
    console.error(c('red', 'Error: ffmpeg is not installed'));
    console.error('Install it with: brew install ffmpeg');
    return 1;
  }

  // Validate tape first
  const tape = fs.readFileSync(file, 'utf-8');
  const { commands, errors } = parseTape(tape);

  if (errors.length > 0) {
    console.error(c('red', `Found ${errors.length} error(s) in ${file}:`));
    for (const err of errors) {
      console.error(`  ${formatParserError(err)}`);
    }
    return 1;
  }

  if (!quiet) {
    console.log(c('cyan', `Recording ${file}...`));
    console.log(c('dim', `(${commands.length} commands)`));
  }

  // Note: Full recording requires browser automation (puppeteer/playwright)
  // This CLI provides the parsing and validation; actual recording needs
  // the browser interface to be implemented by the user.
  console.log();
  console.log(c('yellow', 'Note: Full recording requires browser automation.'));
  console.log(c('dim', 'Use the evaluate() function with a BrowserInterface implementation.'));
  console.log(c('dim', 'See the documentation for puppeteer/playwright integration examples.'));

  return 0;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'version':
      return cmdVersion();
    case 'help':
      return cmdHelp();
    case 'manual':
      return cmdManual();
    case 'themes':
      return cmdThemes();
    case 'new':
      return cmdNew(args.file);
    case 'validate':
      return cmdValidate(args.file, args.quiet ?? false);
    case 'record':
      return cmdRecord(args.file, args.output, args.quiet ?? false);
    default:
      return cmdHelp();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(c('red', 'Error:'), err.message);
    process.exit(1);
  });
