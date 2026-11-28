import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('renders with default size and aria-label', () => {
    render(<BrandLogo />);
    const logo = screen.getByLabelText('JobPulse logo');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveClass('size-7');
  });

  it('applies custom size and animation class', () => {
    render(<BrandLogo size="lg" animate={true} className="custom-class" />);
    const logo = screen.getByLabelText('JobPulse logo');
    expect(logo).toHaveClass('size-9');
    expect(logo).toHaveClass('animate-pulse');
    expect(logo).toHaveClass('custom-class');
  });
});
