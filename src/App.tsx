import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { Session, RealtimeChannel } from '@supabase/supabase-js';
import { useLocation, useNavigate } from 'react-router-dom';

import { useTranslation } from 'react-i18next';

import type { Job, Profile, JobStatus } from './types/job';
import { DashboardSidebar } from './components/dashboard/DashboardSidebar';
import { dashboardNavigation, getNavLabel, type DashboardTab } from './components/dashboard/navigation';
import { ProjectSwitcher } from './components/dashboard/ProjectSwitcher';
import { UserProfileMenu } from './components/dashboard/UserAccountMenu';
import { OverviewView } from './components/dashboard/OverviewView';
import { Button } from './components/ui/button';
import { JobsView } from './components/jobs/JobsView';
import { CommandMenu } from './components/ui/CommandMenu';
import { BrandLogo } from './components/ui/BrandLogo';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

import { SourcesView } from './components/sources/SourcesView';
import { ProfileView } from './components/profile/ProfileView';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { DEFAULT_PROFILE } from './lib/defaultProfile';
import { checkUserAuthorization } from './components/auth/authConfig';
import { LoginView } from './components/auth/LoginView';
import { AccessDeniedView } from './components/auth/AccessDeniedView';
import { useQueryClient } from '@tanstack/react-query';
import { clearAppCache } from './lib/queryClient';
import {
  useOverviewMetricsQuery,
  useJobsQuery,
  useSourcesQuery,
  useProfileQuery,
  useUpdateJobStatusMutation,
  useSaveProfileMutation,
  queryKeys,
} from './hooks/useQueries';
import { recalculateJobs } from './lib/scoreCalculator';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(Boolean(supabase));
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: DashboardTab =
    dashboardNavigation.find((item) => item.path === location.pathname)?.id ?? 'overview';

  useEffect(() => {
    document.title = `${getNavLabel(t, activeTab)} | JobPulse`;
  }, [activeTab, t]);

  const setActiveTab = (tab: DashboardTab) => {
    const path = dashboardNavigation.find((item) => item.id === tab)!.path;
    if (path !== location.pathname) navigate(path);
  };
  const [notice, setNotice] = useState('');
  const [customDbError, setCustomDbError] = useState<string | null>(null);

  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | JobStatus>('all');
  const [selectedDomainFilter, setSelectedDomainFilter] = useState<string>('all');
  const [selectedMinMatch, setSelectedMinMatch] = useState<number>(0);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);

  const userEmail = session?.user?.email?.trim().toLowerCase();

  const isOverviewNeeded = activeTab === 'overview' || activeTab === 'jobs';
  const isJobsNeeded = activeTab === 'profile' || isCommandMenuOpen;

  const {
    data: overviewMetrics,
    isLoading: isOverviewLoading,
    error: overviewQueryError,
    refetch: refetchOverview,
  } = useOverviewMetricsQuery(userEmail, isAuthorized && isOverviewNeeded);

  const {
    data: rawJobs = [],
    isLoading: isJobsLoading,
    error: jobsQueryError,
    refetch: refetchJobs,
  } = useJobsQuery(userEmail, isAuthorized && isJobsNeeded);

  const isSourcesNeeded = activeTab === 'sources';

  const {
    data: sources = [],
    isLoading: isSourcesLoading,
  } = useSourcesQuery(isAuthorized && isSourcesNeeded);

  const {
    data: profile = DEFAULT_PROFILE,
  } = useProfileQuery(userEmail, isAuthorized);

  const jobs = useMemo(() => {
    return recalculateJobs(rawJobs, profile.scoring_rules?.weights);
  }, [rawJobs, profile.scoring_rules?.weights]);

  const updateJobStatusMutation = useUpdateJobStatusMutation(userEmail);
  const saveProfileMutation = useSaveProfileMutation(userEmail);

  const [selectedJobState, setSelectedJobState] = useState<Job | null>(null);
  const selectedJob =
    selectedJobId !== null && jobs.length > 0
      ? jobs.find((j) => j.id === selectedJobId) ?? selectedJobState
      : selectedJobState;

  const [isDbErrorDismissed, setIsDbErrorDismissed] = useState(false);

  const isUpdatingStatus = updateJobStatusMutation.isPending;
  const isLoading = isOverviewNeeded
    ? isOverviewLoading && !overviewMetrics
    : isJobsNeeded
      ? isJobsLoading && jobs.length === 0
      : isSourcesNeeded && isSourcesLoading;

  const activeQueryError = isOverviewNeeded ? overviewQueryError : jobsQueryError;
  const dbError =
    !isDbErrorDismissed &&
    (customDbError ||
      (activeQueryError
        ? `Unable to connect to Supabase: ${activeQueryError.message || 'Network error'}. Verify your connection.`
        : null));

  const sharedChannelRef = useRef<RealtimeChannel | null>(null);
  const userChannelRef = useRef<RealtimeChannel | null>(null);
  const invalidateTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Coalesces bursts of realtime postgres_changes events into a single refetch per query key
  const debouncedInvalidate = useCallback(
    (queryKey: readonly unknown[], delay = 750) => {
      const timers = invalidateTimersRef.current;
      const key = JSON.stringify(queryKey);
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          void queryClient.invalidateQueries({ queryKey });
        }, delay)
      );
    },
    [queryClient]
  );

  // Redirect the root path to /overview
  useEffect(() => {
    const isKnownPath = dashboardNavigation.some((item) => item.path === location.pathname);
    if (!isKnownPath) {
      navigate('/overview', { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleSelectJob = (job: Job | null) => {
    setSelectedJobState(job);
    setSelectedJobId(job ? job.id : null);
  };

  // Check Supabase Auth session & dynamic authorization in authorized_users table
  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;

    const verifySession = async (currentSession: Session | null) => {
      setIsAuthChecking(true);
      setSession(currentSession);

      if (!currentSession?.user?.email) {
        if (isMounted) {
          setIsAuthorized(false);
          setIsAuthChecking(false);
        }
        return;
      }

      const { isAuthorized: authorized, error } = await checkUserAuthorization(currentSession.user.email);
      if (isMounted) {
        setIsAuthorized(authorized);
        setAuthError(error || null);
        setIsAuthChecking(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void verifySession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        clearAppCache();
      }
      void verifySession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Supabase Realtime Listener (Tenant-isolated peer broadcast + Postgres changes)
  useEffect(() => {
    if (!isAuthorized || !isSupabaseConfigured || !supabase) return;
    let isMounted = true;
    const cleanUserEmail = session?.user?.email?.trim().toLowerCase();

    // Public Shared Channel: global jobs & sources tables
    const sharedChannel = supabase.channel('public:shared_feed');
    sharedChannelRef.current = sharedChannel;

    sharedChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'jobs' },
      () => {
        if (!isMounted) return;
        debouncedInvalidate(queryKeys.overviewMetrics(cleanUserEmail));
        debouncedInvalidate(queryKeys.jobs(cleanUserEmail));
        debouncedInvalidate(queryKeys.jobCount());
        void queryClient.invalidateQueries({ queryKey: ['jobs-page'] });
      }
    );

    sharedChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sources' },
      () => {
        if (!isMounted) return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.sources() });
      }
    );

    sharedChannel.subscribe();

    // Tenant-Isolated Channel: strictly scoped to the authenticated user's email
    let userChannel: RealtimeChannel | null = null;
    if (cleanUserEmail) {
      userChannel = supabase.channel(`user:${cleanUserEmail}`, {
        config: { broadcast: { self: false } },
      });
      userChannelRef.current = userChannel;

      userChannel.on('broadcast', { event: 'job_status_updated' }, (payload) => {
        if (!isMounted) return;
        debouncedInvalidate(queryKeys.overviewMetrics(cleanUserEmail));
        void queryClient.invalidateQueries({ queryKey: ['jobs-page'] });
        const data = payload?.payload;
        if (!data || data.job_id === undefined || !data.status) return;

        const targetId = Number(data.job_id);
        const nextStatus = data.status as JobStatus;

        setSelectedJobState((prev) => (prev && prev.id === targetId ? { ...prev, status: nextStatus } : prev));

        queryClient.setQueryData<Job[]>(queryKeys.jobs(cleanUserEmail), (prev) =>
          prev ? prev.map((j) => (j.id === targetId ? { ...j, status: nextStatus } : j)) : []
        );
      });

      userChannel.on('broadcast', { event: 'profile_updated' }, (payload) => {
        if (!isMounted) return;
        const data = payload?.payload;
        if (!data || !data.profile) return;
        queryClient.setQueryData(queryKeys.profile(cleanUserEmail), data.profile);
      });

      userChannel.subscribe();
    }

    const invalidateTimers = invalidateTimersRef.current;

    return () => {
      for (const timer of invalidateTimers.values()) clearTimeout(timer);
      invalidateTimers.clear();
      isMounted = false;
      sharedChannelRef.current = null;
      userChannelRef.current = null;
      void supabase.removeChannel(sharedChannel);
      if (userChannel) {
        void supabase.removeChannel(userChannel);
      }
    };
  }, [isAuthorized, session, queryClient, debouncedInvalidate]);

  // Enforce dark mode
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.classList.add('dark');
  }, []);

  const updateStatus = async (job: Job, status: JobStatus) => {
    setSelectedJobState((prev) => (prev && prev.id === job.id ? { ...prev, status } : prev));

    if (userChannelRef.current) {
      void userChannelRef.current.send({
        type: 'broadcast',
        event: 'job_status_updated',
        payload: { job_id: job.id, status, user_email: userEmail },
      });
    }

    try {
      await updateJobStatusMutation.mutateAsync({ job, status });
    } catch (err: any) {
      setSelectedJobState((prev) => (prev && prev.id === job.id ? { ...prev, status: job.status } : prev));
      if (userChannelRef.current) {
        void userChannelRef.current.send({
          type: 'broadcast',
          event: 'job_status_updated',
          payload: { job_id: job.id, status: job.status, user_email: userEmail },
        });
      }
      setNotice(`Failed to save status update to Supabase: ${err?.message || 'Network error'}`);
    }
  };

  const handleSaveProfile = useCallback(
    async (updatedProfile: Profile) => {
      try {
        const res = await saveProfileMutation.mutateAsync(updatedProfile);
        if (res.success && userChannelRef.current) {
          void userChannelRef.current.send({
            type: 'broadcast',
            event: 'profile_updated',
            payload: { user_email: userEmail, profile: updatedProfile },
          });
        }
        return res;
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to save profile' };
      }
    },
    [saveProfileMutation, userEmail]
  );

  const activeSection = dashboardNavigation.find((item) => item.id === activeTab);

  const handleSignOut = useCallback(async () => {
    clearAppCache();
    if (supabase) {
      await supabase.auth.signOut();
    }
  }, []);

  if (isAuthChecking) {
    return (
      <div className="relative min-h-dvh flex items-center justify-center p-4 text-zinc-100 overflow-hidden bg-black">
        <div className="flex flex-col items-center gap-3 relative z-10">
          <BrandLogo size="lg" animate />
          <div className="text-xs text-zinc-400 font-medium">Verifying authorization...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginView />;
  }

  if (!isAuthorized) {
    return (
      <AccessDeniedView
        email={session.user.email}
        error={authError}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <div className="relative flex h-dvh overflow-hidden bg-black text-neutral-100 selection:bg-white/20 lg:py-2.5 lg:pr-2.5">
      {/* Desktop Sidebar: full height, pure black rail */}
      <DashboardSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCommandMenu={() => setIsCommandMenuOpen(true)}
      />

      {/* Main Workspace Frame: Linear-style floating rounded canvas with top/bottom black margins */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-[#111215] lg:rounded-2xl lg:border lg:border-white/[0.08] lg:shadow-2xl">
        {/* Workspace Header inside the grey canvas */}
        <header
          data-search-exclude
          className="h-12 w-full shrink-0 border-b border-white/[0.06] bg-transparent px-3 sm:px-5 flex items-center justify-between z-20 select-none"
        >
          {/* Left: Mobile Project Switcher & Desktop Breadcrumbs */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="lg:hidden">
              <ProjectSwitcher currentProject="JobPulse" />
            </div>
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <h1 className="font-semibold text-zinc-100 text-sm tracking-tight">
                {getNavLabel(t, activeTab, activeSection?.label ?? '')}
              </h1>
            </div>
          </div>

          {/* Right: User Profile Menu */}
          <div className="flex items-center gap-2.5 shrink-0">
            <UserProfileMenu
              userEmail={session.user.email}
              profile={profile}
              onNavigateToProfile={() => setActiveTab('profile')}
              onSignOut={handleSignOut}
            />
          </div>
        </header>

        {/* Main Scrollable Canvas Body */}
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6">
          <div className="mx-auto max-w-[1700px] space-y-4">
            {/* Database Connection Error Alert */}
            {dbError && (
              <div role="alert" className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs text-rose-200 backdrop-blur-md shadow-lg shadow-rose-950/20">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                    <AlertTriangle className="size-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-rose-300">Supabase Connection Error</div>
                    <div className="text-rose-200/80 mt-0.5">{dbError}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setIsDbErrorDismissed(false);
                      setCustomDbError(null);
                      void refetchOverview();
                      void refetchJobs();
                    }}
                    className="border-rose-500/40 text-rose-200 hover:bg-rose-500/20 text-xs py-1 px-3"
                  >
                    <RefreshCw className={`size-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Retry</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setIsDbErrorDismissed(true)}
                    className="text-neutral-400 hover:text-white p-1 cursor-pointer"
                    aria-label="Dismiss error"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Initial Loading State */}
            {isLoading && !dbError && (
              <div className="surface-panel mb-4 rounded-xl p-10 text-center space-y-2.5 border-zinc-800">
                <div className="size-8 mx-auto rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  <RefreshCw className="size-4 animate-spin text-zinc-400" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Connecting to database...</div>
                <div className="text-[11px] text-zinc-500">
                  {isOverviewNeeded ? 'Loading analytics from Supabase' : 'Loading opportunities from Supabase'}
                </div>
              </div>
            )}

            {/* Global Notice Banner */}
            {notice && (
              <div role="status" aria-live="polite" className="mb-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                  <span>{notice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNotice('')}
                  className="text-zinc-400 hover:text-white ml-3 font-semibold cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Tab Views with Error Boundaries */}
            {activeTab === 'overview' && (
              <ErrorBoundary fallbackTitle="Unable to load overview dashboard">
                <OverviewView
                  jobs={jobs}
                  overviewMetrics={overviewMetrics}
                  onNavigateToJobs={(filters) => {
                    if (filters?.status) setSelectedStatusFilter(filters.status);
                    if (filters?.domain) setSelectedDomainFilter(filters.domain);
                    if (filters?.minMatch !== undefined) setSelectedMinMatch(filters.minMatch);
                    setActiveTab('jobs');
                  }}
                />
              </ErrorBoundary>
            )}

            {activeTab === 'jobs' && (
              <ErrorBoundary fallbackTitle="Unable to load opportunities pipeline">
                <JobsView
                  key={`${selectedStatusFilter}-${selectedDomainFilter}-${selectedMinMatch}`}
                  jobs={jobs}
                  overviewMetrics={overviewMetrics}
                  selectedJob={selectedJob}
                  onSelectJob={handleSelectJob}
                  onUpdateStatus={updateStatus}
                  isUpdating={isUpdatingStatus}
                  initialStatusFilter={selectedStatusFilter}
                  initialDomainFilter={selectedDomainFilter}
                  initialMinMatch={selectedMinMatch}
                  onFilterReset={() => {
                    setSelectedStatusFilter('all');
                    setSelectedDomainFilter('all');
                    setSelectedMinMatch(0);
                  }}
                  onOpenCommandMenu={() => setIsCommandMenuOpen(true)}
                  userEmail={userEmail}
                />
              </ErrorBoundary>
            )}

            {activeTab === 'sources' && (
              <ErrorBoundary fallbackTitle="Unable to load data sources">
                <SourcesView
                  sources={sources}
                  notice={notice}
                />
              </ErrorBoundary>
            )}

            {activeTab === 'profile' && (
              <ErrorBoundary fallbackTitle="Unable to load profile settings">
                <ProfileView
                  profile={profile}
                  userEmail={session.user.email}
                  onSaveProfile={handleSaveProfile}
                  jobs={rawJobs}
                />
              </ErrorBoundary>
            )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/[0.08] bg-[#111215]/95 px-2 py-1 backdrop-blur-xl lg:hidden safe-bottom select-none"
        aria-label={t('nav.mobileNavigation')}
      >
        {dashboardNavigation
          .filter((item) => item.id !== 'profile')
          .map(({ id, icon: Icon }) => {
            const isActive = activeTab === id;
            const shortLabel = getNavLabel(t, id);

            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer active:scale-95 ${
                  isActive
                    ? 'text-zinc-100 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <div
                  className={`flex size-8 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? 'border border-zinc-700/80 bg-zinc-800 text-zinc-100 shadow-xs'
                      : 'text-zinc-400'
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                <span className="text-[10px] tracking-tight">{shortLabel}</span>
              </button>
            );
          })}
      </nav>

      {/* Global Linear Command Menu (Cmd+K) */}
      <CommandMenu
        isOpen={isCommandMenuOpen}
        onOpenChange={setIsCommandMenuOpen}
        jobs={jobs}
        selectedJob={selectedJob}
        onSelectJob={(job) => {
          setActiveTab('jobs');
          void handleSelectJob(job);
        }}
        onUpdateStatus={updateStatus}
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        onFilterStatus={(status) => {
          setSelectedStatusFilter(status);
          setActiveTab('jobs');
        }}
      />
    </div>
  );
};

export default App;
