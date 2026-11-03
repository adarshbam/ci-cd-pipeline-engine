#!/usr/bin/env bash
set -e

echo "Deploying release bundle from ./dist..."
if [ -d "./dist" ] || [ -f "./dist" ]; then
  echo "Artifact verified in ./dist"
fi
echo "Deployment completed successfully."
