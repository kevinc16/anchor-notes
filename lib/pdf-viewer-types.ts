// Only the pinned upstream viewer APIs the integration consumes.
export interface PdfDocument {
  numPages: number;
  getPage(page: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
}
export interface PdfApplication {
  initializedPromise: Promise<void>;
  pdfLoadingTask?: { onPassword: (callback: (value: Error) => void) => void; destroy(): Promise<void> };
  eventBus: {
    on(name: string, callback: (event: { pageNumber?: number }) => void): void;
    off(name: string, callback: (event: { pageNumber?: number }) => void): void;
  };
  pdfDocument?: PdfDocument;
  pdfViewer: {
    currentPageNumber: number;
    currentScaleValue: string;
    pagesRotation: number;
    scrollPageIntoView(options: { pageNumber: number }): void;
  };
  open(options: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}
export interface PdfWindow extends Window {
  PDFViewerApplication: PdfApplication;
  PDFViewerApplicationOptions: { setAll(options: Record<string, unknown>): void };
}
