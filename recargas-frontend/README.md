# Recargas — React + TypeScript + PostgreSQL + Stripe

Aplicación **de demostración** para seleccionar operadoras, consultar paquetes, registrar usuarios y simular pagos de recargas mediante Stripe Checkout en modo de prueba. **No acredita saldo telefónico real**; el estado `paid` significa que Stripe confirmó el pago de prueba.

## Tecnologías

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Base de datos: PostgreSQL, base `recargas`
- Autenticación (implementación local): JWT y bcryptjs
- Pagos: Stripe Checkout + webhook firmado
- Pruebas: Postman y Stripe CLI

## Requisitos

- Node.js compatible con las versiones de las dependencias del repositorio (se probó durante el desarrollo con Node 24).
- npm y PostgreSQL instalados.
- Una cuenta de Stripe configurada en modo de prueba.
- Las tablas `users`, `recharges`, `carriers`, `recharge_types` y `recharge_packages` creadas en PostgreSQL (utilizar los scripts SQL o migraciones propias del proyecto).

## Estructura

```text
Practica/
├── src/                  # React
├── index.html
├── .env                  # Variables públicas de Vite (no subir)
├── backend/
│   ├── src/              # API Express
│   ├── sql/              # SQL de catálogo si existe
│   ├── .env              # Credenciales privadas (no subir)
│   └── package.json
└── package.json
```

## Configurar PostgreSQL

Crea o utiliza la base existente `recargas`. Aplica los scripts SQL del esquema y del catálogo en la misma base, respetando el orden de las relaciones. Si ya hay datos, evita reinicializar tablas o aplicar scripts destructivos sin respaldo.

## Variables de entorno

Crea `Practica/.env` (frontend):

```dotenv
VITE_API_URL=http://localhost:3001/api
```

Crea `Practica/backend/.env` (backend):

```dotenv
PORT=3001
FRONTEND_URL=http://localhost:5173
DB_HOST=localhost
DB_PORT=5432
DB_NAME=recargas
DB_USER=postgres
DB_PASSWORD=REEMPLAZAR_LOCALMENTE
JWT_SECRET=REEMPLAZAR_CON_VALOR_ALEATORIO_LARGO
STRIPE_SECRET_KEY=sk_test_REEMPLAZAR
STRIPE_WEBHOOK_SECRET=whsec_REEMPLAZAR
```

No subas `.env`, credenciales, tokens ni claves secretas al repositorio. Sólo las variables `VITE_` deben usarse en el frontend, porque se exponen al navegador.

## Instalación y ejecución

**Terminal 1 — Backend**

```bash
cd backend
npm install
npm run dev
```

Servidor esperado: `http://localhost:3001`.

**Terminal 2 — Frontend** (desde la raíz de `Practica`)

```bash
npm install
npm run dev
```

Frontend esperado: `http://localhost:5173` (confirma el puerto mostrado por Vite y actualiza `FRONTEND_URL` si cambia).

**Terminal 3 — Webhooks Stripe CLI**

```bash
stripe login
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to http://localhost:3001/api/payments/webhook
```

Copia el secreto `whsec_...` que te muestre Stripe CLI a `backend/.env`, reinicia el backend y mantén la CLI activa durante las pruebas. La clave `whsec_` no es la clave `sk_test_`.

## Endpoints

| Método | Ruta | Requiere autenticación |
|---|---|---|
| GET | `/api/health` | No |
| GET | `/api/carriers` | No |
| GET | `/api/carriers/:code/types` | No |
| GET | `/api/packages?carrier=telcel&type=paquetes` | No |
| POST | `/api/auth/register` | No |
| POST | `/api/auth/login` | No |
| GET | `/api/auth/me` | JWT Bearer (versión local) |
| POST | `/api/payments/checkout` | JWT Bearer (versión local) |
| POST | `/api/payments/webhook` | Firma de Stripe, no JWT |
| GET | `/api/recharges?page=1&limit=10` | JWT Bearer (si se activó paginación) |
| GET | `/api/recharges/:id` | JWT Bearer |

El historial acepta `page` (predeterminado `1`) y `limit` (predeterminado `50`, máximo `50`). La respuesta incluye `total` para todas las recargas del usuario, además de la página y el límite aplicados.

Ejemplo de body para crear Checkout (usa un UUID nuevo para cada intento; reutilízalo si necesitas repetir la misma solicitud):

```json
{"requestId":"7f3da5fc-a433-4f6d-9f9c-4f9de57db2f7","packageId":1,"phone":"3121234567"}
```

El frontend genera y reutiliza el UUID mientras se reintenta el mismo intento de pago. El backend lo usa como ID de recarga y clave de idempotencia de Stripe, evitando crear otra sesión para la misma solicitud. El backend obtiene el precio de PostgreSQL y devuelve la URL de Checkout. **No confíes en un importe enviado por el frontend**. El webhook firmado es quien confirma el pago y actualiza la operación. El estado `paid` no significa que una compañía telefónica haya enviado saldo.

## Pruebas manuales

1. GET `/api/health` responde 200.
2. GET `/api/carriers` devuelve compañías activas.
3. Registra un usuario y haz login; usa el JWT en Postman.
4. Crea un Checkout con un paquete existente: debe registrarse `pending`.
5. Completa el pago en Stripe **modo prueba** con tarjeta de test oficial.
6. Comprueba que el webhook responda 200 y que PostgreSQL refleje `paid`.
7. Repite el mismo POST de Checkout con el mismo `requestId`: debe devolverte la misma sesión, sin crear otra recarga.
8. GET `/api/recharges?page=1&limit=10` devuelve sólo las recargas del usuario autenticado e informa el total; comprueba `page=2` si hay más de 10.
9. Comprueba que no se dupliquen confirmaciones de webhook, así como fallos de Stripe e intentos de login excesivos.

## Consideraciones de seguridad y despliegue

- Implementación orientada a aprendizaje y pruebas; **no está lista para producción** sin revisión de seguridad, límites de intentos persistentes, gestión segura de sesiones, defensa CSRF con cookies, observabilidad, despliegue HTTPS y recuperación de pagos incompletos.
- No modificar a `paid` una recarga sin verificación con Stripe.
- Proteger datos personales como números telefónicos y evitar registrar credenciales en logs.
- Las ofertas del catálogo de demostración son ficticias: comprobar precios y beneficios reales con el proveedor antes de un lanzamiento comercial.
