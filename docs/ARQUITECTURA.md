# LavaControl — Arquitectura del sistema

Plataforma web independiente (sin WhatsApp) para gestionar puntos de lavado, usuarios, requerimientos, tareas, llenados de producto, inventario, incidencias, fotografías, historial, dashboard e informes.

## 1. Arquitectura

```
 Navegador (PC / tablet / teléfono)
        │  HTTPS
        ▼
 ┌──────────────────────────────┐
 │  Frontend SPA (React + Vite) │  build estático servido por el backend en producción
 └──────────────┬───────────────┘
                │ REST JSON  /api/*   (cookie httpOnly con JWT)
                ▼
 ┌──────────────────────────────┐
 │  API Node.js (Express + TS)  │  módulos: auth, users, points, products, inventory,
 │  Zod · RBAC · Auditoría      │  requirements, tasks, fillings, photos, incidents,
 │  Jobs (vencimientos)         │  notifications, dashboard, history, reports, settings
 └───────┬──────────────┬───────┘
         │ Prisma ORM   │ almacenamiento de archivos (interfaz Storage)
         ▼              ▼
   PostgreSQL 16     uploads/ (disco local; reemplazable por S3/MinIO)
```

- **Monolito modular**: cada módulo tiene `routes` (HTTP + permisos), `service` (reglas de negocio) y `schemas` (validación Zod). Permite separar en microservicios más adelante si hiciera falta.
- **API REST** independiente del frontend → una futura **app móvil** consume la misma API.
- **Multi‑empresa preparado**: tabla `Company` y `companyId` en las entidades principales (hoy existe una empresa por defecto).
- **Escalabilidad prevista** (no implementada aún): `WashPoint.latitude/longitude` (geolocalización/GPS), `WashPoint.qrCode` (QR para iniciar tareas), `Task.startLat/startLng`, unidades libres por producto, tipos configurables, tabla `Setting` clave/valor, interfaz `Storage` para S3.

## 2. Tecnologías

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | SPA rápida, tipado, ecosistema grande |
| UI | TailwindCSS + lucide-react | Moderna, limpia, responsive (mobile‑first) |
| Datos UI | TanStack Query + React Router | Caché, refetch, rutas protegidas |
| Gráficos | Recharts | Gráficos de consumo/estado |
| Backend | Node.js 22 + Express + TypeScript | Simple, robusto, mismo lenguaje que el front |
| ORM / BD | Prisma + PostgreSQL 16 | Migraciones, relaciones, tipado end‑to‑end |
| Validación | Zod | Validación de formularios y payloads |
| Seguridad | bcrypt, JWT en cookie httpOnly/SameSite, helmet, rate‑limit en login | Contraseñas seguras y sesiones seguras |
| Archivos | multer (+ compresión de imagen en el navegador) | Fotos de evidencia |
| Exportación | pdfkit (PDF con logo, tablas, gráficos), exceljs (Excel), CSV | Informes |
| Despliegue | Docker + docker‑compose | Un contenedor app + uno PostgreSQL |

## 3. Base de datos (tablas y relaciones)

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `Company` | id, name, logoPath | 1‑N con casi todo |
| `User` | id, name, username (único), email, phone, passwordHash, role (ADMIN/SUPERVISOR/WORKER), active, lastLoginAt | N‑N con puntos (`PointUser`) |
| `WashPoint` | id, code (único), name, address, city, active, managerId→User, notes, latitude?, longitude?, qrCode?, createdAt | `PointUser`, `PointProduct`, tareas, llenados, incidencias… |
| `PointUser` | pointId, userId | Usuarios asociados a cada punto (supervisores y trabajadores) |
| `PointProduct` | pointId, productId | Productos utilizados por punto |
| `Product` | id, name, description, unit (L por defecto), currentStock, minStock, active, createdAt | movimientos, llenados |
| `Requirement` | id, pointId, type, description, priority, status, createdById, assigneeId?, assignedAt, completedAt, notes, productId? | 1‑N `Task` |
| `Task` | id, pointId, requirementId?, productId?, type, description, priority, status, assigneeId?, createdById, dueDate, startedAt, completedAt, notes | llenados, fotos, incidencias |
| `Filling` | id, pointId, productId, taskId?, userId, **quantity** (cantidad realmente llenada), unit, filledAt, notes | 1‑1 `InventoryMovement`, fotos |
| `Photo` | id, path, mime, size, type (ANTES/DESPUES/INCIDENCIA/ADICIONAL), pointId, taskId?, incidentId?, fillingId?, userId, takenAt | |
| `Incident` | id, pointId, taskId?, reportedById, type, description, priority, status, assigneeId?, resolvedAt, solution, closedAt | fotos |
| `InventoryMovement` | id, productId, type (ENTRADA/SALIDA/AJUSTE/LLENADO), quantity (con signo), balanceAfter, userId, reason, pointId?, fillingId? | |
| `Notification` | id, userId, type, title, message, link, readAt, createdAt | |
| `AuditLog` | id, userId, action, entity, entityId, details (JSON), ip, createdAt | |
| `Setting` | key, value (por empresa) | nombre empresa, logo, descuento automático de inventario |

