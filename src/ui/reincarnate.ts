// Reincarnate: map an export target to the pure exporters in src/export. No bytes are parsed here.
import type { Specimen } from '../core/types.js';
import { autopsyToJson, encodePng, sheetToRows, tableToRows, toCsv, toHtml, toJson, toMarkdown, toPlainText, toXlsx } from '../export/index.js';
import { translateToExcel } from '../formats/wk1/excel.js';
import { baseName } from './bytes.js';

export interface Reincarnation {
  data: Uint8Array | string;
  warnings: string[];
}

export function reincarnate(extension: string, specimen: Specimen, fileName: string): Reincarnation {
  const p = specimen.payload;
  const plain = (data: Uint8Array | string): Reincarnation => ({ data, warnings: [] });
  switch (extension) {
    case 'png':
      if (p.kind === 'image') return plain(encodePng(p));
      break;
    case 'csv':
      if (p.kind === 'sheet') return plain(toCsv(sheetToRows(p)));
      if (p.kind === 'table') return plain(toCsv(tableToRows(p)));
      break;
    case 'xlsx':
      if (p.kind === 'sheet' || p.kind === 'table') {
        const { bytes, warnings } = toXlsx(p, { translateFormula: translateToExcel });
        return {
          data: bytes,
          warnings: warnings.length ? [`${warnings.length} formula(s) have no Excel equivalent and were saved as their values.`] : [],
        };
      }
      break;
    case 'md':
      if (p.kind === 'document') return plain(toMarkdown(p));
      break;
    case 'html':
      if (p.kind === 'document') return plain(toHtml(p, baseName(fileName)));
      break;
    case 'txt':
      if (p.kind === 'document') return plain(toPlainText(p));
      break;
    case 'json':
      return plain(toJson(p));
    case 'autopsy.json':
      return plain(autopsyToJson(specimen, fileName));
  }
  throw new Error(`a ${p.kind} cannot be reincarnated as .${extension}`);
}
