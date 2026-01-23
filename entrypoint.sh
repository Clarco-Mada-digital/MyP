#!/bin/sh

# Exit on error
set -e

echo "Running migrations..."
node ace.js migration:run --force || echo "Migrations failed or already run"

echo "Starting server..."
exec node bin/server.js
