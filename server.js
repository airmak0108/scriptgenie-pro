/**
 * ScriptGenie Pro (Multilingual) — Server
 * Node.js + Express API with OpenAI for scripts + TTS voiceover.
 * CIH/CMI payment flow is included as a stub and DISABLED by default.
 *
 * ENV required:
 *  - OPENAI_API_KEY
 * Optional ENV:
 *  - PORT (default 3000)
 *  - OPENAI_MODEL (default gpt-4o-mini)
 *  - TTS_MODEL (default gpt-4o-mini-tts)  // Use tts-1 if needed
 *  - DEMO_MODE (default "true")  // when "true", payment is not required
 *  - CMI_MERCHANT_ID, CMI_SECRET, CMI_ENDPOINT (payment; ignored in demo mode)
 *
 * Start (local):
 *   npm install
 *   npm run start
 *   Open http://localhost:3000
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
dotenv.config();

const DEMO_MODE = (process.env.DEMO_MODE ?? 'true').toLowerCase() === 'true';
const PORT = process.env.PORT || 3000;

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY missing. Put it in .env');
  process.exit(1);
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TTS_MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts'; // Or 'tts-1'

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const OUT_DIR = path.join(__dirname, 'public', 'outputs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// --- Helpers ---
const VOICE_BY_LANG = {
  // These are logical names; OpenAI will still use given "voice" id.
  // You can change to voices available to your account.
  'en': 'alloy',
  'fr': 'alloy',
  'ar': 'alloy',
  'ma': 'alloy', // darija - handled via prompt
  'es': 'alloy',
  'pt': 'alloy'
};

function pickVoice(lang, requested) {
  if (requested) return requested;
  const key = (lang || 'en').slice(0,2).toLowerCase();
  return VOICE_BY_LANG[key] || 'alloy';
}

function uid(n=12){
  const chars='abcdefghijklmnopqrstuvwxyz0123456789';
  let s=''; for(let i=0;i<n;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// --- Prompts ---
const SYSTEM_PROMPT = `You are ScriptGenie, an expert AI for writing YouTube scripts that rank in search.
You produce JSON ONLY with fields: title, description, script, short_script.
Rules:
- The 'title' must include the target keyword naturally.
- The 'description' should be 1-2 lines with the main keyword in the first sentence.
- The 'script' must start with a 5-10 second HOOK, then 3 clear sections, then a CTA that mentions watching a related video.
- The 'short_script' is a 30-45 second condensed version with a punchy opening.
- Write in the EXACT language requested, including punctuation and numerals as common for that language.
- If language='darija', write in Moroccan Arabic (Darija) using Arabic characters and common colloquial words.`;

function buildUserPrompt({ language='en', niche='general', topic='useful topic', tone='friendly', audience='beginners' }) {
  const langLine = `Language: ${language}`;
  return `${langLine}
Niche: ${niche}
Topic: ${topic}
Tone: ${tone}
Audience: ${audience}
Constraints: Include one specific example, and include an internal CTA that references a related video using a placeholder [RELATED_VIDEO_TITLE]. Output JSON only.`;
}

// --- Routes ---

// Health
app.get('/api/health', (req,res)=> res.json({ ok:true, demo: DEMO_MODE }));

// Generate script only
app.post('/api/generate-script', async (req,res)=>{
  try {
    const { language, niche, topic, tone, audience, max_tokens=1200 } = req.body || {};
    if (!topic || !language) return res.status(400).json({ ok:false, error:'Missing language or topic' });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({ language, niche, topic, tone, audience })}
    ];

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.2,
      max_tokens
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || '';
    let data = null;
    try { data = JSON.parse(raw); } catch(e) {
      const first = raw.indexOf('{'); const last = raw.lastIndexOf('}');
      if (first>-1 && last>-1) { try { data = JSON.parse(raw.slice(first, last+1)); } catch(e2){} }
    }
    if (!data) return res.json({ ok:false, raw, message:'Model did not return valid JSON' });

    res.json({ ok:true, data });
  } catch (e) {
    console.error('generate-script error', e);
    res.status(500).json({ ok:false, error:'Server error' });
  }
});

// Generate voiceover from provided text
app.post('/api/generate-voice', async (req,res)=>{
  try {
    const { text, language='en', voice } = req.body || {};
    if (!text) return res.status(400).json({ ok:false, error:'Missing text' });

    const voiceToUse = pickVoice(language, voice);
    const filename = `voice_${uid()}.mp3`;
    const filepath = path.join(OUT_DIR, filename);

    // OpenAI TTS (Web-compatible Response)
    const speech = await openai.audio.speech.create({
      model: TTS_MODEL,
      voice: voiceToUse,
      input: text,
      format: 'mp3'
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    fs.writeFileSync(filepath, buffer);
    res.json({ ok:true, url:`/outputs/${filename}` });
  } catch (e) {
    console.error('generate-voice error', e);
    res.status(500).json({ ok:false, error:'TTS error' });
  }
});

// Combined: script + voice (voice from full script)
app.post('/api/generate', async (req,res)=>{
  try {
    const { language, niche, topic, tone, audience, voice } = req.body || {};
    // In non-demo mode, require payment proof
    if (!DEMO_MODE) {
      return res.status(403).json({ ok:false, error:'Payment required (CIH/CMI). DEMO_MODE=false' });
    }

    // 1) Script
    const r = await fetch(`http://localhost:${PORT}/api/generate-script`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ language, niche, topic, tone, audience })
    });
    const j = await r.json();
    if (!j.ok) return res.status(400).json(j);

    // 2) Voice from full script
    const scriptText = j.data?.script || '';
    const rv = await fetch(`http://localhost:${PORT}/api/generate-voice`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ text: scriptText, language, voice })
    });
    const jv = await rv.json();
    if (!jv.ok) return res.status(400).json(jv);

    res.json({ ok:true, data: { ...j.data, audio_url: jv.url } });
  } catch (e) {
    console.error('generate (combined) error', e);
    res.status(500).json({ ok:false, error:'Server error' });
  }
});

// --- CIH/CMI Payment (stub; disabled until credentials + gateway ready) ---
app.post('/api/payment/checkout', (req,res)=>{
  const enabled = !DEMO_MODE && !!process.env.CMI_MERCHANT_ID;
  if (!enabled) {
    return res.json({ ok:false, status:'disabled', reason:'DEMO_MODE or missing CMI credentials' });
  }
  // When enabled: build order payload, sign with secret, redirect user to CMI page, handle callback.
  return res.json({ ok:false, status:'todo', message:'CIH/CMI integration pending activation.' });
});

// Serve the demo UI
app.get('/', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, ()=>{
  console.log(`ScriptGenie Pro server running on http://localhost:${PORT} (DEMO_MODE=${DEMO_MODE})`);
});
