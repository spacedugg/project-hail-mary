import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { saveFacts, saveKeywords, generateContent } from "@/app/actions";
import type { ValidationIssue } from "@/db/schema";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { key: "title", label: "Titel" },
  { key: "bullets", label: "Bullet Points" },
  { key: "backend", label: "Backend-Keywords" },
  { key: "description", label: "Beschreibung" },
] as const;

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length)
    return <p className="mt-1 text-xs text-emerald-600">✓ Gate bestanden — keine Befunde.</p>;
  return (
    <ul className="mt-1 space-y-0.5">
      {issues.map((i, n) => (
        <li key={n} className={`text-xs ${i.severity === "error" ? "text-red-600" : "text-amber-600"}`}>
          {i.severity === "error" ? "✕" : "△"} <span className="font-mono">{i.rule}</span> — {i.message}
        </li>
      ))}
    </ul>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) notFound();

  const kws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, id) });
  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, id),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const latestOf = (t: string) => versions.find((v) => v.type === t);
  const f = product.facts;
  const input = "w-full rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/" className="text-xs text-neutral-500 hover:underline">← Katalog</Link>
      <h1 className="mt-1 text-2xl font-semibold">
        {product.name}{" "}
        {product.asin && <span className="font-mono text-sm text-neutral-500">{product.asin} · amazon.{product.marketplace}</span>}
      </h1>

      {/* 1 · Produkt-Wahrheit */}
      <section className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">1 · Produkt-Wahrheit (Pflicht)</h2>
        <form action={saveFacts} className="mt-3 grid grid-cols-2 gap-2">
          <input type="hidden" name="productId" value={product.id} />
          <input name="productType" defaultValue={f.productType} placeholder="Produkttyp (z. B. Trinkflasche)" className={input} />
          <input name="dimensions" defaultValue={f.dimensions} placeholder="Maße/Menge (z. B. 750 ml)" className={input} />
          <input name="materials" defaultValue={f.materials?.join(" | ")} placeholder="Materialien, ehrlich, | -getrennt" className={`${input} col-span-2`} />
          <input name="usps" defaultValue={f.usps?.join(" | ")} placeholder="USPs (| -getrennt) — jede wird genau 1× verwendet" className={`${input} col-span-2`} />
          <input name="targetAudience" defaultValue={f.targetAudience} placeholder="Zielgruppe" className={input} />
          <input name="certifications" defaultValue={f.certifications?.join(" | ")} placeholder="Zertifikate/Normen (nur echte)" className={input} />
          <button className="col-span-2 rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-black">
            Speichern
          </button>
        </form>
      </section>

      {/* 2 · Keywords */}
      <section className="mt-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          2 · Keyword-Basis (Pflicht) — {kws.length} Keywords
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Eine Zeile je Keyword, optional „;Suchvolumen". v0-Tiering nach Reihenfolge: 1–3 primary → Titel, 4–13 secondary → Bullets, 14–18 tertiary → Beschreibung, Rest → Backend. (Cerebro-CSV-Import folgt.)
        </p>
        <form action={saveKeywords} className="mt-3">
          <input type="hidden" name="productId" value={product.id} />
          <textarea
            name="keywords"
            rows={6}
            defaultValue={kws.map((k) => `${k.keyword}${k.searchVolume ? `;${k.searchVolume}` : ""}`).join("\n")}
            placeholder={"edelstahl trinkflasche;18100\nthermosflasche;9900\n…"}
            className={`${input} font-mono`}
          />
          <button className="mt-2 rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-black">
            Keywords speichern
          </button>
        </form>
      </section>

      {/* 3 · Content */}
      <section className="mt-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">3 · Content — generieren & Gate</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Sektionsweise (Titel → Bullets → Backend → Beschreibung); jede Generierung durchläuft das Validation-Gate. Ohne API-Key läuft der Mock-Modus.
        </p>
        <div className="mt-3 space-y-4">
          {SECTIONS.map(({ key, label }) => {
            const dbType = key === "backend" ? "backend_keywords" : key;
            const v = latestOf(dbType);
            const payload = v?.payload as { text?: string; items?: string[] } | undefined;
            return (
              <div key={key} className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    {label}{" "}
                    {v && <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800">v{v.version} · {v.status} · {v.generatedBy}</span>}
                  </h3>
                  <form action={generateContent}>
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="section" value={key} />
                    <button className="rounded bg-teal-700 px-3 py-1 text-xs font-medium text-white hover:bg-teal-800">
                      {v ? "Neu generieren" : "Generieren"}
                    </button>
                  </form>
                </div>
                {payload?.text && <p className="mt-2 whitespace-pre-wrap rounded bg-neutral-50 p-2 text-sm dark:bg-neutral-900">{payload.text}</p>}
                {payload?.items && (
                  <ul className="mt-2 space-y-1 rounded bg-neutral-50 p-2 text-sm dark:bg-neutral-900">
                    {payload.items.map((b, i) => <li key={i}>• {b}</li>)}
                  </ul>
                )}
                {v?.validation && <IssueList issues={v.validation.issues} />}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
