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

/**
 * Kern-Logik der Content-Master-Actions (D221/D222) — testbar, nimmt `db`.
 * LLM (Klassifikator/Regenerator) wird injiziert → in Tests mockbar (D184).
 */

const uuid = () => crypto.randomUUID();
type ProductRow = typeof products.$inferSelect;

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

async function baueGateCtxKern(db: Db, child: ProductRow) {
  const kws = await db.query.keywords.findMany({ where: eq(keywords.productId, child.id) });
  const aktiv = kws.filter((k) => !k.ausgeschlossen);
  const byTier = (t: string) => aktiv.filter((k) => k.tier === t).map((k) => k.keyword);
  const alleKeywords = aktiv.map((k) => k.keyword);
  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(listingSnapshots.productId, child.id),
    orderBy: desc(listingSnapshots.createdAt),
  });
  const fremdmarken = [
    ...new Set(
      kws.map((k) => k.ausschlussGrund ?? "").filter((g) => g.startsWith("Marke: ")).map((g) => g.slice("Marke: ".length).trim()).filter(Boolean),
    ),
  ];
  // Zahlen-Herkunft (D114): NUR eigene Wahrheit — Fakten, eigenes Listing-IST, Zusatz, Keywords.
  const zahlenQuellen = [
    child.marke ?? "",
    child.name,
    JSON.stringify(child.facts),
    snapshot?.title ?? "",
    ...(snapshot?.bullets ?? []),
    child.zusatzKontext ?? "",
    ...alleKeywords,
  ].join("\n");
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
  if (!base || base.parentProductId !== parentId) return { ok: false, fehler: "Base-Child gehört nicht zu diesem Parent." };

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

  const kinder = await db.query.products.findMany({ where: eq(products.parentProductId, parentId) });
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
  const ziele = kinder.filter((k) => (k.asin ?? k.id) !== master.baseChildAsin);
  if (ziele.length === 0) return { ok: false, fehler: "Keine Geschwister-Childs zum Propagieren (nur Base).", mock: false, kinder: [] };

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

    const ctx = await baueGateCtxKern(db, k);
    issues.push(...validateTitle(content.title, ctx), ...validateBullets(content.bullets, ctx), ...validateDescription(content.description, content.bullets, ctx));

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
