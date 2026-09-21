FROM node:22-bookworm AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build
FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl --fail -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
 && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium
COPY backend ./
COPY scripts /app/scripts
COPY templates /app/templates
COPY --from=frontend /build/frontend/dist /app/frontend/dist
RUN mkdir -p /data/uploads /data/import-temp /data/backups && chown -R node:node /data /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 UPLOAD_DIR=/data/uploads BACKUP_DIR=/data/backups
EXPOSE 3001
USER node
CMD ["sh","-c","npm run migrate && node src/server.js"]
