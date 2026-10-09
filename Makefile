.DEFAULT_GOAL := help

.PHONY: help dev storybook stop db-start db-reset db-restore db-status db-benchmark dump storage-export storage-import backup db-types check
.PHONY: scrape scrape-test scrape-core scrape-boards scrape-list-boards scrape-backfill scrape-backfill-employers scrape-descriptions scrape-description-audit scrape-validate scrape-harvest scrape-sniff
.PHONY: scrape-import-boards scrape-discover-boards scrape-harvest-ats scrape-backfill-board-employers scrape-research-employers scrape-enrich-employers scrape-verify-locations scrape-enrich-offices scrape-enrich-ai
.PHONY: scrape-lint scrape-format scrape-unit scrape-typecheck scrape-request-audit

help: ## Show available development commands.
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-32s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start local Supabase stack, Edge Function, and Vite development server.
	npm run dev

storybook: ## Start the UI component catalog on http://localhost:6006.
	npm run storybook

stop: ## Stop the local Supabase stack.
	npm run db:stop

db-start: ## Start the local Supabase stack only (without Vite).
	npm run db:start

db-reset: ## Reset and seed the local Supabase database.
	npm run db:reset

db-restore: ## Restore a local backup; set BACKUP=.backups/jobpulse-<timestamp>.
	@test -n "$(BACKUP)" || (echo "Set BACKUP to a directory under .backups." >&2; exit 2)
	bash scripts/restore-local-backup.sh "$(BACKUP)"

db-status: ## Show local Supabase URLs and keys.
	npm run db:status

db-benchmark: ## Run synthetic capacity probes; set PROJECT=jobpulse-benchmark.
	@test -n "$(PROJECT)" || (echo "Set PROJECT to a disposable jobpulse-benchmark project." >&2; exit 2)
	node scripts/benchmark-database.mjs "$(PROJECT)"

dump: ## Save a full logical backup of the linked production database.
	node scripts/backup-database.mjs

storage-export: ## Download every linked-project Storage bucket.
	bash scripts/export-storage.sh

storage-import: ## Import exported Storage files locally; set BACKUP=.backups/jobpulse-<timestamp>.
	@test -n "$(BACKUP)" || (echo "Set BACKUP to a directory under .backups." >&2; exit 2)
	bash scripts/import-storage.sh "$(BACKUP)"

backup: ## Save the linked production database and every Storage bucket.
	bash scripts/backup-production.sh

scrape: ## Process due durable work and queue eligible sources; successful and failed sources wait six hours.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --auto $(ARGS)

.PHONY: scrape-report
scrape-report: ## Compare durable source metrics; ARGS='--employer "Company"' filters a company.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --crawl-report $(ARGS)

scrape-test: ## Test scraping a specific employer; set NAME="Employer Name".
	@test -n "$(NAME)" || (echo "Set NAME='Employer Name'." >&2; exit 2)
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --employer "$(NAME)" $(ARGS)

scrape-core: ## Crawl specialized employer and aggregator feeds only.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --core-only $(ARGS)

scrape-boards: ## Crawl enabled database boards only; ARGS="--limit 50" bounds targets.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --no-core $(ARGS)

scrape-list-boards: ## List live catalog targets, including disabled boards; no writes.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --list-boards $(ARGS)

scrape-import-boards: ## Preview YAML board import; ARGS="--apply" persists reviewed changes.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/import_boards.py $(ARGS)

scrape-discover-boards: ## Preview board discovery; ARGS="--source jobs --apply" persists candidates.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/discover_boards.py $(ARGS)

scrape-harvest-ats: ## Preview ATS discovery from company websites; ARGS="--limit 50 --apply" persists.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/harvest_ats.py $(ARGS)

scrape-backfill-board-employers: ## Preview board/employer links; ARGS="--apply --create" permits new employers.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/backfill_board_employers.py $(ARGS)

scrape-backfill: ## Generate missing vectors for existing jobs without crawling.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --backfill-embeddings $(ARGS)

scrape-backfill-employers: ## Preview employer links; set ARGS="--apply --limit 100" to persist.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/backfill_employers.py $(ARGS)

scrape-descriptions: ## Preview catalog body repairs; reports in .backups; set ARGS="--apply" to write.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/repair_descriptions.py --report ../../.backups/descriptions.csv $(ARGS)

