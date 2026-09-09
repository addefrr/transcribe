.DEFAULT_GOAL := help
.PHONY: help setup update migrate db-up db-down dev dev-check dev-web dev-worker \
        restart stop status logs logs-web logs-worker build clean fresh \
        providers connect env-check production-check cf-login cf-r2-create

# Startup is intentionally ordered: configuration/dependencies, healthy DB,
# migrations, then processes. This also keeps `make -j dev` from racing them.
.NOTPARALLEL: dev setup restart

RUN_DIR   := .run
ENV_FILE  := web/.env
WEB_PORT  ?= 3000

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

# --- production providers ---------------------------------------------------------

providers: ## Print dashboards and official setup links for every required service
	@echo "Production service setup"
	@echo ""
	@echo "Cloudflare (DNS, CDN, and R2 object storage are usable now)"
	@echo "  dashboard: https://dash.cloudflare.com/"
	@echo "  R2 docs:  https://developers.cloudflare.com/r2/"
	@echo "  Future Workers/OpenNext migration guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/"
	@echo "  WARNING: web/ is not Workers-ready: no OpenNext config/adapter,"
	@echo "           @node-rs/argon2 is not supported by workerd, and the"
	@echo "           Workers Free 10 ms CPU allowance is unsuitable/unverified."
	@echo ""
	@echo "PostgreSQL (required; Cloudflare D1 is not compatible with this app)"
	@echo "  Neon:     https://console.neon.tech/"
	@echo "  Supabase: https://supabase.com/dashboard/"
	@echo ""
	@echo "Transcription"
	@echo "  Groq API keys:   https://console.groq.com/keys"
	@echo "  Soniox console:  https://console.soniox.com/"
	@echo ""
	@echo "Payments and email"
	@echo "  Stripe dashboard: https://dashboard.stripe.com/"
	@echo "  Stripe webhooks:  https://docs.stripe.com/webhooks"
	@echo "  Resend API keys:  https://resend.com/api-keys"
	@echo "  Resend domains:   https://resend.com/domains"
	@echo ""
	@echo "Current verified architecture: a Node.js host for web/; Cloudflare for"
	@echo "DNS/CDN/R2; managed Postgres; and a separate container/VPS for worker/."
	@echo "Run 'make connect' for the configuration order."

connect: providers ## Print the recommended connection order and required webhook events
	@echo ""
	@echo "Connection order"
	@echo "  NOTE: these steps connect Cloudflare DNS/R2; they do not make the"
	@echo "        current Node.js build deployable to Cloudflare Workers."
	@echo "  1. Create a Postgres database and set DATABASE_URL in web/.env."
	@echo "  2. In Cloudflare, create an R2 bucket, create S3 API credentials, and set:"
	@echo "     STORAGE_DRIVER=s3, S3_ENDPOINT, S3_REGION=auto, S3_BUCKET,"
	@echo "     S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE=0."
	@echo "  3. Add R2 CORS for your public app URL (PUT, GET, HEAD); allow"
	@echo "     Content-Type and Range, and expose Accept-Ranges, Content-Length,"
	@echo "     and Content-Range so retained-audio seeking works after redirects."
	@echo "  4. Set APP_URL to your HTTPS production domain."
	@echo "  5. Add GROQ_API_KEY and SONIOX_API_KEY to the worker host."
	@echo "  6. Add RESEND_API_KEY and a verified EMAIL_FROM to the web host."
	@echo "  7. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to the web host."
	@echo "     Stripe webhook: https://YOUR_DOMAIN/api/stripe/webhook"
	@echo "     Events: checkout.session.completed, checkout.session.async_payment_succeeded,"
	@echo "             invoice.paid, customer.subscription.updated,"
	@echo "             customer.subscription.deleted"
	@echo "  8. Run 'make migrate', then 'make production-check'."

