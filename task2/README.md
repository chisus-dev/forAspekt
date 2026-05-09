## 2. `docker задача.docx`

### Исходный код:

```dockerfile
FROM python
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
EXPOSE 5000
CMD ["python", "app.py"]
```

### Решение

```dockerfile
# syntax=docker/dockerfile:1.7

FROM python:3.12.8-slim-bookworm AS builder

WORKDIR /app

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

RUN python -m venv "${VIRTUAL_ENV}"

COPY --link requirements.txt .

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt


FROM python:3.12.8-slim-bookworm AS runtime

WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app app \
    && rm -rf /var/lib/apt/lists/*

COPY --link --from=builder /opt/venv /opt/venv

COPY --link --chown=app:app . .

ENV PATH="/opt/venv/bin:${PATH}"

USER app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=2)" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["python", "app.py"]
```

- Зафиксирован минимальный базовый образ, версия python
- Исправлен порядок слоёв
- Используется кэширование BuildKit, кэш очищается или не попадает в итоговый слой
- Добавлен multi-stage build
- Приложение запускается не под root
- Добавлен tini
- Добавлен HEALTHCHECK
