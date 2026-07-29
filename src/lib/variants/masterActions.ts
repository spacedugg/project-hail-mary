import { eq, desc } from "drizzle-orm";
import type { Db } from "@/db/client";
import { products, contentVersions, keywords, listingSnapshots, type ValidationIssue } from "@/db/schema";
import { validateTitle, validateBullets, validateDescription } from "@/lib/validation/gate";
import {
  zerlegeInSlots,
  wendeKlassifikationAn,
  wendeMasterAn,
  pruefeMaster,
  pruefeLockedKonsistenz,
  type ContentMaster,
  type MasterContent,
  type MasterVerstoss,
  type AufgeloesterSlot,
  type SlotRegenerator,
} from "./master";
import type { SlotKlassifikator } from "./masterLlm";
import { snapshotBildBelege } from "@/lib/analysis/bildAuslese";

/**
 * Kern-Logik der Content-Master-Actions (D221/D222) — testbar, nimmt `db`.
 * LLM (Klassifikator/Regenerator) wird injiziert → in Tests mockbar (D184).
 */

const uuid = () => crypto.randomUUID();
type ProductRow = typeof products.$inferSelect;
type KeywordRow = typeof keywords.$inferSelect;

// ── Content lesen ────────────────────────────────────────────────────────────

function payloadZuContent(
  titleP?: Record<string, unknown>,
  bulletsP?: Record<string, unknown>,
  descP?: Record<string, unknown>,
): MasterContent | null {
  if (!titleP || !bulletsP || !descP) return null;
  const title = typeof titleP.text === "string" ? titleP.text : "";
  const bullets = Array.isArray(bulletsP.items) ? (bulletsP.items as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const description = typeof descP.text === "string" ? descP.text : "";
  if (!title || bullets.length === 0 || !description) return null;
  return { title, bullets, description };
}

/** NUR freigegebener Content (für die Master-Ableitung — der Nutzer war zufrieden). */
export async function leseFreigegebenenContent(db: Db, productId: string): Promise<MasterContent | null> {
  const versions = await db.query.contentVersions.findMany({
    where: eq(contentVersions.productId, productId),
    orderBy: desc(contentVersions.createdAt),
  });
  const approved = (t: string) => versions.find((v) => v.type === t && v.status === "approved")?.payload as Record<string, unknown> | undefined;
  return payloadZuContent(approved("title"), approved("bullets"), approved("description"));
}

/** Aktueller Content (freigegeben bevorzugt, sonst neuester Entwurf) — Basis des Familien-Audits. */
async function leseAktuellenContent(db: Db, productId: string): Promise<MasterContent | null> {
  const versions = await db.query.contentVersions.findMany({
    where: eq(contentVersions.productId, productId),
    orderBy: desc(contentVersions.createdAt),
  });
  const pick = (t: string) => {
    const approved = versions.find((v) => v.type === t && v.status === "approved");
    const neuester = versions.find((v) => v.type === t); // desc(createdAt) → neuester zuerst
    return (approved ?? neuester)?.payload as Record<string, unknown> | undefined;
  };
  return payloadZuContent(pick("title"), pick("bullets"), pick("description"));
}

// ── Gate-Kontext (spiegelt den Haupt-Generierungsflow, D114/D181) ───────────────

/**
 * Zahlen-Herkunft EINES Produkts (D114): eigene Fakten + eigenes Listing-IST +
 * Zusatz-Infos + Keywords. Als Helper herausgezogen, damit dieselbe Kette auch
 * für die BASE-Variante gebaut werden kann (siehe `baueGateCtxKern`).
 */
async function leseZahlenQuellen(db: Db, p: ProductRow, kwsVorab?: KeywordRow[]): Promise<string> {
  const kws = kwsVorab ?? (await db.query.keywords.findMany({ where: eq(keywords.productId, p.id) }));
  const alleKeywords = kws.filter((k) => !k.ausgeschlossen).map((k) => k.keyword);
  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(listingSnapshots.productId, p.id),
    orderBy: desc(listingSnapshots.createdAt),
  });
  return [
    p.marke ?? "",
    p.name,
    JSON.stringify(p.facts),
    snapshot?.title ?? "",
    ...(snapshot?.bullets ?? []),
    // Bild-/A+/Produktinfo-Beleg (D231/D240): Zahlen, die nur auf den EIGENEN Bildern
    // stehen (z. B. „30 Sekunden"), gelten als belegt — sonst würde die Varianten-
    // Ableitung sie fälschlich als „zahl-ohne-quelle" flaggen. Spiegelt den Hauptflow.
    snapshotBildBelege(snapshot),
    p.zusatzKontext ?? "",
    ...alleKeywords,
  ].join("\n");
}

