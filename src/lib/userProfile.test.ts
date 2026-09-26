import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getUserCVSignedUrl,
  getUserCoverLetterSignedUrl,
  saveUserAvatar,
  saveUserCV,
  saveUserCoverLetter,
} from './userProfile';
import { supabase } from './supabase';

vi.mock('./supabase', () => {
  const getSessionMock = vi.fn();
  const fromMock = vi.fn();
  const storageFromMock = vi.fn();

  return {
    supabase: {
      auth: {
        getSession: getSessionMock,
      },
      from: fromMock,
      storage: {
        from: storageFromMock,
      },
    },
  };
});

describe('Document Streaming Signed URLs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase!.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: { id: 'test-user-uuid' },
        } as any,
      },
      error: null,
    });
  });

  describe('getUserCVSignedUrl', () => {
    it('generates a streaming signed URL with download disposition for a CV', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          file_name: 'Alex_Mercer_Resume.pdf',
          storage_path: 'test-user-uuid/cv/resume.pdf',
        },
        error: null,
      });

      const mockEqId = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEqUserId = vi.fn().mockReturnValue({ eq: mockEqId });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqUserId });

      vi.mocked(supabase!.from).mockReturnValue({
        select: mockSelect,
      } as any);

      const mockCreateSignedUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/user-documents/resume.pdf?token=abc' },
        error: null,
      });

      vi.mocked(supabase!.storage.from).mockReturnValue({
        createSignedUrl: mockCreateSignedUrl,
      } as any);

      const result = await getUserCVSignedUrl(42);

      expect(supabase!.from).toHaveBeenCalledWith('user_cvs');
      expect(mockSelect).toHaveBeenCalledWith('file_name, storage_path');
      expect(mockEqUserId).toHaveBeenCalledWith('user_id', 'test-user-uuid');
      expect(mockEqId).toHaveBeenCalledWith('id', 42);

      expect(supabase!.storage.from).toHaveBeenCalledWith('user-documents');
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        'test-user-uuid/cv/resume.pdf',
        60,
        { download: 'Alex_Mercer_Resume.pdf' },
      );

      expect(result).toEqual({
        signedUrl: 'https://example.supabase.co/storage/v1/object/sign/user-documents/resume.pdf?token=abc',
        fileName: 'Alex_Mercer_Resume.pdf',
      });
    });

    it('returns an error if the CV record does not exist', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      vi.mocked(supabase!.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
          }),
        }),
      } as any);

      const result = await getUserCVSignedUrl(999);
      expect(result).toEqual({ error: 'CV not found' });
    });

    it('returns an error if Storage createSignedUrl fails', async () => {
      vi.mocked(supabase!.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  file_name: 'Resume.pdf',
                  storage_path: 'test-user-uuid/cv/fail.pdf',
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      vi.mocked(supabase!.storage.from).mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Object not found in storage' },
        }),
      } as any);

      const result = await getUserCVSignedUrl(1);
      expect(result).toEqual({ error: 'Object not found in storage' });
    });
  });

  describe('getUserCoverLetterSignedUrl', () => {
    it('generates a streaming signed URL with download disposition for a cover letter', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          file_name: 'Cover_Letter.pdf',
          storage_path: 'test-user-uuid/cover-letter/cl.pdf',
        },
        error: null,
      });

      vi.mocked(supabase!.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
          }),
        }),
      } as any);

      const mockCreateSignedUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/user-documents/cl.pdf?token=xyz' },
        error: null,
      });

      vi.mocked(supabase!.storage.from).mockReturnValue({
        createSignedUrl: mockCreateSignedUrl,
      } as any);

      const result = await getUserCoverLetterSignedUrl(10);

      expect(supabase!.from).toHaveBeenCalledWith('user_cover_letters');
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        'test-user-uuid/cover-letter/cl.pdf',
        60,
        { download: 'Cover_Letter.pdf' },
      );

      expect(result).toEqual({
        signedUrl: 'https://example.supabase.co/storage/v1/object/sign/user-documents/cl.pdf?token=xyz',
        fileName: 'Cover_Letter.pdf',
      });
    });
  });

  describe('Upload Magic Byte Security Validation', () => {
    it('rejects avatar upload with invalid magic bytes', async () => {
      const fakeImage = new File(['<svg><script>alert(1)</script></svg>'], 'avatar.png', {
        type: 'image/png',
      });
      const result = await saveUserAvatar('user@example.com', fakeImage);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Invalid image format');
      }
    });

    it('rejects CV upload with spoofed extension and invalid magic bytes', async () => {
      const fakePdf = new File(['MZ\x90\x00executable content'], 'resume.pdf', {
        type: 'application/pdf',
      });
      const result = await saveUserCV('user@example.com', 'resume.pdf', fakePdf.size, fakePdf.type, fakePdf);
      expect(result.success).toBe(false);
      expect(result.error).toContain('File content does not match its expected document signature');
    });

    it('rejects cover letter upload with spoofed extension and invalid magic bytes', async () => {
      const fakeDocx = new File(['NOT_A_ZIP'], 'cover.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = await saveUserCoverLetter(
        'user@example.com',
        'cover.docx',
        fakeDocx.size,
        fakeDocx.type,
        fakeDocx
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('File content does not match its expected document signature');
    });
  });
});
