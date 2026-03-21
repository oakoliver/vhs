/**
 * @oakoliver/vhs — FFmpeg filter complex and stream builders
 *
 * Zero-dependency TypeScript port of Charmbracelet's VHS ffmpeg.go.
 *
 * @module
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import type { StyleOptions, VideoOptions } from './vhs.js';

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

/**
 * Check if margin fill is a color (vs an image path).
 */
export function marginFillIsColor(fill: string): boolean {
  // Color formats: #RGB, #RRGGBB, #RRGGBBAA, or named colors
  if (fill.startsWith('#')) {
    return true;
  }
  // Common CSS color names
  const colorNames = [
    'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
    'gray', 'grey', 'transparent', 'orange', 'purple', 'pink', 'brown',
  ];
  return colorNames.includes(fill.toLowerCase());
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
        // Check file existence
        if (!fs.existsSync(this.style.marginFill)) {
          console.error(`Unable to read margin file: ${this.style.marginFill}`);
        }
        // Add image stream
        this.args.push(
          '-loop', '1',
          '-i', this.style.marginFill,
        );
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
      // Note: MakeWindowBar would need to be called externally
      // This just sets up the ffmpeg stream
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
      // Note: MakeBorderRadiusMask would need to be called externally
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

  const args: string[] = [
    '-y', // Overwrite output
    '-framerate', String(framerate),
    '-i', textFrames,
    '-framerate', String(framerate),
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

  const args: string[] = [
    '-y', // Overwrite output
    '-i', textFrame,
    '-i', cursorFrame,
  ];

  // Build streams for screenshot
  // Note: Screenshots don't need margin/bar/corner for basic output
  
  // Build filter complex for screenshot
  const filterBuilder = FilterComplexBuilder.forScreenshot(style);
  args.push(...filterBuilder.build());

  args.push(outputPath);

  return args;
}

// ============================================================================
// Window Bar & Border Radius Mask Generation
// ============================================================================

/**
 * Window bar style types.
 */
export type WindowBarStyle = 'colorful' | 'colorfulRight' | 'rings' | 'ringsRight' | '';

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
  const isRight = style === 'colorfulRight' || style === 'ringsRight';
  const isFilled = style === 'colorful' || style === 'colorfulRight';

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

// ============================================================================
// FFmpeg Rendering Functions
// ============================================================================

/**
 * Run ffmpeg with arguments.
 */
export function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

/**
 * Make a GIF from video frames.
 */
export async function makeGIF(videoOpts: VideoOptions): Promise<void> {
  const textFrames = path.join(videoOpts.input, 'frame-text-%05d.png');
  const cursorFrames = path.join(videoOpts.input, 'frame-cursor-%05d.png');
  const outputPath = videoOpts.output.gif;

  if (!outputPath) return;

  const args = buildFFmpegArgs({
    textFrames,
    cursorFrames,
    framerate: videoOpts.framerate,
    videoOpts,
    outputPath,
    format: 'gif',
  });

  await runFFmpeg(args);
}

/**
 * Make an MP4 from video frames.
 */
export async function makeMP4(videoOpts: VideoOptions): Promise<void> {
  const textFrames = path.join(videoOpts.input, 'frame-text-%05d.png');
  const cursorFrames = path.join(videoOpts.input, 'frame-cursor-%05d.png');
  const outputPath = videoOpts.output.mp4;

  if (!outputPath) return;

  const args = buildFFmpegArgs({
    textFrames,
    cursorFrames,
    framerate: videoOpts.framerate,
    videoOpts,
    outputPath,
    format: 'mp4',
  });

  await runFFmpeg(args);
}

/**
 * Make a WebM from video frames.
 */
export async function makeWebM(videoOpts: VideoOptions): Promise<void> {
  const textFrames = path.join(videoOpts.input, 'frame-text-%05d.png');
  const cursorFrames = path.join(videoOpts.input, 'frame-cursor-%05d.png');
  const outputPath = videoOpts.output.webm;

  if (!outputPath) return;

  const args = buildFFmpegArgs({
    textFrames,
    cursorFrames,
    framerate: videoOpts.framerate,
    videoOpts,
    outputPath,
    format: 'webm',
  });

  await runFFmpeg(args);
}

/**
 * Make a screenshot from single frames.
 */
export async function makeScreenshot(
  textFrame: string,
  cursorFrame: string,
  style: StyleOptions,
  outputPath: string,
): Promise<void> {
  const args = buildScreenshotFFmpegArgs({
    textFrame,
    cursorFrame,
    style,
    outputPath,
  });

  await runFFmpeg(args);
}
