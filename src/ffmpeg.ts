/**
 * @oakoliver/vhs — FFmpeg filter complex and stream builders
 *
 * TypeScript port of Charmbracelet VHS v0.11.0 ffmpeg behavior.
 *
 * @module
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { deflateSync } from 'zlib';
import type { StyleOptions, VideoOptions } from './vhs.js';
import { withResolvers } from './promise.js';

// ============================================================================
// Utilities
// ============================================================================

/**
 * Double a number (for padding calculations).
 */
function double(n: number): number {
  return n * 2;
}

/**
 * Calculate terminal dimensions based on style options.
 */
export function calcTermDimensions(style: StyleOptions): { width: number; height: number } {
  let width = style.width;
  let height = style.height;

  if (style.marginFill !== '') {
    width = width - double(style.margin);
    height = height - double(style.margin);
  }

  if (style.windowBar !== '') {
    height = height - style.windowBarSize;
  }

  return { width, height };
}

const cssNamedColors = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue
cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey
darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon
darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon
lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey
lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey
lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod
palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon
sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey
snow springgreen steelblue tan teal thistle tomato transparent turquoise violet
wheat white whitesmoke yellow yellowgreen`.split(/\s+/),
);

/**
 * Check if margin fill is a color (vs an image path).
 */
export function marginFillIsColor(fill: string): boolean {
  if (fill.startsWith('#')) return true;
  return cssNamedColors.has(fill.toLowerCase().split('@', 1)[0]);
}

// ============================================================================
// FilterComplexBuilder
// ============================================================================

/**
 * Generates -filter_complex option for ffmpeg.
 */
export class FilterComplexBuilder {
  private filterComplex: string;
  private style: StyleOptions;
  private termWidth: number;
  private termHeight: number;
  private prevStageName: string;

  private constructor(filterComplex: string, style: StyleOptions, termWidth: number, termHeight: number, prevStageName: string) {
    this.filterComplex = filterComplex;
    this.style = style;
    this.termWidth = termWidth;
    this.termHeight = termHeight;
    this.prevStageName = prevStageName;
  }

  /**
   * Create a new FilterComplexBuilder for video.
   */
  static forVideo(videoOpts: VideoOptions): FilterComplexBuilder {
    const { width: termWidth, height: termHeight } = calcTermDimensions(videoOpts.style);
    const style = videoOpts.style;

    const filterCode = `
[0][1]overlay[merged];
[merged]scale=${termWidth - double(style.padding)}:${termHeight - double(style.padding)}:force_original_aspect_ratio=1[scaled];
[scaled]fps=${videoOpts.framerate},setpts=PTS/${videoOpts.playbackSpeed}[speed];
[speed]pad=${termWidth}:${termHeight}:(ow-iw)/2:(oh-ih)/2:${style.backgroundColor}[padded];
[padded]fillborders=left=${style.padding}:right=${style.padding}:top=${style.padding}:bottom=${style.padding}:mode=fixed:color=${style.backgroundColor}[padded]`;

    return new FilterComplexBuilder(filterCode, style, termWidth, termHeight, 'padded');
  }

  /**
   * Create a new FilterComplexBuilder for screenshot.
   */
  static forScreenshot(style: StyleOptions): FilterComplexBuilder {
    const { width: termWidth, height: termHeight } = calcTermDimensions(style);

    const filterCode = `
[0][1]overlay[merged];
[merged]scale=${termWidth - double(style.padding)}:${termHeight - double(style.padding)}:force_original_aspect_ratio=1[scaled];
[scaled]pad=${termWidth}:${termHeight}:(ow-iw)/2:(oh-ih)/2:${style.backgroundColor}[padded];
[padded]fillborders=left=${style.padding}:right=${style.padding}:top=${style.padding}:bottom=${style.padding}:mode=fixed:color=${style.backgroundColor}[padded]`;

    return new FilterComplexBuilder(filterCode, style, termWidth, termHeight, 'padded');
  }

  /**
   * Add window bar filter.
   */
  withWindowBar(barStream: number): this {
    if (this.style.windowBar !== '') {
      this.filterComplex += `;
