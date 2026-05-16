# Task 3. Docker Swarm Compose

## Назначение

Решение задачи `swarm compose задача.docx`.

Нужно подготовить `docker compose` файл для запуска stack в Docker Swarm. Основной сервис использует образ:

```text
ubuntu:22.04
```

Сервис должен быть подключён к overlay-сетям PostgreSQL и Redis:

```text
db-postgres-net
ds-redis-net
```

Дополнительно нужно зайти внутрь контейнера, установить клиентские пакеты и продемонстрировать подключение к PostgreSQL и Redis.

## Подход

Отдельный стенд для `task3` не создаётся. Используется Docker Swarm кластер, подготовленный в `task1`:

```text
t1-01 — Swarm manager
t1-02 — Swarm worker
t1-03 — Swarm worker
```

Настройка выполняется через Ansible и shell-скрипты. Ручные команды используются только для проверки состояния и интерактивной демонстрации.

Worker-ноды должны иметь label:

```text
SERVERTYPE=worker
```

Этот label используется в `placement.constraints` основного сервиса.

## Структура

```text
task3
├── ansible
│   └── playbooks
│       └── deploy.yml
├── compose
│   ├── docker-compose.yml
│   └── test-dependencies.yml
└── scripts
    ├── check-connectivity.sh
    ├── deploy-test-deps.sh
    ├── deploy.sh
    ├── ensure-networks.sh
    ├── exec-client.sh
    ├── remove-test-deps.sh
    ├── remove.sh
    └── status.sh
```

## Основной compose-файл

Файл:

```text
compose/docker-compose.yml
```

Описывает сервис `ubuntu-client`.

Реализовано:

- образ `ubuntu:22.04`;
- постоянная работа контейнера через `sleep infinity`;
- 2 реплики;
- rolling update;
- ограничение CPU до 1 ядра;
- ограничение RAM до 500 MB;
- ограничение Docker logs до 1 файла по 5 MB;
- запуск только на worker-нодах с label `SERVERTYPE=worker`;
- подключение к сетям `db-postgres-net` и `ds-redis-net`;
- host volume для логов;
- переменная окружения `HOSTNAME` с именем Swarm-ноды.

Фрагмент с ключевыми требованиями:

```yaml
services:
  ubuntu-client:
    image: ubuntu:22.04
    command: sleep infinity

    hostname: "{{.Node.Hostname}}"

    environment:
      HOSTNAME: "{{.Node.Hostname}}"

    networks:
      - db-postgres-net
      - ds-redis-net

    volumes:
      - /var/log/foraspekt/task3/ubuntu-client:/var/log/task3

    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "1"

    deploy:
      replicas: 2

      placement:
        constraints:
          - node.labels.SERVERTYPE == worker

      resources:
        limits:
          cpus: "1.0"
          memory: 500M

      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
        failure_action: rollback
```

## Деплой

Деплой выполняется через Ansible из каталога `task1/ansible`:

```bash
cd ~/forAspekt/task1/ansible
ansible-playbook ../../task3/ansible/playbooks/deploy.yml
```

Playbook выполняет подготовку на разных группах хостов.

На worker-нодах `swarm_workers` он:

- создаёт host-директорию для логов `/var/log/foraspekt/task3/ubuntu-client`;
- копирует `check-connectivity.sh` в эту директорию;
- создаёт `/opt/foraspekt/task3/scripts`;
- копирует `exec-client.sh`.

На manager-ноде `swarm_managers` он:

- создаёт `/opt/foraspekt/task3`;
- копирует compose-файлы;
- копирует manager-скрипты;
- запускает основной stack `task3`.

## Что копируется на manager и workers

На manager `t1-01` доступны:

```text
/opt/foraspekt/task3/compose/docker-compose.yml
/opt/foraspekt/task3/compose/test-dependencies.yml
/opt/foraspekt/task3/scripts/ensure-networks.sh
/opt/foraspekt/task3/scripts/deploy.sh
/opt/foraspekt/task3/scripts/remove.sh
/opt/foraspekt/task3/scripts/status.sh
/opt/foraspekt/task3/scripts/deploy-test-deps.sh
/opt/foraspekt/task3/scripts/remove-test-deps.sh
```

На workers `t1-02` и `t1-03` доступны:

```text
/opt/foraspekt/task3/scripts/exec-client.sh
/var/log/foraspekt/task3/ubuntu-client/check-connectivity.sh
```

