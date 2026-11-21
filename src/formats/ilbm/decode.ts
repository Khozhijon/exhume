// IFF ILBM / PBM decoder.
import { latin1 } from '../../core/codepage.js';
import { ByteReader } from '../../core/reader.js';
import { ExhumeError } from '../../core/types.js';
import type { ImagePayload, Specimen, Warning } from '../../core/types.js';
import { MAX_PALETTE, type IlbmState, walkChunks } from './chunks.js';
import { ehbPalette, greyRamp, hamToRgb, type Rgb } from './colour.js';

const FMT = 'ilbm';
const CAMG_HAM = 0x0800;
const CAMG_EHB = 0x0080;

export function formKind(bytes: Uint8Array): 'ILBM' | 'PBM ' | null {
  if (bytes.length < 12) return null;
  const t = (at: number): string => String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
  if (t(0) !== 'FORM') return null;
  const kind = t(8);
  return kind === 'ILBM' || kind === 'PBM ' ? kind : null;
}

export function decode(bytes: Uint8Array): Specimen {
  const kind = formKind(bytes);
  if (!kind) throw new ExhumeError('not an IFF ILBM file', FMT);
  const r = new ByteReader(bytes);
  const warnings: Warning[] = [];
  const state: IlbmState = { pbm: kind === 'PBM ' };

  const formSize = r.group('FORM header', () => {
    r.text(4, 'id', latin1);
    const size = r.u32be('size');
    r.text(4, 'type', latin1);
    return size;
  });
  let formEnd = 8 + formSize;
  if (formEnd > bytes.length) {
    warnings.push({ message: `FORM claims ${formSize} bytes but the file holds ${bytes.length - 8}`, offset: 4 });
    formEnd = bytes.length;
  }
  walkChunks({ r, state, warnings }, formEnd);

  const bmhd = state.bmhd;
  if (!bmhd) throw new ExhumeError('ILBM file has no usable BMHD chunk', FMT);
  const { width, height, nPlanes } = bmhd;
  if (!state.pixels) {
    warnings.push({ message: 'no BODY chunk: every pixel is index 0' });
    state.pixels = new Uint8Array(width * height * (nPlanes === 24 ? 3 : 1));
  }
  const camg = state.camg ?? 0;
  const noCmap = (): void => void warnings.push({ message: 'no CMAP chunk: greyscale ramp used' });

  let payload: ImagePayload;
  if (nPlanes === 24) {
    payload = { kind: 'image', width, height, bitsPerPixel: 24, pixels: state.pixels };
  } else if (camg & CAMG_HAM && nPlanes === 6) {
    if (!state.cmap) noCmap();
    const pal = state.cmap ?? greyRamp(16);
    payload = { kind: 'image', width, height, bitsPerPixel: 24, pixels: hamToRgb(state.pixels, width, height, pal) };
  } else {
    if (camg & CAMG_HAM) warnings.push({ message: `HAM with ${nPlanes} planes is not supported: shown as indexed colour` });
    const ehb = nPlanes === 6 && (camg & CAMG_EHB || state.cmap?.length === 32);
    let pal: Rgb[];
    if (state.cmap && state.cmap.length > 0) pal = state.cmap;
    else {
      noCmap();
      pal = greyRamp(ehb ? 32 : Math.min(1 << nPlanes, MAX_PALETTE));
    }
    if (ehb) pal = ehbPalette(pal);
    // Palette length rule: report the CMAP's own length (EHB: 64); the sample (5 planes) is bpp 8.
    const bitsPerPixel = nPlanes === 1 ? 1 : nPlanes <= 4 ? 4 : 8;
    payload = { kind: 'image', width, height, bitsPerPixel, palette: pal, pixels: state.pixels };
  }
  return {
    payload,
    annotations: r.annotations(),
    warnings,
    meta: { width, height, bitsPerPixel: payload.bitsPerPixel },
  };
}
