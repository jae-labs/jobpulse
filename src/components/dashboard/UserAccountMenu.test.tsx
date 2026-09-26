import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UserAccountMenu } from './UserAccountMenu';

vi.mock('../../hooks/useAvatarUrl', () => ({
  useAvatarUrl: () => null,
}));

describe('UserAccountMenu', () => {
  it('opens account settings and keeps Profile and Invite a friend as separate actions', () => {
    const handleOpenInvitations = vi.fn();
    const handleNavigateToProfile = vi.fn();
    const handleSignOut = vi.fn();

    render(
      <UserAccountMenu
        userEmail="alex@example.com"
        onNavigateToProfile={handleNavigateToProfile}
        onOpenInvitations={handleOpenInvitations}
        onSignOut={handleSignOut}
      />
    );

    // Click avatar button to open dropdown
    const avatarButton = screen.getByRole('button', { name: /Account settings/i });
    fireEvent.click(avatarButton);

    const accountSettings = screen.getByRole('group', { name: 'Account settings' });
    expect(accountSettings).toContainElement(screen.getByText('Account settings'));
    const profileButton = screen.getByRole('button', { name: /^Profile$/i });
    fireEvent.click(profileButton);
    expect(handleNavigateToProfile).toHaveBeenCalledTimes(1);

    fireEvent.click(avatarButton);

    // Check menu item is visible and click it
    const inviteButton = screen.getByRole('button', { name: /^Invite a friend$/i });
    expect(inviteButton).toBeInTheDocument();

    fireEvent.click(inviteButton);
    expect(handleOpenInvitations).toHaveBeenCalledTimes(1);
  });
});
