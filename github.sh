#! /usr/bin/bash
cd /var/www/app/

PULL_OUTPUT=$(git pull origin main --ff-only 2>&1)

echo "$PULL_OUTPUT"

if [[ "$PULL_OUTPUT" == *"Already up to date."* ]]; then
    echo "nothing to do. exiting."
	exit 0
fi

if [[ "$PULL_OUTPUT" == *"fatal:"* ]]; then
    echo "deployment failed. git couldnt fast forward."
    exit 1
fi


echo "New changes detected, Deploying..."
npm ci
npm run build
pm2 reload app || pm2 restart app
