import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget.
 *
 * Loads the Turnstile script once per session, then renders the challenge
 * widget into a <div>. Emits the verification token via `onVerify(token)` when
 * the user completes the challenge; `onExpire()` when the token expires
 * (~5 min after issuance); `onError()` on network/script errors. Call
 * `resetSignal` with a new value (e.g. `Date.now()`) to force a widget reset
 * after a successful submission — Turnstile tokens are single-use.
 *
 * Renders nothing visible until the CF script finishes loading.
 */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("no-window"));
  if (window.__turnstileScriptPromise) return window.__turnstileScriptPromise;
  window.__turnstileScriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src^="${SCRIPT_SRC.split("?")[0]}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script-load-failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script-load-failed"));
    document.head.appendChild(script);
  });
  return window.__turnstileScriptPromise;
}

export function Turnstile({
  siteKey,
  language = "auto",
  theme = "light",
  onVerify,
  onExpire,
  onError,
  resetSignal,
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbacksRef = useRef({ onVerify, onExpire, onError });

  // Keep latest callbacks referenced without re-rendering the widget.
  useEffect(() => {
    callbacksRef.current = { onVerify, onExpire, onError };
  }, [onVerify, onExpire, onError]);

  useEffect(() => {
    let cancelled = false;
    if (!siteKey) return undefined;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        // Defensive: avoid double-render on hot reload.
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
          widgetIdRef.current = null;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          language,
          callback: (token) => callbacksRef.current.onVerify?.(token),
          "expired-callback": () => callbacksRef.current.onExpire?.(),
          "error-callback": () => callbacksRef.current.onError?.(),
        });
      })
      .catch(() => callbacksRef.current.onError?.());

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, language]);

  // Reset when resetSignal changes (single-use tokens after a submission).
  useEffect(() => {
    if (resetSignal === undefined) return;
    if (widgetIdRef.current && window.turnstile?.reset) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        /* ignore */
      }
    }
  }, [resetSignal]);

  return (
    <div
      ref={containerRef}
      className="cf-turnstile"
      data-testid="turnstile-widget"
    />
  );
}
