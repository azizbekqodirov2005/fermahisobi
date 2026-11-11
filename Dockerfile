# Ferma — production image (Render / Railway / Fly.io / VPS)
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
# DATABASE_URL, APP_PASSWORD va SESSION_SECRET ni hosting panelida o'rnating.
CMD ["npx", "tsx", "server/index.ts"]
