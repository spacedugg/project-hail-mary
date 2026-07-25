/**
 * A+ Content API 2020-11-01 (docs/amazon-content-contract.md §4).
 *
 * A+ ist ein EIGENER Kanal — kein Listing-Attribut. Dieses Modul übersetzt
 * unsere interne, design-guide-nahe Modulbeschreibung in das
 * `contentDocument`, das Amazon akzeptiert, und prüft die harten Grenzen aus
 * dem offiziellen API-Modell.
 *
 * Ehrliche Grenze: `uploadDestinationId` entsteht erst beim Hochladen in die
 * A+-Mediathek (Uploads API) — ohne SP-API-Zugang bleibt es leer, und genau das
 * meldet die Prüfung, statt eine funktionierende Datei vorzutäuschen.
 */

export const APLUS_MODULTYPEN = [
  "STANDARD_COMPANY_LOGO",
  "STANDARD_COMPARISON_TABLE",
  "STANDARD_FOUR_IMAGE_TEXT",
  "STANDARD_FOUR_IMAGE_TEXT_QUADRANT",
  "STANDARD_HEADER_IMAGE_TEXT",
  "STANDARD_IMAGE_SIDEBAR",
  "STANDARD_IMAGE_TEXT_OVERLAY",
  "STANDARD_MULTIPLE_IMAGE_TEXT",
  "STANDARD_PRODUCT_DESCRIPTION",
  "STANDARD_SINGLE_IMAGE_HIGHLIGHTS",
  "STANDARD_SINGLE_IMAGE_SPECS_DETAIL",
  "STANDARD_SINGLE_SIDE_IMAGE",
  "STANDARD_TECH_SPECS",
  "STANDARD_TEXT",
  "STANDARD_THREE_IMAGE_TEXT",
] as const;

export type AplusModulTyp = (typeof APLUS_MODULTYPEN)[number];

export type AplusBild = {
  /** Unsere Quelle (Grafiker-Datei / generiertes Bild). */
  url?: string | null;
  altText?: string | null;
  /** Erst nach Upload in die A+-Mediathek vorhanden. */
  uploadDestinationId?: string | null;
  breitePx?: number;
  hoehePx?: number;
};

export type AplusModul = {
  typ: AplusModulTyp;
  headline?: string | null;
  body?: string | null;
  bild?: AplusBild | null;
  /** STANDARD_TECH_SPECS: 4–16 Zeilen. */
  specs?: Array<{ label: string; wert: string }>;
};

export type AplusEingabe = {
  name: string;
  variante: "basic" | "premium";
  locale: string;
  module: AplusModul[];
};

export type AplusIssue = { modul: number | null; code: string; severity: "error" | "warning"; message: string };

const MAX_ALT = 100;
const MAX_TEXT = 10_000;

function bildKomponente(b: AplusBild | null | undefined) {
  return {
    uploadDestinationId: b?.uploadDestinationId ?? "",
    altText: (b?.altText ?? "").slice(0, MAX_ALT),
    imageCropSpecification: {
      size: {
        width: { value: b?.breitePx ?? 970, units: "pixels" },
        height: { value: b?.hoehePx ?? 600, units: "pixels" },
      },
    },
  };
}

const text = (v?: string | null) => (v?.trim() ? { value: v.trim() } : undefined);

