import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeMarkenCms } from "@/lib/cms/laden";
import { SLOTS } from "@/lib/amazon/attributes";
import { BEKANNTE_PRODUKTTYPEN, schlageProdukttypVor } from "@/lib/amazon/productTypes";
import { publishBereit } from "@/lib/amazon/publishGate";
import { PILL_KLASSE } from "@/lib/cms/freigabestand";
import { uploadFlatfileTemplate } from "@/app/actions";
import {
  importBestandsContent,
  setzeAssetUrl,
  produktSchluesselSpeichern,
  istAlsSollUebernehmen,
} from "@/app/cms-actions";
import { SubmitButton } from "@/components/submit-button";
import { FehlerPopup } from "@/components/fehler-popup";
import { fehlerInfo } from "@/lib/fehlercodes";

export const dynamic = "force-dynamic";

/**
 * Content-Verwaltung auf PRODUKT-Ebene (Nutzer-Befund 22.07.).
 *
 * Die Marken-Sicht beantwortet Fragen über alle Produkte hinweg („wie viel %
 * unseres Solls ist live?"). Hier steht die Frage für EIN Produkt: Was ist
 * unser Soll — im vollen Wortlaut —, wo weicht das Live-Listing ab, und wo
 * ändere ich etwas? Dieselben Daten, dieselben Aktionen, keine zweite Quelle.
 */

const QUELLE_TEXT: Record<string, string> = {
  optimizer: "aus der Werkstatt",
  import: "Bestand importiert",
  manuell: "von Hand",
  ist_uebernommen: "Live-Stand übernommen",
};

