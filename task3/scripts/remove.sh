#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-task3}"

docker stack rm "${STACK_NAME}"