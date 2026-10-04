import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivacyView } from './PrivacyView';

const mutation = vi.hoisted(() => ({ isPending: false, isError: false, mutateAsync: vi.fn().mockResolvedValue(true) }));
vi.mock('../../hooks/useQueries', () => ({ useExportAccountMutation: () => mutation }));

describe('PrivacyView', () => {
  beforeEach(() => { vi.clearAllMocks(); mutation.isPending = false; mutation.isError = false; });
  it('presents privacy information and account controls in the app', async () => {
    render(<PrivacyView />);
    for (const name of ['Data and privacy', 'Your data', 'How your data is used', 'Error reporting', 'Access, export and deletion', 'Storage and retention', 'Questions and requests']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/Deletion does not immediately erase/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'luiz@justanother.engineer' })).toHaveAttribute('href', 'mailto:luiz@justanother.engineer');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Export my account data' })); });
    expect(mutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Manage profile and documents' })).not.toBeInTheDocument();
  });
  it('keeps export failures visible and prevents duplicate pending exports', () => {
    mutation.isPending = true; mutation.isError = true;
    render(<PrivacyView />);
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Export failed. Please try again.');
  });
});
