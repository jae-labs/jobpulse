import { describe, it, expect } from 'vitest';
import { validateDocumentFile, validateAvatarFile } from './fileValidation';

describe('fileValidation', () => {
  describe('validateDocumentFile', () => {
    it('accepts valid PDF magic bytes (%PDF)', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const result = await validateDocumentFile(blob, 'resume.pdf');
      expect(result.isValid).toBe(true);
      expect(result.detectedType).toBe('application/pdf');
    });

    it('accepts valid legacy Word DOC magic bytes', async () => {
      const docBytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      const blob = new Blob([docBytes], { type: 'application/msword' });
      const result = await validateDocumentFile(blob, 'old_resume.doc');
      expect(result.isValid).toBe(true);
      expect(result.detectedType).toBe('application/msword');
    });

    it('accepts valid DOCX (PK ZIP) magic bytes', async () => {
      const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
      const blob = new Blob([docxBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const result = await validateDocumentFile(blob, 'modern_cv.docx');
      expect(result.isValid).toBe(true);
      expect(result.detectedType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('accepts valid plain text TXT files', async () => {
      const txt = 'Curriculum Vitae: Senior Software Engineer with 10 years experience';
      const blob = new Blob([txt], { type: 'text/plain' });
      const result = await validateDocumentFile(blob, 'resume.txt');
      expect(result.isValid).toBe(true);
      expect(result.detectedType).toBe('text/plain');
    });

    it('rejects disallowed file extensions', async () => {
      const blob = new Blob(['console.log(1)'], { type: 'application/javascript' });
      const result = await validateDocumentFile(blob, 'payload.js');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid file extension');
    });

    it('rejects executable / fake PDF file (magic byte spoofing)', async () => {
      // An executable (.exe) renamed as .pdf
      const fakePdf = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ header
      const blob = new Blob([fakePdf], { type: 'application/pdf' });
      const result = await validateDocumentFile(blob, 'malware.pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('File content does not match');
    });

    it('rejects TXT file containing script injection', async () => {
      const payload = '<script>alert("XSS")</script>';
      const blob = new Blob([payload], { type: 'text/plain' });
      const result = await validateDocumentFile(blob, 'exploit.txt');
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateAvatarFile', () => {
    it('accepts valid PNG magic bytes', async () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const blob = new Blob([pngBytes], { type: 'image/png' });
      const result = await validateAvatarFile(blob);
      expect(result.isValid).toBe(true);
      expect(result.detectedType).toBe('image/png');
    });

    it('accepts valid JPEG magic bytes', async () => {
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
      const result = await validateAvatarFile(blob);
      expect(result.isValid).toBe(true);
      expect(result.detectedType).toBe('image/jpeg');
    });

    it('accepts valid WebP magic bytes', async () => {
      const webpBytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x20, 0x00, 0x00, 0x00, // size
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      const blob = new Blob([webpBytes], { type: 'image/webp' });
      const result = await validateAvatarFile(blob);
      expect(result.isValid).toBe(true);
      expect(result.detectedType).toBe('image/webp');
    });

    it('rejects SVG or HTML masked as image', async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const result = await validateAvatarFile(blob);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid image format');
    });
  });
});
