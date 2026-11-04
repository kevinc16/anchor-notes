import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { listPdfDocuments, removePdfDocument, type PdfDocumentMetadata } from '@/lib/pdf-documents';
import { pdfViewerUrl } from '@/lib/pdf-navigation';

export function SavedPdfs() {
  const [documents, setDocuments] = useState<PdfDocumentMetadata[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listPdfDocuments()
        .then((items) => {
          if (active) setDocuments(items);
        })
        .catch(() => {
          if (active) setError('Saved PDF storage is unavailable. Your notes remain available.');
        });
    };
    const channel = new BroadcastChannel('anchor-pdf-storage');
    channel.onmessage = refresh;
    window.addEventListener('anchor:pdf-storage', refresh);
    refresh();
    return () => {
      active = false;
      channel.close();
      window.removeEventListener('anchor:pdf-storage', refresh);
    };
  }, []);
  return (
    <section aria-label="Saved PDFs" className="mb-8 rounded-xl border border-line bg-card p-4">
      <h2 className="font-semibold">Saved PDFs</h2>
      <p className="my-2 text-sm text-muted">
        {documents.reduce((sum, item) => sum + item.size, 0).toLocaleString()} bytes kept on this device. Removing a PDF
        keeps its notes. JSON backups exclude PDF files.
      </p>
      {error && <p role="alert">{error}</p>}
      {!documents.length && <p className="text-sm text-muted">No PDFs kept on this device.</p>}
      {documents.map((item) => {
        const url = new URL(
          pdfViewerUrl(browser.runtime.getURL('/'), item.sourceUrl || `anchor-notes:pdf:sha256:${item.hash}`),
        );
        url.searchParams.set('document', item.hash);
        return (
          <div key={item.hash} className="my-2 flex flex-wrap items-center gap-3 text-sm">
            <a href={url.href} target="_blank" rel="noreferrer" className="font-semibold underline">
              {item.title}
            </a>
            <span>{item.size.toLocaleString()} bytes</span>
            <button
              type="button"
              className="rounded-lg border border-line px-2 py-1"
              title="Notes remain. Reopening may require downloading or selecting the PDF again."
              onClick={() => {
                void removePdfDocument(item.hash).catch(() => setError('Could not remove saved PDF. Try again.'));
              }}
            >
              Remove saved PDF
            </button>
          </div>
        );
      })}
    </section>
  );
}
