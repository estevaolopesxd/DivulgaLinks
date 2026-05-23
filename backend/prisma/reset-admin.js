/**
 * Reset / cria o usuário admin.
 * Uso: node prisma/reset-admin.js
 * Ou com credenciais customizadas:
 *   ADMIN_EMAIL=meu@email.com ADMIN_PASSWORD=MinhaSenha123 node prisma/reset-admin.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email    = process.env.ADMIN_EMAIL    || 'admin@divulgalinks.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
  const name     = process.env.ADMIN_NAME     || 'Administrador';

  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hashed, isActive: true, role: 'ADMIN' },
    create: { email, password: hashed, name, role: 'ADMIN', isActive: true },
  });

  console.log(`✅ Admin OK: ${user.email}  |  Senha: ${password}`);
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
