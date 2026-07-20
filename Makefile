\
.DEFAULT_GOAL := help
.PHONY: help setup update migrate db-up db-down dev dev-web dev-worker \
        restart stop status logs logs-web logs-worker build clean fresh

RUN_DIR   := .run
ENV_FILE  := web/.env

# --- help ----------------------------------------------------------------------

help: ## Show this help
	@echo "Common commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

# --- one-time setup / picking up changes ----------------------------------------

setup: ## First-time setup: install deps, create .env, start db, migrate
	@[ -f $(ENV_FILE) ] || { cp .env.example $(ENV_FILE); echo "Created $(ENV_FILE) — edit it before running 'make dev'."; }
	@echo "==> Installing web dependencies"
	cd web && npm install
	@echo "==> Creating worker virtualenv"
	cd worker && python3 -m venv .venv && .venv/bin/pip install -q -e .
	@$(MAKE) db-up
	@$(MAKE) migrate
	@echo ""
	@echo "Setup complete. Edit $(ENV_FILE), then run: make dev"

update: ## Pull latest code, reinstall deps, apply new migrations, restart if running
	git pull
	@echo "==> Updating web dependencies"
	cd web && npm install
	@echo "==> Updating worker dependencies"
	cd worker && .venv/bin/pip install -q -e .
	@$(MAKE) db-up
	@$(MAKE) migrate
	@if [ -f $(RUN_DIR)/web.pid ] || [ -f $(RUN_DIR)/worker.pid ]; then \
		echo "==> Restarting running services"; \
		$(MAKE) restart; \
	else \
		echo ""; \
		echo "Updated. Run 'make dev' to start the site."; \
	fi

migrate: ## Apply database migrations
	cd web && npx drizzle-kit migrate

# --- database --------------------------------------------------------------------

db-up: ## Start Postgres (docker compose)
	docker compose up -d postgres

db-down: ## Stop Postgres
	docker compose stop postgres

# --- running it locally ------------------------------------------------------------

dev: db-up dev-web dev-worker ## Start the database, web app and worker (background)
	@echo ""
	@echo "  web:    http://localhost:3000"
	@echo "  logs:   make logs"
	@echo "  stop:   make stop"

dev-web: ## Start just the web dev server in the background
	@mkdir -p $(RUN_DIR)
	@if [ -f $(RUN_DIR)/web.pid ] && kill -0 $$(cat $(RUN_DIR)/web.pid) 2>/dev/null; then \
		echo "web already running (pid $$(cat $(RUN_DIR)/web.pid))"; \
	else \
		cd web && (setsid nohup npm run dev >../$(RUN_DIR)/web.log 2>&1 </dev/null & echo $$! >../$(RUN_DIR)/web.pid); \
		echo "web started — logs: make logs-web"; \
	fi

dev-worker: ## Start just the transcription worker in the background
	@mkdir -p $(RUN_DIR)
	@if [ -f $(RUN_DIR)/worker.pid ] && kill -0 $$(cat $(RUN_DIR)/worker.pid) 2>/dev/null; then \
		echo "worker already running (pid $$(cat $(RUN_DIR)/worker.pid))"; \
	else \
		set -a && . ./$(ENV_FILE) && set +a && \
		cd worker && (setsid nohup .venv/bin/python -m worker.main >../$(RUN_DIR)/worker.log 2>&1 </dev/null & echo $$! >../$(RUN_DIR)/worker.pid); \
		echo "worker started — logs: make logs-worker"; \
	fi

restart: stop dev ## Restart the web app and worker

stop: ## Stop the background web app and worker
	@for name in web worker; do \
		if [ -f $(RUN_DIR)/$$name.pid ]; then \
			pid=$$(cat $(RUN_DIR)/$$name.pid); \
			if kill -0 $$pid 2>/dev/null; then kill -TERM -$$pid 2>/dev/null || kill $$pid 2>/dev/null; echo "stopped $$name"; fi; \
			rm -f $(RUN_DIR)/$$name.pid; \
		fi; \
	done

status: ## Show what's currently running
	@printf "postgres: "; docker compose ps postgres --format '{{.Status}}' 2>/dev/null || echo "not running"
	@for name in web worker; do \
		if [ -f $(RUN_DIR)/$$name.pid ] && kill -0 $$(cat $(RUN_DIR)/$$name.pid) 2>/dev/null; then \
			echo "$$name: running (pid $$(cat $(RUN_DIR)/$$name.pid))"; \
		else \
			echo "$$name: not running"; \
		fi; \
	done

logs: ## Tail both web and worker logs (Ctrl-C to stop watching)
	@touch $(RUN_DIR)/web.log $(RUN_DIR)/worker.log
	tail -f $(RUN_DIR)/web.log $(RUN_DIR)/worker.log

logs-web: ## Tail just the web app log
	@touch $(RUN_DIR)/web.log
	tail -f $(RUN_DIR)/web.log

logs-worker: ## Tail just the worker log
	@touch $(RUN_DIR)/worker.log
	tail -f $(RUN_DIR)/worker.log

# --- misc --------------------------------------------------------------------------

build: ## Production build of the web app (sanity check before deploying)
	cd web && npm run build

clean: stop ## Remove installed deps and caches (keeps your .env and database)
	rm -rf web/node_modules web/.next worker/.venv
	find worker -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true

fresh: clean setup ## Wipe deps and set up again from scratch
