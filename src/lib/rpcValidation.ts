import type {
  Job,
  JobStatus,
  JobsPageResult,
  OverviewMetrics,
} from "../types/job";
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
    sectors: obj.sectors === undefined ? undefined : (() => {
      if (!Array.isArray(obj.sectors)) throw new Error("Invalid overview sectors");
      return obj.sectors.map((value) => {
        const row = record(value);
        return { name: string(row.name), value: count(row.value), avgMatch: count(row.avgMatch) };
      });
    })(),
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
    categories: obj.categories.map((c) => ({
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
    count(item.relevance);
    if ((item.relevance as number) > 100) throw new Error("Invalid relevance");
    if (item.employer_id != null && !Number.isSafeInteger(item.employer_id))
      throw new Error("Invalid employer ID");
    const latitude = nullableCoordinate(item.latitude, 90);
    const longitude = nullableCoordinate(item.longitude, 180);
    if ((latitude === null) !== (longitude === null)) throw new Error("Incomplete RPC coordinates");
    return {
      employer_id: item.employer_id == null ? null : Number(item.employer_id),
      employer_sector: item.employer_sector === undefined ? undefined : string(item.employer_sector),
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
      role_domain: item.role_domain ? String(item.role_domain) : undefined,
      seniority_level: item.seniority_level
        ? String(item.seniority_level)
        : undefined,
      sub_scores:
        item.sub_scores &&
        typeof item.sub_scores === "object" &&
        !Array.isArray(item.sub_scores)
          ? (item.sub_scores as Job["sub_scores"])
          : undefined,
      status:
        typeof item.status === "string" &&
        [
          "new",
          "applied",
          "interviewing",
          "interested",
          "not_interested",
        ].includes(item.status)
          ? (item.status as JobStatus)
          : "new",
      last_seen_at: String(item.last_seen_at ?? new Date().toISOString()),
    };
  });

  return { total, items };
}
