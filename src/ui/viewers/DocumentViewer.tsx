// PLACEHOLDER: spec task 18 (Document Viewer) replaces this file.
import type { DocumentPayload } from '../../core/types.js';

export interface DocumentViewerProps {
  payload: DocumentPayload;
  fileName: string;
}

export function DocumentViewer({ payload }: DocumentViewerProps) {
  return <p>{payload.blocks.length} blocks.</p>;
}
