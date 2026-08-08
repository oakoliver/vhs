import { spawn as spawnPty } from 'node-pty';
import type { Readable, Writable } from 'stream';
import { getDefaultShell } from './vhs.js';
import * as path from 'path';
import { withResolvers } from './promise.js';

export const sleepThreshold = 500;

export const EscapeSequences: ReadonlyArray<readonly [string, string]> = [
  ['\x1b[A', 'Up'],
  ['\x1b[B', 'Down'],
  ['\x1b[C', 'Right'],
  ['\x1b[D', 'Left'],
  ['\x1b[1~', 'Home'],
  ['\x1b[2~', 'Insert'],
  ['\x1b[3~', 'Delete'],
  ['\x1b[4~', 'End'],
  ['\x1b[5~', 'PageUp'],
  ['\x1b[6~', 'PageDown'],
  ...Array.from({ length: 26 }, (_, index) => index)
    .filter((index) => ![7, 8, 9, 12].includes(index))
    .map((index) => [
      String.fromCharCode(index + 1),
      `Ctrl+${String.fromCharCode(65 + index)}`,
    ] as const),
  ['\x08', 'Backspace'],
  ['\x09', 'Tab'],
  ['\x0d', 'Enter'],
  ['\x1b', 'Escape'],
  ['\x7f', 'Backspace'],
];

const cursorResponse = /\x1b\[\d+;\d+R/g;
const oscResponse = /\x1b\]\d+;rgb:....\/....\/....(?:\x07|\x1b\\)/g;
const commandNames: Readonly<Record<string, string>> = Object.fromEntries(
  [
    'Backspace', 'Delete', 'Insert', 'Home', 'End', 'Down', 'Enter', 'Escape',
    'Left', 'PageUp', 'PageDown', 'ScrollUp', 'ScrollDown', 'Right', 'Sleep',
    'Space', 'Tab', 'Up', 'Wait', 'Screenshot', 'Copy', 'Paste',
  ].map((command) => [command.replaceAll('_', '').toLowerCase(), command]),
);

function normalizeRecordedLine(line: string): string {
  const command = commandNames[line.replaceAll('_', '').toLowerCase()];
  if (command) return command;
  const modifier = /^(ctrl|alt|shift)\+(.+)$/i.exec(line);
  if (modifier) {
    return `${modifier[1][0].toUpperCase()}${modifier[1].slice(1).toLowerCase()}+${modifier[2]}`;
  }
  return /^set\s+/i.test(line) ? line.replace(/^set/i, 'Set') : line;
}

export function quoteTapeString(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('`')) return `\`${value}\``;
  return `"${value.replaceAll('"', '""')}"`;
}

function formatRecordedDuration(milliseconds: number): string {
  if (milliseconds >= 60_000) return `${milliseconds / 1_000}s`;
  if (milliseconds % 1_000 === 0) return `${milliseconds / 1_000}s`;
  if (milliseconds > 1_000) return `${milliseconds / 1_000}s`;
  return `${milliseconds}ms`;
}

/** Convert raw pseudo-terminal input into deterministic VHS tape commands. */
export function inputToTape(input: string): string {
  let value = input.trim().replace(/exit$/, '');
  value = value.replace(cursorResponse, '').replace(oscResponse, '');

  for (const [sequence, command] of EscapeSequences) {
    value = value.split(sequence).join(`\n${command}\n`);
  }
  while (value.includes('\n\n')) value = value.replaceAll('\n\n', '\n');

  const lines = value.split('\n').map(normalizeRecordedLine);
  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === '' && index === lines.length - 1) break;

    let repeat = 1;
    while (index + repeat < lines.length && lines[index + repeat] === line) repeat++;
    index += repeat - 1;

    if (line === 'Sleep') {
      output.push(`Sleep ${formatRecordedDuration(sleepThreshold * repeat)}`);
    } else if (line.startsWith('Ctrl+') || line.startsWith('Alt+')) {
      for (let count = 0; count < repeat; count++) output.push(line);
    } else if (line.startsWith('Set ')) {
      output.push(line);
    } else if (commandNames[line.replaceAll('_', '').toLowerCase()]) {
      output.push(repeat > 1 ? `${line} ${repeat}` : line);
    } else if (line !== '') {
      output.push(`Type ${quoteTapeString(line)}`);
    }
  }

  return output.length > 0 ? `${output.join('\n')}\n` : '';
}

export interface InteractiveRecordOptions {
  shell: string;
  stdin?: Readable & { isTTY?: boolean; isRaw?: boolean; setRawMode?(mode: boolean): void };
  stdout?: Writable;
  terminalOutput?: Writable;
}

/** Run a shell in a pseudo-terminal and emit the equivalent tape on stdout. */
export async function recordInteractive(options: InteractiveRecordOptions): Promise<void> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const terminalOutput = options.terminalOutput ?? process.stderr;
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error('vhs record requires an interactive terminal');
  const environment: Record<string, string> = { VHS_RECORD: 'true' };
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[name] = value;
  }

  const terminal = spawnPty(options.shell, [], {
    name: process.env.TERM || 'xterm-256color',
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    cwd: process.cwd(),
    env: environment,
  });

  const shellName = path.basename(options.shell);
  let tape = shellName === getDefaultShell() ? '' : `Set Shell ${shellName}\n`;
  let previousLength = tape.length;
  const idleTimer = setInterval(() => {
    if (previousLength === tape.length) tape += '\nSleep\n';
    previousLength = tape.length;
  }, sleepThreshold);

  const wasRaw = stdin.isRaw ?? false;
  stdin.setRawMode(true);
  const onInput = (chunk: Buffer | string) => {
    const text = chunk.toString();
    tape += text;
    terminal.write(text);
  };
  stdin.on('data', onInput);
  terminal.onData((data) => terminalOutput.write(data));

  const { promise, resolve } = withResolvers<void>();
  terminal.onExit(() => resolve());
  try {
    await promise;
  } finally {
    clearInterval(idleTimer);
    stdin.off('data', onInput);
    stdin.setRawMode(wasRaw);
    terminal.kill();
  }

  stdout.write(inputToTape(tape));
}
