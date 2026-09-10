import {
  Briefcase,
  LayoutDashboard,
  Radio,
  UserCheck,
} from 'lucide-react';

export const dashboardNavigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/overview' },
  { id: 'jobs', label: 'Opportunities', icon: Briefcase, path: '/opportunities' },
  { id: 'sources', label: 'Data Sources', icon: Radio, path: '/datasources' },
  { id: 'profile', label: 'Profile', icon: UserCheck, path: '/profile' },
] as const;

export type DashboardTab = typeof dashboardNavigation[number]['id'];

export function getNavLabel(t: (key: any) => string, id: string, fallback = ''): string {
  switch (id) {
    case 'overview':
      return t('nav.overview');
    case 'jobs':
      return t('nav.opportunities');
    case 'sources':
      return t('nav.sources');
    case 'watchlist':
      return t('nav.watchlist');
    case 'profile':
      return t('nav.profile');
    default:
      return fallback;
  }
}
