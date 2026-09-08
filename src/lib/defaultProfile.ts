import type { Profile } from '../types/job';

/**
 * Fallback empty profile template when no user profile is loaded yet from Supabase.
 * All actual profiles are loaded and saved dynamically per user in the database.
 */
export const DEFAULT_PROFILE: Profile = {
  name: '',
  headline: '',
  location: '',
  minimum_salary: 50000,
  employment: 'Permanent only',
  education: '',
  current_role: '',
  summary: '',
  keywords: [],
};
