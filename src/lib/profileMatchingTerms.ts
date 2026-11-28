import type { Profile } from '../types/job';
import { getRuleTags, updateRuleTags } from './scoringRuleTags';
import { DEFAULT_SCORING_RULES } from './scoringRules';

export function getMatchingTerms(profile: Profile): string[] {
  const positiveRules = Array.isArray(profile.scoring_rules?.positive_sectors)
    ? profile.scoring_rules.positive_sectors
    : DEFAULT_SCORING_RULES.positive_sectors;
  return [...new Set([
    ...getRuleTags(positiveRules),
    ...(profile.keywords || []),
    ...(profile.tools_software || []),
  ])];
}

export function withMatchingTerms(profile: Profile, nextTags: string[]): Profile {
  const terms = [...new Set(nextTags.map((tag) => tag.trim()).filter(Boolean))];
  const wanted = new Set(terms);
  const existingRules = Array.isArray(profile.scoring_rules?.positive_sectors)
    ? profile.scoring_rules.positive_sectors
    : DEFAULT_SCORING_RULES.positive_sectors;

  return {
    ...profile,
    keywords: terms,
    tools_software: (profile.tools_software || []).filter((tool) => wanted.has(tool)),
    scoring_rules: {
      negative_sectors: DEFAULT_SCORING_RULES.negative_sectors,
      seniority_tiers: DEFAULT_SCORING_RULES.seniority_tiers,
      ...profile.scoring_rules,
      positive_sectors: updateRuleTags(existingRules, terms, (tag) => ({
        name: tag,
        keywords: [tag],
        note: '',
      })),
    },
  };
}
