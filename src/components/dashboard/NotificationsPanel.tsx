import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Button, EmptyState, Sheet, SheetTrigger, SheetContent,
  SheetClose, SheetTitle, SheetDescription,
} from '@jae-labs/ui';

export function NotificationsPanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-9"
        aria-label={t('notifications.open')} title={t('notifications.title')}>
        <Bell aria-hidden="true" className="size-5" />
      </Button>
    </SheetTrigger>
    <SheetContent aria-modal="true" side="right" motion="slide" hideCloseButton className="h-dvh max-w-none p-0 sm:max-w-md">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ds-border px-4 py-3 sm:px-5"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}>
        <SheetTitle className="text-base font-semibold text-ds-text-primary">{t('notifications.title')}</SheetTitle>
        <SheetDescription className="sr-only">{t('notifications.description')}</SheetDescription>
        <SheetClose asChild>
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 sm:size-9"
            aria-label={t('notifications.close')}>
            <X aria-hidden="true" className="size-5" />
          </Button>
        </SheetClose>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-contain px-5 py-8"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}>
        <EmptyState icon={Bell} title={t('notifications.emptyTitle')}
          description={t('notifications.emptyDescription')} className="border-0 bg-transparent shadow-none" />
      </div>
    </SheetContent>
  </Sheet>;
}
