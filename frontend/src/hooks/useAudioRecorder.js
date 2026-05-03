import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser audio recorder using MediaRecorder.
 *
 * Captures microphone audio as webm/opus (browser-native) which the backend
 * Whisper pipeline accepts directly. We also expose a peak meter so the UI
 * can warn the user when the input is too quiet — bad audio is the leading
 * cause of silent transcription accuracy degradation.
 *
 * Privacy: nothing is uploaded by this hook — it only produces a Blob the
 * caller can choose to send to the transcription endpoint.
 */
const DEFAULT_MAX_SECONDS = 240; // 4-minute hard cap per recording
const PEAK_DECAY = 0.8;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function useAudioRecorder({ maxDurationSeconds = DEFAULT_MAX_SECONDS } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [error, setError] = useState("");

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const startTsRef = useRef(0);
  const tickRef = useRef(null);
  const stopResolveRef = useRef(null);
  const mimeTypeRef = useRef("");

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof MediaRecorder !== "undefined";

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    try {
      analyserRef.current?.disconnect();
    } catch (_err) {
      // ignore
    }
    analyserRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      try {
        audioCtxRef.current.close();
      } catch (_err) {
        // ignore
      }
    }
    audioCtxRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_err) {
          // ignore
        }
      });
    }
    streamRef.current = null;
    recorderRef.current = null;
    setPeakLevel(0);
  }, []);

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        cleanup();
        setIsRecording(false);
        resolve(null);
        return;
      }
      stopResolveRef.current = resolve;
      const onStop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeTypeRef.current || "audio/webm",
        });
        chunksRef.current = [];
        const durationSeconds = (Date.now() - startTsRef.current) / 1000;
        cleanup();
        setIsRecording(false);
        const result = { blob, durationSeconds, mimeType: blob.type };
        if (stopResolveRef.current) {
          stopResolveRef.current(result);
          stopResolveRef.current = null;
        }
      };
      recorder.onstop = onStop;
      try {
        recorder.stop();
      } catch (_err) {
        onStop();
      }
    });
  }, [cleanup]);

  const start = useCallback(async () => {
    if (!supported) {
      setError("recorder-unsupported");
      return false;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      // Peak meter via WebAudio
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyser.getByteTimeDomainData(data);
          let max = 0;
          for (let i = 0; i < data.length; i += 1) {
            const v = Math.abs(data[i] - 128) / 128;
            if (v > max) max = v;
          }
          setPeakLevel((prev) => Math.max(max, prev * PEAK_DECAY));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      startTsRef.current = Date.now();
      tickRef.current = setInterval(() => {
        const seconds = (Date.now() - startTsRef.current) / 1000;
        setElapsed(seconds);
        if (seconds >= maxDurationSeconds) {
          stop();
        }
      }, 200);

      recorder.start(250); // collect 250ms chunks for smoother UX
      setElapsed(0);
      setIsRecording(true);
      return true;
    } catch (err) {
      cleanup();
      setError(err?.message || err?.name || "recorder-start-failed");
      setIsRecording(false);
      return false;
    }
  }, [cleanup, maxDurationSeconds, stop, supported]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    supported,
    isRecording,
    elapsed,
    peakLevel,
    error,
    start,
    stop,
    maxDurationSeconds,
  };
}
