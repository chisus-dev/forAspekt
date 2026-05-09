#!/usr/bin/env bash
set -euo pipefail

NETWORKS=(
  "db-postgres-net"
  "ds-redis-net"
)

for network in "${NETWORKS[@]}"; do
  if docker network inspect "${network}" >/dev/null 2>&1; then
    echo "Network exists: ${network}"
  else
    echo "Creating overlay network: ${network}"
    docker network create \
      --driver overlay \
      --attachable \
      "${network}"
  fi
done