Внутри контейнера `check-connectivity.sh` доступен через volume как:

```text
/var/log/task3/check-connectivity.sh
```

## Сети

Основной сервис использует внешние Docker Swarm overlay-сети:

```text
db-postgres-net
ds-redis-net
```

Их наличие проверяется и при необходимости создаётся скриптом:

```text
scripts/ensure-networks.sh
```

Этот скрипт вызывается из `deploy.sh` и `deploy-test-deps.sh`. Ручное создание сетей для штатного запуска не требуется.

## Проверка основного stack

На manager-ноде `t1-01`:

```bash
sudo /opt/foraspekt/task3/scripts/status.sh
```

Скрипт показывает:

- состояние stack;
- task-и сервиса;
- placement constraints;
- лимиты ресурсов;
- rolling update config;
- наличие сетей.

Также можно проверить вручную:

```bash
sudo docker stack services task3
sudo docker service ps task3_ubuntu-client
```

Ожидаемый результат для основного stack:

```text
task3_ubuntu-client   replicated   2/2   ubuntu:22.04
```

В выводе `docker service ps` могут оставаться старые строки `Shutdown` или `Rejected`. Это история предыдущих task-ов. Текущее состояние определяется верхними актуальными task-ами и значением `2/2` в `docker stack services task3`.

## Проверка placement constraints

На manager-ноде:

```bash
sudo docker service inspect task3_ubuntu-client \
  --format '{{ json .Spec.TaskTemplate.Placement.Constraints }}'
```

Ожидаемый результат:

```json
["node.labels.SERVERTYPE == worker"]
```

Это означает, что сервис запускается только на нодах с label `SERVERTYPE=worker`.

## Проверка лимитов ресурсов

На manager-ноде:

```bash
sudo docker service inspect task3_ubuntu-client \
  --format '{{ json .Spec.TaskTemplate.Resources.Limits }}'
```

Ожидаемый результат:

```json
{"NanoCPUs":1000000000,"MemoryBytes":524288000}
```

Где:

```text
NanoCPUs: 1000000000 = 1 CPU
MemoryBytes: 524288000 = 500 MB
```

## Проверка rolling update

На manager-ноде:

```bash
sudo docker service update --force task3_ubuntu-client
```

Ожидаемое поведение:

```text
overall progress: 2 out of 2 tasks
1/2: running
2/2: running
verify: Service task3_ubuntu-client converged
```

Это подтверждает, что реплики обновляются последовательно, по одной. За это отвечает настройка:

```yaml
update_config:
  parallelism: 1
  delay: 10s
  order: start-first
  failure_action: rollback
```

`order: start-first` означает, что Swarm сначала запускает новый task, а затем останавливает старый. Поэтому в промежуточном выводе `docker service ps` старый task может некоторое время иметь `Desired State: Shutdown`, но ещё оставаться в `Current State: Running`. Через несколько секунд он переходит в `Shutdown`.

Важно: compose-файл не требует распределять реплики строго по разным worker-нодам. Требование задачи — запуск на серверах с label `SERVERTYPE=worker`. Поэтому ситуация, когда обе реплики после rolling update оказались на одной worker-ноде, не нарушает текущий compose-файл.

## Подключение внутрь контейнера

Контейнеры запускаются на worker-нодах, поэтому интерактивное подключение выполняется с worker-ноды.

Например, на `t1-02`:

```bash
sudo /opt/foraspekt/task3/scripts/exec-client.sh
```

Внутри контейнера проверить переменную и hostname:

```bash
echo "$HOSTNAME"
hostname
```

Ожидаемо для `t1-02`:

```text
t1-02
t1-02
```

Для `t1-03` ожидаемо:

```text
t1-03
t1-03
```

После rolling update контейнеры пересоздаются из чистого образа `ubuntu:22.04`. Пакеты, установленные вручную внутри старого контейнера, при этом пропадают. Это нормально для данной задачи: установка пакетов выполняется интерактивно для демонстрации подключения.

## Временные PostgreSQL и Redis для проверки

По условию PostgreSQL и Redis должны быть доступны через сети:

```text
db-postgres-net
ds-redis-net
```

Для локальной проверки в репозитории есть временная тестовая обвязка:

```text
compose/test-dependencies.yml
```

Она поднимает отдельный stack:

```text
task3-deps
```

