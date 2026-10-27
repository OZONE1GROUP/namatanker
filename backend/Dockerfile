# OmanOne.tech Tanker Operations Simulator — backend image.
# SIMULATION MODE: this container only ever talks to the Postgres service
# defined in docker-compose.yml and serves synthetic simulated data; it is
# never wired to real PLCs, meters, GPS devices or industrial equipment.
FROM python:3.13-slim

WORKDIR /app

# psycopg[binary]'s wheel bundles libpq, so no apt-get postgresql-dev-headers
# dance is needed here — keeps the image small and the build fast.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# No --reload in the container image: that's a dev-only convenience, not
# something you want in a packaged artifact.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
