# BodegaDK – Design Guide (Bodega Edition)

------------------------------------------------------------
VISION
------------------------------------------------------------

BodegaDK skal ligne en digital bodega:

- Mørk træstemning
- Varme amber/røde nuancer
- Serif overskrifter (skilt/etiket feel)
- Sans-serif UI tekst
- Følelse af: kortspil, øl, nikotin, laminerede skilte

Det må gerne være hyggeligt, lidt råt – men stadig moderne og brugbart.


------------------------------------------------------------
DESIGN TOKENS (Single Source of Truth)
------------------------------------------------------------

Alle designbeslutninger styres fra styles.css via CSS-variabler.

Farvepalette (Bodega Theme)

--bg            = Mørk træ-baggrund
--surface       = Paneler / kort
--text          = Varm lys beige tekst
--muted         = Støvet beige sekundær tekst
--primary       = Øl/amber (CTA farve)
--danger        = Rød neon
--border        = Diskret lys border
--focus         = Fokus-outline

Designprincip:
- Ingen blå startup-farver
- Ingen kolde gråtoner
- Alt skal føles varmt


------------------------------------------------------------
TYPOGRAFI
------------------------------------------------------------

Overskrifter:
- Serif stack:
  ui-serif, Georgia, "Times New Roman", serif
- Uppercase
- Let øget letter-spacing
- Skal føles som et pubs skilt

UI / Brødtekst:
- Sans-serif stack:
  system-ui, -apple-system, Segoe UI, Roboto
- Læsbart
- Simpelt
- Ikke dekorativt


------------------------------------------------------------
LAYOUT SYSTEM
------------------------------------------------------------

Struktur:

Topbar
Sidebar | Main

Topbar:
- 60px høj
- Sticky
- Indeholder:
    - Logo
    - Sprogvalg
    - Login / Opret / Profil
- Mørk halvtransparent baggrund

Sidebar:
- Træpanel look
- Burger toggle
- Menu:
    - Spil
    - Indstillinger
    - Hjælp

Active menu item:
- Amber highlight
- Diskret inset shadow

Main:
- Luft
- Cards i grid
- Max 3 kolonner desktop


------------------------------------------------------------
KOMPONENTER
------------------------------------------------------------

CARDS (Lamineret bodega-skilt)

- Mørk varm baggrund
- Diskret highlight (slidt plast look)
- Serif titel
- Amber CTA knap

Hover:
- Let lysere baggrund
- Ingen glow-effekter


KNAPPER

Primary:
- Amber gradient
- Mørk tekst
- Bold font

Secondary:
- Transparent
- Lys border
- Diskret hover

Fokus:
- Skal altid have outline
- Må aldrig fjernes


------------------------------------------------------------
SPROG / I18N
------------------------------------------------------------

- Standard: Dansk
- Fremtidssikret til engelsk
- Al tekst kommer fra src/i18n.ts
- Ingen hardcoded strings

Key format:
nav.play
home.title
game.cheat


------------------------------------------------------------
TONE OF VOICE
------------------------------------------------------------

Må gerne have bodega-humor:

Eksempler:
- "Taber betaler næste omgang"
- "Vælg en klassiker"
- "Flere spil kommer løbende"

Men:
- Ikke for useriøst
- Ingen intern humor der forvirrer


------------------------------------------------------------
TILGÆNGELIGHED
------------------------------------------------------------

- Keyboard navigation skal virke
- Fokusmarkering skal være synlig
- Kontrast skal være læsbar
- Klikbare elementer skal være mobilvenlige


------------------------------------------------------------
FREMTIDIGE TEMAER
------------------------------------------------------------

Hvis vi senere vil have:
- Neon tema
- Kridttavle tema

Så implementeres det via:

body[data-theme="neon"]
body[data-theme="chalk"]

Ikke via inline styles.


------------------------------------------------------------
HVAD VI IKKE GØR
------------------------------------------------------------

- Ingen Tailwind
- Ingen tilfældige farver
- Ingen Google Fonts
- Ingen inline styles
- Ingen blå gradients


------------------------------------------------------------
KORT SAGT
------------------------------------------------------------

BodegaDK er:

Digital brunt værtshus møder moderne web-app.
