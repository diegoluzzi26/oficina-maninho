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
  local dump="$DIR_BACKUPS/oficina-${stamp}.sql.gz"
  local tar_anexos="$DIR_BACKUPS/anexos-${stamp}.tar.gz"

  log "Iniciando pg_dump -> $dump"

  # -Fc daria um custom format mais rápido/menor, mas .sql.gz é mais
  # portátil — se algum dia precisar restaurar sem docker, qualquer
  # postgres aceita direto com `gunzip -c ... | psql`.
  if ! pg_dump "$DATABASE_URL" --no-owner --clean --if-exists \
       | gzip -9 > "$dump.parcial"; then
    log "ERRO: pg_dump falhou. Arquivo parcial descartado."
    rm -f "$dump.parcial"
    return 1
  fi

  mv "$dump.parcial" "$dump"
  local tam_dump="$(du -h "$dump" | cut -f1)"
  log "Dump local ok ($tam_dump)"

  # Anexos: só empacota se a pasta existe E tem algum arquivo dentro
  local tem_anexos=0
  if [ -d /anexos ] && [ -n "$(ls -A /anexos 2>/dev/null)" ]; then
    log "Empacotando anexos -> $tar_anexos"
    if tar -czf "$tar_anexos.parcial" -C / anexos 2>/dev/null; then
      mv "$tar_anexos.parcial" "$tar_anexos"
      local tam_anexos="$(du -h "$tar_anexos" | cut -f1)"
      log "Anexos empacotados ($tam_anexos)"
      tem_anexos=1
    else
      log "AVISO: tar de anexos falhou; upload continua sem eles."
      rm -f "$tar_anexos.parcial"
    fi
  fi

  if [ ! -f "$RCLONE_CONFIG" ]; then
    log "AVISO: $RCLONE_CONFIG não existe — rclone não configurado."
    log "       Rode 'docker compose run --rm backup rclone config' pra autorizar o Drive."
    log "       Backups salvos apenas localmente por enquanto."
    return 0
  fi

  log "Enviando pro Drive ($RCLONE_REMOTE:$RCLONE_PASTA)…"
  local ok=0
  if rclone copy "$dump" "$RCLONE_REMOTE:$RCLONE_PASTA" \
       --transfers 2 --checkers 2 --stats-one-line -v 2>&1 | sed 's/^/  /'; then
    ok=1
  fi
  if [ "$tem_anexos" -eq 1 ]; then
    if rclone copy "$tar_anexos" "$RCLONE_REMOTE:$RCLONE_PASTA" \
         --transfers 2 --checkers 2 --stats-one-line -v 2>&1 | sed 's/^/  /'; then
      :
    else
      log "AVISO: upload dos anexos falhou; dump foi enviado."
      ok=0
    fi
  fi

  if [ "$ok" = "1" ]; then
    log "Upload ok."
  else
    log "ERRO: upload teve falhas. Arquivos locais preservados."
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
