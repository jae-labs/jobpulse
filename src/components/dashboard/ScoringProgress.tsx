import { useIsMutating } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { useTranslation } from "react-i18next";
import { Button } from "@jae-labs/ui";
import { formatNumber } from "../../lib/i18n";
import {
  useProfileQuery,
  useSaveProfileMutation,
  useScoringStateQuery,
} from "../../hooks/useQueries";
export function ScoringProgress({ userId }: { userId?: string }) {
  const { t, i18n } = useTranslation();
  const profile = useProfileQuery(userId);
  const retry = useSaveProfileMutation(userId);
  const isSavingProfile =
    useIsMutating({ mutationKey: queryKeys.profile(userId) }) > 0;
  const { data, isError, refetch } = useScoringStateQuery(userId);
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
      ) : data?.state === "awaiting_embedding" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={isSavingProfile || profile.isFetching || !profile.data}
          onClick={() =>
            profile.data && void retry.mutateAsync(profile.data).catch(() => {})
          }
        >
          {isSavingProfile ? t("common.loading") : t("scoring.completeSetup")}
        </Button>
      ) : data?.state === "failed" ? (
        t("scoring.retryScheduled")
      ) : (
        t("scoring.progress", {
          completed: formatNumber(data?.completed ?? 0, i18n.language),
          total: formatNumber(data?.total ?? 0, i18n.language),
        })
      )}
      {retry.isError || retry.data?.success === false ? (
        <p role="alert">{t("scoring.setupFailed")}</p>
      ) : null}
    </div>
  );
}
