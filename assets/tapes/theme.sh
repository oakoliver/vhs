#!/usr/bin/env bash
# Renders assets/tapes/theme.tape once per theme, then tiles the stills into
# assets/themes.png. Needs ffmpeg with the xstack filter (ffmpeg >= 4.1).
set -euo pipefail
cd "$(dirname "$0")/../.."
themes=("Dracula" "Catppuccin Latte" "TokyoNight" "rose-pine")
inputs=()
mkdir -p assets/themes
for i in "${!themes[@]}"; do
  sed -e "s/THEME/${themes[$i]}/" -e "s#OUT#assets/themes/$i.png#" assets/tapes/theme.tape > "assets/themes/$i.tape"
  node dist/cli.js --quiet "assets/themes/$i.tape"
  inputs+=(-i "assets/themes/$i.png")
done
ffmpeg -v error -y "${inputs[@]}" -filter_complex "xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0" assets/themes.png
rm -rf assets/themes
