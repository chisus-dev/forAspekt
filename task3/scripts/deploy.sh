#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TASK_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

STACK_NAME="${STACK_NAME:-task3}"
COMPOSE_FILE="${TASK_DIR}/compose/docker-compose.yml"

"${SCRIPT_DIR}/ensure-networks.sh"

docker stack deploy \
  -c "${COMPOSE_FILE}" \
  "${STACK_NAME}"