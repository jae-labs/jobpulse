export interface FileValidationResult {
  isValid: boolean;
  detectedType?: string;
  error?: string;
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, idx) => bytes[idx] === byte);
}

function isValidPlainText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
      return false;
    }
  }
  const sample = new TextDecoder('utf-8', { fatal: false }).decode(bytes).toLowerCase();
  if (
    sample.includes('<script') ||
    sample.includes('<html') ||
    sample.includes('<!doctype') ||
    sample.includes('<svg')
  ) {
    return false;
  }
  return true;
}

export async function validateDocumentFile(
  file: File | Blob,
  fileName: string
): Promise<FileValidationResult> {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const allowedExtensions = ['pdf', 'doc', 'docx', 'txt'];

  if (!allowedExtensions.includes(extension)) {
    return {
      isValid: false,
      error: `Invalid file extension .${extension}. Allowed: .pdf, .doc, .docx, .txt`,
    };
  }

  const sampleSize = 512;
  const slice = file.slice(0, sampleSize);
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length === 0) {
    return { isValid: false, error: 'Empty file cannot be uploaded' };
  }

  if (hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return { isValid: true, detectedType: 'application/pdf' };
  }

  if (hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { isValid: true, detectedType: 'application/msword' };
  }

  if (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return {
      isValid: true,
      detectedType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  if (extension === 'txt' && isValidPlainText(bytes)) {
    return { isValid: true, detectedType: 'text/plain' };
  }

  return {
    isValid: false,
    error: 'File content does not match its expected document signature (magic bytes mismatch).',
  };
}

export async function validateAvatarFile(
  file: File | Blob
): Promise<FileValidationResult> {
  const sampleSize = 32;
  const slice = file.slice(0, sampleSize);
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length === 0) {
    return { isValid: false, error: 'Empty image file' };
  }

  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
    return { isValid: true, detectedType: 'image/jpeg' };
  }

  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { isValid: true, detectedType: 'image/png' };
  }

  if (
    hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return { isValid: true, detectedType: 'image/gif' };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50   // WEBP
  ) {
    return { isValid: true, detectedType: 'image/webp' };
  }

  return {
    isValid: false,
    error: 'Invalid image format. Only JPEG, PNG, GIF, and WebP images are permitted.',
  };
}