/**
 * Findet die BASE-Variante einer Familie (die, aus deren Content der Master
 * abgeleitet wurde). `master.baseChildAsin` ist ASIN-oder-ProductId.
 */
function findeBaseVariante(varianten: ProductRow[], master: ContentMaster): ProductRow | undefined {
  return varianten.find((v) => (v.asin ?? v.id) === master.baseChildAsin);
}

/**
 * Gate-Kontext eines Childs. `basisZahlenQuellen` (optional) trägt die Zahlen-
 * Herkunft der BASE-Variante bei: Beim Ableiten aus einem Master IST die Base
 * die Produkt-Wahrheit der Familie. Geschmacks-/Farb-Varianten sind physisch
 * dasselbe Produkt — Maße, Zubereitungszeit, Portionen sind identisch; jede
 * pro-ASIN neu gescrapte Zahl weicht nur durch Scrape-Rauschen ab (10,1 vs 10,8).
 * Ohne diese Vereinigung meldet das Gate KOPIERTE Base-Zahlen fälschlich als
 * „ohne Quelle"/„Widerspruch" (Kern-Bug der Varianten-Ableitung). Erfundene
 * Zahlen (in KEINER Quelle) schlagen weiterhin an — die Vereinigung ist additiv.
 */
async function baueGateCtxKern(db: Db, child: ProductRow, basisZahlenQuellen = "") {
  const kws = await db.query.keywords.findMany({ where: eq(keywords.productId, child.id) });
  const aktiv = kws.filter((k) => !k.ausgeschlossen);
  const byTier = (t: string) => aktiv.filter((k) => k.tier === t).map((k) => k.keyword);
  const alleKeywords = aktiv.map((k) => k.keyword);
  const fremdmarken = [
    ...new Set(
      kws.map((k) => k.ausschlussGrund ?? "").filter((g) => g.startsWith("Marke: ")).map((g) => g.slice("Marke: ".length).trim()).filter(Boolean),
    ),
  ];
  const eigene = await leseZahlenQuellen(db, child, kws); // kws bereits geladen → kein Doppel-Read
  const zahlenQuellen = basisZahlenQuellen ? `${eigene}\n${basisZahlenQuellen}` : eigene;
  return { facts: child.facts, primaryKeywords: byTier("primary"), alleKeywords, competitorBrands: fremdmarken, zahlenQuellen };
}

// ── Master ableiten & freigeben ─────────────────────────────────────────────────

export type MasterEntwurf = { ok: true; master: ContentMaster; mock: boolean } | { ok: false; fehler: string };

export async function baueMasterEntwurfKern(
  db: Db,
  parentId: string,
  baseChildId: string,
  klassifikator: SlotKlassifikator,
): Promise<MasterEntwurf> {
  const parent = await db.query.products.findFirst({ where: eq(products.id, parentId) });
  if (!parent || parent.variantRole !== "parent") return { ok: false, fehler: "Kein Parent." };
  const theme = parent.variationTheme;
  if (!Array.isArray(theme) || theme.length === 0) return { ok: false, fehler: "Parent hat kein variationTheme." };

  const base = await db.query.products.findFirst({ where: eq(products.id, baseChildId) });
  // Base darf ein Child (parentProductId===parentId) ODER der Representative selbst (id===parentId) sein.
  if (!base || (base.id !== parentId && base.parentProductId !== parentId))
    return { ok: false, fehler: "Base-Variante gehört nicht zu dieser Familie." };

  const content = await leseFreigegebenenContent(db, baseChildId);
  if (!content) return { ok: false, fehler: "Base-Child hat keinen freigegebenen Content (Titel + Bullets + Beschreibung nötig)." };

  const baseAxis = base.variantAxisValues ?? {};
  const roh = zerlegeInSlots(content, baseAxis, theme);
  const { regenerateIds, mock } = await klassifikator(roh, theme, baseAxis);
  const slots = wendeKlassifikationAn(roh, regenerateIds, theme);
  return { ok: true, master: { baseChildAsin: base.asin ?? baseChildId, theme, slots }, mock };
}