[${barStream}]loop=-1[loopbar];
[loopbar][${this.prevStageName}]overlay=0:${this.style.windowBarSize}[withbar]`;
      this.prevStageName = 'withbar';
    }
    return this;
  }

  /**
   * Add border radius filter.
   */
  withBorderRadius(cornerMaskStream: number): this {
    if (this.style.borderRadius !== 0) {
      this.filterComplex += `;
[${cornerMaskStream}]loop=-1[loopmask];
[${this.prevStageName}][loopmask]alphamerge[rounded]`;
      this.prevStageName = 'rounded';
    }
    return this;
  }

  /**
   * Add margin fill filter.
   */
  withMarginFill(marginStream: number): this {
    if (this.style.marginFill !== '') {
      this.filterComplex += `;
[${marginStream}]scale=${this.style.width}:${this.style.height}[bg];
[bg][${this.prevStageName}]overlay=(W-w)/2:(H-h)/2:shortest=1[withbg]`;
      this.prevStageName = 'withbg';
    }
    return this;
  }

  /**
   * Add GIF palette filter.
   */
  withGIF(): this {
    this.filterComplex += `;
[${this.prevStageName}]split[plt_a][plt_b];
[plt_a]palettegen=max_colors=256[plt];
[plt_b][plt]paletteuse[palette]`;
    this.prevStageName = 'palette';
    return this;
  }

  /**
   * Build the filter_complex arguments.
   */
  build(): string[] {
    return [
      '-filter_complex', this.filterComplex,
      '-map', `[${this.prevStageName}]`,
    ];
  }
}

// ============================================================================
// StreamBuilder
// ============================================================================

/**
 * Generates input streams for ffmpeg.
 */
export class StreamBuilder {
  private args: string[] = [];
  private counter: number;
  private style: StyleOptions;
  private termWidth: number;
  private termHeight: number;
  private input: string;
  
  barStream: number = 0;
  cornerStream: number = 0;
  marginStream: number = 0;

  constructor(streamCounter: number, input: string, style: StyleOptions) {
    const { width, height } = calcTermDimensions(style);
    this.counter = streamCounter;
    this.style = style;
    this.termWidth = width;
    this.termHeight = height;
    this.input = input;
  }

  /**
   * Add margin stream (color or image).
   */
  withMargin(): this {
    if (this.style.marginFill !== '') {
      if (marginFillIsColor(this.style.marginFill)) {
        // Create plain color stream
        this.args.push(
          '-f', 'lavfi',
          '-i', `color=${this.style.marginFill}:s=${this.style.width}x${this.style.height}`,
        );
      } else {
        if (!fs.existsSync(this.style.marginFill)) {
          throw new Error(`Unable to read margin file: ${this.style.marginFill}`);
        }
        this.args.push('-loop', '1', '-i', this.style.marginFill);
      }
      this.marginStream = this.counter;
      this.counter++;
    }
    return this;
  }

  /**
   * Add window bar stream.
   */
  withBar(): this {
    if (this.style.windowBar !== '') {
      const barPath = path.join(this.input, 'bar.png');
      this.args.push('-i', barPath);
      this.barStream = this.counter;
      this.counter++;
    }
    return this;
  }

  /**
   * Add corner mask stream for border radius.
   */
  withCorner(): this {
    if (this.style.borderRadius !== 0) {
      const maskPath = path.join(this.input, 'mask.png');
      this.args.push('-i', maskPath);
      this.cornerStream = this.counter;
      this.counter++;
    }
    return this;
  }

  /**
   * Add MP4 encoding options.
   */
  withMP4(): this {
    this.args.push(
      '-vcodec', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-an',
      '-crf', '20',
    );
    return this;
  }

  /**
   * Add WebM encoding options.
   */
  withWebm(): this {
    this.args.push(
      '-pix_fmt', 'yuv420p',
      '-an',
      '-crf', '30',
      '-b:v', '0',
    );
    return this;
  }

  /**
   * Build the stream arguments.
   */
  build(): string[] {
    return this.args;
  }
}

// ============================================================================
// FFmpeg Command Builder
// ============================================================================

/**
 * Output format type.
 */
export type OutputFormat = 'gif' | 'mp4' | 'webm' | 'png';

/**
 * Build ffmpeg command arguments for video/GIF generation.
 */
export function buildFFmpegArgs(options: {
  textFrames: string;
  cursorFrames: string;
  framerate: number;
  videoOpts: VideoOptions;
  outputPath: string;
  format: OutputFormat;
}): string[] {
  const { textFrames, cursorFrames, framerate, videoOpts, outputPath, format } = options;
  const style = videoOpts.style;
  prepareDecorations(videoOpts.input, style);

  const args: string[] = [
    '-y',
    '-framerate', String(framerate),
    '-start_number', String(videoOpts.startingFrame),
    '-i', textFrames,
    '-framerate', String(framerate),
    '-start_number', String(videoOpts.startingFrame),
    '-i', cursorFrames,
  ];

  // Build streams
  const streamBuilder = new StreamBuilder(2, videoOpts.input, style);
  streamBuilder.withMargin().withBar().withCorner();
  args.push(...streamBuilder.build());

  // Build filter complex
  const filterBuilder = FilterComplexBuilder.forVideo(videoOpts);
  filterBuilder
    .withWindowBar(streamBuilder.barStream)
    .withBorderRadius(streamBuilder.cornerStream)
    .withMarginFill(streamBuilder.marginStream);

  // Add format-specific filters
  if (format === 'gif') {
    filterBuilder.withGIF();
  }

  args.push(...filterBuilder.build());

  // Add format-specific encoding options
  if (format === 'mp4') {
    args.push(
      '-vcodec', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-an',
      '-crf', '20',
    );
  } else if (format === 'webm') {
    args.push(
      '-pix_fmt', 'yuv420p',
      '-an',
      '-crf', '30',
      '-b:v', '0',
    );
  }

  args.push(outputPath);

  return args;
}

/**
 * Build ffmpeg command arguments for screenshot generation.
 */
export function buildScreenshotFFmpegArgs(options: {
  textFrame: string;
  cursorFrame: string;
  style: StyleOptions;
  outputPath: string;
}): string[] {
  const { textFrame, cursorFrame, style, outputPath } = options;
  const input = path.dirname(textFrame);
  prepareDecorations(input, style);
  const args: string[] = ['-y', '-i', textFrame, '-i', cursorFrame];
  const streamBuilder = new StreamBuilder(2, input, style)
    .withMargin()
    .withBar()
    .withCorner();
  args.push(...streamBuilder.build());

  const filterBuilder = FilterComplexBuilder.forScreenshot(style)
    .withWindowBar(streamBuilder.barStream)
    .withBorderRadius(streamBuilder.cornerStream)
    .withMarginFill(streamBuilder.marginStream);
  args.push(...filterBuilder.build(), outputPath);
  return args;
}

// ============================================================================
// Window Bar & Border Radius Mask Generation
// ============================================================================

/**
 * Window bar style types.
 */
export type WindowBarStyle =
  | 'Colorful'
  | 'ColorfulRight'
  | 'Rings'
  | 'RingsRight'
  | 'colorful'
  | 'colorfulRight'
  | 'rings'
  | 'ringsRight'
  | '';

/**
 * Generate SVG for window bar.
 * Note: In the original Go implementation, this uses Lipgloss for rendering.
 * Here we generate a simple SVG that can be converted to PNG via ffmpeg or sharp.
 */
export function generateWindowBarSVG(
  width: number,
  height: number,
  style: WindowBarStyle,
  barSize: number,
  backgroundColor: string,
): string {
  const padding = 8;
  const circleRadius = 6;
  const circleSpacing = 20;

  // Determine circle positions based on style
  const isRight = style === 'colorfulRight' || style === 'ringsRight' || style === 'ColorfulRight' || style === 'RingsRight';
  const isFilled = style === 'colorful' || style === 'colorfulRight' || style === 'Colorful' || style === 'ColorfulRight';

  const colors = isFilled
    ? ['#FF5F57', '#FEBC2E', '#28C840'] // macOS-style filled
    : [backgroundColor, backgroundColor, backgroundColor]; // rings only

  const strokeColors = isFilled
    ? ['none', 'none', 'none']
    : ['#FF5F57', '#FEBC2E', '#28C840'];

  let circles = '';
  for (let i = 0; i < 3; i++) {
    const cx = isRight
      ? width - padding - circleRadius - (2 - i) * circleSpacing
      : padding + circleRadius + i * circleSpacing;
    const cy = barSize / 2;

    circles += `<circle cx="${cx}" cy="${cy}" r="${circleRadius}" fill="${colors[i]}" stroke="${strokeColors[i]}" stroke-width="1.5"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${barSize}">
  <rect width="${width}" height="${barSize}" fill="${backgroundColor}"/>
  ${circles}