**Regla de datos**: `Filling` solo tiene `quantity` = cantidad REALMENTE llenada. No existen campos de cantidad asignada/esperada/programada en ninguna tabla ni pantalla.

Enums: `Role`, `Priority` (BAJA/MEDIA/ALTA/URGENTE), `RequirementStatus` (PENDIENTE/ASIGNADO/EN_PROCESO/COMPLETADO/CANCELADO), `TaskStatus` (PENDIENTE/ASIGNADA/EN_PROCESO/COMPLETADA/CANCELADA), `IncidentStatus` (ABIERTA/EN_PROCESO/SOLUCIONADA/CERRADA), `PhotoType`, `MovementType`. Tipos de tarea/requerimiento/incidencia son catálogos de texto validados (fáciles de ampliar).

## 4. API / endpoints (prefijo `/api`)

| Módulo | Endpoints | Roles |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | todos |
| Usuarios | `GET/POST /users`, `GET/PUT /users/:id`, `PATCH /users/:id/status`, `POST /users/:id/password` | ADMIN (lectura de trabajadores: SUPERVISOR) |
| Puntos | `GET/POST /points`, `GET/PUT /points/:id`, `PATCH /points/:id/status`, `GET /points/:id/stats` | ADMIN escribe; SUPERVISOR/WORKER sus puntos |
| Productos | `GET/POST /products`, `PUT /products/:id` | ADMIN escribe |
| Inventario | `GET /inventory/movements`, `POST /inventory/movements`, `GET /inventory/alerts` | ADMIN (SUPERVISOR lectura) |
| Requerimientos | `GET/POST /requirements`, `GET/PUT /requirements/:id`, `POST /requirements/:id/convert` (→ tarea), `PATCH /requirements/:id/status` | ADMIN/SUPERVISOR; WORKER puede crear desde su punto |
| Tareas | `GET/POST /tasks`, `GET/PUT /tasks/:id`, `POST /tasks/:id/assign`, `POST /tasks/:id/start`, `POST /tasks/:id/complete`, `POST /tasks/:id/cancel` | según rol |
| Llenados | `GET/POST /fillings`, `GET /fillings/:id` | WORKER registra; ADMIN/SUPERVISOR consultan |
| Fotos | `POST /photos` (multipart), `GET /photos`, `GET /photos/:id/file`, `DELETE /photos/:id` | según rol |
| Incidencias | `GET/POST /incidents`, `GET/PUT /incidents/:id`, `PATCH /incidents/:id/status` | WORKER reporta; ADMIN/SUPERVISOR gestionan |
| Notificaciones | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | todos |
| Dashboard | `GET /dashboard?from&to&pointId&productId&userId` | ADMIN/SUPERVISOR |
| Historial | `GET /history?pointId&from&to&productId&userId&taskType&status&kind` | todos (filtrado por alcance) |
| Informes | `GET /reports/:type?from&to&pointId&productId&userId&status&format=json\|pdf\|xlsx\|csv` | ADMIN/SUPERVISOR |
| Auditoría | `GET /audit` | ADMIN |
| Configuración | `GET/PUT /settings`, `POST /settings/logo` | ADMIN |

