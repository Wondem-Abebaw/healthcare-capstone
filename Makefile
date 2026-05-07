.PHONY: up down logs dev-backend dev-frontend setup

setup:
	@cp -n backend/.env.example backend/.env && echo "✅ Created backend/.env — add your API keys" || echo "ℹ️  backend/.env already exists"

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f backend

shell-backend:
	docker compose exec backend bash

dev-backend:
	cd backend && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

reset-db:
	docker compose down -v && docker compose up --build -d
