import React from 'react';
import {
  ExternalLink,
  Briefcase,
  Sparkles,
  Loader2,
  X,
  Building2,
  AlertCircle,
  Check,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { Job, JobStatus } from '../../types/job';
import { StatusPill, MatchScoreBadge } from '../ui/StatusPill';
import { useJobDetailQuery } from '../../hooks/useQueries';
import { formatJobDescription } from '../../lib/formatDescription';
import { cn, toSafeHttpUrl } from '../../lib/utils';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/i18n';
import { EmptyState } from '../../design-system';

interface AiAnalysisData {
  fit_tier?: string;
  role_domain?: string;
  seniority_level?: string;
  salary_fit?: string;
  reasoning?: string;
  alignments?: string[];
  mismatch_flags?: string[];
}

interface JobDetailInspectorProps {
  job: Job | null;
  onClose?: () => void;
  onUpdateStatus: (job: Job, status: JobStatus) => Promise<void>;
  isUpdating?: boolean;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  userEmail?: string | null;
}

export const JobDetailInspector: React.FC<JobDetailInspectorProps> = ({
  job,
  onClose,
  onUpdateStatus,
  isUpdating = false,
  isFullScreen = false,
  onToggleFullScreen,
  userEmail,
}) => {
  const { t, i18n } = useTranslation();
  const needsDetail = Boolean(job?.id) && (!job?.description || !job?.ai_analysis);
  const { data: detail, isLoading: isLoadingDetail } = useJobDetailQuery(
    job?.id,
    userEmail,
    needsDetail
  );

  const mergedJob = React.useMemo(() => {
    if (!job) return null;
    return {
      ...job,
      description: job.description || detail?.description,
      ai_analysis: detail?.ai_analysis || job.ai_analysis,
    };
  }, [job, detail]);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isFullScreen && scrollContainerRef.current) {
      scrollContainerRef.current.focus();
    }
  }, [isFullScreen, job?.id]);

  const formattedDescription = React.useMemo(() => {
    return formatJobDescription(mergedJob?.description);
  }, [mergedJob?.description]);

  const ai = React.useMemo(() => {
    if (!mergedJob) return null;
    let parsed: unknown = mergedJob.ai_analysis;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = {};
      }
    }
    const aiObj = (parsed && typeof parsed === 'object' ? parsed : {}) as AiAnalysisData;

    const fitTier =
      mergedJob.fit_tier ||
      aiObj.fit_tier ||
      (mergedJob.relevance >= 75
        ? 'Strong Match'
        : mergedJob.relevance >= 50
          ? 'Good Match'
          : mergedJob.relevance >= 20
            ? 'Moderate Match'
            : 'Mismatch');

    const roleDomain =
      mergedJob.role_domain || aiObj.role_domain || 'General';
    const seniorityLevel =
      mergedJob.seniority_level || aiObj.seniority_level || 'Not specified';
    const salaryFit =
      aiObj.salary_fit || (mergedJob.salary_text ? `${mergedJob.salary_text}` : 'Not disclosed');

    let reasoning = aiObj.reasoning;
    if (!reasoning) {
      if (mergedJob.relevance >= 75) {
        reasoning = `High alignment (${mergedJob.relevance}%): Strongly matches target domain (${roleDomain}) and seniority profile (${seniorityLevel}). Evaluated against target criteria and compensation benchmark.`;
      } else if (mergedJob.relevance >= 50) {
        reasoning = `Good alignment (${mergedJob.relevance}%): Compatible role in ${roleDomain} at ${seniorityLevel} tier.`;
      } else if (mergedJob.relevance >= 20) {
        reasoning = `Moderate alignment (${mergedJob.relevance}%): Partial synergy in ${roleDomain}.`;
      } else {
        reasoning = `Compatibility score: ${mergedJob.relevance}% for ${roleDomain}.`;
      }
    }

    const rawAlignments = Array.isArray(aiObj.alignments) ? aiObj.alignments : [];
    const alignments: string[] = rawAlignments
      .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item: string) => item.trim());

    if (alignments.length === 0 && mergedJob.relevance >= 20) {
      alignments.push(`Matches target criteria in ${roleDomain}.`);
      if (mergedJob.salary_text) {
        alignments.push(`Disclosed compensation: ${mergedJob.salary_text}.`);
      }
      if (mergedJob.matched_skills && mergedJob.matched_skills.length > 0) {
        alignments.push(`Core skills identified: ${mergedJob.matched_skills.slice(0, 4).join(', ')}`);
      }
    }

    const rawMismatch = Array.isArray(aiObj.mismatch_flags) ? aiObj.mismatch_flags : [];
    const mismatchFlags: string[] = rawMismatch
      .filter((flag: unknown): flag is string => typeof flag === 'string' && flag.trim().length > 0)
      .map((flag: string) => flag.trim());

    return {
      fitTier,
      roleDomain,
      seniorityLevel,
      salaryFit,
      reasoning,
      alignments,
      mismatchFlags,
    };
  }, [mergedJob]);

  const safeApplyUrl = React.useMemo(() => toSafeHttpUrl(job?.url), [job?.url]);

  if (!job || !ai) {
    return (
      <EmptyState
        icon={Briefcase}
        title={t('jobs.inspector.noOpportunitySelected', 'No opportunity selected')}
        description={
          <span>
            {t('jobs.inspector.selectPrompt', 'Select an opportunity from the list or press')}{' '}
            <kbd className="rounded border border-ds-border bg-ds-workspace px-1 font-mono text-[10px] text-ds-text-secondary">↑</kbd>{' '}
            /{' '}
            <kbd className="rounded border border-ds-border bg-ds-workspace px-1 font-mono text-[10px] text-ds-text-secondary">↓</kbd>{' '}
            {t('shortcuts.cycle', 'to navigate')}.
          </span>
        }
        className="flex h-full flex-col items-center justify-center border-none bg-transparent p-8 shadow-none"
      />
    );
  }

  return (
    <div className={cn('flex h-full flex-col overflow-hidden text-ds-text-primary', isFullScreen ? 'bg-ds-workspace' : 'bg-ds-panel')}>
      {/* Top Header Bar */}
      <div className={cn('border-b border-ds-border p-5 shrink-0 bg-ds-panel', isFullScreen && 'px-6 sm:px-8 py-5 bg-ds-workspace')}>
        <div className={cn('w-full', isFullScreen && 'max-w-5xl mx-auto')}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-ds-text-secondary">
                  <Building2 className="size-3 text-ds-text-muted" />
                  {job.company || 'Public Sector'}
                </span>
                <span className="text-ds-text-muted">·</span>
                <span className="text-xs font-mono text-ds-text-muted">{job.source}</span>
                <StatusPill status={job.status} />
                <MatchScoreBadge score={job.relevance} />
              </div>

              <h2 className={cn('font-semibold tracking-tight text-ds-text-primary leading-snug', isFullScreen ? 'text-xl sm:text-2xl' : 'text-lg')}>
                {job.title}
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onToggleFullScreen && (
                <button
                  type="button"
                  onClick={onToggleFullScreen}
                  className="rounded-md p-1.5 text-ds-text-secondary hover:bg-ds-hover hover:text-ds-text-primary transition-colors cursor-pointer"
                  aria-label={isFullScreen ? t('jobs.inspector.exit') : t('jobs.inspector.expand')}
                  title={isFullScreen ? t('jobs.inspector.exit') : t('jobs.inspector.expand')}
                >
                  {isFullScreen ? (
                    <Minimize2 className="size-4" />
                  ) : (
                    <Maximize2 className="size-4" />
                  )}
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md p-1.5 text-ds-text-secondary hover:bg-ds-hover hover:text-ds-text-primary transition-colors cursor-pointer"
                  aria-label={t('jobs.inspector.close')}
                  title={t('jobs.inspector.close')}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          {/* Action Controls & External Link */}
          <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-ds-border pt-3 flex-wrap sm:flex-nowrap">
            {/* Quick status segment */}
            <div
              role="group"
              aria-label={t('jobs.inspector.statusGroup', 'Job status selection')}
              className="grid grid-cols-5 sm:flex sm:items-center rounded-lg border border-ds-border bg-ds-panel p-0.5 w-full sm:w-auto"
            >
              {[
                { id: 'new', label: t('status.new'), shortLabel: t('status.short.new', { defaultValue: 'New' }) },
                { id: 'applied', label: t('status.applied'), shortLabel: t('status.short.applied', { defaultValue: 'Applied' }) },
                { id: 'interviewing', label: t('status.interviewing'), shortLabel: t('status.short.interviewing', { defaultValue: 'Interview' }) },
                { id: 'interested', label: t('status.interested'), shortLabel: t('status.short.interested', { defaultValue: 'Interested' }) },
                { id: 'not_interested', label: t('status.not_interested'), shortLabel: t('status.short.not_interested', { defaultValue: 'Not Int.' }) },
              ].map(({ id, label, shortLabel }) => {
                const active = job.status === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={isUpdating}
                    aria-pressed={active}
                    onClick={() =>
                      void onUpdateStatus(job, id as JobStatus)
                    }
                    className={`flex items-center justify-center px-1 sm:px-3 py-1.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer text-center truncate ${
                      active
                        ? 'bg-ds-hover text-ds-text-primary shadow-xs border border-ds-border-strong'
                        : 'text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-hover'
                    }`}
                    title={label}
                  >
                    <span className="sm:hidden truncate">{shortLabel}</span>
                    <span className="hidden sm:inline whitespace-nowrap">{label}</span>
                  </button>
                );
              })}
            </div>

            {safeApplyUrl ? (
              <a
                href={safeApplyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1.5 rounded-md border border-ds-border-strong bg-ds-action-primary hover:bg-ds-text-secondary active:scale-[0.98] px-3.5 py-1.5 text-xs font-semibold text-ds-action-primary-text transition-all cursor-pointer shadow-xs"
                title="Open application page"
              >
                <span>{t('common.apply')}</span>
                <ExternalLink className="size-3.5 text-ds-action-primary-text shrink-0" />
                <span className="sr-only"> ({t('common.opensInNewWindow', 'opens in new tab')})</span>
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="w-full sm:w-auto shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1.5 rounded-md border border-ds-border bg-ds-control opacity-50 px-3.5 py-1.5 text-xs font-semibold text-ds-text-muted cursor-not-allowed shadow-xs"
                title="No valid application URL"
              >
                <span>{t('common.apply')}</span>
                <ExternalLink className="size-3.5 text-ds-text-muted shrink-0" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Scrollable Inspector Body */}
      <div
        ref={scrollContainerRef}
        data-inspector-scroll-body
        tabIndex={isFullScreen ? 0 : undefined}
        className={cn('flex-1 overflow-y-auto outline-none p-4 sm:p-5 pb-16 sm:pb-6', isFullScreen && 'sm:p-8 sm:pb-20')}
      >
        <div className={cn('space-y-4 sm:space-y-5', isFullScreen && 'max-w-5xl mx-auto')}>
          {/* Core Specs Grid */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-ds-border bg-ds-panel p-2.5 sm:p-3 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-medium text-ds-warning uppercase tracking-wider block">
                {t('jobs.inspector.matchFit')}
              </span>
              <p className="mt-1 font-mono text-xs sm:text-sm font-semibold text-ds-text-secondary">
                {job.relevance}% ({ai.fitTier})
              </p>
            </div>

            <div className="rounded-lg border border-ds-border bg-ds-panel p-2.5 sm:p-3 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-medium text-ds-text-muted uppercase tracking-wider block">
                {t('jobs.inspector.location')}
              </span>
              <p className="mt-1 text-xs font-medium text-ds-text-secondary line-clamp-2 leading-tight" title={job.location || 'Ireland'}>
                {job.location || 'Ireland'}
              </p>
            </div>

            <div className="rounded-lg border border-ds-border bg-ds-panel p-2.5 sm:p-3 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-medium text-ds-text-muted uppercase tracking-wider block">
                {t('jobs.inspector.salary')}
              </span>
              <p className="mt-1 font-mono text-xs font-medium text-ds-text-secondary line-clamp-2 leading-tight" title={job.salary_text || 'Competitive'}>
                {job.salary_text || 'Competitive'}
              </p>
            </div>

            <div className="rounded-lg border border-ds-border bg-ds-panel p-2.5 sm:p-3 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-medium text-ds-text-muted uppercase tracking-wider block">
                {t('jobs.inspector.employmentType')}
              </span>
              <p className="mt-1 text-xs font-medium text-ds-text-secondary line-clamp-2 leading-tight" title={job.employment_type || 'Permanent'}>
                {job.employment_type || 'Permanent'}
              </p>
            </div>
          </div>

          {/* AI Breakdown Card */}
          <div className="rounded-lg border border-ds-border bg-ds-panel p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ds-warning uppercase tracking-wider">
                <Sparkles className="size-3.5 text-ds-warning" />
                <span>{t('jobs.inspector.roleAssessment')}</span>
              </div>
              <span className="text-[11px] font-mono text-ds-text-secondary">{ai.roleDomain}</span>
            </div>

            <p className="text-xs leading-relaxed text-ds-text-secondary">
              {ai.reasoning}
            </p>

            {ai.alignments.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-ds-border">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ds-warning">
                  {t('jobs.inspector.keyAlignments')}
                </span>
                {ai.alignments.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-ds-text-secondary">
                    <Check className="size-3 text-ds-warning shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {ai.mismatchFlags.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-ds-border">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ds-negative">
                  {t('jobs.inspector.mismatchFlags')}
                </span>
                {ai.mismatchFlags.map((flag, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-ds-negative/90">
                    <AlertCircle className="size-3 text-ds-negative shrink-0 mt-0.5" />
                    <span>{flag}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Matched Keywords */}
          {job.matched_skills && job.matched_skills.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ds-text-muted">
                Matched Candidate Competencies
              </span>
              <div className="flex flex-wrap gap-1.5">
                {job.matched_skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded border border-ds-border-strong bg-ds-panel px-2 py-0.5 font-mono text-xs text-ds-text-secondary"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Job Description Specification */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ds-text-muted">
                {t('jobs.inspector.fullDescription')}
              </span>
              <span className="text-[11px] font-mono text-ds-text-muted">
                {t('jobs.inspector.discovered', { date: formatDate(job.last_seen_at, i18n.language) })}
              </span>
            </div>

            <div className={cn('rounded-lg border border-ds-border bg-ds-panel p-4 text-xs leading-relaxed text-ds-text-secondary whitespace-pre-line select-text font-sans', isFullScreen && 'sm:text-sm sm:p-6')}>
              {formattedDescription ? (
                formattedDescription
              ) : isLoadingDetail ? (
                <div className="flex flex-col items-center justify-center py-8 text-ds-text-muted space-y-2">
                  <Loader2 className="size-4 animate-spin text-ds-text-muted" />
                  <span className="text-xs">{t('jobs.inspector.loadingDescription')}</span>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-ds-text-muted">
                  {t('jobs.inspector.noDescription')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
