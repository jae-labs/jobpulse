import { BrandLogo } from '../ui/BrandLogo';

export function DashboardBrand({ isCollapsed = false }: { isCollapsed?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5 min-w-0 select-none">
      <BrandLogo size="sm" className="shrink-0" />
      {!isCollapsed && (
        <span className="font-semibold tracking-tight text-ds-text-primary text-sm truncate">
          JobPulse
        </span>
      )}
    </div>
  );
}
