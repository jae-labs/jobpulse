import { supabase } from "./supabase";
import { reportError } from "./logger";
import type {
  Profile,
  UserCVMetadata,
  UserCoverLetterMetadata,
  ScoringRules,
} from "../types/job";
import { DEFAULT_PROFILE } from "./defaultProfile";

const DOCUMENTS_BUCKET = "user-documents";
const AVATARS_BUCKET = "avatars";

async function getCurrentUserId(): Promise<string> {
  if (!supabase) throw new Error("Database unavailable");
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user.id) throw new Error("Active user session required");
  return session.user.id;
}

/**
 * Uploads a user avatar image to private Supabase Storage and returns its path.
 * Replaces any existing avatar for the user.
 */
export async function saveUserAvatar(
  email: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase) return { error: "Database unavailable" };

  if (file.size > 2 * 1024 * 1024) {
    return { error: "Avatar exceeds the 2MB size limit." };
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

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Loads the user profile for the given email from Supabase.
 * If not found, falls back to DEFAULT_PROFILE.
 */
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
      minimum_salary:
        Number(data.salary_min) || Number(data.minimum_salary) || 0,
      salary_min: Number(data.salary_min) || Number(data.minimum_salary) || 0,
      employment: data.employment || "",
      education: data.education || data.education_details || data.highest_education || "",
      certifications: data.certifications || "",
      languages: Array.isArray(data.languages) ? data.languages : [],
      tools_software: Array.isArray(data.tools_software)
        ? data.tools_software
        : [],
      summary: data.summary || "",
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      scoring_rules: (data.scoring_rules as unknown as ScoringRules | null) || undefined,
      avatar_url: data.avatar_url || "",
    };
  } catch (err: unknown) {
    reportError(err);
    throw err;
  }
}

/**
 * Saves or updates a user profile on Supabase.
 */
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
    const payload: Record<string, any> = {
      user_id: userId,
      user_email: cleanEmail,
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
      minimum_salary: profile.salary_min || profile.minimum_salary || 0,
      salary_min: profile.salary_min || profile.minimum_salary || 0,
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
      payload.scoring_rules = profile.scoring_rules;
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

/**
 * Loads all user CV metadata records.
 */
export async function loadUserCVsMetadata(
  email?: string | null,
): Promise<UserCVMetadata[]> {
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !supabase) return [];

  try {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from("user_cvs")
      .select("id, user_email, file_name, file_size, mime_type, description, uploaded_at")
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: false });

    if (error) throw new Error(error.message);
    if (!data) return [];
    return data as UserCVMetadata[];
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to load CV metadata");
  }
}

/**
 * Downloads a user CV as a raw Blob from Supabase Storage.
 */
export async function downloadUserCVBlob(
  emailOrId: string | number,
  cvId?: number,
): Promise<{ blob: Blob; fileName: string; mimeType: string } | null> {
  if (!supabase) return null;

  try {
    const userId = await getCurrentUserId();
    let query = supabase
      .from("user_cvs")
      .select("file_name, mime_type, storage_path")
      .eq("user_id", userId);

    if (typeof emailOrId === "number") {
      query = query.eq("id", emailOrId);
    } else {
      const cleanEmail = emailOrId.trim().toLowerCase();
      if (!cleanEmail) return null;
      if (cvId) {
        query = query.eq("id", cvId);
      } else {
        query = query.order("uploaded_at", { ascending: false }).limit(1);
      }
    }

    const { data: row, error: rowError } = await query.maybeSingle();

    if (rowError || !row || !row.storage_path) return null;

    const { data: blob, error: downloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(row.storage_path);

    if (downloadError || !blob) return null;

    return {
      blob,
      fileName: row.file_name,
      mimeType: row.mime_type || "application/pdf",
    };
  } catch {
    return null;
  }
}

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_DOCUMENTS_PER_TYPE = 10;

/**
 * Uploads a user CV document to Supabase Storage and records its metadata.
 * Supports native File/Blob or legacy base64 data strings.
 */
export async function saveUserCV(
  email: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  fileData: File | Blob | string,
  description: string = "",
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase)
    return { success: false, error: "Database unavailable" };

  if (fileSize > MAX_DOCUMENT_SIZE_BYTES) {
    return { success: false, error: "File exceeds the 10MB size limit." };
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
    const uploadBody = typeof fileData === "string" ? base64ToBytes(fileData) : fileData;
    const { data: reservation, error } = await supabase.from("user_cvs").insert({
      user_id: userId,
      user_email: cleanEmail,
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

/**
 * Deletes a specific user CV (or all) from Supabase.
 */
export async function deleteUserCV(
  emailOrId: string | number,
  cvId?: number,
): Promise<boolean> {
  if (!supabase) return false;

  try {
    const userId = await getCurrentUserId();
    let query = supabase.from("user_cvs").select("storage_path").eq("user_id", userId);

    if (typeof emailOrId === "number") {
      query = query.eq("id", emailOrId);
    } else {
      const cleanEmail = emailOrId.trim().toLowerCase();
      if (!cleanEmail) return false;
      if (cvId) query = query.eq("id", cvId);
    }

    const { data: rows, error: lookupError } = await query;
    if (lookupError) return false;

    if (rows && rows.length > 0) {
      const paths = (rows as Array<{ storage_path?: string | null }>)
        .map((r) => r.storage_path)
        .filter((p): p is string => Boolean(p));
      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
        if (storageError) return false;
      }
    }

    let delQuery = supabase.from("user_cvs").delete().eq("user_id", userId);

    if (typeof emailOrId === "number") {
      delQuery = delQuery.eq("id", emailOrId);
    } else {
      if (cvId) delQuery = delQuery.eq("id", cvId);
    }

    const { error } = await delQuery;
    return !error;
  } catch {
    return false;
  }
}

/**
 * Loads all user Cover Letter metadata records.
 */
export async function loadUserCoverLettersMetadata(
  email?: string | null,
): Promise<UserCoverLetterMetadata[]> {
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !supabase) return [];

  try {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from("user_cover_letters")
      .select("id, user_email, file_name, file_size, mime_type, description, uploaded_at")
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: false });

    if (error) throw new Error(error.message);
    if (!data) return [];
    return data as UserCoverLetterMetadata[];
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to load cover-letter metadata");
  }
}

