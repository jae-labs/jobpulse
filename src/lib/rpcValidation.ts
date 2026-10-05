import type {
  Job,
  JobsPageResult,
  OverviewMetrics,
} from "../types/job";
import { isJobStatus } from '../types/job';
import { parseSubScores } from './scoringJson';
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid RPC object");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid RPC string");
  return value;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("Invalid RPC number");
  return value;
}

function nullableCoordinate(value: unknown, maximum: number): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > maximum)
    throw new Error("Invalid RPC coordinate");
  return value;
}

export function validateOverviewMetrics(data: unknown): OverviewMetrics {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid overview metrics response: expected object");
  }
  const obj = data as Record<string, unknown>;
  if (
    !obj.counts ||
    typeof obj.counts !== "object" ||
    Array.isArray(obj.counts) ||
    !Array.isArray(obj.categories) ||
    !Array.isArray(obj.relevance_distribution) ||
    !Array.isArray(obj.top_skills)
  ) {
    throw new Error("Invalid overview metrics response: missing chart data");
  }
  for (const key of ["total", "evaluated", "high_fit"]) {
    if (
      typeof obj[key] !== "number" ||
      !Number.isSafeInteger(obj[key]) ||
      (obj[key] as number) < 0
    )
      throw new Error("Invalid overview metrics count");
  }
  if (obj.companies !== undefined && (
    typeof obj.companies !== "number" || !Number.isSafeInteger(obj.companies) || obj.companies < 0
  )) throw new Error("Invalid overview company count");
  if (!Array.isArray(obj.locations))
    throw new Error("Invalid overview locations");
  if (
    Object.values(obj.counts).some(
      (value) =>
        typeof value !== "number" || !Number.isSafeInteger(value) || value < 0,
    )
  )
    throw new Error("Invalid overview stage count");
  return {
    companies: obj.companies as number | undefined,
    evaluated: obj.evaluated as number,
    locations: obj.locations.map((value) => {
      const row = record(value);
      return { loc: string(row.loc), count: count(row.count) };
    }),
    total: typeof obj.total === "number" ? obj.total : 0,
    high_fit: typeof obj.high_fit === "number" ? obj.high_fit : 0,
    counts: obj.counts as Record<string, number>,
    stage_averages:
      obj.stage_averages &&
      typeof obj.stage_averages === "object" &&
      !Array.isArray(obj.stage_averages)
        ? Object.fromEntries(
            Object.entries(obj.stage_averages).filter(
              ([, value]) =>
                typeof value === "number" && Number.isFinite(value),
            ),
          )
        : {},
    categories: (obj.sectors === undefined ? obj.categories : (() => {
      if (!Array.isArray(obj.sectors)) throw new Error("Invalid overview sectors");
      return obj.sectors;
    })()).map((c) => ({
      name: string(record(c).name),
      value: count(record(c).value),
      avgMatch: count(record(c).avgMatch),
    })),
    relevance_distribution: obj.relevance_distribution.map((r) => ({
      range: string(record(r).range),
      min: count(record(r).min),
      max: count(record(r).max),
      count: count(record(r).count),
    })),
    top_skills: obj.top_skills.map((s) => ({
      skill: string(record(s).skill),
      count: count(record(s).count),
      percentage: count(record(s).percentage),
    })),
  };
}

