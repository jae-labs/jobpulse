# Production release actions — 3 October 2026

Read-only verification was authorized. The user subsequently approved the
solo-maintainer GitHub protection settings below; they are applied and verified.
Hosted Auth, database runtime and source publication/deployment remain unchanged
by this chat.

## Enforce the repository merge gate

Initial live state: `main` was unprotected, with no rulesets. The four CI jobs
passed for `c99eaec480f320c9eb90d806f570cbd9823ad46d`, but are not required to merge.
Only `@luiz1361` is currently listed as a repository collaborator. The user
confirmed this is a solo-maintainer workflow, so approval from another person
is not required. Pull requests and technical checks remain mandatory.

The approved and applied branch-protection request is:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Tenant Isolation Guardrails",
      "Supabase Migration Lint",
      "Code Quality & Build Check",
      "Scraper Quality & Tests"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
```

The zero-approval pull-request rule preserves a reviewable change and all
technical checks without preventing the sole maintainer from merging. The payload
was applied to `PUT /repos/jae-labs/jobpulse/branches/main/protection`, then GET
verified every field and `main.protected=true`. GitHub omits disabled push
restrictions from its response; all required check names match actual workflow
contexts. Add independent approval/code ownership
when another maintainer joins, rather than adding an unenforceable owner file now.

## Maintain hosted Auth restrictions

The hosted public Auth settings currently show Google enabled; email/password,
anonymous and phone providers disabled; signup disabled. Email auto-confirm is
true, but email authentication is disabled. The leaked-password advisor warning
does not justify enabling a currently disabled provider. Keep this restriction
unless a reviewed product change introduces password login; then configure
confirmation, password security, recovery and negative tests before enabling it.
See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

## Upgrade the hosted PostgreSQL security patch

Hosted `SELECT version()` reports PostgreSQL 17.6. Supabase's 25 September 2026
release rolls 17.6 to 17.11 and closes 44 upstream CVEs. Confirm the eligible
runtime in the project dashboard and schedule the provider-supported upgrade;
do not assume a source migration upgrades the server binary.

Preflight inspection found no `ltree` or `btree_gist` extension, no custom
operator with a non-built-in estimator, and no public function using PGP
encryption. Source searches found no legacy `cipher-algo` or PGP encryption
calls. This does not rule out SQL used outside this repository. Review that
possibility and follow the provider's
[upgrade guidance](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).

Before execution, verify a recent complete production database/Storage snapshot
and the provider recovery procedure, agree the maintenance window and expected
connection interruption, and retain the pre-upgrade schema/contract evidence.
After upgrade, verify `server_version`, schema/grants parity, Auth/Storage/RPC
smoke and scoring cron health. The synthetic local restore establishes script
behavior, not production-scale recovery time.

## Publish and verify the final source changes

GitHub's Cloudflare Pages check records a successful deployment of `c99eaec`.
Its commit-specific preview and the production hostname both reference
`index-BCjX6njR.js`; production bytes match the verified local build. The deployed
account-deletion function is version 28, requires JWT verification, and both
files match the reviewed source exactly. Later recovery-script, seed, portable
CLI lookup, Sources retry/error dismissal and documentation changes are prepared
on the local `codex/production-readiness` branch. They need their own published,
reviewed commit and CI evidence. Record each deployment separately from database changes.

Finish controlled Auth/Storage/inference tests with approved synthetic hosted
identities, alert-delivery and retention verification, representative hosted
capacity/recovery tests, and target-device accessibility checks before claiming
full production readiness. See the [readiness report](PRODUCTION_READINESS.md).
