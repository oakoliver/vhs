# Changelog

## 1.2.0

Syncs the port from upstream VHS v0.11.0 to **v0.12.1** (v0.12.0, 2026-09-09; v0.12.1, 2026-09-24), on top of the 1.1.2 `Set Framerate` fix. Upstream's `v0.11.0...v0.12.1` is 15 commits; every one is listed below.

### Read this first: the default frame rate is now 50 fps, not 25

Earlier releases documented a default `Framerate` of 50 but actually encoded **25 fps** (see 1.1.2 below: the bug is still in upstream Go VHS, [charmbracelet/vhs#750](https://github.com/charmbracelet/vhs/issues/750)). 1.1.2 was never published; this is the first release with the fix. Every tape that does not set `Framerate` now renders at 50 fps, with **twice the frames** (GIFs roughly twice the size, longer to render). Add `Set Framerate 25` to keep the old output. Tapes that set `Framerate` explicitly now get what they asked for.

### Added

- `Set Rows <n>` and `Set Columns <n>` (upstream #763, v0.12.0): size the terminal in character cells instead of pixels. The pixel size is derived from the font settings plus `Padding`, `Margin` and `WindowBar`. The evaluator applies the terminal options first, then measures the live xterm.js (`term.fit()` / `term.cols` / `term.rows`) and corrects the viewport until it holds exactly the requested grid (`resolveRowsColumns`, exported; both loops are bounded and fail with an error rather than recording at the wrong size). Derived sizes are rounded up to even numbers for MP4/WebM.
  - `Set Columns` cannot be combined with `Set Width`, and `Set Rows` with `Set Height`, in either order (`cannot set both Width and Columns` / `cannot set both Height and Rows`). A `Set Height` equal to the default still counts. Other pairings work.
  - Values must be positive integers.
  - `StyleOptions` gains `rows` and `columns`, `VHSOptions` gains `widthExplicit` and `heightExplicit`; `ROWS` / `COLUMNS` token types and keywords; `vhs man` lists them.
  - Before: `vhs validate` failed with `Unknown setting: Rows`.
- The `.tape` extension is optional on the command line (upstream #654, v0.12.0): `vhs demo` runs `demo.tape`. One difference on purpose: upstream always appends `.tape` to a name that lacks it, so `vhs demo.vhs` looks for `demo.vhs.tape`. Here the name is read as given when `demo.vhs.tape` does not exist and `demo.vhs` does.

### Changed

- The terminal options (font, spacing, theme) are applied before the viewport is sized, as upstream does, because the cell size they decide is what `Rows` / `Columns` are measured in. Tapes without `Rows` / `Columns` get the same viewport and the same fit as before.
- The default `Framerate` of 50 takes effect (see above).

### Upstream changes since v0.11.0 and what happened to each

| Upstream | Change | Disposition |
|---|---|---|
| #763 `feat: rows/cols for axises` | `Set Rows`, `Set Columns`, resolved against the live terminal; tests in `command_test.go`, `lexer_test.go`, `parser_test.go` | **Ported**, tests ported (`tests/parity-v0.12.test.ts`, `lexer.test.ts`, `parser.test.ts`). `examples/settings/{rows,columns,rows-columns}.tape` rendered with the port and checked frame by frame: 8 rows, 30 columns and 10 rows x 40 columns, no wrap, 50 fps |
| #654 `feat(cli): assume .tape extension` | optional `.tape` in the filename argument | **Ported**, with the existing-file fallback above |
| #788 `fix: preserve context for rendering and report encoder errors` (v0.12.1, upstream #787) | `Evaluate` shadowed `ctx` with the recording's cancellable context, so `Render` ran with a cancelled one; a failing ffmpeg was only logged | **Already equivalent**: the port's recording uses its own `AbortController` and `runFFmpeg` gets the evaluation's `signal`; a non-zero ffmpeg exit and a missing binary (`ENOENT`) reject, and `evaluate` returns them. Upstream's `TestRenderMissingFFmpeg` and `TestEvaluateGIF` (cancel during render) are covered by tests that assert this |
| #781 `fix(windows): chrome process idle no rendering` | start Chrome by hand and poll its DevTools HTTP endpoint instead of waiting for the `DevTools listening on` line (upstream #754); `probeDevTools`, `waitForDevTools`, `killBrowser`, `browserCloseTimeout` | **Go-only**: it works around go-rod's launcher. Puppeteer starts and connects to Chrome itself. The port already force-kills a Chrome that does not close within 5 s (`closeBrowserWithTimeout`) |
| #781 / #788 | `Start(ctx)`, `Setup() error`, `Render(ctx)`, `exec.CommandContext` in `buildTtyCmd`, `MakeGIF/MP4/WebM/Screenshots(ctx, ...)`, `getVersion(ctx, ...)`, `Record(cmd)` context, `_ = vhs.browser.Close()` instead of `MustClose` | **Go-only** signatures. The port threads an `AbortSignal` through evaluation, the browser, ttyd and ffmpeg since 1.0 |
| `README.md`, `man.go` | docs for `Rows` / `Columns`; grammar fix in the `Wait` paragraph | **Applies** to the Rows/Columns docs (README, `vhs man`); the grammar fix is upstream prose the port's README does not contain |
| `fix: bump go to 1.26.7` (#784), `chore(deps)` x3 (#725, #745, #748), `go.mod` / `go.sum`, `lint and govuln` (#775) | Go toolchain and dependency bumps, `golangci` | **Go-only** |
| `ci: sync dependabot config` (#776), `ci: sync golangci-lint config` (#723), `chore: remove CODEOWNERS` | repository housekeeping | **Go-only** |
| `v0.12.0`, `v0.12.1` | release commits | none |
| `themes.json` | not touched between v0.11.0 and v0.12.1 | **No change** |
| `video.go` / ffmpeg filters | only the `ctx` parameter changed, no filter or argument change | **No change**; the 1.1.2 framerate handling stays (upstream still has #750) |

## 1.1.2

### Fixed

- `Set Framerate` was ignored: every GIF, MP4 and WebM came out at 25 fps. The
  colour `Set MarginFill` (which defaults to the theme background) was fed to
  ffmpeg as a `color=` source with no rate, so lavfi generated it at its
  default of 25 fps, and it is the base of the final `overlay`, which takes
  its output rate from its base input. The margin source is now generated at
  the rate of the filtered video, `Framerate * PlaybackSpeed`. An image
  `MarginFill` is now looped at the same rate, where it was left at the
  image2 default of 25 fps. The window bar and corner mask use that rate too,
  so `PlaybackSpeed` no longer makes them drop frames.
- `Set PlaybackSpeed` combined with the default margin fill dropped frames
  (it cut the output to 25 fps before the speed-up); it now keeps them all.

### Changed

- The default `Framerate` of 50 now takes effect. Tapes that never set it
  were encoded at 25 fps by the bug above and now come out at 50 fps, with
  twice the frames. Add `Set Framerate 25` to keep the old rate.

### Checked, no change needed

`PlaybackSpeed` (applied through `setpts`), `LoopOffset` (frame rotation and
`-start_number`), `Margin`, `MarginFill`, `WindowBar`, `WindowBarSize`,
`BorderRadius`, `Padding`, `Width`, `Height`, `Theme`, `FontSize`,
`LetterSpacing`, `LineHeight`, `CursorBlink`, `TypingSpeed`, `WaitPattern`
and `WaitTimeout` reach the output. `MaxColors` is not a tape setting in
upstream VHS either (the GIF palette is fixed at 256 colours).

The same defect exists upstream in Go VHS
([charmbracelet/vhs#750](https://github.com/charmbracelet/vhs/issues/750)),
so this release deliberately differs from it.
