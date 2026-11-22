#!/bin/sh
# Narration for the demo video with Chatterbox TTS (Resemble AI, MIT licence) in a container, on CPU.
# The voice is synthesised; the video and its description say so.
#   video/narrate.sh            -> every clip in video/nar/script.json
#   video/narrate.sh 03-autopsy -> only that clip
# One take per line, several for the key lines; the take is chosen by measurement (see nar/gen_lines.py).
# TTS_CACHE: a folder for the model downloads (several GB). Defaults to video/tts-cache.
set -e
cd "$(dirname "$0")/.."
CACHE="${TTS_CACHE:-$PWD/video/tts-cache}"
mkdir -p "$CACHE/hf" "$CACHE/pip"
docker run --rm -v "$PWD/video":/v -v "$CACHE":/cache -w /v -e HF_HOME=/cache/hf -e PIP_CACHE_DIR=/cache/pip \
  python:3.11-slim sh -c "apt-get update -qq >/dev/null && apt-get install -y -qq libgomp1 libsndfile1 >/dev/null 2>&1; pip install -q --root-user-action=ignore chatterbox-tts soundfile faster-whisper pytsmod 2>&1 | tail -3; python /v/nar/gen_lines.py $*"
echo NARRATION_DONE