export async function gibMasterFreiKern(
  db: Db,
  parentId: string,
  master: ContentMaster,
): Promise<{ ok: boolean; fehler?: string; verstoesse?: MasterVerstoss[] }> {
  const parent = await db.query.products.findFirst({ where: eq(products.id, parentId) });
  if (!parent || parent.variantRole !== "parent") return { ok: false, fehler: "Kein Parent." };
  const verstoesse = pruefeMaster(master);
  if (verstoesse.length > 0) return { ok: false, fehler: "Master-Kontrakt verletzt.", verstoesse };
  await db.update(products).set({ contentMaster: master }).where(eq(products.id, parentId));
  return { ok: true };
}

// ── Familien-Audit: locked byte-identisch über den PERSISTIERTEN Content ─────────

export type FamilieAuditKind = { asin: string; productId: string; issues: ValidationIssue[] };

/** Baut die Slot-Struktur des Masters aus rohem Content nach (Positionen, keine Token). */
function contentZuSlots(content: MasterContent, theme: string[]): AufgeloesterSlot[] {
  return zerlegeInSlots(content, {}, theme).map((s) => ({ id: s.id, quelle: s.quelle, index: s.index, kind: s.kind, text: s.template }));
}

/**
 * ECHTE Cross-Child-Prüfung (D221/D181): liest den AKTUELL gespeicherten Content
 * jedes Childs (nicht die frisch kopierten Slots) und prüft, ob die locked-Slots
 * byte-identisch zum Master sind. So schlägt der Gate an, wenn ein Child (Base
 * oder Geschwister) unabhängig verändert wurde — genau der „zuckerfrei in einem,
 * nicht im anderen"-Fall. Pro Child einzeln geprüft → keine ASIN-Substring-Zuordnung.
 */
export async function auditFamilieKonsistenzKern(
  db: Db,
  parentId: string,
): Promise<{ ok: boolean; fehler?: string; kinder: FamilieAuditKind[] }> {
  const parent = await db.query.products.findFirst({ where: eq(products.id, parentId) });
  if (!parent || parent.variantRole !== "parent") return { ok: false, fehler: "Kein Parent.", kinder: [] };
  const master = parent.contentMaster;
  if (!master) return { ok: false, fehler: "Kein Content-Master.", kinder: [] };

  const childRows = await db.query.products.findMany({ where: eq(products.parentProductId, parentId) });
  // Representative-Parent ist selbst eine kaufbare Variante → in die Konsistenz-Prüfung einbeziehen.
  const kinder = parent.variantParentContainer ? childRows : [parent, ...childRows];
  const out: FamilieAuditKind[] = [];
  for (const k of kinder) {
    const content = await leseAktuellenContent(db, k.id);
    if (!content) continue; // Child ohne Content wird (noch) nicht geprüft
    const asin = k.asin ?? k.id;
    const slots = contentZuSlots(content, master.theme);
    out.push({ asin, productId: k.id, issues: pruefeLockedKonsistenz(master, [{ asin, slots }]) });
  }
  return { ok: true, kinder: out };
}

// ── Propagieren ─────────────────────────────────────────────────────────────────

export type PropagierKind = { asin: string; productId: string; issues: ValidationIssue[]; passed: boolean };
export type PropagierErgebnis = { ok: boolean; fehler?: string; mock: boolean; warnung?: string; kinder: PropagierKind[] };

const TOKEN_RE = /\{\{[^}]+\}\}/;
function hatResttoken(content: MasterContent): boolean {
  return TOKEN_RE.test(content.title) || content.bullets.some((b) => TOKEN_RE.test(b)) || TOKEN_RE.test(content.description);
}
function fehlendeAchsen(axisValues: Record<string, string> | null | undefined, theme: string[]): string[] {
  return theme.filter((a) => typeof axisValues?.[a] !== "string" || !axisValues![a].trim());
}

