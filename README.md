@ -1,200 +1,146 @@
# Tekoaly-arvostaja / CV Reviewer
# CV Reviewer — AI-Powered CV Analysis & Mock Interview Practice

A Finnish-first CV review and mock interview app. Users can upload a PDF/DOCX CV or paste CV text, receive structured AI feedback, and practice a mock interview based on the same CV context.
A Finnish-first web application that reviews CVs with structured AI feedback and lets users practice job interviews with an AI interviewer. No account required. Nothing stored on the server.

The product is intentionally minimal: one CV review flow, one mock interview flow, no account system, and no server-side CV storage.

Suomenkielinen CV-arviointi- ja haastatteluharjoitussovellus. Käyttäjä voi ladata PDF- tai DOCX-muotoisen CV:n tai liittää CV:n tekstinä, saada rakenteisen tekoälypalautteen ja harjoitella haastattelua saman CV-kontekstin pohjalta.

Tuote on tarkoituksella kevyt: yksi CV-arvioinnin virta, yksi haastatteluharjoituksen virta, ei käyttäjätilejä eikä CV:n tallennusta palvelimelle.
**Live:** [tekoaly-arvostaja.vercel.app](https://tekoaly-arvostaja.vercel.app)

---

## What the app does

## Mitä sovellus tekee

- Reviews CV structure, content, language, local-market fit, and differentiation.
- Returns a structured score, strengths, improvement areas, rewrites, and market notes.
- Accepts PDF, DOCX, or pasted CV text.
- Provides a mock interview with rotating interviewer focus and varied question order.
- Supports optional video preview locally in the browser; video is not uploaded.
- Provides optional text-to-speech for interviewer questions.
- Keeps the UI Finnish-only and documents that behavior explicitly in the app.
- Uses shared app configuration for CV length limits and interview timer options.
- Avoids server-side CV persistence; request content is processed in-memory.

- Arvioi CV:n rakennetta, sisältöä, kieltä, kohdemarkkinaan sopivuutta ja erottautumista.
- Palauttaa rakenteisen pisteytyksen, vahvuudet, kehityskohteet, uudelleenkirjoitusehdotukset ja markkinahuomiot.
- Tukee PDF-, DOCX- ja tekstisyöttöä.
- Sisältää harjoitushaastattelun, jossa haastattelijan painotus ja kysymysjärjestys vaihtelevat.
- Tukee paikallista videon esikatselua selaimessa; videota ei lähetetä palvelimelle.
- Tukee vapaaehtoista puhesynteesiä haastattelijan kysymyksille.
- Käyttöliittymä on suomenkielinen ja tämä valinta näkyy sovelluksessa selkeästi.
- Käyttää yhteistä asetustiedostoa CV:n pituusrajalle ja haastattelun ajastimelle.
- Ei tallenna CV:tä palvelimelle; sisältö käsitellään muistissa pyynnön aikana.
## Features

### CV Review
- Upload a PDF or DOCX, or paste CV text directly
- AI analysis across five dimensions: formatting, content, language, local market fit, and strategic positioning
- Scored feedback with concrete strengths, improvement points, and rewrite suggestions
- Market-specific notes for Finland, Nordics, US, EU, and more
- Download the full report as a styled **HTML file** or a translated **JSON file** (Finnish field names)

### Mock Interview Practice
- Provide a CV summary (or carry it over directly from a CV review)
- AI interviewer asks 6–8 tailored questions with rotating focus areas
- Answer via text, voice dictation, or audio recording
- Optional text-to-speech for interviewer questions
- Optional local camera preview (video stays in the browser, never uploaded)
- Per-question answer timer (60 / 90 / 120 seconds)
- Final summary with STAR coaching, cultural fit notes, and next steps

### General
- Finnish UI, designed for the Finnish job market
- Dark / light theme with system preference detection
- Fully responsive, mobile-optimised
- No account, no tracking, no server-side CV storage
- Cloudflare Turnstile bot protection (optional)
- Downloadable session reports

---

## High-level architecture

## Arkkitehtuuri yleisellä tasolla
## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router 7 |
| Styling | Tailwind CSS, shadcn/ui (Radix UI primitives) |
| Icons | Lucide React |
| Build | Create React App + CRACO (webpack overrides) |
| HTTP client | Axios |
| Backend | Python, FastAPI, Uvicorn |
| AI | Anthropic Claude via Emergent AI gateway |
| TTS | OpenAI TTS via Emergent AI gateway |
| PDF extraction | pdfplumber + pypdf fallback |
| DOCX extraction | python-docx |
| Data validation | Pydantic |
| Rate limiting | slowapi |
| Bot protection | Cloudflare Turnstile |
| Hosting | Vercel (frontend + serverless API) |

```text
React frontend
  ├─ CV review form
  ├─ report display
  ├─ mock interview setup
  ├─ chat/video interview UI
  └─ Finnish-only copy and accessibility labels

FastAPI backend
  ├─ file/text validation
  ├─ PDF/DOCX text extraction
  ├─ AI prompt orchestration
  ├─ structured response validation
  ├─ mock interview session memory
  ├─ TTS endpoint
  └─ security/rate-limit middleware
---

Serverless API mirror
  └─ api/ contains a deployment-compatible copy of the backend routes/services
## Architecture

Shared config
  └─ shared/app_config.json is used by both frontend and backend
```
Browser
  └─ React SPA
       ├─ / → CV review form + report
       └─ /interview → mock interview setup + chat

Vercel serverless
  └─ /api/* → Python FastAPI (api/ directory)
       ├─ POST /api/review          CV review
       ├─ POST /api/interview/start  Start session
       ├─ POST /api/interview/turn   Send answer, get next question
       ├─ POST /api/interview/finish End session, get summary
       ├─ POST /api/interview/tts    Text-to-speech
       └─ DELETE /api/interview/:id  Delete session

External AI
  └─ Emergent AI gateway → Anthropic Claude (review + interview)
                         → OpenAI TTS (interviewer voice)
```

---
All CV text and interview answers are processed in-memory for the duration of the request. Nothing is written to a database.

## Full important-file structure
---

## Tärkeimpien tiedostojen rakenne
## Project structure

```text
```
.
├── README.md
├── PR_DESCRIPTION.md
├── vercel.json
├── vercel.json               Vercel build config, headers, and rewrites
├── shared/
│   └── app_config.json
│       └─ Shared product config: CV minimum length, Finnish-only mode, timer defaults/options.
│   └── app_config.json       Single source of truth for CV length limits and timer options
│
├── frontend/
│   ├── README.md
│   ├── package.json
│   ├── craco.config.js
│   │   └─ CRA/webpack customization, including @ and @app-config aliases.
│   ├── jsconfig.json
│   ├── craco.config.js       Webpack aliases (@/ → src, @app-config → shared config)
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   │   ├── index.html
│   │   ├── index.html        SEO meta, anti-FOUC theme script, non-blocking fonts
│   │   ├── manifest.json
│   │   ├── robots.txt
│   │   └── sitemap.xml
│   └── src/
│       ├── index.js
│       │   └─ BrowserRouter setup and route-level lazy loading.
│       ├── index.css
│       │   └─ Tailwind entry, fonts, global overflow/accessibility safeguards.
│       ├── App.js
│       │   └─ Homepage, CV review form, report display, footer social link.
│       ├── App.css
│       │   └─ Shared visual polish, card density, animations, report styling.
│       ├── i18n.js
│       │   └─ Finnish-only UI dictionary and translation helper.
│       ├── lib/
│       │   └── utils.js
│       ├── index.js          Router setup, lazy-loaded InterviewPage
│       ├── index.css         Tailwind entry, light + dark CSS variables, global styles
│       ├── App.js            CV review page, HTML/JSON report download
│       ├── App.css           Cards, animations, dropzone, mobile polish
│       ├── i18n.js           Finnish UI dictionary and translation hook
│       ├── hooks/
│       │   ├── useInterviewerTTS.js
│       │   │   └─ Calls backend TTS and manages audio playback.
│       │   ├── useSpeechRecognition.js
│       │   │   └─ Browser speech-recognition wrapper.
│       │   └── use-toast.js
│       │   ├── useTheme.js           Dark/light theme with localStorage persistence
│       │   ├── useAudioRecorder.js   MediaRecorder wrapper with peak meter
│       │   ├── useSpeechRecognition.js  Web Speech API wrapper (fi-FI / en-US)
│       │   └── useInterviewerTTS.js  Backend TTS calls + audio playback
│       ├── pages/
│       │   └── InterviewPage.js
│       │       └─ Mock interview setup, camera consent flow, timer config, chat integration.
│       │   └── InterviewPage.js      Interview setup, session management, camera consent
│       └── components/
│           ├── FileDropzone.js
│           ├── PrivacyPolicy.js
│           ├── ReportSection.js
│           ├── ScoreRing.js
│           ├── Turnstile.js
│           ├── interview/
│           │   ├── CameraConsentModal.js
│           │   ├── InterviewChat.js
│           │   └── InterviewSummary.js
│           └── ui/
│               └─ shadcn/ui-style component wrappers built on Radix UI primitives.
│           ├── FileDropzone.js       Drag-and-drop upload with success confirmation state
│           ├── PrivacyPolicy.js      GDPR privacy notice dialog (Finnish + English)
│           ├── ReportSection.js      Accordion-based CV feedback report
│           ├── ScoreRing.js          SVG score ring component
│           ├── SiteLayout.js         Sticky header, theme toggle, footer
│           ├── Turnstile.js          Cloudflare Turnstile widget wrapper
│           └── interview/
│               ├── AudioAnswerPanel.js   Audio recording + upload panel
│               ├── CameraConsentModal.js Camera permission dialog
│               ├── InterviewChat.js      Transcript, textarea, voice/TTS controls
│               └── InterviewSummary.js   End-of-session summary display
│
├── backend/
│   ├── requirements.txt
│   ├── app_config.py
│   │   └─ Python reader for shared/app_config.json.
│   ├── server.py
│   │   └─ FastAPI app, /api routes, CV review endpoint, interview endpoints, health/config.
│   ├── cv_models.py
│   │   └─ Pydantic models for structured CV review responses.
│   ├── cv_service.py
│   │   └─ PDF/DOCX extraction, prompt building, adaptive Claude fallback, response validation.
│   ├── interview_models.py
│   │   └─ Pydantic models for interview turns, summaries, timer normalization.
│   ├── interview_service.py
│   │   └─ In-memory interview sessions, rotating question focus, LLM calls, OpenAI TTS.
│   ├── security_audit.py
│   │   └─ In-memory security/audit event rollups.
│   ├── security_config.py
│   │   └─ Request limits, accepted file types, rate-limit strings, immutable limit checks.
│   ├── security_headers.py
│   │   └─ Security response headers middleware.
│   ├── security_ip_intel.py
│   │   └─ Lightweight proxy/VPN/IP intelligence helpers.
│   ├── security_middleware.py
│   │   └─ Request size limits and risk handling middleware.
│   ├── security_turnstile.py
│   │   └─ Cloudflare Turnstile verification helper.
│   ├── test_core.py
│   └── tests/
│       ├── test_cv_fallback_logic.py
│       ├── test_cv_reviewer.py
│       ├── test_finnish_release_regression.py
│       ├── test_interview.py
│       ├── test_interview_live_integration.py
│       ├── test_interview_rotation_logic.py
│       ├── test_minimal_release_health.py
│       ├── test_pentest.py
│       ├── test_release_smoke_public.py
│       ├── test_security_hardening.py
│       ├── test_security_live.py
│       ├── test_turnstile.py
│       ├── test_vibe_cleanup_contract.py
│       └── test_vibe_cleanup_runtime.py
├── backend/                  Local development FastAPI server
│   ├── server.py             App entry point, all routes
│   ├── cv_service.py         PDF/DOCX extraction, prompt building, Claude calls
│   ├── interview_service.py  In-memory sessions, question rotation, TTS
│   ├── cv_models.py          Pydantic response models for CV review
│   ├── interview_models.py   Pydantic models for interview turns and summaries
│   ├── security_*.py         Rate limiting, request validation, headers middleware
│   └── tests/                Pytest suite (unit, integration, regression, pentest)
│
└── api/
    ├── app_config.py
    ├── index.py
    ├── server.py
    ├── cv_models.py
    ├── cv_service.py
    ├── interview_models.py
    ├── interview_service.py
    ├── security_audit.py
    ├── security_config.py
    ├── security_headers.py
    ├── security_ip_intel.py
    ├── security_middleware.py
    └── security_turnstile.py
└── api/                      Vercel serverless mirror of backend (kept in sync)
    └── index.py              Serverless entry point
```

---

## Shared configuration

## Yhteinen konfiguraatio

`shared/app_config.json` is the product-level source of truth used by both the frontend and backend.

`shared/app_config.json` on tuotetason asetusten yhteinen lähde, jota sekä frontend että backend käyttävät.
`shared/app_config.json` is read by both the frontend and backend. Change limits here only — never in individual files.

```json
{
@ -206,343 +152,141 @@ Shared config
}
```

Used by:

Tiedostoa käytetään näissä kohdissa:

- `frontend/src/App.js` for client-side CV length validation.
- `frontend/src/pages/InterviewPage.js` and `InterviewChat.js` for timer options.
- `backend/app_config.py` and `api/app_config.py` for backend validation.
- `/api/app-config` for runtime config visibility.
- `backend/tests/test_vibe_cleanup_contract.py` and runtime tests to prevent drift.

---

## Main app flows

## Sovelluksen päävirrat

### CV review

### CV-arviointi

1. User uploads PDF/DOCX or pastes CV text.
2. Frontend checks `cvMinChars` from shared config.
3. Backend validates text length using the same shared config.
4. Backend extracts file text with `pdfplumber`, fallback PDF tooling, or `python-docx`.
5. Backend builds a structured prompt from CV text and target role/context.
6. AI model fallback is tried in order: newer Claude label first, then fallback labels.
7. Response is parsed and validated with Pydantic models.
8. Frontend renders score, strengths, improvements, examples, and market notes.

1. Käyttäjä lataa PDF/DOCX-tiedoston tai liittää CV-tekstin.
2. Frontend tarkistaa `cvMinChars`-rajan yhteisestä konfiguraatiosta.
3. Backend validoi tekstin pituuden samalla yhteisellä asetuksella.
4. Backend poimii tiedostotekstin `pdfplumber`-, PDF-varatyökalu- tai `python-docx`-kirjastolla.
5. Backend rakentaa promptin CV-tekstistä, haettavasta tehtävästä ja muusta kontekstista.
6. Tekoälymallien varamenettely kokeillaan järjestyksessä: uudempi Claude-malli ensin ja varamallit sen jälkeen.
7. Vastaus jäsennetään ja validoidaan Pydantic-malleilla.
8. Frontend näyttää pisteet, vahvuudet, kehityskohteet, esimerkit ja markkinahuomiot.

### Mock interview

### Harjoitushaastattelu

1. User provides a CV summary or prefilled CV review context.
2. User chooses chat/video mode and optional 60/90/120 second answer timer.
3. Backend starts an in-memory session.
4. Interviewer focus rotates automatically between impact, role fit, collaboration, and skill depth.
5. Each turn is validated as structured JSON.
6. Optional TTS converts interviewer prompts into audio.
7. Final summary gives strengths, improvements, STAR coaching, cultural fit, and next steps.

1. Käyttäjä antaa CV-tiivistelmän tai käyttää CV-arviosta esitäytettyä kontekstia.
2. Käyttäjä valitsee chat/video-tilan ja vapaaehtoisen 60/90/120 sekunnin vastausajastimen.
3. Backend käynnistää muistissa pidettävän istunnon.
4. Haastattelijan painotus vaihtuu automaattisesti vaikutuksen, tehtävään sopivuuden, yhteistyön ja osaamisen syvyyden välillä.
5. Jokainen vuoro validoidaan rakenteisena JSON-vastauksena.
6. Vapaaehtoinen TTS muuntaa haastattelijan kysymykset ääneksi.
7. Lopun yhteenveto antaa vahvuudet, kehityskohteet, STAR-valmennuksen, kulttuurisopivuuden ja seuraavat askeleet.

### Privacy flow

### Tietosuojavirta

- CV text is processed for the request and not written to a database.
- Interview sessions are stored only in process memory and expire/are deleted.
- Local camera preview stays in the browser.
- `/api/health` returns `privacy_mode: no_server_storage`.

- CV-teksti käsitellään pyynnön aikana eikä sitä kirjoiteta tietokantaan.
- Haastatteluistunnot pidetään vain prosessin muistissa ja ne vanhenevat tai poistetaan.
- Paikallinen kameran esikatselu pysyy selaimessa.
- `/api/health` palauttaa `privacy_mode: no_server_storage`.

---

## API endpoints

## API-päätepisteet

Important backend endpoints:

Tärkeimmät backend-päätepisteet:

| Endpoint | Method | Purpose |
|---|---:|---|
| `/api/health` | GET | Health status, privacy mode, generic AI model label. |
| `/api/app-config` | GET | Shared runtime config used by app/tests. |
| `/api/options` | GET | Allowed seniority levels and markets. |
| `/api/review` | POST | CV review from file/text input. |
| `/api/extract-cv` | POST | Extracts text from uploaded CV for interview setup. |
| `/api/interview/start` | POST | Starts mock interview session. |
| `/api/interview/turn` | POST | Sends candidate answer and gets next interviewer turn. |
| `/api/interview/finish` | POST | Ends interview and returns final summary. |
| `/api/interview/{session_id}` | DELETE | Deletes interview session. |
| `/api/interview/tts` | POST | Generates interviewer speech audio. |
| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Service health, privacy mode, AI model label |
| `/api/app-config` | GET | Runtime config (shared with frontend) |
| `/api/options` | GET | Allowed seniority levels and markets |
| `/api/review` | POST | CV review from file or text |
| `/api/interview/extract-cv` | POST | Extract text from uploaded CV for interview prefill |
| `/api/interview/start` | POST | Start a mock interview session |
| `/api/interview/turn` | POST | Submit an answer, receive next question |
| `/api/interview/finish` | POST | End session early, get final summary |
| `/api/interview/{id}` | DELETE | Delete session (called on tab close) |
| `/api/interview/tts` | POST | Generate interviewer audio |

---

## Code sources and acknowledgements

## Koodilähteet ja kiitokset

This project contains original application logic for the CV review flow, prompt orchestration, interview rotation, privacy behavior, UI layout, tests, and product copy. It also uses open-source libraries and generated-style component patterns. Those sources are acknowledged below.

Tämä projekti sisältää omaa sovelluslogiikkaa CV-arviointiin, kehotteiden ohjaukseen, haastattelun kysymyskiertoon, tietosuojakäytäntöihin, käyttöliittymään, testeihin ja tuoteteksteihin. Lisäksi se hyödyntää avoimen lähdekoodin kirjastoja ja luotuja komponenttityylejä. Ne on listattu alla.

| Area | Source / project | Link | Where used | Purpose |
|---|---|---|---|---|
| Frontend framework | React | https://github.com/facebook/react | `frontend/src/**/*.js` | Component rendering and UI state. |
| DOM rendering | React DOM | https://github.com/facebook/react | `frontend/src/index.js` | Browser rendering root. |
| Routing | React Router | https://github.com/remix-run/react-router | `frontend/src/index.js`, `App.js`, `InterviewPage.js` | `/` and `/interview` routes, links, navigation. |
| Build tooling | Create React App / react-scripts | https://github.com/facebook/create-react-app | `frontend/package.json` | Base React build/test scripts. |
| Build override | CRACO | https://github.com/dilanx/craco | `frontend/craco.config.js` | Path aliases and webpack config tweaks. |
| Styling | Tailwind CSS | https://github.com/tailwindlabs/tailwindcss | `frontend/src/**/*.js`, `tailwind.config.js` | Responsive utility-first layout. |
| Tailwind animation helpers | tailwindcss-animate | https://github.com/jamiebuilds/tailwindcss-animate | Tailwind config/dependency | Animation utility classes. |
| CSS class merging | tailwind-merge | https://github.com/dcastil/tailwind-merge | `frontend/src/lib/utils.js`, UI components | Safe Tailwind class merging. |
| Conditional classes | clsx | https://github.com/lukeed/clsx | `frontend/src/lib/utils.js`, UI components | Conditional class composition. |
| Component variants | class-variance-authority | https://github.com/joe-bell/cva | `frontend/src/components/ui/button.jsx` | Button style variants. |
| UI primitives | Radix UI | https://github.com/radix-ui/primitives | `frontend/src/components/ui/*.jsx` | Accessible dialogs, tabs, selects, labels, etc. |
| Component recipe style | shadcn/ui | https://github.com/shadcn-ui/ui | `frontend/src/components/ui/*.jsx` | Component wrappers/patterns built on Radix UI. |
| Icons | lucide-react | https://github.com/lucide-icons/lucide | Navigation, footer, upload, report, interview UI | SVG icons. |
| HTTP client | axios | https://github.com/axios/axios | `App.js`, `InterviewPage.js`, TTS hook | Frontend API calls. |
| Toasts | sonner | https://github.com/emilkowalski/sonner | UI dependency/components | Toast notification support. |
| Forms | react-hook-form | https://github.com/react-hook-form/react-hook-form | UI dependency/forms | Form support from component set. |
| Form validation helper | @hookform/resolvers | https://github.com/react-hook-form/resolvers | UI dependency/forms | Resolver support for forms. |
| Schema validation | zod | https://github.com/colinhacks/zod | UI dependency/forms | Schema validation support. |
| Date helpers | date-fns | https://github.com/date-fns/date-fns | UI dependency/calendar components | Date utility support. |
| Carousel UI | embla-carousel-react | https://github.com/davidjerleke/embla-carousel | UI dependency | Carousel component support. |
| OTP input | input-otp | https://github.com/guilhermerodz/input-otp | UI dependency | OTP component support from UI set. |
| Drawer UI | vaul | https://github.com/emilkowalski/vaul | UI dependency | Drawer component support. |
| Charts | recharts | https://github.com/recharts/recharts | UI dependency | Chart component support if needed. |
| Theme helper | next-themes | https://github.com/pacocoursey/next-themes | UI dependency | Theme helper dependency from UI set. |
| Resizable panels | react-resizable-panels | https://github.com/bvaughn/react-resizable-panels | UI dependency | Resizable UI component support. |
| Day picker | react-day-picker | https://github.com/gpbl/react-day-picker | UI dependency/calendar | Calendar component support. |
| Command menu | cmdk | https://github.com/pacocoursey/cmdk | UI dependency/command component | Command palette primitives. |
| Backend framework | FastAPI | https://github.com/tiangolo/fastapi | `backend/server.py`, `api/server.py` | HTTP API framework. |
| ASGI toolkit | Starlette | https://github.com/encode/starlette | FastAPI foundation, middleware/responses | Request/response and middleware base. |
| ASGI server | Uvicorn | https://github.com/encode/uvicorn | Local backend serving | Development/runtime ASGI server. |
| Data validation | Pydantic | https://github.com/pydantic/pydantic | `cv_models.py`, `interview_models.py`, request models | Validates API and AI response shapes. |
| Multipart parsing | python-multipart | https://github.com/Kludex/python-multipart | File upload endpoints | Parses uploaded files/forms. |
| PDF extraction | pdfplumber | https://github.com/jsvine/pdfplumber | `cv_service.py` | Primary PDF text extraction. |
| PDF fallback | pypdf | https://github.com/py-pdf/pypdf | `cv_service.py` | Fallback PDF text extraction. |
| PDF rendering backend | pypdfium2 | https://github.com/pypdfium2-team/pypdfium2 | PDF dependency | PDF support through extraction stack. |
| PDF text engine | pdfminer.six | https://github.com/pdfminer/pdfminer.six | pdfplumber dependency | Low-level PDF text extraction. |
| DOCX extraction | python-docx | https://github.com/python-openxml/python-docx | `cv_service.py` | DOCX text extraction. |
| Rate limiting | slowapi | https://github.com/laurentS/slowapi | `server.py`, security config | API rate limits. |
| Environment loading | python-dotenv | https://github.com/theskumar/python-dotenv | Backend env loading | Loads `.env` values. |
| HTTP requests | requests | https://github.com/psf/requests | Tests, Turnstile/runtime checks | Synchronous HTTP calls. |
| Async HTTP | aiohttp | https://github.com/aio-libs/aiohttp | Dependency stack | Async HTTP support. |
| Modern HTTP client | httpx | https://github.com/encode/httpx | Dependency stack | HTTP client support. |
| OpenAI SDK | openai-python | https://github.com/openai/openai-python | `interview_service.py` | Text-to-speech audio generation. |
| LLM gateway wrapper | emergentintegrations | https://pypi.org/project/emergentintegrations/ | `cv_service.py`, `interview_service.py` | LLM chat wrapper through Emergent gateway. |
| LLM abstraction | LiteLLM | https://github.com/BerriAI/litellm | LLM integration dependency | Provider/model routing support. |
| Google AI SDKs | google-genai, google-generativeai | https://github.com/googleapis/python-genai | Dependency stack | Available AI provider SDK support. |
| Security crypto | cryptography | https://github.com/pyca/cryptography | Dependency stack | Security primitives. |
| JWT helpers | PyJWT, python-jose | https://github.com/jpadilla/pyjwt / https://github.com/mpdavis/python-jose | Dependency stack | Token/JWT support. |
| Password hashing | bcrypt, passlib | https://github.com/pyca/bcrypt / https://github.com/passlib2-project/passlib2 | Dependency stack | Password hashing support if needed. |
| MongoDB clients | pymongo, motor | https://github.com/mongodb/mongo-python-driver / https://github.com/mongodb/motor | Dependency stack | Database client support; current app avoids CV storage. |
| Stripe SDK | stripe-python | https://github.com/stripe/stripe-python | Dependency stack | Payment SDK dependency, not part of current CV flow. |
| AWS SDK | boto3 / botocore | https://github.com/boto/boto3 | Dependency stack | AWS support dependency. |
| Testing | pytest | https://github.com/pytest-dev/pytest | `backend/tests/*.py` | Unit/runtime regression tests. |
| Linting | ESLint | https://github.com/eslint/eslint | Frontend lint checks | JavaScript linting. |
| Accessibility linting | eslint-plugin-jsx-a11y | https://github.com/jsx-eslint/eslint-plugin-jsx-a11y | Frontend lint config | JSX accessibility rules. |
| React linting | eslint-plugin-react, eslint-plugin-react-hooks | https://github.com/jsx-eslint/eslint-plugin-react / https://github.com/facebook/react | Frontend lint config | React and hook rules. |
| Python formatting/linting | black, flake8, mypy, isort | https://github.com/psf/black / https://github.com/PyCQA/flake8 / https://github.com/python/mypy / https://github.com/PyCQA/isort | Developer tooling dependencies | Python style/type checks. |
| Bot protection | Cloudflare Turnstile | https://developers.cloudflare.com/turnstile/ | `Turnstile.js`, `security_turnstile.py` | Optional bot protection for form submissions. |

Notes:

Huomiot:

- `frontend/src/components/ui/*` follows shadcn/ui-style wrappers around Radix primitives.
- App-specific CV prompts, Finnish copy, interview rotation profiles, privacy logic, tests, and layout decisions are project code.
- Some dependencies are present because they come from the base template or UI component set; not every dependency is used directly by the current visible flow.

- `frontend/src/components/ui/*` noudattaa shadcn/ui-tyylistä rakennetta Radix-primitiivien päällä.
- Sovelluskohtaiset CV-promptit, suomenkieliset tekstit, haastattelun kysymyskiertoprofiilit, tietosuojalogiikka, testit ja asetteluratkaisut ovat projektin omaa koodia.
- Osa riippuvuuksista tulee pohjaprojektista tai UI-komponenttisetistä; kaikki riippuvuudet eivät näy suoraan nykyisessä käyttäjävirrassa.
## Environment variables

---
### Backend / API

## Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `EMERGENT_LLM_KEY` | Yes | LLM gateway key for CV review and interview |
| `EMERGENT_LLM_KEY_FALLBACK` | No | Optional fallback key for CV review |
| `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile server-side secret |
| `CORS_ORIGINS` | Recommended | Comma-separated allowed frontend origins |
| `AUDIT_API_KEY` | No | Protects the audit endpoint if set |

## Ympäristömuuttujat
### Frontend

| Variable | Location | Required | Purpose |
|---|---|---:|---|
| `EMERGENT_LLM_KEY` | backend/API | Yes for AI flows | Universal LLM key used for CV review and interview prompts. |
| `EMERGENT_LLM_KEY_FALLBACK` | backend/API | No | Optional fallback key for CV review. |
| `TURNSTILE_SECRET_KEY` | backend/API | No | Cloudflare Turnstile secret for bot verification. |
| `CORS_ORIGINS` | backend/API | Recommended in production | Comma-separated allowed frontend origins. |
| `AUDIT_API_KEY` | backend/API | No | Protects audit health endpoint if configured. |
| `REACT_APP_BACKEND_URL` | frontend | Yes | Public backend base URL used by frontend API calls. |
| `REACT_APP_TURNSTILE_SITE_KEY` | frontend | No | Cloudflare Turnstile site key. |
| Variable | Required | Purpose |
|---|---|---|
| `REACT_APP_BACKEND_URL` | Yes | Backend base URL used by all API calls |
| `REACT_APP_TURNSTILE_SITE_KEY` | No | Cloudflare Turnstile site key |

---

## Local development

## Paikallinen kehitys

### Backend

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

Minimum backend `.env`:

Backendin vähimmäis-`.env`:
Minimum `backend/.env`:

```env
EMERGENT_LLM_KEY=your_key_here
```

Optional backend `.env`:

Valinnainen backendin `.env`:

```env
EMERGENT_LLM_KEY_FALLBACK=optional_fallback_key
TURNSTILE_SECRET_KEY=cloudflare_turnstile_secret
CORS_ORIGINS=http://localhost:3000
AUDIT_API_KEY=optional_audit_key
```

### Frontend

### Frontend

```bash
cd frontend
yarn install
yarn start
npm install --legacy-peer-deps
npm start
```

Minimum frontend `.env`:

Frontendin vähimmäis-`.env`:
Minimum `frontend/.env`:

```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

Optional frontend `.env`:

Valinnainen frontendin `.env`:
---

```env
REACT_APP_TURNSTILE_SITE_KEY=cloudflare_turnstile_site_key
```
## Deployment

---
The project is deployed on Vercel. The build command and API routing are defined in `vercel.json`.

## Testing and verification
```json
{
  "buildCommand": "cd frontend && npm install --legacy-peer-deps && npm run build",
  "outputDirectory": "frontend/build"
}
```

## Testaus ja varmistus
The `api/` directory is automatically picked up by Vercel as Python serverless functions. Set all backend environment variables in the Vercel project dashboard.

Useful focused checks:
---

Hyödylliset kohdennetut tarkistukset:
## Running tests

```bash
cd backend

# Core contract and runtime checks
pytest -q tests/test_vibe_cleanup_contract.py tests/test_vibe_cleanup_runtime.py

# Interview and CV logic
pytest -q tests/test_interview.py tests/test_interview_rotation_logic.py tests/test_cv_fallback_logic.py

# Security hardening
pytest -q tests/test_security_hardening.py tests/test_pentest.py
```

Frontend build check:

Frontendin koontitarkistus:

```bash
cd frontend
yarn build
```

Runtime health checks:

Ajonaikaiset health check -tarkistukset:

```bash
curl -s "$REACT_APP_BACKEND_URL/api/health"
curl -s "$REACT_APP_BACKEND_URL/api/app-config"
CI=true npm run build
```

---

## Privacy model

## Tietosuojamalli

- CV content is processed for the active request and is not persisted to a database.
- Interview sessions are in-memory and can be deleted with `DELETE /api/interview/{session_id}`.
- Camera preview is local to the browser.
- TTS sends only interviewer prompt text to the speech endpoint.
- `/api/health` reports:
## Privacy

- CV-sisältö käsitellään aktiivisen pyynnön aikana eikä sitä tallenneta tietokantaan.
- Haastatteluistunnot ovat muistissa ja ne voidaan poistaa kutsulla `DELETE /api/interview/{session_id}`.
- Kameran esikatselu pysyy selaimessa.
- TTS lähettää puhepäätteelle vain haastattelijan kysymystekstin.
- `/api/health` palauttaa:

```json
{
  "privacy_mode": "no_server_storage"
}
```
- CV text and interview answers are processed in-memory for the active request only. Nothing is written to a database.
- Interview sessions are held in process memory and deleted when the session ends or the user closes the tab.
- Camera preview is local to the browser. Video is never uploaded.
- TTS sends only the interviewer's question text to the speech endpoint.
- `GET /api/health` confirms: `"privacy_mode": "no_server_storage"`
- Full privacy notice: [tietosuoja@cvarvio.fi](mailto:tietosuoja@cvarvio.fi)

---

## Known maintenance notes
## Maintenance notes

## Ylläpitohuomiot

- `backend/` and `api/` intentionally mirror much of the same logic for local/serverless compatibility. Keep changes synchronized.
- Shared limits should be changed only in `shared/app_config.json`.
- The UI is Finnish-only by product choice; avoid adding hidden language toggles.
- The exact working AI fallback model is hidden from user-facing surfaces; `/api/health` exposes only `adaptive-claude`.

- `backend/` ja `api/` peilaavat tarkoituksella paljon samaa logiikkaa paikallisen ja serverless-yhteensopivuuden vuoksi. Pidä muutokset synkassa.
- Jaetut rajat kannattaa muuttaa vain tiedostossa `shared/app_config.json`.
- Käyttöliittymä on tuotepäätöksenä suomenkielinen; älä lisää piilotettuja kielivalintoja.
- Tarkka toimiva tekoälyn varamalli on piilotettu käyttäjälle näkyvistä pinnoista; `/api/health` näyttää vain `adaptive-claude`.
- `backend/` and `api/` mirror the same logic for local vs. Vercel serverless compatibility. Keep changes in sync between them.
- All shared product limits (CV length, timer options) live only in `shared/app_config.json`.
- The UI is intentionally Finnish-only. Language toggles are a no-op by product design.
- The exact AI model in use is not exposed to users. `/api/health` returns only `"adaptive-claude"`.
- Dark mode preference is stored in `localStorage` under key `cvarvio.theme`. The anti-FOUC script in `index.html` applies it before first paint.

---

## License

## Lisenssi

MIT for project code, unless a specific file says otherwise. Third-party dependencies keep their own licenses; see each linked project above and the installed package metadata for full license terms.

Projektin oma koodi on MIT-lisensoitu, ellei yksittäisessä tiedostossa toisin mainita. Kolmansien osapuolten riippuvuuksilla on omat lisenssinsä; katso yllä olevat linkit ja asennettujen pakettien lisenssitiedot.
MIT for project code, unless a specific file states otherwise. Third-party dependencies retain their own licenses — see each package's repository for full terms.
