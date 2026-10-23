import { stripe } from "./stripe.js";
import { pool } from "./db.js";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret?.startsWith("whsec_")) {
    throw new Error("Configura STRIPE_WEBHOOK_SECRET");
}
export const stripeWebhookHandler = async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string" ||
        !Buffer.isBuffer(req.body)) {
        res.status(400).json({
            error: "Firma o contenido inválido"
        });
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    }
    catch {
        res.status(400).json({
            error: "Firma del webhook inválida"
        });
        return;
    }
    if (event.livemode) {
        res.status(400).json({
            error: "Evento no permitido"
        });
        return;
    }
    const supportedEvents = [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
        "checkout.session.expired"
    ];
    if (!supportedEvents.includes(event.type)) {
        res.status(200).json({ received: true });
        return;
    }
    const session = event.data.object;
    const rechargeId = session.metadata?.rechargeId;
    if (!rechargeId) {
        res.status(200).json({ received: true });
        return;
    }
    try {
        const result = await pool.query(`
        SELECT
          id,
          user_id,
          amount_cents,
          currency,
          stripe_session_id
        FROM recharges
        WHERE id = $1
        `, [rechargeId]);
        if (result.rows.length === 0) {
            throw new Error("Recarga no encontrada");
        }
        const recharge = result.rows[0];
        if (session.livemode ||
            session.mode !== "payment" ||
            session.client_reference_id !==
                String(recharge.user_id) ||
            session.amount_total !== recharge.amount_cents ||
            session.currency?.toLowerCase() !==
                recharge.currency.toLowerCase() ||
            (recharge.stripe_session_id !== null &&
                recharge.stripe_session_id !== session.id)) {
            throw new Error("Los datos del pago no coinciden con la recarga");
        }
        const paymentIntentId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        let newStatus = null;
        let failureReason = null;
        if (event.type === "checkout.session.completed" ||
            event.type ===
                "checkout.session.async_payment_succeeded") {
            if (session.payment_status === "paid") {
                newStatus = "paid";
            }
        }
        if (event.type ===
            "checkout.session.async_payment_failed") {
            newStatus = "failed";
            failureReason = "El pago no pudo completarse";
        }
        if (event.type === "checkout.session.expired") {
            newStatus = "failed";
            failureReason = "La sesión de pago expiró";
        }
        if (newStatus === "paid") {
            await pool.query(`
          UPDATE recharges
          SET
            status = 'paid',
            stripe_session_id = COALESCE(
              stripe_session_id, $2
            ),
            stripe_payment_intent_id = COALESCE(
              $3, stripe_payment_intent_id
            ),
            failure_reason = NULL,
            updated_at = NOW()
          WHERE id = $1
            AND status <> 'paid'
            AND (
              stripe_session_id IS NULL
              OR stripe_session_id = $2
            )
          `, [rechargeId, session.id, paymentIntentId]);
        }
        if (newStatus === "failed") {
            await pool.query(`
          UPDATE recharges
          SET
            status = 'failed',
            stripe_session_id = COALESCE(
              stripe_session_id, $2
            ),
            stripe_payment_intent_id = COALESCE(
              $3, stripe_payment_intent_id
            ),
            failure_reason = $4,
            updated_at = NOW()
          WHERE id = $1
            AND status = 'pending'
            AND (
              stripe_session_id IS NULL
              OR stripe_session_id = $2
            )
          `, [
                rechargeId,
                session.id,
                paymentIntentId,
                failureReason
            ]);
        }
        console.log(`Evento procesado: ${event.type} - ${session.id}`);
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error("Error procesando webhook:", error);
        res.status(500).json({
            error: "No se pudo procesar el webhook"
        });
    }
};
//# sourceMappingURL=webhook.js.map