/**
 * Downloads a user Cover Letter as a raw Blob from Supabase Storage.
 */
export async function downloadUserCoverLetterBlob(
  emailOrId: string | number,
  coverLetterId?: number,
): Promise<{ blob: Blob; fileName: string; mimeType: string } | null> {
  if (!supabase) return null;

  try {
    const userId = await getCurrentUserId();
    let query = supabase
      .from("user_cover_letters")
      .select("file_name, mime_type, storage_path")
      .eq("user_id", userId);

    if (typeof emailOrId === "number") {
      query = query.eq("id", emailOrId);
    } else {
      const cleanEmail = emailOrId.trim().toLowerCase();
      if (!cleanEmail) return null;
      if (coverLetterId) {
        query = query.eq("id", coverLetterId);
      } else {
        query = query.order("uploaded_at", { ascending: false }).limit(1);
      }
    }

    const { data: row, error: rowError } = await query.maybeSingle();

    if (rowError || !row || !row.storage_path) return null;

    const { data: blob, error: downloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(row.storage_path);

    if (downloadError || !blob) return null;

    return {
      blob,
      fileName: row.file_name,
      mimeType: row.mime_type || "application/pdf",
    };
  } catch {
    return null;
  }
}

/**
 * Uploads a user Cover Letter document to Supabase Storage.
 * Supports native File/Blob or legacy base64 data strings.
 */
export async function saveUserCoverLetter(
  email: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  fileData: File | Blob | string,
  description: string = "",
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase)
    return { success: false, error: "Database unavailable" };

  if (fileSize > MAX_DOCUMENT_SIZE_BYTES) {
    return { success: false, error: "File exceeds the 10MB size limit." };
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
    const uploadBody = typeof fileData === "string" ? base64ToBytes(fileData) : fileData;
    const { data: reservation, error } = await supabase.from("user_cover_letters").insert({
      user_id: userId,
      user_email: cleanEmail,
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

/**
 * Deletes a user Cover Letter by ID or user email.
 */
export async function deleteUserCoverLetter(
  emailOrId: string | number,
  coverLetterId?: number,
): Promise<boolean> {
  if (!supabase) return false;

  try {
    const userId = await getCurrentUserId();
    let query = supabase
      .from("user_cover_letters")
      .select("storage_path")
      .eq("user_id", userId);

    if (typeof emailOrId === "number") {
      query = query.eq("id", emailOrId);
    } else {
      const cleanEmail = emailOrId.trim().toLowerCase();
      if (!cleanEmail) return false;
      if (coverLetterId) query = query.eq("id", coverLetterId);
    }

    const { data: rows, error: lookupError } = await query;
    if (lookupError) return false;

    if (rows && rows.length > 0) {
      const paths = (rows as Array<{ storage_path?: string | null }>)
        .map((r) => r.storage_path)
        .filter((p): p is string => Boolean(p));
      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
        if (storageError) return false;
      }
    }

    let delQuery = supabase.from("user_cover_letters").delete().eq("user_id", userId);

    if (typeof emailOrId === "number") {
      delQuery = delQuery.eq("id", emailOrId);
    } else {
      if (coverLetterId) delQuery = delQuery.eq("id", coverLetterId);
    }

    const { error } = await delQuery;
    return !error;
  } catch {
    return false;
  }
}
