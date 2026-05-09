#!/usr/bin/env bash
set -uo pipefail

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
LOG_FILE="${LOG_FILE:-/var/log/task3/check.log}"

install_packages() {
  if command -v pg_isready >/dev/null 2>&1 && command -v redis-cli >/dev/null 2>&1; then
    echo "Required packages already installed"
    return 0
  fi

  echo "== Installing required packages =="
  apt update
  DEBIAN_FRONTEND=noninteractive apt install -y \
    postgresql-client \
    redis-tools \
    iputils-ping \
    netcat-openbsd
}

echo "== Package check =="
install_packages

echo
echo "== Runtime info =="
echo "HOSTNAME=${HOSTNAME:-unknown}"
echo "hostname=$(hostname)"

echo
echo "== PostgreSQL check =="
pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}"
POSTGRES_RC=$?

echo
echo "== Redis check =="
redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping
REDIS_RC=$?

echo
echo "== Writing host-visible log =="
{
  echo "$(date -Is) task3 connectivity check from HOSTNAME=${HOSTNAME:-unknown}"
  echo "PostgreSQL: ${POSTGRES_HOST}:${POSTGRES_PORT}, rc=${POSTGRES_RC}"
  echo "Redis: ${REDIS_HOST}:${REDIS_PORT}, rc=${REDIS_RC}"
  echo "---"
} >> "${LOG_FILE}"

echo "Log written to ${LOG_FILE}"

if [[ "${POSTGRES_RC}" -ne 0 || "${REDIS_RC}" -ne 0 ]]; then
  echo
  echo "One or more connectivity checks failed"
  exit 1
fi

echo
echo "All connectivity checks passed"