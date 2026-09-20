// src/lib/welcomePdf/qr.ts
//
// QR codes are drawn as vector squares (crisp at any print size, no image
// embedding). The matrix comes from the `qrcode` package.
import QRCode from 'qrcode';
import type { PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';

export interface QrMatrix {
  size: number;
  get: (row: number, col: number) => boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const qr = (QRCode as any).create(text, { errorCorrectionLevel: 'M' });
  const size: number = qr.modules.size;
  const data: ArrayLike<number> = qr.modules.data;
  return { size, get: (r, c) => Boolean(data[r * size + c]) };
}

/** Draws the matrix with its lower-left corner at (x, y) in PDF coordinates, `side` points wide. */
export function drawQr(page: PDFPage, m: QrMatrix, x: number, y: number, side: number) {
  const cell = side / m.size;
  const ink = rgb(0.078, 0.137, 0.109);
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (!m.get(r, c)) continue;
      // +0.25 overlap hides hairline seams between neighbouring squares in some viewers
      page.drawRectangle({ x: x + c * cell, y: y + (m.size - 1 - r) * cell, width: cell + 0.25, height: cell + 0.25, color: ink });
    }
  }
}
