#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${TEST_DEPS_STACK_NAME:-task3-deps}"

docker stack rm "${STACK_NAME}"