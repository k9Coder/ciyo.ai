FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9 --quiet
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# NOTE: VITE_CLERK_PUBLISHABLE_KEY is a public key safe for JS bundles.
# Build ARGs are NOT for secrets — never pass sensitive values as build ARGs.
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_API_BASE
RUN pnpm build:prod

# nginxinc/nginx-unprivileged runs as the non-root 'nginx' user on port 8080.
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
# Templated via the image's built-in envsubst-on-templates entrypoint script,
# so CSP connect-src can point at a local backend without a rebuild.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_ORIGIN=https://api.mykka.ai
EXPOSE 8080
