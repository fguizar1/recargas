const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

export async function getCarriers() {
  try {
    const response = await fetch(`${API_URL}/carriers`);

    if (!response.ok) {
      throw new Error(
        `Error al obtener compañías: ${response.status}`
      );
    }

    return await response.json();

  } catch (error) {
    console.error("Error consultando compañías:", error);
    throw error;
  }
}

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
  benefits: string[];
  carrier: string;
  type: string;
}

export interface Recharge {
  id: string;
  carrier: string;
  phone: string;
  amount_cents: number;
  currency: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
  package_name: string | null;
  recharge_type: string | null;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error("No se pudo conectar con la API. Verifica que el backend esté encendido.");
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error : `Error HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  register: (email: string, password: string) =>
    request<{ message: string; user: User }>("/auth/register", {
      method: "POST", body: JSON.stringify({ email, password })
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password })
    }),

  me: (token: string) => request<{ user: User }>("/auth/me", {}, token),

  carriers: () => request<Carrier[]>("/carriers"),

  types: (carrierCode: string) =>
    request<RechargeType[]>(`/carriers/${encodeURIComponent(carrierCode)}/types`),

  packages: (carrierCode: string, typeCode: string) =>
    request<RechargePackage[]>(
      `/packages?carrier=${encodeURIComponent(carrierCode)}&type=${encodeURIComponent(typeCode)}`
    ),

  checkout: (token: string, packageId: number, phone: string, requestId: string) =>
    request<{ rechargeId: string; url: string; status: string }>(
      "/payments/checkout",
      { method: "POST", body: JSON.stringify({ requestId, packageId, phone }) },
      token
    ),

  history: (token: string, page = 1, limit = 50) =>
    request<{ total: number; page: number; limit: number; recharges: Recharge[] }>(
      `/recharges?page=${page}&limit=${limit}`,
      {},
      token
    )
};