</svg>`;
}

/**
 * Generate SVG for border radius mask.
 */
export function generateBorderRadiusMaskSVG(
  width: number,
  height: number,
  borderRadius: number,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}" fill="white"/>
</svg>`;
}
const crcTable = new Uint32Array(256);
for (let value = 0; value < crcTable.length; value++) {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  crcTable[value] = crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuffer, data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const chunk = Buffer.allocUnsafe(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
  return chunk;
}

function encodePNG(
  width: number,
  height: number,
  pixels: Uint8Array,
  channels: 1 | 4,
  colorType: 0 | 6
): Buffer {
  const stride = width * channels;
  const scanlines = Buffer.allocUnsafe((stride + 1) * height);
  for (let row = 0; row < height; row++) {
    const offset = row * (stride + 1);
    scanlines[offset] = 0;
    scanlines.set(pixels.subarray(row * stride, (row + 1) * stride), offset + 1);
  }
  const header = Buffer.allocUnsafe(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  header.fill(0, 10);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function parseHexColor(color: string): readonly [number, number, number, number] {
  let hex = color.startsWith('#') ? color.slice(1) : color;
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) {
    throw new Error(`Invalid color: ${color}`);
  }
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((digit) => digit + digit).join('');
  }
  if (hex.length === 6) hex += 'ff';
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    Number.parseInt(hex.slice(6, 8), 16),
  ];
}

