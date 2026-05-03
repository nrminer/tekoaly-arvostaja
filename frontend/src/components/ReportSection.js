import { Copy, Info, Sparkles, Globe2, Lightbulb } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRing } from "@/components/ScoreRing";
import { dimensionKey, useI18n } from "@/i18n";

const IMPACT_VARIANT = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

export const ReportSection = ({ review, onCopy }) => {
  const { t } = useI18n();
  const dimensions = review?.dimensions || [];
  const recommendations = review?.priority_recommendations || [];
  const excerpts = review?.revised_excerpts || [];
  const assumptions = review?.assumptions || [];
  const marketNotes = review?.market_notes || [];

  const translateDimension = (name) => {
    const key = dimensionKey(name);
    return key ? t(key) : name;
  };

  const translateImpact = (impact) => {
    const key = (impact || "").toLowerCase();
    if (["high", "medium", "low"].includes(key)) return t(`report.impact.${key}`);
    return impact || t("report.impact.fallback");
  };

  return (
    <div className="space-y-6">
      <Card className="soft-card" data-testid="dimensions-card">
        <CardHeader>
          <CardTitle className="font-heading">{t("report.dimensionsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion
            type="multiple"
            defaultValue={dimensions[0] ? [dimensions[0].dimension] : []}
            data-testid="dimension-accordion"
          >
            {dimensions.map((dim) => (
              <AccordionItem value={dim.dimension} key={dim.dimension}>
                <AccordionTrigger data-testid={`dimension-trigger-${slug(dim.dimension)}`}>
                  <div className="flex w-full min-w-0 items-center justify-between gap-3 pr-4">
                    <span className="min-w-0 text-left font-heading text-base font-semibold">
                      {translateDimension(dim.dimension)}
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {dim.score}/10
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[auto,1fr]">
                    <ScoreRing score={dim.score} />
                    <div className="space-y-4">
                      {dim.observations && (
                        <p className="text-sm leading-7 text-muted-foreground">
                          {dim.observations}
                        </p>
                      )}
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <FeedbackBlock
                          title={t("report.strengths")}
                          items={dim.strengths}
                          emptyLabel={t("report.noNotes")}
                        />
                        <FeedbackBlock
                          title={t("report.improvements")}
                          items={dim.improvements}
                          emptyLabel={t("report.noNotes")}
                          highlight
                        />
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {!!recommendations.length && (
        <Card className="soft-card" data-testid="priority-recommendations-card">
          <CardHeader>
            <CardTitle className="font-heading flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" /> {t("report.priorityRec")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recommendations
              .slice()
              .sort((a, b) => (a.rank || 99) - (b.rank || 99))
              .map((rec, index) => {
                const impactKey = (rec.impact || "").toLowerCase();
                const variant = IMPACT_VARIANT[impactKey] || "secondary";
                return (
                  <div
                    className="report-block"
                    key={`${rec.title}-${index}`}
                    data-testid={`priority-recommendation-${rec.rank || index + 1}`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge>#{rec.rank || index + 1}</Badge>
                      <Badge variant={variant} className="capitalize">
                        {translateImpact(rec.impact)}
                      </Badge>
                      <h4 className="font-heading text-base font-semibold">
                        {rec.title}
                      </h4>
                    </div>
                    {rec.rationale && (
                      <p className="text-sm leading-7 text-muted-foreground">
                        {rec.rationale}
                      </p>
                    )}
                    {rec.example && (
                      <div className="mt-3 rounded-lg border bg-muted/40 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("report.exampleRewrite")}
                        </p>
                        <p className="mt-1 leading-7">{rec.example}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3 bg-card"
                          onClick={() => onCopy?.(rec.example)}
                          data-testid={`recommendation-copy-button-${rec.rank || index + 1}`}
                        >
                          <Copy className="h-4 w-4" /> {t("report.copyExample")}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {!!excerpts.length && (
        <Card className="soft-card" data-testid="revised-excerpts-card">
          <CardHeader>
            <CardTitle className="font-heading flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> {t("report.revisedExcerpts")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            {excerpts.map((ex, index) => (
              <div
                className="report-block"
                key={`${ex.section}-${index}`}
                data-testid={`revised-excerpt-${index + 1}`}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {ex.section}
                </p>
                {ex.original && (
                  <p className="mb-2 text-sm text-muted-foreground">
                    <strong>{t("report.original")}:</strong> {ex.original}
                  </p>
                )}
                <p className="leading-7">
                  <strong>{t("report.revised")}:</strong> {ex.revised}
                </p>
                {ex.why_it_works && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    <strong>{t("report.whyItWorks")}:</strong> {ex.why_it_works}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 bg-card"
                  onClick={() => onCopy?.(ex.revised)}
                  data-testid={`excerpt-copy-button-${index + 1}`}
                >
                  <Copy className="h-4 w-4" /> {t("report.copyRevised")}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!!marketNotes.length && (
        <Card className="soft-card" data-testid="market-notes-card">
          <CardHeader>
            <CardTitle className="font-heading flex items-center gap-2">
              <Globe2 className="h-5 w-5 text-primary" /> {t("report.marketNotes")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FeedbackList items={marketNotes} emptyLabel={t("report.noNotes")} />
          </CardContent>
        </Card>
      )}

      {!!assumptions.length && (
        <Card className="soft-card" data-testid="assumptions-card">
          <CardHeader>
            <CardTitle className="font-heading flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" /> {t("report.assumptions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FeedbackList items={assumptions} emptyLabel={t("report.noNotes")} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

function FeedbackBlock({ title, items = [], highlight = false, emptyLabel }) {
  return (
    <div className={highlight ? "report-block bg-accent/30" : "report-block"}>
      <h4 className="font-heading mb-3 font-semibold">{title}</h4>
      <FeedbackList items={items} emptyLabel={emptyLabel} />
    </div>
  );
}

function FeedbackList({ items = [], emptyLabel = "No notes provided." }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
      <ul className="space-y-2" data-testid="feedback-list">
      {items.map((item, index) => (
        <li className="flex min-w-0 gap-2 text-sm leading-6" key={`${item}-${index}`}>
          <span className="bullet-dot" aria-hidden="true" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
