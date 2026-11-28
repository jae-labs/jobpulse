import { Suspense } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { OverviewView } from './OverviewView';
import type { OverviewMetrics } from '../../types/job';

const mockMetrics: OverviewMetrics = {
  companies: 2599,
  total: 120, evaluated: 45, locations: [],
  high_fit: 45,
  counts: {
    new: 70,
    applied: 25,
    interviewing: 15,
    saved: 8,
    not_interested: 2,
  },
  stage_averages: { new: 84, applied: 88, interviewing: 91, saved: 86, not_interested: 58 },
  categories: [
    { name: 'Cloud & Platform Engineering', value: 50, avgMatch: 88 },
    { name: 'Cybersecurity', value: 30, avgMatch: 82 },
  ],
  relevance_distribution: [
    { range: '90-100%', min: 90, max: 100, count: 20 },
    { range: '80-89%', min: 80, max: 89, count: 25 },
  ],
  top_skills: [
    { skill: 'Kubernetes', count: 40, percentage: 80 },
    { skill: 'Terraform', count: 35, percentage: 70 },
  ],
};

describe('OverviewView', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: true, media: query,
      onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  });
  afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

  it('shows reset in the header only after changing the default layout', async () => {
    const header = document.createElement('div');
    document.body.append(header);
    const view = render(<OverviewView headerActions={header} overviewMetrics={mockMetrics} onNavigateToJobs={vi.fn()} />);
    const resize = await screen.findByRole('button', { name: 'Resize Companies' });
    expect(screen.queryByRole('button', { name: 'Reset Layout' })).not.toBeInTheDocument();
    fireEvent.keyDown(resize, { key: 'ArrowRight' });
    expect(header).toContainElement(screen.getByRole('button', { name: 'Reset Layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset Layout' }));
    expect(header).toBeEmptyDOMElement();
    view.unmount();
    header.remove();
  });

  it('keeps mobile layout changes independent and restores each layout on viewport switches', async () => {
    let desktop = true;
    let notify = () => {};
    vi.mocked(window.matchMedia).mockImplementation((query) => ({ matches: desktop, media: query,
      onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: (_event: string, callback: EventListenerOrEventListenerObject | null) => {
        if (query === '(min-width: 768px)') notify = () => {
          if (typeof callback === 'function') callback(new Event('change'));
          else callback?.handleEvent(new Event('change'));
        };
      },
      removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    const desktopKey = 'jobpulse:overview-widget-sizes:test-user';
    const mobileKey = `${desktopKey}:mobile`;
    window.localStorage.setItem(desktopKey, JSON.stringify({ companies: { columns: 6, height: 200 } }));
    const view = render(<OverviewView userId="test-user" overviewMetrics={mockMetrics} onNavigateToJobs={vi.fn()} />);
    const handle = await screen.findByRole('button', { name: 'Resize Companies' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(JSON.parse(localStorage.getItem(desktopKey)!)).toEqual({ companies: { columns: 7, height: 200 } });
    act(() => { desktop = false; notify(); });
    const mobileHandle = await screen.findByRole('button', { name: 'Resize Companies' });
    expect(screen.queryByRole('button', { name: 'Reset Layout' })).not.toBeInTheDocument();
    fireEvent.keyDown(mobileHandle, { key: 'ArrowRight' });
    expect(JSON.parse(localStorage.getItem(mobileKey)!)).toEqual({ companies: { columns: 20 } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Layout' }));
    expect(JSON.parse(localStorage.getItem(mobileKey)!)).toEqual({});
    expect(JSON.parse(localStorage.getItem(desktopKey)!)).toEqual({ companies: { columns: 7, height: 200 } });
    act(() => { desktop = true; notify(); });
    expect(await screen.findByRole('button', { name: 'Reset Layout' })).toBeInTheDocument();
    expect(screen.getByText('Companies').closest('section')!.style.height).toBe('200px');
    view.unmount();
  });

  it('restores widget order for the signed-in user', async () => {
    window.localStorage.setItem(
      'jobpulse:overview-widget-order:test-user',
      JSON.stringify(['high-fit-opportunities', 'ireland-enterprises', 'tracked-opportunities', 'ireland-labour-force', 'ireland-unemployment', 'ireland-minimum-wage', 'ireland-average-earnings', 'ireland-opportunities']),
    );
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <OverviewView
          userId="test-user"
          overviewMetrics={mockMetrics}
          onNavigateToJobs={vi.fn()}
        />
      </Suspense>
    );

    const highFit = await screen.findByText('≥75% Match');
    const tracked = await screen.findByRole('button', { name: /^Opportunities/ });
    expect(highFit.compareDocumentPosition(tracked) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Obsolete reference widgets are filtered from saved layouts; charts remain.
    expect(await screen.findByRole('heading', { name: 'Workforce vs Opportunities (Ireland)' })).toBeInTheDocument();
    expect(screen.queryByText('Enterprises · 10+ people')).not.toBeInTheDocument();
    const order: string[] = JSON.parse(window.localStorage.getItem('jobpulse:overview-widget-order:test-user')!);
    expect(order).not.toContain('ireland-enterprises');
    expect(order).toContain('ireland-pay-chart');
    expect(order[order.indexOf('tracked-opportunities') + 1]).toBe('companies');
    expect(order.filter((id) => id === 'companies')).toHaveLength(1);
  });

  it('places Application Pipeline after the five summary widgets when updating an older layout', async () => {
    window.localStorage.setItem('jobpulse:overview-widget-order:test-user', JSON.stringify(['category-breakdown', 'tracked-opportunities', 'saved-jobs', 'companies', 'high-fit-opportunities', 'pipeline-progress', 'application-pipeline']));
    const { container } = render(<OverviewView userId="test-user" overviewMetrics={mockMetrics} onNavigateToJobs={vi.fn()} />);
    await screen.findByText('Companies');
    const ids = [...container.querySelectorAll('[data-widget-id]')].map((node) => node.getAttribute('data-widget-id'));
    expect(ids.slice(0, 5)).toEqual(['tracked-opportunities', 'saved-jobs', 'companies', 'high-fit-opportunities', 'pipeline-progress']);
    expect(ids[5]).toBe('application-pipeline');
    expect(window.localStorage.getItem('jobpulse:overview-widget-order:test-user:revision')).toBe('2');
  });

  it('preserves later custom orders after the layout update', async () => {
    window.localStorage.setItem('jobpulse:overview-widget-order:test-user', JSON.stringify(['category-breakdown', 'application-pipeline', 'companies']));
    window.localStorage.setItem('jobpulse:overview-widget-order:test-user:revision', '2');
    render(<OverviewView userId="test-user" overviewMetrics={mockMetrics} onNavigateToJobs={vi.fn()} />);
    await screen.findByText('Companies');
    expect(JSON.parse(window.localStorage.getItem('jobpulse:overview-widget-order:test-user')!).slice(0, 3)).toEqual(['category-breakdown', 'application-pipeline', 'companies']);
  });

  it('resets and persists factory order and sizes without touching another account', async () => {
    const orderKey = 'jobpulse:overview-widget-order:test-user';
    const sizesKey = 'jobpulse:overview-widget-sizes:test-user';
    window.localStorage.setItem(orderKey, JSON.stringify(['category-breakdown', 'companies']));
    window.localStorage.setItem(`${orderKey}:revision`, '2');
    window.localStorage.setItem(sizesKey, JSON.stringify({ companies: { columns: 10, height: 200 } }));
    window.localStorage.setItem('jobpulse:overview-widget-sizes:other-user', '{"companies":{"columns":8}}');
    const props = { userId: 'test-user', overviewMetrics: mockMetrics, onNavigateToJobs: vi.fn() };
    const view = render(<OverviewView {...props} />);
    await screen.findByText('Companies');
    fireEvent.click(screen.getByRole('button', { name: 'Reset Layout' }));
    const factory = ['tracked-opportunities', 'companies', 'high-fit-opportunities', 'saved-jobs', 'pipeline-progress', 'application-pipeline', 'category-breakdown'];
    expect(JSON.parse(window.localStorage.getItem(orderKey)!).slice(0, 7)).toEqual(factory);
    expect(JSON.parse(window.localStorage.getItem(sizesKey)!)).toEqual({});
    expect(screen.queryByRole('button', { name: 'Reset Layout' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('jobpulse:overview-widget-sizes:other-user')).toBe('{"companies":{"columns":8}}');
    view.unmount();
    const reloaded = render(<OverviewView {...props} />);
    await screen.findByText('Companies');
    expect([...reloaded.container.querySelectorAll('[data-widget-id]')].slice(0, 7).map((node) => node.getAttribute('data-widget-id'))).toEqual(factory);
    expect(screen.getByText('Companies').closest('section')!.style.height).toBe('');
  });

  it('restores account widget sizes and saves keyboard resizing', async () => {
    window.localStorage.setItem('jobpulse:overview-widget-sizes:test-user', JSON.stringify({ companies: { columns: 6, height: 140 } }));
    render(<OverviewView userId="test-user" overviewMetrics={mockMetrics} onNavigateToJobs={vi.fn()} />);
    const handle = await screen.findByRole('button', { name: 'Resize Companies' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    const saved = JSON.parse(window.localStorage.getItem('jobpulse:overview-widget-sizes:test-user')!);
    expect(saved.companies).toEqual({ columns: 7, height: 140 });
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(JSON.parse(window.localStorage.getItem('jobpulse:overview-widget-sizes:test-user')!).companies).toBeUndefined();
  });

  it('keeps an existing company widget in its chosen position', async () => {
    window.localStorage.setItem('jobpulse:overview-widget-order:test-user', JSON.stringify(['companies', 'saved-jobs', 'tracked-opportunities']));
    render(<OverviewView userId="test-user" overviewMetrics={mockMetrics} onNavigateToJobs={vi.fn()} />);
    await screen.findByText('Companies');
    const order: string[] = JSON.parse(window.localStorage.getItem('jobpulse:overview-widget-order:test-user')!);
    expect(order.slice(0, 3)).toEqual(['companies', 'saved-jobs', 'tracked-opportunities']);
    expect(order.filter((id) => id === 'companies')).toHaveLength(1);
  });

  it('shows an unavailable company count without inventing a zero', async () => {
    render(<OverviewView overviewMetrics={{ ...mockMetrics, companies: undefined }} onNavigateToJobs={vi.fn()} />);
    const widget = (await screen.findByText('Companies')).closest('[data-widget-id]');
    expect(widget).toHaveTextContent('—');
  });

  it('keeps historical charts without the six removed reference cards', async () => {
    render(<OverviewView overviewMetrics={mockMetrics} onNavigateToJobs={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Workforce vs Opportunities (Ireland)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Minimum wage vs Average Salary (Ireland)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Employment permits issued (Ireland)' })).toBeInTheDocument();
    for (const label of ['Enterprises · 10+ people', 'Labour force · estimate', 'Unemployment', 'Minimum wage', 'Average salary', 'JobsIreland opportunities']) {
      expect(screen.queryByRole('heading', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('Fixed reference')).not.toBeInTheDocument();
  });

  it('uses the same shared sector for chart navigation and opportunities', async () => {
    const navigate = vi.fn();
    render(<Suspense fallback={<div>Loading...</div>}>
      <OverviewView overviewMetrics={{ ...mockMetrics, categories: [{ name: 'Synthetic Sector', value: 120, avgMatch: 88 }] }} onNavigateToJobs={navigate} />
    </Suspense>);
    fireEvent.click(await screen.findByTitle('Synthetic Sector'));
    expect(navigate).toHaveBeenCalledWith({ status: 'all', sector: 'Synthetic Sector', minMatch: 0 });
  });

  it('renders summary stat cards with correct metrics', async () => {
    const handleNavigate = vi.fn();
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <OverviewView
          overviewMetrics={mockMetrics}
          onNavigateToJobs={handleNavigate}
        />
      </Suspense>
    );

    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(await screen.findByText('45')).toBeInTheDocument();
    const companyCard = (await screen.findByText('Companies')).closest('[data-widget-id]');
    expect(companyCard).toHaveTextContent('2,599');
    expect(screen.getByRole('button', { name: 'Reorder Companies' })).toBeInTheDocument();
  });

  it('shows each pipeline stage average alongside its count', async () => {
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <OverviewView overviewMetrics={mockMetrics} onNavigateToJobs={vi.fn()} />
      </Suspense>
    );

    expect(await screen.findByText('84% avg match')).toBeInTheDocument();
    expect(screen.getByText('91% avg match')).toBeInTheDocument();
  });

  it('triggers navigation when stat card is clicked', async () => {
    const handleNavigate = vi.fn();
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <OverviewView
          overviewMetrics={mockMetrics}
          onNavigateToJobs={handleNavigate}
        />
      </Suspense>
    );

    const totalOpportunitiesCard = await screen.findByRole('button', { name: /^Opportunities/ });
    expect(totalOpportunitiesCard).not.toBeNull();
    fireEvent.click(totalOpportunitiesCard!);

    expect(handleNavigate).toHaveBeenCalledWith({ status: 'all', sector: 'all', minMatch: 0 });
  });

  it('navigates to high-fit filter when high-fit card is clicked', async () => {
    const handleNavigate = vi.fn();
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <OverviewView
          overviewMetrics={mockMetrics}
          onNavigateToJobs={handleNavigate}
        />
      </Suspense>
    );

    const highFitCard = (await screen.findByText('≥75% Match')).closest('button');
    expect(highFitCard).not.toBeNull();
    fireEvent.click(highFitCard!);

    expect(handleNavigate).toHaveBeenCalledWith({ status: 'all', sector: 'all', minMatch: 75 });
  });
});
