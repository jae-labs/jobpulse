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
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/i18n';

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
  isSheet?: boolean;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  userEmail?: string | null;
}

export const JobDetailInspector: React.FC<JobDetailInspectorProps> = ({
  job,
  onClose,
  onUpdateStatus,
  isUpdating = false,
  isSheet: _isSheet = false,
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

  if (!job || !ai) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-zinc-500">
        <Briefcase className="size-8 stroke-1 text-zinc-600 mb-2" />
        <p className="text-sm font-medium text-zinc-400">No opportunity selected</p>
        <p className="text-xs text-zinc-500 mt-1 max-w-xs">
          Select an opportunity from the list or press <kbd className="rounded border border-white/[0.08] bg-[#111215] px-1 font-mono text-[10px] text-zinc-300">↑</kbd> / <kbd className="rounded border border-white/[0.08] bg-[#111215] px-1 font-mono text-[10px] text-zinc-300">↓</kbd> to navigate.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col overflow-hidden text-zinc-100', isFullScreen ? 'bg-[#111215]' : 'bg-[#16171b]')}>
      {/* Top Header Bar */}
      <div className={cn('border-b border-white/[0.08] p-5 shrink-0 bg-[#16171b]', isFullScreen && 'px-6 sm:px-8 py-5 bg-[#111215]')}>
        <div className={cn('w-full', isFullScreen && 'max-w-5xl mx-auto')}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-300">
                  <Building2 className="size-3 text-zinc-400" />
                  {job.company || 'Public Sector'}
                </span>
                <span className="text-zinc-500">·</span>
                <span className="text-xs font-mono text-zinc-400">{job.source}</span>
                <StatusPill status={job.status} />
                <MatchScoreBadge score={job.relevance} />
              </div>

              <h2 className={cn('font-semibold tracking-tight text-zinc-100 leading-snug', isFullScreen ? 'text-xl sm:text-2xl' : 'text-lg')}>
                {job.title}
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onToggleFullScreen && (
                <button
                  type="button"
                  onClick={onToggleFullScreen}
                  className="rounded-md p-1.5 text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
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
                  className="rounded-md p-1.5 text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                  aria-label={t('jobs.inspector.close')}
                  title={t('jobs.inspector.close')}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          {/* Action Controls & External Link */}
          <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 flex-wrap sm:flex-nowrap">
            {/* Quick status segment */}
            <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#16171b] p-0.5 w-full sm:w-auto overflow-x-auto no-scrollbar">
              {[
                { id: 'new', label: t('status.new') },
                { id: 'applied', label: t('status.applied') },
                { id: 'interviewing', label: t('status.interviewing') },
                { id: 'interested', label: t('status.interested') },
                { id: 'not_interested', label: t('status.not_interested') },
              ].map(({ id, label }) => {
                const active = job.status === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={isUpdating}
                    onClick={() =>
                      void onUpdateStatus(job, id as JobStatus)
                    }
                    className={`flex-1 sm:flex-none flex items-center justify-center px-2.5 sm:px-3 py-1.5 sm:py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white/[0.12] text-zinc-100 shadow-xs border border-white/[0.12]'
                        : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                    }`}
                    title={label}
                  >
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-700 bg-white hover:bg-zinc-200 active:scale-[0.98] px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition-all cursor-pointer shadow-xs"
              title="Open application page"
            >
              <span>{t('common.apply')}</span>
              <ExternalLink className="size-3.5 text-zinc-950 shrink-0" />
            </a>
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
            <div className="rounded-lg border border-white/[0.08] bg-[#16171b] p-2.5 sm:p-3 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-medium text-yellow-400 uppercase tracking-wider block">
                {t('jobs.inspector.matchFit')}
              </span>
              <p className="mt-1 font-mono text-xs sm:text-sm font-semibold text-zinc-200">
                {job.relevance}% ({ai.fitTier})
              </p>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-[#16171b] p-2.5 sm:p-3 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
                {t('jobs.inspector.location')}
              </span>
              <p className="mt-1 text-xs font-medium text-zinc-200 line-clamp-2 leading-tight" title={job.location || 'Ireland'}>
                {job.location || 'Ireland'}
              </p>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-[#16171b] p-2.5 sm:p-3 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
                {t('jobs.inspector.salary')}
              </span>
              <p className="mt-1 font-mono text-xs font-medium text-zinc-200 line-clamp-2 leading-tight" title={job.salary_text || 'Competitive'}>
                {job.salary_text || 'Competitive'}
              </p>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-[#16171b] p-2.5 sm:p-3 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
                {t('jobs.inspector.employmentType')}
              </span>
              <p className="mt-1 text-xs font-medium text-zinc-200 line-clamp-2 leading-tight" title={job.employment_type || 'Permanent'}>
                {job.employment_type || 'Permanent'}
              </p>
            </div>
          </div>

          {/* AI Breakdown Card */}
          <div className="rounded-lg border border-white/[0.08] bg-[#16171b] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-yellow-400 uppercase tracking-wider">
                <Sparkles className="size-3.5 text-yellow-400" />
                <span>{t('jobs.inspector.roleAssessment')}</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-300">{ai.roleDomain}</span>
            </div>

            <p className="text-xs leading-relaxed text-zinc-200">
              {ai.reasoning}
            </p>

            {ai.alignments.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-yellow-400">
                  {t('jobs.inspector.keyAlignments')}
                </span>
                {ai.alignments.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-zinc-200">
                    <Check className="size-3 text-yellow-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {ai.mismatchFlags.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                  {t('jobs.inspector.mismatchFlags')}
                </span>
                {ai.mismatchFlags.map((flag, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-rose-300">
                    <AlertCircle className="size-3 text-rose-400 shrink-0 mt-0.5" />
                    <span>{flag}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Matched Keywords */}
          {job.matched_skills && job.matched_skills.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Matched Candidate Competencies
              </span>
              <div className="flex flex-wrap gap-1.5">
                {job.matched_skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded border border-white/[0.14] bg-[#16171b] px-2 py-0.5 font-mono text-xs text-zinc-200"
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
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                {t('jobs.inspector.fullDescription')}
              </span>
              <span className="text-[11px] font-mono text-zinc-400">
                {t('jobs.inspector.discovered', { date: formatDate(job.last_seen_at, i18n.language) })}
              </span>
            </div>

            <div className={cn('rounded-lg border border-white/[0.08] bg-[#16171b] p-4 text-xs leading-relaxed text-zinc-300 whitespace-pre-line select-text font-sans', isFullScreen && 'sm:text-sm sm:p-6')}>
              {formattedDescription ? (
                formattedDescription
              ) : isLoadingDetail ? (
                <div className="flex flex-col items-center justify-center py-8 text-zinc-500 space-y-2">
                  <Loader2 className="size-4 animate-spin text-zinc-400" />
                  <span className="text-xs">{t('jobs.inspector.loadingDescription')}</span>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-zinc-500">
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
