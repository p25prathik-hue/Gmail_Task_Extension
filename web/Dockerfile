# Self-host the MailTasks web app (e.g. on Docker Desktop): docker compose up -d  → http://localhost:8080
FROM node:22-alpine AS build
WORKDIR /app
COPY config ./config
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && npm run build

FROM nginx:alpine
COPY --from=build /app/web/dist /usr/share/nginx/html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
