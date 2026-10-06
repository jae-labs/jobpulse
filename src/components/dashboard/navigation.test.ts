import { describe, it, expect } from 'vitest';
import { dashboardNavigation } from './navigation';

describe('navigation', () => {
  it('defines the core navigation tabs and valid paths', () => {
    const ids = dashboardNavigation.map((n) => n.id);
    expect(ids).toEqual(['overview', 'jobs', 'tax', 'privacy', 'profile']);

    const paths = dashboardNavigation.map((n) => n.path);
    expect(paths).toContain('/overview');
    expect(paths).toContain('/opportunities');
    expect(paths).not.toContain('/sources');
    expect(paths).toContain('/tax-calculator');
    expect(paths).toContain('/profile');
    expect(paths).toContain('/privacy');
  });
});
