import {
  Briefcase,
  LayoutDashboard,
  Calculator,
  UserCheck,
  Users,
  Shield,
} from 'lucide-react';

export const dashboardNavigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/overview' },
  { id: 'jobs', label: 'Opportunities', icon: Briefcase, path: '/opportunities' },
  { id: 'tax', label: 'Tax Calculator', icon: Calculator, path: '/tax-calculator' },
  { id: 'privacy', label: 'Data and privacy', icon: Shield, path: '/privacy' },
  { id: 'profile', label: 'Profile', icon: UserCheck, path: '/profile' },
  { id: 'members', label: 'Invite and manage members', icon: Users, path: '/members' },
] as const;

export type DashboardTab = typeof dashboardNavigation[number]['id'];

type NavLabelKey = 'nav.overview' | 'nav.opportunities' | 'nav.taxCalculator' | 'nav.profile' | 'privacy.notice' | 'memberManagement.title';

export function getNavLabel(t: (key: NavLabelKey) => string, id: DashboardTab, fallback = ''): string {
  switch (id) {
    case 'overview':
      return t('nav.overview');
    case 'jobs':
      return t('nav.opportunities');
    case 'tax':
      return t('nav.taxCalculator');
    case 'privacy':
      return t('privacy.notice');
    case 'profile':
      return t('nav.profile');
    case 'members':
      return t('memberManagement.title');
    default:
      return fallback;
  }
}
