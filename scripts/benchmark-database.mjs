// Synthetic capacity probe. Only a named disposable Supabase project is accepted.
// It never connects to hosted Postgres or the development project.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const project = process.argv[2];
if (!/^jobpulse-(?:benchmark|cte-verification)$/.test(project ?? ""))
  throw new Error(
    "Use a disposable jobpulse-benchmark or jobpulse-cte-verification project",
  );
const endpoint = spawnSync(
  "docker",
  ["context", "inspect", "--format", "{{ .Endpoints.docker.Host }}"],
  { encoding: "utf8" },
);
if (
  endpoint.status !== 0 ||
  !/^(unix|npipe):\/\//.test(endpoint.stdout.trim()) ||
  (process.env.DOCKER_HOST &&
    !/^(unix|npipe):\/\//.test(process.env.DOCKER_HOST))
)
  throw new Error("Local Docker only");
const container = `supabase_db_${project}`;
const prefix = `capacity-${randomUUID()}`;
function run(args, input) {
  const r = spawnSync("docker", ["exec", "-i", container, ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw new Error(r.stderr || r.error?.message || "Benchmark command failed");
  return r.stdout.trim();
}
function sql(input) {
  return run(
    [
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    input,
  );
}
const uid = (i) => `md5('${prefix}-user-'||${i})::uuid`;
const vector = `('[1,'||repeat('0,',382)||'0]')::extensions.vector`;
const results = [];
const cronState = JSON.parse(sql("SELECT coalesce(json_agg(json_build_object('id',jobid,'active',active)),'[]') FROM cron.job WHERE jobname='jobpulse-candidate-scoring';"));
try {
  sql(`SELECT cron.alter_job(jobid,active:=false) FROM cron.job WHERE jobname='jobpulse-candidate-scoring';
 INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 SELECT ${uid("i")},'authenticated','authenticated','${prefix}-'||i||'@capacity.example.invalid',now(),'{}','{}' FROM generate_series(1,1000)i;
 INSERT INTO public.authorized_users(email,user_id,status,role) SELECT '${prefix}-'||i||'@capacity.example.invalid',${uid("i")},'accepted','member' FROM generate_series(1,1000)i;
 INSERT INTO public.user_profiles(user_id,name,headline,keywords) SELECT ${uid("i")},'Synthetic capacity profile','Analyst',ARRAY['analysis','excel'] FROM generate_series(1,1000)i ON CONFLICT(user_id) DO UPDATE SET headline=EXCLUDED.headline,keywords=EXCLUDED.keywords;
 INSERT INTO public.profile_scoring_embeddings(user_id,embedding,content_hash,model_version) SELECT ${uid("i")},${vector},repeat('a',64),'all-MiniLM-L6-v2:384:v1' FROM generate_series(1,1000)i;`);
  for (const jobs of [9000, 30000]) {
    sql(`INSERT INTO public.jobs(id,dedupe_key,title,company,location,description,url,source,last_seen_at,salary_min_amount,salary_currency,salary_period)
  SELECT -10000000-i,'${prefix}-job-'||i,CASE WHEN i%3=0 THEN 'Data Analyst' ELSE 'Operations Specialist' END,'Synthetic Employer '||(i%50),CASE WHEN i%3=0 THEN 'Dublin' ELSE 'Cork' END,'Synthetic analysis excel vacancy','https://example.invalid/'||i,'capacity-test',now(),50000,'EUR','annual' FROM generate_series(${jobs === 9000 ? 1 : 9001},${jobs})i;
  INSERT INTO public.job_scoring_embeddings(job_id,embedding,content_hash,model_version)
  SELECT -10000000-i,('[1,'||((i%100)::real/100)||','||repeat('0,',381)||'0]')::extensions.vector,'${prefix}-'||i,'all-MiniLM-L6-v2:384:v1' FROM generate_series(${jobs === 9000 ? 1 : 9001},${jobs})i;
  ${
    jobs === 9000
      ? `INSERT INTO public.user_job_evaluations(user_id,job_id,relevance,fit_tier,matched_skills,ai_analysis)
  SELECT ${uid("u")},-10000000-j,75,'high','["analysis"]','{"role_sector":"Data","sub_scores":{"semantic":0.75,"sector":0.75,"competency":0.75,"seniority":0.75,"salary":0.75,"contract":0.75}}' FROM generate_series(1,1000)u CROSS JOIN generate_series(1,1500)j;`
      : ""
  }
  ANALYZE public.jobs; ANALYZE public.user_job_evaluations; ANALYZE public.job_scoring_embeddings; ANALYZE public.candidate_scoring_work;`);
    for (const [name, query] of [
      ["jobs", "public.get_jobs_page()"],
      ["search", "public.get_jobs_page(p_search=>'Analyst')"],
      ["filter", "public.get_jobs_page(p_location=>'Dublin',p_salary=>'50k')"],
      ["overview", "public.get_overview_metrics()"],
    ]) {
      const contract = sql(
        `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims',json_build_object('sub',${uid("1")},'role','authenticated')::text,true); SELECT (${query})->>'total'; ROLLBACK;`,
      )
        .split("\n")
        .find((line) => /^\d+$/.test(line));
      if (!contract || Number(contract) < 100)
        throw new Error(
          `Synthetic ${name} query did not match representative rows`,
        );
      const file = `/tmp/${prefix}.sql`,
        log = `/tmp/${prefix}-${jobs}-${name}`;
      run(
        ["sh", "-c", `cat > ${file}`],
        `\\set tenant random(1,1000)\nBEGIN;\nSET LOCAL ROLE authenticated;\nSELECT set_config('request.jwt.claims',json_build_object('sub',${uid(":tenant")},'role','authenticated')::text,true);\nSELECT ${query};\nEND;\n`,
      );
      const output = run([
        "pgbench",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-n",
        "-M",
        "prepared",
        "-c",
        jobs === 9000 ? "10" : "50",
        "-j",
        "4",
        "-T",
        "5",
        "-f",
        file,
        "-l",
        `--log-prefix=${log}`,
      ]);
      const samples = run(["sh", "-c", `cat ${log}.*`])
        .split("\n")
        .map((line) => Number(line.split(/\s+/)[2]) / 1000)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const percentile = (p) =>
        samples[Math.min(samples.length - 1, Math.floor(samples.length * p))];
      results.push({
        jobs,
        profiles: 1000,
        evaluations: 1500000,
        clients: jobs === 9000 ? 10 : 50,
        scenario: name,
        transactions: samples.length,
        p50_ms: percentile(0.5),
        p95_ms: percentile(0.95),
        pgbench: output
          .split("\n")
          .filter((line) => /failed|tps|latency average/.test(line)),
      });
      run(["sh", "-c", `rm -f ${file} ${log}.*`]);
    }
    results.push({
      jobs,
      worker: JSON.parse(
        sql(
          `WITH started AS MATERIALIZED (SELECT clock_timestamp() t), batch AS MATERIALIZED (SELECT public.process_candidate_scoring(100) processed FROM started) SELECT json_build_object('batch_ms',round((extract(epoch FROM clock_timestamp()-started.t)*1000)::numeric,2),'processed',batch.processed) FROM started CROSS JOIN batch;`,
        ),
      ),
    });
    results.push({
      jobs,
      scheduler: JSON.parse(
        sql(
          `WITH started AS MATERIALIZED (SELECT clock_timestamp() t), batch AS MATERIALIZED (SELECT public.process_candidate_scoring_queue(50) processed FROM started) SELECT json_build_object('batch_ms',round((extract(epoch FROM clock_timestamp()-started.t)*1000)::numeric,2),'processed',batch.processed) FROM started CROSS JOIN batch;`,
        ),
      ),
    });
  }
} finally {
  sql(
    `DELETE FROM auth.users WHERE email LIKE '${prefix}-%@capacity.example.invalid'; DELETE FROM public.jobs WHERE dedupe_key LIKE '${prefix}-job-%'; ${cronState.map(job => `SELECT cron.alter_job(${job.id},active:=${job.active});`).join(' ')}`,
  );
}
console.log(
  JSON.stringify(
    {
      environment:
        "local Docker, synthetic data; excludes HTTP/browser/network latency",
      results,
    },
    null,
    2,
  ),
);
