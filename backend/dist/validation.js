import { z } from "zod";
const positiveIntegerQuery = z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .refine(Number.isSafeInteger);
export const checkoutSchema = z.strictObject({
    requestId: z.uuid(),
    packageId: z.number().int().positive(),
    phone: z.string().regex(/^\d{10}$/)
});
export const paginationSchema = z.object({
    page: positiveIntegerQuery
        .refine((value) => value <= Math.floor(Number.MAX_SAFE_INTEGER / 50))
        .optional(),
    limit: positiveIntegerQuery
        .refine((value) => value <= 50)
        .optional()
});
export const rechargeIdSchema = z.uuid();
//# sourceMappingURL=validation.js.map