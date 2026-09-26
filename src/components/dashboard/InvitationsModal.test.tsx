import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvitationsModal } from './InvitationsModal';
import type { InvitationItem } from '../../hooks/useQueries';

const mockMutateAsync = vi.fn();
const mockRevokeMutateAsync = vi.fn();

const mockInvitations: InvitationItem[] = [
  {
    id: 1,
    email: 'teammate@example.com',
    role: 'member',
    status: 'pending',
    invite_code: 'abc123code',
    created_at: '2026-09-20T10:00:00Z',
    accepted_at: null,
    invited_by: 'user-1',
  },
  {
    id: 2,
    email: 'peer@example.com',
    role: 'member',
    status: 'accepted',
    invite_code: 'def456code',
    created_at: '2026-09-18T10:00:00Z',
    accepted_at: '2026-09-18T12:00:00Z',
    invited_by: 'user-1',
  },
];

vi.mock('../../hooks/useQueries', () => ({
  useInvitationsQuery: () => ({
    data: mockInvitations,
    isLoading: false,
  }),
  useCreateInvitationMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useDeleteInvitationMutation: () => ({
    mutateAsync: mockRevokeMutateAsync,
    isPending: false,
  }),
}));

describe('InvitationsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders modal when open with invite form and list', () => {
    render(
      <InvitationsModal
        isOpen={true}
        onClose={vi.fn()}
        currentUserEmail="admin@example.com"
      />
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Invite/i);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/^Invitations$/i);
    expect(screen.getByText('teammate@example.com')).toBeInTheDocument();
    expect(screen.getByText('peer@example.com')).toBeInTheDocument();
  });

  it('submits new invitation and displays generated link', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      success: true,
      id: 3,
      email: 'newperson@example.com',
      role: 'member',
      invite_code: 'token789',
    });

    render(
      <InvitationsModal
        isOpen={true}
        onClose={vi.fn()}
        currentUserEmail="admin@example.com"
      />
    );

    const emailInput = screen.getByPlaceholderText(/name@example\.com/i);
    fireEvent.change(emailInput, { target: { value: 'newperson@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /^Invite$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        email: 'newperson@example.com',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Invitation link created!/i)).toBeInTheDocument();
    });
  });

  it('displays link when inviting someone who already has a pending invitation', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      success: true,
      id: 1,
      email: 'teammate@example.com',
      role: 'member',
      invite_code: 'abc123code',
      already_pending: true,
    });

    render(
      <InvitationsModal
        isOpen={true}
        onClose={vi.fn()}
        currentUserEmail="admin@example.com"
      />
    );

    const emailInput = screen.getByPlaceholderText(/name@example\.com/i);
    fireEvent.change(emailInput, { target: { value: 'teammate@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /^Invite$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        email: 'teammate@example.com',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Invitation link created!/i)).toBeInTheDocument();
      const input = screen.getByDisplayValue(/invite=abc123code/);
      expect(input).toBeInTheDocument();
    });
  });

  it('formats PostgrestError objects correctly instead of [object Object]', async () => {
    mockMutateAsync.mockRejectedValueOnce({
      message: 'function gen_random_bytes does not exist',
      details: null,
      hint: null,
      code: '42883',
    });

    render(
      <InvitationsModal
        isOpen={true}
        onClose={vi.fn()}
        currentUserEmail="admin@example.com"
      />
    );

    const emailInput = screen.getByPlaceholderText(/name@example\.com/i);
    fireEvent.change(emailInput, { target: { value: 'fail@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /^Invite$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/function gen_random_bytes does not exist/i)).toBeInTheDocument();
      expect(screen.queryByText(/\[object Object\]/)).toBeNull();
    });
  });

  it('omits Copy from previous invitations but keeps it for a newly generated link', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      success: true,
      id: 3,
      email: 'newperson@example.com',
      role: 'member',
      invite_code: 'token789',
    });

    render(
      <InvitationsModal
        isOpen={true}
        onClose={vi.fn()}
        currentUserEmail="admin@example.com"
      />
    );

    expect(screen.queryByRole('button', { name: /^Copy$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/name@example\.com/i), {
      target: { value: 'newperson@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Invite$/i }));

    const copyButton = await screen.findByRole('button', { name: /^Copy$/i });
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('invite=token789')
    );
  });

  it('invokes revoke mutation when clicking delete button', async () => {
    mockRevokeMutateAsync.mockResolvedValueOnce({ success: true });

    render(
      <InvitationsModal
        isOpen={true}
        onClose={vi.fn()}
        currentUserEmail="admin@example.com"
      />
    );

    const deleteBtn = screen.getByTitle(/Delete/i);
    fireEvent.click(deleteBtn);

    expect(mockRevokeMutateAsync).toHaveBeenCalledWith(1);
  });
});
