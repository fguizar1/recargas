import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import { authRouter } from "./auth.js";
import { paymentsRouter } from "./payments.js";
import { rechargesRouter } from "./recharges.js";
import { stripeWebhookHandler } from "./webhook.js";
const app = express();
const PORT = Number(process.env.PORT ?? 3001);
app.use(cors({
    origin: process.env.FRONTEND_URL
}));
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
app.use(express.json({ limit: "16kb" }));
app.use("/api/payments", paymentsRouter);
app.use("/api/recharges", rechargesRouter);
app.use("/api/auth", authRouter);
app.get("/api/health", (_req, res) => {
    res.json({
        status: "ok",
        message: "API de recargas funcionando"
    });
});
app.get("/api/health/ready", async (_req, res) => {
    try {
        await pool.query("SELECT 1");
        res.status(200).json({ status: "ready" });
    }
    catch (error) {
        console.error("PostgreSQL readiness check failed:", error);
        res.status(503).json({ status: "not_ready" });
    }
});
app.get("/api/carriers", async (_req, res) => {
    const result = await pool.query(`
    SELECT id, code, name
    FROM carriers
    WHERE is_active = TRUE
    ORDER BY name
  `);
    res.json(result.rows);
});
app.get("/api/carriers/:code/types", async (req, res) => {
    const { code } = req.params;
    const result = await pool.query(`
    SELECT t.id, t.code, t.name
    FROM recharge_types t
    JOIN carriers c ON t.carrier_id = c.id
    WHERE c.code = $1
      AND c.is_active = TRUE
    ORDER BY t.id
  `, [code]);
    res.json(result.rows);
});
app.get("/api/packages", async (req, res) => {
    const { carrier, type } = req.query;
    if (typeof carrier !== "string" ||
        typeof type !== "string") {
        res.status(400).json({
            error: "Debes indicar carrier y type"
        });
        return;
    }
    const result = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.price_cents,
      p.validity_days,
      p.validity_hours,
      p.benefits,
      t.code AS type,
      c.name AS carrier
    FROM recharge_packages p
    JOIN recharge_types t ON p.type_id = t.id
    JOIN carriers c ON t.carrier_id = c.id
    WHERE c.code = $1
      AND t.code = $2
      AND p.is_active = TRUE
      AND c.is_active = TRUE
    ORDER BY p.price_cents
  `, [carrier, type]);
    res.json(result.rows);
});
// Manejo de errores
const errorHandler = (error, _req, res, _next) => {
    console.error(error);
    const status = typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number" &&
        error.status >= 400 &&
        error.status < 500
        ? error.status
        : 500;
    res.status(status).json({
        error: status === 500
            ? "Error interno del servidor"
            : "Solicitud inválida"
    });
};
app.use(errorHandler);
/**
 * Iniciar el servidor después de validar la BD
 */
async function startServer() {
    try {
        await pool.query("SELECT 1");
        console.log("PostgreSQL conectado correctamente");
        app.listen(PORT, () => {
            console.log(`API disponible en http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error("No se pudo conectar a PostgreSQL:", error);
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=server.js.map