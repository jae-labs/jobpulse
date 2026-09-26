import type { Profile } from '../types/job';

/** Default empty profile template. */
export const DEFAULT_PROFILE: Profile = {
  name: '',
  location: '',
  salary_min: 50000,
  minimum_salary: 50000,
  employment: 'Permanent only',
  education: '',
  current_role: '',
  summary: '',
  keywords: [],
  avatar_url: '',
};
