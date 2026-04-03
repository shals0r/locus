.PHONY: up down restart logs

up:
	@echo "Starting locus-agent..."
	@~/.locus-agent/venv/bin/python -m locus_agent start --daemon 2>/dev/null || { \
		echo "Installing agent for the first time..."; \
		mkdir -p ~/.locus-agent/locus-agent; \
		cp -r agent/* ~/.locus-agent/locus-agent/; \
		python3 -m venv ~/.locus-agent/venv; \
		~/.locus-agent/venv/bin/pip install --quiet ~/.locus-agent/locus-agent; \
		~/.locus-agent/venv/bin/python -m locus_agent start --daemon; \
	}
	@echo "Starting Docker..."
	@docker compose up --build -d

down:
	@docker compose down

restart:
	@docker compose restart app

logs:
	@docker compose logs -f app