env-check: ## Check that web/.env has the production connection values (never prints secrets)
	@missing=0; \
	for key in DATABASE_URL APP_URL STORAGE_DRIVER S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY GROQ_API_KEY SONIOX_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET RESEND_API_KEY EMAIL_FROM LEGAL_ENTITY_NAME SUPPORT_EMAIL PRIVACY_EMAIL; do \
		value=$$(awk -F= -v key="$$key" '$$1 == key { sub(/^[^=]*=/, ""); sub(/[[:space:]]+#.*/, ""); gsub(/^"|"$$/, ""); print; exit }' $(ENV_FILE) 2>/dev/null); \
		if [ -z "$$value" ]; then echo "missing: $$key"; missing=1; else echo "ok:      $$key"; fi; \
	done; \
	app_url=$$(awk -F= '$$1 == "APP_URL" { sub(/^[^=]*=/, ""); sub(/[[:space:]]+#.*/, ""); print; exit }' $(ENV_FILE) 2>/dev/null); \
	case "$$app_url" in https://*) ;; *) echo "invalid: APP_URL must use https in production"; missing=1;; esac; \
	driver=$$(awk -F= '$$1 == "STORAGE_DRIVER" { sub(/^[^=]*=/, ""); sub(/[[:space:]]+#.*/, ""); print; exit }' $(ENV_FILE) 2>/dev/null); \
	if [ "$$driver" != "s3" ]; then echo "invalid: STORAGE_DRIVER must be s3 for separate cloud web/worker hosts"; missing=1; fi; \
	for pair in DEV_FAKE_CHECKOUT:0 SSRF_ALLOW_PRIVATE:0; do \
		key=${pair%%:*}; expected=${pair#*:}; \
		value=$$(awk -F= -v key="$$key" '$$1 == key { sub(/^[^=]*=/, ""); sub(/[[:space:]]+#.*/, ""); print; exit }' $(ENV_FILE) 2>/dev/null); \
		if [ "$$value" != "$$expected" ]; then echo "invalid: $$key must be $$expected in production"; missing=1; fi; \
	done; \
	if [ "$$missing" -ne 0 ]; then echo "Add the missing values to $(ENV_FILE)."; exit 1; fi

production-check: env-check build ## Validate configuration presence and make a production web build
	@echo "Node.js production preflight passed. This does not validate Cloudflare Workers/OpenNext."
	@echo "Run 'make migrate' separately against the production database."

cf-login: ## Log in to Cloudflare with Wrangler (opens browser authentication)
	npx wrangler login

cf-r2-create: ## Create an R2 bucket: make cf-r2-create R2_BUCKET=transcribe
	@test -n "$(R2_BUCKET)" || { echo "Usage: make cf-r2-create R2_BUCKET=transcribe"; exit 2; }
	npx wrangler r2 bucket create "$(R2_BUCKET)"

# --- database --------------------------------------------------------------------

db-up: ## Start Postgres (docker compose)
	docker compose up -d postgres
	@echo "==> Waiting for Postgres"
	@attempt=0; \
	until docker compose exec -T postgres pg_isready -U postgres -d transcribe >/dev/null 2>&1; do \
		attempt=$$((attempt + 1)); \
		if [ "$$attempt" -ge 30 ]; then \
			echo "Postgres did not become ready within 30 seconds."; \
			docker compose logs --tail=30 postgres; \
			exit 1; \
		fi; \
		sleep 1; \
	done
	@echo "Postgres is ready"

db-down: ## Stop Postgres
	docker compose stop postgres

# --- running it locally ------------------------------------------------------------

dev: dev-check db-up migrate dev-web dev-worker ## Start database, migrate, then run web and worker
	@echo ""
	@echo "  web:    http://localhost:$(WEB_PORT)"
	@echo "  logs:   make logs"
	@echo "  stop:   make stop"

dev-check: ## Check local dependencies before starting development services
	@test -f $(ENV_FILE) || { echo "Missing $(ENV_FILE). Run 'make setup' first."; exit 2; }
	@test -d web/node_modules || { echo "Missing web dependencies. Run 'make setup' first."; exit 2; }
	@test -x worker/.venv/bin/python || { echo "Missing worker virtualenv. Run 'make setup' first."; exit 2; }

dev-web: ## Start just the web dev server in the background
	@mkdir -p $(RUN_DIR)
	@if [ -f $(RUN_DIR)/web.pid ] && kill -0 $$(cat $(RUN_DIR)/web.pid) 2>/dev/null; then \
		echo "web already running (pid $$(cat $(RUN_DIR)/web.pid))"; \
	else \
		cd web && (setsid nohup npm run dev -- --port $(WEB_PORT) >../$(RUN_DIR)/web.log 2>&1 </dev/null & echo $$! >../$(RUN_DIR)/web.pid); \
	fi
	@pid=$$(cat $(RUN_DIR)/web.pid); \
	for attempt in 1 2 3 4 5; do \
		if grep -q "Ready in" $(RUN_DIR)/web.log 2>/dev/null; then \
			echo "web ready on http://localhost:$(WEB_PORT) — logs: make logs-web"; \
			exit 0; \
		fi; \
		if ! kill -0 $$pid 2>/dev/null; then \
			echo "Web server failed to start:"; \
			tail -30 $(RUN_DIR)/web.log; \
			rm -f $(RUN_DIR)/web.pid; \
			exit 1; \
		fi; \
		sleep 1; \
	done; \
	echo "web is still starting — inspect it with 'make logs-web'"

dev-worker: ## Start just the transcription worker in the background
	@mkdir -p $(RUN_DIR)
	@if [ -f $(RUN_DIR)/worker.pid ] && kill -0 $$(cat $(RUN_DIR)/worker.pid) 2>/dev/null; then \
		echo "worker already running (pid $$(cat $(RUN_DIR)/worker.pid))"; \
	else \
		set -a && . ./$(ENV_FILE) && set +a && \
		cd worker && (setsid nohup .venv/bin/python -m worker.main >../$(RUN_DIR)/worker.log 2>&1 </dev/null & echo $$! >../$(RUN_DIR)/worker.pid); \
	fi
	@pid=$$(cat $(RUN_DIR)/worker.pid); \
	for attempt in 1 2 3 4 5; do \
		if grep -q "worker starting" $(RUN_DIR)/worker.log 2>/dev/null; then \
			echo "worker ready — logs: make logs-worker"; \
			exit 0; \
		fi; \
		if ! kill -0 $$pid 2>/dev/null; then \
			echo "Worker failed to start:"; \
			tail -30 $(RUN_DIR)/worker.log; \
			rm -f $(RUN_DIR)/worker.pid; \
			exit 1; \
		fi; \
		sleep 1; \
	done; \
	echo "worker is still starting — inspect it with 'make logs-worker'"

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
