# server/Dockerfile
FROM denoland/deno:2.4

WORKDIR /app

# Dependencies cachen
COPY deno.json .
RUN deno install --entrypoint index.ts || true

COPY . .

EXPOSE 3000

# Permissions: net (HTTP), env (secrets), read (files)
CMD ["deno", "run", \
     "--allow-net", \
     "--allow-env", \
     "--allow-read", \
     "index.ts"]
