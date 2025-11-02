
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
    console.log("[devices] status:", r.status, "items:", Array.isArray(body?.data?.list) ? body.data.list.length : "n/a");
    if (r.status !== 200) console.log("[devices] body:", body);
    res.status(r.status).json(body);
  } catch (e) {
    console.error("[devices] upstream error:", e);
    res.status(502).json({ error: "Upstream error", details: String(e) });
  }
});

// State
app.get("/api/state", async (req, res) => {
  try {
    const { device, sku } = req.query;
    if (!device || !sku) return res.status(400).json({ error: "Missing device or sku" });
    const url = new URL(`${API}/device/state`);
    url.searchParams.set("device", device);
    url.searchParams.set("sku", sku);
    const r = await fetch(url, { headers: H });
    const body = await r.json();
    console.log("[state] status:", r.status, "device:", device, "sku:", sku);
    if (r.status !== 200) console.log("[state] body:", body);
    res.status(r.status).json({ url: url.toString(), ...body });
  } catch (e) {
    console.error("[state] upstream error:", e);
    res.status(502).json({ error: "Upstream error", details: String(e) });
  }
});

async function control(res, payload, tag) {
  try {
    const r = await fetch(`${API}/device/control`, {
      method: "POST",
      headers: H,
      body: JSON.stringify(payload),
    });
    const body = await r.json();
    console.log(`[control:${tag}] status:`, r.status, "msg:", body?.msg ?? body?.message);
    if (r.status !== 200) console.log(`[control:${tag}] body:`, body);
    res.status(r.status).json(body);
  } catch (e) {
    console.error(`[control:${tag}] upstream error:`, e);
    res.status(502).json({ error: "Upstream error", details: String(e) });
  }
}

app.post("/api/power", async (req, res) => {
  const { device, sku, on } = req.body || {};
  if (!device || !sku || typeof on !== "boolean") return res.status(400).json({ error: "Missing device, sku or on(boolean)" });
  await control(res, {
    requestId: Date.now().toString(),
    payload: {
      device: { device, sku },
      capability: { type: "devices.capabilities.on_off", instance: "on_off", value: on ? 1 : 0 },
    },
  }, "power");
});

app.post("/api/brightness", async (req, res) => {
  const { device, sku, value } = req.body || {};
  const v = Number(value);
  if (!device || !sku || !Number.isFinite(v)) return res.status(400).json({ error: "Missing device, sku or value(number)" });
  await control(res, {
    requestId: Date.now().toString(),
    payload: {
      device: { device, sku },
      capability: { type: "devices.capabilities.range", instance: "brightness", value: v },
    },
  }, "brightness");
});

app.post("/api/color", async (req, res) => {
  const { device, sku, r, g, b } = req.body || {};
  const rr = Number(r), gg = Number(g), bb = Number(b);
  if (!device || !sku || [rr,gg,bb].some(x => !Number.isFinite(x))) return res.status(400).json({ error: "Missing device, sku or r,g,b numbers" });
  await control(res, {
    requestId: Date.now().toString(),
    payload: {
      device: { device, sku },
      capability: { type: "devices.capabilities.color_setting", instance: "color_rgb", value: { r: rr, g: gg, b: bb } },
    },
  }, "color_rgb");
});

app.post("/api/colortemp", async (req, res) => {
  const { device, sku, kelvin } = req.body || {};
  const k = Number(kelvin);
  if (!device || !sku || !Number.isFinite(k)) return res.status(400).json({ error: "Missing device, sku or kelvin(number)" });
  await control(res, {
    requestId: Date.now().toString(),
    payload: {
      device: { device, sku },
      capability: { type: "devices.capabilities.color_setting", instance: "color_temperature", value: k },
    },
  }, "color_temp");
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(process.cwd() + "/public/index.html");
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Govee panel running on port", port));
