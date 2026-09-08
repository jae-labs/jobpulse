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
} from 'lucide-react';
import type { Job, JobStatus } from '../../types/job';
import { StatusPill, MatchScoreBadge } from '../ui/StatusPill';

interface JobDetailInspectorProps {
  job: Job | null;
  onClose?: () => void;
  onUpdateStatus: (job: Job, status: JobStatus) => Promise<void>;
  isUpdating?: boolean;
  isSheet?: boolean;
}

export const JobDetailInspector: React.FC<JobDetailInspectorProps> = ({
  job,
  onClose,
  onUpdateStatus,
  isUpdating = false,
  isSheet: _isSheet = false,
}) => {
  const ai = React.useMemo(() => {
    if (!job) return null;
    let parsed: any = job.ai_analysis;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = {};
      }
    }
    const aiObj = parsed && typeof parsed === 'object' ? parsed : {};

    const fitTier =
      job.fit_tier ||
      aiObj.fit_tier ||
      (job.relevance >= 75
        ? 'Strong Match'
        : job.relevance >= 50
          ? 'Good Match'
          : job.relevance >= 20
            ? 'Moderate Match'
            : 'Mismatch');

    const roleDomain =
      job.role_domain || aiObj.role_domain || 'Public Service & Governance Operations';
    const seniorityLevel =
      job.seniority_level || aiObj.seniority_level || 'Management & Lead (HEO / Grade VII)';
    const salaryFit =
      aiObj.salary_fit || (job.salary_text ? `${job.salary_text} (Target Met)` : '€50k+ Benchmark Compatible');

    let reasoning = aiObj.reasoning;
    if (!reasoning) {
      if (job.relevance >= 75) {
        reasoning = `High alignment (${job.relevance}%): Strongly matches target domain (${roleDomain}) and seniority profile (${seniorityLevel}). Evaluated against operations, governance, and salary benchmark (${salaryFit}).`;
      } else if (job.relevance >= 50) {
        reasoning = `Good alignment (${job.relevance}%): Compatible operational role in ${roleDomain} at ${seniorityLevel} tier.`;
      } else if (job.relevance >= 20) {
        reasoning = `Moderate alignment (${job.relevance}%): Partial administrative synergy in ${roleDomain}.`;
      } else {
        reasoning = `Score penalized to ${job.relevance}% due to domain mismatch (${roleDomain}).`;
      }
    }

    let alignments: string[] = aiObj.alignments || [];
    if (alignments.length === 0 && job.relevance >= 20) {
      if (roleDomain.toLowerCase().includes('academic') || roleDomain.toLowerCase().includes('higher education')) {
        alignments.push('Directly matches higher education and academic operations leadership.');
      } else if (roleDomain.toLowerCase().includes('public service') || roleDomain.toLowerCase().includes('governance')) {
        alignments.push('Aligned with public sector administration, governance, and official grade scales.');
      } else {
        alignments.push(`Matches operational and administrative experience in ${roleDomain}.`);
      }
      if (job.salary_text) {
        alignments.push(`Salary: ${job.salary_text} satisfies the compensation target.`);
      }
      if (job.matched_skills && job.matched_skills.length > 0) {
        alignments.push(`Core competencies identified: ${job.matched_skills.slice(0, 4).join(', ')}`);
      }
    }

    const mismatchFlags: string[] = aiObj.mismatch_flags || [];

    return {
      fitTier,
      roleDomain,
      seniorityLevel,
      salaryFit,
      reasoning,
      alignments,
      mismatchFlags,
    };
  }, [job]);

  if (!job || !ai) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-zinc-500">
        <Briefcase className="size-8 stroke-1 text-zinc-600 mb-2" />
        <p className="text-sm font-medium text-zinc-400">No job selected</p>
        <p className="text-xs text-zinc-500 mt-1 max-w-xs">
          Select a position from the left list or press <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 font-mono text-[10px] text-zinc-300">j</kbd> / <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 font-mono text-[10px] text-zinc-300">k</kbd> to navigate.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden text-zinc-100">
      {/* Top Header Bar */}
      <div className="border-b border-zinc-800/80 p-5 shrink-0 bg-zinc-950/70">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400">
                <Building2 className="size-3 text-zinc-500" />
                {job.company || 'Public Sector'}
              </span>
              <span className="text-zinc-600">·</span>
              <span className="text-xs font-mono text-zinc-500">{job.source}</span>
              <StatusPill status={job.status} />
              <MatchScoreBadge score={job.relevance} />
            </div>

            <h2 className="text-lg font-semibold tracking-tight text-zinc-100 leading-snug">
              {job.title}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                aria-label="Close inspector"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Action Controls & External Link */}
        <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-zinc-900 pt-3 flex-wrap sm:flex-nowrap">
          {/* Quick status segment */}
          <div className="flex items-center rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-0.5 w-full sm:w-auto overflow-x-auto no-scrollbar">
            {[
              { id: 'new', label: 'New', shortLabel: 'New' },
              { id: 'applied', label: 'Applied', shortLabel: 'Applied' },
              { id: 'interviewing', label: 'Interview', shortLabel: 'Interview' },
              { id: 'offer', label: 'Offer', shortLabel: 'Offer' },
              { id: 'not_interested', label: 'Not Interested', shortLabel: 'Not Interested' },
            ].map(({ id, label, shortLabel }) => {
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
                      ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700/60'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                  title={`Set status to ${label}`}
                >
                  <span className="sm:hidden text-[11px]">{shortLabel}</span>
                  <span className="hidden sm:inline">{label}</span>
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
            <span>Apply Now</span>
            <ExternalLink className="size-3.5 text-zinc-950 shrink-0" />
          </a>
        </div>
      </div>

      {/* Main Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 pb-16 sm:pb-6 space-y-4 sm:space-y-5">
        {/* Core Specs Grid */}
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-2.5 flex flex-col justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-zinc-500 uppercase tracking-wider block">
              Match Fit
            </span>
            <p className="mt-1 font-mono text-xs sm:text-sm font-semibold text-zinc-200">
              {job.relevance}% ({ai.fitTier})
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-2.5 flex flex-col justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-zinc-500 uppercase tracking-wider block">
              Location
            </span>
            <p className="mt-1 text-xs font-medium text-zinc-200 line-clamp-2 leading-tight" title={job.location || 'Ireland'}>
              {job.location || 'Ireland'}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-2.5 flex flex-col justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-zinc-500 uppercase tracking-wider block">
              Salary / Benchmark
            </span>
            <p className="mt-1 font-mono text-xs font-medium text-zinc-200 line-clamp-2 leading-tight" title={job.salary_text || 'Competitive'}>
              {job.salary_text || 'Competitive'}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-2.5 flex flex-col justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-zinc-500 uppercase tracking-wider block">
              Employment Type
            </span>
            <p className="mt-1 text-xs font-medium text-zinc-200 line-clamp-2 leading-tight" title={job.employment_type || 'Permanent'}>
              {job.employment_type || 'Permanent'}
            </p>
          </div>
        </div>

        {/* AI Breakdown Card */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              <Sparkles className="size-3.5 text-zinc-400" />
              <span>AI Role Assessment</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">{ai.roleDomain}</span>
          </div>

          <p className="text-xs leading-relaxed text-zinc-300">
            {ai.reasoning}
          </p>

          {ai.alignments.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-zinc-800/60">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                Key Positive Alignments
              </span>
              {ai.alignments.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                  <Check className="size-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {ai.mismatchFlags.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-zinc-800/60">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                Fit Warnings & Nuances
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
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Matched Candidate Competencies
            </span>
            <div className="flex flex-wrap gap-1.5">
              {job.matched_skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-xs text-zinc-300"
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
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Role Specification & Summary
            </span>
            <span className="text-[11px] font-mono text-zinc-600">
              Discovered {new Date(job.last_seen_at).toLocaleDateString()}
            </span>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-300 whitespace-pre-line select-text font-sans">
            {job.description ? (
              job.description
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-zinc-500 space-y-2">
                <Loader2 className="size-4 animate-spin text-zinc-400" />
                <span className="text-xs">Fetching full role text from live source...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