function fillRGBA(pixels: Uint8Array, color: readonly [number, number, number, number]): void {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }
}

function drawCircle(
  pixels: Uint8Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  color: readonly [number, number, number, number]
): void {
  const radiusSquared = radius * radius;
  for (let y = Math.max(0, centerY - radius); y < Math.min(height, centerY + radius); y++) {
    for (let x = Math.max(0, centerX - radius); x < Math.min(width, centerX + radius); x++) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      if (dx * dx + dy * dy > radiusSquared) continue;
      const offset = (y * width + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }
}

/** Draw the upstream window-bar decoration directly as a PNG. */
export function makeWindowBar(
  termWidth: number,
  termHeight: number,
  style: StyleOptions,
  outputPath: string
): void {
  const pixels = new Uint8Array(termWidth * (termHeight + style.windowBarSize) * 4);
  const background = parseHexColor(style.windowBarColor);
  fillRGBA(pixels, background);
  const right = style.windowBar.endsWith('Right');
  const barSize = style.windowBarSize;

  if (style.windowBar.startsWith('Colorful')) {
    const radius = Math.floor(barSize / 6);
    const gap = Math.floor((barSize - radius * 2) / 2);
    const spacing = radius * 2 + Math.floor(barSize / 6);
    const colors = ['#ff4f4d', '#febb00', '#00cc1d'].map(parseHexColor);
    for (let index = 0; index < colors.length; index++) {
      const x = right
        ? termWidth - (gap + radius + index * spacing)
        : gap + radius + index * spacing;
      drawCircle(pixels, termWidth, termHeight + barSize, x, gap + radius, radius, colors[index]);
    }
  } else if (style.windowBar.startsWith('Rings')) {
    const outerRadius = Math.floor(barSize / 5);
    const innerRadius = Math.floor((outerRadius * 4) / 5);
    const gap = Math.floor((barSize - outerRadius * 2) / 2);
    const spacing = outerRadius * 2 + Math.floor(barSize / 6);
    for (let index = 0; index < 3; index++) {
      const x = right
        ? termWidth - (gap + outerRadius + index * spacing)
        : gap + outerRadius + index * spacing;
      drawCircle(pixels, termWidth, termHeight + barSize, x, gap + outerRadius, outerRadius, [0x33, 0x33, 0x33, 0xff]);
      drawCircle(pixels, termWidth, termHeight + barSize, x, gap + outerRadius, innerRadius, background);
    }
  }
  fs.writeFileSync(outputPath, encodePNG(termWidth, termHeight + barSize, pixels, 4, 6));
}

/** Draw the grayscale alpha mask used for rounded terminal corners. */
export function makeBorderRadiusMask(
  width: number,
  height: number,
  radius: number,
  outputPath: string
): void {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nearestX = Math.max(radius, Math.min(width - radius, x + 0.5));
      const nearestY = Math.max(radius, Math.min(height - radius, y + 0.5));
      const dx = x + 0.5 - nearestX;
      const dy = y + 0.5 - nearestY;
      pixels[y * width + x] = dx * dx + dy * dy <= radius * radius ? 255 : 0;
    }
  }
  fs.writeFileSync(outputPath, encodePNG(width, height, pixels, 1, 0));
}

