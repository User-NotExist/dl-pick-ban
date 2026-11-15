# syntax=docker/dockerfile:1

# adapter-bun needs Bun 1.4+ for both the build and the runtime
FROM oven/bun:1.4-alpine AS build
WORKDIR /app

COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# The build output is self-contained, so the runtime image needs no node_modules
FROM oven/bun:1.4-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=bun:bun /app/build ./build

USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD bun -e "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/'); process.exit(r.ok ? 0 : 1)"

CMD ["bun", "./build"]
