import type {
  NegativeDomainRule,
  ScoringDomainRule,
  SeniorityTierRule,
} from '../types/job';

type KeywordRule = ScoringDomainRule | NegativeDomainRule | SeniorityTierRule;

function getRuleTerms(rule: KeywordRule): string[] {
  const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
  const patterns = Array.isArray(rule.patterns) ? rule.patterns : [];
  const terms = [rule.name, ...keywords, ...patterns]
    .filter((term): term is string => typeof term === 'string' && term.trim().length > 0)
    .map((term) => term.trim());
  return [...new Set(terms)];
}

export function getRuleTags(rules: KeywordRule[]): string[] {
  return [...new Set(rules.flatMap(getRuleTerms))];
}

export function updateRuleTags<T extends KeywordRule>(
  current: T[],
  nextTags: string[],
  createRule: (tag: string) => T
): T[] {
  const wanted = new Set(nextTags);
  const previous = new Set(getRuleTags(current));
  const retained = current.flatMap((rule) => {
    const remaining = getRuleTerms(rule).filter((term) => wanted.has(term));
    if (remaining.length === 0) return [];
    const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
    const patterns = Array.isArray(rule.patterns) ? rule.patterns : [];
    return [{
      ...rule,
      name: wanted.has(rule.name?.trim()) ? rule.name : remaining[0],
      keywords: keywords.filter((term) => wanted.has(term.trim())),
      ...(rule.patterns ? { patterns: patterns.filter((term) => wanted.has(term.trim())) } : {}),
    }];
  });
  const added = nextTags.filter((tag) => !previous.has(tag)).map(createRule);
  return [...retained, ...added];
}
