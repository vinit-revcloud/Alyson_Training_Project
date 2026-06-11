# Alyson Training — production image
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

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Uploaded assets (videos, papers) — mount a volume here in production
RUN mkdir -p storage

EXPOSE 4173

CMD ["npm", "run", "start"]
