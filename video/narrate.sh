#!/bin/sh
# Narration for the demo video with Chatterbox TTS (Resemble AI, MIT licence) in a container, on CPU.
# The voice is synthesised; the video and its description say so.
#   video/narrate.sh            -> video/nar/<key>.voice.wav for every video/nar/<key>.txt
#   video/narrate.sh 03-autopsy -> only that one
# TTS_CACHE: a folder for the model download (several GB). Defaults to video/tts-cache.
set -e
cd "$(dirname "$0")/.."
CACHE="${TTS_CACHE:-$PWD/video/tts-cache}"
mkdir -p "$CACHE/hf" "$CACHE/pip"
docker run --rm -v "$PWD/video":/v -v "$CACHE":/cache -w /v -e HF_HOME=/cache/hf -e PIP_CACHE_DIR=/cache/pip \
  python:3.11-slim sh -c "apt-get update -qq >/dev/null && apt-get install -y -qq libgomp1 libsndfile1 >/dev/null 2>&1; pip install -q --root-user-action=ignore chatterbox-tts soundfile 2>&1 | tail -3; python /v/nar/chatterbox_gen.py all $*"
echo NARRATION_DONE
