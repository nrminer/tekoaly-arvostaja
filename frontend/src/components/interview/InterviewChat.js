import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { AudioAnswerPanel } from "@/components/interview/AudioAnswerPanel";

/**
 * Conversation panel: interviewer turns + candidate textarea + voice toggle +
 * configurable per-answer timer + local <video> preview (no upload) when
 * the user has explicitly consented to camera.
 */
export function InterviewChat({
  language,
  mode,
  messages,
  currentTurn,
  onSubmitAnswer,
  onFinish,
  isBusy,
  isSpeaking,
  onToggleSpeak,
  timerSeconds = 90,
  timerOptions = [60, 90, 120],
  onTimerSecondsChange,
  cameraStream,
  onStopCamera,
  sessionId,
  t,
}) {
  const [answer, setAnswer] = useState("");
  const [pendingAudio, setPendingAudio] = useState(null);
  const [useTimer, setUseTimer] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(timerSeconds);
  const answerRef = useRef(answer);
  answerRef.current = answer;
  const videoRef = useRef(null);
  const scrollRef = useRef(null);

  const appendFinal = useCallback(
    (chunk) => setAnswer((prev) => (prev ? `${prev} ${chunk}`.replace(/\s+/g, " ") : chunk)),
    [],
  );
  const handleAudioTranscript = useCallback((text, audioMeta) => {
    appendFinal(text);
    if (audioMeta?.blob) setPendingAudio(audioMeta);
  }, [appendFinal]);
  const speech = useSpeechRecognition({ language, onFinalAppend: appendFinal });

  // Attach the camera MediaStream to the local <video> element, if provided.
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Per-answer countdown timer.
  useEffect(() => {
    if (!useTimer) return undefined;
    // Reset the clock every time a new interviewer turn arrives.
    setSecondsLeft(timerSeconds);
    const id = setInterval(() => {
      setSecondsLeft((s) => (s <= 0 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [currentTurn?.next_prompt, timerSeconds, useTimer]);

  // Auto-scroll to bottom on new turn. RAF batches the read+write so the
  // browser doesn't have to flush layout synchronously mid-render.
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, currentTurn?.next_prompt]);

  const handleSend = async () => {
    const text = answer.trim();
    if (!text || isBusy) return;
    speech.stop();
    await onSubmitAnswer(text, pendingAudio);
    setAnswer("");
    setPendingAudio(null);
  };

  const isFinal = currentTurn?.is_final;

  return (
    <div className="space-y-4">
      {mode === "video" && cameraStream && (
        <Card className="soft-card" data-testid="video-preview-card">
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              preload="metadata"
              className="aspect-video w-full rounded-xl bg-black object-cover sm:h-40 sm:w-56"
              data-testid="local-video-preview"
            />
            <div className="flex-1 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">
                {t("interview.video.privacyTitle")}
              </p>
              <p className="mt-1">{t("interview.video.privacyBody")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 gap-2 bg-card"
                onClick={onStopCamera}
                data-testid="video-stop-camera-button"
              >
                <CameraOff className="h-4 w-4" /> {t("interview.video.stop")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="soft-card">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div
            ref={scrollRef}
            className="max-h-[240px] space-y-3 overflow-y-auto rounded-xl bg-muted/30 p-3 sm:max-h-[360px] overscroll-y-contain [touch-action:pan-y]"
            data-testid="interview-transcript"
          >
            {messages.map((m, idx) => (
              <div
                key={`${m.role}-${idx}`}
                className={`flex ${m.role === "candidate" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                    m.role === "candidate"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground border"
                  }`}
                  data-testid={`transcript-${m.role}-${idx}`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {isBusy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("interview.thinking")}
              </div>
            )}
          </div>

          {currentTurn?.interim_feedback && (
            <div
              className="rounded-xl border border-dashed bg-accent/40 px-3 py-2 text-sm"
              data-testid="interim-feedback"
            >
              <span className="font-semibold">{t("interview.interimLabel")}:</span>{" "}
              {currentTurn.interim_feedback}
            </div>
          )}

          {!isFinal && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" data-testid="current-question-type">
                  {t(`interview.qtype.${currentTurn?.question_type || "opening"}`)}
                </Badge>
                <label className="flex min-h-[2.75rem] items-center gap-2 sm:ml-auto" data-testid="interview-timer-label">
                  <input
                    type="checkbox"
                    checked={useTimer}
                    onChange={(e) => setUseTimer(e.target.checked)}
                    data-testid="interview-timer-toggle"
                  />
                  {t("interview.timer.use", { seconds: timerSeconds })}
                </label>
                <span className="text-xs text-muted-foreground" data-testid="interview-timer-optional-note">
                  {t("interview.timer.help")}
                </span>
                <select
                  value={timerSeconds}
                  onChange={(event) => onTimerSecondsChange?.(Number(event.target.value))}
                  className="min-h-11 rounded-md border bg-card px-3 text-xs text-foreground"
                  aria-label={t("interview.timer.selectLabel")}
                  data-testid="interview-timer-select"
                >
                  {timerOptions.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds} s
                    </option>
                  ))}
                </select>
                {useTimer && (
                  <span
                    className={`font-mono ${secondsLeft <= 10 ? "text-destructive" : ""}`}
                    data-testid="interview-timer-countdown"
                  >
                    {secondsLeft}s
                  </span>
                )}
              </div>
              <Textarea
                value={answer + (speech.interim ? ` ${speech.interim}` : "")}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t("interview.answerPlaceholder")}
                className="min-h-20 resize-y bg-card sm:min-h-28"
                data-testid="interview-answer-textarea"
                disabled={isBusy}
              />
              <AudioAnswerPanel
                language={language}
                sessionId={sessionId}
                isBusy={isBusy}
                onTranscript={handleAudioTranscript}
                t={t}
              />
              {pendingAudio && (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="pending-audio-indicator"
                >
                  {t("interview.audio.attached", {
                    seconds: Math.round(
                      pendingAudio?.transcriptResult?.total_duration || 0,
                    ),
                  })}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-2 bg-card sm:w-auto"
                  onClick={speech.isListening ? speech.stop : speech.start}
                  disabled={!speech.supported || isBusy}
                  data-testid="voice-input-toggle-button"
                >
                  {speech.isListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                  {speech.isListening
                    ? t("interview.voice.stop")
                    : speech.supported
                      ? t("interview.voice.start")
                      : t("interview.voice.unsupported")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-2 bg-card sm:w-auto"
                  onClick={onToggleSpeak}
                  data-testid="tts-toggle-button"
                >
                  {isSpeaking ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  {isSpeaking ? t("interview.tts.stop") : t("interview.tts.replay")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-center gap-2 sm:w-auto"
                  onClick={onFinish}
                  disabled={isBusy}
                  data-testid="interview-finish-button"
                >
                  {t("interview.finishNow")}
                </Button>
                <Button
                  type="button"
                  className="w-full justify-center gap-2 sm:ml-auto sm:w-auto"
                  onClick={handleSend}
                  disabled={isBusy || answer.trim().length < 2}
                  data-testid="interview-submit-answer-button"
                >
                  <Send className="h-4 w-4" /> {t("interview.submit")}
                </Button>
              </div>
              {mode === "video" && !cameraStream && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Camera className="h-3 w-3" /> {t("interview.video.offHint")}
                </p>
              )}
              {speech.error && speech.error !== "no-speech" && (
                <p className="text-xs text-destructive">
                  {t("interview.voice.errorPrefix")}: {speech.error}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
