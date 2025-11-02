
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

// Helpers: safe JSON
async function fetchJson(url, options) {
  const r = await fetch(url, options);
  const text = await r.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    body = { parseError: String(e), raw: text?.slice(0, 2000) || "" };
  }
  return { status: r.status, body, headers: Object.fromEntries(r.headers.entries()) };
}

app.use(express.static("public"));

// Devices
app.get("/api/devices", async (_req, res) => {
  try {
    const { status, body, headers } = await fetchJson(`${API}/user/devices`, { headers: H });
    res.status(status).json(body);
  } catch (e) {
    res.status(502).json({ error: "Upstream error", details: String(e) });
  }
});

// State: POST with two payload variants (fallback)
app.get("/api/state", async (req, res) => {
  try {
    const { device, sku } = req.query;
    if (!device || !sku) return res.status(400).json({ error: "Missing device or sku" });

    // Variant A: device: { device, sku }
    const payloadA = { requestId: Date.now().toString(), payload: { device: { device, sku } } };
    let { status, body } = await fetchJson(`${API}/device/state`, { method: "POST", headers: H, body: JSON.stringify(payloadA) });

    if (status !== 200 || body?.code !== 200) {
      // Variant B: flat payload with device + sku
      const payloadB = { requestId: Date.now().toString(), payload: { device, sku } };
      const second = await fetchJson(`${API}/device/state`, { method: "POST", headers: H, body: JSON.stringify(payloadB) });
      // Return both attempts for debugging
      return res.status(second.status).json({ attemptA: { status, body }, attemptB: { status: second.status, body: second.body } });
    }

    res.status(status).json(body);
  } catch (e) {
    res.status(502).json({ error: "Upstream error", details: String(e) });
  }
});

async function control(payload) {
  return await fetchJson(`${API}/device/control`, { method: "POST", headers: H, body: JSON.stringify(payload) });
}

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

// Debug: raw upstream check (GET)
app.get("/api/debug/upstream-state-get", async (req, res) => {
  const { device, sku } = req.query;
  const url = `${API}/device/state?device=${encodeURIComponent(device||"")}&sku=${encodeURIComponent(sku||"")}`;
  const { status, body, headers } = await fetchJson(url, { headers: H });
  res.status(200).json({ status, headers, body, url });
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(process.cwd() + "/public/index.html");
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Govee panel running on port", port));
