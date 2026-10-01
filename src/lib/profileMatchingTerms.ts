import type { Profile } from '../types/job';
import { getRuleTags, updateRuleTags } from './scoringRuleTags';
import { DEFAULT_SCORING_RULES } from './scoringRules';

export function getMatchingTerms(profile: Profile): string[] {
  const positiveRules = Array.isArray(profile.scoring_rules?.positive_domains)
    ? profile.scoring_rules.positive_domains
    : DEFAULT_SCORING_RULES.positive_domains;
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
    : DEFAULT_SCORING_RULES.positive_domains;

  return {
    ...profile,
    keywords: terms,
    tools_software: (profile.tools_software || []).filter((tool) => wanted.has(tool)),
    scoring_rules: {
      negative_domains: DEFAULT_SCORING_RULES.negative_domains,
      seniority_tiers: DEFAULT_SCORING_RULES.seniority_tiers,
      ...profile.scoring_rules,
      positive_domains: updateRuleTags(existingRules, terms, (tag) => ({
        name: tag,
        keywords: [tag],
        note: '',
      })),
    },
  };
}
