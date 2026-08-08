FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends qrencode ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
RUN chmod +x run-full-project.sh stop-full-project.sh scripts/*.sh scripts/production-check.js
ENV NODE_ENV=production
EXPOSE 4173 4273
CMD ["npm","run","inspector:serve"]
