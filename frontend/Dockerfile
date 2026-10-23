# --- build ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- serve ---
FROM nginx:alpine
COPY landing /usr/share/nginx/site
COPY --from=build /app/dist /usr/share/nginx/site/app
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
