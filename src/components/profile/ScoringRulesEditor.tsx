import React from 'react';
import type {
  ScoringRules,
  ScoringDomainRule,
  NegativeDomainRule,
  SeniorityTierRule,
  ScoringWeights,
  Job,
} from '../../types/job';
import { previewWeightedScore } from '../../lib/scoreCalculator';
import { useTranslation } from 'react-i18next';
import { Button, Card, Range } from '@jae-labs/ui';
import { TagChipInput } from './TagChipInput';
import { getRuleTags, updateRuleTags } from '../../lib/scoringRuleTags';

const DEFAULT_WEIGHTS: ScoringWeights = {
  domain: 25,
  semantic: 25,
  competency: 20,
  seniority: 15,
  salary: 15,
  contract: 10,
  target_role_bonus: 6,
  location_bonus: 4,
  work_mode_bonus: 2,
  fixed_term_penalty: 8,
  disqualification_cap: 10,
};

const DEFAULT_DISQUALIFIERS = ['Maternity cover', 'Internship', 'Temporary contract'];

const EMPTY_RULES: ScoringRules = {
  positive_domains: [],
  negative_domains: [],
  seniority_tiers: [],
  disqualifiers: DEFAULT_DISQUALIFIERS,
  weights: DEFAULT_WEIGHTS,
};

import { useScoringPreviewJobsQuery } from '../../hooks/useQueries';

interface ScoringRulesEditorProps {
  value: ScoringRules | undefined;
  onChange: (rules: ScoringRules) => void;
  jobs?: Job[];
  userEmail?: string | null;
}

type TagColorTheme = 'accent' | 'warning' | 'interviewing' | 'negative' | 'positive' | 'neutral';

const THEME_CLASSES: Record<
  TagColorTheme,
  {
    chip: string;
    close: string;
  }
> = {
  accent: {
    chip: 'border-ds-accent/30 bg-ds-accent/10 text-ds-accent',
    close: 'text-ds-accent/80 hover:text-ds-text-primary',
  },
  warning: {
    chip: 'border-ds-warning/30 bg-ds-warning/10 text-ds-warning',
    close: 'text-ds-warning/80 hover:text-ds-text-primary',
  },
  interviewing: {
    chip: 'border-status-interviewing/30 bg-status-interviewing/10 text-status-interviewing',
    close: 'text-status-interviewing/80 hover:text-ds-text-primary',
  },
  negative: {
    chip: 'border-ds-negative/30 bg-ds-negative/10 text-ds-negative',
    close: 'text-ds-negative/80 hover:text-ds-text-primary',
  },
  positive: {
    chip: 'border-ds-positive/30 bg-ds-positive/10 text-ds-positive',
    close: 'text-ds-positive/80 hover:text-ds-text-primary',
  },
  neutral: {
    chip: 'border-ds-border-strong/60 bg-ds-hover/60 text-ds-text-secondary',
    close: 'text-ds-text-muted hover:text-ds-text-primary',
  },
};

interface WeightConfigItem {
  key: keyof ScoringWeights;
  title: string;
  badge: (val: number) => string;
  explanation: string;
  min: number;
  max: number;
  step?: number;
  color: TagColorTheme;
}

