import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ladeMarkenCms, ladePublikationen } from "@/lib/cms/laden";
import { buildListingsPatchRequest, buildListingsRequestMeta } from "@/lib/amazon/listingsPayload";
import { pruefePublish, publishBereit } from "@/lib/amazon/publishGate";
import { uploadFlatfileTemplate } from "@/app/actions";
import { publikationProtokollieren, publikationStatusSetzen } from "@/app/cms-actions";
import { SubmitButton } from "@/components/submit-button";
import { FehlerPopup } from "@/components/fehler-popup";
import { fehlerInfo } from "@/lib/fehlercodes";

export const dynamic = "force-dynamic";

/**
 * Publish — die beiden Wege zu Amazon (docs/amazon-content-contract.md):
 * 1. HEUTE: Flat File auf Basis der neusten Kategorievorlage.
 * 2. STUFE 2: SP-API Listings Items (JSON Patch).
 *
 * Der API-Payload wird schon heute vollständig erzeugt und geprüft — nur das
 * Abschicken fehlt. So ist der Weg vor der Zulassung testbar statt Theorie.
 */
export default async function CmsPublish({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ fehler?: string; code?: string }>;
}) {
  const { brandId } = await params;
  const { fehler, code } = await searchParams;
  const cms = await ladeMarkenCms(brandId);
  if (!cms) notFound();

  const db = await getDb();
  const templates = await db.query.flatfileTemplates.findMany({
    where: eq(schema.flatfileTemplates.brandId, brandId),
    orderBy: desc(schema.flatfileTemplates.createdAt),
  });
  const vorlage = templates[0];
  const publikationen = await ladePublikationen(brandId);

  const bereit = cms.produkte.filter((p) => publishBereit(p.publishIssues));

  return (
    <>
      {fehler && <FehlerPopup message={fehler} {...fehlerInfo(code)} />}

      <p className="mt-5 rounded-xl border border-hair bg-[var(--primary-soft)] px-3 py-2 text-xs text-primary-strong">
        <b>Der Normalfall ist der Publish EINES Produkts</b> — der liegt im Produkt selbst unter &bdquo;Content-Verwaltung&ldquo;.
        Diese Seite ist für den Sonderfall: mehrere Produkte in <i>einer</i> Datei, und die Verwaltung der Kategorievorlage.
      </p>

      {/* ── Weg 1: Flat File ─────────────────────────────────────────────── */}
      <section className="mt-4 card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sect-h">Sammel-Datei {vorlage && <span className="ml-1 pill pill-good">✓ {vorlage.fileName}</span>}</h2>
          <span className="pill pill-neutral">heutiger Publish-Weg</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Amazon-Vorlagen ändern sich laufend — hier immer die <b>neuste Kategorievorlage</b> hochladen (Seller Central →
          &bdquo;Vorlage generieren&ldquo;, .xlsx/.xlsm/.txt). Das Tool füllt sie mit dem freigegebenen Content und setzt
          <b> update_delete = PartialUpdate</b>: Mit <code>Update</code> würde Amazon jede Spalte, die in dieser Datei leer
          ist (Preis, Bestand, Maße …), auf dem Live-Listing löschen.
        </p>

        <form action={uploadFlatfileTemplate} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="brandId" value={brandId} />
          <input type="file" name="file" accept=".xlsx,.xlsm,.txt,.tsv" required className="text-sm" />
          <SubmitButton className="btn-dark text-xs">Neuste Vorlage hochladen</SubmitButton>
        </form>
        {vorlage && (
          <p className="mt-2 text-xs text-muted">
            {vorlage.fieldNames.filter(Boolean).length} Felder erkannt
            {vorlage.sheetName ? ` (Sheet „${vorlage.sheetName}")` : ""} · hochgeladen{" "}
            {vorlage.createdAt.toLocaleDateString("de-DE")}
            {templates.length > 1 && ` · ${templates.length - 1} ältere Version(en) archiviert`}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {vorlage && bereit.length > 0 ? (
            <a href={`/api/flatfile/${brandId}`} download className="btn-primary text-sm">
              ⇣ Flat File herunterladen ({bereit.length} Produkt{bereit.length === 1 ? "" : "e"})
            </a>
          ) : (
            <p className="text-xs text-muted">
              Zum Download fehlt {!vorlage ? "die Kategorievorlage" : "mindestens ein Produkt ohne Publish-Fehler"}.
            </p>
          )}
          {vorlage && bereit.length > 0 && (
            <form action={publikationProtokollieren}>
              <input type="hidden" name="brandId" value={brandId} />
              <input type="hidden" name="weg" value="flatfile" />
              <input type="hidden" name="slots" value="title,bullets,description,backend_keywords,main_image" />
              <SubmitButton className="btn-ghost text-xs">Als erzeugt protokollieren</SubmitButton>
            </form>
          )}
        </div>
      </section>

      {/* ── Weg 2: SP-API ────────────────────────────────────────────────── */}
      <section className="mt-4 card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="sect-h">Weg 2 — SP-API Listings Items 2021-08-01</h2>
          <span className="pill pill-warn">wartet auf Zulassung (Stufe 2)</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Der Payload wird hier vollständig erzeugt und geprüft — abgeschickt wird er erst mit der SP-API-Zulassung.
          Pflicht-Vorlauf bleibt dann <code>mode=VALIDATION_PREVIEW</code>: ein Trockenlauf, der nichts verändert.
          Und: Amazons <code>ACCEPTED</code> heißt &bdquo;angenommen&ldquo;, <b>nicht</b> &bdquo;live&ldquo; — der Beweis kommt aus dem Soll/Ist-Abgleich.
        </p>
      </section>

      {/* ── Publish-Pakete je Produkt ────────────────────────────────────── */}
      {cms.produkte.map((p) => {
        const apiIssues = pruefePublish(p.publish, { fuerApi: true });
        const meta = buildListingsRequestMeta("{sellerId}", p.publish, "VALIDATION_PREVIEW");
        const payload = buildListingsPatchRequest(p.publish);
        const qs = new URLSearchParams(meta.query).toString();
        return (
          <section key={p.id} id={p.id} className="mt-4 card p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{p.name}</h3>
                <p className="mt-0.5 text-xs text-muted">
                  SKU <span className="font-mono">{p.publish.sku}</span> · {payload.patches.length} Attribut(e) im Paket
                </p>
              </div>
              <span className={publishBereit(p.publishIssues) ? "pill pill-good" : "pill pill-bad"}>
                {publishBereit(p.publishIssues) ? "publish-bereit" : "blockiert"}
              </span>
            </header>

            {apiIssues.length > 0 && (
              <ul className="mt-2 space-y-1">
                {apiIssues.map((i) => (
                  <li key={i.code} className="text-xs">
                    <span className={i.severity === "error" ? "pill pill-bad" : "pill pill-warn"}>
                      {i.severity === "error" ? "Fehler" : "Hinweis"}
                    </span>{" "}
                    <span className="text-muted">{i.message}</span>{" "}
                    <span className="text-[10px] uppercase tracking-wide text-muted">
                      · {i.quelle === "amazon" ? "Amazon-Regel" : "Agentur-Messlatte"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <details className="mt-3 rounded-xl border border-hair p-3">
              <summary className="cursor-pointer text-xs font-semibold">SP-API-Payload ansehen</summary>
              <p className="mt-2 font-mono text-[11px] text-muted">
                PATCH {meta.path}?{qs}
              </p>
              <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-[var(--primary-soft)] p-3 text-[11px] leading-relaxed">
                {JSON.stringify(payload, null, 2)}
              </pre>
              <a
                href={`/api/cms/${brandId}/listings-json?productId=${p.id}`}
                download
                className="mt-2 inline-block btn-ghost text-xs"
              >
                ⇣ Payload als JSON
              </a>
            </details>
          </section>
        );
      })}

      {/* ── Protokoll ────────────────────────────────────────────────────── */}
      <section className="mt-4 card p-4">
        <h2 className="sect-h">Publish-Protokoll</h2>
        <p className="mt-1 text-xs text-muted">
          Was wann auf welchem Weg erzeugt wurde. <b>bestätigt</b> vergibt nicht Amazon, sondern der Soll/Ist-Abgleich —
          erst wenn der Content am Live-Listing gesehen wurde.
        </p>
        {publikationen.length === 0 && <p className="mt-2 text-sm text-muted">Noch kein Publish-Vorgang protokolliert.</p>}
        <ul className="mt-2 space-y-1.5">
          {publikationen.map((pub) => (
            <li key={pub.id} className="flex flex-wrap items-center gap-2 border-b border-hair/60 pb-1.5 text-xs">
              <span className="pill pill-neutral">{pub.weg === "flatfile" ? "Flat File" : "SP-API"}</span>
              <span className="text-muted">{pub.createdAt.toLocaleString("de-DE")}</span>
              <span className="text-muted">{pub.createdBy ?? "—"}</span>
              <span className="font-medium">{pub.status}</span>
              <form action={publikationStatusSetzen} className="ml-auto flex gap-1.5">
                <input type="hidden" name="pubId" value={pub.id} />
                <input type="hidden" name="brandId" value={brandId} />
                <select name="status" defaultValue={pub.status} className="input-base py-0.5 text-[11px]">
                  <option value="erzeugt">erzeugt</option>
                  <option value="eingereicht">eingereicht</option>
                  <option value="bestaetigt">bestätigt (im Abgleich live gesehen)</option>
                  <option value="fehler">fehler</option>
                </select>
                <SubmitButton className="btn-ghost text-[11px]">setzen</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