export function prepareDecorations(input: string, style: StyleOptions): void {
  fs.mkdirSync(input, { recursive: true });
  const { width, height } = calcTermDimensions(style);
  if (style.windowBar) makeWindowBar(width, height, style, path.join(input, 'bar.png'));
  if (style.borderRadius) {
    makeBorderRadiusMask(
      width,
      height + (style.windowBar ? style.windowBarSize : 0),
      style.borderRadius,
      path.join(input, 'mask.png')
    );
  }
}

// ============================================================================
// FFmpeg Rendering Functions
// ============================================================================

/**
 * Run ffmpeg with arguments.
 */
export function runFFmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error('FFmpeg rendering aborted'));
  }
  const { promise, resolve, reject } = withResolvers<void>();
  const child = spawn('ffmpeg', args, { stdio: 'inherit' });
  const onAbort = () => child.kill('SIGTERM');
  const finish = (error?: Error) => {
    signal?.removeEventListener('abort', onAbort);
    if (error) reject(error);
    else resolve();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  child.once('error', finish);
  child.once('close', (code) => {
    if (signal?.aborted) {
      finish(signal.reason instanceof Error ? signal.reason : new Error('FFmpeg rendering aborted'));
    } else if (code === 0) {
      finish();
    } else {
      finish(new Error(`ffmpeg exited with code ${code}`));
    }
  });
  return promise;
}

function ensureOutputDirectory(outputPath: string): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

/**
 * Make a GIF from video frames.
 */
export async function makeGIF(videoOpts: VideoOptions, signal?: AbortSignal): Promise<void> {
  const textFrames = path.join(videoOpts.input, 'frame-text-%05d.png');
  const cursorFrames = path.join(videoOpts.input, 'frame-cursor-%05d.png');
  const outputPath = videoOpts.output.gif;

  if (!outputPath) return;
  ensureOutputDirectory(outputPath);

  const args = buildFFmpegArgs({
    textFrames,
    cursorFrames,
    framerate: videoOpts.framerate,
    videoOpts,
    outputPath,
    format: 'gif',
  });

  await runFFmpeg(args, signal);
}

/**
 * Make an MP4 from video frames.
 */
export async function makeMP4(videoOpts: VideoOptions, signal?: AbortSignal): Promise<void> {
  const textFrames = path.join(videoOpts.input, 'frame-text-%05d.png');
  const cursorFrames = path.join(videoOpts.input, 'frame-cursor-%05d.png');
  const outputPath = videoOpts.output.mp4;

  if (!outputPath) return;
  ensureOutputDirectory(outputPath);

  const args = buildFFmpegArgs({
    textFrames,
    cursorFrames,
    framerate: videoOpts.framerate,
    videoOpts,
    outputPath,
    format: 'mp4',
  });

  await runFFmpeg(args, signal);
}

/**
 * Make a WebM from video frames.
 */
export async function makeWebM(videoOpts: VideoOptions, signal?: AbortSignal): Promise<void> {
  const textFrames = path.join(videoOpts.input, 'frame-text-%05d.png');
  const cursorFrames = path.join(videoOpts.input, 'frame-cursor-%05d.png');
  const outputPath = videoOpts.output.webm;

  if (!outputPath) return;
  ensureOutputDirectory(outputPath);

  const args = buildFFmpegArgs({
    textFrames,
    cursorFrames,
    framerate: videoOpts.framerate,
    videoOpts,
    outputPath,
    format: 'webm',
  });

  await runFFmpeg(args, signal);
}

/**
 * Make a screenshot from single frames.
 */
export async function makeScreenshot(
  textFrame: string,
  cursorFrame: string,
  style: StyleOptions,
  outputPath: string,
  signal?: AbortSignal,
): Promise<void> {
  ensureOutputDirectory(outputPath);
  const args = buildScreenshotFFmpegArgs({
    textFrame,
    cursorFrame,
    style,
    outputPath,
  });

  await runFFmpeg(args, signal);
}