Сервис PostgreSQL:

```text
task3-deps_postgres
```

Сервис Redis:

```text
task3-deps_redis
```

Это не основная часть сервиса `ubuntu-client`, а временные зависимости для демонстрации подключения.

Запуск временных зависимостей выполняется на manager-ноде `t1-01`:

```bash
sudo /opt/foraspekt/task3/scripts/deploy-test-deps.sh
```

Проверка:

```bash
sudo docker stack services task3-deps
sudo docker service ps task3-deps_postgres
sudo docker service ps task3-deps_redis
```

Ожидаемо:

```text
task3-deps_postgres   replicated   1/1   postgres:16-alpine
task3-deps_redis      replicated   1/1   redis:7-alpine
```

Для временных PostgreSQL и Redis используется:

```yaml
endpoint_mode: dnsrr
```

Причина: на текущем Swarm/LXC-стенде DNS для Swarm VIP работал, но подключение через VIP возвращало `Connection refused`. Прямой доступ к task IP работал корректно. `endpoint_mode: dnsrr` заставляет имя сервиса резолвиться напрямую в task IP, что подходит для этой проверочной обвязки.

## Проверка подключения к PostgreSQL и Redis

Зайти внутрь `ubuntu-client` на worker-ноде:

```bash
sudo /opt/foraspekt/task3/scripts/exec-client.sh
```

Внутри контейнера выполнить:

```bash
POSTGRES_HOST=postgres REDIS_HOST=redis /var/log/task3/check-connectivity.sh
```

Скрипт при первом запуске устанавливает необходимые пакеты:

```text
postgresql-client
redis-tools
iputils-ping
netcat-openbsd
```

Также он проверяет DNS, PostgreSQL и Redis, а затем пишет лог в host-visible volume.

Ожидаемый успешный результат:

```text
== PostgreSQL check ==
PostgreSQL attempt 1/12: postgres:5432
postgres:5432 - accepting connections

== Redis check ==
Redis attempt 1/12: redis:6379
PONG

All connectivity checks passed
```

Если используются реальные PostgreSQL и Redis с другими DNS-именами, их можно передать через переменные окружения:

```bash
POSTGRES_HOST=<real_postgres_name> REDIS_HOST=<real_redis_name> /var/log/task3/check-connectivity.sh
```

## Проверка host-visible логов

Внутри контейнера лог пишется в файл:

```text
/var/log/task3/check.log
```

На worker-ноде этот файл доступен через bind mount:

```text
/var/log/foraspekt/task3/ubuntu-client/check.log
```

Проверка на worker-ноде:

```bash
sudo cat /var/log/foraspekt/task3/ubuntu-client/check.log
```

Пример успешной записи:

```text
2026-05-09T06:34:50+00:00 task3 connectivity check from HOSTNAME=t1-02
PostgreSQL: postgres:5432, rc=0
Redis: redis:6379, rc=0
---
```

Если реплики расположены на разных worker-нодах, файл логов будет локальным для каждой worker-ноды. Если обе реплики расположены на одной worker-ноде, они используют один и тот же host path.

## Удаление временных PostgreSQL и Redis

После проверки временные зависимости нужно удалить:

```bash
sudo /opt/foraspekt/task3/scripts/remove-test-deps.sh
```

Проверка:

```bash
sudo docker stack services task3-deps
```

Ожидаемо:

```text
Nothing found in stack: task3-deps
```

## Удаление основного stack

На manager-ноде:

```bash
sudo /opt/foraspekt/task3/scripts/remove.sh
```

Проверка:

```bash
sudo docker stack services task3
```

Ожидаемо:

```text
Nothing found in stack: task3
```

## Итог

В результате реализован Docker Swarm stack с сервисом `ubuntu-client`, который:

- использует образ `ubuntu:22.04`;
- работает постоянно;
- имеет 2 реплики;
- поддерживает rolling update;
- ограничен по CPU и RAM;
- ограничен по Docker logs;
- запускается только на worker-нодах с label `SERVERTYPE=worker`;
- получает `HOSTNAME` с именем Swarm-ноды;
- подключён к сетям PostgreSQL и Redis;
- позволяет интерактивно зайти внутрь контейнера;
- позволяет установить PostgreSQL и Redis клиенты;
- демонстрирует подключение к PostgreSQL и Redis;
- пишет проверочные логи в host-visible volume.