export default async function ProduktContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fehler?: string; code?: string }>;
}) {
  const { id } = await params;
  const { fehler, code } = await searchParams;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) notFound();

  const cms = await ladeMarkenCms(product.brandId);
  const p = cms?.produkte.find((x) => x.id === id);
  if (!cms || !p) notFound();

  const feedback = await db.query.contentFeedback.findMany({
    where: eq(schema.contentFeedback.productId, id),
    orderBy: desc(schema.contentFeedback.createdAt),
  });
  // Die Kategorievorlage hängt an der Marke (Amazon liefert sie je Kategorie),
  // gebraucht wird sie aber hier beim Publish eines Produkts.
  const vorlage = await db.query.flatfileTemplates.findFirst({
    where: eq(schema.flatfileTemplates.brandId, product.brandId),
    orderBy: desc(schema.flatfileTemplates.createdAt),
  });
  const offen = feedback.filter((f) => f.status === "offen");
  const bereit = publishBereit(p.publishIssues);
  // Live-Qualitäts-Score dieses Produkts — dort sichtbar machen, wo man ist
  // (Nutzer-Befund 23.07.: die Überwachung war nur auf Markenebene zu finden).
  const { ladeLiveScores } = await import("@/lib/cms/laden");
  const liveScore = (await ladeLiveScores(product.brandId)).produkte.find((x) => x.productId === id)?.score ?? null;
  const werkstatt = `/produkte/${id}#content`;

  return (
    <main className="w-full p-8">
      {fehler && <FehlerPopup message={fehler} {...fehlerInfo(code)} />}

      {/* Ein zurück zur Werkbank — KEINE zweite Reiter-Leiste (D239, Nutzer-Befund
          28.07.): Die Produkt-Steuerung lebt in der Werkbank. Ein eigenes
          Reiter-Menü hier war ein redundantes Zwischenmenü, das nur auf dieselben
          Reiter zurückverwies — entfernt für eine einfache, nachvollziehbare Führung. */}
      <Link href={`/produkte/${id}`} className="text-xs text-neutral-500 hover:underline">← Werkbank</Link>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">
          {p.name}
          {/* ASIN nur ergänzen, wenn der Name nicht ohnehin die ASIN IST (D245, Nutzer-Befund:
              „B0… · B0…" doppelt) — sonst nur den Marktplatz-Zusatz zeigen. */}
          {p.asin && (
            <span className="font-mono text-sm text-neutral-500"> {p.name === p.asin ? `amazon.${p.marketplace}` : `${p.asin} · amazon.${p.marketplace}`}</span>
          )}
        </h1>
        <Link href={`/marke/${product.brandId}/katalog`} className="btn-ghost text-xs">Alle Produkte dieser Marke →</Link>
      </div>

      {/* ── Zustand auf einen Blick ─────────────────────────────────────── */}
      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`/marke/${product.brandId}/publish/alerts`} className="card group p-4">
          <div className="stat-label">Live-Qualität</div>
          <div className={`stat-value ${!liveScore?.score ? "" : liveScore.score >= 80 ? "text-good" : "text-bad"}`}>
            {liveScore?.score == null ? "–" : `${liveScore.score}/100`}
          </div>
          <p className="mt-1 text-xs text-muted">
            Wie <b>gut</b> das Live-Listing ist · retail-ready ab 80.{" "}
            <span className="text-primary-strong group-hover:underline">Überwachung →</span>
          </p>
        </Link>
        <div className="card p-4">
          <div className="stat-label">Content-Accuracy</div>
          <div className={`stat-value ${p.abgleich.accuracyPct === null ? "" : p.abgleich.accuracyPct >= 95 ? "text-good" : "text-bad"}`}>
            {p.abgleich.accuracyPct === null ? "–" : `${p.abgleich.accuracyPct} %`}
          </div>
          {/* Häufigstes Missverständnis (Nutzer 22.07.): Das ist KEINE Qualitätsnote. */}
          <p className="mt-1 text-xs text-muted">
            Wie viel unseres Solls steht live — <b>keine Qualitätsnote</b>.{" "}
            <Link href={`/produkte/${id}/analyse`} className="underline">Wie gut das Listing ist, sagt die Analyse.</Link>
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {p.snapshotAlter ? `Live-Stand vom ${p.snapshotAlter.toLocaleDateString("de-DE")}` : "Noch kein Live-Stand geladen"}
          </p>
        </div>
        <div className="card p-4">
          <div className="stat-label">Publish-Bereitschaft</div>
          <div className={`stat-value ${bereit ? "text-good" : "text-bad"}`}>{bereit ? "bereit" : "blockiert"}</div>
          <p className="mt-1 text-xs text-muted">
            {p.publishIssues.filter((i) => i.severity === "error").length} Fehler ·{" "}
            {p.publishIssues.filter((i) => i.severity === "warning").length} Hinweise
          </p>
        </div>
        <div className="card p-4">
          <div className="stat-label">Kunden-Feedback</div>
          <div className="stat-value">{offen.length}</div>
          <p className="mt-1 text-xs text-muted">offen von {feedback.length} gesamt</p>
        </div>
      </section>

      {p.sollAusIst > 0 && (
        <p className="mt-3 rounded-xl border border-[var(--warn)]/40 bg-[rgb(217_119_6/0.08)] px-3 py-2 text-xs">
          <b>Noch kein Ziel-Stand:</b> {p.sollAusIst} Platz/Plätze tragen als Soll den übernommenen Live-Stand. Die
          Accuracy misst dort nur, dass sich nichts verändert hat.
        </p>
      )}
      {p.sprachHinweis && (
        <p className="mt-2 rounded-xl border border-[var(--bad)]/40 bg-[rgb(220_38_38/0.07)] px-3 py-2 text-xs">
          <b>Sprachfassung:</b> {p.sprachHinweis}
        </p>
      )}

      {/* ── Publish-Schlüssel ───────────────────────────────────────────── */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">Publish-Schlüssel</h2>
        <p className="mt-1 text-xs text-muted">Ohne diese beiden Angaben nimmt Amazon nichts an — weder per Flat File noch per API.</p>
        <form action={produktSchluesselSpeichern} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="brandId" value={product.brandId} />
          <input type="hidden" name="productId" value={id} />
          <label className="text-[11px] text-muted">
            Verkäufer-SKU
            <input name="sku" defaultValue={p.skuIstNotbehelf ? "" : p.sku} placeholder="z. B. ELB-LM-350-4" className="input-base mt-0.5 w-full text-sm" />
          </label>
          <label className="text-[11px] text-muted">
            Amazon-Produkttyp
            <input
              name="amazonProductType"
              defaultValue={p.productType ?? ""}
              list="produkttypen"
              placeholder={schlageProdukttypVor(p.produktartText) ?? "z. B. DRINKING_CUP"}
              className="input-base mt-0.5 w-full font-mono text-sm"
            />
            <datalist id="produkttypen">
              {BEKANNTE_PRODUKTTYPEN.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <SubmitButton className="btn-dark h-fit self-end text-xs">Speichern</SubmitButton>
        </form>
      </section>

      {/* ── Der Soll-Stand im vollen Wortlaut ───────────────────────────── */}
      <section className="mt-4 card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sect-h">Unser Soll — was rausgehen soll</h2>
          <Link href={werkstatt} className="btn-ghost text-xs">Texte in der Werkstatt bearbeiten →</Link>
        </div>
        <p className="mt-1 text-xs text-muted">
          Vollständiger Wortlaut jedes Platzes. Texte entstehen und ändern sich in der Werkstatt; Bilder, A+ und
          Bestands-Content pflegst du hier.
        </p>

        <div className="mt-3 space-y-2">
          {p.slots
            .filter((s) => s.werte.length > 0 || s.publishWeg === "listing")
            .filter((s) => s.werte.length > 0 || !s.slot.startsWith("gallery_") || s.slot === "gallery_1")
            .map((s) => {
              const ist = p.abgleich.slots.find((a) => a.slot === s.slot);
              return (
                <details key={s.slot} className="rounded-xl border border-hair p-3" open={s.kind === "text" && s.werte.length > 0}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <b>{s.label}</b>
                    <span className={PILL_KLASSE[s.freigabe.ton]} title={s.freigabe.detail ?? undefined}>
                      {s.freigabe.label}
                      {s.freigabe.stufe === "intern" && s.freigegebenVon ? ` · ${s.freigegebenVon}` : ""}
                    </span>
                    {s.quelle && <span className="text-[11px] text-muted">{QUELLE_TEXT[s.quelle] ?? s.quelle}</span>}
                    {s.entwurfOffen && s.status === "freigegeben" && <span className="pill pill-warn">neuerer Entwurf in der Werkstatt</span>}
                    {ist && ist.status === "abweichung" && (
                      <span className="pill pill-bad">live abweichend ({Math.round((ist.aehnlichkeit ?? 0) * 100)} %)</span>
                    )}
                    {ist && ist.status === "live" && <span className="pill pill-good">live</span>}
                    {s.publishWeg === "manuell" && <span className="pill pill-neutral">nicht publishbar</span>}
                  </summary>

                  {s.werte.length === 0 ? (
                    <p className="mt-2 text-xs text-muted">Noch nichts hinterlegt.</p>
                  ) : s.kind === "image" ? (
                    <div className="mt-2 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.werte[0]} alt={s.label} className="h-24 w-24 rounded-lg border border-hair object-cover" />
                      <code className="break-all text-[11px] text-muted">{s.werte[0]}</code>
                    </div>
                  ) : s.werte.length > 1 ? (
                    <ol className="mt-2 space-y-1.5">
                      {s.werte.map((w, i) => (
                        <li key={i} className="text-sm leading-relaxed">
                          <span className="mr-1.5 text-muted">{i + 1}.</span>
                          {w}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{s.werte[0]}</p>
                  )}

                  {ist && ist.status === "abweichung" && (
                    <div className="mt-2 rounded-lg bg-[rgb(220_38_38/0.06)] p-2">
                      <div className="text-[11px] font-semibold text-bad">Live steht dort gerade:</div>
                      <p className="mt-0.5 whitespace-pre-line text-xs text-muted">{ist.ist}</p>
                    </div>
                  )}

                  {s.hinweis && <p className="mt-2 text-[11px] text-muted">{s.hinweis}</p>}

                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.kind === "text" && s.publishWeg !== "manuell" && (
                      <Link href={werkstatt} className="btn-ghost text-[11px]">In der Werkstatt ändern</Link>
                    )}
                    {(s.kind === "image" || s.kind === "aplus") && (
                      <form action={setzeAssetUrl} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="brandId" value={product.brandId} />
                        <input type="hidden" name="productId" value={id} />
                        <input type="hidden" name="slot" value={s.slot} />
                        <input name="url" defaultValue={s.werte[0] ?? ""} placeholder="https://… öffentlich erreichbar" className="input-base w-96 max-w-full text-xs" />
                        <SubmitButton className="btn-dark text-[11px]">Adresse speichern</SubmitButton>
                      </form>
                    )}
                  </div>
                </details>
              );
            })}
        </div>

        <details className="mt-3 rounded-xl border border-hair p-3">
          <summary className="cursor-pointer text-xs font-semibold">Bestands-Content einpflegen / Live-Stand übernehmen</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2 border-b border-hair pb-3">
            <form action={istAlsSollUebernehmen}>
              <input type="hidden" name="brandId" value={product.brandId} />
              <input type="hidden" name="productId" value={id} />
              <SubmitButton className="btn-ghost text-xs">Live-Stand als Ausgangs-Soll übernehmen</SubmitButton>
            </form>
            <span className="text-[11px] text-muted">Als Ausgangszustand, nicht als Ziel — von Hand gepflegte Plätze bleiben unangetastet.</span>
          </div>
          <form action={importBestandsContent} className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
            <input type="hidden" name="brandId" value={product.brandId} />
            <input type="hidden" name="productId" value={id} />
            <select name="slot" className="input-base text-sm" defaultValue="title">
              {SLOTS.filter((s) => s.kind === "text").map((s) => (
                <option key={s.slot} value={s.slot}>{s.label}</option>
              ))}
            </select>
            <textarea name="wert" rows={2} className="input-base text-sm" placeholder="Bestehender Text — mehrteilige Plätze: eine Zeile je Eintrag" />
            <SubmitButton className="btn-dark h-fit text-xs">Übernehmen</SubmitButton>
          </form>
        </details>
      </section>

      {/* ── Auf Amazon bringen — der eigentliche Publish, produktbezogen ── */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">Auf Amazon bringen</h2>
        <p className="mt-1 text-xs text-muted">
          Publiziert wird immer <b>ein</b> Produkt. Die Datei unten enthält genau dieses hier.
        </p>

        {p.publishIssues.length === 0 ? (
          <p className="mt-3 text-sm text-good">Keine offenen Punkte — dieses Produkt kann raus.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {p.publishIssues.map((i) => (
              <li key={i.code} className="text-xs">
                <span className={i.severity === "error" ? "pill pill-bad" : "pill pill-warn"}>{i.severity === "error" ? "Fehler" : "Hinweis"}</span>{" "}
                <span className="text-muted">{i.message}</span>{" "}
                <span className="text-[10px] uppercase tracking-wide text-muted">· {i.quelle === "amazon" ? "Amazon-Regel" : "Agentur-Messlatte"}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-hair p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Weg 1 — Flat File</h3>
              <span className="pill pill-neutral">heute</span>
            </div>
            {vorlage ? (
              <>
                <p className="mt-1 text-[11px] text-muted">
                  Kategorievorlage: {vorlage.fileName} ({vorlage.createdAt.toLocaleDateString("de-DE")})
                </p>
                {bereit ? (
                  <a href={`/api/flatfile/${product.brandId}?productId=${id}`} download className="mt-2 inline-block btn-primary text-xs">
                    ⇣ Flat File für dieses Produkt
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-bad">Erst die Fehler oben beheben.</p>
                )}
                <p className="mt-2 text-[11px] text-muted">
                  Danach in Seller Central unter <b>Lagerbestand → Hochladen</b> einspielen.
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted">
                  Es fehlt die <b>Kategorievorlage</b> dieser Marke — sie legt fest, welche Spalten Amazon in dieser
                  Kategorie erwartet. Einmal in Seller Central erzeugen (&bdquo;Vorlage generieren&ldquo;), dann hier hochladen.
                </p>
                <form action={uploadFlatfileTemplate} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="brandId" value={product.brandId} />
                  <input type="file" name="file" accept=".xlsx,.xlsm,.txt,.tsv" required className="text-xs" />
                  <SubmitButton className="btn-dark text-xs">Vorlage hochladen</SubmitButton>
                </form>
              </>
            )}
          </div>

          <div className="rounded-xl border border-hair p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Weg 2 — SP-API</h3>
              <span className="pill pill-warn">wartet auf Zulassung</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Der Payload für dieses Produkt ist fertig — abgeschickt wird er erst, wenn Amazon die Agentur als
              Entwickler zulässt. Das ist ein Antrag bei Amazon, kein Vorgang im Tool.
            </p>
            <a href={`/api/cms/${product.brandId}/listings-json?productId=${id}`} download className="mt-2 inline-block btn-ghost text-xs">
              ⇣ Payload als JSON ansehen
            </a>
          </div>
        </div>
      </section>

      {/* Kunden-Feedback lebt auf Markenebene, nach Produkten gruppiert (Nutzer 23.07.) */}
      {feedback.length > 0 && (
        <section className="mt-4 card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="sect-h">Kunden-Feedback</h2>
            <Link href={`/marke/${product.brandId}/publish/feedback`} className="btn-primary text-xs">
              Zum Feedback der Marke ({offen.length} offen) →
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted">Das Kunden-Feedback läuft zentral über Content-Verwaltung → Kunden-Feedback, dort nach Produkten gruppiert.</p>
        </section>
      )}
    </main>
  );
}
