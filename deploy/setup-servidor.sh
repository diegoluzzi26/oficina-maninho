#!/usr/bin/env bash
#
# Script idempotente pra preparar um Ubuntu 24.04 recém-criado
# na Hetzner (ou qualquer VPS) pra rodar a oficina em produção.
#
# Uso (rodar como root uma vez logo depois de criar a VM):
#   curl -fsSL https://raw.githubusercontent.com/... | bash
# ou, com o repo já copiado:
#   bash deploy/setup-servidor.sh

set -euo pipefail

log() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }

log "Atualizando sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -yqq

log "Firewall (ufw)"
apt-get install -yqq ufw
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     comment 'SSH'
ufw allow 80/tcp     comment 'HTTP'
ufw allow 443/tcp    comment 'HTTPS'
ufw allow 443/udp    comment 'HTTP/3'
ufw --force enable

log "Fail2ban (proteção anti-brute-force no SSH)"
apt-get install -yqq fail2ban
systemctl enable --now fail2ban

log "Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -yqq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

log "Fuso horário: America/Sao_Paulo"
timedatectl set-timezone America/Sao_Paulo

log "Swap (2GB) — evita OOM em picos"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "Endurecimento leve do SSH"
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh

log "Pronto. Próximo passo: subir o projeto e rodar docker compose up -d."
