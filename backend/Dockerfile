# SmartBudget API · imagen de producción
# Construir desde la RAÍZ del repositorio (necesita backend/ y database/migrations/):
#   docker build -f backend/Dockerfile -t smartbudget-api .

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app/backend

# 1. Dependencias (capa cacheada mientras no cambie package-lock.json)
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 2. Código y migraciones
COPY backend/src ./src
COPY database/migrations /app/database/migrations

# 3. Ejecutar como usuario sin privilegios
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Aplica migraciones pendientes y arranca la API
CMD ["sh", "-c", "node src/database/migrate.js && node src/server.js"]
