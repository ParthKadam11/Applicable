# Thin wrapper around the published HydraDB image so we can healthcheck /readyz.
# Does NOT compile Rust — only installs curl. Safe for low-RAM hosts.
# Pin: v0.4.0 index digest (linux/amd64 + arm64).
FROM ghcr.io/hydra-db/hydradb:0.4.0@sha256:ab71d651fefee13ebb23eb56d72316065bdca563ff7587442e07be663f2bf880
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
USER 10001:10001
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=12 \
  CMD curl -fsS http://127.0.0.1:9090/readyz || exit 1
ENTRYPOINT ["/usr/local/bin/graph-node"]
