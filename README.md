# LavaControl

Plataforma web para gestionar y controlar los puntos de lavado de vehículos de una empresa: puntos, usuarios, requerimientos, tareas, llenados (cantidad **realmente llenada**), inventario, fotografías, incidencias, historial, dashboard, informes (PDF / Excel / CSV), notificaciones internas y auditoría.

Arquitectura, modelo de datos, endpoints y flujos: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Stack

- `apps/api`: Node.js 22, Express, TypeScript, Prisma, PostgreSQL 16, Zod, JWT (cookie httpOnly), pdfkit, exceljs.
- `apps/web`: React 18, Vite, TypeScript, TailwindCSS, TanStack Query, React Router, Recharts.

## Desarrollo local

Requisitos: Node 22, Docker.

```bash
# 1. Base de datos
docker run -d --name lavado-db -e POSTGRES_USER=lavado -e POSTGRES_PASSWORD=lavado -e POSTGRES_DB=lavado -p 5432:5432 postgres:16-alpine

# 2. Dependencias y configuración
npm install
cp apps/api/.env.example apps/api/.env   # ajuste JWT_SECRET y ADMIN_PASSWORD

# 3. Migraciones y datos iniciales (admin + productos Lava llantas, Espuma, Cera)
npm run db:migrate
npm run db:seed                         # SEED_DEMO=true npm run db:seed agrega puntos y usuarios demo

# 4. Servidores
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:5173 (proxy /api -> 4000)
```

Usuario administrador inicial: el definido en `ADMIN_USERNAME` / `ADMIN_PASSWORD` (por defecto `admin` / `Admin123*`; cámbielo en producción).
Con `SEED_DEMO=true` se crean además `laura` (supervisora), `carlos` y `ana` (trabajadores) con contraseña `Demo1234*`.

## Verificación

```bash
npm run lint
npm run typecheck
npm run build
```

## Producción (Docker)

```bash
JWT_SECRET=$(openssl rand -hex 32) ADMIN_PASSWORD='ClaveSegura123*' docker compose up -d --build
docker compose exec app npm run db:seed
```

La API sirve también el frontend compilado en `http://localhost:4000`. Las fotografías se guardan en el volumen `uploads`. Detrás de HTTPS, defina `COOKIE_SECURE=true`.
