# NC7 Canvas — multi-stage image for Google Cloud Run
# Serves Vite static build on port 8080 (Cloud Run $PORT default).

# ---- Stage 1: build ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: nginx ----
FROM nginx:alpine

# Replace default server (port 80) with Cloud Run–friendly config on 8080.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
