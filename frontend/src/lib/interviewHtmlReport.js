/**
 * Build a fully self-contained interactive HTML report for one interview
 * session.
 *
 * The report bundles:
 *   - The AI coaching summary (overall_score, headline, strengths, improvements,
 *     STAR coaching, cultural fit, next steps).
 *   - Every Q&A turn (interviewer prompt + candidate answer).
 *   - Embedded HTML5 <audio> player per recorded answer (audio Blob → base64
 *     data URL — never re-uploaded to the server).
 *   - Per-segment timestamped transcript for each recording.
 *
 * The HTML is fully static — no JavaScript needed to play, no external CSS,
 * no fonts fetched from the network. Suitable for archival, sharing or
 * offline review.
 */

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(seconds) {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.floor((safe - Math.floor(safe)) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => reject(reader.error || new Error("blob read failed"));
    reader.readAsDataURL(blob);
  });
}

function renderList(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function renderSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return "";
  const rows = segments
    .map((seg) => {
      const ts = `<span class="ts">[${formatTimestamp(seg.start)}–${formatTimestamp(seg.end)}]</span>`;
      const speaker = seg.speaker
        ? `<span class="speaker">${escapeHtml(seg.speaker)}</span> `
        : "";
      const flag = seg.flagged_noise ? ' <span class="flag">(noise)</span>' : "";
      return `<li>${ts} ${speaker}${escapeHtml(seg.text)}${flag}</li>`;
    })
    .join("");
  return `<details class="transcript-details"><summary>Transkripti aikaleimoin / Timestamped transcript</summary><ol class="segments">${rows}</ol></details>`;
}

function renderQA(turns, dataUrlsByMessageIndex) {
  return turns
    .map(({ interviewer, candidate, candidateIndex }, idx) => {
      const audio = candidate?.audio;
      const dataUrl = candidateIndex != null ? dataUrlsByMessageIndex[candidateIndex] : "";
      const audioBlock = dataUrl
        ? `<div class="audio-block">
             <audio controls preload="metadata" src="${dataUrl}"></audio>
             <span class="audio-meta">${escapeHtml(audio?.mimeType || "audio/webm")} · ${
               Math.round(audio?.transcriptResult?.total_duration || 0)
             } s · ${audio?.transcriptResult?.segments?.length || 0} segmenttiä</span>
           </div>`
        : "";
      const segs = audio?.transcriptResult?.segments
        ? renderSegments(audio.transcriptResult.segments)
        : "";
      return `<section class="qa-card" data-turn-index="${idx + 1}">
        <header class="qa-head">
          <span class="turn-num">${idx + 1}</span>
          <h3>Kysymys / Question</h3>
        </header>
        <p class="interviewer">${escapeHtml(interviewer?.content || "")}</p>
        <h4>Vastaus / Answer</h4>
        <p class="candidate">${escapeHtml(candidate?.content || "")}</p>
        ${audioBlock}
        ${segs}
      </section>`;
    })
    .join("");
}

function pairTurns(messages) {
  const pairs = [];
  let pendingInterviewer = null;
  messages.forEach((msg, index) => {
    if (msg.role === "interviewer") {
      pendingInterviewer = { content: msg.content };
    } else if (msg.role === "candidate") {
      pairs.push({
        interviewer: pendingInterviewer,
        candidate: { content: msg.content, audio: msg.audio || null },
        candidateIndex: index,
      });
      pendingInterviewer = null;
    }
  });
  return pairs;
}