// Harte Amazon-Limits (Zeichen/Bytes/leer/Anzahl): bleiben IMMER scharf — auch auf
// kopierten Slots —, sonst entstünde ein technisch un-publishbares Listing.
const HARTE_LIMITS = new Set([
  "title.max-length", "title.empty",
  "bullets.hard-max", "bullets.empty", "bullets.count",
  "description.max-bytes", "description.empty",
]);

/**
 * Slot-abhängiges Gate (D247, Nutzer-Vorgabe): Der QM-Umfang hängt an der Slot-Rolle
 * des Masters — nur pro Variante NEU getextete (regenerate) Slots durchlaufen das
 * VOLLE inhaltliche QM. locked-Slots (wortgleich) und token-Slots (nur Achsenwert
 * eingesetzt) sind bereits mit der Base freigegeben und werden inhaltlich NICHT
 * erneut geprüft; ihre strukturelle Treue sichern familie.locked-konsistent,
 * familie.token-unaufgeloest und familie.achsenwert-fehlt ab. Ausnahme: harte
 * Amazon-Limits bleiben immer scharf.
 */
function filtereNachSlotRolle(issues: ValidationIssue[], master: ContentMaster): ValidationIssue[] {
  const titelRegen = master.slots.some((s) => s.quelle === "title" && s.kind === "regenerate");
  const regenBullets = new Set(master.slots.filter((s) => s.quelle === "bullet" && s.kind === "regenerate").map((s) => s.index));
  const descRegen = master.slots.some((s) => s.quelle === "description" && s.kind === "regenerate");
  return issues.filter((i) => {
    if (i.rule.startsWith("familie.") || HARTE_LIMITS.has(i.rule)) return true;
    if (i.rule.startsWith("title.")) return titelRegen;
    if (i.rule.startsWith("description.")) return descRegen;
    if (i.rule.startsWith("bullets.")) {
      const m = i.message.match(/^Bullet (\d+):/);
      return m ? regenBullets.has(Number(m[1])) : regenBullets.size > 0;
    }
    return true; // Unbekanntes konservativ behalten
  });
}

async function persistiereChildContent(
  db: Db,
  productId: string,
  content: MasterContent,
  gateIssues: ValidationIssue[],
  generatedBy: string,
): Promise<void> {
  const vorhanden = await db.query.contentVersions.findMany({ where: eq(contentVersions.productId, productId) });
  const naechste = (t: string) => vorhanden.filter((v) => v.type === t).reduce((m, v) => Math.max(m, v.version), 0) + 1;
  const rationale = [{ part: "Varianten-Master", source: generatedBy }];
  const report = (prefix: string) => {
    const rel = gateIssues.filter((i) => i.rule.startsWith(prefix));
    return { passed: !rel.some((i) => i.severity === "error"), issues: rel, checkedAt: new Date().toISOString() };
  };
  await db.transaction(async (tx) => {
    await tx.insert(contentVersions).values({ id: uuid(), productId, type: "title", version: naechste("title"), payload: { text: content.title, rationale }, status: "draft", validation: report("title"), generatedBy });
    await tx.insert(contentVersions).values({ id: uuid(), productId, type: "bullets", version: naechste("bullets"), payload: { items: content.bullets, rationale }, status: "draft", validation: report("bullets"), generatedBy });
    await tx.insert(contentVersions).values({ id: uuid(), productId, type: "description", version: naechste("description"), payload: { text: content.description, rationale }, status: "draft", validation: report("description"), generatedBy });
  });
}

/**
 * Propagiert den freigegebenen Master auf alle Geschwister-Childs (außer Base):
 * locked kopieren · token Code-Tausch · regenerate via injiziertem LLM.
 * Pro Child: Achsen-Vollständigkeit + Leftover-Token + deterministisches Content-Gate
 * (mit ECHTEM Kontext: Keywords/Zahlen-Quellen/Fremdmarken). Danach Familien-Audit
 * über den persistierten Content (Cross-Child-Gate, D221).
 *
 * `opts.regeneratorMock`: läuft der Regenerator im Mock UND gibt es regenerate-Slots,
 * ist der Output NICHT wirklich neu getextet — ehrlich als `mock`/`warnung` gemeldet.
 */
