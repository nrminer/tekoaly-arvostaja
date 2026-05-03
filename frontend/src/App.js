import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileText, Loader2, MessageSquare, Sparkles } from "lucide-react";

import "@/App.css";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FileDropzone } from "@/components/FileDropzone";
import { ReportSection } from "@/components/ReportSection";
import { ScoreRing } from "@/components/ScoreRing";
import { SiteLayout } from "@/components/SiteLayout";
import { Turnstile } from "@/components/Turnstile";
import { dimensionKey, useI18n } from "@/i18n";
import appConfig from "@app-config";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

const FALLBACK_MARKET_CODES = ["Finland", "Nordics", "US", "EU"];

const FALLBACK_SENIORITY = [
  "Student/Intern",
  "Early-career",
  "Mid-level",
  "Senior",
  "Lead/Principal",
  "Executive",
];

const CTA_FULL_CLASS = "h-12 w-full gap-2 rounded-xl text-base";

function App() {
  const { language, t } = useI18n();
  const navigate = useNavigate();
  const [activeInput, setActiveInput] = useState("upload");
  const [file, setFile] = useState(null);
  const [cvText, setCvText] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [seniority, setSeniority] = useState("Mid-level");
  const [market, setMarket] = useState("Finland");
  const [jobDescription, setJobDescription] = useState("");
  const [specificConcerns, setSpecificConcerns] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [activeReview, setActiveReview] = useState(null);
  const [copyNotice, setCopyNotice] = useState("");
  const [marketCodes, setMarketCodes] = useState(FALLBACK_MARKET_CODES);
  const [seniorityLevels, setSeniorityLevels] = useState(FALLBACK_SENIORITY);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const resultsRef = useRef(null);

  const loadOptions = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/options`);
      if (Array.isArray(response.data?.markets) && response.data.markets.length) {
        setMarketCodes(response.data.markets.map((m) => m.code));
      }
      if (
        Array.isArray(response.data?.seniority_levels) &&
        response.data.seniority_levels.length
      ) {
        setSeniorityLevels(response.data.seniority_levels);
      }
    } catch (err) {
      console.warn("Could not load options, using defaults", err); // eslint-disable-line no-console
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const canSubmit = useMemo(() => {
    if (isAnalyzing) return false;
    if (TURNSTILE_SITE_KEY && !turnstileToken) return false;
    if (activeInput === "upload") {
      return Boolean(file) || cvText.trim().length >= appConfig.cvMinChars;
    }
    return cvText.trim().length >= appConfig.cvMinChars;
  }, [activeInput, cvText, file, isAnalyzing, turnstileToken]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setCopyNotice("");

    if (!canSubmit) {
      setError(
        TURNSTILE_SITE_KEY && !turnstileToken
          ? t("form.error.captcha")
          : t("form.error.tooShort"),
      );
      return;
    }

    const formData = new FormData();
    formData.append("cv_text", cvText.trim());
    formData.append("job_title", jobTitle.trim());
    formData.append("industry", industry.trim());
    formData.append("seniority", seniority || "");
    formData.append("market", market || "Global");
    formData.append("job_description", jobDescription.trim());
    formData.append("specific_concerns", specificConcerns.trim());
    formData.append("language", language);
    if (turnstileToken) formData.append("turnstile_token", turnstileToken);
    if (file) formData.append("file", file);

    setIsAnalyzing(true);
    try {
      const response = await axios.post(`${API}/review`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setActiveReview(response.data);
      // Turnstile tokens are single-use — reset the widget after every
      // submission (success or failure) so the next attempt gets a fresh one.
      setTurnstileToken("");
      setTurnstileResetSignal(Date.now());
      // RAF defers the scroll until after React flushes the new review into DOM.
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ block: "start" }),
      );
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        (language === "fi"
          ? "Arviointia ei voitu viimeistellä. Yritä uudelleen."
          : "The review could not be completed. Please try again.");
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
      // Reset the widget on failure too — the token has been consumed upstream.
      setTurnstileToken("");
      setTurnstileResetSignal(Date.now());
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleCopy(text) {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopyNotice(t("copy.notice"));
    setTimeout(() => setCopyNotice(""), 2200);
  }

  function handleErrorRecovery() {
    setError("");
    const target =
      activeInput === "paste"
        ? document.getElementById("cvText")
        : document.getElementById("submit");
    target?.focus?.();
    target?.scrollIntoView?.({ block: "center" });
  }

  function downloadHtml() {
    if (!activeReview) return;
    const rev = activeReview.review;
    const date = new Date().toISOString().slice(0, 10);

    const esc = (str) =>
      String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const metaLine = [
      activeReview.job_title,
      activeReview.industry,
      seniorityLabel,
      marketLabel,
    ].filter(Boolean).join(" · ");

    const scoreColor = (s) =>
      s >= 8 ? "#16a34a" : s >= 5 ? "#0f766e" : s >= 3 ? "#d97706" : "#dc2626";

    const miniRing = (score) => {
      const sz = 52; const sw = 5; const r = (sz - sw) / 2;
      const circ = 2 * Math.PI * r;
      const off = (circ - (score / 10) * circ).toFixed(2);
      const c = scoreColor(score);
      return `<div style="position:relative;display:inline-grid;place-items:center;width:${sz}px;height:${sz}px;flex-shrink:0"><svg width="${sz}" height="${sz}" style="position:absolute"><circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="${sw}"/><circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${off}" transform="rotate(-90 ${sz/2} ${sz/2})"/></svg><span style="position:absolute;font-weight:700;font-size:0.8rem;color:${c}">${score}</span></div>`;
    };

    const impactLabel = (v) => {
      const k = (v || "").toLowerCase();
      return k === "high" ? "Tärkeä" : k === "medium" ? "Hyödyllinen" : k === "low" ? "Pieni" : esc(v);
    };
    const impactStyle = (v) => {
      const k = (v || "").toLowerCase();
      return k === "high"
        ? "background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5"
        : k === "medium"
        ? "background:#fef9c3;color:#92400e;border:1px solid #fde68a"
        : "background:#f1f5f9;color:#475569;border:1px solid #cbd5e1";
    };

    const dimLabel = (name) => {
      const key = dimensionKey(name);
      return key ? t(key) : esc(name);
    };

    const listItems = (items) =>
      items?.length
        ? `<ul style="margin:0;padding-left:1.35rem">${items.map((s) => `<li style="font-size:.875rem;color:#374151;margin-bottom:.3rem;line-height:1.6">${esc(s)}</li>`).join("")}</ul>`
        : `<p style="font-size:.875rem;color:#9ca3af;margin:0">–</p>`;

    const dimensionsHtml = (rev.dimensions || [])
      .map((dim) => `
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:1.1rem;margin-bottom:.85rem">
          <div style="display:flex;align-items:flex-start;gap:.85rem;margin-bottom:.75rem">
            ${miniRing(dim.score)}
            <div style="min-width:0;flex:1">
              <p style="margin:0;font-weight:700;font-size:.95rem;color:#111827">${dimLabel(dim.dimension)}</p>
              ${dim.observations ? `<p style="margin:.3rem 0 0;font-size:.85rem;color:#6b7280;line-height:1.55">${esc(dim.observations)}</p>` : ""}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:.75rem">
              <p style="margin:0 0 .4rem;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#166534">Toimii hyvin</p>
              ${listItems(dim.strengths)}
            </div>
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:.75rem">
              <p style="margin:0 0 .4rem;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9a3412">Parannettavaa</p>
              ${listItems(dim.improvements)}
            </div>
          </div>
        </div>
      `).join("");

    const recommendationsHtml = (rev.priority_recommendations || [])
      .slice().sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .map((rec, i) => `
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:1rem;margin-bottom:.75rem">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin-bottom:.5rem">
            <span style="background:#0f766e;color:#fff;border-radius:999px;padding:.1rem .55rem;font-size:.75rem;font-weight:700">#${rec.rank || i + 1}</span>
            <span style="border-radius:999px;padding:.1rem .55rem;font-size:.75rem;font-weight:600;${impactStyle(rec.impact)}">${impactLabel(rec.impact)}</span>
            <strong style="font-size:.95rem;color:#111827">${esc(rec.title)}</strong>
          </div>
          ${rec.rationale ? `<p style="margin:0 0 .45rem;font-size:.875rem;color:#4b5563;line-height:1.65">${esc(rec.rationale)}</p>` : ""}
          ${rec.example ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:.7rem;margin-top:.4rem"><p style="margin:0 0 .3rem;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b">Esimerkki</p><p style="margin:0;font-size:.875rem;line-height:1.65">${esc(rec.example)}</p></div>` : ""}
        </div>
      `).join("");

    const excerptsHtml = (rev.revised_excerpts || [])
      .map((ex) => `
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:1rem;margin-bottom:.75rem">
          ${ex.section ? `<p style="margin:0 0 .55rem;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b">${esc(ex.section)}</p>` : ""}
          ${ex.original ? `<div style="background:#fef2f2;border-left:3px solid #fca5a5;padding:.55rem .75rem;border-radius:0 6px 6px 0;margin-bottom:.45rem"><p style="margin:0 0 .2rem;font-size:.7rem;font-weight:700;color:#991b1b">Alkuperäinen</p><p style="margin:0;font-size:.875rem;color:#374151;line-height:1.65">${esc(ex.original)}</p></div>` : ""}
          <div style="background:#f0fdf4;border-left:3px solid #86efac;padding:.55rem .75rem;border-radius:0 6px 6px 0;margin-bottom:.45rem"><p style="margin:0 0 .2rem;font-size:.7rem;font-weight:700;color:#166534">Ehdotus</p><p style="margin:0;font-size:.875rem;color:#374151;line-height:1.65">${esc(ex.revised)}</p></div>
          ${ex.why_it_works ? `<p style="margin:0;font-size:.8rem;color:#6b7280;line-height:1.55"><strong>Miksi tämä toimii paremmin:</strong> ${esc(ex.why_it_works)}</p>` : ""}
        </div>
      `).join("");

    const overallScore = rev.overall_score ?? 0;
    const mainSz = 96; const mainSw = 7; const mainR = (mainSz - mainSw) / 2;
    const mainCirc = 2 * Math.PI * mainR;
    const mainOff = (mainCirc - (overallScore / 10) * mainCirc).toFixed(2);
    const mainColor = scoreColor(overallScore);

    const html = `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>CV-Palaute – ${date}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#f8fafc;color:#111827;line-height:1.5;-webkit-font-smoothing:antialiased}
    .page{max-width:800px;margin:0 auto;padding:2rem 1.5rem 4rem}
    h2{margin:0 0 1rem;font-size:1.05rem;font-weight:700;color:#111827}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:1.5rem;margin-bottom:1.25rem;box-shadow:0 1px 4px rgba(0,0,0,.04)}
    @media print{body{background:#fff}.page{padding:1rem}.card{box-shadow:none}}
    @media(max-width:560px){.dim-grid{grid-template-columns:1fr!important}.score-row{flex-direction:column!important}}
  </style>
</head>
<body>
<div class="page">

  <div style="background:#0f766e;border-radius:16px;padding:1.5rem;margin-bottom:1.5rem;display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;color:#fff">
    <div>
      <p style="margin:0;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;opacity:.75">CV-arvioija</p>
      <h1 style="margin:.2rem 0 0;font-size:1.5rem;font-weight:800">CV-Palaute</h1>
      ${metaLine ? `<p style="margin:.4rem 0 0;font-size:.875rem;opacity:.85">${esc(metaLine)}</p>` : ""}
    </div>
    <span style="font-size:.8rem;opacity:.7;white-space:nowrap;padding-top:.3rem">${date}</span>
  </div>

  <div class="card" style="display:flex;align-items:flex-start;gap:1.5rem" class="score-row">
    <div style="position:relative;display:inline-grid;place-items:center;width:${mainSz}px;height:${mainSz}px;flex-shrink:0">
      <svg width="${mainSz}" height="${mainSz}" style="position:absolute;top:0;left:0">
        <circle cx="${mainSz/2}" cy="${mainSz/2}" r="${mainR}" fill="none" stroke="#e5e7eb" stroke-width="${mainSw}"/>
        <circle cx="${mainSz/2}" cy="${mainSz/2}" r="${mainR}" fill="none" stroke="${mainColor}" stroke-width="${mainSw}" stroke-linecap="round" stroke-dasharray="${mainCirc.toFixed(2)}" stroke-dashoffset="${mainOff}" transform="rotate(-90 ${mainSz/2} ${mainSz/2})"/>
      </svg>
      <span style="position:absolute;font-weight:800;font-size:1.4rem;color:${mainColor}">${overallScore}</span>
    </div>
    <div style="flex:1;min-width:0">
      <h2 style="margin:0 0 .25rem">Kokonaisarvio</h2>
      <p style="margin:0;color:#374151;line-height:1.7">${esc(rev.overall_assessment)}</p>
      ${activeReview.was_truncated ? `<span style="display:inline-block;margin-top:.6rem;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:999px;padding:.15rem .65rem;font-size:.75rem">Pitkä CV lyhennettiin tarkistusta varten</span>` : ""}
    </div>
  </div>

  ${rev.key_strength ? `
  <div class="card">
    <h2>Suurin vahvuus</h2>
    <p style="margin:0 0 .35rem;font-weight:700;font-size:1rem;color:#0f766e">${esc(rev.key_strength.title)}</p>
    <p style="margin:0;color:#374151;line-height:1.7">${esc(rev.key_strength.explanation)}</p>
  </div>` : ""}

  ${rev.dimensions?.length ? `
  <div class="card">
    <h2>Palaute aiheittain</h2>
    ${dimensionsHtml}
  </div>` : ""}

  ${rev.priority_recommendations?.length ? `
  <div class="card">
    <h2>Tärkeimmät parannusehdotukset</h2>
    ${recommendationsHtml}
  </div>` : ""}

  ${rev.revised_excerpts?.length ? `
  <div class="card">
    <h2>Kirjoitusehdotukset</h2>
    ${excerptsHtml}
  </div>` : ""}

  ${rev.market_notes?.length ? `
  <div class="card">
    <h2>Huomiot kohdemarkkinan käytännöistä</h2>
    ${listItems(rev.market_notes)}
  </div>` : ""}

  ${rev.assumptions?.length ? `
  <div class="card">
    <h2>Huomioitavaa</h2>
    ${listItems(rev.assumptions)}
  </div>` : ""}

  <footer style="text-align:center;padding-top:2rem;color:#9ca3af;font-size:.8rem">
    Tuotettu <a href="https://tekoaly-arvostaja.vercel.app" style="color:#0f766e;text-decoration:none">CV-arvioija</a>-palvelulla &middot; ${date}
  </footer>

</div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CV-Palaute-${date}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadTranslatedJson() {
    if (!activeReview) return;
    const rev = activeReview.review;
    const date = new Date().toISOString().slice(0, 10);

    const impactLabel = (v) => {
      const k = (v || "").toLowerCase();
      return k === "high" ? "Tärkeä" : k === "medium" ? "Hyödyllinen" : k === "low" ? "Pieni" : v;
    };

    const translated = {
      Luotu: date,
      "Haettava tehtävä": activeReview.job_title || "",
      Toimiala: activeReview.industry || "",
      Kokemustaso: seniorityLabel || activeReview.seniority || "",
      Kohdemaa: marketLabel || activeReview.market || "",
      Kokonaisarvosana: rev.overall_score,
      Kokonaisarvio: rev.overall_assessment,
      ...(rev.key_strength ? {
        "Suurin vahvuus": {
          Otsikko: rev.key_strength.title,
          Selitys: rev.key_strength.explanation,
        },
      } : {}),
      "Osa-alueet": (rev.dimensions || []).map((d) => ({
        "Osa-alue": (() => { const k = dimensionKey(d.dimension); return k ? t(k) : d.dimension; })(),
        Pisteet: d.score,
        Havainnot: d.observations || "",
        "Toimii hyvin": d.strengths || [],
        Parannettavaa: d.improvements || [],
      })),
      "Tärkeimmät parannusehdotukset": (rev.priority_recommendations || [])
        .slice().sort((a, b) => (a.rank || 99) - (b.rank || 99))
        .map((r) => ({
          Järjestysnumero: r.rank,
          Vaikutus: impactLabel(r.impact),
          Otsikko: r.title,
          Perustelu: r.rationale || "",
          Esimerkki: r.example || "",
        })),
      Kirjoitusehdotukset: (rev.revised_excerpts || []).map((e) => ({
        Osio: e.section || "",
        Alkuperäinen: e.original || "",
        Ehdotus: e.revised || "",
        "Miksi toimii paremmin": e.why_it_works || "",
      })),
      "Kohdemarkkinan huomiot": rev.market_notes || [],
      Huomioitavaa: rev.assumptions || [],
    };

    const blob = new Blob([JSON.stringify(translated, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CV-Palaute-${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const review = activeReview?.review;
  const marketLabel = useMemo(() => {
    if (!activeReview?.market) return "";
    return t(`market.${activeReview.market}`);
  }, [activeReview, t]);
  const seniorityLabel = useMemo(() => {
    if (!activeReview?.seniority) return "";
    return t(`seniority.${activeReview.seniority}`);
  }, [activeReview, t]);

  return (
    <SiteLayout>
      <main className="flex-1">
        {/* ── Page hero ── */}
        <div className="hero-gradient border-b bg-gradient-to-b from-accent/50 via-accent/10 to-background">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
            <h1
              className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
              data-testid="hero-title"
            >
              {t("hero.title")}
            </h1>
            <p
              className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg"
              data-testid="hero-description"
            >
              {t("hero.description")}
            </p>
            <p
              className="mt-1.5 text-[11px] text-muted-foreground"
              data-testid="language-notice"
            >
              {t("app.languageNotice")}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="gap-2 rounded-xl"
                onClick={() =>
                  document
                    .getElementById("submit")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                data-testid="hero-check-cv-button"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                {t("hero.cta.check")}
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="gap-2 rounded-xl bg-card"
                data-testid="hero-interview-button"
              >
                <Link to="/interview">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  {t("hero.cta.interview")}
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Feature cards ── */}
        <div className="border-b bg-muted/10">
          <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* CV review */}
              <Card className="soft-card flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-4 p-6">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-semibold">{t("home.cv.title")}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {t("home.cv.description")}
                    </p>
                  </div>
                  <ul className="flex-1 space-y-2 text-sm text-muted-foreground">
                    {[t("home.cv.f1"), t("home.cv.f2"), t("home.cv.f3")].map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-2 w-full gap-2 rounded-xl"
                    onClick={() =>
                      document
                        .getElementById("submit")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    data-testid="feature-cv-cta"
                  >
                    {t("home.cv.cta")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>

              {/* Interview practice */}
              <Card className="soft-card flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-4 p-6">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
                    <MessageSquare className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-semibold">
                      {t("home.interview.title")}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {t("home.interview.description")}
                    </p>
                  </div>
                  <ul className="flex-1 space-y-2 text-sm text-muted-foreground">
                    {[t("home.interview.f1"), t("home.interview.f2"), t("home.interview.f3")].map(
                      (f) => (
                        <li key={f} className="flex items-start gap-2">
                          <CheckCircle2
                            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          {f}
                        </li>
                      ),
                    )}
                  </ul>
                  <Button
                    asChild
                    variant="outline"
                    className="mt-2 w-full gap-2 rounded-xl bg-card"
                    data-testid="feature-interview-cta"
                  >
                    <Link to="/interview">
                      {t("home.interview.cta")}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* ── Form + results ── */}
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
          <section id="submit" className="scroll-mt-20 space-y-6">
            <Card className="soft-card">
              <CardHeader>
                <CardTitle className="font-heading text-2xl">
                  {t("form.submit.title")}
                </CardTitle>
                <CardDescription>{t("form.submit.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <Tabs value={activeInput} onValueChange={setActiveInput} className="w-full">
                    <TabsList className="grid w-full grid-cols-2" data-testid="cv-input-tabs">
                      <TabsTrigger value="upload" data-testid="upload-tab-button">
                        {t("form.tabs.upload")}
                      </TabsTrigger>
                      <TabsTrigger value="paste" data-testid="paste-tab-button">
                        {t("form.tabs.paste")}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="upload" className="mt-5">
                      <FileDropzone file={file} onFileChange={setFile} />
                    </TabsContent>
                    <TabsContent value="paste" className="mt-5 space-y-2">
                      <Label htmlFor="cvText">{t("form.cvTextLabel")}</Label>
                      <Textarea
                        id="cvText"
                        value={cvText}
                        onChange={(event) => setCvText(event.target.value)}
                        className="min-h-72 resize-y bg-card"
                        placeholder={t("form.cvTextPlaceholder")}
                        data-testid="cv-text-paste-textarea"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("form.charCount", { n: cvText.length.toLocaleString() })}
                      </p>
                    </TabsContent>
                  </Tabs>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="jobTitle">{t("form.jobTitle")}</Label>
                      <Input
                        id="jobTitle"
                        value={jobTitle}
                        onChange={(event) => setJobTitle(event.target.value)}
                        placeholder={t("form.jobTitlePlaceholder")}
                        data-testid="context-job-title-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="industry">{t("form.industry")}</Label>
                      <Input
                        id="industry"
                        value={industry}
                        onChange={(event) => setIndustry(event.target.value)}
                        placeholder={t("form.industryPlaceholder")}
                        data-testid="context-industry-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="seniority">{t("form.seniority")}</Label>
                      <Select value={seniority} onValueChange={setSeniority}>
                        <SelectTrigger
                          id="seniority"
                          className="bg-card"
                          data-testid="context-seniority-select"
                        >
                          <SelectValue placeholder={t("form.seniorityPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {seniorityLevels.map((level) => (
                            <SelectItem
                              key={level}
                              value={level}
                              data-testid={`seniority-option-${level
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, "-")}`}
                            >
                              {t(`seniority.${level}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="market">{t("form.market")}</Label>
                      <Select value={market} onValueChange={setMarket}>
                        <SelectTrigger
                          id="market"
                          className="bg-card"
                          data-testid="context-market-select"
                        >
                          <SelectValue placeholder={t("form.marketPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {marketCodes.map((code) => (
                            <SelectItem
                              key={code}
                              value={code}
                              data-testid={`market-option-${code.toLowerCase()}`}
                            >
                              {t(`market.${code}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="jobDescription">{t("form.jobDescription")}</Label>
                      <Textarea
                        id="jobDescription"
                        value={jobDescription}
                        onChange={(event) => setJobDescription(event.target.value)}
                        placeholder={t("form.jobDescriptionPlaceholder")}
                        data-testid="context-job-description-textarea"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="specificConcerns">{t("form.specificConcerns")}</Label>
                      <Textarea
                        id="specificConcerns"
                        value={specificConcerns}
                        onChange={(event) => setSpecificConcerns(event.target.value)}
                        placeholder={t("form.specificConcernsPlaceholder")}
                        data-testid="context-specific-concerns-textarea"
                      />
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive" data-testid="error-alert">
                      <AlertTitle>{t("form.error.title")}</AlertTitle>
                      <AlertDescription className="space-y-3">
                        <p>{error}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="bg-card"
                          onClick={handleErrorRecovery}
                          data-testid="error-recovery-action"
                        >
                          {t("form.error.action")}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  {TURNSTILE_SITE_KEY && (
                    <div
                      className="flex flex-col items-center gap-2"
                      data-testid="turnstile-container"
                    >
                      <Turnstile
                        siteKey={TURNSTILE_SITE_KEY}
                        language={language}
                        onVerify={(token) => setTurnstileToken(token)}
                        onExpire={() => setTurnstileToken("")}
                        onError={() => setTurnstileToken("")}
                        resetSignal={turnstileResetSignal}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("form.captcha.note")}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    className={CTA_FULL_CLASS}
                    data-testid="run-review-submit-button"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Sparkles className="h-5 w-5" />
                    )}
                    {isAnalyzing ? t("form.submit.analyzing") : t("form.submit.cta")}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {isAnalyzing && (
              <Card className="soft-card analysis-card" data-testid="analysis-progress-card">
                <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {t("analysis.description")}
                </CardContent>
              </Card>
            )}

            {review && (
              <section ref={resultsRef} className="space-y-6" data-testid="results-report">
                {copyNotice && (
                  <div className="copy-notice" data-testid="copy-notice">
                    {copyNotice}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Card className="score-summary-card" data-testid="overall-score">
                    <CardContent className="flex items-center gap-5 p-6">
                      <ScoreRing score={review.overall_score} size="large" />
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {t("report.overallScore")}
                        </p>
                        <h2 className="font-heading text-2xl font-semibold">
                          {review.overall_score}/10
                        </h2>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="soft-card md:col-span-2" data-testid="overall-assessment-card">
                    <CardHeader>
                      <CardTitle className="font-heading">
                        {t("report.overallAssessment")}
                      </CardTitle>
                      <CardDescription>
                        {[
                          activeReview.job_title || t("report.generalReview"),
                          activeReview.industry,
                          seniorityLabel,
                          marketLabel,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="leading-7 text-muted-foreground">
                        {review.overall_assessment}
                      </p>
                      {activeReview.was_truncated && (
                        <Badge variant="secondary">{t("report.longCvTrimmed")}</Badge>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="bg-card"
                          onClick={downloadHtml}
                          data-testid="download-html-button"
                        >
                          {t("report.downloadHtml")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="bg-card"
                          onClick={downloadTranslatedJson}
                          data-testid="download-json-button"
                        >
                          {t("report.downloadJson")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-2"
                          onClick={() => {
                            const focusAreas = [];
                            (review.priority_recommendations || [])
                              .slice(0, 3)
                              .forEach((r) => r?.title && focusAreas.push(r.title));
                            (review.dimensions || []).forEach((d) => {
                              (d?.improvements || [])
                                .slice(0, 1)
                                .forEach((imp) => focusAreas.push(imp));
                            });
                            const prefill = {
                              cvSummary: (cvText || "").trim().slice(0, 6000),
                              jobTitle: activeReview?.job_title || "",
                              industry: activeReview?.industry || "",
                              seniority: activeReview?.seniority || "Mid-level",
                              market: activeReview?.market || "Finland",
                              focusAreas: focusAreas.slice(0, 6),
                            };
                            try {
                              sessionStorage.setItem(
                                "ucvra.interview.prefill",
                                JSON.stringify(prefill),
                              );
                            } catch (_err) {
                              // ignore
                            }
                            navigate("/interview", { state: { prefill } });
                          }}
                          data-testid="practice-with-interviewer-button"
                        >
                          <MessageSquare className="h-4 w-4" />
                          {t("report.practiceInterview")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {review.key_strength && (
                  <Card className="soft-card" data-testid="key-strength-card">
                    <CardHeader>
                      <CardTitle className="font-heading flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />{" "}
                        {t("report.keyStrength")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="font-heading text-lg font-semibold">
                        {review.key_strength.title}
                      </p>
                      <p className="leading-7 text-muted-foreground">
                        {review.key_strength.explanation}
                      </p>
                    </CardContent>
                  </Card>
                )}

                <ReportSection review={review} onCopy={handleCopy} />
              </section>
            )}
          </section>
        </div>
      </main>
    </SiteLayout>
  );
}

export default App;