const REPORT_CSS = `
  :root {
    color-scheme: light;
    --bg: #f8fafc;
    --card: #ffffff;
    --ink: #0f172a;
    --muted: #475569;
    --line: #e2e8f0;
    --accent: #0d9488;
    --accent-soft: #ccfbf1;
    --score-bg: #f0fdfa;
    --noise: #b45309;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
    line-height: 1.55;
    padding: 2rem 1rem 4rem;
  }
  .wrap { max-width: 880px; margin: 0 auto; }
  header.page {
    background: linear-gradient(120deg, #042f2e 0%, #0d9488 60%, #14b8a6 100%);
    color: #f0fdfa;
    border-radius: 24px;
    padding: 2.25rem 2rem;
    box-shadow: 0 24px 48px -32px rgba(15, 118, 110, 0.7);
  }
  header.page h1 {
    margin: 0 0 .5rem;
    font-size: clamp(1.6rem, 1.2rem + 1.5vw, 2.4rem);
    letter-spacing: -0.02em;
  }
  header.page p { margin: 0.25rem 0; opacity: .92; }
  .meta { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1rem; font-size: .875rem; }
  .meta span {
    background: rgba(255,255,255,0.14);
    border: 1px solid rgba(255,255,255,0.22);
    padding: 4px 10px;
    border-radius: 999px;
  }
  .score-block {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: var(--score-bg);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 1.25rem;
    margin-top: 1.25rem;
  }
  .score-ring {
    width: 76px; height: 76px;
    border-radius: 50%;
    background: conic-gradient(var(--accent) calc(var(--pct) * 1%), #e2e8f0 0);
    display: grid;
    place-items: center;
    position: relative;
  }
  .score-ring::after {
    content: "";
    position: absolute;
    inset: 8px;
    background: var(--score-bg);
    border-radius: 50%;
  }
  .score-ring strong {
    position: relative;
    z-index: 1;
    font-size: 1.25rem;
  }
  section.card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 1.5rem;
    margin-top: 1.25rem;
  }
  section.card h2 {
    margin: 0 0 .5rem;
    font-size: 1.1rem;
    letter-spacing: -0.01em;
  }
  section.card ul {
    margin: 0; padding-left: 1.25rem;
    color: var(--muted);
  }
  section.card li { margin: .35rem 0; }
  .qa-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 1.25rem 1.5rem;
    margin-top: 1rem;
  }
  .qa-head {
    display: flex; align-items: center; gap: .75rem;
    margin-bottom: .5rem;
  }
  .qa-head h3 { margin: 0; font-size: 1rem; color: var(--muted); }
  .turn-num {
    display: inline-flex;
    width: 28px; height: 28px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    align-items: center; justify-content: center;
    font-weight: 600; font-size: .875rem;
  }
  .qa-card h4 {
    margin: .75rem 0 .25rem;
    font-size: .85rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .05em;
  }
  .qa-card .interviewer {
    margin: 0;
    font-size: 1.02rem;
    line-height: 1.55;
  }
  .qa-card .candidate {
    margin: 0;
    color: var(--muted);
    background: #f1f5f9;
    border-radius: 12px;
    padding: .75rem 1rem;
    font-size: .95rem;
    white-space: pre-wrap;
  }
  .audio-block {
    margin-top: .75rem;
    display: flex;
    align-items: center;
    gap: .75rem;
    flex-wrap: wrap;
  }
  .audio-block audio { flex: 1 1 280px; min-width: 280px; }
  .audio-meta {
    color: var(--muted);
    font-size: .82rem;
  }
  details.transcript-details {
    margin-top: .75rem;
    border-top: 1px dashed var(--line);
    padding-top: .75rem;
  }
  details.transcript-details > summary {
    cursor: pointer;
    color: var(--accent);
    font-weight: 600;
    font-size: .9rem;
    list-style: none;
  }
  details.transcript-details > summary::before {
    content: "▸ ";
    transition: transform .2s ease;
  }
  details[open].transcript-details > summary::before { content: "▾ "; }
  ol.segments { margin: .5rem 0 0; padding-left: 1.25rem; color: var(--muted); }
  ol.segments .ts {
    color: var(--accent);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: .82rem;
  }
  ol.segments .speaker {
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: 6px;
    padding: 1px 6px;
    font-size: .75rem;
    margin-right: .25rem;
  }
  ol.segments .flag { color: var(--noise); font-size: .75rem; }
  footer.page {
    margin-top: 2rem;
    color: var(--muted);
    text-align: center;
    font-size: .8rem;
  }
`;

