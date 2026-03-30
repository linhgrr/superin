FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

EXPOSE 7860

# HF Spaces uses port 7860 by default
CMD ["uvicorn", "core.main:app", "--host", "0.0.0.0", "--port", "7860"]
