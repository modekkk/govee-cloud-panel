
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

const API = "https://openapi.api.govee.com/router/api/v1";
const KEY = process.env.GOVEE_API_KEY;
const H = { "Content-Type": "application/json", "Govee-API-Key": KEY };

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use((req, res, next) => {
  if (!KEY) return res.status(500).json({ error: "Missing GOVEE_API_KEY env var on server" });
  next();
});

app.use(express.static("public"));

// Devices
app.get("/api/devices", async (_req, res) => {
  try {
    const r = await fetch(`${API}/user/devices`, { headers: H });
    const body = await r.json();
    res.status(r.status).json(body);
  } catch (e) {
    res.status(502).json({ error: "Upstream error", details: String(e) });
  }
});

// State: prefer Variant B (payload: { device, sku }), fallback to Variant A (payload: { device: { device, sku } })
app.get("/api/state", async (req, res) => {
  try {
    const { device, sku } = req.query;
    if (!device || !sku) return res.status(400).json({ error: "Missing device or sku" });

    // Variant B (works for your account)
    const payloadB = { requestId: Date.now().toString(), payload: { device, sku } };
    let r = await fetch(`${API}/device/state`, { method: "POST", headers: H, body: JSON.stringify(payloadB) });
    let body = await r.json().catch(()=>({}));
    if (r.status === 200 && body?.code === 200) return res.status(200).json(body);

    // Fallback Variant A
    const payloadA = { requestId: Date.now().toString(), payload: { device: { device, sku } } };
    const r2 = await fetch(`${API}/device/state`, { method: "POST", headers: H, body: JSON.stringify(payloadA) });
    const body2 = await r2.json().catch(()=>({}));
    return res.status(r2.status).json(body2);
  } catch (e) {
    res.status(502).json({ error: "Upstream error", details: String(e) });
  }
});

async function control(payload) {
  const r = await fetch(`${API}/device/control`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(()=>({}));
  return { status: r.status, body };
}

// Power: powerSwitch 1/0
app.post("/api/power", async (req, res) => {
  const { device, sku, on } = req.body || {};
  if (!device || !sku || typeof on !== "boolean") return res.status(400).json({ error: "Missing device, sku or on(boolean)" });
  const payload = {
    requestId: Date.now().toString(),
    payload: {
      device: { device, sku },
      capability: { type: "devices.capabilities.on_off", instance: "powerSwitch", value: on ? 1 : 0 },
    },
  };
  const { status, body } = await control(payload);
  res.status(status).json(body);
});

// Brightness: 1..100
app.post("/api/brightness", async (req, res) => {
  const { device, sku, value } = req.body || {};
  const v = Number(value);
  if (!device || !sku || !Number.isFinite(v)) return res.status(400).json({ error: "Missing device, sku or value(number)" });
  const payload = {
    requestId: Date.now().toString(),
    payload: {
      device: { device, sku },
      capability: { type: "devices.capabilities.range", instance: "brightness", value: v },
    },
  };
  const { status, body } = await control(payload);
  res.status(status).json(body);
});

// Color: colorRgb int 0..16777215
app.post("/api/color", async (req, res) => {
  const { device, sku, r, g, b } = req.body || {};
  const rr = Number(r), gg = Number(g), bb = Number(b);
  if (!device || !sku || [rr,gg,bb].some(x => !Number.isFinite(x))) return res.status(400).json({ error: "Missing device, sku or r,g,b numbers" });
  const int24 = (rr << 16) | (gg << 8) | bb;
  const payload = {
    requestId: Date.now().toString(),
    payload: {
      device: { device, sku },
      capability: { type: "devices.capabilities.color_setting", instance: "colorRgb", value: int24 },
    },
  };
  const { status, body } = await control(payload);
  res.status(status).json(body);
});

// Color temperature: colorTemperatureK
app.post("/api/colortemp", async (req, res) => {
  const { device, sku, kelvin } = req.body || {};
  const k = Number(kelvin);
  if (!device || !sku || !Number.isFinite(k)) return res.status(400).json({ error: "Missing device, sku or kelvin(number)" });
  const payload = {
    requestId: Date.now().toString(),
    payload: {
      device: { device, sku },
      capability: { type: "devices.capabilities.color_setting", instance: "colorTemperatureK", value: k },
    },
  };
  const { status, body } = await control(payload);
  res.status(status).json(body);
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(process.cwd() + "/public/index.html");
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Govee panel v4.4 running on port", port));
