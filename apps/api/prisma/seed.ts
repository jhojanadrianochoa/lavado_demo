import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { MovementType, PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const INITIAL_PRODUCTS = [
  { name: 'Lava llantas', description: 'Producto para limpieza de llantas', minStock: 50 },
  { name: 'Espuma', description: 'Espuma activa para prelavado', minStock: 50 },
  { name: 'Cera', description: 'Cera de acabado', minStock: 30 },
];

async function main() {
  const company = (await prisma.company.findFirst()) ?? (await prisma.company.create({ data: { name: 'LavaControl' } }));

  const username = (process.env.ADMIN_USERNAME ?? 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'Admin123*';
  const admin = await prisma.user.upsert({
    where: { username },
    update: {},
    create: { companyId: company.id, name: 'Administrador', username, role: Role.ADMIN, passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Administrador: ${username}`);

  for (const p of INITIAL_PRODUCTS) {
    await prisma.product.upsert({
      where: { companyId_name: { companyId: company.id, name: p.name } },
      update: {},
      create: { companyId: company.id, unit: 'L', ...p },
    });
  }
  console.log('Productos iniciales: Lava llantas, Espuma, Cera');

  if (process.env.SEED_DEMO !== 'true') return;

  const hash = await bcrypt.hash('Demo1234*', 12);
  const mkUser = (name: string, user: string, role: Role) =>
    prisma.user.upsert({ where: { username: user }, update: {}, create: { companyId: company.id, name, username: user, role, passwordHash: hash } });
  const supervisor = await mkUser('Laura Supervisora', 'laura', Role.SUPERVISOR);
  const carlos = await mkUser('Carlos Pérez', 'carlos', Role.WORKER);
  const ana = await mkUser('Ana Gómez', 'ana', Role.WORKER);

  const products = await prisma.product.findMany({ where: { companyId: company.id } });
  const points = [
    { code: 'LN-001', name: 'Lavado Norte', address: 'Calle 170 # 15-20', city: 'Bogotá', workers: [carlos.id] },
    { code: 'LS-002', name: 'Lavado Sur', address: 'Av. Boyacá # 50-10', city: 'Bogotá', workers: [ana.id] },
    { code: 'LC-003', name: 'Lavado Centro', address: 'Carrera 7 # 22-40', city: 'Bogotá', workers: [carlos.id, ana.id] },
  ];
  for (const p of points) {
    const exists = await prisma.washPoint.findUnique({ where: { code: p.code } });
    if (exists) continue;
    await prisma.washPoint.create({
      data: {
        companyId: company.id,
        code: p.code,
        name: p.name,
        address: p.address,
        city: p.city,
        managerId: supervisor.id,
        users: { create: [supervisor.id, ...p.workers].map((userId) => ({ userId })) },
        products: { create: products.map((pr) => ({ productId: pr.id })) },
      },
    });
  }
  for (const product of products) {
    const hasMovements = await prisma.inventoryMovement.count({ where: { productId: product.id } });
    if (hasMovements) continue;
    const qty = 500;
    await prisma.$transaction([
      prisma.product.update({ where: { id: product.id }, data: { currentStock: qty } }),
      prisma.inventoryMovement.create({ data: { productId: product.id, type: MovementType.ENTRADA, quantity: qty, balanceAfter: qty, userId: admin.id, reason: 'Inventario inicial' } }),
    ]);
  }
  console.log('Datos demo creados (usuarios laura, carlos, ana — contraseña Demo1234*)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
