import { Router } from "express";

import { pool } from "./db.js";
import { stripe } from "./stripe.js";
import { requireAuth } from "./auth.js";
import { checkoutSchema } from "./validation.js";

import Stripe from "stripe";

export const paymentsRouter = Router();

paymentsRouter.post(
  "/checkout",
  requireAuth,
  async (req, res) => {

    const validation = checkoutSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: "Datos de recarga inválidos",
        details: validation.error.issues
      });
      return;
    }

    const { requestId, packageId, phone } = validation.data;

    const userId = res.locals.userId as number;


    const result = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.price_cents,
        c.name AS carrier
      FROM recharge_packages p
      JOIN recharge_types t ON t.id = p.type_id
      JOIN carriers c ON c.id = t.carrier_id
      WHERE p.id = $1
        AND p.is_active = TRUE
        AND c.is_active = TRUE
      `,
      [packageId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: "Paquete no encontrado"
      });
      return;
    }

    const pkg = result.rows[0];
    const rechargeId = requestId;

    const insertResult = await pool.query(
      `
      INSERT INTO recharges (
        id,
        user_id,
        package_id,
        carrier,
        phone,
        amount_cents,
        currency,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        rechargeId,
        userId,
        pkg.id,
        pkg.carrier,
        phone,
        pkg.price_cents,
        "mxn",
        "pending"
      ]
    );
    const createdNewRecharge = insertResult.rowCount === 1;

    const existingRecharge = await pool.query(
      `
      SELECT
        user_id,
        package_id,
        phone,
        status,
        stripe_session_id
      FROM recharges
      WHERE id = $1
      `,
      [rechargeId]
    );

    if (existingRecharge.rows.length === 0) {
      throw new Error("No se pudo recuperar la recarga registrada");
    }

    const recharge = existingRecharge.rows[0];

    if (
      String(recharge.user_id) !== String(userId) ||
      recharge.package_id !== pkg.id ||
      recharge.phone !== phone
    ) {
      res.status(409).json({
        error: "El identificador de intento ya fue utilizado"
      });
      return;
    }

    if (recharge.status !== "pending") {
      res.status(409).json({
        error: "Esta recarga ya no está pendiente. Consulta tu historial."
      });
      return;
    }

    const session = recharge.stripe_session_id
      ? await stripe.checkout.sessions.retrieve(
          recharge.stripe_session_id
        )
      : await stripe.checkout.sessions.create(
          {
            mode: "payment",

            line_items: [
              {
                price_data: {
                  currency: "mxn",
                  product_data: {
                    name: `${pkg.carrier} - ${pkg.name}`
                  },
                  unit_amount: pkg.price_cents
                },
                quantity: 1
              },
            ],

            success_url:
              `${process.env.FRONTEND_URL}/?payment=success&rechargeId=${encodeURIComponent(rechargeId)}`,

            cancel_url:
              `${process.env.FRONTEND_URL}/?payment=cancelled&rechargeId=${encodeURIComponent(rechargeId)}`,

            client_reference_id: String(userId),

            metadata: {
              rechargeId,
              userId: String(userId),
              packageId: String(pkg.id)
            }
          },
          {
            idempotencyKey: rechargeId
          }
        );

    if (!recharge.stripe_session_id) {
      const updated = await pool.query(
        `
        UPDATE recharges
        SET
          stripe_session_id = $1,
          updated_at = NOW()
        WHERE id = $2
          AND status = 'pending'
          AND (
            stripe_session_id IS NULL
            OR stripe_session_id = $1
          )
        `,
        [session.id, rechargeId]
      );

      if (updated.rowCount !== 1) {
        throw new Error(
          "No se pudo asociar la sesión de Stripe a la recarga"
        );
      }
    }

    if (session.status === "expired") {
      res.status(409).json({
        error: "La sesión de pago ya no está disponible porque expiró. Crea un nuevo intento."
      });
      return;
    }

    if (!session.url) {
      res.status(409).json({
        error: "La sesión de pago ya se completó o no está disponible. Consulta tu historial."
      });
      return;
    }

    res.status(createdNewRecharge ? 201 : 200).json({
      message: "Sesión de pago creada",
      rechargeId,
      sessionId: session.id,
      url: session.url,
      status: "pending"
    });
  }
);