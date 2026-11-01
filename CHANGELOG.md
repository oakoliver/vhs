# Changelog

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
