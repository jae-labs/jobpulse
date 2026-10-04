import React from 'react';
import type {
  ScoringRules,
  NegativeDomainRule,
  ScoringWeights,
  Job,
} from '../../types/job';
import { topPreviewJobs } from '../../lib/scoreCalculator';
import { useTranslation } from 'react-i18next';
import { Button, Card, Range } from '@jae-labs/ui';
import { TagChipInput } from './TagChipInput';
import { getRuleTags, updateRuleTags } from '../../lib/scoringRuleTags';

import { DEFAULT_SCORING_WEIGHTS, resolveScoringRules } from '../../lib/scoringRules';

import { useScoringPreviewJobsQuery } from '../../hooks/useQueries';

interface ScoringRulesEditorProps {
  value: ScoringRules | undefined;
  onChange: (rules: ScoringRules) => void;
  jobs?: Job[];
  userId?: string | null;
}

interface WeightConfigItem {
  key: keyof ScoringWeights;
  min: number;
  max: number;
}

const WEIGHT_CONFIGS: WeightConfigItem[] = [
  {
    key: 'domain',
    min: 5,
    max: 50,
  },
  {
    key: 'semantic',
    min: 5,
    max: 50,
  },
  {
    key: 'competency',
    min: 5,
    max: 40,
  },
  {
    key: 'seniority',
    min: 5,
    max: 30,
  },
  {
    key: 'salary',
    min: 5,
    max: 30,
  },
  {
    key: 'contract',
    min: 0,
    max: 25,
  },
  {
    key: 'target_role_bonus',
    min: 0,
    max: 15,
  },
  {
    key: 'location_bonus',
    min: 0,
    max: 10,
  },
  {
    key: 'work_mode_bonus',
    min: 0,
    max: 10,
  },
  {
    key: 'fixed_term_penalty',
    min: 0,
    max: 20,
  },
  {
    key: 'disqualification_cap',
    min: 0,
    max: 15,
  },
];

export const ScoringRulesEditor: React.FC<ScoringRulesEditorProps> = ({
  value,
  onChange,
  jobs: providedJobs,
  userId,
}) => {
  const { data: queriedJobs = [], isFetching: isPreviewFetching } = useScoringPreviewJobsQuery(
    userId,
    !providedJobs && Boolean(userId)
  );
  const jobs = providedJobs ?? queriedJobs;
  const { t } = useTranslation();
  const rules = React.useMemo(() => resolveScoringRules(value), [value]);

  const disqualifiers = rules.disqualifiers;
  const weights = rules.weights;

  const previewMatches = React.useMemo(() => topPreviewJobs(jobs, weights), [jobs, weights]);

  const updateNegative = (next: NegativeDomainRule[]) =>
    onChange({ ...rules, negative_domains: next });

  const updateDisqualifiers = (next: string[]) =>
    onChange({ ...rules, disqualifiers: next });

  const updateWeights = (nextWeights: ScoringWeights) =>
    onChange({ ...rules, weights: nextWeights });

  const handleWeightChange = (key: keyof ScoringWeights, val: number) => {
    updateWeights({
      ...weights,
      [key]: val,
    });
  };

  const resetWeights = () => {
    updateWeights(DEFAULT_SCORING_WEIGHTS);
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] min-[1200px]:items-start 2xl:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
          <aside
            aria-label={t('profile.scoring.previewTitle')}
            className="min-w-0 rounded-ds-card border border-ds-accent/30 bg-ds-panel p-4 shadow-sm min-[1200px]:sticky min-[1200px]:top-4 min-[1200px]:col-start-2 min-[1200px]:row-start-1 min-[1200px]:self-start"
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
              <ol className="mt-3 space-y-2">
                {previewMatches.map((job, index) => (
                  <li key={job.id} className="flex min-w-0 items-center gap-3 rounded-ds-control border border-ds-border bg-ds-surface p-2.5">
                    <span className="w-4 shrink-0 text-center font-mono text-[11px] text-ds-text-muted">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ds-text-primary" title={job.title}>{job.title}</p>
                      <p className="truncate text-[11px] text-ds-text-muted" title={job.company}>{job.company}</p>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-semibold text-ds-accent">{job.relevance}%</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-xs text-ds-text-muted">
                {isPreviewFetching && !providedJobs && userId
                  ? t('common.loading')
                  : t('profile.scoring.previewUnavailable')}
              </p>
            )}
          </aside>
          <div className="min-w-0 space-y-3.5 min-[1200px]:col-start-1 min-[1200px]:row-start-1">
            {WEIGHT_CONFIGS.map((cfg) => {
              const currentVal = Number(weights[cfg.key] ?? DEFAULT_SCORING_WEIGHTS[cfg.key] ?? 0);

              return (
                <Card
                  key={cfg.key}
                  className="p-4 sm:p-5 space-y-3.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 max-w-3xl">
                      <h4 className="text-sm font-semibold text-ds-text-primary">
                        {t(`profile.scoring.weights.${cfg.key}.title`)}
                      </h4>
                      <p className="text-xs text-ds-text-secondary leading-relaxed">
                        {t(`profile.scoring.weights.${cfg.key}.description`)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 pt-1">
                    <span className="text-xs font-mono text-ds-text-muted w-8 text-right shrink-0">
                      {cfg.min}
                    </span>
                    <Range
                      aria-label={t(`profile.scoring.weights.${cfg.key}.title`)}
                      aria-valuetext={t(cfg.key === 'disqualification_cap' ? 'profile.scoring.maximumPercent' : 'profile.scoring.pointsUnit', { count: currentVal })}
                      min={cfg.min}
                      max={cfg.max}
                      step={1}
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
