import { byteLength, charLength } from "@/lib/text/bytes";
import { RULES } from "@/lib/validation/rules";
import { GALERIE_SLOTS, type ContentSlot } from "./attributes";
import { pruefeProdukttyp } from "./productTypes";
import type { PublishInput } from "./listingsPayload";

/**
 * Publish-Gate (docs/amazon-content-contract.md §8.2) — die deterministische
 * Prüfung VOR jedem Publish-Weg. Bewusst getrennt vom SEO-Gate
 * (`lib/validation/gate.ts`): dort geht es um Textqualität, hier ausschließlich
 * um Annahmefähigkeit.
 *
 * Ehrliche Trennung der Herkunft:
 * - `quelle: "amazon"` — Amazon lehnt das nachweislich ab (Steuerzeichen, Markup,
 *   nicht abrufbare Bild-URL, fehlender Schlüssel).
 * - `quelle: "agentur"` — unsere eigene, strengere Messlatte aus RULES.
 *   Solange kein SP-API-Zugang besteht, sind die Längen NICHT gegen das echte
 *   Product-Type-Schema geprüft; das steht so auch in der Oberfläche.
 */

export type PublishSeverity = "error" | "warning" | "info";

export type PublishIssue = {
  slot: ContentSlot | "allgemein";
  code: string;
  severity: PublishSeverity;
  message: string;
  quelle: "amazon" | "agentur";
};

const STEUERZEICHEN = /[\t\r\n]/;
const MARKUP = /<\s*\/?\s*[a-z][^>]*>/i;

const issue = (
  slot: PublishIssue["slot"],
  code: string,
  severity: PublishSeverity,
  message: string,
  quelle: PublishIssue["quelle"],
): PublishIssue => ({ slot, code, severity, message, quelle });

/** Amazon lädt Bilder selbst — nur dauerhaft erreichbare Ziele funktionieren. */
export function pruefeBildUrl(url: string): { ok: boolean; grund?: string } {
  const u = url.trim();
  if (!u) return { ok: false, grund: "leer" };
  if (u.startsWith("s3://")) return { ok: true };
  if (u.startsWith("http://")) return { ok: false, grund: "http:// wird nicht akzeptiert — https:// nötig" };
  if (!u.startsWith("https://")) return { ok: false, grund: "keine öffentliche https:// oder s3://-Adresse" };
  if (/^https:\/\/(drive\.google|dropbox|wetransfer|onedrive|1drv)\./i.test(u))
    return { ok: false, grund: "Freigabe-Link eines Cloud-Speichers — Amazon kann die Datei nicht direkt laden" };
  if (/[?&](x-amz-signature|token|expires)=/i.test(u))
    return { ok: false, grund: "signierte URL mit Ablaufdatum — Amazon lädt Bilder auch später erneut" };
  return { ok: true };
}

function pruefeText(slot: ContentSlot, label: string, text: string, issues: PublishIssue[]) {
  if (STEUERZEICHEN.test(text))
    issues.push(issue(slot, `${slot}.steuerzeichen`, "error", `${label}: enthält Tab oder Zeilenumbruch — zerstört die Flat-File-Zeile.`, "amazon"));
  if (MARKUP.test(text))
    issues.push(issue(slot, `${slot}.markup`, "error", `${label}: enthält HTML-Markup — Amazon nimmt in diesem Feld nur Klartext.`, "amazon"));
}

/**
 * Vollprüfung eines Publish-Pakets. `publishBereit()` entscheidet danach, ob
 * Download/Push freigeschaltet wird — Buttons sind sonst gesperrt (Arbeitsregel 6).
 */
