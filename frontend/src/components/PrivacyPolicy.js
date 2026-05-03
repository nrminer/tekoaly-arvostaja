import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n";

function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-1 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function PrivacyPolicyContent() {
  const { language } = useI18n();

  if (language === "fi") {
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">Päivitetty: 3.5.2026</p>

        <Section title="Rekisterinpitäjä">
          <p>CV-arvioija (cvarvio.fi)</p>
          <p>
            Tietosuoja-asiat:{" "}
            <a href="mailto:tietosuoja@cvarvio.fi" className="underline hover:text-foreground">
              tietosuoja@cvarvio.fi
            </a>
          </p>
        </Section>

        <Section title="Miten palvelu toimii">
          <p>CV-arvioija tarjoaa kaksi toimintoa:</p>
          <ol className="ml-4 list-decimal space-y-2">
            <li>
              <strong>CV-analyysi —</strong> lataat tai liität CV:si, jonka jälkeen palvelu
              lähettää sen Anthropic Claude -tekoälymallille. Malli tuottaa palautteen viidestä
              osa-alueesta (muotoilu, sisältö, kieli, paikalliset normit, erottautuminen) sekä
              konkreettiset parannusehdotukset. Raportin voi ladata HTML- tai JSON-tiedostona.
            </li>
            <li>
              <strong>Tekoälyhaastattelun harjoittelu —</strong> syötät CV-tiivistelmän ja
              taustatiedot, jonka jälkeen Anthropic Claude esittää 6–8 haastattelukysymystä.
              Vastauksesi kulkevat Anthropicille arviointia varten. Haastattelijan ääni
              tuotetaan OpenAI TTS -palvelulla. Haastattelu ja palaute ovat vain istunnon ajan;
              niitä ei tallenneta palvelimelle.
            </li>
          </ol>
          <p className="mt-1">
            Palvelu ei tee profilointia, kohdennettua mainontaa eikä automaattisia päätöksiä,
            jotka vaikuttaisivat oikeudellisesti sinuun.
          </p>
        </Section>

        <Section title="Mitä tietoja käsitellään">
          <p>Palvelu käsittelee vain sen, mitä itse lähetät:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>CV-teksti tai tiedosto (PDF tai DOCX)</li>
            <li>
              Vapaaehtoinen lisätieto: haettava tehtävä, toimiala, kokemustaso, kohdealue,
              työnkuvaus ja erityiset toiveet
            </li>
            <li>
              Haastatteluharjoittelussa: CV-tiivistelmä, haastatteluvastaukset sekä mahdolliset
              äänitallenteet (käsitellään paikallisesti tai lähetetään Emergent AI -yhdyskäytävän
              kautta OpenAI Whisper -transkriptioon)
            </li>
          </ul>
          <p className="mt-1">
            Palvelu ei kerää nimeä, sähköpostiosoitetta, puhelinnumeroa eikä muita
            yhteystietoja — ellei niitä ole CV:n tekstissä.
          </p>
        </Section>

        <Section title="Mihin tietoja käytetään">
          <p>
            Tietoja käytetään ainoastaan CV:n arvioimiseen ja haastattelupalauttteen
            tuottamiseen. Oikeusperuste on GDPR 6 artiklan 1 b kohta — palvelun suorittaminen
            käyttäjän pyynnöstä.
          </p>
        </Section>

        <Section title="Säilytys">
          <p>
            CV-tekstiä, haastatteluvastauksia eikä arviointituloksia tallenneta palvelimelle.
            Kaikki käsittely tapahtuu muistissa pyynnön ajan, jonka jälkeen tiedot häviävät.
            Raportin voi ladata HTML- tai JSON-tiedostona istunnon aikana; tiedosto tallennetaan
            ainoastaan omalle laitteellesi.
          </p>
        </Section>

        <Section title="Kolmannet osapuolet">
          <p>CV-teksti ja haastatteluvastaukset lähetetään seuraaville palveluille:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>Emergent AI</strong> — LLM-yhdyskäytävä, jonka kautta pyyntö välitetään
              Anthropicille ja OpenAI:lle. CV-teksti ja haastatteluvastaukset kulkevat tämän
              palvelun kautta.{" "}
              <a
                href="https://emergent.sh/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                emergent.sh/privacy
              </a>
            </li>
            <li>
              <strong>Anthropic Claude</strong> — tuottaa CV-arviointiraportin ja
              haastattelukysymykset (Emergent AI -yhdyskäytävän kautta).{" "}
              <a
                href="https://www.anthropic.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                anthropic.com/privacy
              </a>
            </li>
            <li>
              <strong>OpenAI TTS</strong> — haastatteluvalmentajan äänisynteesi (Emergent AI
              -yhdyskäytävän kautta). Tekstiä lähetetään äänentoisintoa varten, ei tallenneta.{" "}
              <a
                href="https://openai.com/policies/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                openai.com/policies/privacy-policy
              </a>
            </li>
            <li>
              <strong>Vercel</strong> — palvelun hostaus, palvelimet pääosin Yhdysvalloissa.{" "}
              <a
                href="https://vercel.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                vercel.com/legal/privacy-policy
              </a>
            </li>
            <li>
              <strong>Cloudflare Turnstile</strong> — bottienesto lomakkeessa. Ei
              seurantaevästeitä, CV:n sisältöä ei lähetetä Cloudflarelle.{" "}
              <a
                href="https://www.cloudflare.com/privacypolicy/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                cloudflare.com/privacypolicy
              </a>
            </li>
          </ul>
          <p className="mt-1">Tietoja ei myydä eikä luovuteta markkinointitarkoituksiin.</p>
        </Section>

        <Section title="Tietoturva">
          <p>
            Kaikki liikenne kulkee salatun HTTPS-yhteyden kautta. Koska mitään ei tallenneta
            palvelimelle, tietomurron riski on pieni. Palvelu käyttää pyyntökohtaisia
            kokorajoituksia ja nopeusrajoituksia väärinkäytön estämiseksi.
          </p>
        </Section>

        <Section title="Evästeet ja paikallinen tallennus">
          <p>
            Palvelu käyttää selaimen sessionStorage-muistia väliaikaiseen CV-tietojen
            siirtämiseen sivujen välillä (esim. CV-arvioinnista haastatteluharjoitteluun).
            Nämä tiedot poistuvat automaattisesti, kun välilehti suljetaan. Seurantaevästeitä
            tai analytiikkaa ei käytetä.
          </p>
        </Section>

        <Section title="Oikeutesi">
          <p>Sinulla on oikeus:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>saada tietoa käsittelystä (tämä seloste)</li>
            <li>
              pyytää tietojesi poistamista — koska tietoja ei tallenneta, pyyntö täyttyy
              automaattisesti istunnon päätyttyä
            </li>
            <li>
              tehdä valitus Tietosuojavaltuutetun toimistolle:{" "}
              <strong>tietosuoja.fi</strong>
            </li>
          </ul>
          <p className="mt-1">
            Kysy lisää:{" "}
            <a href="mailto:tietosuoja@cvarvio.fi" className="underline hover:text-foreground">
              tietosuoja@cvarvio.fi
            </a>
          </p>
        </Section>

        <Section title="Muutokset">
          <p>Selosteen muutoksista ilmoitetaan päivittämällä yläreunan päivämäärä.</p>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Last updated: 3 May 2026</p>

      <Section title="Controller">
        <p>CV Reviewer (cvarvio.fi)</p>
        <p>
          Privacy enquiries:{" "}
          <a href="mailto:tietosuoja@cvarvio.fi" className="underline hover:text-foreground">
            tietosuoja@cvarvio.fi
          </a>
        </p>
      </Section>

      <Section title="How the service works">
        <p>CV Reviewer provides two features:</p>
        <ol className="ml-4 list-decimal space-y-2">
          <li>
            <strong>CV analysis —</strong> you upload or paste your CV, which is sent to the
            Anthropic Claude AI model. The model returns feedback across five dimensions
            (formatting, content, language, local norms, strategic positioning) along with
            concrete rewrite suggestions. You can download the report as an HTML or JSON file.
          </li>
          <li>
            <strong>Mock interview practice —</strong> you provide a CV summary and context,
            after which Anthropic Claude asks 6–8 tailored interview questions. Your answers
            are sent to Anthropic for evaluation. The interviewer's voice is produced by the
            OpenAI TTS service. The interview transcript and feedback exist only for the
            duration of your session and are never stored on the server.
          </li>
        </ol>
        <p className="mt-1">
          The service does not perform profiling, targeted advertising, or automated decisions
          that have a legal or similarly significant effect on you.
        </p>
      </Section>

      <Section title="What data is processed">
        <p>The service only processes what you submit:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Your CV text or file (PDF or DOCX)</li>
          <li>
            Optional context: job title, industry, seniority, target market, job description,
            and specific concerns
          </li>
          <li>
            In mock interview mode: CV summary, interview answers, and optional audio recordings
            (processed locally or sent via the Emergent AI gateway to OpenAI Whisper for
            transcription)
          </li>
        </ul>
        <p className="mt-1">
          The service does not collect your name, email, phone number, or any other contact
          details — unless they appear in your CV text.
        </p>
      </Section>

      <Section title="Why data is used">
        <p>
          Data is used solely to review your CV and generate interview feedback. Legal basis:
          GDPR Art. 6(1)(b) — performing the service you requested.
        </p>
      </Section>

      <Section title="Retention">
        <p>
          No CV text, interview answers, or review results are stored on the server. Everything
          is processed in memory for the duration of the request and then discarded. You can
          download a copy of the report as an HTML or JSON file during your session; the file
          is saved only to your own device.
        </p>
      </Section>

      <Section title="Third parties">
        <p>Your CV text and interview answers are sent to the following services:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Emergent AI</strong> — LLM gateway through which requests are forwarded to
            Anthropic and OpenAI. Your CV text and interview answers transit this service.{" "}
            <a
              href="https://emergent.sh/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              emergent.sh/privacy
            </a>
          </li>
          <li>
            <strong>Anthropic Claude</strong> — generates the CV review report and interview
            questions (via the Emergent AI gateway).{" "}
            <a
              href="https://www.anthropic.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              anthropic.com/privacy
            </a>
          </li>
          <li>
            <strong>OpenAI TTS</strong> — voice synthesis for the interview coach (via the
            Emergent AI gateway). Text is sent for audio generation only and is not stored.{" "}
            <a
              href="https://openai.com/policies/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              openai.com/policies/privacy-policy
            </a>
          </li>
          <li>
            <strong>Vercel</strong> — hosting, servers primarily in the United States.{" "}
            <a
              href="https://vercel.com/legal/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              vercel.com/legal/privacy-policy
            </a>
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong> — bot protection on the form. No tracking
            cookies; your CV content is never sent to Cloudflare.{" "}
            <a
              href="https://www.cloudflare.com/privacypolicy/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              cloudflare.com/privacypolicy
            </a>
          </li>
        </ul>
        <p className="mt-1">Data is never sold or shared for marketing purposes.</p>
      </Section>

      <Section title="Security">
        <p>
          All traffic is encrypted via HTTPS. Because nothing is stored on the server, the
          risk from a breach is minimal. The service applies request size limits and rate
          limiting to prevent abuse.
        </p>
      </Section>

      <Section title="Cookies and local storage">
        <p>
          The service uses browser sessionStorage to temporarily carry CV data between pages
          (e.g. from CV review to mock interview). This data is automatically cleared when the
          tab is closed. No tracking cookies or analytics are used.
        </p>
      </Section>

      <Section title="Your rights">
        <p>You have the right to:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>be informed about processing (this notice)</li>
          <li>
            request deletion — because no data is stored on the server, this is fulfilled
            automatically when your session ends
          </li>
          <li>
            lodge a complaint with a supervisory authority (in Finland:{" "}
            <strong>tietosuoja.fi</strong>)
          </li>
        </ul>
        <p className="mt-1">
          For questions:{" "}
          <a href="mailto:tietosuoja@cvarvio.fi" className="underline hover:text-foreground">
            tietosuoja@cvarvio.fi
          </a>
        </p>
      </Section>

      <Section title="Changes">
        <p>
          Any changes will be communicated by updating the date at the top of this notice.
        </p>
      </Section>
    </div>
  );
}

export function PrivacyPolicyDialog({ trigger }) {
  const { language } = useI18n();
  const title = language === "fi" ? "Tietosuojaseloste" : "Privacy Policy";

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4" data-testid="privacy-policy-scroll-area">
          <PrivacyPolicyContent />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
