#!/usr/bin/env bash
#
# Backup diário do banco de dados da oficina.
#
# Fluxo:
#   1) pg_dump comprimido -> /backups/oficina-YYYY-MM-DD_HHMMSS.sql.gz
#   2) rclone copy -> Google Drive (pasta oficina-backups/)
#   3) Log no stdout (visível em `docker compose logs backup`)
#
# Retenção: infinita — não apagamos nada. O Drive tem 15 GB grátis e um
# backup gzipado da oficina cabe fácil em alguns KB por ano.
#
# Variáveis lidas do docker-compose:
#   DATABASE_URL   — string de conexão do postgres (mesma da API)
#   BACKUP_HORA    — hora do dia (0-23) em que o backup roda. Default 3 (madrugada)
#   RCLONE_REMOTE  — nome do remote configurado no rclone. Default "drive"
#   RCLONE_PASTA   — pasta destino no Drive. Default "oficina-backups"

set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL obrigatorio}"
BACKUP_HORA="${BACKUP_HORA:-3}"
RCLONE_REMOTE="${RCLONE_REMOTE:-drive}"
RCLONE_PASTA="${RCLONE_PASTA:-oficina-backups}"

DIR_BACKUPS=/backups
mkdir -p "$DIR_BACKUPS"

log() { printf "[backup %s] %s\n" "$(date '+%F %T')" "$*"; }

fazer_backup() {
  local stamp="$(date '+%Y-%m-%d_%H%M%S')"
  local arquivo="$DIR_BACKUPS/oficina-${stamp}.sql.gz"

  log "Iniciando pg_dump -> $arquivo"

  # -Fc daria um custom format mais rápido/menor, mas .sql.gz é mais
  # portátil — se algum dia precisar restaurar sem docker, qualquer
  # postgres aceita direto com `gunzip -c ... | psql`.
  if ! pg_dump "$DATABASE_URL" --no-owner --clean --if-exists \
       | gzip -9 > "$arquivo.parcial"; then
    log "ERRO: pg_dump falhou. Arquivo parcial descartado."
    rm -f "$arquivo.parcial"
    return 1
  fi

  mv "$arquivo.parcial" "$arquivo"
  local tamanho="$(du -h "$arquivo" | cut -f1)"
  log "Dump local ok ($tamanho)"

  if [ ! -f "$RCLONE_CONFIG" ]; then
    log "AVISO: $RCLONE_CONFIG não existe — rclone não configurado."
    log "       Rode 'docker compose run --rm backup rclone config' pra autorizar o Drive."
    log "       Backup fica salvo apenas localmente por enquanto."
    return 0
  fi

  log "Enviando pro Drive ($RCLONE_REMOTE:$RCLONE_PASTA)…"
  if rclone copy "$arquivo" "$RCLONE_REMOTE:$RCLONE_PASTA" \
       --transfers 2 --checkers 2 --stats-one-line -v 2>&1 | sed 's/^/  /'; then
    log "Upload ok."
  else
    log "ERRO: upload falhou. Backup local preservado em $arquivo."
    return 1
  fi
}

# Uma execução manual: `docker compose run --rm backup once`
if [ "${1:-}" = "once" ]; then
  fazer_backup
  exit $?
fi

log "Iniciado. Rodará todo dia às ${BACKUP_HORA}h (fuso $TZ)."

# Roda uma vez logo na subida para não ficar 24h esperando o primeiro backup.
fazer_backup || log "Backup inicial falhou — próximo tentará amanhã."

ultimo_dia=""
while true; do
  agora_hora=$(date +%H)
  agora_dia=$(date +%F)

  if [ "$agora_hora" = "$(printf '%02d' "$BACKUP_HORA")" ] && [ "$ultimo_dia" != "$agora_dia" ]; then
    ultimo_dia="$agora_dia"
    fazer_backup || log "Falha no backup diário; seguirá tentando amanhã."
  fi

  # Verifica a cada 10 min: barato e evita perder janela por drift de relógio.
  sleep 600
done
