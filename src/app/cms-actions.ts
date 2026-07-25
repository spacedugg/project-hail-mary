"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { slotDef } from "@/lib/amazon/attributes";
import { ladeMarkenCms, alertsFuer, ladeShare, istPortal } from "@/lib/cms/laden";

/**
 * Server-Actions der Content-Verwaltung (CMS).
 * Bewusst eigene Datei — `app/actions.ts` ist bereits die Sammelstelle des
 * Optimizers; der CMS-Lebenszyklus (speichern → publishen → überwachen →
 * Feedback) ist ein eigener Bereich.
 */

const id = () => crypto.randomUUID();
const jetzt = () => new Date();
const token = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

const fehler = (pfad: string, text: string, code: string) =>
  redirect(`${pfad}?fehler=${encodeURIComponent(text)}&code=${code}`);

/* ── Bibliothek: Bestands-Content & Assets ───────────────────────────────── */

/**
 * Bestands-Content-Import: Content, der VOR dem Tool entstanden ist (oder von
 * außen kommt), wird als Piece eingepflegt und ab dann mitverwaltet.
 * Mehrteilige Slots (Bullets, Q&A) werden zeilenweise erfasst.
 */
export async function importBestandsContent(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const roh = String(formData.get("wert") ?? "").trim();
  const basis = `/marke/${brandId}/katalog`;
  const def = slotDef(slot);
  if (!brandId || !productId || !def) fehler(basis, "Unbekannter Content-Slot.", "CMS-01");
  if (!roh) fehler(basis, "Kein Inhalt eingegeben.", "CMS-01");

  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) fehler(basis, "Produkt nicht gefunden.", "CMS-01");

  const mehrteilig = def!.anzahl > 1;
  const werte = mehrteilig ? roh.split(/\n+/).map((z) => z.trim()).filter(Boolean) : null;

  const vorhanden = await db.query.contentPieces.findFirst({
    where: and(
      eq(schema.contentPieces.productId, productId),
      eq(schema.contentPieces.slot, slot),
      eq(schema.contentPieces.marketplace, product!.marketplace),
    ),
  });

  const werte_ = { wert: mehrteilig ? null : roh, werte, updatedAt: jetzt() };
  if (vorhanden) {
    await db.update(schema.contentPieces).set(werte_).where(eq(schema.contentPieces.id, vorhanden.id));
  } else {
    await db.insert(schema.contentPieces).values({
      id: id(),
      brandId,
      productId,
      marketplace: product!.marketplace,
      slot,
      quelle: "import",
      status: "intern_frei",
      ...werte_,
    });
  }
  revalidatePath(basis);
}

/** Bild-/A+-Asset am Slot hinterlegen (Publish-URL, siehe Kontrakt §3.5). */
export async function setzeAssetUrl(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const basis = `/marke/${brandId}/katalog`;
  const def = slotDef(slot);
  if (!def || (def.kind !== "image" && def.kind !== "aplus")) fehler(basis, "Slot nimmt keine Datei-Adresse an.", "CMS-01");

  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) fehler(basis, "Produkt nicht gefunden.", "CMS-01");

  const vorhanden = await db.query.contentPieces.findFirst({
    where: and(
      eq(schema.contentPieces.productId, productId),
      eq(schema.contentPieces.slot, slot),
      eq(schema.contentPieces.marketplace, product!.marketplace),
    ),
  });
  if (!url && vorhanden) {
    await db.delete(schema.contentPieces).where(eq(schema.contentPieces.id, vorhanden.id));
    revalidatePath(basis);
    return;
  }
  if (vorhanden) {
    await db.update(schema.contentPieces).set({ wert: url, updatedAt: jetzt() }).where(eq(schema.contentPieces.id, vorhanden.id));
  } else {
    await db.insert(schema.contentPieces).values({
      id: id(), brandId, productId, marketplace: product!.marketplace, slot,
      wert: url, quelle: "manuell", status: "intern_frei", updatedAt: jetzt(),
    });
  }
  revalidatePath(basis);
}

/**
 * Die beiden Schlüssel, ohne die kein Publish-Weg funktioniert:
 * Verkäufer-SKU und Amazon-Produkttyp-Token. Bewusst hier im CMS und nicht bei
 * den Produkt-Fakten — es sind Publish-Angaben, keine Produkt-Wahrheit.
 */
