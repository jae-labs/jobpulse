import type { Profile } from '../types/job';
import { getRuleTags, updateRuleTags } from './scoringRuleTags';

export function getMatchingTerms(profile: Profile): string[] {
  const positiveRules = Array.isArray(profile.scoring_rules?.positive_domains)
    ? profile.scoring_rules.positive_domains
    : [];
  return [...new Set([
    ...getRuleTags(positiveRules),
    ...(profile.keywords || []),
    ...(profile.tools_software || []),
  ])];
}

export function withMatchingTerms(profile: Profile, nextTags: string[]): Profile {
  const terms = [...new Set(nextTags.map((tag) => tag.trim()).filter(Boolean))];
  const wanted = new Set(terms);
  const existingRules = Array.isArray(profile.scoring_rules?.positive_domains)
    ? profile.scoring_rules.positive_domains
    : [];

  return {
    ...profile,
    keywords: terms,
    tools_software: (profile.tools_software || []).filter((tool) => wanted.has(tool)),
    scoring_rules: {
      negative_domains: [],
      seniority_tiers: [],
      ...profile.scoring_rules,
      positive_domains: updateRuleTags(existingRules, terms, (tag) => ({
        name: tag,
        keywords: [tag],
        patterns: [tag],
        note: '',
      })),
    },
  };
}
