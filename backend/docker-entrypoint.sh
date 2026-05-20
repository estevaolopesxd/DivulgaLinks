#!/bin/sh

echo "==> Executando migrations do Prisma..."
if node_modules/.bin/prisma migrate deploy; then
  echo "==> Migrations aplicadas com sucesso."
else
  echo "AVISO: prisma migrate deploy falhou (schema pode ja estar atualizado). Continuando..."
fi

echo "==> Iniciando servidor..."
exec node dist/index.js
