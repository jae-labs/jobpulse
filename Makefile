.DEFAULT_GOAL := help

.PHONY: help dev stop db-start db-stop db-reset db-restore db-status dump storage-export storage-import backup scrape scrape-test scrape-core scrape-rescore scrape-validate scrape-lint scrape-format scrape-unit db-types check

help: ## Show available development commands.
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start local Supabase stack, Edge Function, and Vite development server.
	npm run dev:local

stop: ## Stop the local Supabase stack.
	npm run db:stop

db-start: ## Start the local Supabase stack only (without Vite).
	npm run db:start

db-stop: stop

db-reset: ## Reset and seed the local Supabase database.
	npm run db:reset

db-restore: ## Restore a local backup; set BACKUP=.backups/jobpulse-<timestamp>.
	@test -n "$(BACKUP)" || (echo "Set BACKUP to a directory under .backups." >&2; exit 2)
	bash scripts/restore-local-backup.sh "$(BACKUP)"

db-status: ## Show local Supabase URLs and keys.
	npm run db:status

dump: ## Save a full logical backup of the linked production database.
	bash scripts/dump-production.sh

storage-export: ## Download every linked-project Storage bucket.
	bash scripts/export-storage.sh

storage-import: ## Import exported Storage files locally; set BACKUP=.backups/jobpulse-<timestamp>.
	@test -n "$(BACKUP)" || (echo "Set BACKUP to a directory under .backups." >&2; exit 2)
	bash scripts/import-storage.sh "$(BACKUP)"

backup: ## Save the linked production database and every Storage bucket.
	bash scripts/backup-production.sh

scrape: ## Run full scraper pipeline against Supabase.
	@cd services/scraper && uv run python app.py

scrape-test: ## Test scraping a specific employer; set NAME="Employer Name".
	@test -n "$(NAME)" || (echo "Set NAME='Employer Name'." >&2; exit 2)
	@cd services/scraper && uv run python app.py --employer "$(NAME)"

scrape-core: ## Run only core scrapers (universities, councils, PublicJobs).
	@cd services/scraper && uv run python app.py --core-only

scrape-rescore: ## Run candidate fit rescoring on Apple Metal GPU.
	@cd services/scraper && uv run python app.py --rescore-only

scrape-validate: ## Validate websites.yaml configuration.
	@cd services/scraper && uv run python app.py --validate-config

scrape-harvest: ## Scan candidate ATS boards for Ireland vacancies; set ARGS="--apply" to persist.
	@cd services/scraper && uv run python tools/harvest_boards.py $(ARGS)

scrape-sniff: ## Sniff underlying ATS platforms from generic career URLs; set ARGS="--apply" to persist.
	@cd services/scraper && uv run python tools/sniff_ats.py $(ARGS)

scrape-lint: ## Run ruff lint & format check on scraper code.
	@cd services/scraper && uv run --locked ruff check .
	@cd services/scraper && uv run --locked ruff format --check .

scrape-format: ## Auto-format and fix lint issues in scraper code.
	@cd services/scraper && uv run --locked ruff format .
	@cd services/scraper && uv run --locked ruff check --fix .

scrape-unit: ## Run scraper unit tests with pytest.
	@cd services/scraper && uv run pytest

db-types: ## Generate TypeScript and Python types atomically from local Supabase schema.
	npm run db:types


check: ## Run the full quality gate (frontend and scraper).
	npm run check
	@$(MAKE) scrape-lint
	@$(MAKE) scrape-unit
