import { Fragment } from "react";

/**
 * Minimaler Markdown-Renderer (D269) — nur für die Brief-Texte, die noch als
 * Markdown-String entstehen (A+, Brand-Store).
 *
 * Vorher landeten diese Texte als `<pre>` auf der Seite: Sternchen,
 * Bindestriche und Raute-Überschriften im Rohzustand. Lesbar war das nicht.
 * Bewusst KEINE Bibliothek: Es geht um sechs Konstrukte, und ein
 * HTML-Renderer für fremdes Markdown wäre hier unnötige Angriffsfläche —
 * dieser hier baut ausschließlich React-Elemente, kein `dangerouslySetInnerHTML`.
 *
 * Unterstützt: `#`–`###`-Überschriften · `**fett**` · `-`/`·`-Listen ·
 * `1.`-Listen · `> Zitat` · `---`-Trenner · Absätze.
 */

/** Nur Inline-Fettung; alles andere bleibt Text (kein HTML, keine Links). */
function inline(text: string, key: string) {
  const teile = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return teile.map((t, i) =>
    t.startsWith("**") && t.endsWith("**") ? (
      <b key={`${key}-${i}`}>{t.slice(2, -2)}</b>
    ) : (
      <Fragment key={`${key}-${i}`}>{t}</Fragment>
    ),
  );
}

type Block =
  | { art: "h"; stufe: 1 | 2 | 3; text: string }
  | { art: "p"; text: string }
  | { art: "zitat"; text: string }
  | { art: "liste"; geordnet: boolean; punkte: string[] }
  | { art: "trenner" };

function zerlege(md: string): Block[] {
  const blocks: Block[] = [];
  let liste: { geordnet: boolean; punkte: string[] } | null = null;
  const listeSchliessen = () => {
    if (liste) blocks.push({ art: "liste", ...liste });
    liste = null;
  };

  for (const roh of md.split(/\r?\n/)) {
    const zeile = roh.trimEnd();
    if (!zeile.trim()) {
      listeSchliessen();
      continue;
    }
    if (/^\s*(---|___|\*\*\*)\s*$/.test(zeile)) {
      listeSchliessen();
      blocks.push({ art: "trenner" });
      continue;
    }
    const h = zeile.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      listeSchliessen();
      blocks.push({ art: "h", stufe: h[1].length as 1 | 2 | 3, text: h[2].trim() });
      continue;
    }
    const zitat = zeile.match(/^>\s?(.*)$/);
    if (zitat) {
      listeSchliessen();
      blocks.push({ art: "zitat", text: zitat[1].trim() });
      continue;
    }
    const ul = zeile.match(/^\s*[-*·]\s+(.*)$/);
    const ol = zeile.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const geordnet = Boolean(ol);
      if (!liste || liste.geordnet !== geordnet) {
        listeSchliessen();
        liste = { geordnet, punkte: [] };
      }
      liste.punkte.push((ul?.[1] ?? ol?.[1] ?? "").trim());
      continue;
    }
    // Fortsetzungszeile eines Listenpunkts (eingerückt) an den letzten anhängen
    if (liste && /^\s{2,}\S/.test(roh)) {
      liste.punkte[liste.punkte.length - 1] += ` ${zeile.trim()}`;
      continue;
    }
    listeSchliessen();
    blocks.push({ art: "p", text: zeile.trim() });
  }
  listeSchliessen();
  return blocks;
}

const H_KLASSE: Record<1 | 2 | 3, string> = {
  1: "mt-5 text-base font-semibold",
  2: "mt-5 text-sm font-semibold",
  3: "mt-4 text-xs font-semibold uppercase tracking-wide text-muted",
};

export function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed">
      {zerlege(text).map((b, i) => {
        const key = `b${i}`;
        switch (b.art) {
          case "h": {
            const Tag = (["h3", "h4", "h5"] as const)[b.stufe - 1];
            return (
              <Tag key={key} className={`${H_KLASSE[b.stufe]} first:mt-0`}>
                {inline(b.text, key)}
              </Tag>
            );
          }
          case "zitat":
            return (
              <blockquote key={key} className="mt-2 border-l-2 border-l-[var(--primary)] pl-3 text-sm italic text-muted">
                {inline(b.text, key)}
              </blockquote>
            );
          case "liste":
            return b.geordnet ? (
              <ol key={key} className="mt-2 list-decimal space-y-1 pl-5">
                {b.punkte.map((p, n) => <li key={n}>{inline(p, `${key}-${n}`)}</li>)}
              </ol>
            ) : (
              <ul key={key} className="mt-2 space-y-1">
                {b.punkte.map((p, n) => (
                  <li key={n} className="flex gap-2">
                    <span className="flex-none text-muted">·</span>
                    <span>{inline(p, `${key}-${n}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case "trenner":
            return <hr key={key} className="mt-4 border-hair" />;
          default:
            return <p key={key} className="mt-2">{inline(b.text, key)}</p>;
        }
      })}
    </div>
  );
}