export async function produktSchluesselSpeichern(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const sku = String(formData.get("sku") ?? "").trim() || null;
  const typ = String(formData.get("amazonProductType") ?? "").trim().toUpperCase() || null;
  const basis = `/marke/${brandId}/katalog`;

  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) fehler(basis, "Produkt nicht gefunden.", "CMS-01");

  const { pruefeProdukttyp } = await import("@/lib/amazon/productTypes");
  const befund = pruefeProdukttyp(typ);
  if (befund.stand === "freitext")
    fehler(basis, `„${befund.wert}" ist eine Beschreibung, kein Amazon-Produkttyp. Erwartet wird ein Token wie DRINKING_CUP.`, "CMS-04");

  await db.update(schema.products).set({ sku, amazonProductType: typ }).where(eq(schema.products.id, productId));
  revalidatePath(basis);
}

/**
 * Live-Stand als Ausgangs-Soll übernehmen.
 *
 * WICHTIG und bewusst als eigene Quelle markiert (`ist_uebernommen`): Das ist
 * der ZUSTAND VOR unserer Arbeit, kein von uns erarbeitetes Soll. Ohne diese
 * Kennzeichnung würde die Content-Accuracy 100 % melden — für nichts als
 * „wir haben noch nichts verändert". Sobald der Optimizer eine Version
 * freigibt, gewinnt sie automatisch (Vorrangregel in lib/cms/laden.ts).
 */
export async function istAlsSollUebernehmen(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const basis = `/marke/${brandId}/katalog`;
  const db = await getDb();

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) fehler(basis, "Produkt nicht gefunden.", "CMS-01");
  const snap = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  if (!snap) fehler(basis, "Es gibt noch keinen importierten Live-Stand für dieses Produkt.", "CMS-01");

  const bilder = (snap!.imageUrls ?? []).filter(Boolean);
  const uebernahmen: Array<{ slot: string; wert: string | null; werte: unknown }> = [
    { slot: "title", wert: snap!.title ?? null, werte: null },
    { slot: "bullets", wert: null, werte: (snap!.bullets ?? []).filter(Boolean) },
    { slot: "description", wert: snap!.description ?? null, werte: null },
    { slot: "main_image", wert: bilder[0] ?? null, werte: null },
    ...bilder.slice(1, 9).map((url, i) => ({ slot: `gallery_${i + 1}`, wert: url, werte: null })),
  ];

  let gesetzt = 0;
  for (const u of uebernahmen) {
    const hatInhalt = u.wert?.trim() || (Array.isArray(u.werte) && u.werte.length > 0);
    if (!hatInhalt) continue;
    const vorhanden = await db.query.contentPieces.findFirst({
      where: and(
        eq(schema.contentPieces.productId, productId),
        eq(schema.contentPieces.slot, u.slot),
        eq(schema.contentPieces.marketplace, product!.marketplace),
      ),
    });
    // Von Hand gepflegte oder importierte Pieces werden NICHT überschrieben —
    // ein Auto-Weg füllt nur Leerstellen (Prinzip aus den Produkt-Fakten).
    if (vorhanden && vorhanden.quelle !== "ist_uebernommen") continue;
    if (vorhanden) {
      await db.update(schema.contentPieces)
        .set({ wert: u.wert, werte: u.werte, updatedAt: jetzt() })
        .where(eq(schema.contentPieces.id, vorhanden.id));
    } else {
      await db.insert(schema.contentPieces).values({
        id: id(), brandId, productId, marketplace: product!.marketplace, slot: u.slot,
        wert: u.wert, werte: u.werte, quelle: "ist_uebernommen", status: "entwurf", updatedAt: jetzt(),
      });
    }
    gesetzt++;
  }
  revalidatePath(basis);
  if (gesetzt === 0) fehler(basis, "Der importierte Live-Stand enthielt nichts Übernehmbares.", "CMS-01");
}

/* ── Soll/Ist: Abgleich & Alerts ─────────────────────────────────────────── */

