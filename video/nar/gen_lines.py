# Narration with Chatterbox (Resemble AI, MIT licence), its built-in default voice, on CPU.
# One take per LINE of nar/script.json, each with its own delivery settings; several takes for the lines
# that matter; the take is chosen by measurement (does a speech recogniser hear the script, and how much
# does the pitch move); the chosen takes are trimmed and joined with the pauses the script asks for.
#
#   python gen_lines.py            -> all clips
#   python gen_lines.py 01-hook    -> only that clip
#
# Writes nar/lines/<clip>-<id>-t<take>.wav (kept, so only changed lines are generated again),
# nar/<clip>.voice.wav, nar/<clip>.lines.json (where each line starts and ends) and nar/lines/report.txt.
import difflib, glob, hashlib, json, os, re, sys, time
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
LINES = os.path.join(HERE, "lines")
os.makedirs(LINES, exist_ok=True)
script = json.load(open(os.path.join(HERE, "script.json")))
D = script["defaults"]
want = set(sys.argv[1:])
clips = [c for c in script["clips"] if not want or c["key"] in want]


def opt(line, k):
    return line.get(k, D[k])


def line_id(line):
    s = "%s|%s|%s|%s" % (line["say"], opt(line, "ex"), opt(line, "cfg"), opt(line, "temp"))
    return hashlib.sha1(s.encode()).hexdigest()[:10]


def tidy(s):
    for a, b in (("Keero", "Kiro"), ("dee base", "dBASE"), ("Mac Paint", "MacPaint"), ("M C P", "MCP"),
                 ("Lotus one two three", "Lotus 1-2-3"), ("fan fold", "fan-fold")):
        s = s.replace(a, b)
    return s


jobs = []
for c in clips:
    for i, line in enumerate(c["lines"]):
        for t in range(opt(line, "takes")):
            name = "%s-%s-t%d.wav" % (c["key"], line_id(line), t + 1)
            jobs.append({"clip": c["key"], "i": i, "line": line, "take": t, "name": name, "path": os.path.join(LINES, name)})

# ---------- 1. generate the takes that do not exist yet ----------
missing = [j for j in jobs if not os.path.exists(j["path"])]
print("%d takes wanted, %d to generate" % (len(jobs), len(missing)), flush=True)
if missing:
    import torch, torchaudio as ta
    from chatterbox.tts import ChatterboxTTS
    model = ChatterboxTTS.from_pretrained(device="cpu")
    t0 = time.time()
    for n, j in enumerate(missing):
        line = j["line"]
        torch.manual_seed(int(line_id(line)[:6], 16) + 7919 * j["take"])
        wav = model.generate(line["say"], exaggeration=opt(line, "ex"), cfg_weight=opt(line, "cfg"), temperature=opt(line, "temp"))
        ta.save(j["path"], wav, model.sr)
        print("[%d/%d %4.0f s] %s  %.1f s  %s" % (n + 1, len(missing), time.time() - t0, j["name"], wav.shape[1] / model.sr, line["say"][:50]), flush=True)
    del model

# ---------- 2. measure every take ----------
import librosa
from faster_whisper import WhisperModel

MEASURES = os.path.join(LINES, "measures.json")
measures = json.load(open(MEASURES)) if os.path.exists(MEASURES) else {}
asr = None


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def pitch_stats(y, sr):
    f0, voiced, _ = librosa.pyin(y, fmin=60, fmax=320, sr=sr, frame_length=1024)
    f0 = f0[~np.isnan(f0)]
    if len(f0) < 5:
        return 0.0, 0.0
    st = 12 * np.log2(f0 / np.median(f0))
    return float(np.std(st)), float(np.percentile(st, 95) - np.percentile(st, 5))


def slow_down(y, rate):
    """Time-stretch without changing the pitch (WSOLA); rate < 1 is slower."""
    try:
        import pytsmod
        return pytsmod.wsola(y.astype("float64"), 1.0 / rate).astype("float32")
    except Exception as e:  # fall back to the phase vocoder
        print("wsola unavailable (%s): using librosa" % e, flush=True)
        return librosa.effects.time_stretch(y, rate=rate).astype("float32")


def measure(path, say, show):
    global asr
    y, sr = sf.read(path, dtype="float32")
    if y.ndim > 1:
        y = y.mean(axis=1)
    _, (a, b) = librosa.effects.trim(y, top_db=38)
    dur = (b - a) / sr
    st_std, st_range = pitch_stats(y[a:b], sr)
    if asr is None:
        asr = WhisperModel("small.en", device="cpu", compute_type="int8")
    segments, _ = asr.transcribe(path, beam_size=3)
    heard = " ".join(s.text.strip() for s in segments)
    sim = max(difflib.SequenceMatcher(None, norm(x), norm(heard)).ratio() for x in (say, show, tidy(say)))
    return {"a": int(a), "b": int(b), "sr": int(sr), "dur": round(dur, 3), "st_std": round(st_std, 2), "st_range": round(st_range, 2),
            "heard": heard, "sim": round(sim, 3), "wps": round(len(say.split()) / max(dur, 0.1), 2)}


for j in jobs:
    if j["name"] not in measures:
        line = j["line"]
        measures[j["name"]] = measure(j["path"], line["say"], line.get("show", tidy(line["say"])))
        json.dump(measures, open(MEASURES, "w"), indent=1)

