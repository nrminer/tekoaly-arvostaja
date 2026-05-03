import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Explicit, per-session camera-consent modal.
 * Default answer is ALWAYS "Peruuta / Cancel" — users must actively choose Accept.
 * No camera stream starts until `onAccept` is invoked.
 */
export function CameraConsentModal({ open, onOpenChange, onAccept, t }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="camera-consent-modal">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading">
            {t("interview.consent.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-left">
            <span className="block">{t("interview.consent.body1")}</span>
            <span className="block">{t("interview.consent.body2")}</span>
            <span className="block font-semibold text-foreground">
              {t("interview.consent.body3")}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="camera-consent-cancel-button">
            {t("interview.consent.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onAccept}
            data-testid="camera-consent-accept-button"
          >
            {t("interview.consent.accept")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