scrape-description-audit: ## Read-only body coverage; CSV and summary reports in .backups.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/audit_descriptions.py --report ../../.backups/description-audit.csv --summary ../../.backups/description-audit.json $(ARGS)

scrape-validate: ## Validate websites.yaml configuration.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --validate-config $(ARGS)

scrape-request-audit: ## Preview bounded source audit; ARGS="--run --apply" sends requests and saves observations.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/probe_request_limits.py $(ARGS)

scrape-harvest: ## Probe candidate ATS URLs; supply ARGS="--seeds PATH"; add --apply to persist.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/harvest_boards.py $(ARGS)

scrape-sniff: ## Sniff underlying ATS platforms from generic career URLs; set ARGS="--apply" to persist.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/sniff_ats.py $(ARGS)

scrape-research-employers: ## Research public company evidence; proposals only, report in .backups.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/research_employers.py --report ../../.backups/employer-research.json $(ARGS)

scrape-enrich-employers: ## Preview up to 100 employers; ARGS="--apply --limit 50" persists, report in .backups.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/enrich_employers.py --limit 100 --report ../../.backups/employer-enrichment.csv $(ARGS)

scrape-verify-locations: ## Preview vacancy geocoding; ARGS="--apply --limit 100" persists, report in .backups.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/verify_job_locations.py --report ../../.backups/job-locations.json $(ARGS)

scrape-enrich-offices: ## Preview company office research; set ARGS="--apply --report /tmp/offices.json" to save.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/enrich_offices.py --report ../../.backups/employer-offices-report.json $(ARGS)

scrape-enrich-ai: scrape-company-research ## Alias for the complete company research workflow.

scrape-package: ## Build and verify the installed scraper wheel.
	@mkdir -p .backups/scraper-dist
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv build --wheel --out-dir ../../.backups/scraper-dist > ../../.backups/scraper-dist/build.log 2>&1
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/verify_wheel.py ../../.backups/scraper-dist

scrape-enqueue: ## Queue configured crawl targets durably.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --enqueue $(ARGS)

scrape-worker: ## Process a bounded set of durable source/detail/vector tasks.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --worker $(ARGS)

scrape-history: ## Inspect bounded public-source transport observations.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python app.py --request-history $(ARGS)

scrape-pilot: ## Compare Scrapy and composed execution on synthetic sources.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked --group pilot python tools/pilot_scrapy.py

scrape-lint: ## Run ruff lint & format check on scraper code.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked ruff check .
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked ruff format --check .

scrape-format: ## Auto-format and fix lint issues in scraper code.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked ruff format .
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked ruff check --fix .

scrape-unit: ## Run scraper unit tests with pytest.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked pytest

scrape-typecheck: ## Check scraper types with Pyright.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked pyright

db-types: ## Generate TypeScript and Python types from local Supabase schema.
	npm run db:types


check: ## Run the full quality gate (frontend and scraper).
	npm run check
	@$(MAKE) scrape-lint
	@$(MAKE) scrape-typecheck
	@$(MAKE) scrape-unit

.PHONY: scrape-company-index scrape-company-pilot
scrape-company-index: ## Download and index CRO and Irish Overture snapshots locally under ignored .backups.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked --group company-index python tools/company_index.py refresh $(ARGS)

scrape-company-pilot: ## Review-only coverage report for 200 catalog employers; no database writes.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked --group company-index python tools/company_index.py pilot $(ARGS)

.PHONY: scrape-company-review
scrape-company-review: ## Compare exact company candidates through agy using cited public evidence; no writes.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/review_company_matches.py $(ARGS)

.PHONY: scrape-verify-availability
scrape-verify-availability: ## Verify up to ten public postings; ARGS='--apply' saves availability evidence.
	@cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/verify_availability.py $(ARGS)

.PHONY: scrape-company-research
scrape-company-research: ## Research CRO/Overture identities and AI office/staff proposals with live progress; no writes.
	cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked --group company-index python tools/research_companies.py $(ARGS)

.PHONY: scrape-company-benchmark
scrape-company-benchmark: ## Compare free OpenCode Go and Gemini on 32 synthetic identity cases; no catalog writes.
	cd services/scraper && node ../../scripts/run-scraper.mjs $@ uv run --locked python tools/benchmark_company_models.py $(ARGS)
