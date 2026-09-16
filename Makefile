.DEFAULT_GOAL := help

.PHONY: help dev stop db-start db-stop db-reset db-restore db-status dump storage-export storage-import backup check

help: ## Show available development commands.
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start local Supabase and the Vite development server.
	npm run dev:local

stop: ## Stop the local development stack.
	npm run db:stop

db-start: ## Start the local Supabase stack.
	npm run db:start

db-stop: ## Stop the local Supabase stack.
	npm run db:stop

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

check: ## Run the full quality gate.
	npm run check
