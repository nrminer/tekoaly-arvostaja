import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { ArrowRight, CheckCircle2, FileText, MessageSquare, Sparkles } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { CameraConsentModal } from "@/components/interview/CameraConsentModal";
import { InterviewChat } from "@/components/interview/InterviewChat";
import { InterviewSummary } from "@/components/interview/InterviewSummary";
import { FileDropzone } from "@/components/FileDropzone";
import { SiteLayout } from "@/components/SiteLayout";
import { Turnstile } from "@/components/Turnstile";
import { useInterviewerTTS } from "@/hooks/useInterviewerTTS";
import { useI18n } from "@/i18n";
import appConfig from "@app-config";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

const SENIORITY_LEVELS = [
  "Student/Intern",
  "Early-career",
  "Mid-level",
  "Senior",
  "Lead/Principal",
  "Executive",
];
const MARKETS = ["Finland", "Nordics", "US", "EU"];

const PREFILL_KEY = "ucvra.interview.prefill";
const CTA_FULL_CLASS = "h-12 w-full gap-2 rounded-xl text-base";

export default function InterviewPage() {
  const { language, t } = useI18n();
  const location = useLocation();
  const prefillFromState = location.state?.prefill;

  const [mode, setMode] = useState("chat"); // chat | video
  const [cvInputMode, setCvInputMode] = useState("upload"); // upload | paste
  const [cvFile, setCvFile] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedFilename, setExtractedFilename] = useState("");
  const [cvSummary, setCvSummary] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [seniority, setSeniority] = useState("Mid-level");
  const [market, setMarket] = useState("Finland");
  const [jobDescription, setJobDescription] = useState("");
  const [focusAreas, setFocusAreas] = useState([]);
  const [focusInput, setFocusInput] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(appConfig.interviewTimerSecondsDefault);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);

  const [sessionId, setSessionId] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]); // {role:"interviewer"|"candidate", content}
  const [currentTurn, setCurrentTurn] = useState(null);
  const [finalSummary, setFinalSummary] = useState(null);

  const [consentOpen, setConsentOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  const tts = useInterviewerTTS({ voice: "nova" });

  // Prefill CV summary from either Link state or sessionStorage.
  useEffect(() => {
    if (prefillFromState) {
      if (prefillFromState.cvSummary) setCvSummary(prefillFromState.cvSummary);
      if (prefillFromState.jobTitle) setJobTitle(prefillFromState.jobTitle);
      if (prefillFromState.industry) setIndustry(prefillFromState.industry);
      if (prefillFromState.seniority) setSeniority(prefillFromState.seniority);
      if (prefillFromState.market) setMarket(prefillFromState.market);
      if (Array.isArray(prefillFromState.focusAreas)) setFocusAreas(prefillFromState.focusAreas);
      return;
    }
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.cvSummary) setCvSummary(data.cvSummary);
        if (data.jobTitle) setJobTitle(data.jobTitle);
        if (data.industry) setIndustry(data.industry);
        if (data.seniority) setSeniority(data.seniority);
        if (data.market) setMarket(data.market);
        if (Array.isArray(data.focusAreas)) setFocusAreas(data.focusAreas);
      }
    } catch (_err) {
      // ignore — sessionStorage may be unavailable in some browsers
    }
  }, [prefillFromState]);

  const prefillNoticeVisible = Boolean(prefillFromState || cvSummary);

  const handleAddFocus = () => {
    const v = focusInput.trim();
    if (!v) return;
    setFocusAreas((prev) => (prev.includes(v) ? prev : [...prev, v]).slice(0, 6));
    setFocusInput("");
  };
  const handleRemoveFocus = (idx) =>
    setFocusAreas((prev) => prev.filter((_, i) => i !== idx));

  // Auto-extract text from an uploaded PDF/DOCX and drop it into cvSummary
  // so the user can review/edit it before starting the interview.
  useEffect(() => {
    if (!cvFile) {
      setIsExtracting(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsExtracting(true);
      setError("");
      try {
        const fd = new FormData();
        fd.append("file", cvFile);
        const res = await axios.post(`${API}/interview/extract-cv`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (cancelled) return;
        const text = (res.data?.cv_text || "").trim();
        if (text) {
          setCvSummary(text);
          setExtractedFilename(res.data?.filename || cvFile.name);
        }
      } catch (err) {
        if (cancelled) return;
        const detail = err?.response?.data?.detail || "extract-failed";
        setError(typeof detail === "string" ? detail : JSON.stringify(detail));
        setCvFile(null);
      } finally {
        if (!cancelled) setIsExtracting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cvFile]);

  const canStart = useMemo(() => {
    if (isStarting || isExtracting) return false;
    if (TURNSTILE_SITE_KEY && !turnstileToken) return false;
    return cvSummary.trim().length >= 40;
  }, [cvSummary, isExtracting, isStarting, turnstileToken]);

  const requestCameraConsent = () => {
    setConsentOpen(true);
  };

  const startCamera = async () => {
    setConsentOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      setCameraStream(stream);
    } catch (err) {
      setError(
        `${t("interview.video.cameraError")}: ${err?.message || err?.name || "unknown"}`,
      );
      setMode("chat");
    }
  };

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_err) {
          // ignore
        }
      });
      setCameraStream(null);
    }
  }, [cameraStream]);

  // Safety: when sessionId clears, ensure camera stops too.
  useEffect(() => {
    if (!sessionId && cameraStream) {
      stopCamera();
    }
  }, [sessionId, cameraStream, stopCamera]);

  const speakTurn = useCallback(
    async (text, sid = sessionId) => {
      if (!sid || !text) return;
      try {
        await tts.speak({ sessionId: sid, text });
      } catch (_err) {
        // TTS failure shouldn't crash the session; the text is still visible.
      }
    },
    [sessionId, tts],
  );

  const handleStart = async () => {
    setError("");
    if (!canStart) {
      setError(
        TURNSTILE_SITE_KEY && !turnstileToken
          ? t("form.error.captcha")
          : t("interview.error.summaryTooShort"),
      );
      return;
    }
    if (mode === "video" && !cameraStream) {
      requestCameraConsent();
      return;
    }
    setIsStarting(true);
    try {
      const res = await axios.post(`${API}/interview/start`, {
        language,
        mode,
        consent_video: mode === "video" && Boolean(cameraStream),
        cv_summary: cvSummary.trim(),
        job_title: jobTitle.trim(),
        industry: industry.trim(),
        seniority,
        market,
        job_description: jobDescription.trim(),
        focus_areas: focusAreas,
        timer_seconds: timerSeconds,
        turnstile_token: turnstileToken || undefined,
      });
      const data = res.data;
      setSessionId(data.session_id);
      setTimerSeconds(data.timer_seconds || timerSeconds);
      const turn = data.turn;
      setCurrentTurn(turn);
      setMessages([{ role: "interviewer", content: turn.next_prompt }]);
      // Speak the first turn (auto-play).
      speakTurn(turn.next_prompt, data.session_id);
      setTurnstileToken("");
      setTurnstileResetSignal(Date.now());
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        (language === "fi"
          ? "Haastattelun aloitus epäonnistui."
          : "Could not start the interview.");
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
      setTurnstileToken("");
      setTurnstileResetSignal(Date.now());
    } finally {
      setIsStarting(false);
    }
  };

  const handleAnswer = async (text, audioMeta = null) => {
    if (!sessionId) return;
    setIsBusy(true);
    setError("");
    setMessages((prev) => [
      ...prev,
      { role: "candidate", content: text, audio: audioMeta || null },
    ]);
    try {
      const res = await axios.post(`${API}/interview/turn`, {
        session_id: sessionId,
        user_answer: text,
      });
      const turn = res.data.turn;
      setCurrentTurn(turn);
      setMessages((prev) => [...prev, { role: "interviewer", content: turn.next_prompt }]);
      if (turn.is_final && turn.end_session_summary) {
        setFinalSummary(turn.end_session_summary);
        stopCamera();
      } else {
        speakTurn(turn.next_prompt);
      }
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        (language === "fi" ? "Vastauksen lähetys epäonnistui." : "Answer submission failed.");
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setIsBusy(false);
    }
  };

  const handleFinishNow = async () => {
    if (!sessionId) return;
    setIsBusy(true);
    try {
      const res = await axios.post(`${API}/interview/finish`, { session_id: sessionId });
      const turn = res.data.turn;
      setCurrentTurn(turn);
      setMessages((prev) => [...prev, { role: "interviewer", content: turn.next_prompt }]);
      if (turn.end_session_summary) setFinalSummary(turn.end_session_summary);
      stopCamera();
    } catch (err) {
      const detail = err?.response?.data?.detail || "finish failed";
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setIsBusy(false);
    }
  };

  function handleErrorRecovery() {
    setError("");
    const target = document.getElementById("cvSummary");
    target?.focus?.();
    target?.scrollIntoView?.({ block: "center" });
  }

  const handleReset = async () => {
    if (sessionId) {
      try {
        await axios.delete(`${API}/interview/${sessionId}`);
      } catch (_err) {
        // best-effort
      }
    }
    setSessionId("");
    setMessages([]);
    setCurrentTurn(null);
    setFinalSummary(null);
    setError("");
    stopCamera();
  };

  const downloadSummaryJson = () => {
    if (!finalSummary) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            session_id: sessionId,
            language,
            mode,
            target: {
              job_title: jobTitle,
              industry,
              seniority,
              market,
              focus_areas: focusAreas,
            },
            transcript: messages,
            summary: finalSummary,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mock-interview-${sessionId || Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Clean up on tab close.
  const unloadCleanupRef = useRef();
  unloadCleanupRef.current = { sessionId, stopCamera };
  useEffect(() => {
    const handler = () => {
      const { sessionId: sid, stopCamera: stopFn } = unloadCleanupRef.current;
      if (sid) {
        // Fire-and-forget best-effort cleanup. The backend endpoint is DELETE,
        // so use keepalive fetch instead of sendBeacon (which sends POST).
        fetch(`${API}/interview/${sid}`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
      stopFn?.();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return (
    <SiteLayout>
      <main className="flex-1">
        {/* ── Page hero ── */}
        <div className="hero-gradient border-b bg-gradient-to-b from-accent/50 via-accent/10 to-background">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
            <h1
              className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl"
              data-testid="interview-hero-title"
            >
              {t("interview.hero.title")}
            </h1>
            <p
              className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg"
              data-testid="interview-hero-description"
            >
              {t("interview.hero.description")}
            </p>
            <p
              className="mt-1.5 text-[11px] text-muted-foreground"
              data-testid="interview-language-notice"
            >
              {t("app.languageNotice")}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="gap-2 rounded-xl"
                onClick={() =>
                  document
                    .getElementById("interview-setup")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                data-testid="interview-hero-start-button"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                {t("home.interview.cta")}
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="gap-2 rounded-xl bg-card"
                data-testid="interview-hero-cv-button"
              >
                <Link to="/">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {t("hero.cta.check")}
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Feature cards ── */}
        <div className="border-b bg-muted/10">
          <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Interview practice — primary on this page */}
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
                    className="mt-2 w-full gap-2 rounded-xl"
                    onClick={() =>
                      document
                        .getElementById("interview-setup")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    data-testid="feature-interview-scroll-cta"
                  >
                    {t("home.interview.cta")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>

              {/* CV review — secondary on this page */}
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
                    asChild
                    variant="outline"
                    className="mt-2 w-full gap-2 rounded-xl bg-card"
                    data-testid="feature-cv-link-cta"
                  >
                    <Link to="/">
                      {t("home.cv.cta")}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* ── Setup / session / summary ── */}
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          <section className="space-y-6">
            {!sessionId && !finalSummary && (
              <Card
                id="interview-setup"
                className="soft-card scroll-mt-20"
                data-testid="interview-setup-card"
              >
                <CardHeader>
                  <CardTitle className="font-heading text-2xl">
                    {t("interview.setup.title")}
                  </CardTitle>
                  <CardDescription>{t("interview.setup.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {prefillNoticeVisible && (
                    <div className="flex items-start gap-2 rounded-xl bg-accent/60 p-3 text-sm">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <p>{t("interview.setup.prefillNotice")}</p>
                    </div>
                  )}

                  <Tabs value={mode} onValueChange={setMode} className="w-full">
                    <TabsList className="grid w-full grid-cols-2" data-testid="interview-mode-tabs">
                      <TabsTrigger value="chat" data-testid="interview-mode-chat">
                        {t("interview.mode.chat")}
                      </TabsTrigger>
                      <TabsTrigger value="video" data-testid="interview-mode-video">
                        {t("interview.mode.video")}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {mode === "video" && (
                    <Alert data-testid="video-consent-alert">
                      <AlertTitle className="font-heading">
                        {t("interview.video.consentTitle")}
                      </AlertTitle>
                      <AlertDescription>
                        {t("interview.video.consentDescription")}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="cvSummary">{t("interview.setup.cvSummary")}</Label>
                    <Tabs value={cvInputMode} onValueChange={setCvInputMode} className="w-full">
                      <TabsList
                        className="grid w-full grid-cols-2"
                        data-testid="interview-cv-input-tabs"
                      >
                        <TabsTrigger value="upload" data-testid="interview-cv-upload-tab">
                          {t("form.tabs.upload")}
                        </TabsTrigger>
                        <TabsTrigger value="paste" data-testid="interview-cv-paste-tab">
                          {t("form.tabs.paste")}
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="upload" className="mt-4 space-y-3">
                        <FileDropzone file={cvFile} onFileChange={setCvFile} />
                        {isExtracting && (
                          <p
                            className="text-sm text-muted-foreground"
                            data-testid="interview-cv-extracting"
                          >
                            {t("interview.setup.extracting")}
                          </p>
                        )}
                        {extractedFilename && cvSummary && !isExtracting && (
                          <p
                            className="text-xs text-muted-foreground"
                            data-testid="interview-cv-extracted-note"
                          >
                            {t("interview.setup.extractedFrom", {
                              name: extractedFilename,
                            })}
                          </p>
                        )}
                      </TabsContent>
                      <TabsContent value="paste" className="mt-4">
                        <Textarea
                          id="cvSummary"
                          value={cvSummary}
                          onChange={(e) => setCvSummary(e.target.value)}
                          className="min-h-32 resize-y bg-card sm:min-h-40"
                          placeholder={t("interview.setup.cvSummaryPlaceholder")}
                          data-testid="interview-cv-summary-textarea"
                        />
                      </TabsContent>
                    </Tabs>
                    <p className="text-xs text-muted-foreground">
                      {t("interview.setup.cvSummaryHint", {
                        n: cvSummary.length.toLocaleString(),
                      })}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="iJobTitle">{t("form.jobTitle")}</Label>
                      <Input
                        id="iJobTitle"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder={t("form.jobTitlePlaceholder")}
                        data-testid="interview-job-title-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="iIndustry">{t("form.industry")}</Label>
                      <Input
                        id="iIndustry"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        placeholder={t("form.industryPlaceholder")}
                        data-testid="interview-industry-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="iSeniority">{t("form.seniority")}</Label>
                      <Select value={seniority} onValueChange={setSeniority}>
                        <SelectTrigger
                          id="iSeniority"
                          className="bg-card"
                          data-testid="interview-seniority-select"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SENIORITY_LEVELS.map((level) => (
                            <SelectItem
                              key={level}
                              value={level}
                              data-testid={`interview-seniority-option-${level
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
                      <Label htmlFor="iMarket">{t("form.market")}</Label>
                      <Select value={market} onValueChange={setMarket}>
                        <SelectTrigger
                          id="iMarket"
                          className="bg-card"
                          data-testid="interview-market-select"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MARKETS.map((m) => (
                            <SelectItem
                              key={m}
                              value={m}
                              data-testid={`interview-market-option-${m.toLowerCase()}`}
                            >
                              {t(`market.${m}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="iJD">{t("form.jobDescription")}</Label>
                      <Textarea
                        id="iJD"
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        placeholder={t("form.jobDescriptionPlaceholder")}
                        data-testid="interview-jd-textarea"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="interviewTimerSeconds">{t("interview.timer.label")}</Label>
                      <Select
                        value={String(timerSeconds)}
                        onValueChange={(value) => setTimerSeconds(Number(value))}
                      >
                        <SelectTrigger
                          id="interviewTimerSeconds"
                          className="bg-card"
                          data-testid="interview-timer-setup-select"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {appConfig.interviewTimerSecondsOptions.map((seconds) => (
                            <SelectItem
                              key={seconds}
                              value={String(seconds)}
                              data-testid={`interview-timer-option-${seconds}`}
                            >
                              {seconds} s
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p
                        className="text-xs leading-5 text-muted-foreground"
                        data-testid="interview-timer-help-text"
                      >
                        {t("interview.timer.help")}
                      </p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="iFocus">{t("interview.setup.focusAreas")}</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="iFocus"
                          value={focusInput}
                          onChange={(e) => setFocusInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddFocus();
                            }
                          }}
                          placeholder={t("interview.setup.focusPlaceholder")}
                          data-testid="interview-focus-input"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddFocus}
                          data-testid="interview-focus-add-button"
                          className="w-full sm:w-auto"
                        >
                          {t("interview.setup.addFocus")}
                        </Button>
                      </div>
                      {focusAreas.length > 0 && (
                        <div
                          className="flex flex-wrap gap-2 pt-2"
                          data-testid="interview-focus-list"
                        >
                          {focusAreas.map((f, idx) => (
                            <button
                              key={`${f}-${idx}`}
                              type="button"
                              className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm hover:border-destructive"
                              onClick={() => handleRemoveFocus(idx)}
                              aria-label={`${t("interview.setup.removeFocus")}: ${f}`}
                              data-testid={`focus-chip-${idx}`}
                              title={t("interview.setup.removeFocus")}
                            >
                              {f} <span aria-hidden="true">×</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive" data-testid="interview-error-alert">
                      <AlertTitle>{t("form.error.title")}</AlertTitle>
                      <AlertDescription className="space-y-3">
                        <p>{error}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="bg-card"
                          onClick={handleErrorRecovery}
                          data-testid="interview-error-recovery-action"
                        >
                          {t("form.error.action")}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  {TURNSTILE_SITE_KEY && (
                    <div
                      className="flex flex-col items-center gap-2"
                      data-testid="interview-turnstile-container"
                    >
                      <Turnstile
                        siteKey={TURNSTILE_SITE_KEY}
                        language={language}
                        onVerify={(token) => setTurnstileToken(token)}
                        onExpire={() => setTurnstileToken("")}
                        onError={() => setTurnstileToken("")}
                        resetSignal={turnstileResetSignal}
                      />
                    </div>
                  )}

                  <Button
                    type="button"
                    disabled={!canStart}
                    className={CTA_FULL_CLASS}
                    onClick={handleStart}
                    data-testid="interview-start-button"
                  >
                    <Sparkles className="h-5 w-5" />
                    {isStarting ? t("interview.starting") : t("interview.start")}
                  </Button>
                </CardContent>
              </Card>
            )}

            {sessionId && !finalSummary && currentTurn && (
              <InterviewChat
                language={language}
                mode={mode}
                messages={messages}
                currentTurn={currentTurn}
                onSubmitAnswer={handleAnswer}
                onFinish={handleFinishNow}
                isBusy={isBusy}
                isSpeaking={tts.isSpeaking}
                onToggleSpeak={() =>
                  tts.isSpeaking ? tts.stop() : speakTurn(currentTurn.next_prompt)
                }
                timerSeconds={timerSeconds}
                timerOptions={appConfig.interviewTimerSecondsOptions}
                onTimerSecondsChange={setTimerSeconds}
                cameraStream={cameraStream}
                onStopCamera={stopCamera}
                sessionId={sessionId}
                t={t}
              />
            )}

            {finalSummary && (
              <InterviewSummary
                summary={finalSummary}
                messages={messages}
                target={{
                  job_title: jobTitle,
                  industry,
                  seniority,
                  market,
                  focus_areas: focusAreas,
                }}
                language={language}
                sessionId={sessionId}
                onReset={handleReset}
                onDownload={downloadSummaryJson}
                t={t}
              />
            )}
          </section>
        </div>
      </main>

      <CameraConsentModal
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onAccept={startCamera}
        t={t}
      />
    </SiteLayout>
  );
}
