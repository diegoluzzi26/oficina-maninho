FROM node:20-alpine

WORKDIR /app

# Camada de dependências separada: só reinstala quando package.json muda
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# Roda sem privilégios de root
USER node

CMD ["node", "src/server.js"]
