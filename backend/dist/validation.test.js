import assert from "node:assert/strict";
import test from "node:test";
import { checkoutSchema, paginationSchema, rechargeIdSchema } from "./validation.js";
test("checkout requires a UUID, positive package and ten-digit phone", () => {
    const validCheckout = {
        requestId: "7f3da5fc-a433-4f6d-9f9c-4f9de57db2f7",
        packageId: 1,
        phone: "3121234567"
    };
    assert.equal(checkoutSchema.safeParse(validCheckout).success, true);
    assert.equal(checkoutSchema.safeParse({ ...validCheckout, phone: "123" }).success, false);
    assert.equal(checkoutSchema.safeParse({ ...validCheckout, packageId: 0 }).success, false);
    assert.equal(checkoutSchema.safeParse({
        ...validCheckout,
        amount_cents: 1
    }).success, false);
});
test("pagination defaults are supplied by the route and invalid bounds are rejected", () => {
    assert.deepEqual(paginationSchema.parse({ page: "2", limit: "10" }), {
        page: 2,
        limit: 10
    });
    assert.equal(paginationSchema.safeParse({ page: "0" }).success, false);
    assert.equal(paginationSchema.safeParse({ limit: "51" }).success, false);
    assert.equal(paginationSchema.safeParse({ page: "9007199254740991" }).success, false);
});
test("recharge detail IDs must be valid UUIDs", () => {
    assert.equal(rechargeIdSchema.safeParse("7f3da5fc-a433-4f6d-9f9c-4f9de57db2f7").success, true);
    assert.equal(rechargeIdSchema.safeParse("not-a-uuid").success, false);
});
//# sourceMappingURL=validation.test.js.map