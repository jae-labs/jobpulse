import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivacyView } from './PrivacyView';

const mutation = vi.hoisted(() => ({ isPending: false, isError: false, mutateAsync: vi.fn().mockResolvedValue(true) }));
vi.mock('../../hooks/useQueries', () => ({ useExportAccountMutation: () => mutation }));

describe('PrivacyView', () => {
  beforeEach(() => { vi.clearAllMocks(); mutation.isPending = false; mutation.isError = false; });
  it('presents privacy information and account controls in the app', async () => {
    render(<PrivacyView onDeleteAccount={vi.fn()} />);
    for (const name of ['Data and privacy', 'Your data', 'How your data is used', 'Error reporting', 'Access, export and deletion', 'Storage and retention', 'Questions and requests']) {
      expect(screen.getAllByRole('heading', { name }).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Deletion does not immediately erase/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'luiz@justanother.engineer' })).toHaveAttribute('href', 'mailto:luiz@justanother.engineer');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Export account data' })); });
    expect(mutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Manage profile and documents' })).not.toBeInTheDocument();
  });
  it('keeps export failures visible and prevents duplicate pending exports', () => {
    mutation.isPending = true; mutation.isError = true;
    render(<PrivacyView onDeleteAccount={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Export failed. Please try again.');
  });
  it('ends the page with one export action followed by the Danger zone', () => {
    render(<PrivacyView userEmail="candidate@example.invalid" onDeleteAccount={vi.fn()} />);
    const headings = screen.getAllByRole('heading');
    expect(headings.at(-2)).toHaveTextContent('Data and privacy');
    expect(headings.at(-1)).toHaveTextContent('Danger zone');
    expect(screen.getAllByRole('button', { name: 'Export account data' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Questions and requests' }).compareDocumentPosition(headings.at(-2)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('requires the signed-in account email before deleting and blocks repeated submissions', async () => {
    const onDeleteAccount = vi.fn(() => new Promise<void>(() => {}));
    render(<PrivacyView userEmail="candidate@example.invalid" onDeleteAccount={onDeleteAccount} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' });
    const input = within(dialog).getByLabelText('Enter candidate@example.invalid to confirm');
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: 'other@example.invalid' } });
    fireEvent.click(confirm);
    expect(onDeleteAccount).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'candidate@example.invalid' } });
    await act(async () => { fireEvent.click(confirm); });
    expect(onDeleteAccount).toHaveBeenCalledExactlyOnceWith('candidate@example.invalid');
    expect(within(dialog).getByRole('button', { name: 'Deleting account...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(input).toBeDisabled();
  });

  it('shows deletion failures and clears confirmation when cancelled', async () => {
    const onDeleteAccount = vi.fn().mockRejectedValue(new Error('Synthetic failure'));
    render(<PrivacyView userEmail="candidate@example.invalid" onDeleteAccount={onDeleteAccount} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    let dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Enter candidate@example.invalid to confirm'), { target: { value: 'candidate@example.invalid' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent("We couldn't delete your account"));
    expect(within(dialog).getByRole('button', { name: 'Delete account' })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Enter candidate@example.invalid to confirm')).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'Delete account' })).toBeDisabled();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

});
