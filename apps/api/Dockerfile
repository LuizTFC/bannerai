# Bannerai API / worker image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t bannerai-api .
# The same image runs the API (default command) and the worker (`node apps/api/dist/worker.js`).

FROM node:24-slim AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace=packages/shared --workspace=apps/api --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @bannerai/shared && npm run build -w apps/api

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
EXPOSE 4000
# API: apply pending migrations, then serve. Worker services override the command (see railway.worker.json).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
