const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

export interface User {
  id: number;
  email: string;
}

export interface Carrier {
  id: number;
  code: string;
  name: string;
}

export interface RechargeType {
  id: number;
  code: string;
  name: string;
}

export interface RechargePackage {
  id: number;
  name: string;
  price_cents: number;
  validity_days: number | null;
  validity_hours: number | null;
  benefits: string[];
  carrier: string;
  type: string;
}

export type RechargeStatus = "pending" | "paid" | "failed";

export interface Recharge {
  id: string;
  carrier: string;
  phone: string;
  amount_cents: number;
  currency: string;
  status: RechargeStatus;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  package_name: string | null;
  benefits: string[] | null;
  recharge_type: string | null;
}

export interface RechargeHistory {
  total: number;
  page: number;
  limit: number;
  recharges: Recharge[];
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

type Parser<T> = (data: unknown) => T;

function record(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("La API devolvió una respuesta con formato inválido");
  }
  return data as Record<string, unknown>;
}

function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string") {
    throw new Error(`La API devolvió un campo inválido: ${key}`);
  }
  return value;
}

function integerField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`La API devolvió un campo inválido: ${key}`);
  }
  return value;
}

function nullableStringField(
  data: Record<string, unknown>,
  key: string
): string | null {
  const value = data[key];
  if (value !== null && typeof value !== "string") {
    throw new Error(`La API devolvió un campo inválido: ${key}`);
  }
  return value;
}

function stringArrayField(
  data: Record<string, unknown>,
  key: string
): string[] {
  const value = data[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`La API devolvió un campo inválido: ${key}`);
  }
  return value;
}

function nullableIntegerField(
  data: Record<string, unknown>,
  key: string
): number | null {
  const value = data[key];
  if (
    value !== null &&
    (typeof value !== "number" || !Number.isSafeInteger(value))
  ) {
    throw new Error(`La API devolvió un campo inválido: ${key}`);
  }
  return value;
}

function parseUser(value: unknown): User {
  const data = record(value);
  return {
    id: integerField(data, "id"),
    email: stringField(data, "email")
  };
}

function parseCarrier(value: unknown): Carrier {
  const data = record(value);
  return {
    id: integerField(data, "id"),
    code: stringField(data, "code"),
    name: stringField(data, "name")
  };
}

function parseRechargeType(value: unknown): RechargeType {
  const data = record(value);
  return {
    id: integerField(data, "id"),
    code: stringField(data, "code"),
    name: stringField(data, "name")
  };
}

function parseRechargePackage(value: unknown): RechargePackage {
  const data = record(value);
  return {
    id: integerField(data, "id"),
    name: stringField(data, "name"),
    price_cents: integerField(data, "price_cents"),
    validity_days: nullableIntegerField(data, "validity_days"),
    validity_hours: nullableIntegerField(data, "validity_hours"),
    benefits: stringArrayField(data, "benefits"),
    carrier: stringField(data, "carrier"),
    type: stringField(data, "type")
  };
}

function parseRecharge(value: unknown): Recharge {
  const data = record(value);
  const status = stringField(data, "status");
  if (status !== "pending" && status !== "paid" && status !== "failed") {
    throw new Error("La API devolvió un estado de recarga inválido");
  }

  const benefits = data.benefits;
  if (
    benefits !== null &&
    benefits !== undefined &&
    (!Array.isArray(benefits) ||
      !benefits.every((item) => typeof item === "string"))
  ) {
    throw new Error("La API devolvió beneficios con formato inválido");
  }

  return {
    id: stringField(data, "id"),
    carrier: stringField(data, "carrier"),
    phone: stringField(data, "phone"),
    amount_cents: integerField(data, "amount_cents"),
    currency: stringField(data, "currency"),
    status,
    failure_reason: nullableStringField(data, "failure_reason"),
    created_at: stringField(data, "created_at"),
    updated_at: stringField(data, "updated_at"),
    package_name: nullableStringField(data, "package_name"),
    benefits: (benefits as string[] | null | undefined) ?? null,
    recharge_type: nullableStringField(data, "recharge_type")
  };
}

function parseArray<T>(parseItem: Parser<T>): Parser<T[]> {
  return (value) => {
    if (!Array.isArray(value)) {
      throw new Error("La API devolvió una lista con formato inválido");
    }
    return value.map(parseItem);
  };
}

async function request<T>(
  path: string,
  parse: Parser<T>,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      "No se pudo conectar con la API. Verifica que el backend esté encendido."
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(`Error HTTP ${response.status}`, response.status);
    }
    throw new Error("La API devolvió una respuesta JSON inválida");
  }

  if (!response.ok) {
    const body = recordOrNull(data);
    const message =
      typeof body?.error === "string"
        ? body.error
        : `Error HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return parse(data);
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseUserResponse(value: unknown): { user: User } {
  const data = record(value);
  return { user: parseUser(data.user) };
}

export const api = {
  register: (email: string, password: string) =>
    request(
      "/auth/register",
      (value) => {
        const data = record(value);
        return {
          message: stringField(data, "message"),
          user: parseUser(data.user)
        };
      },
      { method: "POST", body: JSON.stringify({ email, password }) }
    ),

  login: (email: string, password: string) =>
    request(
      "/auth/login",
      (value) => {
        const data = record(value);
        return {
          token: stringField(data, "token"),
          user: parseUser(data.user)
        };
      },
      { method: "POST", body: JSON.stringify({ email, password }) }
    ),

  me: (token: string) => request("/auth/me", parseUserResponse, {}, token),

  carriers: () => request("/carriers", parseArray(parseCarrier)),

  types: (carrierCode: string) =>
    request(
      `/carriers/${encodeURIComponent(carrierCode)}/types`,
      parseArray(parseRechargeType)
    ),

  packages: (carrierCode: string, typeCode: string) => {
    const query = new URLSearchParams({
      carrier: carrierCode,
      type: typeCode
    });
    return request(`/packages?${query}`, parseArray(parseRechargePackage));
  },

  checkout: (token: string, packageId: number, phone: string, requestId: string) =>
    request(
      "/payments/checkout",
      (value) => {
        const data = record(value);
        return {
          rechargeId: stringField(data, "rechargeId"),
          sessionId: stringField(data, "sessionId"),
          url: stringField(data, "url"),
          status: stringField(data, "status")
        };
      },
      {
        method: "POST",
        body: JSON.stringify({ requestId, packageId, phone })
      },
      token
    ),

  history: (token: string, page = 1, limit = 50) =>
    request<RechargeHistory>(
      `/recharges?${new URLSearchParams({
        page: String(page),
        limit: String(limit)
      })}`,
      (value) => {
        const data = record(value);
        if (!Array.isArray(data.recharges)) {
          throw new Error("La API devolvió un historial con formato inválido");
        }
        return {
          total: integerField(data, "total"),
          page: integerField(data, "page"),
          limit: integerField(data, "limit"),
          recharges: data.recharges.map(parseRecharge)
        };
      },
      {},
      token
    )
};
