#!/usr/bin/env bash
# Transcodes the videos in assets-src/videos/ into public/videos/ (requires ffmpeg).
# For each video NAME.mp4 it creates:
#   NAME.mp4          full video with sound (H.264/AAC, 480 px wide, fast start) — loaded only on click
#   NAME-preview.mp4  5 s silent preview used by the carousel autoplay
#   NAME-poster.webp  still frame shown before the video loads (set lazily by the carousel)
# The preview start (seconds) per video is set in PREVIEW_START below (default 0).
# Originals are not committed (see .gitignore); keep them locally to regenerate.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=assets-src/videos
OUT=public/videos
mkdir -p "$OUT"

declare -A PREVIEW_START=(
  [paredao-iluminado-entardecer]=24
  [paredao-leds-de-perto]=14
  [dj-e-paredao-a-noite]=33
  [festa-a-noite-luzes]=5
  [publico-curtindo-a-festa]=5
)

for file in "$SRC"/*.mp4; do
  name=$(basename "$file" .mp4)
  start=${PREVIEW_START[$name]:-0}
  echo "== $name (preview from ${start}s)"
  ffmpeg -v error -y -i "$file" -vf "scale=480:-2,fps=30" -c:v libx264 -profile:v main -preset slow -crf 31 \
    -pix_fmt yuv420p -c:a aac -b:a 96k -ac 2 -movflags +faststart "$OUT/$name.mp4"
  ffmpeg -v error -y -ss "$start" -i "$file" -t 5 -an -vf "scale=480:-2,fps=30" -c:v libx264 -profile:v main \
    -preset slow -crf 33 -g 30 -pix_fmt yuv420p -movflags +faststart "$OUT/$name-preview.mp4"
  ffmpeg -v error -y -ss "$start" -i "$file" -frames:v 1 -vf "scale=480:-2" -c:v libwebp -quality 70 "$OUT/$name-poster.webp"
done
ls -la "$OUT"
