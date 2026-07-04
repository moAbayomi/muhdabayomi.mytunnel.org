#! /usr/bin/bash
cd /var/www/app/

PULL_OUTPUT=$(git pull origin main --ff-only)

if [[ "$PULL_OUTPUT" == *"Already up to date."* ]]; then
	exit 0
fi

echo "New changes detected, Deploying..."
npm ci
npm run build
pm2 reload app || pm2 restart app