# ---------- 3. choose a take for each line, 4. join ----------
NAME = re.compile(r"\bexh?[iu]+me?d?s?\b", re.I)  # exhume, exhumed, exume, exhum, exium
report = []
total_speech = 0.0
total_words = 0
all_std = []
for c in clips:
    parts = []
    marks = []
    pos = 0
    sr = None
    report.append("== %s" % c["key"])
    for i, line in enumerate(c["lines"]):
        takes = [j for j in jobs if j["clip"] == c["key"] and j["i"] == i]
        ms = [measures[j["name"]] for j in takes]
        best_sim = max(m["sim"] for m in ms)
        med = float(np.median([m["dur"] for m in ms]))
        ok = [k for k, m in enumerate(ms) if m["sim"] >= best_sim - 0.03 and m["dur"] <= 1.5 * med + 0.3]
        if "exhume" in line["say"].lower():
            # the product's name is a rare word: only takes in which the recogniser heard something like it
            named = [k for k, m in enumerate(ms) if NAME.search(m["heard"]) and m["dur"] <= 1.5 * med + 0.3]
            ok = named or ok
        if not ok:
            ok = [int(np.argmax([m["sim"] for m in ms]))]
        pick = max(ok, key=lambda k: ms[k]["st_std"])
        m = ms[pick]
        sr = m["sr"]
        y, _ = sf.read(takes[pick]["path"], dtype="float32")
        if y.ndim > 1:
            y = y.mean(axis=1)
        pad = int(0.04 * sr)
        seg = y[max(0, m["a"] - pad): min(len(y), m["b"] + pad)].copy()
        fade = int(0.012 * sr)
        # pace: a line that came out faster than its target is slowed down (pitch kept), by 20% at most
        target = opt(line, "wps")
        rate = min(1.0, max(0.8, target / m["wps"]))
        if rate < 0.985:
            seg = slow_down(seg, rate)
        seg[:fade] *= np.linspace(0, 1, fade)
        seg[-fade:] *= np.linspace(1, 0, fade)
        spoken = len(seg) / sr
        marks.append({"start": round(pos / sr, 3), "end": round((pos + len(seg)) / sr, 3), "say": line["say"], "show": line.get("show", tidy(line["say"]))})
        parts.append(seg)
        pos += len(seg)
        if i + 1 < len(c["lines"]):
            gap = np.zeros(int(opt(line, "pause") * sr), dtype="float32")
            parts.append(gap)
            pos += len(gap)
        total_speech += spoken
        total_words += len(line["say"].split())
        all_std.append(m["st_std"])
        flag = "" if m["sim"] >= 0.8 else "   <-- CHECK"
        words = len(line["say"].split())
        report.append("  %d. take %d of %d  sim %.2f  %.1f s  %.1f words/s%s  pitch sd %.1f st  ex %.2f cfg %.2f  pause %.2f%s" % (
            i + 1, pick + 1, len(ms), m["sim"], spoken, words / spoken, "" if rate >= 0.985 else " (was %.1f, slowed x%.2f)" % (m["wps"], rate),
            m["st_std"], opt(line, "ex"), opt(line, "cfg"), opt(line, "pause") if i + 1 < len(c["lines"]) else 0, flag))
        report.append("       script: %s" % line["say"])
        report.append("       heard : %s" % m["heard"])
        for k, o in enumerate(ms):
            if k != pick:
                report.append("       (take %d: sim %.2f, %.1f s, pitch sd %.1f st, heard: %s)" % (k + 1, o["sim"], o["dur"], o["st_std"], o["heard"]))
    wav = np.concatenate(parts)
    sf.write(os.path.join(HERE, c["key"] + ".voice.wav"), wav, sr)
    json.dump(marks, open(os.path.join(HERE, c["key"] + ".lines.json"), "w"), indent=1)
    report.append("  -> %s.voice.wav %.1f s" % (c["key"], len(wav) / sr))
    # the finished clip (after slowing and joining), heard once more
    if asr is None:
        asr = WhisperModel("small.en", device="cpu", compute_type="int8")
    segments, _ = asr.transcribe(os.path.join(HERE, c["key"] + ".voice.wav"), beam_size=3)
    report.append("  finished clip heard: " + " ".join(x.text.strip() for x in segments))

report.append("")
report.append("NEW: %d words, %.1f s of speech, %.2f words/s while speaking, mean pitch sd %.2f semitones per line" % (
    total_words, total_speech, total_words / max(total_speech, 0.1), float(np.mean(all_std))))

# the narration this replaces, measured the same way (whole clips), for comparison
old = sorted(glob.glob(os.path.join(HERE, "old", "0[0-9]-*.voice.wav")))
old = [p for p in old if os.path.exists(p[:-10] + ".txt")]
if old and not want:
    OLDM = os.path.join(LINES, "old-measures.json")
    om = json.load(open(OLDM)) if os.path.exists(OLDM) else {}
    for p in old:
        k = os.path.basename(p)
        if k not in om:
            y, sr = sf.read(p, dtype="float32")
            words = len(open(p[:-10] + ".txt").read().split())
            # speech time = total minus the silent stretches
            iv = librosa.effects.split(y, top_db=38)
            speech = float(sum(b - a for a, b in iv)) / sr
            sds = [pitch_stats(y[a:b], sr)[0] for a, b in iv if (b - a) / sr > 0.6]
            om[k] = {"words": words, "speech": round(speech, 2), "st_std": round(float(np.mean(sds)), 2) if sds else 0.0}
            json.dump(om, open(OLDM, "w"), indent=1)
    w = sum(v["words"] for v in om.values())
    s = sum(v["speech"] for v in om.values())
    report.append("OLD: %d words, %.1f s of speech, %.2f words/s while speaking, mean pitch sd %.2f semitones per phrase" % (
        w, s, w / max(s, 0.1), float(np.mean([v["st_std"] for v in om.values()]))))

text = "\n".join(report)
open(os.path.join(LINES, "report-%s.txt" % ("-".join(sorted(want)) if want else "all")), "w").write(text + "\n")
print(text, flush=True)
print("LINES_DONE", flush=True)
