#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-task3}"
SERVICE_NAME="${STACK_NAME}_ubuntu-client"

echo "== Stack services =="
docker stack services "${STACK_NAME}"

echo
echo "== Service tasks =="
docker service ps "${SERVICE_NAME}"

echo
echo "== Placement constraints =="
docker service inspect "${SERVICE_NAME}" \
  --format '{{ json .Spec.TaskTemplate.Placement.Constraints }}'

echo
echo "== Resource limits =="
docker service inspect "${SERVICE_NAME}" \
  --format '{{ json .Spec.TaskTemplate.Resources.Limits }}'

echo
echo "== Update config =="
docker service inspect "${SERVICE_NAME}" \
  --format '{{ json .Spec.UpdateConfig }}'

echo
echo "== Networks =="
docker network ls | grep -E 'db-postgres-net|ds-redis-net' || true