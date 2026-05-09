#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-task3}"
SERVICE_NAME="${STACK_NAME}_ubuntu-client"

CONTAINER_ID="$(
  docker ps \
    --filter "name=${SERVICE_NAME}" \
    --format '{{.ID}}' \
    | head -n 1
)"

if [[ -z "${CONTAINER_ID}" ]]; then
  echo "No running container found for service: ${SERVICE_NAME}" >&2
  echo "Run this script on a Swarm worker node where the service task is running." >&2
  exit 1
fi

exec docker exec -it "${CONTAINER_ID}" bash