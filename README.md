
# Govee Cloud Panel (H6004)

Prosty panel www do sterowania żarówką Govee H6004 (i innymi wspieranymi) przez **Govee Cloud API**.
Backend to Node.js/Express (klucz API tylko po stronie serwera), frontend to statyczny HTML/JS.

## Szybki start lokalnie

1. Node 18+
2. `npm install`
3. Skopiuj `.env.example` na `.env` i wstaw swój `GOVEE_API_KEY`
4. `npm start` i otwórz `http://localhost:3000`

## Deploy na Render.com

1. Zrób repo (np. GitHub) z tym projektem.
2. Wejdź na Render → New + → **Blueprint** i wskaż repo (plik `render.yaml` wszystko skonfiguruje).
3. W Render → Settings → Environment → dodaj `GOVEE_API_KEY` (Secret).
4. Po deployu otwórz URL usługi i korzystaj.

## Endpointy backendu

- `GET /api/devices` – lista urządzeń konta
- `GET /api/state?device=...&sku=...` – stan urządzenia
- `POST /api/power` body: `{ device, sku, on:boolean }`
- `POST /api/brightness` body: `{ device, sku, value:number(0-100) }`
- `POST /api/color` body: `{ device, sku, r,g,b (0-255) }`
- `POST /api/colortemp` body: `{ device, sku, kelvin:number }`

## Bezpieczeństwo

- Nie ujawniaj klucza na froncie. Trzymaj go w `.env` na serwerze/Render.
- Ustaw `CORS_ORIGIN` na swoją domenę w produkcji.
- Rozważ dodanie prostego authu (header token lub Basic Auth) jeśli panel będzie publiczny.
