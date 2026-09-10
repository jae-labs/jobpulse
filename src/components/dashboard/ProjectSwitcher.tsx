import React from 'react';
import { BrandLogo } from '../ui/BrandLogo';

interface ProjectSwitcherProps {
  currentProject?: string;
  className?: string;
  isCollapsed?: boolean;
}

export const ProjectSwitcher: React.FC<ProjectSwitcherProps> = ({
  currentProject = 'JobPulse',
  className = '',
  isCollapsed = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 min-w-0 select-none ${className}`}>
      {/* Brand Icon */}
      <BrandLogo size="sm" className="shrink-0" />

      {/* Brand Wordmark */}
      {!isCollapsed && (
        <span className="font-semibold tracking-tight text-white text-sm truncate">
          {currentProject}
        </span>
      )}
    </div>
  );
};
