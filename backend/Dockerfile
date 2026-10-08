FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY data/legal_corpus ./data/legal_corpus
# Build the Chroma index (and download its embedding model) at build time,
# so the first /draft-appeal or /rag/search request isn't slow.
RUN python -m app.rag.ingest

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