/**
 * Abgleich über alle Produkte der Marke festhalten. Der Vergleich selbst
 * passiert immer live (lib/cms/accuracy.ts) — hier wird der Stand PROTOKOLLIERT,
 * damit die Accuracy über die Zeit vergleichbar wird und Alerts entstehen.
 * Ehrliche Grenze: gemessen wird gegen den zuletzt GECRAWLTEN Stand, nicht
 * gegen Amazon live. Steht der Crawl aus, sagt die Seite das.
 */
export async function abgleichFestschreiben(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const basis = `/marke/${brandId}/publish/alerts`;
  const cms = await ladeMarkenCms(brandId);
  if (!cms) fehler(basis, "Marke nicht gefunden.", "CMS-01");
  const db = await getDb();

  const { ladeLiveScores } = await import("@/lib/cms/laden");
  const scores = await ladeLiveScores(brandId);
  for (const p of cms!.produkte) {
    const sc = scores.produkte.find((x) => x.productId === p.id)?.score.score ?? null;
    await db.insert(schema.contentChecks).values({
      id: id(),
      brandId,
      productId: p.id,
      // Live-Score im Ergebnis mitschreiben — Grundlage fürs Score-Delta beim
      // nächsten Lauf (Bauplan v3.6: Soll↔Live-Delta).
      ergebnis: { slots: p.abgleich.slots, liveScore: sc },
      accuracyPct: p.abgleich.accuracyPct,
    });
  }

  // Alerts fallen aus dem Abgleich — offene Alerts derselben Art/Slot werden
  // nicht dupliziert, sondern bleiben stehen.
  const offene = await db.query.contentAlerts.findMany({
    where: and(eq(schema.contentAlerts.brandId, brandId), eq(schema.contentAlerts.status, "offen")),
  });
  for (const a of alertsFuer(cms!)) {
    const gibtEs = offene.some((o) => o.productId === a.produktId && o.art === a.art && (o.slot ?? null) === (a.slot ?? null));
    if (gibtEs) continue;
    await db.insert(schema.contentAlerts).values({
      id: id(), brandId, productId: a.produktId, art: a.art, slot: a.slot ?? null,
      schwere: a.schwere, nachricht: a.nachricht,
    });
  }
  revalidatePath(basis);
}

export async function alertStatusSetzen(formData: FormData) {
  const alertId = String(formData.get("alertId") ?? "");
  const brandId = String(formData.get("brandId") ?? "");
  const status = String(formData.get("status") ?? "erledigt") as "offen" | "bestaetigt" | "erledigt";
  const db = await getDb();
  await db
    .update(schema.contentAlerts)
    .set({ status, erledigtAt: status === "erledigt" ? jetzt() : null })
    .where(eq(schema.contentAlerts.id, alertId));
  revalidatePath(`/marke/${brandId}/publish/alerts`);
}

/* ── Publish-Protokoll ───────────────────────────────────────────────────── */

/** Erzeugten Publish-Vorgang festhalten (welche Slots, welcher Weg, wann). */
export async function publikationProtokollieren(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const productId = String(formData.get("productId") ?? "") || null;
  const weg = (String(formData.get("weg") ?? "flatfile") as "flatfile" | "sp_api");
  const slots = String(formData.get("slots") ?? "").split(",").filter(Boolean);
  const user = await getSessionUser();
  const db = await getDb();
  await db.insert(schema.contentPublications).values({
    id: id(), brandId, productId, weg, slots, status: "erzeugt", createdBy: user?.name ?? null,
  });
  revalidatePath(`/marke/${brandId}/publish/dateien`);
}

/**
 * Status eines Publish-Vorgangs weiterschalten. „bestaetigt" darf NUR nach
 * einem Soll/Ist-Abgleich gesetzt werden — Amazons „ACCEPTED" ist kein Beweis
 * dafür, dass Content live ist (Kontrakt §3.4).
 */
export async function publikationStatusSetzen(formData: FormData) {
  const pubId = String(formData.get("pubId") ?? "");
  const brandId = String(formData.get("brandId") ?? "");
  const status = String(formData.get("status") ?? "") as "erzeugt" | "eingereicht" | "bestaetigt" | "fehler";
  const db = await getDb();
  await db.update(schema.contentPublications).set({ status }).where(eq(schema.contentPublications.id, pubId));
  revalidatePath(`/marke/${brandId}/publish/dateien`);
}

