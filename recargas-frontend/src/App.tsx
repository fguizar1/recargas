import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type Carrier, type Recharge, type RechargePackage, type RechargeType, type User } from "./api";
import "./App.css";
import { getCarriers } from "./api";

type Page = "catalog" | "history";
type AuthMode = "login" | "register";
const HISTORY_PAGE_SIZE = 10;

const currency = (cents: number) => new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN"
}).format(cents / 100);

const carrierColors: Record<string, string> = {
  telcel: "#086bc1", movistar: "#21a67c", att: "#186ab6"
};

const statusLabels: Record<string, string> = {
  pending: "Pendiente", paid: "Pagada", failed: "Fallida"
};

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("recargas_token") ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>(() =>
    new URLSearchParams(window.location.search).get("payment") === "success" ? "history" : "catalog"
  );
  const paymentReturn = new URLSearchParams(window.location.search).get("payment");

  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [carrierCode, setCarrierCode] = useState("");
  const [types, setTypes] = useState<RechargeType[]>([]);
  const [typeCode, setTypeCode] = useState("");
  const [packages, setPackages] = useState<RechargePackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<RechargePackage | null>(null);
  const [phone, setPhone] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const checkoutAttempt = useRef<{ fingerprint: string; requestId: string } | null>(null);

  const [history, setHistory] = useState<Recharge[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRefresh, setHistoryRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    getCarriers().then((items) => {
      if (!active) return;
      setCarriers(items);
      setCarrierCode(items[0]?.code ?? "");
    }).catch((error: Error) => {
      if (active) setCatalogError(error.message);
    }).finally(() => {
      if (active) setCatalogLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!carrierCode) return;
    let active = true;
    api.types(carrierCode).then((items) => {
      if (!active) return;
      setTypes(items);
      setTypeCode(items[0]?.code ?? "");
      setCatalogError("");
    }).catch((error: Error) => {
      if (active) setCatalogError(error.message);
    });
    return () => { active = false; };
  }, [carrierCode]);

  useEffect(() => {
    if (!carrierCode || !typeCode) return;
    let active = true;
    api.packages(carrierCode, typeCode).then((items) => {
      if (active) setPackages(items);
    }).catch((error: Error) => {
      if (active) setCatalogError(error.message);
    }).finally(() => {
      if (active) setPackagesLoading(false);
    });
    return () => { active = false; };
  }, [carrierCode, typeCode]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api.me(token).then(({ user: currentUser }) => {
      if (active) setUser(currentUser);
    }).catch(() => {
      if (!active) return;
      sessionStorage.removeItem("recargas_token");
      setToken("");
      setUser(null);
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (page !== "history" || !token) return;
    let active = true;
    api.history(token, historyPage, HISTORY_PAGE_SIZE).then(({ recharges, total }) => {
      if (active) {
        setHistory(recharges);
        setHistoryTotal(total);
        setHistoryError("");
      }
    }).catch((error: Error) => {
      if (active) setHistoryError(error.message);
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => { active = false; };
  }, [page, token, historyPage, historyRefresh]);

  function chooseCarrier(code: string) {
    setCarrierCode(code);
    setTypes([]);
    setTypeCode("");
    setPackages([]);
    setSelectedPackage(null);
    setCheckoutError("");
  }

  function chooseType(code: string) {
    setTypeCode(code);
    setPackages([]);
    setSelectedPackage(null);
    setCheckoutError("");
    setPackagesLoading(true);
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      if (authMode === "register") await api.register(email, password);
      const response = await api.login(email, password);
      sessionStorage.setItem("recargas_token", response.token);
      setToken(response.token);
      setUser(response.user);
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "No se pudo iniciar sesión");
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    sessionStorage.removeItem("recargas_token");
    setToken("");
    setUser(null);
    setHistory([]);
    setHistoryTotal(0);
    setHistoryPage(1);
    setPage("catalog");
  }

  async function pay() {
    if (!selectedPackage || !token || !/^\d{10}$/.test(phone)) return;
    setCheckoutError("");
    setCheckoutLoading(true);
    try {
      const fingerprint = `${token}:${selectedPackage.id}:${phone}`;
      if (checkoutAttempt.current?.fingerprint !== fingerprint) {
        checkoutAttempt.current = {
          fingerprint,
          requestId: crypto.randomUUID()
        };
      }
      const session = await api.checkout(
        token,
        selectedPackage.id,
        phone,
        checkoutAttempt.current.requestId
      );
      if (!session.url) throw new Error("Stripe no devolvió una URL de pago");
      window.location.assign(session.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Error al crear el pago");
      setCheckoutLoading(false);
    }
  }

  const activeCarrier = carriers.find((item) => item.code === carrierCode);
  const activeType = types.find((item) => item.code === typeCode);

  return (
    <div className="r-app">
      <header className="r-header">
        <div className="r-header-inner">
          <button className="r-logo" type="button" onClick={() => setPage("catalog")}>
            <span className="r-logo-mark">↗</span> Recarga<span>Plus</span>
          </button>
          <nav className="r-nav" aria-label="Secciones">
            <button className={page === "catalog" ? "is-current" : ""} onClick={() => setPage("catalog")}>Recargas</button>
            <button className={page === "history" ? "is-current" : ""} onClick={() => {
              setHistoryLoading(true);
              setHistoryPage(1);
              setPage("history");
              setHistoryRefresh((value) => value + 1);
            }}>Historial</button>
            {user && <button onClick={logout}>Salir</button>}
          </nav>
        </div>
      </header>

      <main className="r-main">
        {paymentReturn === "success" && (
          <div className="r-notice" role="status">
            <strong>Regresaste de Stripe.</strong> Verifica el estado final en Historial. La confirmación depende del webhook, no de esta página.
          </div>
        )}
        {paymentReturn === "cancelled" && (
          <div className="r-notice r-notice-neutral" role="status">Cancelaste el Checkout. Una operación anterior puede permanecer pendiente hasta que expire la sesión.</div>
        )}

        <div className="r-hero">
          <span className="r-eyebrow"><span className="r-beta-dot" aria-hidden="true" /> BETA · ENTORNO DE PRUEBA</span>
          <h1>{page === "history" ? "Tu historial de recargas" : "Tu próxima recarga, más fácil"}</h1>
          <p>{page === "history"
            ? "Consulta los movimientos que has realizado y el estado confirmado por Stripe."
            : "Elige tu compañía, descubre paquetes disponibles y realiza tu pago de forma segura con Stripe."}</p>
        </div>

        {page === "history" ? (
          <section className="r-panel">
            <div className="r-panel-heading">
              <h2>Movimientos recientes</h2>
              <button className="r-secondary-button" disabled={!token || historyLoading} onClick={() => {
                setHistoryLoading(true);
                setHistoryRefresh((value) => value + 1);
              }}>Actualizar</button>
            </div>
            {!token ? <p>Inicia sesión desde la sección Recargas para ver tu historial.</p>
              : historyLoading ? <p>Cargando historial...</p>
              : historyError ? <p className="r-error" role="alert">{historyError}</p>
              : history.length === 0 ? <p>Aún no tienes operaciones registradas.</p>
              : <div className="r-history-list">{history.map((item) => (
                <article className="r-history-item" key={item.id}>
                  <div>
                    <strong>{item.carrier} · {item.package_name ?? "Recarga"}</strong>
                    <p>{item.phone} · {new Date(item.created_at).toLocaleString("es-MX")}</p>
                    {item.failure_reason && <p className="r-error">{item.failure_reason}</p>}
                  </div>
                  <div className="r-history-right">
                    <strong>{currency(item.amount_cents)}</strong>
                    <span className={`r-status r-status-${item.status}`}>{statusLabels[item.status] ?? item.status}</span>
                  </div>
                </article>
              ))}</div>}
            {token && historyTotal > HISTORY_PAGE_SIZE && !historyError && (
              <div className="r-panel-heading">
                <button
                  className="r-secondary-button"
                  disabled={historyLoading || historyPage === 1}
                  onClick={() => {
                    setHistoryLoading(true);
                    setHistoryPage((current) => current - 1);
                  }}
                >
                  Anterior
                </button>
                <span>
                  Página {historyPage} de {Math.ceil(historyTotal / HISTORY_PAGE_SIZE)}
                </span>
                <button
                  className="r-secondary-button"
                  disabled={
                    historyLoading ||
                    historyPage >= Math.ceil(historyTotal / HISTORY_PAGE_SIZE)
                  }
                  onClick={() => {
                    setHistoryLoading(true);
                    setHistoryPage((current) => current + 1);
                  }}
                >
                  Siguiente
                </button>
              </div>
            )}
          </section>
        ) : (
          <div className="r-layout">
            <div className="r-content">
              <section className="r-panel">
                <h2><span className="r-step">1</span> Elige tu compañía</h2>
                {catalogLoading ? <p>Cargando compañías...</p> : (
                  <div className="r-carriers">{carriers.map((item) => (
                    <button className={`r-carrier ${carrierCode === item.code ? "is-active" : ""}`}
                      type="button" aria-pressed={carrierCode === item.code}
                      key={item.id} onClick={() => chooseCarrier(item.code)}>
                      <span className="r-carrier-mark" style={{ background: carrierColors[item.code] ?? "#52637a" }}>{item.name[0]}</span>
                      <span>{item.name}</span>
                      {carrierCode === item.code && <span className="r-check">✓</span>}
                    </button>
                  ))}</div>
                )}
                {catalogError && <p className="r-error" role="alert">{catalogError}</p>}
              </section>

              <section className="r-panel">
                <h2><span className="r-step">2</span> Tipo de recarga</h2>
                <div className="r-types">{types.map((item) => (
                  <button type="button" key={item.id}
                    className={`r-type ${typeCode === item.code ? "is-active" : ""}`}
                    aria-pressed={typeCode === item.code} onClick={() => chooseType(item.code)}>
                    <span className="r-type-icon">{item.code.includes("internet") ? "🌐" : item.code === "saldo" ? "💳" : "📦"}</span>
                    <span>{item.name}</span>
                  </button>
                ))}</div>
                {carrierCode && types.length === 0 && !catalogError && <p className="r-muted">Cargando categorías o sin categorías disponibles.</p>}
              </section>

              <section className="r-panel">
                <h2><span className="r-step">3</span> Selecciona tu paquete</h2>
                {packagesLoading ? <p>Cargando paquetes...</p>
                  : packages.length === 0 ? <p className="r-muted">No hay paquetes activos en esta categoría.</p>
                  : <div className="r-packages">{packages.map((item) => (
                    <button key={item.id} type="button"
                      className={`r-package ${selectedPackage?.id === item.id ? "is-active" : ""}`}
                      aria-pressed={selectedPackage?.id === item.id}
                      onClick={() => { setSelectedPackage(item); setCheckoutError(""); }}>
                      <div className="r-package-top"><strong>{item.name}</strong><span>{currency(item.price_cents)}</span></div>
                      <p className="r-muted">{item.validity_days ? `Vigencia: ${item.validity_days} días` : "Vigencia por consultar"}</p>
                      <ul>{item.benefits.map((benefit, i) => <li key={i}>✓ {benefit}</li>)}</ul>
                      <span className="r-package-action">{selectedPackage?.id === item.id ? "Seleccionado ✓" : "Seleccionar →"}</span>
                    </button>
                  ))}</div>}
              </section>
            </div>

            <aside className="r-sidebar">
              <div className="r-panel r-summary">
                <h2>Resumen de recarga</h2>
                <div className="r-detail"><span>Compañía</span><strong>{activeCarrier?.name ?? "—"}</strong></div>
                <div className="r-detail"><span>Categoría</span><strong>{activeType?.name ?? "—"}</strong></div>
                <div className="r-detail"><span>Paquete</span><strong>{selectedPackage?.name ?? "Sin seleccionar"}</strong></div>
                <label className="r-label" htmlFor="recharge-phone">Número a recargar</label>
                <input id="recharge-phone" type="tel" inputMode="numeric" autoComplete="tel-national"
                  maxLength={10} placeholder="10 dígitos" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
                <div className="r-total"><span>Total</span><strong>{currency(selectedPackage?.price_cents ?? 0)}</strong></div>
                {token ? (
                  <button className="r-primary-button" disabled={!selectedPackage || !/^\d{10}$/.test(phone) || checkoutLoading}
                    onClick={pay}>{checkoutLoading ? "Preparando pago..." : "Pagar con Stripe →"}</button>
                ) : <p className="r-muted r-signin-hint">Inicia sesión para poder pagar.</p>}
                {checkoutError && <p className="r-error" role="alert">{checkoutError}</p>}
                <p className="r-secure">🔒 Pagos simulados con Stripe en modo de prueba.</p>
              </div>

              {!token ? (
                <div className="r-panel r-auth">
                  <div className="r-auth-tabs">
                    <button className={authMode === "login" ? "is-current" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Entrar</button>
                    <button className={authMode === "register" ? "is-current" : ""} onClick={() => { setAuthMode("register"); setAuthError(""); }}>Registrarme</button>
                  </div>
                  <form onSubmit={handleAuth}>
                    <label className="r-label" htmlFor="user-email">Correo electrónico</label>
                    <input id="user-email" type="email" autoComplete="email" required maxLength={254}
                      value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
                    <label className="r-label" htmlFor="user-password">Contraseña</label>
                    <div className="r-password-field">
                      <input id="user-password" className="r-password-input" type={showPassword ? "text" : "password"}
                        minLength={8} maxLength={72} required
                        autoComplete={authMode === "register" ? "new-password" : "current-password"}
                        value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
                      <button className="r-password-toggle" type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        aria-pressed={showPassword}>
                        {showPassword ? (
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 3l18 18" />
                            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                            <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.2-2.3 3.3" />
                            <path d="M6.2 6.2C3.9 7.6 2.7 9.8 2.5 12c.5 1.2 2.5 4 6.1 5.1a10 10 0 0 0 3.4.6c.7 0 1.4-.1 2.1-.2" />
                          </svg>
                        ) : (
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {authError && <p className="r-error" role="alert">{authError}</p>}
                    <button className="r-primary-button" type="submit" disabled={authLoading}>
                      {authLoading ? "Procesando..." : authMode === "login" ? "Iniciar sesión" : "Crear cuenta"}
                    </button>
                  </form>
                </div>
              ) : <div className="r-signed-in">✓ Sesión iniciada {user ? `como ${user.email}` : "correctamente"}</div>}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
