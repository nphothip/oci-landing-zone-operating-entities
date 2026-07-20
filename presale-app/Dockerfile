# OCI Presale Studio — build from the REPOSITORY ROOT so gen/ is available:
#   docker build -f presale-app/Dockerfile -t oci-presale-app .
# (docker compose in presale-app/ does this for you)

# --- stage 1: canonical go-jsonnet binary ----------------------------------
FROM golang:1.24-bookworm AS jsonnet
RUN go install github.com/google/go-jsonnet/cmd/jsonnet@v0.21.0

# --- stage 2: build the Next.js app ----------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY presale-app/package.json presale-app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY presale-app/ ./
RUN npm run build

# --- stage 3: runtime -------------------------------------------------------
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=jsonnet /go/bin/jsonnet /usr/local/bin/jsonnet

# Blueprint Factory tree (read-only reuse of the repo generator)
COPY gen/ /repo/gen/

WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    REPO_ROOT=/repo \
    JSONNET_BIN=/usr/local/bin/jsonnet \
    PYTHON_BIN=python3 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=10s --start-period=15s \
  CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
