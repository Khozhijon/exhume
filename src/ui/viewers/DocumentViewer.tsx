import { useState, useMemo } from 'react';
import type { DocumentPayload, TextRun, DocumentBlock } from '../../core/types.js';
import './document.css';

export interface DocumentViewerProps {
  payload: DocumentPayload;
  fileName: string;
}

function renderRun(run: TextRun, index: number): React.ReactNode {
  let element: React.ReactNode = run.text;

  if (run.bold) element = <strong key={index}>{element}</strong>;
  if (run.italic) element = <em key={index}>{element}</em>;
  if (run.underline) element = <u key={index}>{element}</u>;
  if (run.strike) element = <s key={index}>{element}</s>;
  if (run.sup) element = <sup key={index}>{element}</sup>;
  if (run.sub) element = <sub key={index}>{element}</sub>;

  return element;
}

function expandHeader(text: string, pageNum: number): string {
  return text.replace(/#/g, String(pageNum));
}

function countWords(blocks: DocumentBlock[]): number {
  let count = 0;
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      for (const run of block.runs) {
        count += run.text.split(/\s+/).filter((w) => w.length > 0).length;
      }
    }
  }
  return count;
}

function countPages(blocks: DocumentBlock[]): number {
  let pages = 1;
  for (const block of blocks) {
    if (block.type === 'pageBreak') pages++;
  }
  return pages;
}

export function DocumentViewer({ payload, fileName }: DocumentViewerProps) {
  const [plainMode, setPlainMode] = useState(false);

  const stats = useMemo(() => {
    const paragraphs = payload.blocks.filter((b) => b.type === 'paragraph').length;
    const pages = countPages(payload.blocks);
    const words = countWords(payload.blocks);
    return { paragraphs, pages, words };
  }, [payload.blocks]);

  const pages = useMemo(() => {
    const result: DocumentBlock[][] = [];
    let currentPage: DocumentBlock[] = [];

    for (const block of payload.blocks) {
      if (block.type === 'pageBreak') {
        result.push(currentPage);
        currentPage = [];
      } else {
        currentPage.push(block);
      }
    }
    if (currentPage.length > 0 || result.length === 0) {
      result.push(currentPage);
    }
    return result;
  }, [payload.blocks]);

  return (
    <div className="viewer-document">
      <div className="viewer-tools" role="group" aria-label="Document controls">
        <span className="chip">{stats.pages} page{stats.pages !== 1 ? 's' : ''}</span>
        <span className="chip">{stats.paragraphs} paragraph{stats.paragraphs !== 1 ? 's' : ''}</span>
        <span className="chip">{stats.words} word{stats.words !== 1 ? 's' : ''}</span>
        <button
          type="button"
          className="btn"
          aria-pressed={plainMode}
          onClick={() => setPlainMode(!plainMode)}
        >
          {plainMode ? 'Paper' : 'Plain'}
        </button>
      </div>

      <article
        className={`document-container ${plainMode ? 'plain-mode' : 'paper-mode'}`}
        aria-label={fileName}
      >
        {!plainMode && <div className="fan-fold-wrap">
          {pages.map((pageBlocks, pageIndex) => (
            <div key={pageIndex} className="fan-fold-page">
              <div className="fan-fold-margin-left" />
              <div className="fan-fold-content">
                {payload.header && (
                  <header
                    className="running-header"
                    aria-label="Running header"
                  >
                    {expandHeader(payload.header, pageIndex + 1)}
                  </header>
                )}

                <div className="page-body">
                  {pageBlocks.map((block, blockIndex) => {
                    if (block.type === 'paragraph') {
                      return (
                        <p key={blockIndex}>
                          {block.runs.length === 0 ? (
                            <span className="sr-only">blank paragraph</span>
                          ) : (
                            block.runs.map((run, runIndex) => renderRun(run, runIndex))
                          )}
                        </p>
                      );
                    }
                    return null;
                  })}
                </div>

                {payload.footer && (
                  <footer
                    className="running-footer"
                    aria-label="Running footer"
                  >
                    {expandHeader(payload.footer, pageIndex + 1)}
                  </footer>
                )}
              </div>
              <div className="fan-fold-margin-right" />

              {pageIndex < pages.length - 1 && (
                <div className="page-break-separator" role="separator">
                  <span className="page-break-label">page {pageIndex + 2}</span>
                </div>
              )}
            </div>
          ))}
        </div>}

        {plainMode && <div className="plain-wrap">
          {payload.blocks.map((block, blockIndex) => {
            if (block.type === 'paragraph') {
              return (
                <p key={blockIndex}>
                  {block.runs.length === 0 ? (
                    <span className="sr-only">blank paragraph</span>
                  ) : (
                    block.runs.map((run, runIndex) => renderRun(run, runIndex))
                  )}
                </p>
              );
            }
            if (block.type === 'pageBreak') {
              return (
                <div key={blockIndex} className="plain-page-break" role="separator" />
              );
            }
            return null;
          })}
        </div>}
      </article>
    </div>
  );
}
