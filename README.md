# ScriptGenie Pro (Multilingual + Voiceover)
Generate SEO-optimized YouTube scripts in multiple languages and realistic MP3 voiceovers. CIH/CMI payment flow is included as a **disabled stub** (ready to activate when you have credentials).

## Features
- Multilingual script: English, French, Arabic, Darija (Moroccan Arabic), Spanish, Portuguese
- Voiceover (MP3) via OpenAI TTS
- Simple web UI
- API endpoints for automation
- Payment flow for **CIH/CMI** prepared but disabled until credentials are added

## Quick Start (Local)
1. Install Node.js 18+.
2. `npm install`
3. Copy `.env.example` to `.env` and set `OPENAI_API_KEY=...`
4. `npm run start`
5. Open http://localhost:3000

## Deploy on Render
1. Push this folder to a **new GitHub repo** (named `scriptgenie-pro`).
2. Create a free account on **https://render.com**.
3. **New Web Service** → connect your GitHub repo.
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Environment → add:
   - `OPENAI_API_KEY=...`
   - `DEMO_MODE=true` (disable when you enable payment)
7. Click **Deploy**. Your app will be live on a public URL.

## API Endpoints
- `POST /api/generate-script`
  - body: `{ language, niche, topic, tone, audience }`
  - returns: `{ ok, data: { title, description, script, short_script } }`

- `POST /api/generate-voice`
  - body: `{ text, language, voice? }`
  - returns: `{ ok, url }`

- `POST /api/generate`
  - body: `{ language, niche, topic, tone, audience, voice? }`
  - returns: both script + `audio_url`

## CIH/CMI Payment (to enable later)
The server includes `/api/payment/checkout` as a placeholder. When you receive your **CMI_MERCHANT_ID**, **CMI_SECRET**, and **CMI_ENDPOINT**, set:
```
DEMO_MODE=false
CMI_MERCHANT_ID=...
CMI_SECRET=...
CMI_ENDPOINT=...
```
Then implement the order-signing and callback verification per CMI docs (your bank will provide).

## Notes
- Voices: default is `alloy`. You can change by passing `voice` or editing `VOICE_BY_LANG` in `server.js`.
- For Darija, the model is instructed to write Moroccan Arabic in Arabic script. If you want Latin-script Darija, change the system prompt accordingly.
- This is an MVP. For production: add auth, quotas, rate limits, database, and proper payment callback handling.
