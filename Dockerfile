# Alyson Training — production image (Nitro node-server)
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_NEON_AUTH_URL
ARG VITE_NEON_DATA_API_URL
ENV VITE_NEON_AUTH_URL=$VITE_NEON_AUTH_URL
ENV VITE_NEON_DATA_API_URL=$VITE_NEON_DATA_API_URL

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4173
ENV HOST=0.0.0.0

# Nitro bundles server code into .output — no node_modules needed at runtime
COPY --from=build /app/.output ./.output

# Uploaded assets (class videos, interview paper photos) — mount a volume here
RUN mkdir -p storage

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173/api/health || exit 1

CMD ["node", ".output/server/index.mjs"]
