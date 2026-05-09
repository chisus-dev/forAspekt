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

```