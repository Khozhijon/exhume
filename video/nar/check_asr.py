# Transcribe the narration clips with Whisper, to check pronunciation without ears.
import glob, os
from faster_whisper import WhisperModel
here = os.path.dirname(os.path.abspath(__file__))
model = WhisperModel("small.en", device="cpu", compute_type="int8")
for wav in sorted(glob.glob(os.path.join(here, "0[0-9]-*.voice.wav"))):
    key = os.path.basename(wav)[:-10]
    segments, _ = model.transcribe(wav, beam_size=3)
    heard = " ".join(s.text.strip() for s in segments)
    print("==", key, flush=True)
    print("heard :", heard, flush=True)
    txt = os.path.join(here, key + ".txt")
    if os.path.exists(txt):
        print("script:", open(txt).read().strip(), flush=True)
