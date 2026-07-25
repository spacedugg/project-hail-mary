/**
 * Fehlercode-Register (D101, Nutzer-Vorgabe): Jeder Fehler im Tool erscheint
 * als Popup, das erst nach Klick verschwindet — mit Fehlercode, was er
 * bedeutet und wie man ihn behebt. Die Codes sind stabil (für Support/Suche);
 * die eigentliche Fehlermeldung (message) trägt die Details des Einzelfalls.
 */

export type FehlerInfo = { titel: string; bedeutung: string; loesung: string };

export const FEHLER_CODES: Record<string, FehlerInfo> = {
  "REV-01": {
    titel: "Review-Scrape ins Zeitlimit gelaufen",
    bedeutung: "Ein oder mehrere Scrape-Läufe (je ASIN × Sterne-Klasse) haben nicht rechtzeitig geantwortet. Bereits fertige Läufe sind gespeichert; die genannten Klassen fehlen in der Datenbasis.",
    loesung: "Erneut scrapen (fehlende Klassen kommen dazu) — oder mit weniger ASINs gleichzeitig arbeiten. Bleibt es hängen, den Review-Dienst-Status prüfen.",
  },
  "REV-02": {
    titel: "Scrape lieferte 0 Reviews",
    bedeutung: "Kein einziger Lauf hat eine geschriebene Rezension zurückgegeben. Entweder hat das Produkt (noch) keine Rezensionen mit Text, die ASIN ist falsch, oder der Review-Dienst kommt nicht an die Seiten.",
    loesung: "ASIN und Marktplatz prüfen (Chip zeigt beides). Hat das Produkt auf Amazon sichtbar Rezensionen mit Text, liegt es am Dienst — Fehlermeldung unten beachten.",
  },
  "REV-03": {
    titel: "Review-Dienst-Fehler",
    bedeutung: "Der Scraping-Dienst hat den Auftrag abgelehnt oder mit einem Fehler beantwortet (z. B. fehlende Freigabe, Kontingent, Actor-Problem). Die Detail-Meldung oben nennt die Ursache.",
    loesung: "Der Detail-Meldung folgen (sie enthält ggf. einen Freigabe-Link). Besteht das Problem weiter, den hinterlegten Review-Actor prüfen/tauschen.",
  },
  "REV-04": {
    titel: "Keine ASIN angegeben",
    bedeutung: "Der Scrape wurde ohne einen einzigen ASIN-Chip abgeschickt — es gibt nichts zu scrapen.",
    loesung: "Mindestens einen Chip stehen lassen (die Produkt-ASIN ist vorbelegt) oder eine ASIN tippen und mit Leertaste zum Chip machen.",
  },
  "REV-05": {
    titel: "Analyse ohne Scrape",
    bedeutung: "Die Bewertungs-Analyse braucht einen gespeicherten Review-Scrape als Datenbasis — es gibt noch keinen.",
    loesung: "Erst Schritt 1 (Reviews scrapen) ausführen, dann analysieren.",
  },
  "ANA-01": {
    titel: "Review-Analyse fehlgeschlagen",
    bedeutung: "Die KI-Auswertung des gespeicherten Scrapes ist abgebrochen (Detail-Meldung oben). Der Scrape selbst ist unversehrt gespeichert.",
    loesung: "Analyse erneut starten — der Scrape muss NICHT wiederholt werden. Bei wiederholtem Abbruch die Detail-Meldung ernst nehmen.",
  },
  "FEA-01": {
    titel: "Feature-Ranking nicht möglich",
    bedeutung: "Das Feature-Relevanz-Ranking braucht Listing-Inhalt (Import) UND eine Bewertungs-Analyse als Kunden-Echo — oder der Lauf selbst ist abgebrochen (Detail-Meldung oben).",
    loesung: "Erst Listing importieren und Reviews analysieren, dann erneut ranken. Bestehende Daten bleiben unberührt.",
  },
  "BLK-01": {
    titel: "Blocker-Lauf nicht möglich",
    bedeutung: "Der Conversion-Blocker-Lauf braucht Listing-Inhalt (Import) UND die Kunden-Themen der Bewertungs-Analyse — der Match aus beidem ist der Blocker. Oder der Lauf selbst ist abgebrochen (Detail-Meldung oben).",
    loesung: "Erst Listing importieren und Reviews analysieren, dann erneut starten. Bestehende Daten bleiben unberührt.",
  },
  "VER-01": {
    titel: "Insight-Verdichtung fehlgeschlagen",
    bedeutung: "Die Verdichtungs-Etappe (Roh-Themen → benannte Erkenntnisse) ist abgebrochen. Scrape und Roh-Analyse sind unversehrt gespeichert — nur die Karten fehlen.",
    loesung: "Auf dem Analyse-Dashboard ‚Verdichtung nachholen' klicken — Scrape und Analyse müssen NICHT wiederholt werden.",
  },
  "GEN-01": {
    titel: "Text-Generierung fehlgeschlagen",
    bedeutung: "Die Generierung der Sektion ist abgebrochen (API-Fehler, Zeitbudget oder unlesbare Antwort). Es wurde KEINE neue Version gespeichert.",
    loesung: "Erneut generieren. Schlägt es wiederholt fehl, Detail-Meldung prüfen — bestehende Versionen bleiben unberührt.",
  },
  "QM-01": {
    titel: "QM-Gate hat den Entwurf zurückgehalten",
    bedeutung: "Kein Absturz — das Qualitätsmanagement hat funktioniert: Die Generierung lief, aber das Ergebnis verletzte auch nach automatischen Korrektur-Versuchen Regeln aus dem Regel-Register. Regelverletzende Entwürfe werden nie angezeigt (D182); die Detail-Meldung oben ist das Prüfprotokoll mit den konkreten Verstößen.",
    loesung: "Erneut generieren — jeder Anlauf startet frisch. Blockt derselbe Verstoß wiederholt, fehlt meist ein Input (z. B. Produkt-Wahrheit oder Zusatz-Infos ergänzen, damit belegte Fakten das Budget füllen) — oder es ist ein Bau-Auftrag: Prüfprotokoll mit Code QM-01 melden.",
  },
  "GEN-02": {
    titel: "Content gesperrt — Bewertungs-Analyse fehlt",
    bedeutung: "Die Bewertungs-Analyse ist die Grundlage guter Texte: Sie liefert Kundensprache, Pain Points und Kaufauslöser. Ohne sie ist die Generierung bewusst gesperrt.",
    loesung: "Erst Reviews scrapen und analysieren (Bewertungs-Analyse-Karte). Alternativ in der Content-Karte bewusst ‚ohne Analyse' bestätigen — dann bauen die Texte auf Listing-IST und deinen Zusatz-Infos.",
  },
  "GEN-03": {
    titel: "Keine Text-Grundlage vorhanden",
    bedeutung: "Ohne Bewertungs-Analyse braucht die Generierung eine Ersatz-Grundlage — sonst würde das Tool Fakten erfinden.",
    loesung: "Listing importieren (IST-Zustand als Grundlage) oder in der Content-Karte Zusatz-Infos zum Produkt eintragen (z. B. eigene/fremde Bullets, Details) — dann erneut generieren.",
  },
  "GEN-04": {
    titel: "Keyword-Sprache passt nicht zur Content-Sprache",
    bedeutung: "Die Keyword-Basis ist erkennbar in einer anderen Sprache als die eingestellte Content-Sprache dieses Produkts. Lokalisierter Content braucht Keywords vom Ziel-Marktplatz — Übersetzen reicht nicht, weil das Suchverhalten je Land anders ist.",
    loesung: "Eine Keyword-Analyse (Cerebro) vom Ziel-Marktplatz hochladen und die alte Basis löschen. Marktplatz und Content-Sprache sind beim Produkt fest (werden beim Anlegen bestimmt) — für einen anderen Marktplatz das Produkt neu anlegen.",
  },
  "GEN-05": {
    titel: "Sektion wartet in der geführten Kette",
    bedeutung: "Die Content-Sektionen bauen aufeinander auf (Titel → Item Highlights → Bullets → Beschreibung → Backend → Q&A): Jede Sektion wird mit den FREIGEGEBENEN Vorgängern als Kontext generiert — so entstehen keine Wort-Dopplungen zwischen den Texten. Ein Vorgänger dieser Sektion ist noch nicht freigegeben.",
    loesung: "Den genannten Vorgänger im Content-Reiter prüfen und freigeben — die Freigabe generiert die nächste Sektion automatisch.",
  },
  "WB-01": {
    titel: "Wettbewerber-Abgleich fehlgeschlagen",
    bedeutung: "Der Abgleich der Wettbewerber-Listings mit dem eigenen Listing ist abgebrochen (Detail-Meldung oben). Nicht kritisch: Er ergänzt nur übertragbare Zusatz-Informationen; Scrape und Analyse bleiben unversehrt.",
    loesung: "Lauf erneut anstoßen (Analyse-Reiter). Bleibt es hängen, ohne Wettbewerber-Abgleich weiterarbeiten — der Content entsteht auch ohne ihn.",
  },
  "IMP-01": {
    titel: "Listing-Import fehlgeschlagen",
    bedeutung: "Weder der Web-Abruf noch der Produkt-Crawler konnten das Amazon-Listing laden (Detail-Meldung oben — z. B. Blockade, Zeitlimit, unbekannte ASIN).",
    loesung: "ASIN + Marktplatz prüfen und erneut importieren. Alternativ die Listing-Daten als CSV hochladen.",
  },
  "IMP-02": {
    titel: "Produkt ohne ASIN",
    bedeutung: "Für den Listing-Import braucht das Produkt eine ASIN — es ist keine hinterlegt.",
    loesung: "In den Produkt-Stammdaten die ASIN eintragen, dann importieren.",
  },
  "IMP-03": {
    titel: "Scrape lieferte die falsche Sprachansicht",
    bedeutung: "Amazon hat statt des Original-Listings die maschinenübersetzte Sprachansicht ausgeliefert (erkennbar an Übersetzungs-Artefakten wie „furry nose“ für „Fellnase“). Der Import wurde NICHT gespeichert — sonst würden Listing-Kontrolle, Fakten-Extraktion und Content-Generierung eine Übersetzung statt des echten Listings bewerten.",
    loesung: "Erneut importieren — der Scraper pinnt die Marktplatz-Sprache jetzt per URL-Parameter. Kommt der Fehler wiederholt, den Import-Weg wechseln (Env LISTING_IMPORT_PROVIDER) und mit Code IMP-03 melden.",
  },
  "CSV-01": {
    titel: "CSV-Import fehlgeschlagen",
    bedeutung: "Die hochgeladene Datei konnte nicht als Listing-CSV gelesen werden (Detail-Meldung oben).",
    loesung: "Format prüfen (Spalten wie in der Vorlage) und erneut hochladen.",
  },
  "KW-01": {
    titel: "Keyword-Export nicht lesbar",
    bedeutung: "Die Datei entspricht nicht dem erwarteten Cerebro-Export (Detail-Meldung oben, z. B. fehlende Spalte ‚Keyword Phrase').",
    loesung: "In Helium 10 → Cerebro den CSV-Export der Ziel-ASIN ziehen (optional mit Wettbewerbern) und diese Datei unverändert hochladen.",
  },
  "KW-02": {
    titel: "Keyword-Relevanz-Prüfung fehlgeschlagen",
    bedeutung: "Der Relevanz-Filter (Marken/Maße/Anzahl/Farbe/Form) ist abgebrochen — die Keyword-Basis wurde nicht verändert.",
    loesung: "Vorgang wiederholen. Bei wiederholtem Abbruch Detail-Meldung prüfen (meist API-Problem der Marken-Erkennung).",
  },
  "AUD-01": {
    titel: "Tiefen-Audit fehlgeschlagen",
    bedeutung: "Das Audit ist abgebrochen oder seine Voraussetzungen fehlen (Detail-Meldung oben). Es wurde kein unvollständiges Audit gespeichert.",
    loesung: "Voraussetzungen herstellen (Listing geladen, Bewertungs-Analyse vorhanden) und erneut starten.",
  },
  "SET-01": {
    titel: "Lösch-Bestätigung fehlt",
    bedeutung: "Die Sicherheitsabfrage wurde nicht exakt beantwortet — es wurde nichts gelöscht.",
    loesung: "Zum Bestätigen exakt LÖSCHEN in das Feld tippen.",
  },
  "CMS-01": {
    titel: "Content-Piece nicht gespeichert",
    bedeutung:
      "Der Eintrag in die Content-Bibliothek ist fehlgeschlagen — meist, weil der gewählte Platz unbekannt ist, das Produkt nicht existiert oder gar kein Inhalt eingegeben wurde.",
    loesung: "Platz und Produkt prüfen, Inhalt eintragen und erneut speichern. Mehrteilige Plätze (Bullets, Q&A): eine Zeile je Eintrag.",
  },
  "CMS-02": {
    titel: "Kunden-Zugang nicht angelegt",
    bedeutung:
      "Ansprechpartner oder Freigabe-Link konnten nicht erzeugt werden — meist fehlt ein Pflichtfeld oder die E-Mail ist beim Kunden schon hinterlegt.",
    loesung: "Angaben vervollständigen. Existiert der Ansprechpartner bereits, den vorhandenen Eintrag im Link auswählen.",
  },
  "CMS-03": {
    titel: "Feedback nicht gespeichert",
    bedeutung: "Die Rückmeldung war leer oder der Freigabe-Link ist nicht mehr gültig (abgelaufen oder widerrufen).",
    loesung: "Text eingeben und erneut senden. Bei einem abgelaufenen Link einen neuen Freigabe-Link erzeugen.",
  },
  "CMS-04": {
    titel: "Amazon-Produkttyp ist kein gültiger Token",
    bedeutung:
      'Eingetragen wurde eine Beschreibung (z. B. „Doppelwandige Thermogläser"). Amazons Listings-API verlangt einen Token wie DRINKING_CUP oder HOME_BED_AND_BATH — eine Beschreibung wird sicher abgelehnt.',
    loesung:
      "Den Token aus der Vorschlagsliste wählen. Steht der passende Typ nicht drin: In Seller Central die Kategorievorlage generieren — dort steht der Typ im Feld feed_product_type.",
  },
  "CMS-05": {
    titel: "Onboarding: keine gültige ASIN",
    bedeutung: "In der Liste war keine erkennbare Amazon-ASIN. Eine ASIN hat genau 10 Zeichen und beginnt meist mit B0.",
    loesung: "ASINs je Zeile oder durch Komma getrennt einfügen — z. B. aus der Amazon-Markenseite oder Seller Central kopiert.",
  },
  "REG-01": {
    titel: "Regeländerung nicht übernommen",
    bedeutung:
      "Der neue Grenzwert war keine sinnvolle Zahl, oder es fehlte die Quelle. Ohne Herkunftsangabe wird keine Regel gespeichert — sonst weiß später niemand, warum eine Grenze so ist.",
    loesung: "Zahl größer als 0 eintragen und die Quelle angeben (z. B. die Amazon-Ankündigung mit Datum).",
  },
  "REG-02": {
    titel: "Suche nach Amazon-Änderungen fehlgeschlagen",
    bedeutung:
      "Der Regel-Wächter konnte die Websuche nicht abschließen (Zeitlimit, API-Fehler oder unlesbare Antwort). Es wurde NICHTS am Regelstand verändert.",
    loesung: "Erneut versuchen. Bleibt es dabei, die Detail-Meldung prüfen — der Wächter braucht den Anthropic-Schlüssel mit Websuche.",
  },
  "ALG-00": {
    titel: "Unerwarteter Fehler",
    bedeutung: "Ein Fehler ohne eigenen Code — die Detail-Meldung oben ist die beste Information, die das Tool hat.",
    loesung: "Vorgang wiederholen. Tritt der Fehler erneut auf, Detail-Meldung mit Fehlercode ALG-00 melden.",
  },
};

export function fehlerInfo(code: string | undefined): { code: string } & FehlerInfo {
  const c = code && FEHLER_CODES[code] ? code : "ALG-00";
  return { code: c, ...FEHLER_CODES[c] };
}
