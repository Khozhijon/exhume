#!/bin/sh
# Transcribe the narration clips with Whisper in a container and print them beside the script.
set -e
cd "$(dirname "$0")/.."
CACHE="${TTS_CACHE:-$PWD/video/tts-cache}"
docker run --rm -v "$PWD/video":/v -v "$CACHE":/cache -w /v -e HF_HOME=/cache/hf -e PIP_CACHE_DIR=/cache/pip python:3.11-slim sh -c "pip install -q --root-user-action=ignore faster-whisper 2>&1 | tail -2; python /v/nar/check_asr.py" > video/out/asr.txt 2>&1
echo ASR_DONE
