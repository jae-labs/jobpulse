import { supabase } from "./supabase";
import type {
  Profile,
  JobStatus,
  UserCVMetadata,
  UserCoverLetterMetadata,
  ScoringRules,
} from "../types/job";
import { DEFAULT_PROFILE } from "./defaultProfile";

const DOCUMENTS_BUCKET = "user-documents";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .ilike("user_email", cleanEmail)
      .maybeSingle();

    if (error) {
      console.warn(
        "Failed to fetch user profile from Supabase:",
        error.message,
      );
      return DEFAULT_PROFILE;
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
  } catch (err: any) {
    console.error("Error loading user profile:", err);
    return DEFAULT_PROFILE;
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
    const payload: Record<string, any> = {
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
      onConflict: "user_email",
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to save profile" };
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
    const { data, error } = await supabase
      .from("user_cvs")
      .select("id, user_email, file_name, file_size, mime_type, description, uploaded_at")
      .ilike("user_email", cleanEmail)
      .order("uploaded_at", { ascending: false });

    if (error || !data) return [];
    return data as UserCVMetadata[];
  } catch {
    return [];
  }
}

/**
 * Loads user CV metadata (single fallback).
 */
export async function loadUserCVMetadata(
  email?: string | null,
): Promise<UserCVMetadata | null> {
  const all = await loadUserCVsMetadata(email);
  return all[0] || null;
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
    let query = supabase
      .from("user_cvs")
      .select("file_name, mime_type, storage_path");

    if (typeof emailOrId === "number") {
      query = query.eq("id", emailOrId);
    } else {
      const cleanEmail = emailOrId.trim().toLowerCase();
      if (!cleanEmail) return null;
      query = query.ilike("user_email", cleanEmail);
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

/**
 * Downloads user CV data from Supabase Storage by ID or user email.
 * Legacy wrapper that returns base64 string.
 */
export async function downloadUserCV(
  emailOrId: string | number,
  cvId?: number,
): Promise<{ fileData: string; fileName: string; mimeType: string } | null> {
  const result = await downloadUserCVBlob(emailOrId, cvId);
  if (!result) return null;

  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  return {
    fileData: bytesToBase64(bytes),
    fileName: result.fileName,
    mimeType: result.mimeType,
  };
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
    // Check quota before attempting storage upload
    const { count, error: countErr } = await supabase
      .from("user_cvs")
      .select("*", { count: "exact", head: true })
      .eq("user_email", cleanEmail);

    if (!countErr && (count || 0) >= MAX_DOCUMENTS_PER_TYPE) {
      return {
        success: false,
        error: `Maximum limit of ${MAX_DOCUMENTS_PER_TYPE} CVs reached. Please delete an existing CV first.`,
      };
    }

    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${cleanEmail}/cv/${timestamp}_${sanitizedFileName}`;
    const uploadBody = typeof fileData === "string" ? base64ToBytes(fileData) : fileData;
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, uploadBody, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) return { success: false, error: uploadError.message };

    const { error } = await supabase.from("user_cvs").insert({
      user_email: cleanEmail,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      storage_path: storagePath,
      description: description.trim(),
      uploaded_at: new Date().toISOString(),
    });

    if (error) {
      // Rollback newly uploaded file from storage to prevent orphan storage accumulation
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to save CV" };
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
    let query = supabase.from("user_cvs").select("storage_path");

    if (typeof emailOrId === "number") {
      query = query.eq("id", emailOrId);
    } else {
      const cleanEmail = emailOrId.trim().toLowerCase();
      if (!cleanEmail) return false;
      query = query.ilike("user_email", cleanEmail);
      if (cvId) query = query.eq("id", cvId);
    }

    const { data: rows } = await query;

    if (rows && rows.length > 0) {
      const paths = (rows as Array<{ storage_path?: string | null }>)
        .map((r) => r.storage_path)
        .filter((p): p is string => Boolean(p));
      if (paths.length > 0) {
        await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
      }
    }

    let delQuery = supabase.from("user_cvs").delete();

    if (typeof emailOrId === "number") {
      delQuery = delQuery.eq("id", emailOrId);
    } else {
      delQuery = delQuery.ilike("user_email", emailOrId.trim().toLowerCase());
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
    const { data, error } = await supabase
      .from("user_cover_letters")
      .select("id, user_email, file_name, file_size, mime_type, description, uploaded_at")
      .ilike("user_email", cleanEmail)
      .order("uploaded_at", { ascending: false });

    if (error || !data) return [];
    return data as UserCoverLetterMetadata[];
  } catch {
    return [];
  }
}

/**
 * Loads user Cover Letter metadata (single fallback).
 */
export async function loadUserCoverLetterMetadata(
  email?: string | null,
): Promise<UserCoverLetterMetadata | null> {
  const all = await loadUserCoverLettersMetadata(email);
  return all[0] || null;
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
    let query = supabase
      .from("user_cover_letters")
      .select("file_name, mime_type, storage_path");

    if (typeof emailOrId === "number") {
      query = query.eq("id", emailOrId);
    } else {
      const cleanEmail = emailOrId.trim().toLowerCase();
      if (!cleanEmail) return null;
      query = query.ilike("user_email", cleanEmail);
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
 * Downloads user Cover Letter data by ID or user email.
 * Legacy wrapper that returns base64 string.
 */
export async function downloadUserCoverLetter(
  emailOrId: string | number,
  coverLetterId?: number,
): Promise<{ fileData: string; fileName: string; mimeType: string } | null> {
  const result = await downloadUserCoverLetterBlob(emailOrId, coverLetterId);
  if (!result) return null;

  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  return {
    fileData: bytesToBase64(bytes),
    fileName: result.fileName,
    mimeType: result.mimeType,
  };
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
    // Check quota before attempting storage upload
    const { count, error: countErr } = await supabase
      .from("user_cover_letters")
      .select("*", { count: "exact", head: true })
      .eq("user_email", cleanEmail);

    if (!countErr && (count || 0) >= MAX_DOCUMENTS_PER_TYPE) {
      return {
        success: false,
        error: `Maximum limit of ${MAX_DOCUMENTS_PER_TYPE} cover letters reached. Please delete an existing cover letter first.`,
      };
    }

    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${cleanEmail}/cover-letter/${timestamp}_${sanitizedFileName}`;
    const uploadBody = typeof fileData === "string" ? base64ToBytes(fileData) : fileData;
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, uploadBody, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) return { success: false, error: uploadError.message };

    const { error } = await supabase.from("user_cover_letters").insert({
      user_email: cleanEmail,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      storage_path: storagePath,
      description: description.trim(),
      uploaded_at: new Date().toISOString(),
    });

    if (error) {
      // Rollback newly uploaded file from storage to prevent orphan storage accumulation
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to save cover letter",
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
    let query = supabase
      .from("user_cover_letters")
      .select("storage_path");

    if (typeof emailOrId === "number") {
      query = query.eq("id", emailOrId);
    } else {
      const cleanEmail = emailOrId.trim().toLowerCase();
      if (!cleanEmail) return false;
      query = query.ilike("user_email", cleanEmail);
      if (coverLetterId) query = query.eq("id", coverLetterId);
    }

    const { data: rows } = await query;

    if (rows && rows.length > 0) {
      const paths = (rows as Array<{ storage_path?: string | null }>)
        .map((r) => r.storage_path)
        .filter((p): p is string => Boolean(p));
      if (paths.length > 0) {
        await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
      }
    }

    let delQuery = supabase.from("user_cover_letters").delete();

    if (typeof emailOrId === "number") {
      delQuery = delQuery.eq("id", emailOrId);
    } else {
      delQuery = delQuery.ilike("user_email", emailOrId.trim().toLowerCase());
      if (coverLetterId) delQuery = delQuery.eq("id", coverLetterId);
    }

    const { error } = await delQuery;
    return !error;
  } catch {
    return false;
  }
}

/**
 * Loads user-specific job statuses for the logged in user from Supabase.
 */
export async function loadUserJobStatuses(
  email?: string | null,
): Promise<Map<number, JobStatus>> {
  const statusMap = new Map<number, JobStatus>();
  const cleanEmail = email?.trim().toLowerCase();

  if (!cleanEmail || !supabase) {
    return statusMap;
  }

  try {
    const { data, error } = await supabase
      .from("user_job_statuses")
      .select("job_id, status")
      .ilike("user_email", cleanEmail);

    if (error) {
      console.warn(
        "Could not load user_job_statuses from Supabase:",
        error.message,
      );
      return statusMap;
    }

    if (data) {
      for (const row of data) {
        if (row.job_id !== null && row.job_id !== undefined) {
          statusMap.set(Number(row.job_id), row.status as JobStatus);
        }
      }
    }
  } catch (err: any) {
    console.error("Error querying user job statuses:", err);
  }

  return statusMap;
}

/**
 * Saves a single job status for the user in Supabase.
 */
export async function saveUserJobStatus(
  email: string,
  jobId: number,
  status: JobStatus,
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase) {
    return { success: false, error: "Database or user email unavailable" };
  }

  try {
    const { error } = await supabase.from("user_job_statuses").upsert(
      {
        user_email: cleanEmail,
        job_id: jobId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_email,job_id" },
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to update job status",
    };
  }
}
