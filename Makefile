.PHONY: install install-frontend local factoid

install:
	npm install

install-frontend:
	cd ./frontend && npm install

local:
	cd ./frontend && npm run start

factoid:
	node scripts/generateFactoid.mjs