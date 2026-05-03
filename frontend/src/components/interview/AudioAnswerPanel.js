import { useCallback, useRef, useState } from "react";
import { Loader2, Mic, Square, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useAudioTranscription } from "@/hooks/useAudioTranscription";

/**
 * Records or uploads an audio answer, sends it to the backend Whisper pipeline,
 * and surfaces the transcribed text + segment count so the candidate can confirm
 * before submitting. The transcribed text is appended to the active answer
 * textarea via `onTranscript`.
 */
const ACCEPTED_TYPES = ".wav,.mp3,.m4a,.ogg,.flac,.mp4,.webm";
const SECONDS_FORMATTER = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export function AudioAnswerPanel({
  language,
  sessionId,
  onTranscript,
  isBusy,
  t,
}) {
  const recorder = useAudioRecorder({ maxDurationSeconds: 240 });
  const transcription = useAudioTranscription();
  const fileInputRef = useRef(null);
  const [statusText, setStatusText] = useState("");
  const [lastSegments, setLastSegments] = useState(0);
  const [lastDuration, setLastDuration] = useState(0);
  const [lastTranscriptId, setLastTranscriptId] = useState("");

  const sendBlob = useCallback(
    async (blob, mimeType) => {
      if (!blob || blob.size === 0) {
        setStatusText(t("interview.audio.error.empty"));
        return;
      }
      setStatusText(t("interview.audio.status.transcribing"));
      try {
        const result = await transcription.transcribe({
          blob,
          mimeType,
          language,
          sessionId,
        });
        if (result?.text) {
          // We hand BOTH the text and the raw recording up so the parent can
          // bundle audio + transcript into the final HTML report. The blob
          // stays in the browser — never re-uploaded after this call.
          onTranscript?.(result.text, {
            blob,
            mimeType: mimeType || blob.type,
            transcriptResult: result,
          });
          setStatusText(
            t("interview.audio.status.done", {
              segments: result.segments?.length || 0,
              seconds: Math.round(result.total_duration || 0),
            }),
          );
        } else {
          setStatusText(t("interview.audio.status.empty"));
        }
        setLastSegments(result?.segments?.length || 0);
        setLastDuration(Math.round(result?.total_duration || 0));
        setLastTranscriptId(result?.transcript_id || "");
      } catch (_err) {
        // useAudioTranscription already exposes `error`; just clear our status.
        setStatusText("");
      }
    },
    [language, onTranscript, sessionId, t, transcription],
  );

  const handleStartRecording = async () => {
    setStatusText("");
    setLastSegments(0);
    setLastDuration(0);
    setLastTranscriptId("");
    const ok = await recorder.start();
    if (!ok) {
      setStatusText(t("interview.audio.error.permission"));
    }
  };

  const handleStopRecording = async () => {
    const result = await recorder.stop();
    if (result?.blob) {
      await sendBlob(result.blob, result.mimeType);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatusText(t("interview.audio.status.uploading", { name: file.name }));
    setLastSegments(0);
    setLastDuration(0);
    setLastTranscriptId("");
    await sendBlob(file, file.type);
  };

  const peakPercent = Math.min(100, Math.round((recorder.peakLevel || 0) * 140));
  const meterColor =
    peakPercent < 8
      ? "bg-amber-400"
      : peakPercent < 60
        ? "bg-emerald-500"
        : peakPercent < 90
          ? "bg-amber-500"
          : "bg-destructive";

  const disableActions = isBusy || transcription.transcribing;
  const canStartRecording = recorder.supported && !recorder.isRecording && !disableActions;

  return (
    <div
      className="rounded-xl border border-dashed bg-muted/30 p-3 text-xs sm:text-sm"
      data-testid="audio-answer-panel"
    >
      <div className="flex flex-wrap items-center gap-2">
        {!recorder.isRecording ? (
          <Button
            type="button"
            variant="outline"
            className="gap-2 bg-card"
            onClick={handleStartRecording}
            disabled={!canStartRecording}
            data-testid="audio-record-start-button"
          >
            <Mic className="h-4 w-4" />
            {recorder.supported
              ? t("interview.audio.record.start")
              : t("interview.audio.record.unsupported")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            className="gap-2"
            onClick={handleStopRecording}
            disabled={transcription.transcribing}
            data-testid="audio-record-stop-button"
          >
            <Square className="h-4 w-4" />
            {t("interview.audio.record.stop")}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="gap-2 bg-card"
          onClick={() => fileInputRef.current?.click()}
          disabled={disableActions || recorder.isRecording}
          data-testid="audio-upload-button"
        >
          <Upload className="h-4 w-4" />
          {t("interview.audio.upload")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={handleFileChange}
          data-testid="audio-upload-input"
        />
        {transcription.transcribing && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("interview.audio.status.transcribing")}
          </span>
        )}
      </div>

      {recorder.isRecording && (
        <div className="mt-3 space-y-1" data-testid="audio-meter">
          <div className="flex items-center justify-between text-muted-foreground">
            <span data-testid="audio-elapsed">
              {SECONDS_FORMATTER(recorder.elapsed)} / {SECONDS_FORMATTER(recorder.maxDurationSeconds)}
            </span>
            <span>
              {peakPercent < 8
                ? t("interview.audio.meter.tooQuiet")
                : peakPercent > 90
                  ? t("interview.audio.meter.tooLoud")
                  : t("interview.audio.meter.ok")}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-[width] duration-100 ${meterColor}`}
              style={{ width: `${peakPercent}%` }}
              data-testid="audio-meter-fill"
            />
          </div>
        </div>
      )}

      {(statusText || transcription.error || lastTranscriptId) && (
        <div className="mt-3 space-y-2">
          {statusText && (
            <p className="text-muted-foreground" data-testid="audio-status-text">
              {statusText}
            </p>
          )}
          {transcription.error && (
            <p className="text-destructive" data-testid="audio-error-text">
              {t("interview.audio.error.prefix")}: {transcription.error}
            </p>
          )}
          {lastTranscriptId && (
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span data-testid="audio-last-stats">
                {t("interview.audio.status.summary", {
                  segments: lastSegments,
                  seconds: lastDuration,
                })}
              </span>
              <a
                href={transcription.transcriptDownloadUrl(lastTranscriptId, "srt")}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
                data-testid="audio-download-srt"
              >
                SRT
              </a>
              <a
                href={transcription.transcriptDownloadUrl(lastTranscriptId, "vtt")}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
                data-testid="audio-download-vtt"
              >
                VTT
              </a>
              <a
                href={transcription.transcriptDownloadUrl(lastTranscriptId, "md")}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
                data-testid="audio-download-md"
              >
                MD
              </a>
              <a
                href={transcription.transcriptDownloadUrl(lastTranscriptId, "json")}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
                data-testid="audio-download-json"
              >
                JSON
              </a>
            </div>
          )}
        </div>
      )}
      {recorder.error && recorder.error !== "no-speech" && (
        <p className="mt-2 text-destructive" data-testid="audio-recorder-error">
          {t("interview.audio.error.prefix")}: {recorder.error}
        </p>
      )}
    </div>
  );
}