**Alcance por rol** (aplicado en el servicio, no solo en la UI): ADMIN ve todo; SUPERVISOR solo puntos donde está asociado o es encargado; WORKER solo sus tareas y sus registros.

## 5. Estructura de carpetas

```
lavado-control/
├─ docker-compose.yml, Dockerfile, package.json (npm workspaces)
├─ docs/ARQUITECTURA.md
├─ apps/api/
│  ├─ prisma/ schema.prisma · migrations/ · seed.ts
│  └─ src/
│     ├─ app.ts · server.ts · config.ts
│     ├─ lib/ prisma · auth · errors · audit · notifications · storage · scope · catalogs
│     ├─ middleware/ auth (requireAuth, requireRole) · validate · errorHandler
│     ├─ modules/<modulo>/ routes.ts · service.ts · schemas.ts
│     ├─ reports/ builders.ts (datos) · pdf.ts · excel.ts · csv.ts
│     └─ jobs/ dueTasks.ts
└─ apps/web/
   └─ src/
      ├─ api/ (cliente HTTP + hooks de TanStack Query)
      ├─ components/ (UI: Button, Modal, Table, Badge, Filters, PhotoUploader…)
      ├─ layouts/ AppLayout (sidebar admin / barra inferior móvil trabajador)
      ├─ context/ AuthContext
      ├─ pages/ dashboard · points · tasks · requirements · products · inventory ·
      │         incidents · users · reports · history · settings · worker · auth
      └─ lib/ (formatos, etiquetas de estados, permisos)
```

## 6. Flujo de usuarios

1. Login usuario/contraseña → cookie de sesión httpOnly (8 h).
2. Según el rol: **ADMIN** → Dashboard con menú completo; **SUPERVISOR** → Dashboard limitado a sus puntos; **TRABAJADOR** → Inicio con sus tareas (menú: Inicio, Mis tareas, Registrar llenado, Reportar incidencia, Historial).
3. Usuarios inactivos no pueden iniciar sesión; cambios de rol/contraseña quedan en auditoría.

## 7. Flujo de tareas

```
Requerimiento (PENDIENTE) ──convertir/asignar──▶ Tarea ASIGNADA ──trabajador inicia──▶ EN PROCESO
      │                                            │                                     │ registra llenado(s), fotos,
      │ (sincroniza estado)                        │ reasignar (ADMIN/SUP.) → notifica     │ observaciones, incidencias
      ▼                                            ▼                                     ▼
 ASIGNADO → EN_PROCESO → COMPLETADO           CANCELADA                           COMPLETADA (fecha fin)
```
- Tarea sin responsable = PENDIENTE; al asignar = ASIGNADA + notificación al trabajador.
- Tareas de tipo LLENADO exigen al menos un llenado registrado antes de completarse.
- Job periódico notifica tareas que vencen en < 24 h.

## 8. Flujo de inventario

1. ADMIN registra inventario inicial (movimiento ENTRADA) y compras (ENTRADA), salidas manuales (SALIDA) o correcciones (AJUSTE a un valor contado).
2. Al registrar un llenado → en la misma transacción: crea `Filling`, crea `InventoryMovement` tipo LLENADO con cantidad negativa y punto relacionado, actualiza `Product.currentStock`.
   Ej.: Espuma 500 L − 28 L (Lavado Norte) = 472 L.
3. Si `currentStock <= minStock` → notificación "Producto con stock bajo" a administradores y alerta en dashboard.

## 9. Flujo de generación de informes

1. Usuario elige tipo (consumo de productos, consumo por punto, tareas, por trabajador, incidencias, inventario, individual del punto, general) y filtros (fechas, punto, producto, usuario, estado).
2. El backend construye un **modelo de informe** común `{título, filtros, KPIs, secciones[{tabla, totales, gráfico}]}` aplicando el alcance del rol.
3. Ese mismo modelo se renderiza a: **JSON** (vista previa en pantalla), **PDF** (logo, nombre, fecha de generación, período, filtros, tablas, gráficos de barras, totales), **Excel** (una hoja por sección) o **CSV**.
