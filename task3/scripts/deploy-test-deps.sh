#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TASK_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

STACK_NAME="${TEST_DEPS_STACK_NAME:-task3-deps}"
COMPOSE_FILE="${TASK_DIR}/compose/test-dependencies.yml"

"${SCRIPT_DIR}/ensure-networks.sh"

docker stack deploy \
  -c "${COMPOSE_FILE}" \
  "${STACK_NAME}"