export function pruefePublish(input: PublishInput, opts?: { fuerApi?: boolean }): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const fuerApi = opts?.fuerApi ?? false;

  // Kundenfreigabe-Pflicht (Marken-Schalter): Bei Kunden, die mitreden wollen,
  // ist ein Publish ohne ihr Ja ein Vertrauensbruch — deshalb ein FEHLER,
  // nicht bloß ein Hinweis. Quelle „agentur": Amazon interessiert das nicht.
  if (input.ohneKundenfreigabe?.length)
    issues.push(
      issue(
        "allgemein",
        "kundenfreigabe.fehlt",
        "error",
        `Diese Marke verlangt die Freigabe des Kunden. Es fehlt sie bei: ${input.ohneKundenfreigabe.join(", ")}.`,
        "agentur",
      ),
    );

  if (!input.sku?.trim())
    issues.push(issue("allgemein", "sku.fehlt", "error", "Keine SKU — ohne SKU findet Amazon kein Listing.", "amazon"));
  else if (input.skuIstNotbehelf)
    issues.push(
      issue("allgemein", "sku.notbehelf", "warning", `Es wird ersatzweise die ASIN als SKU verwendet (${input.sku}). Der Schlüssel für beide Publish-Wege ist die echte Verkäufer-SKU — bitte am Produkt hinterlegen.`, "amazon"),
    );

  // Produkttyp (D129): ein Freitext wie „Doppelwandige Thermogläser" wird von
  // der Listings-API garantiert abgelehnt. Unsere Typ-Liste ist unvollständig —
  // deshalb ist ein unbekannter, aber formal gültiger Token nur ein Hinweis.
  const typ = pruefeProdukttyp(input.productType);
  if (typ.stand === "fehlt") {
    issues.push(
      issue("allgemein", "producttype.fehlt", fuerApi ? "error" : "warning", "Kein Amazon-Produkttyp hinterlegt — die Listings-API verlangt ihn, die Flat File das Feld feed_product_type.", "amazon"),
    );
  } else if (typ.stand === "freitext") {
    issues.push(
      issue("allgemein", "producttype.freitext", "error", `„${typ.wert}" ist eine Beschreibung, kein Amazon-Produkttyp. Erwartet wird ein Token wie DRINKING_CUP oder HOME_BED_AND_BATH.`, "amazon"),
    );
  } else if (typ.stand === "unbekannt") {
    issues.push(
      issue("allgemein", "producttype.unbekannt", "warning", `Produkttyp „${typ.wert}" steht nicht in unserer kuratierten Liste. Das heißt NICHT, dass er falsch ist — verbindlich prüfbar erst mit der Product Type Definitions API (Stufe 2).`, "agentur"),
    );
  }

  // ── Titel ────────────────────────────────────────────────────────────────
  const title = input.title?.trim() ?? "";
  if (!title) {
    issues.push(issue("title", "title.leer", "warning", "Kein freigegebener Titel — der Slot geht nicht mit raus.", "agentur"));
  } else {
    pruefeText("title", "Titel", title, issues);
    if (charLength(title) > RULES.title.maxChars)
      issues.push(
        issue("title", "title.laenge", "warning", `Titel ${charLength(title)} Zeichen > ${RULES.title.maxChars} (Agentur-Messlatte, nicht gegen das Product-Type-Schema geprüft).`, "agentur"),
      );
  }

  // ── Bullets ──────────────────────────────────────────────────────────────
  const bullets = (input.bullets ?? []).map((b) => b?.trim() ?? "").filter(Boolean);
  if (bullets.length === 0) {
    issues.push(issue("bullets", "bullets.leer", "warning", "Keine freigegebenen Bullets — der Slot geht nicht mit raus.", "agentur"));
  } else {
    if (bullets.length > 5)
      issues.push(issue("bullets", "bullets.zuviele", "error", `${bullets.length} Bullets — Amazon nimmt maximal 5; die überzähligen würden verworfen.`, "amazon"));
    if (bullets.length < 5)
      issues.push(
        issue("bullets", "bullets.unvollstaendig", "warning", `Nur ${bullets.length} von 5 Bullets. Achtung: Das Attribut geht IMMER als komplettes Array raus — die fehlenden Plätze werden auf Amazon geleert.`, "amazon"),
      );
    bullets.forEach((b, i) => {
      pruefeText("bullets", `Bullet ${i + 1}`, b, issues);
      if (charLength(b) > RULES.bullets.hardMaxChars)
        issues.push(
          issue("bullets", `bullets.laenge.${i + 1}`, "warning", `Bullet ${i + 1}: ${charLength(b)} Zeichen > ${RULES.bullets.hardMaxChars} (Agentur-Messlatte).`, "agentur"),
        );
    });
  }

  // ── Beschreibung ─────────────────────────────────────────────────────────
  const desc = input.description?.trim() ?? "";
  if (desc) {
    if (STEUERZEICHEN.test(desc) && !desc.includes("\n"))
      issues.push(issue("description", "description.steuerzeichen", "error", "Beschreibung: enthält Tab — zerstört die Flat-File-Zeile.", "amazon"));
    if (MARKUP.test(desc))
      issues.push(
        issue("description", "description.markup", "warning", "Beschreibung enthält HTML. Ob Amazon es rendert, hängt an der Kategorie — wir verlassen uns nicht darauf (Kontrakt §6).", "agentur"),
      );
    if (byteLength(desc) > RULES.description.maxBytes)
      issues.push(
        issue("description", "description.laenge", "warning", `Beschreibung ${byteLength(desc)} B > ${RULES.description.maxBytes} B (Agentur-Messlatte).`, "agentur"),
      );
  }

  // ── Backend-Keywords ─────────────────────────────────────────────────────
  const backend = input.backendKeywords?.trim() ?? "";
  if (backend) {
    pruefeText("backend_keywords", "Backend-Keywords", backend, issues);
    if (backend.includes(","))
      issues.push(
        issue("backend_keywords", "backend.kommas", "warning", "Backend-Keywords enthalten Kommas — Amazon trennt über Leerzeichen; Kommas verschenken Byte-Budget.", "agentur"),
      );
    if (byteLength(backend) > RULES.backendKeywords.maxBytes)
      issues.push(
        issue("backend_keywords", "backend.bytes", "error", `Backend-Keywords ${byteLength(backend)} B > ${RULES.backendKeywords.maxBytes} B — der Überhang wird von Amazon ignoriert.`, "amazon"),
      );
  }

  // ── Bilder ───────────────────────────────────────────────────────────────
  if (input.mainImageUrl?.trim()) {
    const r = pruefeBildUrl(input.mainImageUrl);
    if (!r.ok)
      issues.push(issue("main_image", "main_image.url", "error", `Hauptbild nicht publishbar: ${r.grund}.`, "amazon"));
  }
  (input.galleryImageUrls ?? []).forEach((url, i) => {
    if (!url?.trim()) return;
    const slot = (GALERIE_SLOTS[i] ?? "main_image") as ContentSlot;
    const r = pruefeBildUrl(url);
    if (!r.ok) issues.push(issue(slot, `${slot}.url`, "error", `Galeriebild ${i + 1} nicht publishbar: ${r.grund}.`, "amazon"));
  });

  if (!title && bullets.length === 0 && !desc && !backend && !input.mainImageUrl)
    issues.push(issue("allgemein", "paket.leer", "error", "Nichts zu publishen — kein einziger Slot befüllt.", "agentur"));

  return issues;
}

export const publishBereit = (issues: PublishIssue[]) => !issues.some((i) => i.severity === "error");
