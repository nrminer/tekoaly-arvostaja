import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Speech API wrapper — 100% browser-local, no audio ever uploaded.
 * Supports Finnish (`fi-FI`) and English (`en-US`). Returns interim + final
 * transcripts so the UI can show live text as the candidate speaks.
 *
 * `onFinalAppend(text)` fires once per finalized chunk so the caller can
 * accumulate the full answer into a controlled textarea without losing words
 * between restarts.
 */
export function useSpeechRecognition({ language = "fi", onFinalAppend } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);
  const manualStopRef = useRef(false);

  // Stable ref — SpeechRecognition is set once at mount; reading it inside
  // useCallback deps would cause `start` to be recreated on every render.
  const SpeechRecognitionRef = useRef(
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null,
  );
  const SpeechRecognition = SpeechRecognitionRef.current;
  const supported = Boolean(SpeechRecognition);

  const start = useCallback(() => {
    if (!supported) {
      setError("speech-unsupported");
      return;
    }
    setError("");
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = language === "fi" ? "fi-FI" : "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (event) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const res = event.results[i];
          if (res.isFinal) finalChunk += res[0].transcript;
          else interimChunk += res[0].transcript;
        }
        if (finalChunk && onFinalAppend) onFinalAppend(finalChunk);
        setInterim(interimChunk);
      };

      recognition.onerror = (event) => {
        // "no-speech" is informational — user paused; "not-allowed" is a real block.
        if (event?.error && event.error !== "no-speech") {
          setError(String(event.error));
        }
      };

      recognition.onend = () => {
        // Auto-restart unless the user clicked stop.
        if (!manualStopRef.current) {
          try {
            recognition.start();
            return;
          } catch (_err) {
            // if restart fails, fall through and actually stop
          }
        }
        setIsListening(false);
        setInterim("");
      };

      recognitionRef.current = recognition;
      manualStopRef.current = false;
      recognition.start();
      setIsListening(true);
    } catch (err) {
      setError(err?.message || "speech-start-failed");
    }
  }, [SpeechRecognition, language, onFinalAppend, supported]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch (_err) {
        // ignore
      }
    }
    setIsListening(false);
    setInterim("");
  }, []);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch (_err) {
          // ignore
        }
      }
    };
  }, []);

  return { supported, isListening, interim, error, start, stop };
}
