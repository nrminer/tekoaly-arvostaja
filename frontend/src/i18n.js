// Lightweight i18n for the Universal CV Review Assistant.
// Finnish (fi) is the default. English (en) is available via header toggle.

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";

const DICTIONARIES = {
  fi: {
    "brand.title": "CV-arvioija",
    "brand.subtitle": "Nopea CV-palaute",
    "app.languageNotice": "Sovellus toimii suomeksi.",
    "nav.start": "Tarkista CV",
    "nav.interview": "Tekoälyhaastattelun harjoittelu",

    "hero.title": "Paranna CV:täsi. Harjoittele haastattelu.",
    "hero.description":
      "Lataa CV ja saat konkreettiset parannusehdotukset hetkessä. Harjoittele sitten oikeaa haastattelua tekoälyinterviewerin kanssa.",
    "hero.cta.check": "Tarkista CV",
    "hero.cta.interview": "Harjoittele haastattelua",

    "home.cv.title": "CV-analyysi tekoälyn avulla",
    "home.cv.description": "Yksityiskohtainen arvio CV:stäsi – muotoilu, sisältö ja kilpailukyky – parissa minuutissa.",
    "home.cv.f1": "Palaute muotoilusta, kielestä ja rakenteesta",
    "home.cv.f2": "Huomiot kohdemaan käytännöistä ja normeista",
    "home.cv.f3": "Konkreettiset kirjoitusehdotukset",
    "home.cv.cta": "Tarkista CV nyt",

    "home.interview.title": "Tekoälyhaastattelun harjoittelu",
    "home.interview.description": "Harjoittele oikeaa haastattelutilannetta suomalaisen tekoälyinterviewerin kanssa – kysymykset räätälöidään CV:siisi.",
    "home.interview.f1": "6–8 kysymystä räätälöitynä taustoihisi",
    "home.interview.f2": "Välitön palaute jokaisesta vastauksesta",
    "home.interview.f3": "Kattava valmennus ja kehitysehdotukset lopuksi",
    "home.interview.cta": "Aloita harjoittelu",

    "dim.formatting": "Muotoilu ja rakenne",
    "dim.content": "Sisältö ja sopivuus",
    "dim.language": "Kieli ja tyyli",
    "dim.cultural": "Paikalliset normit",
    "dim.strategic": "Erottautuminen",

    "form.submit.title": "Tarkista CV:si",
    "form.submit.description":
      "Lisää CV ja muutama taustatieto. Saat tiiviin, käytännöllisen arvion.",
    "form.tabs.upload": "Lataa PDF/DOCX",
    "form.tabs.paste": "Liitä CV-teksti",
    "form.cvTextLabel": "CV-teksti",
    "form.cvTextPlaceholder": "Liitä CV:si teksti tähän…",
    "form.charCount": "{n} merkkiä. Saat parhaan tuloksen, kun mukana ovat otsikot, päivämäärät, taidot ja kielitasot.",
    "form.jobTitle": "Haettava tehtävä",
    "form.jobTitlePlaceholder": "esim. ohjelmistokehittäjä",
    "form.industry": "Toimiala",
    "form.industryPlaceholder": "Teknologia, terveydenhuolto, rahoitus…",
    "form.seniority": "Kokemustaso",
    "form.seniorityPlaceholder": "Valitse kokemustaso",
    "form.market": "Kohdemaa tai -alue",
    "form.marketPlaceholder": "Valitse kohdealue",
    "form.jobDescription": "Työpaikkailmoitus (vapaaehtoinen)",
    "form.jobDescriptionPlaceholder":
      "Liitä ilmoituksen tärkeimmät vaatimukset.",
    "form.specificConcerns": "Haluatko palautetta jostakin tietystä asiasta? (vapaaehtoinen)",
    "form.specificConcernsPlaceholder":
      "esim. ura-aukko, alan vaihto, tiivistelmäosio tai CV:n pituus…",
    "form.error.title": "Tarkista tiedot ja yritä uudelleen",
    "form.error.action": "Korjaa tiedot",
    "form.error.tooShort":
      "Lisää CV-tiedosto tai liitä vähintään muutama osio ennen tarkistusta.",
    "form.error.captcha":
      "Vahvista ensin että et ole robotti — napsauta ruutua \"En ole robotti\".",
    "form.captcha.note":
      "Suojattu Cloudflare Turnstilella — ei seurantaevästeitä.",
    "form.submit.cta": "Tarkista CV",
    "form.submit.analyzing": "Tarkistetaan…",
    "analysis.description":
      "Tarkistetaan CV ja kootaan palaute. Tämä kestää yleensä alle minuutin.",

    "report.overallScore": "Kokonaisarvosana",
    "report.overallAssessment": "Yhteenveto",
    "report.generalReview": "Yleinen arviointi",
    "report.longCvTrimmed": "Pitkä CV lyhennettiin tarkistusta varten",
    "report.downloadHtml": "Lataa CV-palaute (HTML)",
    "report.downloadJson": "Lataa CV-palaute (JSON)",
    "report.practiceInterview": "Harjoittele haastattelua tällä CV:llä",
    "report.keyStrength": "Suurin vahvuus",
    "report.dimensionsTitle": "Palaute aiheittain",
    "report.strengths": "Toimii hyvin",
    "report.improvements": "Parannettavaa",
    "report.priorityRec": "Tärkeimmät parannusehdotukset",
    "report.exampleRewrite": "Esimerkki",
    "report.copyExample": "Kopioi",
    "report.revisedExcerpts": "Kirjoitusehdotukset",
    "report.original": "Alkuperäinen",
    "report.revised": "Ehdotus",
    "report.copyRevised": "Kopioi ehdotus",
    "report.whyItWorks": "Miksi tämä toimii paremmin",
    "report.marketNotes": "Huomiot kohdemarkkinan käytännöistä",
    "report.assumptions": "Huomioitavaa",
    "report.noNotes": "Ei lisähuomioita.",
    "report.impact.high": "tärkeä",
    "report.impact.medium": "hyödyllinen",
    "report.impact.low": "pieni",
    "report.impact.fallback": "vaikutus",
    "footer.privacy": "Tietosuojaseloste",

    "copy.notice": "Kopioitu leikepöydälle.",

    "file.dropTitle": "Lisää CV-tiedosto",
    "file.dropSubtitle": "PDF tai DOCX, enintään 10 Mt.",
    "file.browse": "Valitse tiedosto",
    "file.err.unsupported": "Valitse PDF- tai DOCX-tiedosto.",
    "file.err.tooLarge": "Valitse alle 10 Mt kokoinen tiedosto.",
    "file.remove": "Poista",
    "file.change": "Vaihda tiedosto",
    "file.success.title": "CV lisätty onnistuneesti",
    "file.success.subtitle": "Tiedosto on valmis tarkistettavaksi. Täytä tarvittaessa lisätiedot ja paina Tarkista CV.",

    // Seniority & market display labels (keyed by backend code)
    "seniority.Student/Intern": "Opiskelija / harjoittelija",
    "seniority.Early-career": "Uran alkuvaihe",
    "seniority.Mid-level": "Keskivaiheen asiantuntija",
    "seniority.Senior": "Senior",
    "seniority.Lead/Principal": "Lead / Principal -taso",
    "seniority.Executive": "Johto",

    "market.Finland": "Suomi",
    "market.US": "Yhdysvallat (US)",
    "market.UK": "Iso-Britannia (UK)",
    "market.EU": "Euroopan unioni (EU)",
    "market.Nordics": "Pohjoismaat (Ruotsi, Tanska, Norja, Islanti)",
    "market.DACH": "DACH (Saksa, Itävalta, Sveitsi)",
    "market.GCC": "Persianlahden maat (UAE, Saudi-Arabia, Qatar jne.)",
    "market.APAC": "Aasia ja Tyynenmeren alue (APAC)",
    "market.India": "Intia",
    "market.LATAM": "Latinalainen Amerikka (LATAM)",
    "market.Africa": "Afrikka",
    "market.Global": "Globaali / kansainvälinen",
    "market.Other": "Muu",

    // ─── Mock Interview Simulator ───
    "interview.brand.sub": "Suomalainen tekoälyhaastattelun harjoitussimulaattori",
    "interview.hero.title": "Harjoittele oikeaa haastattelua suomalaisen tekoälyhaastattelijan kanssa.",
    "interview.hero.description":
      "Harjoittele 6–8 kysymystä CV:si pohjalta. Haastattelija vaihtelee painotuksia automaattisesti.",
    "interview.nav.backToCv": "Takaisin CV-arvioon",

    "interview.setup.title": "Valmistele haastattelu",
    "interview.setup.description":
      "Lisää CV-tiivistelmä ja haettava tehtävä. Kysymykset mukautuvat taustaasi.",
    "interview.setup.prefillNotice":
      "CV-tiivistelmä ja painopisteet tuotiin valmiiksi edellisestä CV-arviosta.",
    "interview.setup.cvSummary": "CV-tiivistelmä",
    "interview.setup.cvSummaryPlaceholder":
      "Kirjoita 3–6 lausetta kokemuksestasi, saavutuksistasi ja mahdollisista aukoista.",
    "interview.setup.cvSummaryHint":
      "{n} merkkiä. Vähintään 40 merkkiä, jotta haastattelu voi alkaa.",
    "interview.setup.extracting": "Luetaan CV-tiedostoa…",
    "interview.setup.extractedFrom": "Teksti luettiin tiedostosta {name}. Voit vielä muokata sitä.",
    "interview.setup.focusAreas": "Painopisteet (CV:n aukot ja riskit)",
    "interview.setup.focusPlaceholder":
      "esim. ura-aukko 2023, johtamiskokemuksen puute, alan vaihto",
    "interview.setup.addFocus": "Lisää",
    "interview.setup.removeFocus": "Poista",
    "interview.mode.chat": "Chat",
    "interview.mode.video": "Video (kasvokkain)",

    "interview.video.consentTitle": "Videokuvaus vaatii nimenomaisen suostumuksen",
    "interview.video.consentDescription":
      "Kamera on oletuksena pois päältä. Sinulta pyydetään erillinen suostumus ennen kameran käynnistämistä. Kuva näkyy vain omalla laitteellasi — sitä ei lähetetä palvelimelle.",
    "interview.video.privacyTitle": "Videokuva pysyy laitteellasi",
    "interview.video.privacyBody":
      "Esikatselu näytetään pelkästään tässä selaimessa. Mitään videokuvaa tai ääntä ei lähetetä palvelimelle eikä tallenneta.",
    "interview.video.stop": "Sulje kamera",
    "interview.video.offHint":
      "Kamera on pois päältä. Voit jatkaa chatissa tai aloittaa uudelleen videotilassa.",
    "interview.video.cameraError": "Kameran käyttö ei onnistunut",

    "interview.consent.title": "Vahvista kameran käyttö",
    "interview.consent.body1":
      "Otat kameran käyttöön tätä haastatteluistuntoa varten. Kuva näytetään vain omassa selaimessasi.",
    "interview.consent.body2":
      "Palvelin ei tallenna videokuvaa, ääntä eikä kuvakaappauksia.",
    "interview.consent.body3":
      "Voit sulkea kameran milloin tahansa napilla ”Sulje kamera”.",
    "interview.consent.accept": "Hyväksy ja käynnistä kamera",
    "interview.consent.cancel": "Peruuta",

    "interview.start": "Aloita haastattelu",
    "interview.starting": "Käynnistetään…",
    "interview.error.summaryTooShort":
      "Kirjoita vähintään lyhyt CV-tiivistelmä (40 merkkiä) ennen aloitusta.",

    "interview.qtype.behavioral": "Käyttäytymiskysymys",
    "interview.qtype.technical": "Tekninen kysymys",
    "interview.qtype.opening": "Aloitus",
    "interview.qtype.closing": "Lopetus",

    "interview.thinking": "Haastattelija valmistelee seuraavaa kysymystä…",
    "interview.interimLabel": "Välipalaute",
    "interview.answerPlaceholder":
      "Kirjoita vastauksesi tai sanele se. Hyödynnä STAR-rakennetta: Tilanne → Tehtävä → Toiminta → Tulos.",
    "interview.timer.label": "Ajastin",
    "interview.timer.help": "Ajastin on vapaaehtoinen. Se auttaa harjoittelemaan tiiviitä vastauksia, mutta ei rajoita vastaamista.",
    "interview.timer.use": "Käytä ajastinta ({seconds} s)",
    "interview.timer.selectLabel": "Valitse vastausaika",
    "interview.submit": "Lähetä vastaus",
    "interview.finishNow": "Lopeta ja pyydä yhteenveto",
    "interview.voice.start": "Sanele ääneen",
    "interview.voice.stop": "Lopeta sanelu",
    "interview.voice.unsupported": "Sanelu ei ole tuettu tässä selaimessa",
    "interview.voice.errorPrefix": "Äänitunnistuksen virhe",
    "interview.tts.replay": "Kuuntele kysymys",
    "interview.tts.stop": "Hiljennä ääni",

    "interview.audio.record.start": "Tallenna ääni",
    "interview.audio.record.stop": "Lopeta tallennus",
    "interview.audio.record.unsupported": "Tallennus ei ole tuettu",
    "interview.audio.upload": "Lataa äänitiedosto",
    "interview.audio.status.transcribing": "Puretaan puhetta tekstiksi…",
    "interview.audio.status.uploading": "Lähetetään tiedostoa: {name}",
    "interview.audio.status.done":
      "Valmis — {segments} segmenttiä, kesto {seconds} s. Voit muokata vastausta ennen lähetystä.",
    "interview.audio.status.empty": "Puhetta ei tunnistettu. Yritä lähempänä mikrofonia.",
    "interview.audio.status.summary":
      "{segments} segmenttiä · {seconds} s · lataa aikaleimallinen transkripti:",
    "interview.audio.meter.tooQuiet": "Liian hiljaa — puhu lähempänä mikrofonia.",
    "interview.audio.meter.tooLoud": "Liian voimakas — vähennä äänenvoimakkuutta.",
    "interview.audio.meter.ok": "Äänitaso ok",
    "interview.audio.error.prefix": "Tallennusvirhe",
    "interview.audio.error.empty": "Tallenne oli tyhjä.",
    "interview.audio.error.permission":
      "Mikrofonin käyttö estettiin tai sitä ei löytynyt. Salli mikrofoni selaimen asetuksista.",
    "interview.audio.attached":
      "Äänitallenne ({seconds} s) liitetään tähän vastaukseen kun lähetät sen — voit myös muokata yllä olevaa tekstiä ennen lähetystä.",

    "interview.summary.title": "Haastattelun yhteenveto ja valmennus",
    "interview.summary.overall": "Kokonaisarvio",
    "interview.summary.strengths": "Vahvuudet",
    "interview.summary.improvements": "Kehityskohteet",
    "interview.summary.starCoaching": "STAR-valmennus",
    "interview.summary.culturalFit": "Sopivuus suomalaiseen työkulttuuriin",
    "interview.summary.nextSteps": "Seuraavat askeleet",
    "interview.summary.download": "Lataa yhteenveto (JSON)",
    "interview.summary.restart": "Aloita uusi haastattelu",
    "interview.summary.privacy": "Ei tallenneta palvelimelle",
    "interview.summary.listenTitle": "Kuuntele oma haastattelusi",
    "interview.summary.listenWithAudio":
      "Lataa yhteenveto interaktiivisena HTML-tiedostona — sisältää kaikki {count} äänitallennetta, aikaleimallisen transkriptin ja AI-palautteen yhdessä paketissa. Avaa millä tahansa selaimella, ei tarvitse internet-yhteyttä.",
    "interview.summary.listenNoAudio":
      "Lataa yhteenveto interaktiivisena HTML-tiedostona — sisältää koko Q&A-historian ja AI-palautteen. Tallenna ääntä haastattelun aikana ja saat myös kuunneltavat tallenteet mukaan raporttiin.",
    "interview.summary.downloadHtml": "Lataa interaktiivinen koonti (HTML)",
    "interview.summary.htmlBuilding": "Rakennetaan…",
  },
};

const DEFAULT_LANG = "fi";

const I18nContext = createContext({
  language: DEFAULT_LANG,
  setLanguage: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }) {
  // The product is Finnish-only for a simpler, lighter UI.
  const language = DEFAULT_LANG;

  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.lang = DEFAULT_LANG;
    }
  }, []);

  const setLanguage = useCallback((_next) => {
    // No-op: the site is intentionally Finnish-only.
  }, []);

  const t = useCallback(
    (key, vars) => {
      const dict = DICTIONARIES[language] || DICTIONARIES[DEFAULT_LANG];
      let value = dict[key];
      if (value === undefined) value = DICTIONARIES[DEFAULT_LANG][key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        });
      }
      return value;
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

// Map a backend dimension string to the translated label.
export function dimensionKey(dimensionName) {
  switch (dimensionName) {
    case "Formatting and Structure":
      return "dim.formatting";
    case "Content Relevance":
      return "dim.content";
    case "Language and Style":
      return "dim.language";
    case "Cultural and Market Fit":
      return "dim.cultural";
    case "Strategic Positioning":
      return "dim.strategic";
    default:
      return null;
  }
}