export async function propagiereFamilieKern(
  db: Db,
  parentId: string,
  regenerate: SlotRegenerator,
  opts: { regeneratorMock?: boolean } = {},
): Promise<PropagierErgebnis> {
  const parent = await db.query.products.findFirst({ where: eq(products.id, parentId) });
  if (!parent || parent.variantRole !== "parent") return { ok: false, fehler: "Kein Parent.", mock: false, kinder: [] };
  const master = parent.contentMaster;
  if (!master) return { ok: false, fehler: "Kein freigegebener Content-Master.", mock: false, kinder: [] };
  const mv = pruefeMaster(master);
  if (mv.length > 0) return { ok: false, fehler: "Master-Kontrakt verletzt.", mock: false, kinder: [] };

  const kinder = await db.query.products.findMany({ where: eq(products.parentProductId, parentId) });
  // Representative-Parent ist selbst eine kaufbare Variante — er muss propagiert werden,
  // wenn er NICHT die Base ist (sonst bliebe sein Alt-Content inkonsistent und der
  // Audit-Befund würde beim Merge verschluckt). Spiegelt die Variantenmenge des Audits.
  const alleVarianten = parent.variantParentContainer ? kinder : [parent, ...kinder];
  const ziele = alleVarianten.filter((k) => (k.asin ?? k.id) !== master.baseChildAsin);
  if (ziele.length === 0) return { ok: false, fehler: "Keine weiteren Varianten zum Propagieren (nur die Base).", mock: false, kinder: [] };

  // Familien-Wahrheit: die Zahlen-Quellen der Base fließen in JEDES Child-Gate ein (siehe baueGateCtxKern).
  const baseRow = findeBaseVariante(alleVarianten, master);
  const basisZahlenQuellen = baseRow ? await leseZahlenQuellen(db, baseRow) : "";

  const hatRegenerate = master.slots.some((s) => s.kind === "regenerate");
  const mock = !!opts.regeneratorMock && hatRegenerate;

  const ergebnisse: PropagierKind[] = [];
  for (const k of ziele) {
    const asin = k.asin ?? k.id;
    const fehlend = fehlendeAchsen(k.variantAxisValues, master.theme);
    if (fehlend.length > 0) {
      ergebnisse.push({
        asin, productId: k.id, passed: false,
        issues: [{ rule: "familie.achsenwert-fehlt", severity: "error", evidence: "deterministic", message: `Child ${asin}: Achsenwert fehlt für: ${fehlend.join(", ")}.` }],
      });
      continue; // NICHT persistieren — unvollständige Achsen
    }

    const { content } = await wendeMasterAn(master, k.variantAxisValues ?? {}, regenerate);
    const issues: ValidationIssue[] = [];
    if (hatResttoken(content))
      issues.push({ rule: "familie.token-unaufgeloest", severity: "error", evidence: "deterministic", message: `Child ${asin}: unaufgelöster Platzhalter im abgeleiteten Content.` });

    const ctx = await baueGateCtxKern(db, k, basisZahlenQuellen);
    const gate = [...validateTitle(content.title, ctx), ...validateBullets(content.bullets, ctx), ...validateDescription(content.description, content.bullets, ctx)];
    issues.push(...filtereNachSlotRolle(gate, master)); // nur regenerate-Slots inhaltlich prüfen (D247)

    await persistiereChildContent(db, k.id, content, issues, `variants.master:${parentId}${mock ? ":mock" : ""}`);
    ergebnisse.push({ asin, productId: k.id, issues, passed: !issues.some((i) => i.severity === "error") });
  }

  // Cross-Child-Gate über den JETZT persistierten Content (D181: hier greift die Regel real)
  const audit = await auditFamilieKonsistenzKern(db, parentId);
  if (audit.ok)
    for (const a of audit.kinder) {
      const e = ergebnisse.find((r) => r.productId === a.productId);
      if (e && a.issues.length) {
        e.issues.push(...a.issues);
        e.passed = e.passed && !a.issues.some((i) => i.severity === "error");
      }
    }

  return {
    ok: true,
    mock,
    warnung: mock
      ? "Regenerate-Slots wurden im Mock-Modus NICHT wirklich neu getextet (kein API-Key) — die Geschwister tragen den Referenztext. Vor Freigabe mit echtem Modell erneut propagieren."
      : undefined,
    kinder: ergebnisse,
  };
}

export type PropagierChildErgebnis =
  | { ok: true; mock: boolean; warnung?: string; kind: PropagierKind }
  | { ok: false; fehler: string; mock: false };

