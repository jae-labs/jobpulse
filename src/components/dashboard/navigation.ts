import {
  Briefcase,
  LayoutDashboard,
  Radio,
  UserCheck,
} from 'lucide-react';

export const dashboardNavigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'jobs', label: 'Opportunities', icon: Briefcase },
  { id: 'sources', label: 'Data Sources', icon: Radio },
  { id: 'profile', label: 'Profile', icon: UserCheck },
] as const;

export type DashboardTab = typeof dashboardNavigation[number]['id'];
