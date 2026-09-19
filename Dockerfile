FROM node:24-bookworm-slim AS client-build
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:24-bookworm-slim AS server-build
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/src ./src
COPY server/tsconfig.json server/tsconfig.build.json ./
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS game
ENV NODE_ENV=production PORT=2567 CLIENT_DIST_PATH=/app/public CHARACTER_DB_PATH=/app/data/characters.sqlite
WORKDIR /app
COPY --from=server-build /build/server/package.json ./
COPY --from=server-build /build/server/node_modules ./node_modules
COPY --from=server-build /build/server/build ./build
COPY --from=client-build /build/client/dist ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 2567
CMD ["node", "build/index.js"]