/**
 * Propagiert den Master auf GENAU EIN Geschwister-Child (D236) — dieselbe Logik
 * wie `propagiereFamilieKern`, nur für ein Ziel. Dadurch kann die Baum-UI die
 * Übertragung Kind für Kind live anstoßen und den Fortschritt sichtbar machen,
 * statt auf einen einzigen Sammel-Aufruf zu warten. Bewusst als eigene Funktion
 * neben der getesteten Batch-Variante — kein Umbau erprobter Logik.
 */
export async function propagiereChildKern(
  db: Db,
  parentId: string,
  childId: string,
  regenerate: SlotRegenerator,
  opts: { regeneratorMock?: boolean } = {},
): Promise<PropagierChildErgebnis> {
  const parent = await db.query.products.findFirst({ where: eq(products.id, parentId) });
  if (!parent || parent.variantRole !== "parent") return { ok: false, fehler: "Kein Parent.", mock: false };
  const master = parent.contentMaster;
  if (!master) return { ok: false, fehler: "Kein freigegebener Content-Master.", mock: false };
  const mv = pruefeMaster(master);
  if (mv.length > 0) return { ok: false, fehler: "Master-Kontrakt verletzt.", mock: false };

  const child = await db.query.products.findFirst({ where: eq(products.id, childId) });
  if (!child || (child.id !== parentId && child.parentProductId !== parentId))
    return { ok: false, fehler: "Variante gehört nicht zu dieser Familie.", mock: false };
  const asin = child.asin ?? child.id;
  if (asin === master.baseChildAsin)
    return { ok: false, fehler: "Das ist die Base-Variante — sie wird nicht überschrieben.", mock: false };

  const hatRegenerate = master.slots.some((s) => s.kind === "regenerate");
  const mock = !!opts.regeneratorMock && hatRegenerate;

  const fehlend = fehlendeAchsen(child.variantAxisValues, master.theme);
  if (fehlend.length > 0) {
    return {
      ok: true, mock,
      kind: {
        asin, productId: child.id, passed: false,
        issues: [{ rule: "familie.achsenwert-fehlt", severity: "error", evidence: "deterministic", message: `Child ${asin}: Achsenwert fehlt für: ${fehlend.join(", ")}.` }],
      },
    };
  }

  const { content } = await wendeMasterAn(master, child.variantAxisValues ?? {}, regenerate);
  const issues: ValidationIssue[] = [];
  if (hatResttoken(content))
    issues.push({ rule: "familie.token-unaufgeloest", severity: "error", evidence: "deterministic", message: `Child ${asin}: unaufgelöster Platzhalter im abgeleiteten Content.` });

  // Familien-Wahrheit: Base-Zahlen-Quellen in das Child-Gate einbeziehen (siehe baueGateCtxKern).
  const kinder = await db.query.products.findMany({ where: eq(products.parentProductId, parentId) });
  const baseRow = findeBaseVariante(parent.variantParentContainer ? kinder : [parent, ...kinder], master);
  const basisZahlenQuellen = baseRow ? await leseZahlenQuellen(db, baseRow) : "";
  const ctx = await baueGateCtxKern(db, child, basisZahlenQuellen);
  const gate = [...validateTitle(content.title, ctx), ...validateBullets(content.bullets, ctx), ...validateDescription(content.description, content.bullets, ctx)];
  issues.push(...filtereNachSlotRolle(gate, master)); // nur regenerate-Slots inhaltlich prüfen (D247)
  await persistiereChildContent(db, child.id, content, issues, `variants.master:${parentId}${mock ? ":mock" : ""}`);

  // Cross-Child-Gate über den JETZT persistierten Content — nur für dieses Child.
  const audit = await auditFamilieKonsistenzKern(db, parentId);
  if (audit.ok) {
    const a = audit.kinder.find((x) => x.productId === child.id);
    if (a && a.issues.length) issues.push(...a.issues);
  }

  return {
    ok: true, mock,
    warnung: mock ? "Regenerate-Slot im Mock-Modus nicht wirklich neu getextet (kein API-Key)." : undefined,
    kind: { asin, productId: child.id, issues, passed: !issues.some((i) => i.severity === "error") },
  };
}