/** Interne Modulbeschreibung → API-`ContentModule`. */
export function modulPayload(m: AplusModul): Record<string, unknown> {
  const basis = { contentModuleType: m.typ };
  switch (m.typ) {
    case "STANDARD_COMPANY_LOGO":
      return { ...basis, standardCompanyLogo: { companyLogo: bildKomponente(m.bild) } };
    case "STANDARD_TEXT":
      return { ...basis, standardText: { headline: text(m.headline), body: text(m.body) } };
    case "STANDARD_PRODUCT_DESCRIPTION":
      return { ...basis, standardProductDescription: { body: text(m.body) } };
    case "STANDARD_TECH_SPECS":
      return {
        ...basis,
        standardTechSpecs: {
          headline: text(m.headline),
          specificationList: (m.specs ?? []).map((s) => ({ label: { value: s.label }, description: { value: s.wert } })),
          tableCount: 1,
        },
      };
    case "STANDARD_SINGLE_IMAGE_HIGHLIGHTS":
      return {
        ...basis,
        standardSingleImageHighlights: {
          image: bildKomponente(m.bild),
          headline: text(m.headline),
          textBlock1: m.body ? { headline: text(m.headline), body: text(m.body) } : undefined,
        },
      };
    case "STANDARD_HEADER_IMAGE_TEXT":
      return { ...basis, standardHeaderImageText: { headline: text(m.headline), block: { image: bildKomponente(m.bild), body: text(m.body) } } };
    case "STANDARD_SINGLE_SIDE_IMAGE":
      return { ...basis, standardSingleSideImage: { imagePositionType: "LEFT", block: { image: bildKomponente(m.bild), headline: text(m.headline), body: text(m.body) } } };
    default:
      // Übrige Modultypen: Grundgerüst mit Bild + Text, Feinschliff folgt mit der
      // A+-Generierung. Ehrlich als Entwurf gekennzeichnet (siehe pruefeAplus).
      return { ...basis, [kamel(m.typ)]: { headline: text(m.headline), body: text(m.body), image: bildKomponente(m.bild) } };
  }
}

function kamel(typ: string): string {
  return typ
    .toLowerCase()
    .split("_")
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("");
}

export function buildAplusContentDocument(e: AplusEingabe) {
  return {
    contentDocument: {
      name: e.name.slice(0, 100),
      // EBC = A+ Basic, EMC = A+ Premium (Brand Story / Premium-Module).
      contentType: e.variante === "premium" ? "EMC" : "EBC",
      locale: e.locale,
      contentModuleList: e.module.map(modulPayload),
    },
  };
}

/** Harte Grenzen aus dem offiziellen API-Modell — deterministisch geprüft. */
export function pruefeAplus(e: AplusEingabe): AplusIssue[] {
  const issues: AplusIssue[] = [];
  if (!e.name.trim()) issues.push({ modul: null, code: "aplus.name", severity: "error", message: "A+-Dokument braucht einen Namen (1–100 Zeichen)." });
  if (e.name.length > 100) issues.push({ modul: null, code: "aplus.name.laenge", severity: "error", message: "Dokumentname > 100 Zeichen." });
  if (e.module.length === 0) issues.push({ modul: null, code: "aplus.leer", severity: "error", message: "Kein Modul im Dokument." });
  if (e.module.length > 7)
    issues.push({ modul: null, code: "aplus.modulzahl", severity: "warning", message: `${e.module.length} Module — der Design-Guide arbeitet mit 1–7.` });

  e.module.forEach((m, i) => {
    if (!APLUS_MODULTYPEN.includes(m.typ))
      issues.push({ modul: i, code: "aplus.typ", severity: "error", message: `Unbekannter Modultyp „${m.typ}".` });
    if ((m.headline ?? "").length > MAX_TEXT || (m.body ?? "").length > MAX_TEXT)
      issues.push({ modul: i, code: "aplus.text", severity: "error", message: `Modul ${i + 1}: Text > ${MAX_TEXT} Zeichen.` });
    if (m.typ === "STANDARD_TECH_SPECS") {
      const n = m.specs?.length ?? 0;
      if (n < 4 || n > 16)
        issues.push({ modul: i, code: "aplus.techspecs", severity: "error", message: `Modul ${i + 1}: Tech-Specs verlangen 4–16 Zeilen, vorhanden ${n}.` });
    }
    const brauchtBild = m.typ !== "STANDARD_TEXT" && m.typ !== "STANDARD_PRODUCT_DESCRIPTION" && m.typ !== "STANDARD_TECH_SPECS" && m.typ !== "STANDARD_COMPARISON_TABLE";
    if (brauchtBild) {
      if (!m.bild?.altText?.trim())
        issues.push({ modul: i, code: "aplus.alttext", severity: "error", message: `Modul ${i + 1}: altText ist Pflicht (max. 100 Zeichen).` });
      if (!m.bild?.uploadDestinationId?.trim())
        issues.push({
          modul: i,
          code: "aplus.upload",
          severity: "warning",
          message: `Modul ${i + 1}: Bild noch nicht in der A+-Mediathek — die uploadDestinationId entsteht erst beim Upload (Stufe 2).`,
        });
    }
  });
  return issues;
}
