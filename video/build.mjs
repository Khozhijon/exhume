#!/usr/bin/env node
// Joins the captured frames (video/frames) and the narration clips (video/nar/*.voice.wav) into
// video/out/exhume-demo.mp4, using the timeline that capture.mjs wrote.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'video/out/timeline.json'), 'utf8'));
const keys = Object.keys(tl.start);
const out = path.join(ROOT, 'video/out');
const run = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

// 1. narration track: every clip delayed to its place on the timeline, then loudness-normalised
const inputs = keys.flatMap((k) => ['-i', path.join(ROOT, 'video/nar', `${k}.voice.wav`)]);
const delays = keys.map((k, i) => `[${i}:a]aresample=48000,adelay=${Math.round(tl.start[k] * 1000)}:all=1[a${i}]`).join(';');
const mix = `${keys.map((_, i) => `[a${i}]`).join('')}amix=inputs=${keys.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=${tl.total.toFixed(2)}[out]`;
run([...inputs, '-filter_complex', `${delays};${mix}`, '-map', '[out]', '-ar', '48000', '-ac', '2', path.join(out, 'narration.wav')]);

// 2. picture: frames with their real durations, resampled to a constant 30 fps
const lead = Math.max(0, tl.pictureLead ?? 0);
run(['-f', 'concat', '-safe', '0', '-i', path.join(ROOT, 'video/frames/frames.ffconcat'),
  '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium',
  path.join(out, 'picture.mp4')]);

// 3. together
run(['-ss', lead.toFixed(3), '-i', path.join(out, 'picture.mp4'), '-i', path.join(out, 'narration.wav'),
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', tl.total.toFixed(2), '-movflags', '+faststart', path.join(out, 'exhume-demo.mp4')]);
console.log(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'default=nw=1', path.join(out, 'exhume-demo.mp4')]).toString());
