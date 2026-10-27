# OmanOne.tech Tanker Operations Simulator — frontend image.
# Multi-stage: build the Vite/React app, then serve the static output
# with nginx (which also reverse-proxies /api to the backend container —
# the same role Vite's dev-server proxy plays locally).
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
