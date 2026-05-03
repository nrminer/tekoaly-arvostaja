import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, FileText, Github, MessageSquare, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PrivacyPolicyDialog } from "@/components/PrivacyPolicy";
import { useI18n } from "@/i18n";
import { useTheme } from "@/hooks/useTheme";

const GITHUB_URL = "https://github.com/nrminer/Tekoaly-arvostaja";

export function SiteLayout({ children }) {
  const { t } = useI18n();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const isInterview = location.pathname.startsWith("/interview");
  const testIdPrefix = isInterview ? "interview-" : "";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ── Sticky site header ── */}
      <header className="sticky top-0 z-40 border-b bg-card will-change-transform">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-10">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="brand-mark shrink-0" aria-hidden="true">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p
                className="font-heading truncate text-sm font-semibold tracking-wide"
                data-testid="brand-title"
              >
                {t("brand.title")}
              </p>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {isInterview ? t("interview.brand.sub") : t("brand.subtitle")}
              </p>
            </div>
          </Link>

          <nav aria-label="Site navigation" className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label={theme === "dark" ? "Vaihda vaaleaan teemaan" : "Vaihda tummaan teemaan"}
              data-testid="theme-toggle"
              className="rounded-full text-muted-foreground hover:text-foreground"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>

            {isInterview ? (
              <Link to="/">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 bg-card"
                  data-testid="interview-back-to-cv-button"
                  aria-label={t("interview.nav.backToCv")}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t("interview.nav.backToCv")}</span>
                </Button>
              </Link>
            ) : (
              <Link to="/interview">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 bg-card"
                  data-testid="nav-interview-button"
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t("nav.interview")}</span>
                </Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* ── Page content ── */}
      {children}

      {/* ── Site footer ── */}
      <footer className="border-t bg-muted/30 py-5 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 text-center">
          <span data-testid={`${testIdPrefix}footer-copyright`}>
            © {new Date().getFullYear()} {t("brand.title")}
          </span>
          <PrivacyPolicyDialog
            trigger={
              <button
                type="button"
                className="underline underline-offset-2 transition-colors hover:text-foreground"
                data-testid={`${testIdPrefix}footer-privacy-button`}
              >
                {t("footer.privacy")}
              </button>
            }
          />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[2.25rem] min-w-[2.25rem] items-center justify-center gap-1.5 rounded-full border bg-card transition-colors hover:border-primary hover:text-primary"
            aria-label="GitHub repository"
            title="GitHub"
            data-testid={`${testIdPrefix}footer-github-link`}
          >
            <Github className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  );
}
