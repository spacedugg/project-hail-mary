# Wissensbasis: Amazon-Listing-Bilder (Typen · Eye-catcher · Qualität)

> **Herkunft.** Verdichtet aus einem kuratierten Korpus echter Gold-Standard-Referenzen
> (42 Hauptbilder + 49 komplette Listings, alle vom Nutzer als *perfekte* Beispiele für
> ihr Produkt/ihre Kategorie eingestuft) plus direkte Nutzer-Kalibrierung (Juli 2026).
> Es gibt darin **keine Negativbeispiele** — die Referenzen sind der Kalibrier-Anker,
> nicht Prüfobjekte.
>
> **Zweck & Abgrenzung (Nutzer-Entscheidung, verbindlich — revidiert D211).**
> - Dieses Wissen dient **drei** Zwecken: (a) den erkannten **Bildinhalt eines bestehenden
>   Listings als Daten-Input** in die Text-Erstellung zu geben (wie Bullets/Titel), (b) eine
>   **4-Faktoren-Einschätzung der bestehenden Bilder** zu liefern (Achse C — Design & Image
>   Quality / Perceived Value / Message Strength / Message Clarity, je mit „was wir sehen /
>   warum / wie besser"), damit vor der Optimierung sichtbar ist, welche Bilder am schwächsten
>   sind und weshalb, und (c) der **Briefing-Erstellung** die Grundlage zu geben, was ein gutes
>   Listing-Bild ausmacht.
> - Die 4-Faktoren-Analyse läuft **automatisch als Schritt von „Listing laden"** — kein
>   Extra-Schritt, kein Knopf, keine eigene UI; sie liefert einfach zusätzliche Analyse-Daten.
> - **KEINE separate Eye-catcher-Analyse eines Fremd-Listings** (das ginge zu weit). Achse B
>   (Eye-catcher) bleibt reines **Briefing-Wissen**.
> - Keine Mindestmengen, keine „jeder Typ muss vorkommen"-Regel. Labels sind Verständnis,
>   kein Gate (vgl. D165/D209).

---

## Achse A — Bildtypen (was ist das für ein Bild?)

Klassifikation ist **inhaltsgetrieben** (was gezeigt wird), nicht formgetrieben. Ein Bild
bekommt einen **Primär-Typ** und optional einen **Sekundär-Typ** (Typen überlappen oft).

| Typ | Erkennungs-Cue (inhaltlich) |
|---|---|
| **main_image** | Produkt-Hero, größte/erste Kachel; sauberer Freisteller oder mit Eye-catcher-Bühne (s. Achse B). |
| **infographic_explainer** | **Mehrere** Datenpunkte / Icon-Grid / How-to / Rechnung / Dosier- bzw. Anwendungs-Tabelle. Auch „Ohne X / Mit Y"-Icon-Grids und „Made-in-DE + frei-von"-Checklisten. |
| **feature_highlight** | **Eine** dominante Kennzahl/Eigenschaft im Fokus (z. B. „2,5 mm", „36 kg", „126 cm", „80 mm/sek"). |
| **brand_trust** | Menschliche Glaubwürdigkeit / Herkunft / Garantie / Zertifikate / Experten-Porträts / Testsieger. (Eine reine „frei-von"-Checkliste ist dagegen Infographic.) |
| **packaging_unboxing** | Was man **geliefert bekommt**: Etikett/**Nährwerttabelle**, Verpackung, **Set-/Bundle-Bestandteile** / Lieferumfang (z. B. Motor + Akku + Tasche; 12er-Probierpaket). |
| **lifestyle_in_use** | Produkt in echter Szene/Anwendung, oft mit Mensch; Zielgruppen-Kontext. |
| **technical_detail** | Maße, Material-Makro, Technik-/Spec-Detail zum Nachprüfen — sofern es NICHT die Verpackungs-/Etikett-Info selbst ist (die ist packaging_unboxing). |

**Kalibrier-Merksätze:**
- Nährwert-/Etikett-Tabelle → *packaging_unboxing* (Inhalt der Verpackung), nicht technical_detail.
- Dosier-/Anwendungs-Empfehlung als Grafik → *infographic_explainer*.
- Eine Kennzahl groß = *feature_highlight*; mehrere/Grid/How = *infographic_explainer*.
- Menschen-Expertise/Testsiegel = *brand_trust*; Icon-„frei-von"-Liste = *infographic_explainer*.

---

## Achse B — Eye-catcher (was macht das nackte Produkt klickstark?)

**Definition.** Ein Eye-catcher ist das, was aus dem *nackten Produkt* ein Hingucker-Bild
für die Amazon-Suchergebnisseite macht — damit es zwischen hunderten Treffern nicht
untergeht. Das nackte Produkt wird **visuell ergänzt** (Highlights, USP, Anwendung …).
Eye-catcher sind **oft ein Verbund** mehrerer der folgenden Modi und müssen **thematisch
ergänzend** zum Produkt sein (Leder-Patch zu Leder, Teichausschnitt zum Teichprodukt).

Modi (einzeln oder kombiniert):
- **Anwendung zeigen** (Feuer aus dem Brenner, Funken beim Feuerstahl, Pellets fallen zu Kois)
- **Zielgruppe zeigen** (Gamer, Jäger, Senioren, Kind+Eltern)
- **verwandte Elemente / Set** (mitgelieferte Bestandteile: Tasche, Filter, Zertifikat …)
- **USP visualisieren** (Kapazitäts-Glow im Behälter, Schnitt-/Schichtaufbau-Inset)
- **Inhaltsstoffe** (Zutaten, Pulver, Kapseln vor dem Glas)
- **Varianten teasern** (Farb-/Sorten-Varianten)
- **dynamischer Winkel** (3/4-Perspektive, herausfliegende Elemente)
- **Badge** — ist praktisch immer Teil des Hauptbilds; physisch verankert (Sticker/Wrap/
  Hangtag/Plakette an Produkt, Verpackung, Kordel, Sockel), nie frei schwebend, nie der
  weiße Hintergrund als Trägerfläche; Text extrem kurz, nur harte Fakten.

**Bottom-/Kontrast-Bühne:** eine farblich zum Produkt getroffene Sockel-/Bodenplatte, die
gegen den weißen Hintergrund kontrastiert, ist selbst ein Eye-catcher-Element (Bühne).

---

## Achse C — Die vier Bewertungs-Dimensionen (Fremd-Audit UND Briefing-Wissen)

Vier Dimensionen, an denen sich Bildqualität festmachen lässt. Sie dienen **doppelt**:
(1) als **4-Faktoren-Einschätzung der bestehenden Listing-Bilder** (je Bild ein Score 0–5
plus „was wir sehen / warum / wie besser") — automatisch beim Listing-Import, damit die
schwächsten Bilder/Faktoren sichtbar werden; und (2) als **Zielbild fürs Briefing**.
Handwerk und Botschaft sind bewusst getrennt:

- **Design & Image Quality** — Komposition, Hierarchie, Ausrichtung, konsistentes Farbschema,
  Studio-Licht. Nicht überladen (Elemente konkurrieren nicht um Aufmerksamkeit).
- **Perceived Value** — wirkt hochwertig/Premium (Grafik, Typografie, Material-Anmutung),
  stärkt Vertrauen und Zahlungsbereitschaft.
- **Message Strength** — starke, belegte Kaufargumente/USPs sind klar transportiert.
- **Message Clarity** — eine Kernaussage pro Bild, lesbar auch als Handy-Thumbnail
  (Schriftgröße, Kontrast, Gruppierung).

**Tiefe / Überlagerung** ist **ein Qualitäts-Signal, kein Gate:** Elemente, die sich
über-/hinterlagern (eins verdeckt das andere) erzeugen Ebenen und den Eindruck, dass
Elemente *im* Bild in Beziehung stehen — statt flach als „Second Layer" draufgesetzt. Es
ist ein Indiz für hochwertige, professionelle, interaktive Gestaltung (nicht „schnell in
Canva / KI-Slop"), das positiv in Design & Image Quality einzahlt — trennt aber nicht
allein Spreu von Weizen.

---

## Übergreifende Prinzipien

1. **Eine Bildwelt, kein Kachel-Sammelsurium.** Licht, Oberflächen, Farbstimmung, Typo-Haltung
   bilden *eine* Welt, die zu Produkt + Use-Case + Zielgruppe + **Marke** passt. Hat die Marke
   schon eine Welt, orientiert man sich daran; Produktfarben lassen sich aufgreifen.
2. **Das Produkt lebt in der Welt** — verankert mit Schatten/Reflexion/Kontakt, nicht davorgelegt.
3. **Text ist ein Design-Element, kein Aufkleber** — in ruhigen Zonen, auf die Welt getuned,
   mit Effekt/Tiefe; verankert an einem Bildelement.
4. **Elemente kommunizieren** miteinander und mit dem Hintergrund; nichts hängt beziehungslos.
5. **Kategorie-/Marken-Anpassung** entscheidet den Stil (clean/premium vs. bunt/verspielt vs.
   rau/natürlich vs. dark/neon). Möbel & Auto dürfen am stärksten Richtung Lifestyle abweichen.
6. **Typ-Mix ist flexibel** — nicht jeder Typ muss vorkommen, ein Typ darf mehrfach vorkommen;
   die gute Mischung ist kategorieabhängig.

---

## Anschluss an das Tool (Datenfluss)

- **Bestehendes Listing (automatisch beim Import, ein Schritt von „Listing laden"):**
  `bildAuslese` (D158) erkennt je Bild Text-im-Bild, Claims, Inhalt und **Typ** (D209); der
  Bild-Audit (Achse C) ergänzt je Bild die **4 Faktoren + Warum**. Beides ist reine
  Analyse-Daten-Ausgabe — kein Knopf, keine eigene UI.
- **Daten-Input:** der erkannte **Bildinhalt ist Input** für die Text-Erstellung — wie
  Bullets/Titel, über die Quelle „Bilder" (Datenfluss-Register, D133/D205). Kein Dead End.
- **Briefing:** dieses Wissen (Achsen A–C + Prinzipien) ist die Grundlage, auf der Briefings
  entstehen — zusammen mit dem erkannten Ist-Bildinhalt und der 4-Faktoren-Einschätzung.
- **Ausdrücklich nicht:** keine separate Eye-catcher-Analyse bestehender Fremd-Bilder
  (Achse B ist Briefing-Wissen).
