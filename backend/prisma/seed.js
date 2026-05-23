// Seed: cria usuario admin padrao e templates padrão se nao existirem
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ─── Templates padrão no formato "post WhatsApp" ──────────────────────────────
const DEFAULT_TEMPLATES = [
  {
    name: '🔥 Oferta do Dia',
    content: [
      '🔥 *OFERTA DO DIA* 🔥',
      '',
      '🤩💥 *{{name}}*',
      '',
      '{{shortDescription}}',
      '',
      '{{priceBlockLines}}',
      '',
      '🛍️ Compre Aqui 👇',
      '{{url}}',
      '',
      '⏰ Promoção sujeita a alteração sem aviso prévio ou frete.',
    ].join('\n'),
  },
  {
    name: '✨ Destaque da Semana',
    content: [
      '✨ *DESTAQUE DA SEMANA* ✨',
      '',
      '😍💫 *{{name}}*',
      '',
      '{{shortDescription}}',
      '',
      '{{priceBlockLines}}',
      '',
      '🛒 Garanta o seu agora 👇',
      '{{url}}',
      '',
      '⚠️ Preço sujeito a alteração. Confira condições no site.',
    ].join('\n'),
  },
  {
    name: '💥 Super Promoção',
    content: [
      '💥 *SUPER PROMOÇÃO* 💥',
      '',
      '🎯🛍️ *{{name}}*',
      '',
      '{{shortDescription}}',
      '',
      '{{priceBlockLines}}',
      '',
      '👇 Link para comprar:',
      '{{url}}',
      '',
      '⏰ Válido por tempo limitado!',
    ].join('\n'),
  },
  {
    name: '⚡ Relâmpago',
    content: [
      '⚡ *OFERTA RELÂMPAGO* ⚡',
      '',
      '🚀💎 *{{name}}*',
      '',
      '{{shortDescription}}',
      '',
      '{{priceBlockLines}}',
      '',
      '🔗 Aproveite agora:',
      '{{url}}',
      '',
      '📦 Frete grátis sujeito a disponibilidade.',
    ].join('\n'),
  },
  {
    name: '🎁 Presente Perfeito',
    content: [
      '🎁 *PRESENTE PERFEITO* 🎁',
      '',
      '❤️✨ *{{name}}*',
      '',
      '{{shortDescription}}',
      '',
      '{{priceBlockLines}}',
      '',
      '🛍️ Compre Aqui 👇',
      '{{url}}',
      '',
      '⏰ Promoção sujeita a alteração sem aviso prévio.',
    ].join('\n'),
  },
];

async function main() {
  // ── Admin user ──────────────────────────────────────────────────────────────
  const email    = process.env.ADMIN_EMAIL    || 'admin@divulgalinks.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
  const name     = process.env.ADMIN_NAME     || 'Administrador';

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { password: hashed, isActive: true, role: 'ADMIN' },
    create: { email, password: hashed, name, role: 'ADMIN', isActive: true },
  });
  console.log(`[seed] Admin OK: ${email}`);

  // ── Default message templates ───────────────────────────────────────────────
  const existing = await prisma.messageTemplate.count();
  if (existing === 0) {
    await prisma.messageTemplate.createMany({
      data: DEFAULT_TEMPLATES.map((t) => ({
        name: t.name,
        content: t.content,
        isActive: true,
      })),
    });
    console.log(`[seed] ${DEFAULT_TEMPLATES.length} templates padrão criados.`);
  } else {
    console.log(`[seed] Templates já existem (${existing}), pulando seed.`);
  }
}

main()
  .catch((e) => { console.error('[seed] Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
