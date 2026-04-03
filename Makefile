.PHONY: up down restart logs

up:
	@echo "Starting locus-agent..."
	@~/.locus-agent/venv/bin/python -m locus_agent start --daemon 2>/dev/null || python ~/.locus-agent/install.py
	@echo "Starting Docker..."
	@docker compose up --build -d

down:
	@docker compose down

restart:
	@docker compose restart app

logs:
	@docker compose logs -f app
