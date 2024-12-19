.PHONY: local factoid

local:
	cd ./frontend && npm run start

factoid:
	node scripts/generateFactoid.mjs