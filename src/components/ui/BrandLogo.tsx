import React from 'react';

interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animate?: boolean;
}

const sizeMap = {
  xs: { box: 'size-5', svg: 'size-2.5', stroke: 2.6 },
  sm: { box: 'size-6', svg: 'size-3.5', stroke: 2.5 },
  md: { box: 'size-7', svg: 'size-4', stroke: 2.4 },
  lg: { box: 'size-9', svg: 'size-5', stroke: 2.4 },
  xl: { box: 'size-12', svg: 'size-6', stroke: 2.4 },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  className = '',
  animate = false,
}) => {
  const { box, svg, stroke } = sizeMap[size] || sizeMap.md;

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-white text-black shadow-sm shrink-0 select-none ${box} ${className} ${
        animate ? 'animate-pulse' : ''
      }`}
      aria-label="JobPulse logo"
      role="img"
    >
      <svg
        className={svg}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12h3.5l2.5-6 4 12 3-6h4.5" />
      </svg>
    </div>
  );
};
