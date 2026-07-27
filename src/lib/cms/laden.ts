import { eq, desc, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { ContentType, Marketplace, PieceQuelle } from "@/db/schema";
import { GALERIE_SLOTS, SLOTS, type ContentSlot } from "@/lib/amazon/attributes";
import { pruefePublish, type PublishIssue } from "@/lib/amazon/publishGate";
import type { PublishInput } from "@/lib/amazon/listingsPayload";
import { vergleiche, alertsAus, type AbgleichErgebnis, type SollStand } from "./accuracy";
import { freigabeStand, type FreigabeStand } from "./freigabestand";

/**
 * Die Content-Bibliothek ist eine SICHT, keine zweite Datenhaltung.
 *
 * Sie vereint zwei Quellen:
 * - `content_versions` — alles, was der Optimizer erzeugt hat (Text).
 * - `content_pieces`  — Bilder, A+ und Bestands-Content aus der Zeit vor dem Tool.
 *
 * Vorrangregel (bewusst, damit „Soll" eindeutig bleibt):
 * 1. freigegebene Optimizer-Version  → das ist das Soll
 * 2. sonst importiertes/manuelles Piece
 * 3. sonst: kein Soll (ein Entwurf allein ist KEIN Soll)
 */

export type SlotStand = {
  slot: ContentSlot;
  label: string;
  kind: "text" | "image" | "aplus";
  publishWeg: "listing" | "aplus" | "manuell";
  /** Der wirksame Soll-Wert (mehrteilige Slots als Liste). */
  werte: string[];
  quelle: PieceQuelle | null;
  status: "freigegeben" | "entwurf" | "leer";
  /** Es gibt einen neueren, noch nicht freigegebenen Entwurf. */
  entwurfOffen: boolean;
  versionId?: string;
  pieceId?: string;
  hinweis?: string;
  /** Interne Freigabe: wer und wann. */
  freigegebenVon?: string | null;
  freigegebenAm?: Date | null;
  /** Hat der KUNDE diesen Platz über den Freigabe-Link freigegeben? */
  kundeFreigegeben?: boolean;
  /** Die eine Freigabe-Kette: Entwurf → intern → beim Kunden → Kunde ✓. */
  freigabe: FreigabeStand;
};

export type CmsProdukt = {
  id: string;
  name: string;
  asin: string | null;
  /** Aktueller Listing-Titel (live gecrawlt, sonst unser Soll-Titel) — null, wenn noch nichts geladen. */
  liveTitle: string | null;
  /** Hauptbild fürs Katalog-Thumbnail (live gecrawlt, sonst freigegebenes Soll-Bild) — null = keins da. */
  bildUrl: string | null;
  marketplace: Marketplace;
  /** Amazon-Produkttyp-Token (nicht die menschliche Beschreibung aus den Fakten). */
  productType: string | null;
  /** Menschliche Beschreibung aus der Fakten-Extraktion — Grundlage für den Vorschlag. */
  produktartText: string | null;
  sku: string;
  skuIstNotbehelf: boolean;
  /**
   * Wie viele Slots als Soll nur den übernommenen Live-Stand tragen. Solange das
   * > 0 ist, misst die Accuracy „wir haben nichts verändert" — kein Qualitätswert.
   */
  sollAusIst: number;
  /** Sprachbefund des letzten Imports (z. B. englische Fassung statt deutscher). */
  sprachHinweis: string | null;
  /** Freigegebene Kern-Plätze von fünf — die Soll-Quote der Produktliste. */
  kernFreigegeben: number;
  slots: SlotStand[];
  soll: SollStand;
  publish: PublishInput;
  publishIssues: PublishIssue[];
  abgleich: AbgleichErgebnis;
  snapshotAlter: Date | null;
  feedbackOffen: number;
  feedbackGesamt: number;
  /** Variations-Familie (D221): Rolle + Kopf-Verweis + Container-Flag für den Katalog-Baum. */
  variantRole: "standalone" | "parent" | "child";
  parentProductId: string | null;
  variantParentContainer: boolean;
};

export type MarkenCms = {
  brand: { id: string; name: string; clientId: string };
  produkte: CmsProdukt[];
  /** Durchschnitt über alle messbaren Produkte — null, wenn nichts messbar ist. */
  accuracyPct: number | null;
  messbareProdukte: number;
};

const alsText = (v: unknown): string => (typeof v === "string" ? v : "");

function werteAusPayload(type: ContentType, payload: Record<string, unknown> | undefined): string[] {
  if (!payload) return [];
  switch (type) {
    case "bullets":
      return ((payload.items as string[]) ?? []).filter(Boolean);
    case "qa":
      return ((payload.pairs as Array<{ q: string; a: string }>) ?? []).map((p) => `${p.q}\n${p.a}`);
    default: {
      const t = alsText(payload.text);
      return t ? [t] : [];
    }
  }
}

function werteAusPiece(piece: typeof schema.contentPieces.$inferSelect): string[] {
  if (Array.isArray(piece.werte)) return (piece.werte as unknown[]).map(String).filter(Boolean);
  return piece.wert?.trim() ? [piece.wert.trim()] : [];
}

export async function ladeMarkenCms(brandId: string): Promise<MarkenCms | null> {
  const db = await getDb();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
  if (!brand) return null;

  const produkte = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const pids = produkte.map((p) => p.id);

  const [versionen, pieces, snapshots, feedback] = pids.length
    ? await Promise.all([
        db.query.contentVersions.findMany({
          where: inArray(schema.contentVersions.productId, pids),
          orderBy: desc(schema.contentVersions.createdAt),
        }),
        db.query.contentPieces.findMany({ where: inArray(schema.contentPieces.productId, pids) }),
        db.query.listingSnapshots.findMany({
          where: inArray(schema.listingSnapshots.productId, pids),
          orderBy: desc(schema.listingSnapshots.createdAt),
        }),
        db.query.contentFeedback.findMany({ where: inArray(schema.contentFeedback.productId, pids) }),
      ])
    : [[], [], [], []];

  const cmsProdukte = produkte.map((p) => {
    const vs = versionen.filter((v) => v.productId === p.id);
    const ps = pieces.filter((x) => x.productId === p.id);
    const snapshot = snapshots.find((s) => s.productId === p.id) ?? null;
    const fb = feedback.filter((f) => f.productId === p.id);

    const slots: SlotStand[] = SLOTS.map((def) => {
      const freigegeben = def.contentType ? vs.find((v) => v.type === def.contentType && v.status !== "draft") : undefined;
      const neuster = def.contentType ? vs.find((v) => v.type === def.contentType) : undefined;
      const piece = ps.find((x) => x.slot === def.slot);

      const kundeFrei = fb.some(
        (f) => f.slot === def.slot && f.autorTyp === "kunde" && f.art === "freigabe" && (!f.contentVersionId || f.contentVersionId === freigegeben?.id),
      );
      const feedbackZuSlot = fb
        .filter((f) => f.slot === def.slot && f.autorTyp === "kunde")
        .map((f) => ({ art: f.art, status: f.status, versionId: f.contentVersionId, createdAt: f.createdAt }));

      if (freigegeben) {
        return {
          slot: def.slot,
          label: def.label,
          kind: def.kind,
          publishWeg: def.publishWeg,
          werte: werteAusPayload(def.contentType!, freigegeben.payload),
          quelle: "optimizer" as const,
          status: "freigegeben" as const,
          entwurfOffen: !!neuster && neuster.id !== freigegeben.id,
          versionId: freigegeben.id,
          hinweis: def.hinweis,
          freigegebenVon: freigegeben.approvedBy,
          freigegebenAm: freigegeben.approvedAt,
          kundeFreigegeben: kundeFrei,
          freigabe: freigabeStand({
            hatInhalt: true,
            versionId: freigegeben.id,
            freigegeben: true,
            sentToClientAt: freigegeben.sentToClientAt,
            kundenFeedback: feedbackZuSlot,
          }),
        };
      }
      if (piece && werteAusPiece(piece).length) {
        return {
          slot: def.slot,
          label: def.label,
          kind: def.kind,
          publishWeg: def.publishWeg,
          werte: werteAusPiece(piece),
          quelle: piece.quelle,
          status: piece.status === "entwurf" ? ("entwurf" as const) : ("freigegeben" as const),
          entwurfOffen: false,
          pieceId: piece.id,
          hinweis: def.hinweis,
          freigabe: freigabeStand({
            hatInhalt: true,
            versionId: null,
            freigegeben: piece.status !== "entwurf",
            sentToClientAt: null,
            kundenFeedback: feedbackZuSlot,
          }),
        };
      }
      return {
        slot: def.slot,
        label: def.label,
        kind: def.kind,
        publishWeg: def.publishWeg,
        werte: [],
        quelle: null,
        status: neuster ? ("entwurf" as const) : ("leer" as const),
        entwurfOffen: !!neuster,
        versionId: neuster?.id,
        hinweis: def.hinweis,
        freigabe: freigabeStand({
          hatInhalt: !!neuster,
          versionId: neuster?.id ?? null,
          freigegeben: false,
          sentToClientAt: null,
          kundenFeedback: feedbackZuSlot,
        }),
      };
    });

    const wert = (slot: ContentSlot) => slots.find((s) => s.slot === slot)?.werte ?? [];
    const einzel = (slot: ContentSlot) => wert(slot)[0] ?? null;

    const soll: SollStand = {
      title: einzel("title"),
      bullets: wert("bullets"),
      description: einzel("description"),
      backendKeywords: einzel("backend_keywords"),
      mainImageUrl: einzel("main_image"),
    };

    // SKU: echte Verkäufer-SKU, sonst ASIN als Notbehelf — aber sichtbar als solcher.
    const echteSku = p.sku?.trim() || null;
    const sku = echteSku ?? p.asin ?? p.id.slice(0, 12);

    // Bei strenger Marke: Welche publishbaren Plätze mit Inhalt sind noch nicht
    // vom Kunden abgesichert? Genau die blockieren dann den Publish.
    const ohneKundenfreigabe = brand.publishNurMitKundenfreigabe
      ? slots
          .filter((s) => s.publishWeg === "listing" && s.werte.length > 0 && !s.freigabe.abgesichert)
          .map((s) => s.label)
      : [];

    const publish: PublishInput = {
      sku,
      ohneKundenfreigabe,
      skuIstNotbehelf: !echteSku,
      asin: p.asin,
      // NUR der Token zählt. `facts.productType` ist eine Beschreibung und darf
      // hier nicht einspringen — sonst geht Freitext in den Payload.
      productType: p.amazonProductType?.trim() || null,
      marketplace: p.marketplace,
      title: soll.title,
      bullets: soll.bullets ?? [],
      description: soll.description,
      backendKeywords: soll.backendKeywords,
      mainImageUrl: soll.mainImageUrl,
      galleryImageUrls: GALERIE_SLOTS.map((g) => einzel(g as ContentSlot) ?? "").filter(Boolean),
    };

    const abgleich = vergleiche(soll, snapshot ? {
      title: snapshot.title,
      bullets: snapshot.bullets,
      description: snapshot.description,
      imageUrls: snapshot.imageUrls,
      gecrawltAm: snapshot.createdAt,
    } : null);

    return {
      id: p.id,
      name: p.name,
      asin: p.asin,
      // Live-Stand hat Vorrang (das steht wirklich auf Amazon); sonst unser Soll.
      liveTitle: snapshot?.title?.trim() || soll.title || null,
      bildUrl: snapshot?.imageUrls?.[0] || soll.mainImageUrl || null,
      marketplace: p.marketplace,
      productType: p.amazonProductType?.trim() || null,
      produktartText: p.facts.productType ?? null,
      sku,
      skuIstNotbehelf: !echteSku,
      sollAusIst: slots.filter((s) => s.quelle === "ist_uebernommen" && s.werte.length > 0).length,
      sprachHinweis:
        (snapshot?.raw as { sprachHinweis?: string | null } | null)?.sprachHinweis ?? null,
      kernFreigegeben: slots.filter((s) => KERN_SLOTS.includes(s.slot) && s.status === "freigegeben").length,
      slots,
      soll,
      publish,
      publishIssues: pruefePublish(publish),
      abgleich,
      snapshotAlter: snapshot?.createdAt ?? null,
      feedbackOffen: fb.filter((f) => f.status === "offen").length,
      feedbackGesamt: fb.length,
      variantRole: p.variantRole,
      parentProductId: p.parentProductId,
      variantParentContainer: p.variantParentContainer,
    } satisfies CmsProdukt;
  });

  const messbar = cmsProdukte.filter((p) => p.abgleich.accuracyPct !== null);
  return {
    brand: { id: brand.id, name: brand.name, clientId: brand.clientId },
    produkte: cmsProdukte,
    accuracyPct: messbar.length
      ? Math.round(messbar.reduce((a, p) => a + (p.abgleich.accuracyPct ?? 0), 0) / messbar.length)
      : null,
    messbareProdukte: messbar.length,
  };
}

/** Alerts aus dem aktuellen Abgleich — Ableitung, keine zweite Wahrheit. */
export function alertsFuer(cms: MarkenCms) {
  return cms.produkte.flatMap((p) => alertsAus(p.abgleich, p.name).map((a) => ({ ...a, produktId: p.id, produktName: p.name })));
}

/**
 * Die fünf Plätze, an denen sich entscheidet, ob ein Produkt verkauft.
 * Sie bilden die Soll-Quote in der Produktliste — nicht alle 17 Slots, sonst
 * sähe jedes Produkt dauerhaft halbleer aus.
 */
export const KERN_SLOTS: ContentSlot[] = ["title", "bullets", "description", "backend_keywords", "main_image"];

export type OffeneFreigabe = {
  versionId: string;
  productId: string;
  produktName: string;
  asin: string | null;
  slot: ContentSlot;
  label: string;
  version: number;
  erstelltAm: Date;
  generiertVon: string | null;
  /** Kurzfassung für die Liste. */
  auszug: string;
  /** Voller Wortlaut — für den fokussierten Durchgang. */
  werte: string[];
};

/**
 * Freigabe-Eingang: Was wartet auf die interne Abnahme?
 *
 * Gezählt wird NUR der jeweils neueste Stand je Produkt und Sektion — und nur,
 * wenn er die Prüfung bestanden hat. Ein Entwurf mit Fehlern ist keine
 * Freigabe-Aufgabe, sondern eine Werkstatt-Aufgabe.
 */
export async function ladeOffeneFreigaben(brandId: string): Promise<OffeneFreigabe[]> {
  const db = await getDb();
  const produkte = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const pids = produkte.map((p) => p.id);
  if (!pids.length) return [];

  const versionen = await db.query.contentVersions.findMany({
    where: inArray(schema.contentVersions.productId, pids),
    orderBy: desc(schema.contentVersions.createdAt),
  });

  const gesehen = new Set<string>();
  const offen: OffeneFreigabe[] = [];
  for (const v of versionen) {
    const key = `${v.productId}:${v.type}`;
    if (gesehen.has(key)) continue; // nur der neueste Stand je Sektion zählt
    gesehen.add(key);
    if (v.status !== "draft") continue;
    if (v.validation && !v.validation.passed) continue;

    const def = SLOTS.find((s) => s.contentType === v.type);
    const produkt = produkte.find((p) => p.id === v.productId)!;
    const werte = werteAusPayload(v.type, v.payload);
    offen.push({
      versionId: v.id,
      productId: v.productId,
      produktName: produkt.name,
      asin: produkt.asin,
      slot: (def?.slot ?? v.type) as ContentSlot,
      label: def?.label ?? v.type,
      version: v.version,
      erstelltAm: v.createdAt,
      generiertVon: v.generatedBy,
      auszug: werte.join(" · ").slice(0, 160),
      werte,
    });
  }
  return offen;
}

/** Bereits abgenommene Stände — für den zugeklappten Teil des Eingangs. */
export async function ladeErledigteFreigaben(brandId: string, limit = 20) {
  const db = await getDb();
  const produkte = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const pids = produkte.map((p) => p.id);
  if (!pids.length) return [];
  const versionen = await db.query.contentVersions.findMany({
    where: inArray(schema.contentVersions.productId, pids),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  // Freigaben von vor dem 22.07. tragen kein Datum und keinen Urheber — das
  // Feld gab es noch nicht. Sie werden trotzdem gezeigt, mit ehrlicher Lücke
  // statt erfundenem Zeitstempel.
  return versionen
    .filter((v) => v.status !== "draft")
    .slice(0, limit)
    .map((v) => ({
      versionId: v.id,
      productId: v.productId,
      produktName: produkte.find((p) => p.id === v.productId)?.name ?? "",
      label: SLOTS.find((s) => s.contentType === v.type)?.label ?? v.type,
      version: v.version,
      approvedBy: v.approvedBy,
      approvedAt: v.approvedAt,
    }));
}

export type ShareKontext = {
  share: typeof schema.contentShares.$inferSelect;
  brand: { id: string; name: string };
  kontakt: { id: string; name: string } | null;
};

/**
/**
 * Kunden-Portal-Kennung: der EINE dauerhafte Marken-Link (ohne Ablauf, mit
 * Freigaberecht, aktiv). So unterscheidet er sich ohne Extra-Spalte von den
 * befristeten Freigabe-Links. Siehe `cms-actions.portalErstellen`.
 */
export function istPortal(s: typeof schema.contentShares.$inferSelect): boolean {
  return !s.revokedAt && s.expiresAt === null && s.darfFreigeben;
}

/**
 * Freigabe-Token prüfen. „ungültig", „widerrufen" und „abgelaufen" sind
 * unterschiedliche Fälle — der Kunde soll wissen, woran er ist, statt vor
 * einer nichtssagenden Fehlerseite zu stehen.
 */
export async function ladeShare(tokenWert: string): Promise<{ ok: true; ctx: ShareKontext } | { ok: false; grund: string }> {
  const db = await getDb();
  const share = await db.query.contentShares.findFirst({ where: eq(schema.contentShares.token, tokenWert) });
  if (!share) return { ok: false, grund: "Dieser Link ist ungültig." };
  if (share.revokedAt) return { ok: false, grund: "Dieser Link wurde zurückgezogen." };
  if (share.expiresAt && share.expiresAt.getTime() < Date.now())
    return { ok: false, grund: `Dieser Link ist am ${share.expiresAt.toLocaleDateString("de-DE")} abgelaufen.` };
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, share.brandId) });
  if (!brand) return { ok: false, grund: "Die zugehörige Marke existiert nicht mehr." };
  const kontakt = share.contactId
    ? ((await db.query.clientContacts.findFirst({ where: eq(schema.clientContacts.id, share.contactId) })) ?? null)
    : null;
  return {
    ok: true,
    ctx: {
      share,
      brand: { id: brand.id, name: brand.name },
      kontakt: kontakt ? { id: kontakt.id, name: kontakt.name } : null,
    },
  };
}

