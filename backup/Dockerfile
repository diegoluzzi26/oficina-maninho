FROM alpine:3.20

# postgresql-client: pg_dump compatível com Postgres 16 do docker-compose
# rclone: envio para Google Drive
# tini: garante que sinais (SIGTERM) matam o processo limpo
RUN apk add --no-cache postgresql16-client rclone tini tzdata bash

ENV TZ=America/Sao_Paulo

# rclone.conf mora aqui — mapeado como volume pra sobreviver a rebuilds
ENV RCLONE_CONFIG=/config/rclone.conf

WORKDIR /app
COPY backup.sh /app/backup.sh
RUN chmod +x /app/backup.sh

# Loop diário. Não usa cron — o container é dedicado a isso,
# então basta um while+sleep e o log fica visível no `docker compose logs`.
ENTRYPOINT ["/sbin/tini", "--", "/app/backup.sh"]
