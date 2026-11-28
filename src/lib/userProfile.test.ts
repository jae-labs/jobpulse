import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deleteUserCV,
  deleteUserCoverLetter,
  getUserCVSignedUrl,
  getUserCoverLetterSignedUrl,
  saveUserAvatar,
  saveUserCV,
  saveUserCoverLetter,
  saveUserProfile,
} from './userProfile';
import { supabase } from './supabase';
import { DEFAULT_PROFILE } from './defaultProfile';
import { embedProfile, profileContentHash } from './browserEmbedding';
import type { Session } from '@supabase/supabase-js';

vi.mock('./browserEmbedding', () => ({
  embedProfile: vi.fn(),
  profileContentHash: vi.fn(),
  PROFILE_EMBEDDING_MODEL_VERSION: 'all-MiniLM-L6-v2:384:v1',
}));

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

describe('profile scoring synchronization', () => {
  it('rejects a stale initiating account before writing the profile', async () => {
    vi.mocked(supabase!.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'account-b' } } as unknown as Session }, error: null,
    });
    expect(await saveUserProfile(DEFAULT_PROFILE, 'account-a')).toEqual({ success: false, error: 'Active account changed' });
    expect(supabase!.from).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase!.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'test-user-uuid' } } as unknown as Session }, error: null,
    });
    vi.mocked(profileContentHash).mockResolvedValue('a'.repeat(64));
    vi.mocked(embedProfile).mockResolvedValue(Array(384).fill(0));
  });

  it('updates weights without regenerating vectors or rescoring rules', async () => {
    const profile = { ...DEFAULT_PROFILE, scoring_rules: {
      ...DEFAULT_PROFILE.scoring_rules!,
      weights: { ...DEFAULT_PROFILE.scoring_rules!.weights!, semantic: 40 },
    } };
    const select = vi.fn();
    vi.mocked(supabase!.from).mockReturnValue({
      select,
      upsert: async () => ({ error: null }),
    } as unknown as ReturnType<NonNullable<typeof supabase>['from']>);
    const rpc = vi.fn().mockResolvedValue({ data: {
      content_hash: 'a'.repeat(64), model_version: 'all-MiniLM-L6-v2:384:v1',
    }, error: null });
    (supabase as unknown as { rpc: typeof rpc }).rpc = rpc;

    expect(await saveUserProfile(profile)).toEqual({ success: true });
    expect(embedProfile).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('rescore_user', expect.anything());
  });

  it('retries failed durable work when the embedding is already current', async () => {
    vi.mocked(supabase!.from).mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: DEFAULT_PROFILE, error: null }) }) }),
      upsert: async () => ({ error: null }),
    } as unknown as ReturnType<NonNullable<typeof supabase>['from']>);
    const rpc = vi.fn().mockImplementation(async (name: string) => ({
      data: name === 'get_profile_embedding_state' ? {
        content_hash: 'a'.repeat(64), model_version: 'all-MiniLM-L6-v2:384:v1', scoring_state: 'failed',
      } : 0, error: null,
    }));
    (supabase as unknown as { rpc: typeof rpc }).rpc = rpc;
    expect(await saveUserProfile(DEFAULT_PROFILE)).toEqual({ success: true });
    expect(embedProfile).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('rescore_user', { p_user_id: 'test-user-uuid' });
  });

  it('stores a changed vector without a redundant enqueue request', async () => {
    const profile = { ...DEFAULT_PROFILE, headline: 'Analyst' };
    vi.mocked(supabase!.from).mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
      upsert: async () => ({ error: null }),
    } as unknown as ReturnType<NonNullable<typeof supabase>['from']>);
    const rpc = vi.fn().mockImplementation(async (name: string) => ({
      data: name === 'get_profile_embedding_state' ? null : 1, error: null,
    }));
    (supabase as unknown as { rpc: typeof rpc }).rpc = rpc;

    expect(await saveUserProfile(profile)).toEqual({ success: true });
    expect(embedProfile).toHaveBeenCalledWith(profile);
    expect(rpc).toHaveBeenCalledWith('save_profile_embedding_guarded', expect.objectContaining({
      p_content_hash: 'a'.repeat(64), p_model_version: 'all-MiniLM-L6-v2:384:v1',
    }));
    expect(rpc).not.toHaveBeenCalledWith('rescore_user', expect.anything());
  });

  it('rejects a vector save if the account switches during inference', async () => {
    vi.mocked(supabase!.auth.getSession)
      .mockResolvedValueOnce({ data: { session: { user: { id: 'test-user-uuid' } } as unknown as Session }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'foreign-user-uuid' } } as unknown as Session }, error: null });
    vi.mocked(supabase!.from).mockReturnValue({ upsert: async () => ({ error: null }) } as unknown as ReturnType<NonNullable<typeof supabase>['from']>);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase as unknown as { rpc: typeof rpc }).rpc = rpc;

    expect(await saveUserProfile(DEFAULT_PROFILE)).toEqual({
      success: true, matchingPending: true,
    });
    expect(embedProfile).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('save_profile_embedding_guarded', expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('rescore_user', expect.anything());
  });

  it('rejects a stale vector if the saved profile changes during inference', async () => {
    vi.mocked(profileContentHash).mockResolvedValueOnce('a'.repeat(64)).mockResolvedValueOnce('b'.repeat(64));
    vi.mocked(supabase!.from).mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: DEFAULT_PROFILE, error: null }) }) }),
      upsert: async () => ({ error: null }),
    } as unknown as ReturnType<NonNullable<typeof supabase>['from']>);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase as unknown as { rpc: typeof rpc }).rpc = rpc;

    expect(await saveUserProfile(DEFAULT_PROFILE)).toEqual({
      success: true, matchingPending: true,
    });
    expect(rpc).not.toHaveBeenCalledWith('save_profile_embedding_guarded', expect.anything());
  });

  it('rechecks identity after the asynchronous profile verification', async () => {
    const foreignSession = { user: { id: 'foreign-user-uuid' } } as unknown as Session;
    vi.mocked(supabase!.from).mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => {
        vi.mocked(supabase!.auth.getSession).mockResolvedValue({ data: { session: foreignSession }, error: null });
        return { data: DEFAULT_PROFILE, error: null };
      } }) }),
      upsert: async () => ({ error: null }),
    } as unknown as ReturnType<NonNullable<typeof supabase>['from']>);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase as unknown as { rpc: typeof rpc }).rpc = rpc;

    expect(await saveUserProfile(DEFAULT_PROFILE)).toEqual({
      success: true, matchingPending: true,
    });
    expect(rpc).not.toHaveBeenCalledWith('save_profile_embedding_guarded', expect.anything());
  });
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

  describe('Specific document deletion', () => {
    it.each([0, -1, 1.5, Number.NaN])('rejects invalid document ID %s without querying storage or metadata', async (id) => {
      expect(await deleteUserCV(id)).toBe(false);
      expect(await deleteUserCoverLetter(id)).toBe(false);
      expect(await getUserCVSignedUrl(id)).toEqual({ error: 'Invalid document ID' });
      expect(supabase!.from).not.toHaveBeenCalled();
      expect(supabase!.storage.from).not.toHaveBeenCalled();
    });

    it('retains metadata if deleting the storage object fails', async () => {
      const deleteRecord = vi.fn();
      const lookup = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { storage_path: 'test-user-uuid/cv/resume.pdf' }, error: null,
              }),
            }),
          }),
        }),
        delete: deleteRecord,
      };
      vi.mocked(supabase!.from).mockReturnValue(lookup as unknown as ReturnType<NonNullable<typeof supabase>['from']>);
      vi.mocked(supabase!.storage.from).mockReturnValue({
        remove: vi.fn().mockResolvedValue({ error: { message: 'Storage unavailable' } }),
      } as unknown as ReturnType<NonNullable<typeof supabase>['storage']['from']>);
      expect(await deleteUserCV(42)).toBe(false);
      expect(deleteRecord).not.toHaveBeenCalled();
    });
  });

  describe('Shared document upload safety', () => {
    it.each([
      ['user_cvs', saveUserCV],
      ['user_cover_letters', saveUserCoverLetter],
    ] as const)('retains quota enforcement when %s cannot be counted', async (_table, save) => {
      const file = new File(['%PDF-1.4 document'], 'document.pdf', { type: 'application/pdf' });
      vi.mocked(supabase!.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: null, error: { message: 'Quota check unavailable' } }),
        }),
      } as unknown as ReturnType<NonNullable<typeof supabase>['from']>);
      expect(await save(file)).toEqual({ success: false, error: 'Quota check unavailable' });
      expect(supabase!.storage.from).not.toHaveBeenCalled();
    });

    it.each([
      ['user_cvs', 'cv', saveUserCV],
      ['user_cover_letters', 'cover-letter', saveUserCoverLetter],
    ] as const)('cleans up the authenticated reservation if %s upload fails', async (table, folder, save) => {
      const file = new File(['%PDF-1.4 document'], 'document.pdf', { type: 'application/pdf' });
      const insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 42 }, error: null }) }),
      });
      const cleanupUser = vi.fn().mockResolvedValue({ error: null });
      const cleanupId = vi.fn().mockReturnValue({ eq: cleanupUser });
      vi.mocked(supabase!.from).mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ count: 0, error: null }) }),
        insert,
        delete: vi.fn().mockReturnValue({ eq: cleanupId }),
      } as unknown as ReturnType<NonNullable<typeof supabase>['from']>);
      const upload = vi.fn().mockResolvedValue({ error: { message: 'Storage unavailable' } });
      vi.mocked(supabase!.storage.from).mockReturnValue({ upload } as unknown as ReturnType<NonNullable<typeof supabase>['storage']['from']>);
      expect(await save(file, 'My document')).toEqual({ success: false, error: 'Storage unavailable' });
      expect(supabase!.from).toHaveBeenCalledWith(table);
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'test-user-uuid', file_name: file.name, file_size: file.size,
        mime_type: 'application/pdf', description: 'My document',
      }));
      expect(upload.mock.calls[0][0]).toMatch(new RegExp(`^test-user-uuid/${folder}/`));
      expect(upload.mock.calls[0][1]).toBe(file);
      expect(cleanupId).toHaveBeenCalledWith('id', 42);
      expect(cleanupUser).toHaveBeenCalledWith('user_id', 'test-user-uuid');
    });
  });

  describe('Upload Magic Byte Security Validation', () => {
    it('rejects avatar upload with invalid magic bytes', async () => {
      const fakeImage = new File(['<svg><script>alert(1)</script></svg>'], 'avatar.png', {
        type: 'image/png',
      });
      const result = await saveUserAvatar(fakeImage);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Invalid image format');
      }
    });

    it('rejects CV upload with spoofed extension and invalid magic bytes', async () => {
      const fakePdf = new File(['MZ\x90\x00executable content'], 'resume.pdf', {
        type: 'application/pdf',
      });
      const result = await saveUserCV(fakePdf);
      expect(result.success).toBe(false);
      expect(result.error).toContain('File content does not match its expected document signature');
    });

    it('rejects cover letter upload with spoofed extension and invalid magic bytes', async () => {
      const fakeDocx = new File(['NOT_A_ZIP'], 'cover.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = await saveUserCoverLetter(
        fakeDocx
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('File content does not match its expected document signature');
    });
  });
});
