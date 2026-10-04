import {
  Briefcase,
  LayoutDashboard,
  Radio,
  UserCheck,
  Shield,
} from 'lucide-react';

export const dashboardNavigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/overview' },
  { id: 'jobs', label: 'Opportunities', icon: Briefcase, path: '/opportunities' },
  { id: 'sources', label: 'Data Sources', icon: Radio, path: '/sources' },
  { id: 'privacy', label: 'Data and privacy', icon: Shield, path: '/privacy' },
  { id: 'profile', label: 'Profile', icon: UserCheck, path: '/profile' },
] as const;

export type DashboardTab = typeof dashboardNavigation[number]['id'];

type NavLabelKey = 'nav.overview' | 'nav.opportunities' | 'nav.sources' | 'nav.profile' | 'privacy.notice';

export function getNavLabel(t: (key: NavLabelKey) => string, id: DashboardTab, fallback = ''): string {
  switch (id) {
    case 'overview':
      return t('nav.overview');
    case 'jobs':
      return t('nav.opportunities');
    case 'sources':
      return t('nav.sources');
    case 'privacy':
      return t('privacy.notice');
    case 'profile':
      return t('nav.profile');
    default:
      return fallback;
  }
}
