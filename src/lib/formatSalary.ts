export interface SalaryInfo {
  salary_text?: string | null;
  salary_min_amount?: number | null;
  salary_max_amount?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
}

/**
 * Formats a numeric amount or job salary range into a compact 'k' representation
 * (e.g. '€110k - €135k', '€100k', '$95k - $120k', '€85k+').
 */
export function formatCompactSalary(job?: SalaryInfo | null, fallback = 'Competitive'): string {
  if (!job) return fallback;

  const min = job.salary_min_amount;
  const max = job.salary_max_amount;
  const curr = job.salary_currency;
  const text = job.salary_text;

  const symbol =
    curr === 'USD' || text?.includes('$')
      ? '$'
      : curr === 'GBP' || text?.includes('£')
      ? '£'
      : '€';

  const toK = (val: number): string => {
    if (val >= 1000) {
      const k = val / 1000;
      return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(val);
  };

  if (typeof min === 'number' && typeof max === 'number' && min > 0 && max > 0) {
    if (min === max) {
      return `${symbol}${toK(min)}`;
    }
    return `${symbol}${toK(min)} - ${symbol}${toK(max)}`;
  }

  if (typeof max === 'number' && max > 0) {
    return `${symbol}${toK(max)}`;
  }

  if (typeof min === 'number' && min > 0) {
    return `${symbol}${toK(min)}+`;
  }

  if (text && text.trim()) {
    return text
      .replace(/([0-9]{2,3}),000\b/g, '$1k')
      .replace(/([0-9]{2,3})\s*,\s*([0-9]{3})\b/g, '$1k');
  }

  return fallback;
}
