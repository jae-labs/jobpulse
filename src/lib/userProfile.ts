import { getCurrentUserId } from "./userSession";
import { supabase } from "./supabase";
import { reportError } from "./logger";
import type {
  Profile,
  UserCVMetadata,
  UserCoverLetterMetadata,
  ScoringRules,
} from "../types/job";
import { DEFAULT_PROFILE } from "./defaultProfile";
import { validateDocumentFile, validateAvatarFile } from "./fileValidation";
import type { Json, TablesInsert } from "../types/database.types";

const DOCUMENTS_BUCKET = "user-documents";
const AVATARS_BUCKET = "avatars";

/** Uploads user avatar to private storage. */
export async function saveUserAvatar(
  email: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase) return { error: "Database unavailable" };

  if (file.size > 2 * 1024 * 1024) {
    return { error: "Avatar exceeds the 2MB size limit." };
  }

  const validation = await validateAvatarFile(file);
  if (!validation.isValid) {
    return { error: validation.error || "Invalid avatar image file." };
  }

  try {
    const storagePath = `${await getCurrentUserId()}/avatar`;
    const { error: uploadError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: true });
    if (uploadError) return { error: uploadError.message };

    return { path: storagePath };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Avatar upload failed" };
  }
}

/** Loads user profile from Supabase, falling back to DEFAULT_PROFILE. */
export async function loadUserProfile(email?: string | null): Promise<Profile> {
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !supabase) {
    return DEFAULT_PROFILE;
  }

  try {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn(
        "Failed to fetch user profile from Supabase:",
        error.message,
      );
      throw new Error(error.message);
    }

    if (!data) {
      return DEFAULT_PROFILE;
    }

    return {
      name:
        data.name ||
        (data.first_name && data.last_name
          ? `${data.first_name} ${data.last_name}`
          : ""),
      first_name: data.first_name || "",
      last_name: data.last_name || "",
      phone: data.phone || "",
      linkedin_url: data.linkedin_url || "",
      work_authorization: data.work_authorization || "",
      gender: data.gender || "",
      headline: data.headline || "",
      current_role: data.current_role || "",
      experience_level: data.experience_level || "",
      location: data.location || "",
      target_roles: Array.isArray(data.target_roles) ? data.target_roles : [],
      target_locations: Array.isArray(data.target_locations)
        ? data.target_locations
        : [],
      work_mode: data.work_mode || "",
      salary_min: Number(data.salary_min) || 0,
      employment: data.employment || "",
      education: data.education || "",
      certifications: data.certifications || "",
      languages: Array.isArray(data.languages) ? data.languages : [],
      tools_software: Array.isArray(data.tools_software)
        ? data.tools_software
        : [],
      summary: data.summary || "",
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      scoring_rules:
        data.scoring_rules &&
        typeof data.scoring_rules === 'object' &&
        Object.keys(data.scoring_rules).length > 0
          ? (data.scoring_rules as unknown as ScoringRules)
          : undefined,
      avatar_url: data.avatar_url || "",
    };
  } catch (err: unknown) {
    reportError(err);
    throw err;
  }
}

/** Saves or updates a user profile in Supabase. */
export async function saveUserProfile(
  email: string,
  profile: Profile,
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, error: "Email is required to save profile." };
  }

  if (!supabase) {
    return { success: false, error: "Database connection not initialized." };
  }

  const fullName =
    profile.first_name || profile.last_name
      ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
      : profile.name || "";

  try {
    const userId = await getCurrentUserId();
    const payload: TablesInsert<"user_profiles"> = {
      user_id: userId,
      name: fullName,
      first_name: profile.first_name || "",
      last_name: profile.last_name || "",
      phone: profile.phone || "",
      linkedin_url: profile.linkedin_url || "",
      work_authorization: profile.work_authorization || "",
      gender: profile.gender || "",
      headline: profile.headline || "",
      current_role: profile.current_role || "",
      experience_level: profile.experience_level || "",
      location: profile.location || "",
      target_roles: profile.target_roles || [],
      target_locations: profile.target_locations || [],
      work_mode: profile.work_mode || "",
      salary_min: profile.salary_min ?? 0,
      employment: profile.employment || "",
      education: profile.education || "",
      certifications: profile.certifications || "",
      languages: profile.languages || [],
      tools_software: profile.tools_software || [],
      summary: profile.summary || "",
      keywords: profile.keywords || [],
      avatar_url: profile.avatar_url || "",
      updated_at: new Date().toISOString(),
    };


    if (profile.scoring_rules) {
      payload.scoring_rules = profile.scoring_rules as unknown as Json;
    }

    const { error } = await supabase.from("user_profiles").upsert(payload, {
      onConflict: "user_id",
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMessage || "Failed to save profile" };
  }
}