const WEIGHT_CONFIGS: WeightConfigItem[] = [
  {
    key: 'domain',
    title: 'Domain Match & Core Specialization',
    badge: (val) => `${val} pts`,
    explanation:
      'Measures matches with your positive alignment tags. Mismatch and exclusion tags can lower the score.',
    min: 5,
    max: 50,
    color: 'accent',
  },
  {
    key: 'semantic',
    title: 'AI Semantic Vector Similarity',
    badge: (val) => `${val} pts`,
    explanation:
      "Computes deep contextual vector embeddings using SentenceTransformers (all-MiniLM-L6-v2) accelerated locally on your Mac's Apple Silicon Metal GPU (mps). Encodes your complete profile experience, certifications, and skills against the job description text to detect holistic contextual match beyond exact keyword matches.",
    min: 5,
    max: 50,
    color: 'accent',
  },
  {
    key: 'competency',
    title: 'Keywords, Tools & Certifications',
    badge: (val) => `${val} pts`,
    explanation:
      'Measures the presence and density of your core competencies, software/tools (e.g., Kubernetes, Terraform, Docker, Python), and professional certifications. Calculates the percentage of required job skills matched by your profile.',
    min: 5,
    max: 40,
    color: 'accent',
  },
  {
    key: 'seniority',
    title: 'Seniority Level Alignment',
    badge: (val) => `${val} pts`,
    explanation:
      'Measures job title matches with your preferred seniority tags, such as Senior, Lead, and Principal.',
    min: 5,
    max: 30,
    color: 'interviewing',
  },
  {
    key: 'salary',
    title: 'Advertised Compensation Match',
    badge: (val) => `${val} pts`,
    explanation:
      'Scored strictly against real compensation advertised on the job posting (public sector salary scale imputation is disabled). Salaries meeting or exceeding your target minimum threshold earn full points. Postings without an advertised salary receive a neutral baseline (75%).',
    min: 5,
    max: 30,
    color: 'positive',
  },
  {
    key: 'contract',
    title: 'Employment Contract Preference',
    badge: (val) => `${val} pts`,
    explanation:
      'Awards points based on contract stability. Permanent and whole-time positions receive full points when your preference is set to Permanent roles, while temporary appointments receive lower points.',
    min: 0,
    max: 25,
    color: 'accent',
  },
  {
    key: 'target_role_bonus',
    title: 'Target Role Title Bonus',
    badge: (val) => `+${val} pts`,
    explanation:
      'Direct bonus points added to the final score when the job title explicitly matches one of your designated target roles (e.g., "Senior SRE", "Platform Engineer", "Operations Manager").',
    min: 0,
    max: 15,
    color: 'positive',
  },
  {
    key: 'location_bonus',
    title: 'Target Location Match Bonus',
    badge: (val) => `+${val} pts`,
    explanation:
      'Direct bonus points added when the job location matches one of your target geographic areas or counties (e.g. Dublin, Cork, Ireland-wide).',
    min: 0,
    max: 10,
    color: 'positive',
  },
  {
    key: 'work_mode_bonus',
    title: 'Work Mode Alignment Bonus',
    badge: (val) => `+${val} pts`,
    explanation:
      "Direct bonus points added when the posting matches your selected work arrangements (Hybrid, Remote, or On-site) configured in your profile's Work Mode preference.",
    min: 0,
    max: 10,
    color: 'positive',
  },
  {
    key: 'fixed_term_penalty',
    title: 'Fixed-Term / Contract Penalty',
    badge: (val) => `-${val} pts`,
    explanation:
      'Points deducted from the overall score when a posting is identified as a fixed-term contract, temporary position, or casual contract when your preference is set to Permanent roles.',
    min: 0,
    max: 20,
    color: 'warning',
  },
  {
    key: 'disqualification_cap',
    title: 'Disqualification Ceiling Score Cap',
    badge: (val) => `Max ${val}%`,
    explanation:
      'The absolute maximum percentage score any job can receive if it triggers any of your Disqualifiers & Dealbreakers (e.g. maternity cover, internship, temporary contract). Regardless of other high match criteria, matching a dealbreaker caps the score at this threshold.',
    min: 0,
    max: 25,
    color: 'negative',
  },
];

interface NormalizedScoringRules extends ScoringRules {
  positive_domains: ScoringDomainRule[];
  negative_domains: NegativeDomainRule[];
  seniority_tiers: SeniorityTierRule[];
  disqualifiers: string[];
  weights: ScoringWeights;
}

