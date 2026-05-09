#!/usr/bin/env bash
set -uo pipefail

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
CHECK_RETRIES="${CHECK_RETRIES:-12}"
CHECK_DELAY="${CHECK_DELAY:-5}"
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

check_postgres() {
  local attempt

  for attempt in $(seq 1 "${CHECK_RETRIES}"); do
    echo "PostgreSQL attempt ${attempt}/${CHECK_RETRIES}: ${POSTGRES_HOST}:${POSTGRES_PORT}"
    pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}"
    local rc=$?

    if [[ "${rc}" -eq 0 ]]; then
      return 0
    fi

    sleep "${CHECK_DELAY}"
  done

  return 1
}

check_redis() {
  local attempt

  for attempt in $(seq 1 "${CHECK_RETRIES}"); do
    echo "Redis attempt ${attempt}/${CHECK_RETRIES}: ${REDIS_HOST}:${REDIS_PORT}"
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping
    local rc=$?

    if [[ "${rc}" -eq 0 ]]; then
      return 0
    fi

    sleep "${CHECK_DELAY}"
  done

  return 1
}

echo "== Package check =="
install_packages

echo
echo "== Runtime info =="
echo "HOSTNAME=${HOSTNAME:-unknown}"
echo "hostname=$(hostname)"

echo
echo "== DNS check =="
getent hosts "${POSTGRES_HOST}" || true
getent hosts "${REDIS_HOST}" || true

echo
echo "== PostgreSQL check =="
check_postgres
POSTGRES_RC=$?

echo
echo "== Redis check =="
check_redis
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