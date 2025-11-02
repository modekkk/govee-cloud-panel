
import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple session auth (MemoryStore) — for single-instance demo
app.use(session({
  secret: process.env.SESSION_SECRET || "govee-demo-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));

// CORS only for APIs if you expose cross-origin; otherwise not needed
app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));

// --- Auth ---
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASS || "werusia321";

function requireAuth(req, res, next){
  if (req.session?.auth === true) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Unauthorized" });
  return res.redirect("/login.html");
}

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.post("/api/login", (req, res)=>{
  const { username, password } = req.body || {};
  if (username === USER && password === PASS){
    req.session.auth = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: "Invalid credentials" });
});
app.post("/api/logout", (req, res)=>{
  req.session.destroy(()=> res.json({ ok: true }));
});

// --- Protected area ---
app.use(requireAuth);

const API = "https://openapi.api.govee.com/router/api/v1";
const KEY = process.env.GOVEE_API_KEY;
const H = { "Content-Type": "application/json", "Govee-API-Key": KEY };

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use((req, res, next) => {
  if (!KEY) return res.status(500).json({ error: "Missing GOVEE_API_KEY env var on server" });
  next();
});

app.use(express.static("public"));

// STATE (Variant B default, A fallback)
app.get("/api/state", async (req, res) => {
  try {
    const { device, sku } = req.query;
    if (!device || !sku) return res.status(400).json({ error: "Missing device or sku" });

    const payloadB = { requestId: Date.now().toString(), payload: { device, sku } };
    let r = await fetch(`${API}/device/state`, { method: "POST", headers: H, body: JSON.stringify(payloadB) });
    let body = await r.json().catch(()=>({}));
    if (r.status === 200 && body?.code === 200) return res.status(200).json(body);

    const payloadA = { requestId: Date.now().toString(), payload: { device: { device, sku } } };
    const r2 = await fetch(`${API}/device/state`, { method: "POST", headers: H, body: JSON.stringify(payloadA) });
    const body2 = await r2.json().catch(()=>({}));
    return res.status(r2.status).json(body2);
  } catch (e) {
    res.status(502).json({ error: "Upstream error", details: String(e) });
  }
});

// CONTROL helper with Variant B then A
async function controlVariantB(payloadB) {
  const r = await fetch(`${API}/device/control`, { method: "POST", headers: H, body: JSON.stringify(payloadB) });
  const body = await r.json().catch(()=>({}));
  return { status: r.status, body };
}
async function controlVariantA(payloadA) {
  const r = await fetch(`${API}/device/control`, { method: "POST", headers: H, body: JSON.stringify(payloadA) });
  const body = await r.json().catch(()=>({}));
  return { status: r.status, body };
}
async function controlSmart(device, sku, capability) {
  const payloadB = { requestId: Date.now().toString(), payload: { device, sku, capability } };
  let { status, body } = await controlVariantB(payloadB);
  if (status === 200 && body?.code === 200) return { status, body, variant: "B" };
  const payloadA = { requestId: Date.now().toString(), payload: { device: { device, sku }, capability } };
  const second = await controlVariantA(payloadA);
  return { ...second, variant: "A", firstAttempt: { status, body } };
}

// Basic controls
app.post("/api/power", async (req, res) => {
  const { device, sku, on } = req.body || {};
  if (!device || !sku || typeof on !== "boolean") return res.status(400).json({ error: "Missing device, sku or on(boolean)" });
  const capability = { type: "devices.capabilities.on_off", instance: "powerSwitch", value: on ? 1 : 0 };
  const { status, body, variant } = await controlSmart(device, sku, capability);
  res.status(status).json({ ...body, variant });
});
app.post("/api/brightness", async (req, res) => {
  const { device, sku, value } = req.body || {};
  const v = Number(value);
  if (!device || !sku || !Number.isFinite(v)) return res.status(400).json({ error: "Missing device, sku or value(number)" });
  const capability = { type: "devices.capabilities.range", instance: "brightness", value: v };
  const { status, body, variant } = await controlSmart(device, sku, capability);
  res.status(status).json({ ...body, variant });
});
app.post("/api/color", async (req, res) => {
  const { device, sku, r, g, b } = req.body || {};
  const rr = Number(r), gg = Number(g), bb = Number(b);
  if (!device || !sku || [rr,gg,bb].some(x => !Number.isFinite(x))) return res.status(400).json({ error: "Missing device, sku or r,g,b numbers" });
  const int24 = (rr << 16) | (gg << 8) | bb;
  const capability = { type: "devices.capabilities.color_setting", instance: "colorRgb", value: int24 };
  const { status, body, variant } = await controlSmart(device, sku, capability);
  res.status(status).json({ ...body, variant });
});
app.post("/api/colortemp", async (req, res) => {
  const { device, sku, kelvin } = req.body || {};
  const k = Number(kelvin);
  if (!device || !sku || !Number.isFinite(k)) return res.status(400).json({ error: "Missing device, sku or kelvin(number)" });
  const capability = { type: "devices.capabilities.color_setting", instance: "colorTemperatureK", value: k };
  const { status, body, variant } = await controlSmart(device, sku, capability);
  res.status(status).json({ ...body, variant });
});
app.post("/api/scene", async (req, res) => {
  const { device, sku, value, type } = req.body || {};
  if (!device || !sku) return res.status(400).json({ error: "Missing device or sku" });
  const instance = type === "diy" ? "diyScene" : "lightScene";
  const capability = { type: "devices.capabilities.dynamic_scene", instance, value: String(value || "") };
  const { status, body, variant } = await controlSmart(device, sku, capability);
  res.status(status).json({ ...body, variant });
});

// Serve app
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Govee panel v4.9 running on port", port));
