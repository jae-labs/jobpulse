import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../../lib/i18n';
import type { Profile } from '../../types/job';

interface UserProfileMenuProps {
  userEmail?: string | null;
  profile?: Profile | null;
  onNavigateToProfile: () => void;
  onSignOut: () => void;
}

export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({
  userEmail,
  profile,
  onNavigateToProfile,
  onSignOut,
}) => {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const displayName =
    profile?.name ||
    (profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : '') ||
    userEmail?.split('@')[0] ||
    'User';

  const avatarUrl = profile?.avatar_url;

  return (
    <div className="relative inline-flex items-center" ref={menuRef}>
      {/* Profile Picture / Avatar Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative size-8 shrink-0 rounded-full border border-zinc-700/80 bg-zinc-800 text-zinc-200 hover:border-zinc-500 hover:ring-2 hover:ring-indigo-500/30 transition-all cursor-pointer flex items-center justify-center overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        aria-expanded={isOpen}
        aria-haspopup="true"
        title={`${t('nav.profile')} (${displayName})`}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-[11px] font-semibold text-zinc-300 select-none uppercase tracking-wide">
            {displayName.slice(0, 2)}
          </span>
        )}
      </button>

      {/* Profile Menu Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-56 sm:w-60 rounded-xl border border-white/[0.08] bg-[#16171b] p-2 shadow-2xl z-50 text-xs text-zinc-200 animate-in fade-in-50 zoom-in-95 duration-100 divide-y divide-white/[0.06]">
          {/* User Info Header */}
          <div className="px-2.5 py-2">
            <p className="font-semibold text-zinc-100 truncate">{displayName}</p>
            {userEmail && (
              <p className="text-[11px] font-mono text-zinc-400 truncate mt-0.5" title={userEmail}>
                {userEmail}
              </p>
            )}
          </div>

          {/* Navigation Links */}
          <div className="py-1.5 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onNavigateToProfile();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors cursor-pointer text-left"
            >
              <User className="size-3.5 text-zinc-400 shrink-0" />
              <span>{t('nav.profile')}</span>
            </button>
          </div>

          {/* Language Switcher */}
          <div className="py-1.5 space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="size-3 text-zinc-400" />
              <span>{t('nav.language')}</span>
            </div>
            <div className="grid grid-cols-2 gap-1 px-1">
              {supportedLanguages.map((lang) => {
                const isSelected =
                  i18n.language === lang.code ||
                  (lang.code === 'pt-BR' && i18n.language.startsWith('pt')) ||
                  (lang.code === 'en' && i18n.language.startsWith('en'));
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      void i18n.changeLanguage(lang.code);
                    }}
                    className={`flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-white/[0.12] text-white font-medium border border-white/[0.12]'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sign Out */}
          <div className="pt-1.5">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onSignOut();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 transition-colors cursor-pointer text-left"
            >
              <LogOut className="size-3.5 shrink-0" />
              <span>{t('nav.signOut')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