/** Publish-Protokoll je Marke (neueste zuerst). */
export async function ladePublikationen(brandId: string, limit = 12) {
  const db = await getDb();
  return db.query.contentPublications.findMany({
    where: eq(schema.contentPublications.brandId, brandId),
    orderBy: desc(schema.contentPublications.createdAt),
    limit,
  });
}

/**
 * Live-Qualitäts-Score je Produkt einer Marke (Bauplan v3.6).
 *
 * Eigene Funktion statt in ladeMarkenCms: Der Score braucht Keywords, Insights
 * und SOV, die die Bibliotheks-Sicht nicht lädt. So bleibt jede Sicht schlank
 * und lädt nur, was sie zeigt.
 */
export type ProduktLiveScore = {
  productId: string;
  name: string;
  score: import("./livescore").LiveScore;
  /** Score aus dem letzten festgeschriebenen Check — Vergleichswert fürs Delta. */
  vorher: number | null;
};

export async function ladeLiveScores(brandId: string): Promise<{ produkte: ProduktLiveScore[]; schnitt: number | null }> {
  const { liveScore } = await import("./livescore");
  const db = await getDb();
  const produkte = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const pids = produkte.map((p) => p.id);
  if (!pids.length) return { produkte: [], schnitt: null };

  const [snapshots, kws, insightsAll, checks, uploads] = await Promise.all([
    db.query.listingSnapshots.findMany({
      where: inArray(schema.listingSnapshots.productId, pids),
      orderBy: desc(schema.listingSnapshots.createdAt),
    }),
    db.query.keywords.findMany({ where: inArray(schema.keywords.productId, pids) }),
    db.query.reviewInsights.findMany({
      where: inArray(schema.reviewInsights.productId, pids),
      orderBy: desc(schema.reviewInsights.createdAt),
    }),
    db.query.contentChecks.findMany({
      where: inArray(schema.contentChecks.productId, pids),
      orderBy: desc(schema.contentChecks.createdAt),
    }),
    db.query.reportUploads.findMany({ where: eq(schema.reportUploads.brandId, brandId) }),
  ]);

  const sovFor = (pid: string) => {
    const u = uploads.find(
      (x) => x.reportType === "cerebro" && x.parseStatus === "ok" && (x.parsed as { productId?: string })?.productId === pid,
    );
    return (u?.parsed as { audit?: import("@/lib/sov/audit").SovAudit } | undefined)?.audit ?? null;
  };

  const out: ProduktLiveScore[] = produkte.map((p) => {
    const snap = snapshots.find((s) => s.productId === p.id) ?? null;
    const primary = kws
      .filter((k) => k.productId === p.id && !k.ausgeschlossen && k.tier === "primary")
      .map((k) => k.keyword);
    const insights = insightsAll.find((i) => i.productId === p.id)?.payload ?? null;

    const sc = liveScore(
      snap
        ? {
            title: snap.title ?? "",
            bullets: (snap.bullets ?? []).filter(Boolean),
            description: snap.description ?? "",
            // Backend-Keywords sind live NICHT sichtbar — leer heißt „nicht messbar",
            // kein Score-Abzug (livescore/analyzeListing behandelt Leeres als nicht bewertbar).
            backendKeywords: "",
          }
        : null,
      { facts: p.facts, primaryKeywords: primary, sovAudit: sovFor(p.id), reviewInsights: insights },
      snap?.createdAt ?? null,
    );

    // Der zuletzt festgeschriebene Score dieses Produkts — Basis fürs Delta.
    // (Der aktuelle Live-Score wird oben frisch berechnet.)
    const eigene = checks.filter((c) => c.productId === p.id);
    const vorher = eigene.length >= 1 ? extractScore(eigene[0]) : null;

    return { productId: p.id, name: p.name, score: sc, vorher };
  });

  const messbar = out.filter((o) => o.score.score !== null);
  return {
    produkte: out,
    schnitt: messbar.length ? Math.round(messbar.reduce((a, o) => a + (o.score.score ?? 0), 0) / messbar.length) : null,
  };
}

/** Score aus einem gespeicherten Check ziehen (dort als Feld im Ergebnis abgelegt). */
function extractScore(check: typeof schema.contentChecks.$inferSelect): number | null {
  const e = check.ergebnis as { liveScore?: number | null } | undefined;
  return typeof e?.liveScore === "number" ? e.liveScore : null;
}
