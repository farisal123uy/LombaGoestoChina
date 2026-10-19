FROM node:22-bookworm-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/reviewer/package.json apps/reviewer/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/planner/package.json packages/planner/package.json
COPY packages/wallet/package.json packages/wallet/package.json
COPY packages/database/package.json packages/database/package.json
COPY contracts/package.json contracts/package.json

FROM manifests AS build
RUN npm ci
COPY . .
RUN npm run build:packages && npm run build --workspace @guardian-wallet/api && npm run build --workspace @guardian-wallet/worker

FROM manifests AS production-dependencies
RUN npm ci --omit=dev --workspace @guardian-wallet/api --workspace @guardian-wallet/worker --include-workspace-root

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV SERVICE=api
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/worker ./apps/worker
COPY tools/start-service.mjs ./tools/start-service.mjs
USER node
CMD ["node", "tools/start-service.mjs"]