/** Loads all user CV metadata records. */
export async function loadUserCVsMetadata(
  email?: string | null,
): Promise<UserCVMetadata[]> {
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !supabase) return [];

  try {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from("user_cvs")
      .select("id, user_id, file_name, file_size, mime_type, description, uploaded_at")
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: false });

    if (error) throw new Error(error.message);
    if (!data) return [];
    return data as UserCVMetadata[];
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to load CV metadata");
  }
}

type DocumentTable = "user_cvs" | "user_cover_letters";
type DocumentDownload = { signedUrl: string; fileName: string } | { error: string };

async function getDocumentSignedUrl(
  table: DocumentTable,
  documentId: number,
  expiresInSeconds: number,
  notFoundMessage: string,
): Promise<DocumentDownload> {
  if (!Number.isSafeInteger(documentId) || documentId <= 0) {
    return { error: "Invalid document ID" };
  }
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    return { error: "Invalid download expiry" };
  }
  if (!supabase) return { error: "Database unavailable" };

  try {
    const userId = await getCurrentUserId();
    const { data: row, error: rowError } = await supabase
      .from(table)
      .select("file_name, storage_path")
      .eq("user_id", userId)
      .eq("id", documentId)
      .maybeSingle();
    if (rowError || !row?.storage_path) {
      return { error: rowError?.message || notFoundMessage };
    }

    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(row.storage_path, expiresInSeconds, { download: row.file_name });
    if (error || !data?.signedUrl) {
      return { error: error?.message || "Failed to generate download URL" };
    }
    return { signedUrl: data.signedUrl, fileName: row.file_name };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to generate download URL" };
  }
}

/** Generates a signed download URL for the authenticated user's specific CV. */
export function getUserCVSignedUrl(
  documentId: number,
  expiresInSeconds: number = 60,
): Promise<DocumentDownload> {
  return getDocumentSignedUrl("user_cvs", documentId, expiresInSeconds, "CV not found");
}

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_DOCUMENTS_PER_TYPE = 10;