/* ── Kunden-Anbindung: Kontakte & Freigabe-Links ─────────────────────────── */

export async function kontaktAnlegen(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const rolle = String(formData.get("rolle") ?? "").trim() || null;
  const basis = `/marke/${brandId}/publish/feedback`;
  if (!name || !email) fehler(basis, "Name und E-Mail sind nötig.", "CMS-02");

  const db = await getDb();
  const vorhanden = await db.query.clientContacts.findFirst({
    where: and(eq(schema.clientContacts.clientId, clientId), eq(schema.clientContacts.email, email)),
  });
  if (vorhanden) fehler(basis, `Für ${email} gibt es bereits einen Ansprechpartner.`, "CMS-02");
  await db.insert(schema.clientContacts).values({ id: id(), clientId, name, email, rolle });
  revalidatePath(basis);
}

/**
 * Freigabe-Link erzeugen: tokengeschützte Kunden-Sicht, bewusst OHNE Login.
 * Ablaufdatum ist Pflicht (Default 30 Tage) — ein Link ohne Ablauf wäre ein
 * dauerhaft offenes Fenster in die Kundendaten.
 */
export async function freigabeLinkErstellen(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const contactId = String(formData.get("contactId") ?? "") || null;
  const tage = Math.min(Math.max(Number(formData.get("tage") ?? 30) || 30, 1), 180);
  const darfFreigeben = formData.get("darfFreigeben") === "on";
  const basis = `/marke/${brandId}/publish/feedback`;
  if (!label) fehler(basis, "Bitte einen Titel für den Link vergeben (der Kunde sieht ihn).", "CMS-02");

  const user = await getSessionUser();
  const db = await getDb();
  await db.insert(schema.contentShares).values({
    id: id(),
    brandId,
    token: token(),
    contactId,
    label,
    productIds: null,
    darfFreigeben,
    expiresAt: new Date(Date.now() + tage * 24 * 60 * 60 * 1000),
    createdBy: user?.name ?? null,
  });
  revalidatePath(basis);
}

export async function freigabeLinkWiderrufen(formData: FormData) {
  const shareId = String(formData.get("shareId") ?? "");
  const brandId = String(formData.get("brandId") ?? "");
  const db = await getDb();
  await db.update(schema.contentShares).set({ revokedAt: jetzt() }).where(eq(schema.contentShares.id, shareId));
  revalidatePath(`/marke/${brandId}/publish/feedback`);
}

/* ── Kunden-Portal: EIN dauerhafter Link pro Marke ──────────────────────────
 *
 * Nutzer-Wunsch 23.07.: „Ich will ihm nichts schicken, er soll sich seine
 * Freigaben pro Marke selbst holen." Statt bei jeder Vorlage einen neuen,
 * befristeten Link zu streuen, bekommt der Kunde EINEN dauerhaften Portal-Link,
 * den man einmal weitergibt. Neuer, intern abgenommener Content erscheint dort
 * automatisch — es muss nichts „geschickt" werden.
 *
 * Das Portal ist bewusst kein neues Datenmodell: Es ist genau der eine
 * `contentShare` OHNE Ablauf (expiresAt = null), mit Freigaberecht und aktiv.
 * Das lässt sich ohne Migration von befristeten Links unterscheiden
 * (`istPortal` in `lib/cms/laden`).
 */

/** Portal aktivieren: legt den dauerhaften Marken-Link an, falls noch keiner lebt. */
export async function portalErstellen(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const contactId = String(formData.get("contactId") ?? "") || null;
  const basis = `/marke/${brandId}/publish/feedback`;

  const db = await getDb();
  const vorhandene = await db.query.contentShares.findMany({ where: eq(schema.contentShares.brandId, brandId) });
  if (vorhandene.some(istPortal)) {
    // Schon aktiv — nur ggf. den Ansprechpartner nachtragen.
    if (contactId) {
      const portal = vorhandene.find(istPortal)!;
      await db.update(schema.contentShares).set({ contactId }).where(eq(schema.contentShares.id, portal.id));
    }
    revalidatePath(basis);
    return;
  }

  const user = await getSessionUser();
  await db.insert(schema.contentShares).values({
    id: id(),
    brandId,
    token: token(),
    contactId,
    label: "Kunden-Portal",
    productIds: null,
    darfFreigeben: true,
    expiresAt: null, // dauerhaft — das ist die Portal-Kennung
    createdBy: user?.name ?? null,
  });
  revalidatePath(basis);
}

