// src/lib/downloadPdf.ts
//
// Browser-side: turns the base64 PDF a route returned (see lib/welcomePdf)
// into a file download. The PDF is never stored on the server; this response
// is the only copy, so the UI offers the download straight away.
export function downloadBase64Pdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function pdfFilename(prefix: string, name: string) {
  return `${prefix}-${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'guide'}.pdf`;
}
