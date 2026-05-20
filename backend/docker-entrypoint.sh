#!/bin/sh
set -e

MAX_TRIES=5
TRIES=0

echo "==> Executando migrations do Prisma..."
until node_modules/.bin/prisma migrate deploy; do
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge $MAX_TRIES ]; then
    echo "ERRO: Migrations falharam apos $MAX_TRIES tentativas."
    exit 1
  fi
  echo "Tentativa $TRIES/$MAX_TRIES falhou. Aguardando 5s..."
  sleep 5
done

echo "==> Migrations OK. Iniciando servidor..."
exec node dist/index.js
