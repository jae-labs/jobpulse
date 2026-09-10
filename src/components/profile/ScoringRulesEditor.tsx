import React, { useState } from 'react';
import { Plus, Trash2, X, RotateCcw, AlertTriangle, Sparkles, ShieldAlert, Sliders } from 'lucide-react';
import type {
  ScoringRules,
  ScoringDomainRule,
  NegativeDomainRule,
  SeniorityTierRule,
  ScoringWeights,
  Job,
} from '../../types/job';
import { recalculateJob } from '../../lib/scoreCalculator';
import { useTranslation } from 'react-i18next';

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

interface ScoringRulesEditorProps {
  value: ScoringRules | undefined;
  onChange: (rules: ScoringRules) => void;
  jobs?: Job[];
}

const fieldClass =
  'w-full rounded-lg border border-zinc-700/80 bg-[#111215] px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none transition-colors';
const labelClass = 'text-xs font-medium text-zinc-200';
const cardClass = 'space-y-3.5 rounded-xl border border-white/[0.12] bg-[#16171b] p-4 sm:p-5 shadow-xs';

type TagColorTheme = 'indigo' | 'amber' | 'purple' | 'rose' | 'emerald' | 'zinc';

const THEME_CLASSES: Record<
  TagColorTheme,
  {
    chip: string;
    close: string;
    border: string;
  }
> = {
  indigo: {
    chip: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:border-indigo-500/50',
    close: 'text-indigo-400/80 hover:text-white',
    border: 'focus-within:border-indigo-500',
  },
  amber: {
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-500/50',
    close: 'text-amber-400/80 hover:text-white',
    border: 'focus-within:border-amber-500',
  },
  purple: {
    chip: 'border-purple-500/30 bg-purple-500/10 text-purple-200 hover:border-purple-500/50',
    close: 'text-purple-400/80 hover:text-white',
    border: 'focus-within:border-purple-500',
  },
  rose: {
    chip: 'border-rose-500/30 bg-rose-500/10 text-rose-200 hover:border-rose-500/50',
    close: 'text-rose-400/80 hover:text-white',
    border: 'focus-within:border-rose-500',
  },
  emerald: {
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:border-emerald-500/50',
    close: 'text-emerald-400/80 hover:text-white',
    border: 'focus-within:border-emerald-500',
  },
  zinc: {
    chip: 'border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:border-zinc-500',
    close: 'text-zinc-400 hover:text-white',
    border: 'focus-within:border-zinc-600',
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
    title: 'Domain Fit & Core Specialization',
    badge: (val) => `${val} pts`,
    explanation:
      'Evaluates whether the job matches your configured positive domain rules (e.g. Cloud, Platform, DevOps). Postings matching your positive domains receive full points and an alignment note in AI reasoning, while exclusion domains trigger score penalties.',
    min: 5,
    max: 50,
    color: 'indigo',
  },
  {
    key: 'semantic',
    title: 'AI Semantic Vector Similarity',
    badge: (val) => `${val} pts`,
    explanation:
      "Computes deep contextual vector embeddings using SentenceTransformers (all-MiniLM-L6-v2) accelerated locally on your Mac's Apple Silicon Metal GPU (mps). Encodes your complete profile experience, certifications, and skills against the job description text to detect holistic contextual fit beyond exact keyword matches.",
    min: 5,
    max: 50,
    color: 'indigo',
  },
  {
    key: 'competency',
    title: 'Keywords, Tools & Certifications',
    badge: (val) => `${val} pts`,
    explanation:
      'Measures the presence and density of your core competencies, software/tools (e.g., Kubernetes, Terraform, Docker, Python), and professional certifications. Calculates the percentage of required job skills matched by your profile.',
    min: 5,
    max: 40,
    color: 'indigo',
  },
  {
    key: 'seniority',
    title: 'Seniority Level Alignment',
    badge: (val) => `${val} pts`,
    explanation:
      'Evaluates job title keywords against your ordered seniority tiers (e.g. Senior, Lead, Principal vs Junior, Intern). Checked top-to-bottom; matching a preferred senior tier awards full points, whereas lower or unwanted tiers scale down points accordingly.',
    min: 5,
    max: 30,
    color: 'purple',
  },
  {
    key: 'salary',
    title: 'Advertised Compensation Match',
    badge: (val) => `${val} pts`,
    explanation:
      'Scored strictly against real compensation advertised on the job posting (public sector salary scale imputation is disabled). Salaries meeting or exceeding your target minimum threshold earn full points. Postings without an advertised salary receive a neutral baseline (75%).',
    min: 5,
    max: 30,
    color: 'emerald',
  },
  {
    key: 'contract',
    title: 'Employment Contract Preference',
    badge: (val) => `${val} pts`,
    explanation:
      'Awards points based on contract stability. Permanent and whole-time positions receive full points when your preference is set to Permanent roles, while temporary appointments receive lower points.',
    min: 0,
    max: 25,
    color: 'indigo',
  },
  {
    key: 'target_role_bonus',
    title: 'Target Role Title Bonus',
    badge: (val) => `+${val} pts`,
    explanation:
      'Direct bonus points added to the final score when the job title explicitly matches one of your designated target roles (e.g., "Senior SRE", "Platform Engineer", "Operations Manager").',
    min: 0,
    max: 15,
    color: 'emerald',
  },
  {
    key: 'location_bonus',
    title: 'Target Location Match Bonus',
    badge: (val) => `+${val} pts`,
    explanation:
      'Direct bonus points added when the job location matches one of your target geographic areas or counties (e.g. Dublin, Cork, Ireland-wide).',
    min: 0,
    max: 10,
    color: 'emerald',
  },
  {
    key: 'work_mode_bonus',
    title: 'Work Mode Alignment Bonus',
    badge: (val) => `+${val} pts`,
    explanation:
      "Direct bonus points added when the posting matches your selected work arrangements (Hybrid, Remote, or On-site) configured in your profile's Work Mode preference.",
    min: 0,
    max: 10,
    color: 'emerald',
  },
  {
    key: 'fixed_term_penalty',
    title: 'Fixed-Term / Contract Penalty',
    badge: (val) => `-${val} pts`,
    explanation:
      'Points deducted from the overall score when a posting is identified as a fixed-term contract, temporary position, or casual contract when your preference is set to Permanent roles.',
    min: 0,
    max: 20,
    color: 'amber',
  },
  {
    key: 'disqualification_cap',
    title: 'Disqualification Ceiling Score Cap',
    badge: (val) => `Max ${val}%`,
    explanation:
      'The absolute maximum percentage score any job can receive if it triggers any of your Disqualifiers & Dealbreakers (e.g. maternity cover, internship, temporary contract). Regardless of other high match criteria, matching a dealbreaker caps the score at this threshold.',
    min: 0,
    max: 25,
    color: 'rose',
  },
];

