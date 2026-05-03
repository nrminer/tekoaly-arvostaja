import { useState } from "react";
import {
  Award,
  CheckCircle2,
  Headphones,
  Lightbulb,
  Loader2,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRing } from "@/components/ScoreRing";
import {
  buildInterviewReportHtml,
  downloadHtmlBlob,
} from "@/lib/interviewHtmlReport";

export function InterviewSummary({
  summary,
  onReset,
  onDownload,
  messages = [],
  target = {},
  language = "fi",
  sessionId = "",
  t,
}) {
  const [isBuildingHtml, setIsBuildingHtml] = useState(false);
  const [htmlError, setHtmlError] = useState("");
  const audioCount = messages.filter(
    (m) => m.role === "candidate" && m.audio?.blob,
  ).length;

  if (!summary) return null;

  const handleDownloadHtml = async () => {
    setHtmlError("");
    setIsBuildingHtml(true);
    try {
      const html = await buildInterviewReportHtml({
        summary,
        messages,
        target,
        language,
        sessionId,
      });
      const filename = `mock-interview-${sessionId || Date.now()}.html`;
      downloadHtmlBlob(html, filename);
    } catch (err) {
      setHtmlError(err?.message || "html-build-failed");
    } finally {
      setIsBuildingHtml(false);
    }
  };

  return (
    <Card className="soft-card" data-testid="interview-summary-card">
      <CardHeader className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="min-w-0">
          <CardTitle className="font-heading">{t("interview.summary.title")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{summary.headline}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ScoreRing score={summary.overall_score} size="large" />
          <div className="text-sm">
            <p className="text-muted-foreground">{t("interview.summary.overall")}</p>
            <p className="font-heading text-xl font-semibold">
              {summary.overall_score}/10
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.isArray(summary.strengths) && summary.strengths.length > 0 && (
          <Section
            icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
            title={t("interview.summary.strengths")}
            items={summary.strengths}
            testid="summary-strengths"
          />
        )}
        {Array.isArray(summary.improvements) && summary.improvements.length > 0 && (
          <Section
            icon={<TrendingUp className="h-4 w-4 text-primary" />}
            title={t("interview.summary.improvements")}
            items={summary.improvements}
            testid="summary-improvements"
          />
        )}
        {summary.star_coaching && (
          <Row
            icon={<Lightbulb className="h-4 w-4 text-primary" />}
            title={t("interview.summary.starCoaching")}
            body={summary.star_coaching}
            testid="summary-star"
          />
        )}
        {summary.cultural_fit_note && (
          <Row
            icon={<Award className="h-4 w-4 text-primary" />}
            title={t("interview.summary.culturalFit")}
            body={summary.cultural_fit_note}
            testid="summary-cultural"
          />
        )}
        {Array.isArray(summary.next_steps) && summary.next_steps.length > 0 && (
          <Section
            icon={<TrendingUp className="h-4 w-4 text-primary" />}
            title={t("interview.summary.nextSteps")}
            items={summary.next_steps}
            testid="summary-next-steps"
          />
        )}

        <div className="rounded-xl border border-dashed bg-accent/40 p-3 text-sm" data-testid="summary-html-block">
          <p className="flex items-center gap-2 font-heading font-semibold">
            <Headphones className="h-4 w-4 text-primary" />
            {t("interview.summary.listenTitle")}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {audioCount > 0
              ? t("interview.summary.listenWithAudio", { count: audioCount })
              : t("interview.summary.listenNoAudio")}
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3 gap-2"
            onClick={handleDownloadHtml}
            disabled={isBuildingHtml}
            data-testid="interview-download-html-button"
          >
            {isBuildingHtml ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Headphones className="h-4 w-4" />
            )}
            {isBuildingHtml
              ? t("interview.summary.htmlBuilding")
              : t("interview.summary.downloadHtml")}
          </Button>
          {htmlError && (
            <p
              className="mt-2 text-xs text-destructive"
              data-testid="summary-html-error"
            >
              {htmlError}
            </p>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-2 pt-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-card"
            onClick={onDownload}
            data-testid="interview-download-button"
          >
            {t("interview.summary.download")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onReset}
            data-testid="interview-restart-button"
          >
            {t("interview.summary.restart")}
          </Button>
          <Badge variant="secondary" className="font-normal sm:ml-auto">
            {t("interview.summary.privacy")}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ icon, title, items, testid }) {
  return (
    <div className="report-block space-y-2" data-testid={testid}>
      <p className="flex items-center gap-2 font-heading font-semibold">
        {icon} {title}
      </p>
      <ul className="space-y-1 text-sm">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="bullet-dot" />
            <span className="leading-6 text-muted-foreground">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ icon, title, body, testid }) {
  return (
    <div className="report-block" data-testid={testid}>
      <p className="flex items-center gap-2 font-heading font-semibold">
        {icon} {title}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
