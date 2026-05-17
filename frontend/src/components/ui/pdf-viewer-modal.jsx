import { useState } from "react";
import { createPortal } from "react-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from "lucide-react";
import { Button } from "./button";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfViewerModal({ file, onClose }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? 0.5 : 1.0
  );

  if (!file) return null;

  const isPdf = !file.contentType.startsWith("image/");

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      style={{ pointerEvents: "auto" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl h-[90vh] mx-3 bg-white dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-slate-50 dark:bg-slate-800 flex-shrink-0">
          <p className="text-sm font-semibold truncate max-w-[50%]" data-testid="pdf-viewer-filename">{file.fileName}</p>
          <div className="flex items-center gap-1.5">
            {isPdf && numPages && (
              <>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))} data-testid="pdf-zoom-out">
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(scale * 100)}%</span>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setScale((s) => Math.min(s + 0.25, 3))} data-testid="pdf-zoom-in">
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
              </>
            )}
            <a href={file.url} download={file.fileName}>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" data-testid="pdf-download-btn">
                <Download className="w-3.5 h-3.5" />
                İndir
              </Button>
            </a>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0" data-testid="pdf-viewer-close">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 flex justify-center">
          {isPdf ? (
            <Document
              file={file.url}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              loading={
                <div className="flex items-center justify-center h-full py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              }
              error={
                <div className="flex items-center justify-center h-full py-20 text-sm text-red-500">
                  PDF yüklenemedi
                </div>
              }
            >
              <Page pageNumber={pageNumber} scale={scale} renderTextLayer={false} />
            </Document>
          ) : (
            <img src={file.url} alt={file.fileName} className="max-w-full max-h-full object-contain m-auto p-4" />
          )}
        </div>

        {/* Footer - Sayfa navigasyonu (sadece PDF ve çoklu sayfa için) */}
        {isPdf && numPages && numPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-4 py-2 border-t bg-slate-50 dark:bg-slate-800 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((p) => p - 1)}
              data-testid="pdf-prev-page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground" data-testid="pdf-page-info">
              {pageNumber} / {numPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              disabled={pageNumber >= numPages}
              onClick={() => setPageNumber((p) => p + 1)}
              data-testid="pdf-next-page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(node, document.body)
    : node;
}
