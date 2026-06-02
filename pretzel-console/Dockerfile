FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9 --quiet
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_API_BASE
RUN pnpm build:prod

FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
