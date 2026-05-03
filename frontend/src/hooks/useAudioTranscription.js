import { useCallback, useState } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Wrapper around POST /api/interview/transcribe.
 * Returns { transcribe, transcribing, error, lastResult } where lastResult is the
 * full backend payload (transcript_id, text, segments, metadata, ...).
 *
 * Privacy: the audio Blob lives only in the request body — the hook never caches
 * or stores it. The transcript_id can be used by callers to fetch SRT/VTT/MD.
 */
export function useAudioTranscription() {
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState(null);

  const transcribe = useCallback(
    async ({ blob, mimeType, language = "fi", sessionId }) => {
      if (!blob) return null;
      setTranscribing(true);
      setError("");
      try {
        const filename =
          mimeType?.includes("webm")
            ? "answer.webm"
            : mimeType?.includes("mp4")
              ? "answer.mp4"
              : "answer.wav";
        const file = new File([blob], filename, { type: blob.type || mimeType });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("language", language);
        if (sessionId) fd.append("session_id", sessionId);
        const res = await axios.post(`${API}/interview/transcribe`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120_000,
        });
        setLastResult(res.data);
        return res.data;
      } catch (err) {
        const detail =
          err?.response?.data?.detail ||
          err?.message ||
          "transcription-failed";
        setError(typeof detail === "string" ? detail : JSON.stringify(detail));
        throw err;
      } finally {
        setTranscribing(false);
      }
    },
    [],
  );

  const transcriptDownloadUrl = useCallback((transcriptId, format) => {
    if (!transcriptId || !format) return "";
    return `${API}/audio/transcript/${transcriptId}/${format}`;
  }, []);

  return { transcribe, transcribing, error, lastResult, transcriptDownloadUrl };
}
