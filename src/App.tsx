import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  RefreshCw,
  Briefcase,
  CheckCircle2,
  Sparkles,
  Send,
  AlertTriangle,
  X,
  Search,
  LogOut,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

import type { Job, Source, Employer, Profile, JobStatus } from './types/job';
import {
  loadDashboardLayout,
  saveDashboardLayout,
} from './lib/dashboardStorage';
import { DashboardSidebar } from './components/dashboard/DashboardSidebar';
import { dashboardNavigation, type DashboardTab } from './components/dashboard/navigation';
import { SortableWidget } from './components/dashboard/SortableWidget';
import { StatCard } from './components/ui/StatCard';
import { Button } from './components/ui/button';
import { JobsView } from './components/jobs/JobsView';
import { CommandMenu } from './components/ui/CommandMenu';
import { BrandLogo } from './components/ui/BrandLogo';

import { SourcesView } from './components/sources/SourcesView';
import { ProfileView } from './components/profile/ProfileView';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { DEFAULT_PROFILE } from './lib/defaultProfile';
import { loadUserProfile, saveUserProfile } from './lib/userProfile';
import { checkUserAuthorization } from './components/auth/authConfig';
import { LoginView } from './components/auth/LoginView';
import { AccessDeniedView } from './components/auth/AccessDeniedView';
const PipelineChart = React.lazy(() =>
  import('./components/charts/PipelineChart').then((m) => ({ default: m.PipelineChart }))
);
const RelevanceDistributionChart = React.lazy(() =>
  import('./components/charts/RelevanceDistributionChart').then((m) => ({ default: m.RelevanceDistributionChart }))
);
const SkillsFrequencyChart = React.lazy(() =>
  import('./components/charts/SkillsFrequencyChart').then((m) => ({ default: m.SkillsFrequencyChart }))
);
const CategoryBreakdownChart = React.lazy(() =>
  import('./components/charts/CategoryBreakdownChart').then((m) => ({ default: m.CategoryBreakdownChart }))
);

const overviewWidgetIds = [
  'tracked-roles',
  'high-fit-roles',
  'pipeline-progress',
  'category-breakdown',
  'application-pipeline',
  'relevance-distribution',
  'skills-radar',
] as const;

type OverviewWidgetId = typeof overviewWidgetIds[number];

function isOverviewWidgetId(value: string): value is OverviewWidgetId {
  return overviewWidgetIds.some((widgetId) => widgetId === value);
}

function isOverviewWidgetOrder(layout: string[]): layout is OverviewWidgetId[] {
  return (
    layout.length === overviewWidgetIds.length &&
    new Set(layout).size === overviewWidgetIds.length &&
    layout.every(isOverviewWidgetId)
  );
}

