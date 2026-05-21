#!/bin/sh

echo "==> Criando/atualizando tabelas no banco..."
if node_modules/.bin/prisma db push --accept-data-loss; then
  echo "==> Schema aplicado com sucesso."
else
  echo "ERRO: prisma db push falhou. Abortando."
  exit 1
fi

echo "==> Criando usuario admin (se nao existir)..."
node prisma/seed.js || echo "AVISO: Seed falhou, continuando..."

echo "==> Iniciando servidor..."
exec node dist/index.js