export async function buildInterviewReportHtml({
  summary,
  messages,
  target = {},
  language = "fi",
  createdAt = new Date().toISOString(),
  sessionId = "",
}) {
  if (!summary) {
    throw new Error("Cannot build report without summary");
  }
  const safeMessages = Array.isArray(messages) ? messages : [];

  // Convert every candidate message audio Blob to a base64 data URL up front.
  // We index by message position so we don't double-encode the same blob.
  const dataUrls = await Promise.all(
    safeMessages.map(async (m) => {
      if (m.role === "candidate" && m.audio?.blob) {
        try {
          return await blobToDataUrl(m.audio.blob);
        } catch (_err) {
          return "";
        }
      }
      return "";
    }),
  );

  const turns = pairTurns(safeMessages);
  const overall = Number.isFinite(Number(summary.overall_score))
    ? Number(summary.overall_score)
    : 0;
  const scorePct = Math.max(0, Math.min(100, overall * 10));

  const metaPills = [
    target.job_title && `🎯 ${target.job_title}`,
    target.industry && `🏷️ ${target.industry}`,
    target.seniority && `⚖️ ${target.seniority}`,
    target.market && `🌍 ${target.market}`,
    `🌐 ${language.toUpperCase()}`,
    `📅 ${new Date(createdAt).toLocaleString("fi-FI")}`,
  ]
    .filter(Boolean)
    .map((p) => `<span>${escapeHtml(p)}</span>`)
    .join("");

  const headHtml = `
    <header class="page">
      <h1>Kuuntele oma haastattelusi</h1>
      <p>${escapeHtml(summary.headline || "")}</p>
      <div class="meta">${metaPills}</div>
    </header>
  `;

  const scoreHtml = `
    <div class="score-block">
      <div class="score-ring" style="--pct:${scorePct}"><strong>${overall}/10</strong></div>
      <div>
        <strong>Kokonaisarvio · Overall feedback</strong>
        <p style="margin:.25rem 0 0;color:var(--muted);">
          ${escapeHtml(summary.headline || "")}
        </p>
      </div>
    </div>
  `;

  const feedbackBlocks = [
    summary.strengths?.length && `
      <section class="card"><h2>✅ Vahvuudet · Strengths</h2>${renderList(summary.strengths)}</section>
    `,
    summary.improvements?.length && `
      <section class="card"><h2>🔧 Kehityskohteet · Improvements</h2>${renderList(summary.improvements)}</section>
    `,
    summary.star_coaching && `
      <section class="card"><h2>⭐ STAR-valmennus · STAR Coaching</h2><p>${escapeHtml(summary.star_coaching)}</p></section>
    `,
    summary.cultural_fit_note && `
      <section class="card"><h2>🇫🇮 Kulttuurinen sopivuus · Cultural Fit</h2><p>${escapeHtml(summary.cultural_fit_note)}</p></section>
    `,
    summary.next_steps?.length && `
      <section class="card"><h2>🚀 Seuraavat askeleet · Next Steps</h2>${renderList(summary.next_steps)}</section>
    `,
  ]
    .filter(Boolean)
    .join("");

  const qaHtml = turns.length
    ? `<section class="card"><h2>🎙️ Kysymykset, vastaukset ja äänitallenteet</h2></section>${renderQA(turns, dataUrls)}`
    : "";

  const generatedAt = new Date().toLocaleString("fi-FI");

  return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kuuntele oma haastattelusi · ${escapeHtml(target.job_title || "Mock interview")}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="wrap">
  ${headHtml}
  ${scoreHtml}
  ${feedbackBlocks}
  ${qaHtml}
  <footer class="page">
    Privacy: tämä raportti on offline ja sisältää äänitallenteet vain tässä HTML-tiedostossa.
    Generoitu ${escapeHtml(generatedAt)}${sessionId ? ` · session ${escapeHtml(sessionId)}` : ""}.
  </footer>
</div>
</body>
</html>`;
}

export function downloadHtmlBlob(htmlString, filename) {
  const blob = new Blob([htmlString], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
