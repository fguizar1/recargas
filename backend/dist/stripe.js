import "dotenv/config";
import Stripe from "stripe";
const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey?.startsWith("sk_test_")) {
    throw new Error("Configura STRIPE_SECRET_KEY en modo de prueba");
}
export const stripe = new Stripe(secretKey);
//# sourceMappingURL=stripe.js.map