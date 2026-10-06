# PocketBase server built from source (vs the prebuilt community image used in
# docker-compose.prebuilt.yml). Follower of the official build instructions:
# Platform-specific binaries are generated from the `examples/base` program in
# the PocketBase repo:  `go build -o pocketbase ./examples/base`.
#
# The entrypoint mirrors the muchobien image's convenience: create/upsert the
# superuser from PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD (if set), then serve.
FROM golang:1.27-alpine AS build

ARG POCKETBASE_VERSION=v0.40.4
RUN apk add --no-cache git ca-certificates tzdata

# Clone only the pinned tag — full history and other branches are not needed.
WORKDIR /src
RUN git clone --depth 1 --branch ${POCKETBASE_VERSION} https://github.com/pocketbase/pocketbase.git .

WORKDIR /src/examples/base
# examples/base imports the root module (github.com/pocketbase/pocketbase), so
# resolve deps from the repo root before building the standalone binary.
RUN go mod download
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /pocketbase .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata

COPY --from=build /pocketbase /usr/local/bin/pocketbase
# Build context is the repo root (compose sets context: . + dockerfile:
# pocketbase/Dockerfile), so COPY paths are relative to that root.
COPY pocketbase/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PB_PORT=8090
EXPOSE 8090
VOLUME ["/pb_data"]

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb_data"]