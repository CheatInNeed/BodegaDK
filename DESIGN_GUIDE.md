# BodegaDK – Design Guide

## Mål
En konsistent, enkel UI-stil til hele spilleplatformen:
- Dansk som standard
- Klar struktur: Topbar + Sidebar + Main
- Skalerbart: nye sider/spil kan tilføjes uden at ændre hele layoutet

---

## Design tokens (kilden til sandheden)
Brug CSS-variabler i `styles.css`. Alle farver/afstande/typografi kommer derfra.

### Farver
- Background (app): `--bg`
- Surface (kort/paneler): `--surface`
- Text: `--text`
- Muted text: `--muted`
- Border: `--border`
- Primary (CTA): `--primary`
- Primary hover: `--primaryHover`
- Focus ring: `--focus`

### Radius, spacing, shadows
- Radius: `--radius`
- Spacing (8px grid): `--s1..--s6`
- Shadow: `--shadow1`

---

## Layout-regler
### Topbar
- Fast højde: 56px
- Indeholder: Logo/Home, sprog, login/opret, profil
- Skal altid være synlig (sticky/fixed)

### Sidebar (burger/menu)
- Venstrestillet og fuld højde
- Kan toggles (collapsed/expanded)
- Menu items: Spil, Indstillinger, Hjælp (placeholder ok)

### Main
- Alt indhold ligger i main og skifter ud fra navigation (simple “view state”)

---

## Komponenter
### Knapper
- Primær: solid `--primary`, hvid tekst
- Sekundær: outline (border), transparent baggrund
- Fokus: tydelig ring via `--focus`

### Cards
- Brug `--surface`, border `--border`, radius `--radius`
- Brug samme padding på tværs (fx `--s4`)

---

## Sprog / i18n
- Al tekst skal komme fra `src/i18n.ts` via en `t(key)`-funktion
- Elementer i DOM tagges med `data-i18n="some.key"`
- Aktivt sprog gemmes i localStorage (`lang`)

---

## Navngivning
- CSS classes: kebab-case (fx `.topbar`, `.sidebar-item`)
- i18n keys: dot notation (fx `nav.play`, `home.title`)

---

## Tilgængelighed (min. standard)
- Alle klikbare ting skal kunne nås med keyboard
- Fokusmarkering må ikke fjernes
- Kontrast skal være læsbar (tekst vs. baggrund)
