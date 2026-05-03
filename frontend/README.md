# Frontend

Tämä kansio sisältää CV-arvioijan React-käyttöliittymän. Käyttöliittymä on pidetty tarkoituksella kevyenä: yksi selkeä CV-lomake, yksi haastattelunäkymä ja yksinkertainen footer.

## Komennot

```bash
yarn install
yarn start
yarn build
```

- `yarn start` käynnistää kehityspalvelimen.
- `yarn build` tekee tuotantoversion `build/`-kansioon.

## Tärkeimmät tiedostot

- `src/App.js` — CV-arvioinnin päänäkymä.
- `src/pages/InterviewPage.js` — haastatteluharjoitus.
- `src/components/` — lomakkeet, raportit, tietosuoja ja UI-osat.
- `src/i18n.js` — suomenkieliset käyttöliittymätekstit.
- `src/App.css` — pienet omat tyylit Tailwindin lisäksi.

## Avoimen lähdekoodin pohja

Frontend käyttää Reactia, React Routeria, Tailwind CSS:ää, shadcn/ui-komponentteja, Radix UI:ta, lucide-react-ikoneita ja axiosia. Näiden kirjastojen päälle on rakennettu sovelluksen oma käyttöliittymä ja työnkulku.
