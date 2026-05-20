// Seed: cria usuario admin padrao se nao existir
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email    = process.env.ADMIN_EMAIL    || 'admin@divulgalinks.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
  const name     = process.env.ADMIN_NAME     || 'Administrador';

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    console.log(`[seed] Admin ja existe: ${email}`);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      password: hashed,
      name,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log(`[seed] Admin criado com sucesso!`);
  console.log(`[seed]   Email : ${email}`);
  console.log(`[seed]   Senha : ${password}`);
}

main()
  .catch((e) => { console.error('[seed] Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
