import puppeteer from 'puppeteer';
import type { Browser, KeyInput, Page } from 'puppeteer';
import type { BrowserInterface } from './evaluator.js';
import type { KeyCode, KeyModifiers } from './command.js';
import { withResolvers } from './promise.js';

const punctuationKeys: Partial<Record<KeyCode, KeyInput>> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

function toKeyInput(code: KeyCode): KeyInput {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase() as KeyInput;
  if (code.startsWith('Digit')) return code.slice(5) as KeyInput;
  return punctuationKeys[code] ?? (code as KeyInput);
}

export function chromeSandboxArgs(value: string | undefined): string[] {
  return value ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
}

export interface BrowserCloseTarget {
  close(): Promise<void>;
  process(): { kill(signal?: NodeJS.Signals | number): boolean } | null;
}

export async function closeBrowserWithTimeout(
  browser: BrowserCloseTarget,
  timeoutMs = 5_000,
): Promise<void> {
  const forced = withResolvers<void>();
  const timeout = setTimeout(() => {
    try {
      browser.process()?.kill('SIGKILL');
    } finally {
      forced.resolve();
    }
  }, timeoutMs);
  try {
    await Promise.race([browser.close(), forced.promise]);
  } finally {
    clearTimeout(timeout);
  }
}

/** Puppeteer-backed browser implementation used by the CLI and by evaluate(). */
export class PuppeteerBrowser implements BrowserInterface {
  private browser: Browser | null = null;
  private page: Page | null = null;

  private get activePage(): Page {
    if (!this.page) throw new Error('Browser has not been launched');
    return this.page;
  }

  async launch(url: string, options?: { width: number; height: number }): Promise<void> {
    if (this.browser) throw new Error('Browser is already running');

    this.browser = await puppeteer.launch({
      headless: true,
      args: chromeSandboxArgs(process.env.VHS_NO_SANDBOX),
    });
    this.page = await this.browser.newPage();
    if (options) {
      await this.page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: 1 });
    }
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    if (browser) await closeBrowserWithTimeout(browser);
  }

  async waitForTerminal(): Promise<void> {
    await this.activePage.waitForFunction(() => {
      const value = (globalThis as typeof globalThis & { term?: unknown }).term;
      return value !== undefined;
    });
    await this.activePage.waitForSelector('canvas.xterm-text-layer');
    await this.activePage.waitForSelector('canvas.xterm-cursor-layer');
  }

  async typeKey(code: KeyCode, modifiers: KeyModifiers = {}): Promise<void> {
    await this.typeKeyChord([code], modifiers);
  }

  async typeKeyChord(codes: KeyCode[], modifiers: KeyModifiers = {}): Promise<void> {
    if (codes.length === 0) return;

    const keyboard = this.activePage.keyboard;
    const heldModifiers: KeyInput[] = [];
    if (modifiers.ctrl) heldModifiers.push('Control');
    if (modifiers.alt) heldModifiers.push('Alt');
    if (modifiers.shift) heldModifiers.push('Shift');
    if (modifiers.meta) heldModifiers.push('Meta');

    const heldKeys: KeyInput[] = [];
    try {
      for (const modifier of heldModifiers) await keyboard.down(modifier);
      for (const code of codes.slice(0, -1)) {
        const key = toKeyInput(code);
        heldKeys.push(key);
        await keyboard.down(key);
      }
      await keyboard.press(toKeyInput(codes[codes.length - 1]));
    } finally {
      for (const key of heldKeys.reverse()) await keyboard.up(key);
      for (const modifier of heldModifiers.reverse()) await keyboard.up(modifier);
    }
  }

  async typeText(text: string, options?: { delay?: number }): Promise<void> {
    await this.activePage.keyboard.type(text, options);
  }

  async inputText(text: string): Promise<void> {
    await this.activePage.keyboard.sendCharacter(text);
  }

  async evaluate<T>(fn: string): Promise<T> {
    return this.activePage.evaluate(fn) as Promise<T>;
  }

  async getCurrentLine(): Promise<string> {
    return this.activePage.evaluate(() => {
      const term = (globalThis as typeof globalThis & {
        term: { buffer: { active: { cursorY: number; viewportY: number; getLine(index: number): { translateToString(trimRight?: boolean): string } | undefined } } };
      }).term;
      return term.buffer.active
        .getLine(term.buffer.active.cursorY + term.buffer.active.viewportY)
        ?.translateToString(true) ?? '';
    });
  }

  async getBuffer(): Promise<string[]> {
    return this.activePage.evaluate(() => {
      const term = (globalThis as typeof globalThis & {
        term: { rows: number; buffer: { active: { viewportY: number; getLine(index: number): { translateToString(trimRight?: boolean): string } | undefined } } };
      }).term;
      return Array.from({ length: term.rows }, (_, index) =>
        term.buffer.active.getLine(term.buffer.active.viewportY + index)?.translateToString(true) ?? ''
      );
    });
  }

  async waitForIdle(): Promise<void> {
    await this.activePage.evaluate('() => new Promise(resolve => requestAnimationFrame(resolve))');
  }

  async scroll(direction: number): Promise<void> {
    await this.activePage.evaluate((lines) => {
      const term = (globalThis as typeof globalThis & { term: { scrollLines(count: number): void } }).term;
      term.scrollLines(lines);
    }, direction);
  }

  private async captureCanvas(selector: string): Promise<Buffer> {
    const canvas = await this.activePage.$(selector);
    if (!canvas) throw new Error(`Terminal canvas not found: ${selector}`);
    const image = await canvas.screenshot({ type: 'png', omitBackground: true });
    return Buffer.from(image);
  }

  captureTextCanvas(): Promise<Buffer> {
    return this.captureCanvas('canvas.xterm-text-layer');
  }

  captureCursorCanvas(): Promise<Buffer> {
    return this.captureCanvas('canvas.xterm-cursor-layer');
  }

  async setViewport(width: number, height: number): Promise<void> {
    await this.activePage.setViewport({ width, height, deviceScaleFactor: 1 });
  }
}
