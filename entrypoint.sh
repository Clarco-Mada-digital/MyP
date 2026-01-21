#!/bin/sh

# Exit on error
set -e

echo "Running migrations..."
node ace.js migration:run --force

echo "Starting server..."
exec node bin/server.js
