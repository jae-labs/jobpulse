import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UserAccountMenu } from './UserAccountMenu';

vi.mock('../../hooks/useAvatarUrl', () => ({
  useAvatarUrl: () => null,
}));

describe('UserAccountMenu', () => {
  it('opens Data and privacy inside the app and closes the menu', () => {
    const navigate = vi.fn();
    render(<UserAccountMenu onNavigateToPrivacy={navigate} onNavigateToProfile={vi.fn()} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Account settings/i }));
    const security = screen.getByRole('group', { name: 'Security' });
    expect(security).toContainElement(screen.getByText('Security'));
    expect(security).toContainElement(screen.getByRole('button', { name: 'Data and privacy' }));
    expect(security).not.toContainElement(screen.getByRole('button', { name: 'Sign Out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Data and privacy' }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Data and privacy' })).not.toBeInTheDocument();
  });

  it('opens account settings and keeps Profile and Invite and manage members as separate actions', () => {
    const handleOpenMemberManagement = vi.fn();
    const handleNavigateToProfile = vi.fn();
    const handleSignOut = vi.fn();

    render(
      <UserAccountMenu
        userEmail="alex@example.com"
        onNavigateToProfile={handleNavigateToProfile}
        onOpenMemberManagement={handleOpenMemberManagement}
        onSignOut={handleSignOut}
      />
    );

    // Click avatar button to open dropdown
    const avatarButton = screen.getByRole('button', { name: /Account settings/i });
    fireEvent.click(avatarButton);

    expect(screen.queryByRole('button', { name: 'Export account data' })).not.toBeInTheDocument();
    const accountSettings = screen.getByRole('group', { name: 'Account settings' });
    expect(accountSettings).toContainElement(screen.getByText('Account settings'));
    const profileButton = screen.getByRole('button', { name: /^Profile$/i });
    fireEvent.click(profileButton);
    expect(handleNavigateToProfile).toHaveBeenCalledTimes(1);

    fireEvent.click(avatarButton);

    // Check menu item is visible and click it
    const inviteButton = screen.getByRole('button', { name: /^Invite and manage members$/i });
    expect(inviteButton).toBeInTheDocument();

    fireEvent.click(inviteButton);
    expect(handleOpenMemberManagement).toHaveBeenCalledTimes(1);
  });
});
