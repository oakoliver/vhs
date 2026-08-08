import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { evaluate, parseTape } from './evaluator.js';
import { getDefaultShell, getSortedThemeNames } from './vhs.js';
import {
  getTTYDVersion,
  isFFmpegAvailable,
  isTTYDAvailable,
  isCommandAvailable,
} from './tty.js';
import { recordInteractive } from './record.js';
import { serveSSH, serverConfigFromEnv } from './server.js';

export const VERSION = '1.1.0';

export const HELP = `VHS — Terminal GIF recorder

USAGE
  vhs [flags] <file.tape|->       Run a tape and generate its outputs
  vhs record [-s shell]           Record terminal input as a tape
  vhs new <name>                  Create an example tape
  vhs validate <file>...          Validate one or more tapes
  vhs themes [--markdown]         List bundled themes
  vhs man                         Show tape-language help
  vhs serve                       Start the VHS SSH rendering server

FLAGS
  -o, --output <file>             Override video output (repeatable)
  -q, --quiet                     Suppress progress output
  -h, --help                      Show help
  -v, --version                   Show version
`;

export const MANUAL = `VHS TAPE LANGUAGE

Commands:
  Output <path>
  Type[@<time>] <string>
  Sleep <time>
  Backspace|Delete|Insert|Home|End|Enter|Escape|Tab|Space [count]
  Up|Down|Left|Right|PageUp|PageDown [@<time>] [count]
  ScrollUp|ScrollDown [@<time>] [count]
  Ctrl[+Alt][+Shift]+<key>, Alt+<key>, Shift+<key>
  Wait[+Line|+Screen][@<timeout>] [/regex/]
  Hide, Show, Require <binary>, Screenshot <file.png>
  Source <file.tape>, Copy <string>, Paste, Env <name> <value>

Settings:
  Set Shell <name>
  Set FontFamily <name>
  Set FontSize|Width|Height|Padding|Margin|WindowBarSize|BorderRadius <number>
  Set LetterSpacing|LineHeight|Framerate|PlaybackSpeed <number>
  Set TypingSpeed|WaitTimeout <time>
  Set Theme <name|json>, Set LoopOffset <percent>
  Set MarginFill <color|image>, Set WindowBar <style>
  Set WaitPattern <regex>, Set CursorBlink <true|false>
`;

const NEW_TAPE_TEMPLATE = `# VHS Tape File
# https://github.com/charmbracelet/vhs

Output examples/demo.gif

Set FontSize 22
Set Width 1200
Set Height 600

Type "echo 'Hello, World!'"
Enter
Sleep 2s
`;

export interface CLIArgs {
  command: 'run' | 'record' | 'new' | 'validate' | 'themes' | 'man' | 'serve' | 'help' | 'version';
  files: string[];
  outputs: string[];
  quiet: boolean;
  markdown: boolean;
  shell: string;
}

export function parseArgs(argv: string[]): CLIArgs {
  const parsed: CLIArgs = {
    command: 'run',
    files: [],
    outputs: [],
    quiet: false,
    markdown: false,
    shell: path.basename(process.env.SHELL || getDefaultShell()),
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '-h' || argument === '--help') return { ...parsed, command: 'help' };
    if (argument === '-v' || argument === '--version') return { ...parsed, command: 'version' };
    if (argument === '-q' || argument === '--quiet') {
      parsed.quiet = true;
      continue;
    }
    if (argument === '--markdown') {
      parsed.markdown = true;
      continue;
    }
    if (argument === '-o' || argument === '--output') {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} expects an output path`);
      parsed.outputs.push(...value.split(',').filter(Boolean));
      continue;
    }
    if (argument === '-s' || argument === '--shell') {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} expects a shell`);
      parsed.shell = value;
      continue;
    }
    if (argument === 'record' && parsed.files.length === 0) {
      parsed.command = 'record';
      continue;
    }
    if (argument === 'new' && parsed.files.length === 0) {
      parsed.command = 'new';
      continue;
    }
    if (argument === 'validate' && parsed.files.length === 0) {
      parsed.command = 'validate';
      continue;
    }
    if (argument === 'themes' && parsed.files.length === 0) {
      parsed.command = 'themes';
      continue;
    }
    if (argument === 'serve' && parsed.files.length === 0) {
      parsed.command = 'serve';
      continue;
    }
    if ((argument === 'man' || argument === 'manual') && parsed.files.length === 0) {
      parsed.command = 'man';
      continue;
    }
    parsed.files.push(argument);
  }

  if (argv.length === 0) parsed.command = 'help';
  return parsed;
}

