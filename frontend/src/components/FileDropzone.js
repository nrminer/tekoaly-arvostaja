import { useRef, useState } from "react";
import { CheckCircle2, FileText, Upload, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const FileDropzone = ({ file, onFileChange }) => {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  function validateAndSet(candidate) {
    setError("");
    if (!candidate) return;
    const extension = candidate.name.toLowerCase().split(".").pop();
    const isSupported =
      ACCEPTED_TYPES.includes(candidate.type) || ["pdf", "docx"].includes(extension);
    if (!isSupported) {
      setError(t("file.err.unsupported"));
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setError(t("file.err.tooLarge"));
      return;
    }
    onFileChange(candidate);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    validateAndSet(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => validateAndSet(event.target.files?.[0])}
        data-testid="cv-upload-file-input"
      />

      {file ? (
        <div
          className="rounded-2xl border border-primary/30 bg-accent/30 p-5"
          data-testid="cv-upload-success"
        >
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-heading font-semibold text-foreground" data-testid="cv-upload-success-title">
                {t("file.success.title")}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground" data-testid="cv-upload-success-subtitle">
                {t("file.success.subtitle")}
              </p>
              <div className="mt-3 flex min-w-0 items-center gap-3 rounded-xl border bg-card p-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-card"
                  onClick={() => inputRef.current?.click()}
                  data-testid="cv-upload-change-button"
                >
                  {t("file.change")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onFileChange(null)}
                  data-testid="cv-upload-remove-button"
                  aria-label={t("file.remove")}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  {t("file.remove")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`file-dropzone flex flex-col items-center justify-center p-6 text-center ${
            isDragging ? "active" : ""
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          data-testid="cv-upload-dropzone"
        >
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-primary">
            <Upload className="h-6 w-6" />
          </div>
          <h3 className="font-heading text-lg font-semibold" data-testid="cv-upload-title">
            {t("file.dropTitle")}
          </h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground" data-testid="cv-upload-subtitle">
            {t("file.dropSubtitle")}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 bg-card"
            onClick={() => inputRef.current?.click()}
            data-testid="cv-upload-browse-button"
          >
            {t("file.browse")}
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive" data-testid="cv-upload-error-alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
