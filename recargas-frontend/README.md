# Recargas — React + TypeScript + PostgreSQL + Stripe

Aplicación de demostración para consultar compañías y paquetes, registrar usuarios y simular pagos con Stripe Checkout en modo de prueba. **No aplica saldo telefónico real**: el estado `paid` solo significa que Stripe confirmó el pago de prueba.

## Tecnologías

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Base de datos: PostgreSQL
- Autenticación: JWT y bcryptjs
- Pagos: Stripe Checkout y webhook firmado
- Pruebas automatizadas: validación de entradas del backend con `node:test`

## Requisitos

- Node.js 24 o compatible con las dependencias del proyecto y npm.
- PostgreSQL y `psql`.
- Una cuenta de Stripe configurada en modo de prueba.
- Stripe CLI para probar webhooks localmente.

## Estructura

```text
Practica/
├── backend/
│   ├── src/              # API Express y pruebas
│   ├── sql/
│   │   ├── migrations/   # Esquema versionado
│   │   └── seed/         # Catálogo ficticio de demostración
│   ├── .env              # Credenciales privadas (no subir)
│   └── package.json
└── recargas-frontend/
    ├── src/              # Aplicación React
    ├── .env              # Variables públicas de Vite (no subir)
    └── package.json
```

## Configurar PostgreSQL

Crea una base nueva llamada `recargas` y, desde la raíz del repositorio, aplica el esquema y los datos de demostración:

```bash
createdb -U postgres recargas
psql -h localhost -U postgres -d recargas -f backend/sql/migrations/001_initial_schema.sql
psql -h localhost -U postgres -d recargas -f backend/sql/seed/001_demo_catalog.sql
```

La migración inicial está destinada a una base nueva. Si ya tienes tablas o datos, haz un respaldo y compara los esquemas antes de aplicar cualquier migración; esta versión no transforma automáticamente instalaciones existentes. El catálogo de ejemplo incluye precios y beneficios ficticios para probar la aplicación, no representa ofertas reales.

## Variables de entorno

Crea `recargas-frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:3001/api
```

Crea `backend/.env`:

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

No subas `.env`, credenciales, tokens ni claves secretas al repositorio. Las variables `VITE_` se exponen en el navegador; nunca guardes ahí secretos de backend. `STRIPE_SECRET_KEY` debe ser de prueba y `STRIPE_WEBHOOK_SECRET` es el secreto que proporciona Stripe CLI.

## Instalar y ejecutar

**Terminal 1 — Backend**

```bash
cd backend
npm install
npm run dev
```

Servidor esperado: `http://localhost:3001`.

**Terminal 2 — Frontend**

```bash
cd recargas-frontend
npm install
npm run dev
```

Frontend esperado: `http://localhost:5173`. Si Vite elige otro puerto, ajusta `FRONTEND_URL` y reinicia el backend.

**Terminal 3 — Webhooks Stripe CLI**

```bash
stripe login
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to http://localhost:3001/api/payments/webhook
```

Copia el valor `whsec_...` mostrado por Stripe CLI a `backend/.env`, reinicia el backend y mantén la CLI activa durante las pruebas.

## Validaciones

Ejecuta desde la raíz:

```bash
npm --prefix backend test
npm --prefix backend run build
npm --prefix recargas-frontend run lint
npm --prefix recargas-frontend run build
```

Las pruebas automatizadas cubren validación de Checkout, límites de paginación e identificadores UUID. El flujo con Stripe requiere las pruebas manuales descritas abajo.

## Endpoints

| Método | Ruta | Autenticación |
|---|---|---|
| GET | `/api/health` | No; disponibilidad de la API |
| GET | `/api/health/ready` | No; comprueba PostgreSQL |
| GET | `/api/carriers` | No |
| GET | `/api/carriers/:code/types` | No |
| GET | `/api/packages?carrier=telcel&type=paquetes` | No |
| POST | `/api/auth/register` | No |
| POST | `/api/auth/login` | No |
| GET | `/api/auth/me` | JWT Bearer |
| POST | `/api/payments/checkout` | JWT Bearer |
| POST | `/api/payments/webhook` | Firma de Stripe |
| GET | `/api/recharges?page=1&limit=10` | JWT Bearer |
| GET | `/api/recharges/:id` | JWT Bearer |

El historial acepta `page` (predeterminado `1`) y `limit` (predeterminado `50`, máximo `50`). La respuesta incluye `total`, `page`, `limit` y `recharges`. El JWT expira a los **10 minutos**; inicia sesión de nuevo para obtener uno nuevo.

### Crear un Checkout

Usa un UUID nuevo al iniciar una operación; reutiliza el mismo UUID al reintentar esa misma solicitud:

```json
{
  "requestId": "7f3da5fc-a433-4f6d-9f9c-4f9de57db2f7",
  "packageId": 1,
  "phone": "3121234567"
}
```

El frontend conserva temporalmente el identificador de intento en `sessionStorage`, sin almacenar el teléfono, para reutilizarlo al reintentar o volver de Stripe en la misma pestaña. Si la sesión ya expiró, el backend responde `409`; el siguiente intento generará una recarga nueva. El backend determina el importe desde PostgreSQL, no desde el cliente. Solo el webhook firmado confirma el pago. Un `paid` de Stripe no indica que se haya enviado saldo a una línea.

## Pruebas manuales

1. Comprueba que `GET /api/health` responda `200` y `GET /api/health/ready` indique si PostgreSQL está disponible.
2. Consulta `GET /api/carriers` y confirma que devuelve compañías activas.
3. Registra un usuario e inicia sesión; usa el JWT como Bearer en Postman.
4. Crea un Checkout con un paquete existente y comprueba que la recarga quede `pending`.
5. Completa el pago con una tarjeta de prueba oficial de Stripe.
6. Comprueba que el webhook responda `200` y que PostgreSQL actualice el estado.
7. Repite el POST con el mismo `requestId`: debe reutilizar la recarga/sesión, no crear otra.
8. Prueba el historial paginado y verifica que solo muestre recargas del usuario autenticado.
9. Comprueba que se toleren webhooks duplicados y se manejen los fallos de pago.

## Seguridad y despliegue

Esta aplicación es para aprendizaje y pruebas; **no está lista para producción**. Antes de desplegarla hacen falta revisión de seguridad, limitación de intentos compartida/persistente, sesiones seguras, controles CSRF si se usan cookies, observabilidad, HTTPS, política CORS de producción y conciliación de pagos incompletos. Protege los números telefónicos y nunca registres credenciales. Verifica cualquier precio o beneficio real con el proveedor antes de ofrecer recargas comerciales.
