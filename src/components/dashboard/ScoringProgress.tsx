import { useTranslation } from "react-i18next";
import { Button } from "@jae-labs/ui";
import { formatNumber } from "../../lib/i18n";
import { useScoringStateQuery } from "../../hooks/useQueries";
import { useCallback, useEffect, useRef, useState } from 'react';
import { resumeProfileMatching } from '../../lib/userProfile';
export function ScoringProgress({ userId }: { userId?: string }) {
  const { t, i18n } = useTranslation();
  const { data, isError, refetch } = useScoringStateQuery(userId);
  const attemptedOwner = useRef<string | undefined>(undefined);
  const [isResuming, setIsResuming] = useState(false);
  const resume = useCallback(async () => {
    if (!userId) return;
    setIsResuming(true);
    try {
      await resumeProfileMatching(userId);
      await refetch();
    } catch {
      // Keep the durable pending state visible and allow an explicit retry.
    } finally {
      setIsResuming(false);
    }
  }, [userId, refetch]);
  useEffect(() => {
    if (data?.state !== 'awaiting_embedding' || !userId || attemptedOwner.current === userId) return;
    attemptedOwner.current = userId;
    void resume();
  }, [data?.state, userId, resume]);
  if ((!data && !isError) || data?.state === "complete") return null;
  return (
    <div
      role="status"
      className="shrink-0 border-b border-ds-border px-4 py-2 text-xs text-ds-text-secondary"
    >
      {isError ? (
        <Button size="sm" variant="ghost" onClick={() => void refetch()}>
          {t("common.loadError")} {t("common.retry")}
        </Button>
      ) : data?.state === 'awaiting_embedding' ? (
        <span>
          {t('scoring.matchingPending')}{' '}
          <Button size="sm" variant="ghost" disabled={isResuming} onClick={() => void resume()}>
            {isResuming ? t('common.loading') : t('common.retry')}
          </Button>
        </span>
      ) : data?.state === "failed" ? (
        t("scoring.retryScheduled")
      ) : (
        t("scoring.progress", {
          completed: formatNumber(data?.completed ?? 0, i18n.language),
          total: formatNumber(data?.total ?? 0, i18n.language),
        })
      )}
    </div>
  );
}
