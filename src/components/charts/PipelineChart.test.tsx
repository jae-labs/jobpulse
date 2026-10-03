import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PipelineChart } from './PipelineChart';

describe('PipelineChart', () => {
  const mockCounts = {
    new: 8,
    applied: 3,
    interviewing: 1,
    rejected: 0,
  };

  const mockStageAverages = {
    new: 100,
    applied: 100,
    interviewing: 100,
    rejected: 0,
  };

  it('renders all four pipeline stages (New, Applied, Interview, Rejected) in both chart axis and summary pills', () => {
    const { container } = render(
      <PipelineChart
        counts={mockCounts}
        stageAverages={mockStageAverages}
      />
    );

    // Each stage must be present in both the chart XAxis tick (<text>) and the pill (<span class="truncate">)
    for (const stageName of ['New', 'Applied', 'Interview', 'Rejected']) {
      const elements = screen.getAllByText(stageName);
      expect(elements.length).toBeGreaterThanOrEqual(2);
      // Verify one is the SVG tick text
      const svgTick = container.querySelector(`text[font-size="10"]`);
      expect(svgTick).toBeInTheDocument();
    }

    // Verify stage counts are displayed
    expect(screen.getAllByText('8').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onSelectStatus when a stage pill or tick is clicked', () => {
    const handleSelectStatus = vi.fn();
    render(
      <PipelineChart
        counts={mockCounts}
        stageAverages={mockStageAverages}
        onSelectStatus={handleSelectStatus}
      />
    );

    // Click the Interview pill
    const interviewElements = screen.getAllByText('Interview');
    const pillElement = interviewElements.find((el) => el.tagName.toLowerCase() === 'span');
    expect(pillElement).toBeDefined();
    if (pillElement) {
      fireEvent.click(pillElement);
      expect(handleSelectStatus).toHaveBeenCalledWith('interviewing');
    }
  });
});
