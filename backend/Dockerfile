# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2 — production
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN sed -i 's/\r//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
