dev:
	cp .env.stag .env.local && npm run dev

dev-prod:
	cp .env.prod .env.local && npm run dev

migrate-stag:
	cp .env.stag .env.local && npx prisma db push

migrate-prod:
	cp .env.prod .env.local && npx prisma db push

.PHONY: dev dev-prod migrate-stag migrate-prod
