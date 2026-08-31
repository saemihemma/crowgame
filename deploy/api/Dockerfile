# Crow API. One image, four roles, selected by CROW_JOB:
#   (unset)         -> the HTTP service
#   migrate         -> pre-deploy migration runner
#   retention       -> scheduled partition maintenance
#   verify-restore  -> prove a restored backup is usable (deploy/RAILWAY.md §2e)
#
# Same image for all four so a scheduled job, or a one-off run against a restored
# copy, can never run different code than the service it maintains.
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server/migrations ./migrations

# Never run as root.
USER node

# Railway private networking is IPv6: the app defaults to binding '::'.
EXPOSE 8080

# CROW_JOB picks the role. Migrations are the service's PRE-DEPLOY command, not
# part of boot — a boot-time migration races every replica that starts at once.
CMD ["sh", "-c", "case \"$CROW_JOB\" in \
  migrate) exec node dist/migrate.js ;; \
  retention) exec node dist/maintenance.js ;; \
  verify-restore) exec node dist/verifyRestore.js ;; \
  *) exec node dist/index.js ;; \
esac"]