function compareVersions(left: string, right: string): number {
  const a = left.match(/\d+/g)?.map(Number) ?? [];
  const b = right.match(/\d+/g)?.map(Number) ?? [];
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export async function ensureDependencies(): Promise<void> {
  const [ffmpegAvailable, ttydAvailable, shellAvailable] = await Promise.all([
    isFFmpegAvailable(),
    isTTYDAvailable(),
    isCommandAvailable(getDefaultShell()),
  ]);
  if (!ffmpegAvailable) {
    throw new Error('ffmpeg is not installed. Install it from: https://ffmpeg.org');
  }
  if (!ttydAvailable) {
    throw new Error('ttyd is not installed. Install it from: https://github.com/tsl0922/ttyd');
  }
  if (!shellAvailable) throw new Error(`${getDefaultShell()} is not installed`);
  const ttydVersion = await getTTYDVersion();
  if (!ttydVersion || compareVersions(ttydVersion, '1.7.2') < 0) {
    throw new Error(`ttyd version (${ttydVersion ?? 'unknown'}) is out of date; VHS requires 1.7.2`);
  }
}

function createTape(name: string): void {
  const base = name.endsWith('.tape') ? name.slice(0, -5) : name;
  const fileName = `${base}.tape`;
  const contents = NEW_TAPE_TEMPLATE.replace('examples/demo.gif', `${base}.gif`);
  try {
    fs.writeFileSync(fileName, contents, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`${fileName} already exists`);
    }
    throw error;
  }
  console.log(`Created ${fileName}`);
}

function validateTapes(files: string[]): boolean {
  let valid = true;
  for (const file of files) {
    let tape: string;
    try {
      tape = fs.readFileSync(file, 'utf8');
    } catch (error) {
      console.error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      valid = false;
      continue;
    }
    const result = parseTape(tape);
    for (const error of result.errors) {
      console.error(`${file}: ${error.message}`);
      valid = false;
    }
  }
  return valid;
}

function readTape(file: string | undefined): string {
  if (file && file !== '-') return fs.readFileSync(file, 'utf8');
  if (process.stdin.isTTY) throw new Error('no input provided');
  return fs.readFileSync(0, 'utf8');
}

export async function runCLI(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  switch (args.command) {
    case 'help':
      console.log(HELP);
      return 0;
    case 'version':
      console.log(`vhs version ${VERSION}`);
      return 0;
    case 'man':
      console.log(MANUAL);
      return 0;
    case 'themes': {
      if (args.markdown) console.log('# Themes\n');
      const prefix = args.markdown ? '* `' : '';
      const suffix = args.markdown ? '`' : '';
      for (const theme of getSortedThemeNames()) console.log(`${prefix}${theme}${suffix}`);
      return 0;
    }
    case 'new':
      if (args.files.length !== 1) throw new Error('Usage: vhs new <name>');
      createTape(args.files[0]);
      return 0;
    case 'validate':
      if (args.files.length === 0) throw new Error('Usage: vhs validate <file>...');
      return validateTapes(args.files) ? 0 : 1;
    case 'record':
      if (args.files.length > 0) throw new Error('Usage: vhs record [-s shell]');
      await recordInteractive({ shell: args.shell });
      return 0;
    case 'serve': {
      if (args.files.length > 0) throw new Error('Usage: vhs serve');
      await ensureDependencies();
      const controller = new AbortController();
      const shutdown = () => controller.abort();
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
      try {
        await serveSSH(serverConfigFromEnv(), controller.signal);
      } finally {
        process.off('SIGINT', shutdown);
        process.off('SIGTERM', shutdown);
      }
      return 0;
    }
    case 'run': {
      if (args.files.length > 1) throw new Error('vhs accepts at most one tape file');
      await ensureDependencies();
      const controller = new AbortController();
      const shutdown = () => controller.abort(new Error('VHS interrupted'));
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
      try {
        const result = await evaluate(readTape(args.files[0]), {
          output: args.quiet ? () => {} : (message) => console.log(message),
          outputPaths: args.outputs,
          signal: controller.signal,
        });
        if (result.errors.length > 0) {
          for (const error of result.errors) console.error(error.message);
          return 1;
        }
        return 0;
      } finally {
        process.off('SIGINT', shutdown);
        process.off('SIGTERM', shutdown);
      }
    }
  }
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;
if (isDirectExecution) {
  runCLI()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
