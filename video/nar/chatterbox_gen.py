# Narration with Chatterbox (Resemble AI, MIT licence), its built-in default voice, on CPU.
#   python chatterbox_gen.py sample      -> samples/chatterbox.wav from sample.txt
#   python chatterbox_gen.py all         -> nar/<key>.voice.wav for every nar/<key>.txt
import glob, os, sys, re
import torch, torchaudio as ta
from chatterbox.tts import ChatterboxTTS
HERE = os.path.dirname(os.path.abspath(__file__))
torch.manual_seed(7)
model = ChatterboxTTS.from_pretrained(device="cpu")
def speak(text, out):
    # One sentence at a time keeps the prosody steady; join with short pauses.
    parts = [p.strip() for p in re.split(r"(?<=[.:?])\s+", text) if p.strip()]
    gap = torch.zeros(1, int(model.sr * 0.28))
    chunks = []
    for p in parts:
        chunks += [model.generate(p), gap]
    wav = torch.cat(chunks[:-1], dim=1)
    ta.save(out, wav, model.sr)
    print(os.path.basename(out), "%.1f s" % (wav.shape[1] / model.sr), flush=True)
if sys.argv[1] == "sample":
    speak(open(os.path.join(HERE, "sample.txt")).read().strip(), os.path.join(HERE, "..", "samples", "chatterbox.wav"))
else:
    keys = sys.argv[2:] or [os.path.basename(t)[:-4] for t in sorted(glob.glob(os.path.join(HERE, "[0-9]*.txt")))]
    for key in keys:
        speak(open(os.path.join(HERE, key + ".txt")).read().strip(), os.path.join(HERE, key + ".voice.wav"))
