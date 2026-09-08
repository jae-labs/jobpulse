import { supabase } from './supabase';
import type { Profile, JobStatus, UserCVMetadata } from '../types/job';
import { DEFAULT_PROFILE } from './defaultProfile';

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
      .from('user_profiles')
      .select('*')
      .ilike('user_email', cleanEmail)
      .maybeSingle();

    if (error) {
      console.warn('Failed to fetch user profile from Supabase:', error.message);
      return DEFAULT_PROFILE;
    }

    if (!data) {
      return DEFAULT_PROFILE;
    }

    return {
      name: data.name || (data.first_name && data.last_name ? `${data.first_name} ${data.last_name}` : ''),
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      phone: data.phone || '',
      linkedin_url: data.linkedin_url || '',
      work_authorization: data.work_authorization || 'EU Citizen',
      gender: data.gender || '',
      headline: data.headline || '',
      current_role: data.current_role || '',
      current_company: data.current_company || '',
      years_of_experience: data.years_of_experience || '5-8 years',
      experience_level: data.experience_level || 'Mid-level',
      location: data.location || '',
      target_roles: Array.isArray(data.target_roles) ? data.target_roles : [],
      target_locations: Array.isArray(data.target_locations) ? data.target_locations : [],
      work_mode: data.work_mode || 'Hybrid',
      minimum_salary: Number(data.salary_min) || Number(data.minimum_salary) || 50000,
      salary_min: Number(data.salary_min) || Number(data.minimum_salary) || 50000,
      salary_max: Number(data.salary_max) || 75000,
      employment: data.employment || 'Permanent only',
      highest_education: data.highest_education || 'Master\'s Degree (QQI Level 9)',
      education: data.education || '',
      education_details: data.education_details || '',
      certifications: data.certifications || '',
      languages: Array.isArray(data.languages) ? data.languages : [],
      tools_software: Array.isArray(data.tools_software) ? data.tools_software : [],
      summary: data.summary || '',
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
    };
  } catch (err: any) {
    console.error('Error loading user profile:', err);
    return DEFAULT_PROFILE;
  }
}

/**
 * Saves or updates a user profile on Supabase.
 */
export async function saveUserProfile(
  email: string,
  profile: Profile
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, error: 'Email is required to save profile.' };
  }

  if (!supabase) {
    return { success: false, error: 'Database connection not initialized.' };
  }

  const fullName =
    profile.first_name || profile.last_name
      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      : profile.name || '';

  try {
    const payload: Record<string, any> = {
      user_email: cleanEmail,
      name: fullName,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone || '',
      linkedin_url: profile.linkedin_url || '',
      work_authorization: profile.work_authorization || 'EU Citizen',
      gender: profile.gender || '',
      headline: profile.headline || '',
      current_role: profile.current_role || '',
      current_company: profile.current_company || '',
      years_of_experience: profile.years_of_experience || '5-8 years',
      experience_level: profile.experience_level || 'Mid-level',
      location: profile.location || '',
      target_roles: profile.target_roles || [],
      target_locations: profile.target_locations || [],
      work_mode: profile.work_mode || 'Hybrid',
      minimum_salary: profile.salary_min || profile.minimum_salary || 50000,
      salary_min: profile.salary_min || profile.minimum_salary || 50000,
      salary_max: profile.salary_max || 75000,
      employment: profile.employment || 'Permanent only',
      highest_education: profile.highest_education || 'Master\'s Degree (QQI Level 9)',
      education: profile.education || '',
      education_details: profile.education_details || '',
      certifications: profile.certifications || '',
      languages: profile.languages || [],
      tools_software: profile.tools_software || [],
      summary: profile.summary || '',
      keywords: profile.keywords || [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('user_profiles').upsert(payload, {
      onConflict: 'user_email',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save profile' };
  }
}

/**
 * Loads user CV metadata (without the heavy base64 string).
 */
export async function loadUserCVMetadata(
  email?: string | null
): Promise<UserCVMetadata | null> {
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('user_cvs')
      .select('id, user_email, file_name, file_size, mime_type, uploaded_at')
      .ilike('user_email', cleanEmail)
      .maybeSingle();

    if (error || !data) return null;
    return data as UserCVMetadata;
  } catch {
    return null;
  }
}

/**
 * Downloads user CV data (retrieves the base64 content).
 */
export async function downloadUserCV(
  email: string
): Promise<{ fileData: string; fileName: string; mimeType: string } | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('user_cvs')
      .select('file_name, file_data, mime_type')
      .ilike('user_email', cleanEmail)
      .maybeSingle();

    if (error || !data || !data.file_data) return null;
    return {
      fileData: data.file_data,
      fileName: data.file_name,
      mimeType: data.mime_type || 'application/pdf',
    };
  } catch {
    return null;
  }
}

/**
 * Saves a user CV document to Supabase as base64.
 */
export async function saveUserCV(
  email: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  base64Data: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase) return { success: false, error: 'Database unavailable' };

  try {
    const { error } = await supabase.from('user_cvs').upsert(
      {
        user_email: cleanEmail,
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
        file_data: base64Data,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: 'user_email' }
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save CV' };
  }
}

/**
 * Deletes user CV from Supabase.
 */
export async function deleteUserCV(email: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase) return false;

  try {
    const { error } = await supabase
      .from('user_cvs')
      .delete()
      .ilike('user_email', cleanEmail);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Loads user-specific job statuses for the logged in user from Supabase.
 */
export async function loadUserJobStatuses(
  email?: string | null
): Promise<Map<number, JobStatus>> {
  const statusMap = new Map<number, JobStatus>();
  const cleanEmail = email?.trim().toLowerCase();

  if (!cleanEmail || !supabase) {
    return statusMap;
  }

  try {
    const { data, error } = await supabase
      .from('user_job_statuses')
      .select('job_id, status')
      .ilike('user_email', cleanEmail);

    if (error) {
      console.warn('Could not load user_job_statuses from Supabase:', error.message);
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
    console.error('Error querying user job statuses:', err);
  }

  return statusMap;
}

/**
 * Saves a single job status for the user in Supabase.
 */
export async function saveUserJobStatus(
  email: string,
  jobId: number,
  status: JobStatus
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !supabase) {
    return { success: false, error: 'Database or user email unavailable' };
  }

  try {
    const { error } = await supabase.from('user_job_statuses').upsert(
      {
        user_email: cleanEmail,
        job_id: jobId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_email,job_id' }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update job status' };
  }
}
