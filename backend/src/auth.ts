import { Router, type RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { z } from "zod";
import { pool } from "./db.js";
import { loginLimiter, registerLimiter } from "./limiters.js";


export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET debe tener al menos 32 caracteres"
  );
}

const tokenOptions = {
  issuer: "recargas-api",
  audience: "recargas-app"
};

const credentialsSchema = z.object({
  email: z.email().max(254).trim().toLowerCase(),
  password: z.string().min(8).max(72)
});

// POST /api/auth/register
authRouter.post("/register", registerLimiter, async (req, res) => {
  const validation = credentialsSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({
      error: "Datos de registro inválidos",
      details: validation.error.issues
    });
    return;
  }

  const { email, password } = validation.data;

  if (Buffer.byteLength(password, "utf8") > 72) {
    res.status(400).json({
      error: "La contraseña es demasiado larga"
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, passwordHash]
    );

    res.status(201).json({
      message: "Usuario registrado correctamente",
      user: result.rows[0]
    });
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({
        error: "El correo ya está registrado"
      });
      return;
    }

    throw error;
  }
});

// POST /api/auth/login
authRouter.post("/login", loginLimiter, async (req, res) => {
  const validation = credentialsSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({
      error: "Correo o contraseña con formato inválido"
    });
    return;
  }

  const { email, password } = validation.data;

  if (Buffer.byteLength(password, "utf8") > 72) {
    res.status(400).json({
      error: "Credenciales inválidas"
    });
    return;
  }

  const result = await pool.query(
    `SELECT id, email, password_hash
     FROM users
     WHERE LOWER(email) = $1`,
    [email]
  );

  const user = result.rows[0];

  if (!user) {
    res.status(401).json({
      error: "Correo o contraseña incorrectos"
    });
    return;
  }

  const validPassword = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!validPassword) {
    res.status(401).json({
      error: "Correo o contraseña incorrectos"
    });
    return;
  }

  const token = jwt.sign(
    {},
    JWT_SECRET,
    {
      ...tokenOptions,
      subject: String(user.id),
      expiresIn: "10m",
      algorithm: "HS256"
    }
  );

  res.status(200).json({
    message: "Inicio de sesión exitoso",
    token,
    user: {
      id: user.id,
      email: user.email
    }
  });
});


export const requireAuth: RequestHandler = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Token no proporcionado"
    });
    return;
  }

  const token = authorization.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      ...tokenOptions,
      algorithms: ["HS256"]
    });

    if (
      typeof decoded === "string" ||
      !Number.isSafeInteger(Number(decoded.sub)) ||
      Number(decoded.sub) <= 0
    ) {
      res.status(401).json({
        error: "Token inválido"
      });
      return;
    }

    res.locals.userId = Number(decoded.sub);
    next();
  } catch {
    res.status(401).json({
      error: "Token inválido o expirado"
    });
  }
};

// GET /api/auth/me
authRouter.get("/me", requireAuth, async (_req, res) => {
  const userId = res.locals.userId as number;

  const result = await pool.query(
    `SELECT id, email, created_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    res.status(401).json({
      error: "Usuario no disponible"
    });
    return;
  }

  res.status(200).json({
    user: result.rows[0]
  });
});
