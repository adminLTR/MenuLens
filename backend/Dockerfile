FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        tesseract-ocr \
        tesseract-ocr-por \
        tesseract-ocr-eng \
        tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV FLASK_APP=wsgi.py

EXPOSE 5000

CMD ["python", "entrypoint.py"]