export const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(Boolean(supabase));
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [_employers, setEmployers] = useState<Employer[]>([]);
  const [profile, setProfile] = useState<Profile | null>(DEFAULT_PROFILE);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [notice, setNotice] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  const [overviewWidgetOrder, setOverviewWidgetOrder] = useState<OverviewWidgetId[]>([
    ...overviewWidgetIds,
  ]);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | JobStatus>('all');
  const [selectedDomainFilter, setSelectedDomainFilter] = useState<string>('all');
  const [selectedMinMatch, setSelectedMinMatch] = useState<number>(0);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isUpdatingStatusRef = useRef(false);

  useEffect(() => {
    isUpdatingStatusRef.current = isUpdatingStatus;
  }, [isUpdatingStatus]);

  // Check Supabase Auth session & dynamic authorization in authorized_users table
  useEffect(() => {
    if (!supabase) {
      return;
    }

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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void verifySession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadData = useCallback(
    async (silent = false) => {
      await Promise.resolve();
      if (!silent) {
        setIsLoading(true);
        setDbError(null);
      }
      try {
        if (!supabase) {
          throw new Error('Supabase is not initialized. Check your environment variables.');
        }

        const userEmail = session?.user?.email?.trim().toLowerCase();

        const [jobsRes, sourcesRes, employersRes, userStatusesRes, profileData] = await Promise.all([
          supabase.from('jobs').select('*').order('relevance', { ascending: false }),
          supabase.from('sources').select('*').order('name', { ascending: true }),
          supabase.from('employers').select('*').order('priority', { ascending: true }),
          userEmail
            ? supabase.from('user_job_statuses').select('job_id, status').ilike('user_email', userEmail)
            : Promise.resolve({ data: [], error: null }),
          userEmail ? loadUserProfile(userEmail) : Promise.resolve(DEFAULT_PROFILE),
        ]);

        if (jobsRes.error) throw new Error(jobsRes.error.message);
        if (sourcesRes.error) throw new Error(sourcesRes.error.message);
        if (employersRes.error) throw new Error(employersRes.error.message);

        const statusMap = new Map<number, JobStatus>();
        if (userStatusesRes && 'data' in userStatusesRes && userStatusesRes.data) {
          for (const row of userStatusesRes.data as { job_id: number; status: JobStatus }[]) {
            if (row.job_id !== null && row.job_id !== undefined) {
              statusMap.set(Number(row.job_id), row.status as JobStatus);
            }
          }
        }

        const rawJobs = (jobsRes.data || []) as Job[];
        const jobsData = rawJobs.map((j: Job) => ({
          ...j,
          status: statusMap.get(j.id) || 'new',
        }));
        const sourcesData = (sourcesRes.data || []) as Source[];
        const employersData = (employersRes.data || []) as Employer[];

        setJobs(jobsData);
        setSources(sourcesData);
        setEmployers(employersData);
        setProfile(profileData || DEFAULT_PROFILE);

        setSelectedJob((current) => {
          if (!current) return null;
          const fresh = jobsData.find((j: Job) => j.id === current.id);
          return fresh || current;
        });

        setDbError(null);
      } catch (err: any) {
        if (!silent) {
          console.error('Failed to load data from Supabase:', err);
          setDbError(
            `Unable to connect to Supabase: ${err?.message || 'Network error'}. Verify your connection.`
          );
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [session],
  );

  const handleSelectJob = (job: Job | null) => {
    setSelectedJob(job);
  };

  useEffect(() => {
    if (isAuthorized && session?.user?.email) {
      const timer = setTimeout(() => {
        void loadData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isAuthorized, session, loadData]);

  // Supabase Realtime Listener and window focus refresh
  useEffect(() => {
    if (!isAuthorized || !isSupabaseConfigured || !supabase) {
      return;
    }
    let isMounted = true;
    const userEmail = session?.user?.email?.trim().toLowerCase();

    const channel = supabase
      .channel('public:jobs_and_statuses')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        (payload) => {
          if (!isMounted) return;
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updated = payload.new as Job;
            setJobs((prev) =>
              prev.map((j) => (j.id === updated.id ? { ...updated, status: j.status } : j))
            );
            setSelectedJob((curr) =>
              curr && curr.id === updated.id ? { ...updated, status: curr.status } : curr
            );
          } else if (payload.eventType === 'INSERT' && payload.new) {
            const newJob = payload.new as Job;
            setJobs((prev) => [{ ...newJob, status: 'new' }, ...prev]);
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedId = (payload.old as { id?: number }).id;
            if (deletedId !== undefined) {
              setJobs((prev) => prev.filter((j) => j.id !== deletedId));
              setSelectedJob((curr) => (curr && curr.id === deletedId ? null : curr));
            }
          }
        }
      );

    if (userEmail) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_job_statuses',
          filter: `user_email=eq.${userEmail}`,
        },
        (payload) => {
          if (!isMounted) return;
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const row = payload.new as { job_id: number; status: JobStatus };
            if (row && row.job_id) {
              setJobs((prev) =>
                prev.map((j) => (j.id === row.job_id ? { ...j, status: row.status } : j))
              );
              setSelectedJob((curr) =>
                curr && curr.id === row.job_id ? { ...curr, status: row.status } : curr
              );
            }
          }
        }
      );
    }

    channel.subscribe();

    const handleFocus = () => {
      if (document.visibilityState === 'visible' && isMounted) {
        void loadData(true);
      }
    };

    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthorized, session, loadData]);

  // Enforce dark mode
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.classList.add('dark');
  }, []);

  // Layout loading & saving
  useEffect(() => {
    let isCurrent = true;
    void loadDashboardLayout()
      .then((layout) => {
        if (isCurrent && layout) {
          const migrated = layout.map((id) => (id === 'shortlisted-roles' ? 'high-fit-roles' : id));
          if (isOverviewWidgetOrder(migrated)) {
            setOverviewWidgetOrder(migrated);
          }
        }
      })
      .catch((err) => console.error('Error loading overview layout:', err))
      .finally(() => {
        if (isCurrent) setIsLayoutReady(true);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!isLayoutReady) return;
    void saveDashboardLayout(overviewWidgetOrder).catch((err) => {
      console.error('Error saving overview layout:', err);
    });
  }, [isLayoutReady, overviewWidgetOrder]);

  const updateStatus = async (job: Job, status: JobStatus) => {
    setIsUpdatingStatus(true);
    const previousStatus = job.status;
    const updated = { ...job, status };
    setJobs((items) => items.map((item) => (item.id === job.id ? updated : item)));
    setSelectedJob(updated);

    try {
      if (!supabase) throw new Error('Supabase client is not configured');
      const userEmail = session?.user?.email?.trim().toLowerCase();
      if (!userEmail) throw new Error('Active user session required');

      const { error } = await supabase.from('user_job_statuses').upsert(
        {
          user_email: userEmail,
          job_id: job.id,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_email,job_id' }
      );
      if (error) throw new Error(error.message);
    } catch (err: any) {
      const reverted = { ...job, status: previousStatus };
      setJobs((items) => items.map((item) => (item.id === job.id ? reverted : item)));
      setSelectedJob(reverted);
      setNotice(`Failed to save status update to Supabase: ${err?.message || 'Network error'}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSaveProfile = async (updatedProfile: Profile) => {
    const userEmail = session?.user?.email?.trim().toLowerCase();
    if (!userEmail) return { success: false, error: 'User email not found in active session.' };
    const res = await saveUserProfile(userEmail, updatedProfile);
    if (res.success) {
      setProfile(updatedProfile);
    }
    return res;
  };

  const handleWidgetDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    setOverviewWidgetOrder((widgets) => {
      const oldIndex = widgets.indexOf(active.id as OverviewWidgetId);
      const newIndex = widgets.indexOf(over.id as OverviewWidgetId);
      if (oldIndex < 0 || newIndex < 0) return widgets;
      return arrayMove(widgets, oldIndex, newIndex);
    });
  };

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const j of jobs) {
      map[j.status] = (map[j.status] || 0) + 1;
    }
    return map;
  }, [jobs]);

  const highMatchCount = useMemo(() => {
    return jobs.filter((j) => j.relevance >= 75).length;
  }, [jobs]);

  const renderOverviewWidget = (widgetId: OverviewWidgetId) => {
    switch (widgetId) {
      case 'tracked-roles':
        return (
          <SortableWidget id={widgetId} label="Monitored roles in pool" className="sm:col-span-1 md:col-span-4">
            <StatCard
              title="Tracked Roles"
              value={jobs.length}
              subValue="All monitored opportunities"
              icon={Briefcase}
              onClick={() => {
                setSelectedStatusFilter('all');
                setSelectedDomainFilter('all');
                setSelectedMinMatch(0);
                setActiveTab('jobs');
              }}
            />
          </SortableWidget>
        );

      case 'high-fit-roles':
        return (
          <SortableWidget id={widgetId} label="High-fit match opportunities" className="sm:col-span-1 md:col-span-4">
            <StatCard
              title="High-Fit Matches"
              value={highMatchCount}
              subValue="Roles with ≥75% profile compatibility"
              icon={Sparkles}
              onClick={() => {
                setSelectedStatusFilter('all');
                setSelectedDomainFilter('all');
                setSelectedMinMatch(75);
                setActiveTab('jobs');
              }}
            />
          </SortableWidget>
        );

      case 'pipeline-progress':
        return (
          <SortableWidget id={widgetId} label="In pipeline" className="sm:col-span-2 md:col-span-4">
            <StatCard
              title="In Active Pipeline"
              value={(counts.applied || 0) + (counts.interviewing || 0) + (counts.offer || 0)}
              subValue={`${counts.interviewing || 0} interview · ${counts.applied || 0} applied`}
              icon={Send}
              onClick={() => {
                setSelectedStatusFilter('applied');
                setSelectedDomainFilter('all');
                setSelectedMinMatch(0);
                setActiveTab('jobs');
              }}
            />
          </SortableWidget>
        );

      case 'category-breakdown':
        return (
          <SortableWidget id={widgetId} label="Jobs per category breakdown" className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <CategoryBreakdownChart
              jobs={jobs}
              onSelectCategory={(category) => {
                setSelectedDomainFilter(category);
                setSelectedStatusFilter('all');
                setSelectedMinMatch(0);
                setActiveTab('jobs');
              }}
            />
          </SortableWidget>
        );

      case 'application-pipeline':
        return (
          <SortableWidget id={widgetId} label="Application pipeline chart" className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <PipelineChart
              jobs={jobs}
              onSelectStatus={(status) => {
                setSelectedStatusFilter(status);
                setSelectedDomainFilter('all');
                setSelectedMinMatch(0);
                setActiveTab('jobs');
              }}
            />
          </SortableWidget>
        );

      case 'relevance-distribution':
        return (
          <SortableWidget id={widgetId} label="Match relevance distribution" className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <RelevanceDistributionChart jobs={jobs} />
          </SortableWidget>
        );

      case 'skills-radar':
        return (
          <SortableWidget id={widgetId} label="Top matched skills" className="sm:col-span-2 md:col-span-12 xl:col-span-6">
            <SkillsFrequencyChart jobs={jobs} />
          </SortableWidget>
        );
    }
  };

  const activeSection = dashboardNavigation.find((item) => item.id === activeTab);

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
        onSignOut={() => void supabase?.auth.signOut()}
      />
    );
  }

  return (
    <div className="relative h-dvh overflow-hidden text-neutral-100 selection:bg-white/20">
      <div className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto flex min-h-full max-w-[1800px] gap-4 p-3 lg:p-4">
          {/* Main Desktop Sidebar */}
          <DashboardSidebar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            profile={profile}
            jobCount={jobs.length}
            userEmail={session.user.email}
            onSignOut={() => void supabase?.auth.signOut()}
          />

          {/* Main Content Workspace */}
          <main className="min-w-0 flex-1 py-2 lg:py-4 pb-24 lg:pb-4">
            {/* Top Workspace Header (Linear Style Compact Bar) */}
            <header
              data-search-exclude
              className="mb-4 flex items-center justify-between border-b border-zinc-800/80 pb-3"
            >
              <div className="flex items-center gap-2.5">
                <BrandLogo size="xs" className="flex lg:hidden" />
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                  JobPulse
                </span>
                <span className="text-zinc-600">/</span>
                <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                  {activeSection?.label}
                </h2>
              </div>

              {/* Mobile Actions: Quick Search (⌘K) & Sign Out */}
              <div className="flex items-center gap-1.5 lg:hidden">
                <button
                  type="button"
                  onClick={() => setIsCommandMenuOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer active:scale-95 transition-transform"
                  aria-label="Open command menu"
                >
                  <Search className="size-3.5 text-zinc-400" />
                  <span className="text-[11px] font-medium">Search</span>
                </button>
                <button
                  type="button"
                  onClick={() => void supabase?.auth.signOut()}
                  className="flex size-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 cursor-pointer active:scale-95 transition-transform"
                  title={`Sign out (${session.user.email})`}
                  aria-label="Sign out"
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>
            </header>

            {/* Database Connection Error Alert */}
            {dbError && (
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs text-rose-200 backdrop-blur-md shadow-lg shadow-rose-950/20">
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
                    onClick={() => void loadData()}
                    className="border-rose-500/40 text-rose-200 hover:bg-rose-500/20 text-xs py-1 px-3"
                  >
                    <RefreshCw className={`size-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Retry</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setDbError(null)}
                    className="text-neutral-400 hover:text-white p-1 cursor-pointer"
                    aria-label="Dismiss error"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Initial Loading State */}
            {isLoading && jobs.length === 0 && !dbError && (
              <div className="surface-panel mb-4 rounded-xl p-10 text-center space-y-2.5 border-zinc-800">
                <div className="size-8 mx-auto rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  <RefreshCw className="size-4 animate-spin text-zinc-400" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">Connecting to database...</div>
                <div className="text-[11px] text-zinc-500">Loading opportunities from Supabase</div>
              </div>
            )}



            {/* Global Notice Banner */}
            {notice && (
              <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-200">
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

            {/* Tab Views */}
            {activeTab === 'overview' && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleWidgetDragEnd}
              >
                <SortableContext
                  items={overviewWidgetOrder}
                  strategy={rectSortingStrategy}
                >
                  <div className="bento-grid">
                    <React.Suspense
                      fallback={
                        <div className="col-span-12 p-8 text-center text-xs text-neutral-400">
                          <RefreshCw className="size-4 animate-spin inline mr-2 text-zinc-400" />
                          Loading analytics widgets...
                        </div>
                      }
                    >
                      {overviewWidgetOrder.map(renderOverviewWidget)}
                    </React.Suspense>
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {activeTab === 'jobs' && (
              <JobsView
                key={`${selectedStatusFilter}-${selectedDomainFilter}-${selectedMinMatch}`}
                jobs={jobs}
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
              />
            )}

            {activeTab === 'sources' && (
              <SourcesView
                sources={sources}
                notice={notice}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                profile={profile}
                userEmail={session.user.email}
                onSaveProfile={handleSaveProfile}
              />
            )}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (Linear Mobile Style) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-zinc-800/90 bg-zinc-950/95 px-2 py-1.5 backdrop-blur-xl lg:hidden safe-bottom"
        aria-label="Mobile navigation"
      >
        {dashboardNavigation.map(({ id, icon: Icon }) => {
          const isActive = activeTab === id;
          const shortLabel =
            id === 'jobs'
              ? 'Jobs'
              : id === 'sources'
                ? 'Sources'
                : id === 'profile'
                  ? 'Profile'
                  : 'Overview';

          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
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
              {id === 'jobs' && jobs.length > 0 && (
                <span className="absolute top-1 right-2.5 size-2 rounded-full bg-indigo-500 ring-2 ring-zinc-950" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Global Linear Command Menu (⌘+K) */}
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
