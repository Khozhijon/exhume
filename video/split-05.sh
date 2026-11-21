#!/bin/sh
# Cut narration clip 05 at its sentence pauses into three clips, so the picture can change sample
# in the silence between them. Boundaries are the midpoints of the pauses found by silencedetect.
set -e
cd "$(dirname "$0")/nar"
in=05-more.voice.wav
cuts=$(ffmpeg -hide_banner -i "$in" -af silencedetect=noise=-45dB:d=0.22 -f null - 2>&1 |
  awk '/silence_start/ {s=$NF} /silence_end/ {split($0,a,"silence_end: "); split(a[2],b," "); printf "%.3f\n", (s+b[1])/2}')
c1=$(echo "$cuts" | sed -n 1p); c2=$(echo "$cuts" | sed -n 2p)
ffmpeg -y -loglevel error -i "$in" -to "$c1" 05a-dbase.voice.wav
ffmpeg -y -loglevel error -i "$in" -ss "$c1" -to "$c2" 05b-wordstar.voice.wav
ffmpeg -y -loglevel error -i "$in" -ss "$c2" 05c-damaged.voice.wav
echo "split at $c1 and $c2"
