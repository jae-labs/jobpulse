import { getCurrentUserId } from "./userSession";
import { supabase } from "./supabase";
import { reportError } from "./logger";
import type {
  Profile,
  UserDocumentMetadata,
  ScoringRules,
} from "../types/job";
import { DEFAULT_PROFILE } from "./defaultProfile";
import { DEFAULT_SCORING_RULES } from "./scoringRules";
import { validateDocumentFile, validateAvatarFile } from "./fileValidation";
import type { Json, TablesInsert } from "../types/database.types";

const DOCUMENTS_BUCKET = "user-documents";
const AVATARS_BUCKET = "avatars";

/** Uploads user avatar to private storage. */
export async function saveUserAvatar(
  file: File,
): Promise<{ path: string } | { error: string }> {
  if (!supabase) return { error: "Database unavailable" };

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
export async function loadUserProfile(): Promise<Profile> {
  if (!supabase) {
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
          : DEFAULT_SCORING_RULES,
      avatar_url: data.avatar_url || "",
    };
  } catch (err: unknown) {
    reportError(err);
    throw err;
  }
}

/** Saves or updates a user profile in Supabase. */
export async function saveUserProfile(
  profile: Profile,
): Promise<{ success: boolean; error?: string }> {
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

type DocumentTable = "user_cvs" | "user_cover_letters";
type DocumentDownload = { signedUrl: string; fileName: string } | { error: string };

async function loadDocumentMetadata(table: DocumentTable): Promise<UserDocumentMetadata[]> {
  if (!supabase) return [];
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from(table)
    .select("id, user_id, file_name, file_size, mime_type, description, uploaded_at")
    .eq("user_id", userId)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => ({ ...row, description: row.description ?? undefined, uploaded_at: row.uploaded_at ?? "" }));
}

export function loadUserCVsMetadata(): Promise<UserDocumentMetadata[]> {
  return loadDocumentMetadata("user_cvs");
}

export function loadUserCoverLettersMetadata(): Promise<UserDocumentMetadata[]> {
  return loadDocumentMetadata("user_cover_letters");
}


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

type DocumentSaveResult = { success: boolean; error?: string };
export type DocumentUpload = { file: File; description?: string };

async function saveDocument(table: DocumentTable, file: File, description: string): Promise<DocumentSaveResult> {
  if (!supabase) return { success: false, error: "Database unavailable" };
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return { success: false, error: "File exceeds the 10MB size limit." };
  }
  const validation = await validateDocumentFile(file, file.name);
  if (!validation.isValid) {
    return { success: false, error: validation.error || "Invalid document format." };
  }
  const isCv = table === "user_cvs";
  const label = isCv ? "CV" : "Cover letter";
  try {
    const userId = await getCurrentUserId();
    const { count, error: countError } = await supabase.from(table)
      .select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (countError) return { success: false, error: countError.message };
    if ((count ?? 0) >= MAX_DOCUMENTS_PER_TYPE) {
      return { success: false, error: `Maximum limit of ${MAX_DOCUMENTS_PER_TYPE} ${isCv ? "CVs" : "cover letters"} reached. Please delete an existing ${isCv ? "CV" : "cover letter"} first.` };
    }
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${userId}/${isCv ? "cv" : "cover-letter"}/${crypto.randomUUID()}_${sanitizedName}`;
    const mimeType = validation.detectedType || file.type;
    const { data: reservation, error } = await supabase.from(table).insert({
      user_id: userId,
      file_name: file.name,
      file_size: file.size,
      mime_type: mimeType,
      storage_path: storagePath,
      description: description.trim(),
      uploaded_at: new Date().toISOString(),
    }).select("id").single();
    if (error) return { success: false, error: error.message };
    let uploadFailure: string | null = null;
    try {
      const { error: uploadError } = await supabase.storage.from(DOCUMENTS_BUCKET)
        .upload(storagePath, file, { contentType: mimeType, upsert: false });
      uploadFailure = uploadError?.message ?? null;
    } catch (uploadError) {
      uploadFailure = uploadError instanceof Error ? uploadError.message : `${label} upload failed`;
    }
    if (uploadFailure) {
      const { error: cleanupError } = await supabase.from(table).delete()
        .eq("id", reservation.id).eq("user_id", userId);
      if (cleanupError) reportError(new Error(`${label} reservation cleanup failed: ${cleanupError.message}`));
      return { success: false, error: uploadFailure };
    }
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : `Failed to save ${label.toLowerCase()}` };
  }
}

/** Upload metadata comes from the actual file; ownership comes from the session. */
export function saveUserCV(file: File, description = ""): Promise<DocumentSaveResult> {
  return saveDocument("user_cvs", file, description);
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

/** Generates a signed download URL for the authenticated user's specific cover letter. */
export function getUserCoverLetterSignedUrl(
  documentId: number,
  expiresInSeconds: number = 60,
): Promise<DocumentDownload> {
  return getDocumentSignedUrl("user_cover_letters", documentId, expiresInSeconds, "Cover letter not found");
}

export function saveUserCoverLetter(file: File, description = ""): Promise<DocumentSaveResult> {
  return saveDocument("user_cover_letters", file, description);
}

/** Deletes the authenticated user's specific cover letter and its storage object. */
export function deleteUserCoverLetter(documentId: number): Promise<boolean> {
  return deleteDocument("user_cover_letters", documentId);
}