/**
 * Portal-Adresse neu erzeugen: alten Portal-Link entwerten und einen frischen
 * anlegen. Für den Fall, dass die alte Adresse in falsche Hände geraten ist —
 * der Kunde bekommt dann einmalig die neue.
 */
export async function portalNeuErzeugen(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const basis = `/marke/${brandId}/publish/feedback`;

  const db = await getDb();
  const vorhandene = await db.query.contentShares.findMany({ where: eq(schema.contentShares.brandId, brandId) });
  const alt = vorhandene.find(istPortal);
  for (const p of vorhandene.filter(istPortal)) {
    await db.update(schema.contentShares).set({ revokedAt: jetzt() }).where(eq(schema.contentShares.id, p.id));
  }

  const user = await getSessionUser();
  await db.insert(schema.contentShares).values({
    id: id(),
    brandId,
    token: token(),
    contactId: alt?.contactId ?? null,
    label: "Kunden-Portal",
    productIds: null,
    darfFreigeben: true,
    expiresAt: null,
    createdBy: user?.name ?? null,
  });
  revalidatePath(basis);
}

/* ── Feedback ────────────────────────────────────────────────────────────── */

/** Feedback aus dem Team (Antwort auf Kundenfeedback oder interne Notiz). */
export async function feedbackSchreiben(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const nachricht = String(formData.get("nachricht") ?? "").trim();
  const basis = `/marke/${brandId}/publish/feedback`;
  if (!nachricht) fehler(basis, "Leeres Feedback wird nicht gespeichert.", "CMS-03");

  const user = await getSessionUser();
  const db = await getDb();
  await db.insert(schema.contentFeedback).values({
    id: id(), brandId, productId, slot,
    autorTyp: "team", autorName: user?.name ?? "Team", autorUserId: user?.id ?? null,
    art: "kommentar", nachricht,
  });
  revalidatePath(basis);
}

export async function feedbackErledigen(formData: FormData) {
  const feedbackId = String(formData.get("feedbackId") ?? "");
  const brandId = String(formData.get("brandId") ?? "");
  const user = await getSessionUser();
  const db = await getDb();
  await db
    .update(schema.contentFeedback)
    .set({ status: "erledigt", erledigtVon: user?.name ?? null, erledigtAt: jetzt() })
    .where(eq(schema.contentFeedback.id, feedbackId));
  revalidatePath(`/marke/${brandId}/publish/feedback`);
}

/* ── Kunden-Seite (öffentlich, nur über gültigen Token) ──────────────────── */

/**
 * Kunden-Feedback am Content-Piece. Läuft ohne Login über den Freigabe-Link;
 * jede Aussage wird an die konkrete Version geheftet, damit später
 * nachvollziehbar bleibt, worauf sie sich bezog.
 */
