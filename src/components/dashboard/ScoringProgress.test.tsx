import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoringProgress } from './ScoringProgress';

const mocks = vi.hoisted(() => ({ resume: vi.fn(), refetch: vi.fn() }));
vi.mock('../../hooks/useQueries', () => ({ useScoringStateQuery: () => ({ data: { state: 'awaiting_embedding' }, isError: false, refetch: mocks.refetch }) }));
vi.mock('../../lib/userProfile', () => ({ resumeProfileMatching: mocks.resume }));

describe('matching setup recovery', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.refetch.mockResolvedValue(undefined); });
  it('keeps a failed setup visible, avoids a retry loop, and permits explicit retry', async () => {
    mocks.resume.mockRejectedValueOnce(new Error('Model download unavailable')).mockResolvedValueOnce(undefined);
    const { rerender } = render(<ScoringProgress userId="a" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /try again|retry/i })).toBeEnabled());
    expect(screen.getByRole('status')).toBeVisible();
    rerender(<ScoringProgress userId="a" />);
    expect(mocks.resume).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /try again|retry/i })); });
    expect(mocks.resume).toHaveBeenCalledTimes(2);
    expect(mocks.resume).toHaveBeenLastCalledWith('a');
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