export function validateJobsPageResult(data: unknown): JobsPageResult {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid jobs page response: expected object");
  }
  const obj = data as Record<string, unknown>;
  const total = typeof obj.total === "number" ? obj.total : 0;
  if (!Array.isArray(obj.items)) throw new Error("Invalid jobs items");
  const rawItems = obj.items;

  if (
    typeof obj.total !== "number" ||
    !Number.isSafeInteger(obj.total) ||
    obj.total < 0
  )
    throw new Error("Invalid jobs total");
  const items: Job[] = rawItems.map((raw) => {
    const item = record(raw);
    const status = item.status === 'interested' ? 'new' : item.status;
    if (!isJobStatus(status)) throw new Error('Invalid job status');
    if (
      !Number.isSafeInteger(item.id) ||
      !Array.isArray(item.matched_skills) ||
      item.matched_skills.some((skill) => typeof skill !== "string")
    )
      throw new Error("Invalid job item");
    for (const field of [
      "title",
      "company",
      "location",
      "url",
      "source",
      "last_seen_at",
      "status",
    ])
      string(item[field]);
    if (item.is_saved !== undefined && typeof item.is_saved !== "boolean") throw new Error("Invalid saved state");
    count(item.relevance);
    if ((item.relevance as number) > 100) throw new Error("Invalid relevance");
    if (item.employer_id != null && !Number.isSafeInteger(item.employer_id))
      throw new Error("Invalid employer ID");
    const latitude = nullableCoordinate(item.latitude, 90);
    const longitude = nullableCoordinate(item.longitude, 180);
    if ((latitude === null) !== (longitude === null)) throw new Error("Incomplete RPC coordinates");
    return {
      employer_id: item.employer_id == null ? null : Number(item.employer_id),
      sector: item.sector === undefined
        ? (item.employer_sector === undefined ? 'Uncategorized' : string(item.employer_sector))
        : string(item.sector),
      latitude,
      longitude,
      id: Number(item.id),
      title: String(item.title ?? ""),
      company: String(item.company ?? ""),
      location: String(item.location ?? ""),
      employment_type: String(item.employment_type ?? ""),
      salary_text: item.salary_text ? String(item.salary_text) : null,
      salary_min_amount:
        typeof item.salary_min_amount === "number"
          ? item.salary_min_amount
          : null,
      salary_max_amount:
        typeof item.salary_max_amount === "number"
          ? item.salary_max_amount
          : null,
      salary_currency:
        typeof item.salary_currency === "string" ? item.salary_currency : null,
      salary_period:
        typeof item.salary_period === "string" ? item.salary_period : null,
      description: item.description ? String(item.description) : undefined,
      url: String(item.url ?? ""),
      source: String(item.source ?? ""),
      relevance: Number(item.relevance ?? 0),
      matched_skills: Array.isArray(item.matched_skills)
        ? (item.matched_skills as string[])
        : [],
      fit_tier: item.fit_tier ? String(item.fit_tier) : undefined,
      role_sector: item.role_sector ? String(item.role_sector) : undefined,
      seniority_level: item.seniority_level
        ? String(item.seniority_level)
        : undefined,
      sub_scores: parseSubScores(item.sub_scores),
      is_saved: item.is_saved === true || item.status === "interested",
      status,
      last_seen_at: String(item.last_seen_at ?? new Date().toISOString()),
    };
  });

  return { total, items };
}

export function validateJobMapResult(data: unknown): import('../types/job').JobMapResult {
  const obj = record(data);
  if (!Array.isArray(obj.pins) || obj.pins.length > 2000 || typeof obj.truncated !== 'boolean') throw new Error('Invalid map result');
  return {
    ...(obj.office_pins !== undefined ? {
      office_pins: validateJobMapResult({ ...obj, pins: obj.office_pins, office_pins: undefined,
        truncated: obj.office_truncated }).pins,
      office_truncated: obj.office_truncated as boolean,
    } : {}),
    total: count(obj.total), mapped: count(obj.mapped), in_view: count(obj.in_view), truncated: obj.truncated,
    pins: obj.pins.map((raw) => {
      const pin = record(raw);
      const latitude = nullableCoordinate(pin.latitude, 90);
      const longitude = nullableCoordinate(pin.longitude, 180);
      if (latitude === null || longitude === null || !Array.isArray(pin.job_ids) || pin.job_ids.length > 5 ||
          pin.job_ids.some((id) => !Number.isSafeInteger(id))) throw new Error('Invalid map pin');
      return { latitude, longitude, count: count(pin.count), job_ids: pin.job_ids as number[],
        title: string(pin.title), company: string(pin.company), sector: string(pin.sector), precision: string(pin.precision) };
    }),
  };
}
