import { DEFAULT_SCORING_RULES } from './scoringRules';
import type { Profile } from '../types/job';

/** Default empty profile template. */
export const DEFAULT_PROFILE: Profile = {
  name: '',
  first_name: '',
  last_name: '',
  phone: '',
  linkedin_url: '',
  work_authorization: '',
  target_roles: [],
  target_locations: [],
  work_mode: '',
  certifications: '',
  languages: [],
  tools_software: [],
  location: '',
  salary_min: 0,
  employment: '',
  education: '',
  current_role: '',
  summary: '',
  keywords: [],
  avatar_url: '',
  scoring_rules: DEFAULT_SCORING_RULES,
};