export async function kundenFeedback(formData: FormData) {
  const tokenWert = String(formData.get("token") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const versionId = String(formData.get("versionId") ?? "") || null;
  const art = (String(formData.get("art") ?? "kommentar") as "kommentar" | "freigabe" | "aenderung");
  const nachricht = String(formData.get("nachricht") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  const res = await ladeShare(tokenWert);
  if (!res.ok) redirect(`/freigabe/${tokenWert}`);
  const { share, kontakt } = res.ctx;
  if (art === "freigabe" && !share.darfFreigeben)
    redirect(`/freigabe/${tokenWert}?fehler=${encodeURIComponent("Dieser Link erlaubt nur Kommentare, keine Freigabe.")}`);
  if (art !== "freigabe" && !nachricht)
    redirect(`/freigabe/${tokenWert}?fehler=${encodeURIComponent("Bitte schreiben Sie kurz, worum es geht.")}`);

  const db = await getDb();
  await db.insert(schema.contentFeedback).values({
    id: id(),
    brandId: share.brandId,
    productId,
    slot,
    contentVersionId: versionId,
    autorTyp: "kunde",
    autorName: kontakt?.name || name || "Kunde",
    autorContactId: share.contactId ?? null,
    shareId: share.id,
    art,
    nachricht: nachricht || (art === "freigabe" ? "Freigegeben." : ""),
  });
  revalidatePath(`/freigabe/${tokenWert}`);
  revalidatePath(`/marke/${share.brandId}/publish/feedback`);
}

/**
 * „An Kunden schicken" — der eine Knopf, der die Kette weiterschaltet.
 *
 * Vorher waren interne Abnahme und Kundenzustimmung zwei getrennte Welten:
 * freigeben hier, Link woanders erzeugen, Rückmeldung nirgends verbunden.
 * Jetzt: Ein Klick vermerkt den Versand AN DER VERSION, nutzt einen
 * bestehenden gültigen Link oder legt einen an — und gibt ihn zum Kopieren zurück.
 */
export async function anKundenSchicken(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const basis = `/marke/${brandId}/publish`;
  if (!versionId) fehler(basis, "Keine Version angegeben.", "CMS-03");

  const db = await getDb();
  const version = await db.query.contentVersions.findFirst({ where: eq(schema.contentVersions.id, versionId) });
  if (!version) fehler(basis, "Der Stand existiert nicht mehr.", "CMS-03");
  if (version!.status === "draft")
    fehler(basis, "Erst intern abnehmen, dann dem Kunden vorlegen — sonst sieht er einen ungeprüften Entwurf.", "CMS-03");

  // Gültigen Link wiederverwenden statt bei jeder Vorlage einen neuen zu streuen.
  const vorhandene = await db.query.contentShares.findMany({ where: eq(schema.contentShares.brandId, brandId) });
  const jetztMs = Date.now();
  let share = vorhandene.find(
    (s) => !s.revokedAt && s.darfFreigeben && (!s.expiresAt || s.expiresAt.getTime() > jetztMs),
  );
  if (!share) {
    const user = await getSessionUser();
    const neuId = id();
    await db.insert(schema.contentShares).values({
      id: neuId,
      brandId,
      token: token(),
      label: "Content-Freigabe",
      productIds: null,
      darfFreigeben: true,
      expiresAt: new Date(jetztMs + 30 * 24 * 60 * 60 * 1000),
      createdBy: user?.name ?? null,
    });
    share = await db.query.contentShares.findFirst({ where: eq(schema.contentShares.id, neuId) });
  }

  await db
    .update(schema.contentVersions)
    .set({ sentToClientAt: jetzt(), sentShareId: share!.id })
    .where(eq(schema.contentVersions.id, versionId));

  revalidatePath(basis);
  revalidatePath(`/produkte/${version!.productId}/content`);
  revalidatePath(`/marke/${brandId}/katalog`);
}

/** Marken-Schalter: Publish erst nach Kundenfreigabe. */
export async function kundenfreigabePflichtSetzen(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const an = formData.get("pflicht") === "on";
  const db = await getDb();
  await db.update(schema.brands).set({ publishNurMitKundenfreigabe: an }).where(eq(schema.brands.id, brandId));
  revalidatePath(`/marke/${brandId}/publish/feedback`);
  revalidatePath(`/marke/${brandId}/katalog`);
}

/**
 * Kunden-Onboarding-Import (Bauplan v3.6, ersetzt „Bestands-Content-Import").
 *
 * Zum Start der Zusammenarbeit: den kompletten Kundenkatalog in einem Zug ins
 * Tool. Statt zwanzigmal einzeln ein Produkt anzulegen und das Listing zu
 * ziehen, kommt hier eine ASIN-Liste rein — das Tool legt die Produkte an und
 * zieht je ASIN das Live-Listing. Bewusst NUR Status quo, KEIN Archiv alter
 * Content-Stände (Plan: „bewusst nicht gebaut").
 *
 * Der eigentliche Import läuft danach je Produkt über die bestehende Kette —
 * hier werden nur die Produkte angelegt und der Import angestoßen. Das Ziehen
 * selbst kostet Zeit und Geld je ASIN; deshalb meldet die Seite den Fortschritt.
 */
export async function onboardingProdukteAnlegen(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const roh = String(formData.get("asins") ?? "");
  const basis = `/marke/${brandId}/katalog`;

  const db = await getDb();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
  if (!brand) fehler(basis, "Marke nicht gefunden.", "CMS-01");

  // ASIN je Zeile ODER durch Komma/Leerzeichen getrennt; Format grob geprüft.
  const asins = [...new Set(roh.split(/[\s,;]+/).map((a) => a.trim().toUpperCase()).filter(Boolean))];
  const gueltige = asins.filter((a) => /^B0[A-Z0-9]{8}$/.test(a) || /^[A-Z0-9]{10}$/.test(a));
  const ungueltige = asins.filter((a) => !gueltige.includes(a));
  if (gueltige.length === 0)
    fehler(basis, `Keine gültige ASIN erkannt${ungueltige.length ? ` (${ungueltige.slice(0, 3).join(", ")}…)` : ""}. Eine ASIN hat 10 Zeichen, meist B0…`, "CMS-05");

  // Vorhandene ASINs dieser Marke nicht doppelt anlegen.
  const bestehend = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const schonDa = new Set(bestehend.map((p) => p.asin).filter(Boolean));

  let angelegt = 0;
  for (const asin of gueltige) {
    if (schonDa.has(asin)) continue;
    // onConflictDoNothing gegen den Unique-Index (brandId, asin, marketplace):
    // Bei Doppel-Submit oder gleichzeitigem Lauf wirft der zweite Insert sonst
    // eine unbehandelte Exception mit halb angelegtem Katalog (Review 23.07.).
    // Marketplace bleibt der Schema-Default "de" (Tool ist DE-only, D32).
    const res = await db
      .insert(schema.products)
      .values({ id: id(), brandId, name: asin, asin })
      .onConflictDoNothing();
    if (res.rowsAffected > 0) angelegt++;
  }

  revalidatePath(basis);
  const teil = ungueltige.length ? ` ${ungueltige.length} Eintrag/Einträge waren keine ASIN und wurden übersprungen.` : "";
  redirect(
    `${basis}?hinweis=${encodeURIComponent(
      `${angelegt} Produkt(e) angelegt${gueltige.length - angelegt > 0 ? `, ${gueltige.length - angelegt} waren schon da` : ""}.${teil} Jetzt je Produkt „Live-Listing laden" — oder unten den Sammel-Import starten.`,
    )}`,
  );
}

/**
 * Produkt aus dem Katalog löschen (Bauplan v3.6: "löschen aus der Bibliothek
 * heraus"). Destruktiv — deshalb Tipp-Bestätigung wie beim Daten-Wipe. Amazon
 * bleibt unberührt: gelöscht wird nur, was WIR im Tool verwalten (Content,
 * Snapshots, Feedback, Alerts). Das Live-Listing existiert weiter.
 */
export async function produktLoeschen(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const bestaetigung = String(formData.get("confirm") ?? "").trim().toUpperCase();
  const basis = `/marke/${brandId}/katalog`;

  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) fehler(basis, "Produkt nicht gefunden.", "CMS-01");
  if (bestaetigung !== "LÖSCHEN")
    fehler(basis, `Zum Löschen von „${product!.name}" bitte exakt LÖSCHEN eintippen. Das Amazon-Listing bleibt unberührt.`, "SET-01");

  // Kinder zuerst — SQLite erzwingt Fremdschlüssel nicht zwingend.
  for (const t of [
    schema.contentFeedback,
    schema.contentPieces,
    schema.contentPublications,
    schema.contentChecks,
    schema.contentAlerts,
    schema.contentVersions,
    schema.reviewInsights,
    schema.reviewScrapes,
    schema.deepAudits,
    schema.listingSnapshots,
    schema.keywords,
    schema.actions,
  ]) {
    await db.delete(t).where(eq(t.productId, productId));
  }
  await db.delete(schema.products).where(eq(schema.products.id, productId));

  revalidatePath(basis);
  redirect(`${basis}?hinweis=${encodeURIComponent(`„${product!.name}" aus dem Katalog gelöscht. Das Amazon-Listing bleibt bestehen.`)}`);
}