/** Uploads a user CV to storage and records metadata. */
export async function saveUserCV(
  email: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  fileData: File | Blob,
  description: string = "",
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase)
    return { success: false, error: "Database unavailable" };

  if (fileSize > MAX_DOCUMENT_SIZE_BYTES) {
    return { success: false, error: "File exceeds the 10MB size limit." };
  }

  const validation = await validateDocumentFile(fileData, fileName);
  if (!validation.isValid) {
    return { success: false, error: validation.error || "Invalid document format." };
  }

  try {
    const userId = await getCurrentUserId();
    // Check quota before attempting storage upload
    const { count, error: countErr } = await supabase
      .from("user_cvs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (!countErr && (count || 0) >= MAX_DOCUMENTS_PER_TYPE) {
      return {
        success: false,
        error: `Maximum limit of ${MAX_DOCUMENTS_PER_TYPE} CVs reached. Please delete an existing CV first.`,
      };
    }

    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${userId}/cv/${crypto.randomUUID()}_${sanitizedFileName}`;
    const uploadBody = fileData;
    const { data: reservation, error } = await supabase.from("user_cvs").insert({
      user_id: userId,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      storage_path: storagePath,
      description: description.trim(),
      uploaded_at: new Date().toISOString(),
    }).select("id").single();
    if (error) return { success: false, error: error.message };

    let uploadFailure: string | null = null;
    try {
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(storagePath, uploadBody, { contentType: mimeType, upsert: false });
      uploadFailure = uploadError?.message ?? null;
    } catch (uploadError) {
      uploadFailure = uploadError instanceof Error ? uploadError.message : "CV upload failed";
    }
    if (uploadFailure) {
      const { error: cleanupError } = await supabase.from("user_cvs").delete().eq("id", reservation.id).eq("user_id", userId);
      if (cleanupError) reportError(new Error(`CV reservation cleanup failed: ${cleanupError.message}`));
      return { success: false, error: uploadFailure };
    }
    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMessage || "Failed to save CV" };
  }
}

async function deleteDocument(table: DocumentTable, documentId: number): Promise<boolean> {
  if (!supabase || !Number.isSafeInteger(documentId) || documentId <= 0) return false;

  try {
    const userId = await getCurrentUserId();
    const { data: row, error: lookupError } = await supabase
      .from(table)
      .select("storage_path")
      .eq("user_id", userId)
      .eq("id", documentId)
      .maybeSingle();
    if (lookupError || !row) return false;

    // Storage ownership depends on metadata: remove the object before its record.
    if (row.storage_path) {
      const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([row.storage_path]);
      if (error) return false;
    }
    const { error } = await supabase.from(table).delete()
      .eq("user_id", userId).eq("id", documentId);
    return !error;
  } catch {
    return false;
  }
}

/** Deletes the authenticated user's specific CV and its storage object. */
export function deleteUserCV(documentId: number): Promise<boolean> {
  return deleteDocument("user_cvs", documentId);
}

/** Loads all user Cover Letter metadata records. */
export async function loadUserCoverLettersMetadata(
  email?: string | null,
): Promise<UserCoverLetterMetadata[]> {
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !supabase) return [];

  try {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from("user_cover_letters")
      .select("id, user_id, file_name, file_size, mime_type, description, uploaded_at")
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: false });

    if (error) throw new Error(error.message);
    if (!data) return [];
    return data as UserCoverLetterMetadata[];
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to load cover-letter metadata");
  }
}

/** Generates a signed download URL for the authenticated user's specific cover letter. */
export function getUserCoverLetterSignedUrl(
  documentId: number,
  expiresInSeconds: number = 60,
): Promise<DocumentDownload> {
  return getDocumentSignedUrl("user_cover_letters", documentId, expiresInSeconds, "Cover letter not found");
}

/** Uploads a cover letter to storage and records metadata. */
export async function saveUserCoverLetter(
  email: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  fileData: File | Blob,
  description: string = "",
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase)
    return { success: false, error: "Database unavailable" };

  if (fileSize > MAX_DOCUMENT_SIZE_BYTES) {
    return { success: false, error: "File exceeds the 10MB size limit." };
  }

  const validation = await validateDocumentFile(fileData, fileName);
  if (!validation.isValid) {
    return { success: false, error: validation.error || "Invalid document format." };
  }

  try {
    const userId = await getCurrentUserId();
    // Check quota before attempting storage upload
    const { count, error: countErr } = await supabase
      .from("user_cover_letters")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (!countErr && (count || 0) >= MAX_DOCUMENTS_PER_TYPE) {
      return {
        success: false,
        error: `Maximum limit of ${MAX_DOCUMENTS_PER_TYPE} cover letters reached. Please delete an existing cover letter first.`,
      };
    }

    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${userId}/cover-letter/${crypto.randomUUID()}_${sanitizedFileName}`;
    const uploadBody = fileData;
    const { data: reservation, error } = await supabase.from("user_cover_letters").insert({
      user_id: userId,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      storage_path: storagePath,
      description: description.trim(),
      uploaded_at: new Date().toISOString(),
    }).select("id").single();
    if (error) return { success: false, error: error.message };

    let uploadFailure: string | null = null;
    try {
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(storagePath, uploadBody, { contentType: mimeType, upsert: false });
      uploadFailure = uploadError?.message ?? null;
    } catch (uploadError) {
      uploadFailure = uploadError instanceof Error ? uploadError.message : "Cover letter upload failed";
    }
    if (uploadFailure) {
      const { error: cleanupError } = await supabase.from("user_cover_letters").delete().eq("id", reservation.id).eq("user_id", userId);
      if (cleanupError) reportError(new Error(`Cover-letter reservation cleanup failed: ${cleanupError.message}`));
      return { success: false, error: uploadFailure };
    }
    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: errorMessage || "Failed to save cover letter",
    };
  }
}

/** Deletes the authenticated user's specific cover letter and its storage object. */
export function deleteUserCoverLetter(documentId: number): Promise<boolean> {
  return deleteDocument("user_cover_letters", documentId);
}
