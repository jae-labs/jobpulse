import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Profile, UserDocumentMetadata } from "../types/job";
import { DEFAULT_PROFILE } from "../lib/defaultProfile";
import { queryKeys } from "../lib/queryKeys";
import { loadUserProfile, saveUserProfile, loadUserCVsMetadata, loadUserCoverLettersMetadata, saveUserCV, saveUserCoverLetter, deleteUserCV, deleteUserCoverLetter, saveUserAvatar, type DocumentUpload } from "../lib/userProfile";
import { withActiveUser } from './withActiveUser';

export function useProfileQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.profile(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<Profile> => withActiveUser(activeUserId, async () => {
      if (!activeUserId) return DEFAULT_PROFILE;
      const data = await loadUserProfile();
      return data || DEFAULT_PROFILE;
    }),
  });
}

export function useSaveProfileMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: queryKeys.profile(activeUserId),
    mutationFn: async (updatedProfile: Profile) => withActiveUser(activeUserId, async () => {
      if (!activeUserId) return { success: false, error: "Active user session required." };
      return saveUserProfile(updatedProfile, activeUserId);
    }),
    onSuccess: (res, updatedProfile) => {
      if (res.success) {
        queryClient.setQueryData(queryKeys.profile(activeUserId), updatedProfile);
        for (const queryKey of [queryKeys.scoringState(activeUserId), queryKeys.jobsPage(activeUserId),
          queryKeys.jobsSearchPage(activeUserId), queryKeys.overviewMetrics(activeUserId), queryKeys.scoringPreviewJobs(activeUserId)]) {
          void queryClient.invalidateQueries({ queryKey });
        }
        void queryClient.invalidateQueries({ predicate: query =>
          (query.queryKey[0] === 'job-by-id' || query.queryKey[0] === 'job-detail') && query.queryKey[2] === activeUserId });
      }
    },
  });
}

export function useUserCvsQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.userCvs(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<UserDocumentMetadata[]> => withActiveUser(activeUserId, async () => {
      if (!activeUserId) return [];
      return loadUserCVsMetadata();
    }),
  });
}

export function useUserCoverLettersQuery(activeUserId?: string | null, enabled = true) {

  return useQuery({
    queryKey: queryKeys.userCoverLetters(activeUserId),
    enabled: Boolean(supabase) && Boolean(activeUserId) && enabled,
    queryFn: async (): Promise<UserDocumentMetadata[]> => withActiveUser(activeUserId, async () => {
      if (!activeUserId) return [];
      return loadUserCoverLettersMetadata();
    }),
  });
}

export function useSaveCvMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DocumentUpload) => withActiveUser(activeUserId, async () => {
      if (!activeUserId) throw new Error("Active user session required");
      return saveUserCV(params.file, params.description, activeUserId);
    }),
    onSuccess: (res) => {
      if (res.success) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCvs(activeUserId) });
      }
    },
  });
}

export function useDeleteCvMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => withActiveUser(activeUserId, async () => {
      return deleteUserCV(id, activeUserId);
    }),
    onSuccess: (ok) => {
      if (ok) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCvs(activeUserId) });
      }
    },
  });
}

export function useSaveCoverLetterMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DocumentUpload) => withActiveUser(activeUserId, async () => {
      if (!activeUserId) throw new Error("Active user session required");
      return saveUserCoverLetter(params.file, params.description, activeUserId);
    }),
    onSuccess: (res) => {
      if (res.success) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCoverLetters(activeUserId) });
      }
    },
  });
}

export function useDeleteCoverLetterMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => withActiveUser(activeUserId, async () => {
      return deleteUserCoverLetter(id, activeUserId);
    }),
    onSuccess: (ok) => {
      if (ok) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.userCoverLetters(activeUserId) });
      }
    },
  });
}

export function useSaveAvatarMutation(activeUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => withActiveUser(activeUserId, async () => {
      if (!activeUserId) throw new Error("Active user session required");
      const result = await saveUserAvatar(file, activeUserId);
      if ("error" in result) throw new Error(result.error);
      return result.path;
    }),
    onSuccess: (path) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.avatarUrl(path) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(activeUserId) });
    },
  });
}
