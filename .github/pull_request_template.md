## Change

Describe the user-visible problem and resulting behavior.

## Validation

- [ ] `make check` passes (frontend and scraper).
- [ ] UI package changes pass `npm run build-storybook`.
- [ ] `npm run db:test:tenancy` passes against the current local migrations.
- [ ] New public relations/browser RPCs are classified in the tenant contract.
- [ ] Changes to private data paths have owner-success and foreign-denial tests with two authorized members
  (including RPC/Storage paths where applicable).
- [ ] Shared catalog data contains no candidate scores, statuses, explanations, or personal information.
- [ ] Query keys include the authenticated identity; cache/session behavior remains isolated.
- [ ] Affected contracts from `docs/REGRESSION_PREVENTION.md` and their behavioral tests are identified below.
- [ ] Diagnostics use the sanitized logger; new personal fields have a purpose and export/deletion coverage.
- [ ] Cleanup includes callers/docs/tests; applied migrations, safety regressions and compatibility contracts are preserved.
- [ ] Relevant guides describe the current behavior and follow the maintainer preferences.

Describe affected behavior contracts, additional validation, deployment/schema verification,
or which conditional items do not apply.
Security failures must be resolved before release; do not waive them as unrelated.