/**
 * Interactive Chip / Tag Input Component.
 * Users add keywords/terms simply by typing and pressing Enter or Comma.
 * No regex syntax required.
 */
function TagChipInput({
  items,
  onChange,
  placeholder = '+ Add keyword (press Enter)...',
  theme = 'indigo',
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  theme?: TagColorTheme;
}) {
  const [inputVal, setInputVal] = useState('');
  const colors = THEME_CLASSES[theme];

  const handleAdd = () => {
    const trimmed = inputVal.trim();
    if (!trimmed) return;
    if (!items.includes(trimmed)) {
      onChange([...items, trimmed]);
    }
    setInputVal('');
  };

  const handleRemove = (itemToRemove: string) => {
    onChange(items.filter((item) => item !== itemToRemove));
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700/80 bg-[#111215] p-2.5 min-h-[48px] transition-all ${colors.border}`}
    >
      {items.map((item) => (
        <span
          key={item}
          className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors select-none ${colors.chip}`}
        >
          <span>{item}</span>
          <button
            type="button"
            onClick={() => handleRemove(item)}
            className={`cursor-pointer transition-colors ${colors.close}`}
            title={`Remove ${item}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            handleAdd();
          }
        }}
        onBlur={handleAdd}
        placeholder={placeholder}
        className="min-w-[160px] flex-1 bg-transparent px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
      />
    </div>
  );
}

function RuleCard({
  onRemove,
  children,
}: {
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-3.5">{children}</div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-0.5 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-white/[0.08]"
          title="Remove rule"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-[#111215] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-indigo-500 hover:text-white transition-colors cursor-pointer"
    >
      <Plus className="size-3.5" />
      {label}
    </button>
  );
}

export const ScoringRulesEditor: React.FC<ScoringRulesEditorProps> = ({ value, onChange, jobs }) => {
  const { t } = useTranslation();
  const rules = value || EMPTY_RULES;

  // Resolve disqualifiers (fallback to irish_language_patterns if migrating)
  const disqualifiers =
    rules.disqualifiers && rules.disqualifiers.length > 0
      ? rules.disqualifiers
      : rules.irish_language_patterns && rules.irish_language_patterns.length > 0
        ? rules.irish_language_patterns
        : DEFAULT_DISQUALIFIERS;

  // Resolve weights
  const weights = React.useMemo<ScoringWeights>(
    () => ({
      ...DEFAULT_WEIGHTS,
      ...(rules.weights || {}),
    }),
    [rules.weights]
  );

  const previewMatches = React.useMemo(() => {
    if (!jobs || jobs.length === 0) return [];
    return jobs
      .filter((j) => j.sub_scores || j.ai_analysis?.sub_scores)
      .map((j) => recalculateJob(j, weights))
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, 3);
  }, [jobs, weights]);

  const updatePositive = (next: ScoringDomainRule[]) =>
    onChange({ ...rules, positive_domains: next });

  const updateNegative = (next: NegativeDomainRule[]) =>
    onChange({ ...rules, negative_domains: next });

  const updateTiers = (next: SeniorityTierRule[]) =>
    onChange({ ...rules, seniority_tiers: next });

  const updateDisqualifiers = (next: string[]) =>
    onChange({ ...rules, disqualifiers: next, irish_language_patterns: next });

  const updateWeights = (nextWeights: ScoringWeights) =>
    onChange({ ...rules, weights: nextWeights });

  const handleWeightChange = (key: keyof ScoringWeights, val: number) => {
    updateWeights({
      ...weights,
      [key]: val,
    });
  };

  const resetWeights = () => {
    updateWeights(DEFAULT_WEIGHTS);
  };

  return (
    <div className="space-y-8">
      {/* ========================================================================= */}
      {/* 1. SCORING WEIGHTS & POINT DISTRIBUTION (ONE ITEM PER ROW)                 */}
      {/* ========================================================================= */}
      <div className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 lg:p-6">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="flex items-center gap-2.5">
            <Sliders className="size-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-zinc-100 tracking-tight uppercase">
              {t('profile.scoring.weightsTitle')}
            </h3>
          </div>
          <button
            type="button"
            onClick={resetWeights}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer px-2.5 py-1 rounded-lg border border-zinc-700/80 hover:border-zinc-600 bg-[#111215]"
            title={t('profile.scoring.resetTitle')}
          >
            <RotateCcw className="size-3" />
            {t('profile.scoring.reset')}
          </button>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          {t('profile.scoring.weightsDescription')}
        </p>

        <div className="space-y-3.5 pt-2">
          {WEIGHT_CONFIGS.map((cfg) => {
            const currentVal = Number(weights[cfg.key] ?? DEFAULT_WEIGHTS[cfg.key] ?? 0);
            const theme = THEME_CLASSES[cfg.color];

            return (
              <div
                key={cfg.key}
                className="rounded-xl border border-white/[0.12] bg-[#16171b] p-4 sm:p-5 hover:border-white/[0.2] transition-all space-y-3.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 max-w-3xl">
                    <h4 className="text-sm font-semibold text-zinc-100">
                      {t(`profile.scoring.weights.${cfg.key}.title`, { defaultValue: cfg.title })}
                    </h4>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {t(`profile.scoring.weights.${cfg.key}.description`, { defaultValue: cfg.explanation })}
                    </p>
                  </div>
                  <div className="shrink-0 self-start sm:self-center">
                    <span
                      className={`inline-flex items-center justify-center min-w-[84px] px-3 py-1.5 rounded-lg border font-mono text-sm font-semibold ${theme.chip}`}
                    >
                      {cfg.badge(currentVal)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4 pt-1">
                  <span className="text-xs font-mono text-zinc-400 w-8 text-right shrink-0">
                    {cfg.min}
                  </span>
                  <input
                    type="range"
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step || 1}
                    value={currentVal}
                    onChange={(e) => handleWeightChange(cfg.key, Number(e.target.value))}
                    className="w-full h-2 rounded-lg bg-zinc-800 accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-zinc-400 w-8 shrink-0">
                    {cfg.max}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {previewMatches.length > 0 && (
          <div className="mt-5 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                <Sparkles className="size-4 text-indigo-400" />
                {t('profile.scoring.previewTitle')}
              </span>
              <span className="text-[11px] text-zinc-300">
                {t('profile.scoring.previewDescription')}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {previewMatches.map((j) => (
                <div
                  key={j.id}
                  className="rounded-lg border border-zinc-700/80 bg-[#111215] p-3.5 space-y-1.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-100 line-clamp-1">
                      {j.title}
                    </span>
                    <span className="shrink-0 text-xs font-mono font-bold text-indigo-300 px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30">
                      {j.relevance}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-300">
                    <span className="truncate max-w-[150px]">{j.company}</span>
                    <span className="text-zinc-400 text-[11px]">{j.fit_tier}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. DISQUALIFIERS & DEALBREAKERS                                           */}
      {/* ========================================================================= */}
      <div className="space-y-3.5 rounded-xl border border-rose-900/40 bg-rose-950/15 p-5 lg:p-6">
        <div className="flex items-center gap-2.5 border-b border-rose-900/30 pb-3">
          <ShieldAlert className="size-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-rose-200 tracking-tight uppercase">
            {t('profile.scoring.disqualifiersTitle')}
          </h3>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          {t('profile.scoring.disqualifiersDescription', { cap: weights.disqualification_cap })}
        </p>

        <TagChipInput
          items={disqualifiers}
          onChange={updateDisqualifiers}
          placeholder={t('profile.scoring.addDisqualifier')}
          theme="rose"
        />
      </div>

      {/* ========================================================================= */}
      {/* 3. POSITIVE ALIGNMENT RULES                                               */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-zinc-200 tracking-tight uppercase">
              {t('profile.scoring.positiveRulesTitle')}
            </h3>
          </div>
          <AddButton
            label={t('profile.scoring.addPositiveDomain')}
            onClick={() =>
              updatePositive([
                ...rules.positive_domains,
                { name: '', keywords: [], note: '' },
              ])
            }
          />
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          {t('profile.scoring.positiveRulesDescription')}
        </p>

        {rules.positive_domains.map((domain, i) => {
          const terms = domain.keywords && domain.keywords.length > 0
            ? domain.keywords
            : (domain.patterns || []);

          return (
            <RuleCard
              key={i}
              onRemove={() => updatePositive(rules.positive_domains.filter((_, idx) => idx !== i))}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label className={labelClass}>{t('profile.scoring.domainName')}</label>
                  <input
                    type="text"
                    placeholder={t('profile.scoring.domainNamePlaceholder')}
                    className={fieldClass}
                    value={domain.name}
                    onChange={(e) => {
                      const next = [...rules.positive_domains];
                      next[i] = { ...domain, name: e.target.value };
                      updatePositive(next);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>{t('profile.scoring.alignmentNote')}</label>
                  <input
                    type="text"
                    placeholder={t('profile.scoring.alignmentNotePlaceholder')}
                    className={fieldClass}
                    value={domain.note}
                    onChange={(e) => {
                      const next = [...rules.positive_domains];
                      next[i] = { ...domain, note: e.target.value };
                      updatePositive(next);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className={labelClass}>{t('profile.scoring.matchingTerms')}</label>
                <TagChipInput
                  items={terms}
                  onChange={(newTerms) => {
                    const next = [...rules.positive_domains];
                    next[i] = { ...domain, keywords: newTerms, patterns: newTerms };
                    updatePositive(next);
                  }}
                  placeholder={t('profile.scoring.addTerm')}
                  theme="indigo"
                />
              </div>
            </RuleCard>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 4. MISMATCH / EXCLUSION RULES                                             */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-200 tracking-tight uppercase">
              {t('profile.scoring.exclusionRulesTitle')}
            </h3>
          </div>
          <AddButton
            label={t('profile.scoring.addExclusionRule')}
            onClick={() =>
              updateNegative([
                ...rules.negative_domains,
                { name: '', keywords: [], reason: '' },
              ])
            }
          />
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          {t('profile.scoring.exclusionRulesDescription')}
        </p>

        {rules.negative_domains.map((domain, i) => {
          const terms = domain.keywords && domain.keywords.length > 0
            ? domain.keywords
            : (domain.patterns || []);

          return (
            <RuleCard
              key={i}
              onRemove={() => updateNegative(rules.negative_domains.filter((_, idx) => idx !== i))}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label className={labelClass}>{t('profile.scoring.focusArea')}</label>
                  <input
                    type="text"
                    placeholder={t('profile.scoring.focusAreaPlaceholder')}
                    className={fieldClass}
                    value={domain.name}
                    onChange={(e) => {
                      const next = [...rules.negative_domains];
                      next[i] = { ...domain, name: e.target.value };
                      updateNegative(next);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>{t('profile.scoring.mismatchReason')}</label>
                  <input
                    type="text"
                    placeholder={t('profile.scoring.mismatchReasonPlaceholder')}
                    className={fieldClass}
                    value={domain.reason}
                    onChange={(e) => {
                      const next = [...rules.negative_domains];
                      next[i] = { ...domain, reason: e.target.value };
                      updateNegative(next);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className={labelClass}>{t('profile.scoring.exclusionTerms')}</label>
                <TagChipInput
                  items={terms}
                  onChange={(newTerms) => {
                    const next = [...rules.negative_domains];
                    next[i] = { ...domain, keywords: newTerms, patterns: newTerms };
                    updateNegative(next);
                  }}
                  placeholder={t('profile.scoring.addExclusionTerm')}
                  theme="amber"
                />
              </div>
            </RuleCard>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 5. SENIORITY TIERS                                                        */}
      {/* ========================================================================= */}
      {/* 4. Seniority Alignment Rules */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200 tracking-tight uppercase">
            {t('profile.scoring.seniorityRulesTitle')}
          </h3>
          <AddButton
            label={t('profile.scoring.addSeniorityRule')}
            onClick={() =>
              updateTiers([
                ...rules.seniority_tiers,
                { name: '', keywords: [], score_weight: 1.0, note: '' },
              ])
            }
          />
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          {t('profile.scoring.seniorityRulesDescription')}
        </p>

        {rules.seniority_tiers.map((tier, i) => {
          const terms = tier.keywords && tier.keywords.length > 0
            ? tier.keywords
            : (tier.patterns || []);

          return (
            <RuleCard
              key={i}
              onRemove={() => updateTiers(rules.seniority_tiers.filter((_, idx) => idx !== i))}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label className={labelClass}>{t('profile.scoring.seniorityLevel')}</label>
                  <input
                    type="text"
                    placeholder={t('profile.scoring.seniorityLevelPlaceholder')}
                    className={fieldClass}
                    value={tier.name}
                    onChange={(e) => {
                      const next = [...rules.seniority_tiers];
                      next[i] = { ...tier, name: e.target.value, score_weight: tier.score_weight ?? 1.0 };
                      updateTiers(next);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>{t('profile.scoring.alignmentNote')}</label>
                  <input
                    type="text"
                    placeholder={t('profile.scoring.seniorityNotePlaceholder')}
                    className={fieldClass}
                    value={tier.note}
                    onChange={(e) => {
                      const next = [...rules.seniority_tiers];
                      next[i] = { ...tier, note: e.target.value, score_weight: tier.score_weight ?? 1.0 };
                      updateTiers(next);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className={labelClass}>{t('profile.scoring.matchingTitleKeywords')}</label>
                <TagChipInput
                  items={terms}
                  onChange={(newTerms) => {
                    const next = [...rules.seniority_tiers];
                    next[i] = { ...tier, keywords: newTerms, patterns: newTerms, score_weight: tier.score_weight ?? 1.0 };
                    updateTiers(next);
                  }}
                  placeholder={t('profile.scoring.addTitleKeyword')}
                  theme="purple"
                />
              </div>
            </RuleCard>
          );
        })}
      </div>
    </div>
  );
};
