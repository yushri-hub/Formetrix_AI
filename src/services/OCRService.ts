// src/services/OCRService.ts

import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export class OCRService {
  private static worker: Tesseract.Worker | null = null;

  static async init(onProgress?: (progress: number) => void): Promise<void> {
    if (this.worker) return;

    try {
      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress(m.progress * 100);
          }
        },
      });
    } catch (error) {
      console.error('OCR init failed:', error);
      this.worker = null;
      throw new Error('Failed to initialize OCR engine');
    }
  }

  static async processImage(file: File, onProgress?: (progress: number) => void): Promise<string> {
    await this.init(onProgress);

    if (!this.worker) {
      throw new Error('OCR worker not available');
    }

    try {
      const { data: { text } } = await this.worker.recognize(file);

      if (!text || text.trim().length === 0) {
        throw new Error('No text could be extracted from this image');
      }

      return text.trim();
    } catch (error) {
      throw new Error(`Image processing failed: ${error}`);
    }
  }

  static async processPDF(file: File, onProgress?: (progress: number) => void): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;

      const textPages: string[] = [];
      let hasTextContent = false;

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');

        if (pageText.trim().length > 20) {
          textPages.push(pageText);
          hasTextContent = true;
        } else {
          // Fall back to OCR for this page
          const canvas = document.createElement('canvas');
          const viewport = page.getViewport({ scale: 2.0 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ 
              canvasContext: ctx, 
              viewport: viewport,
              canvas: canvas
            }).promise;

            const blob = await new Promise<Blob>((resolve) =>
              canvas.toBlob((b) => resolve(b!), 'image/png')
            );
            const imageFile = new File([blob], 'page.png', { type: 'image/png' });
            const text = await this.processImage(imageFile);
            if (text && text.trim().length > 0) {
              textPages.push(text.trim());
              hasTextContent = true;
            }
          }
        }

        if (onProgress) {
          onProgress((i / totalPages) * 100);
        }
      }

      if (!hasTextContent) {
        throw new Error('No text content could be extracted from this PDF');
      }

      return textPages.join('\n\n');
    } catch (error) {
      throw new Error(`PDF processing failed: ${error}`);
    }
  }

  static cleanup(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}