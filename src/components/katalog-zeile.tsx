"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoeschButton } from "@/components/loesch-button";

/**
 * Eine klickbare Katalog-Zeile. Die ganze Zeile führt zum Produkt — aber per
 * JS-Navigation, NICHT per CSS-Stretched-Link: `position: relative` auf `<tr>`
 * wird nicht zuverlässig als Bezugsrahmen honoriert, dann spannt das ::after-
 * Overlay über den ganzen Viewport und schluckt alle Klicks (D…-Regression).
 *
 * Klick auf ein echtes `<a>`/`<button>` in der Zeile (ASIN-Link, Freigabe,
 * Feedback, Löschen) navigiert NICHT die Zeile — es wirkt das jeweilige Element.
 */
export function KatalogZeile(props: {
  id: string;
  brandId: string;
  bildUrl: string | null;
  asin: string | null;
  titelKurz: string | null;
  marketplace: string;
  skuFehlt: boolean;
  produkttypFehlt: boolean;
  sollAusIst: number;
  kernFreigegeben: number;
  accuracyPct: number | null;
  abgesichert: { ok: number; kern: number } | null;
  bereit: boolean;
  wartet: number;
  feedbackOffen: number;
  loeschFrage: string;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const router = useRouter();
  const onRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    // Klicks auf interaktive Elemente (Links/Buttons) machen ihr eigenes Ding.
    if ((e.target as HTMLElement).closest("a,button")) return;
    router.push(`/produkte/${props.id}`);
  };

  return (
    <tr
      onClick={onRowClick}
      className="group cursor-pointer border-b border-hair/60 transition-colors last:border-0 hover:bg-[var(--primary-soft)]"
    >
      <td className="py-3 pl-5 pr-3">
        <div className="flex items-center gap-3">
          {props.bildUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={props.bildUrl} alt="" className="h-11 w-11 flex-none rounded-lg border border-hair bg-white object-contain" />
          ) : (
            <div className="grid h-11 w-11 flex-none place-items-center rounded-lg border border-hair bg-neutral-100 text-xs text-muted dark:bg-neutral-800">–</div>
          )}
          <div className="min-w-0">
            <Link
              href={`/produkte/${props.id}`}
              className="font-mono text-[13px] font-medium group-hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {props.asin ?? <span className="font-sans text-warn">ohne ASIN</span>}
            </Link>
            <div className="mt-0.5 max-w-[22rem] truncate text-[12px] text-muted">
              {props.titelKurz ?? <span className="italic">Titel folgt nach Listing-Import</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span>{props.marketplace.toUpperCase()}</span>
              {props.skuFehlt && <span className="pill pill-warn">SKU fehlt</span>}
              {props.produkttypFehlt && <span className="pill pill-warn">Produkttyp fehlt</span>}
              {props.sollAusIst > 0 && <span className="pill pill-neutral">{props.sollAusIst}× nur Ausgangs-Stand</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 pr-3 tabular-nums">
        <span className={props.kernFreigegeben === 5 ? "text-good" : props.kernFreigegeben === 0 ? "text-muted" : ""}>
          {props.kernFreigegeben}/5
        </span>
      </td>
      <td className="py-3 pr-3 tabular-nums">
        {props.accuracyPct === null ? (
          <span className="text-muted" title="Kein gecrawlter Live-Stand">–</span>
        ) : (
          <span className={props.accuracyPct >= 95 ? "text-good" : "text-bad"}>{props.accuracyPct} %</span>
        )}
      </td>
      <td className="py-3 pr-3 tabular-nums">
        {props.abgesichert === null ? (
          <span className="text-muted">—</span>
        ) : (
          <span className={props.abgesichert.ok === props.abgesichert.kern ? "text-good" : "text-muted"} title="Vom Kunden freigegebene Kern-Plätze">
            {props.abgesichert.ok}/{props.abgesichert.kern}
          </span>
        )}
      </td>
      <td className="py-3 pr-3">
        <span className={props.bereit ? "pill pill-good" : "pill pill-bad"}>{props.bereit ? "bereit" : "blockiert"}</span>
      </td>
      <td className="py-3 pr-3">
        <div className="flex w-fit flex-wrap gap-1.5">
          {props.wartet > 0 && (
            <Link href={`/marke/${props.brandId}/publish`} className="pill pill-warn" onClick={(e) => e.stopPropagation()}>{props.wartet}× Freigabe</Link>
          )}
          {props.feedbackOffen > 0 && (
            <Link href={`/produkte/${props.id}/content`} className="pill pill-neutral" onClick={(e) => e.stopPropagation()}>{props.feedbackOffen}× Feedback</Link>
          )}
          {props.wartet === 0 && props.feedbackOffen === 0 && <span className="text-xs text-muted">—</span>}
        </div>
      </td>
      <td className="py-3 pr-5 text-right">
        <div className="flex items-center justify-end">
          <LoeschButton
            action={props.deleteAction}
            felder={{ productId: props.id }}
            frage={props.loeschFrage}
            title="Produkt löschen"
          />
        </div>
      </td>
    </tr>
  );
}