export const ScoringRulesEditor: React.FC<ScoringRulesEditorProps> = ({
  value,
  onChange,
  jobs: providedJobs,
  userEmail,
}) => {
  const { data: queriedJobs = [], isFetching: isPreviewFetching } = useScoringPreviewJobsQuery(
    userEmail,
    !providedJobs && Boolean(userEmail)
  );
  const jobs = providedJobs ?? queriedJobs;
  const { t } = useTranslation();
  const rules = React.useMemo<NormalizedScoringRules>(() => {
    const raw = value || EMPTY_RULES;
    return {
      ...EMPTY_RULES,
      ...raw,
      positive_domains: Array.isArray(raw.positive_domains) ? raw.positive_domains : [],
      negative_domains: Array.isArray(raw.negative_domains) ? raw.negative_domains : [],
      seniority_tiers: Array.isArray(raw.seniority_tiers) ? raw.seniority_tiers : [],
      disqualifiers:
        Array.isArray(raw.disqualifiers) && raw.disqualifiers.length > 0
          ? raw.disqualifiers
          : Array.isArray(raw.irish_language_patterns) && raw.irish_language_patterns.length > 0
            ? raw.irish_language_patterns
            : DEFAULT_DISQUALIFIERS,
      weights: {
        ...DEFAULT_WEIGHTS,
        ...(raw.weights || {}),
      },
    };
  }, [value]);

  const disqualifiers = rules.disqualifiers;
  const weights = rules.weights;

  const previewJobs = React.useMemo(() => {
    return jobs
      .filter((j) => j.sub_scores || j.ai_analysis?.sub_scores)
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, 3);
  }, [jobs]);
  const previewSourceKey = `${userEmail ?? ''}|${previewJobs.map((job) => `${job.id}:${job.relevance}`).join('|')}`;
  const [previewBaseline, setPreviewBaseline] = React.useState<{ sourceKey: string; weights: ScoringWeights } | null>(null);
  const baselineWeights = previewBaseline?.sourceKey === previewSourceKey ? previewBaseline.weights : weights;
  const previewMatches = previewJobs.map((job) => ({
    ...job,
    relevance: previewWeightedScore(job, weights, baselineWeights),
  }));

  const updateNegative = (next: NegativeDomainRule[]) =>
    onChange({ ...rules, negative_domains: next });

  const updateDisqualifiers = (next: string[]) =>
    onChange({ ...rules, disqualifiers: next, irish_language_patterns: next });

  const updateWeights = (nextWeights: ScoringWeights) =>
    onChange({ ...rules, weights: nextWeights });

  const capturePreviewBaseline = () => {
    if (previewJobs.length > 0 && previewBaseline?.sourceKey !== previewSourceKey) {
      setPreviewBaseline({ sourceKey: previewSourceKey, weights: { ...weights } });
    }
  };

  const handleWeightChange = (key: keyof ScoringWeights, val: number) => {
    capturePreviewBaseline();
    updateWeights({
      ...weights,
      [key]: val,
    });
  };

  const resetWeights = () => {
    capturePreviewBaseline();
    updateWeights(DEFAULT_WEIGHTS);
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.scoring.exclusionRulesTitle')}
          </h2>
        </div>
        <TagChipInput
          items={getRuleTags(rules.negative_domains)}
          onChange={(next) => updateNegative(updateRuleTags(rules.negative_domains, next, (tag) => ({
            name: tag,
            keywords: [tag],
            patterns: [tag],
            reason: '',
          })))}
          placeholder={t('profile.scoring.addExclusionTerm')}
          ariaLabel={t('profile.scoring.exclusionRulesTitle')}
        />
      </Card>

      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.scoring.disqualifiersTitle')}
          </h2>
        </div>
        <TagChipInput
          items={disqualifiers}
          onChange={updateDisqualifiers}
          placeholder={t('profile.scoring.addDisqualifier')}
          ariaLabel={t('profile.scoring.disqualifiersTitle')}
          theme="accent"
        />
      </Card>

      <Card className="space-y-4 p-5 lg:p-6">
        <div className="border-b border-ds-border pb-3">
          <h2 className="text-sm font-semibold text-ds-text-primary tracking-tight">
            {t('profile.scoring.weightsTitle')}
          </h2>
        </div>
        <div className="grid gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] min-[1200px]:items-start 2xl:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
          <aside
            aria-label={t('profile.scoring.previewTitle')}
            className="rounded-xl border border-ds-accent/30 bg-ds-panel p-4 shadow-sm min-[1200px]:sticky min-[1200px]:top-4 min-[1200px]:col-start-2 min-[1200px]:row-start-1 min-[1200px]:self-start"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ds-text-primary">
                {t('profile.scoring.previewTitle')}
              </h3>
              <Button type="button" onClick={resetWeights} variant="secondary" size="sm">
                {t('profile.scoring.reset')}
              </Button>
            </div>
            <p className="mt-1 text-xs text-ds-text-secondary">
              {t('profile.scoring.previewDescription')}
            </p>
            {previewMatches.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {previewMatches.map((job) => (
                  <div key={job.id} className="min-w-0 rounded-lg border border-ds-border bg-ds-surface p-2.5">
                    <span className="block font-mono text-xs font-semibold text-ds-accent">{job.relevance}%</span>
                    <span className="mt-1 block min-w-0 line-clamp-3 text-xs font-medium text-ds-text-primary">{job.title}</span>
                    <p className="mt-0.5 truncate text-[11px] text-ds-text-muted">{job.company}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-ds-text-muted">
                {isPreviewFetching && !providedJobs && userEmail
                  ? t('common.loading')
                  : t('profile.scoring.previewUnavailable')}
              </p>
            )}
          </aside>
          <div className="min-w-0 space-y-3.5 min-[1200px]:col-start-1 min-[1200px]:row-start-1">
            {WEIGHT_CONFIGS.map((cfg) => {
              const currentVal = Number(weights[cfg.key] ?? DEFAULT_WEIGHTS[cfg.key] ?? 0);
              const theme = THEME_CLASSES[cfg.color];

              return (
                <Card
                  key={cfg.key}
                  className="p-4 sm:p-5 space-y-3.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 max-w-3xl">
                      <h4 className="text-sm font-semibold text-ds-text-primary">
                        {t(`profile.scoring.weights.${cfg.key}.title`, { defaultValue: cfg.title })}
                      </h4>
                      <p className="text-xs text-ds-text-secondary leading-relaxed">
                        {t(`profile.scoring.weights.${cfg.key}.description`, { defaultValue: cfg.explanation })}
                      </p>
                    </div>
                    <div className="shrink-0 self-start sm:self-center">
                      <span
                        className={`inline-flex items-center justify-center min-w-[84px] px-3 py-1.5 rounded-lg border font-mono text-sm font-semibold ${theme.chip}`}
                      >
                        {t('profile.scoring.pointsUnit', '{{count}} pts', { count: currentVal })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 pt-1">
                    <span className="text-xs font-mono text-ds-text-muted w-8 text-right shrink-0">
                      {cfg.min}
                    </span>
                    <Range
                      aria-label={t(`profile.scoring.weights.${cfg.key}.title`, { defaultValue: cfg.title })}
                      min={cfg.min}
                      max={cfg.max}
                      step={cfg.step || 1}
                      value={currentVal}
                      onChange={(e) => handleWeightChange(cfg.key, Number(e.target.value))}
                    />
                    <span className="text-xs font-mono text-ds-text-muted w-8 shrink-0">
                      {cfg.max}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </Card>

    </div>
  );
};
