import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';

import { useLocation, useNavigate } from 'react-router-dom';

import { useTranslation } from 'react-i18next';

import type { Job, Profile, JobStatus } from './types/job';
import { DashboardSidebar } from './components/dashboard/DashboardSidebar';
import { dashboardNavigation, getNavLabel, type DashboardTab } from './components/dashboard/navigation';
import { ProjectSwitcher } from './components/dashboard/ProjectSwitcher';
import { UserProfileMenu } from './components/dashboard/UserAccountMenu';
import { Button, Card } from './design-system';
import { CommandMenu } from './components/ui/CommandMenu';
import { BrandLogo } from './components/ui/BrandLogo';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

const OverviewView = React.lazy(() =>
  import('./components/dashboard/OverviewView').then((m) => ({ default: m.OverviewView }))
);
const JobsView = React.lazy(() =>
  import('./components/jobs/JobsView').then((m) => ({ default: m.JobsView }))
);
const SourcesView = React.lazy(() =>
  import('./components/sources/SourcesView').then((m) => ({ default: m.SourcesView }))
);
const ProfileView = React.lazy(() =>
  import('./components/profile/ProfileView').then((m) => ({ default: m.ProfileView }))
);
import { supabase } from './lib/supabase';
import { DEFAULT_PROFILE } from './lib/defaultProfile';
import { LoginView } from './components/auth/LoginView';
import { AccessDeniedView } from './components/auth/AccessDeniedView';
import { clearAppCache } from './lib/queryClient';
import { useAuthSession } from './hooks/useAuthSession';
import { useSupabaseRealtime } from './hooks/useSupabaseRealtime';
import {
  useOverviewMetricsQuery,
  useScoringPreviewJobsQuery,
  useSourcesQuery,
  useProfileQuery,
  useUpdateJobStatusMutation,
  useSaveProfileMutation,
} from './hooks/useQueries';
import { recalculateJobs } from './lib/scoreCalculator';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const { session, isAuthorized, authError, isAuthChecking } = useAuthSession();
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: DashboardTab =
    dashboardNavigation.find((item) => item.path === location.pathname)?.id ??
    (location.pathname === '/jobs' ? 'jobs' : 'overview');

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
  const isJobsNeeded = activeTab === 'profile';

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
  } = useScoringPreviewJobsQuery(userEmail, isAuthorized && isJobsNeeded);

  const isSourcesNeeded = activeTab === 'sources';

  const {
    data: sources = [],
    isLoading: isSourcesLoading,
  } = useSourcesQuery(isAuthorized && isSourcesNeeded);

  const {
    data: loadedProfile,
    isLoading: isProfileLoading,
    error: profileQueryError,
  } = useProfileQuery(userEmail, isAuthorized);
  const profile = loadedProfile ?? DEFAULT_PROFILE;

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
        ? t('common.dbConnectionDetail', {
            message: activeQueryError.message || t('common.networkError'),
          })
        : null));

  useSupabaseRealtime(session, isAuthorized);

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



  // Enforce dark mode
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.classList.add('dark');
  }, []);

  const updateStatus = async (job: Job, status: JobStatus) => {
    setSelectedJobState((prev) => (prev && prev.id === job.id ? { ...prev, status } : prev));

    try {
      await updateJobStatusMutation.mutateAsync({ job, status });
    } catch (err: unknown) {
      setSelectedJobState((prev) => (prev && prev.id === job.id ? { ...prev, status: job.status } : prev));
      setNotice(t('common.statusSaveFailed', { message: err instanceof Error ? err.message : t('common.networkError') }));
    }
  };

  const handleSaveProfile = useCallback(
    async (updatedProfile: Profile) => {
      try {
        const res = await saveProfileMutation.mutateAsync(updatedProfile);
        return res;
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to save profile' };
      }
    },
    [saveProfileMutation]
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
      <div className="relative min-h-dvh flex items-center justify-center p-4 text-ds-text-primary overflow-hidden bg-ds-canvas">
        <div className="flex flex-col items-center gap-3 relative z-10">
          <BrandLogo size="lg" animate />
          <div className="text-xs text-ds-text-muted font-medium">{t('common.verifyingAuth')}</div>
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
    <div className="relative flex h-dvh overflow-hidden bg-ds-canvas text-ds-text-primary selection:bg-ds-selected lg:py-2.5 lg:pr-2.5">
      {/* Desktop Sidebar: full height, pure black rail */}
      <DashboardSidebar
        activeTab={activeTab}
      />

      {/* Main Workspace Frame: Linear-style floating rounded canvas with top/bottom black margins */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-ds-workspace lg:rounded-2xl lg:border lg:border-ds-border lg:shadow-2xl">
        {/* Workspace Header inside the grey canvas */}
        <header
          data-search-exclude
          className="h-12 w-full shrink-0 border-b border-ds-border bg-transparent px-3 sm:px-5 flex items-center justify-between z-20 select-none"
        >
          {/* Left: Mobile Project Switcher & Desktop Breadcrumbs */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="lg:hidden">
              <ProjectSwitcher currentProject="JobPulse" />
            </div>
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <h1 className="font-semibold text-ds-text-primary text-sm tracking-tight">
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
              <div role="alert" className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-ds-negative/40 bg-ds-negative/10 p-3.5 text-xs text-ds-negative backdrop-blur-md shadow-lg">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-ds-negative/20 text-ds-negative shrink-0">
                    <AlertTriangle className="size-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-ds-negative">{t('common.dbConnectionError')}</div>
                    <div className="text-ds-negative/80 mt-0.5">{dbError}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setIsDbErrorDismissed(false);
                      setCustomDbError(null);
                      void refetchOverview();
                      void refetchJobs();
                    }}
                  >
                    <RefreshCw className={`size-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>{t('common.retry')}</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setIsDbErrorDismissed(true)}
                    className="text-ds-text-muted hover:text-ds-text-primary p-1 cursor-pointer"
                    aria-label={t('common.dismissError')}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Initial Loading State */}
            {isLoading && !dbError && (
              <Card className="mb-4 p-10 text-center space-y-2.5">
                <div className="size-8 mx-auto rounded-lg bg-ds-control border border-ds-border flex items-center justify-center">
                  <RefreshCw className="size-4 animate-spin text-ds-text-muted" />
                </div>
                <div className="text-xs font-semibold text-ds-text-secondary">{t('common.connectingToDb')}</div>
                <div className="text-[11px] text-ds-text-muted">
                  {isOverviewNeeded ? t('common.loadingAnalytics') : t('common.loadingOpportunities')}
                </div>
              </Card>
            )}

            {/* Global Notice Banner */}
            {notice && (
              <div role="status" aria-live="polite" className="mb-4 flex items-center justify-between rounded-xl border border-ds-border bg-ds-control/60 p-3 text-xs text-ds-text-secondary">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-ds-positive" />
                  <span>{notice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNotice('')}
                  className="text-ds-text-muted hover:text-ds-text-primary ml-3 font-semibold cursor-pointer"
                >
                  {t('common.dismiss')}
                </button>
              </div>
            )}

            {/* Tab Views with Error Boundaries & Suspense */}
            <React.Suspense
              fallback={
                <div className="flex h-64 items-center justify-center text-xs text-ds-text-muted">
                  <RefreshCw className="mr-2 size-4 animate-spin text-ds-text-muted" />
                  {t('common.loadingView')}
                </div>
              }
            >
              {activeTab === 'overview' && (
                <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadOverview')}>
                  <OverviewView
                    jobs={jobs}
                    overviewMetrics={overviewMetrics}
                    onNavigateToJobs={(filters) => {
                      const params = new URLSearchParams();
                      if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
                      if (filters?.domain && filters.domain !== 'all') params.set('domain', filters.domain);
                      if (filters?.minMatch !== undefined && filters.minMatch > 0) params.set('match', String(filters.minMatch));
                      if (filters?.q) params.set('q', filters.q);
                      const queryString = params.toString();
                      navigate(`/opportunities${queryString ? `?${queryString}` : ''}`);
                      if (filters?.status) setSelectedStatusFilter(filters.status);
                      if (filters?.domain) setSelectedDomainFilter(filters.domain);
                      if (filters?.minMatch !== undefined) setSelectedMinMatch(filters.minMatch);
                    }}
                  />
                </ErrorBoundary>
              )}

              {activeTab === 'jobs' && (
                <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadOpportunities')}>
                  <JobsView
                    key={`${selectedStatusFilter}-${selectedDomainFilter}-${selectedMinMatch}-${location.search}`}
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
                <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadSources')}>
                  <SourcesView
                    sources={sources}
                    notice={notice}
                  />
                </ErrorBoundary>
              )}

              {activeTab === 'profile' && (
                <ErrorBoundary fallbackTitle={t('errorBoundary.unableToLoadProfile')}>
                  <ProfileView
                    profile={loadedProfile ?? null}
                    isLoading={isProfileLoading}
                    loadError={profileQueryError instanceof Error ? profileQueryError.message : null}
                    userEmail={session.user.email}
                    onSaveProfile={handleSaveProfile}
                    jobs={rawJobs}
                  />
                </ErrorBoundary>
              )}
            </React.Suspense>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-ds-border bg-ds-workspace/95 px-2 py-1 backdrop-blur-xl lg:hidden safe-bottom select-none"
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
                    ? 'text-ds-text-primary font-semibold'
                    : 'text-ds-text-muted hover:text-ds-text-secondary'
                }`}
              >
                <div
                  className={`flex size-8 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? 'border border-ds-border-strong bg-ds-hover text-ds-text-primary shadow-xs'
                      : 'text-ds-text-muted'
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
        userEmail={userEmail}
        jobs={jobs}
        selectedJob={selectedJob}
        onSelectJob={(job) => {
          handleSelectJob(job);
          navigate(`/opportunities?job=${job.id}`);
        }}
        onUpdateStatus={updateStatus}
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
