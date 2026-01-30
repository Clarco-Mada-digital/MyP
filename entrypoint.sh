#!/bin/sh

# Exit on error
set -e

# If using MySQL, wait for it to be ready
if [ "$DB_CONNECTION" = "mysql" ]; then
  echo "Waiting for MySQL at $DB_HOST:$DB_PORT..."
  while ! nc -z $DB_HOST ${DB_PORT:-3306}; do
    sleep 1
  done
  echo "MySQL is up!"
fi

# Force HOST to 0.0.0.0 in production for external access
# if [ "$NODE_ENV" = "production" ] && [ "$HOST" = "localhost" ]; then
#   echo "⚠️ Warning: HOST is set to 'localhost' in production. Forcing 0.0.0.0 for external access."
#   export HOST="0.0.0.0"
# fi

echo "Configuration: HOST=$HOST, PORT=$PORT, NODE_ENV=$NODE_ENV"

echo "Running migrations..."
node ace.js migration:run --force || echo "Migrations failed or already run"

echo "Starting server..."
# Using exec means the node process becomes PID 1 and receives signals correctly
exec node bin/server.js
