#!/bin/sh
# Deploy no servidor: puxa o main e sobe a stack inteira com a versão nova.
#
#   cd /opt/oficina && sh deploy/deploy.sh
#
# O número do build (commits do HEAD) e o SHA vão pro build do container
# web, que mostra "v1.1.<build>" no rodapé da barra lateral.
set -eu

cd "$(dirname "$0")/.."

git pull

APP_BUILD="$(git rev-list --count HEAD)"
APP_COMMIT="$(git rev-parse --short HEAD)"
export APP_BUILD APP_COMMIT

echo "==> Deploy build ${APP_BUILD} (commit ${APP_COMMIT})"

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
