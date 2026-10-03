import { useTranslation } from "react-i18next";
import { Button } from "@jae-labs/ui";
import { formatNumber } from "../../lib/i18n";
import { useScoringStateQuery } from "../../hooks/useQueries";
export function ScoringProgress({ userId }: { userId?: string }) {
  const { t, i18n } = useTranslation();
  const { data, isError, refetch } = useScoringStateQuery(userId);
  if ((!data && !isError) || data?.state === "complete" || data?.state === "awaiting_embedding") return null;
  return (
    <div
      role="status"
      className="shrink-0 border-b border-ds-border px-4 py-2 text-xs text-ds-text-secondary"
    >
      {isError ? (
        <Button size="sm" variant="ghost" onClick={() => void refetch()}>
          {t("common.loadError")} {t("common.retry")}
        </Button>
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
