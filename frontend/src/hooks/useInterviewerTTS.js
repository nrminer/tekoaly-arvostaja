import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Fetch TTS audio for a given prompt and play it via an <audio> element.
 * The base64 payload is converted to a Blob URL on demand and revoked after
 * playback ends — nothing is cached on disk or localStorage.
 */
export function useInterviewerTTS({ voice = "nova" } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef(null);
  const blobUrlRef = useRef(null);

  const cleanupBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_err) {
        // ignore
      }
    }
    cleanupBlob();
    setIsSpeaking(false);
  }, [cleanupBlob]);

  const speak = useCallback(
    async ({ sessionId, text }) => {
      if (!sessionId || !text) return;
      stop();
      setError("");
      try {
        const res = await axios.post(`${API}/interview/tts`, {
          session_id: sessionId,
          text,
          voice,
        });
        const b64 = res.data?.audio_base64;
        if (!b64) throw new Error("no audio returned");
        // Decode base64 → Blob → object URL. Revoke after ended.
        const binary = atob(b64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "audio/mp3" });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          cleanupBlob();
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          cleanupBlob();
          setError("audio-playback-failed");
        };
        setIsSpeaking(true);
        await audio.play();
      } catch (err) {
        setIsSpeaking(false);
        cleanupBlob();
        setError(err?.response?.data?.detail || err?.message || "tts-failed");
      }
    },
    [cleanupBlob, stop, voice],
  );

  useEffect(() => () => stop(), [stop]);

  return { isSpeaking, error, speak, stop };
}
