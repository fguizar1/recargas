import { rateLimit } from "express-rate-limit";
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        error: "Demasiados intentos de inicio de sesión",
        message: "Intenta nuevamente más tarde"
    }
});
export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        error: "Demasiados intentos de registro",
        message: "Intenta nuevamente más tarde"
    }
});
//# sourceMappingURL=limiters.js.map