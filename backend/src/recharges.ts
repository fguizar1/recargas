import { Router } from "express";
import { z } from "zod";

import { pool } from "./db.js";
import { requireAuth } from "./auth.js";
import { paginationSchema, rechargeIdSchema } from "./validation.js";

export const rechargesRouter = Router();

// GET /api/recharges
rechargesRouter.get(
  "/",
  requireAuth,
  async (req, res) => {
    const validation = paginationSchema.safeParse(req.query);

    if (!validation.success) {
      res.status(400).json({
        error: "Parámetros de paginación inválidos",
        details: validation.error.issues
      });
      return;
    }

    const userId = res.locals.userId as number;
    const page = validation.data.page ?? 1;
    const limit = validation.data.limit ?? 50;
    const offset = (page - 1) * limit;

    const [countResult, result] = await Promise.all([
      pool.query(
        `
        SELECT COUNT(*) AS total
        FROM recharges
        WHERE user_id = $1
        `,
        [userId]
      ),
      pool.query(
        `
        SELECT
          r.id,
          r.carrier,
          r.phone,
          r.amount_cents,
          r.currency,
          r.status,
          r.failure_reason,
          r.created_at,
          r.updated_at,
          p.name AS package_name,
          p.benefits,
          t.name AS recharge_type
        FROM recharges r
        LEFT JOIN recharge_packages p
          ON r.package_id = p.id
        LEFT JOIN recharge_types t
          ON p.type_id = t.id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC
        LIMIT $2
        OFFSET $3
        `,
        [userId, limit, offset]
      )
    ]);

    res.status(200).json({
      total: Number(countResult.rows[0].total),
      page,
      limit,
      recharges: result.rows
    });
  }
);

// GET /api/recharges/:id
rechargesRouter.get(
  "/:id",
  requireAuth,
  async (req, res) => {
    const rechargeId = req.params.id;
    if (!rechargeIdSchema.safeParse(rechargeId).success) {
      res.status(400).json({
        error: "Identificador de recarga inválido"
      });
      return;
    }

    const userId = res.locals.userId as number;

    const result = await pool.query(
      `
      SELECT
        r.id,
        r.carrier,
        r.phone,
        r.amount_cents,
        r.currency,
        r.status,
        r.failure_reason,
        r.created_at,
        r.updated_at,
        p.name AS package_name,
        p.benefits
      FROM recharges r
      LEFT JOIN recharge_packages p
        ON r.package_id = p.id
      WHERE r.id = $1
        AND r.user_id = $2
      `,
      [rechargeId, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: "Recarga no encontrada"
      });
      return;
    }

    res.status(200).json({
      recharge: result.rows[0]
    });
  }
);