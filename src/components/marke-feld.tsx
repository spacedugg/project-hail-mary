"use client";

import { useRef, useState } from "react";

/**
 * Marke mit Auto-Speichern (D169, Nutzer-Vorgabe 22.07.): Verlassen des
 * Felds (oder Enter) speichert den neuen Stand automatisch — kein
 * Speichern-Knopf. Ein kurzes ✓ bestätigt den gespeicherten Stand.
 */
export function MarkeFeld({
  action,
  productId,
  wert,
}: {
  action: (formData: FormData) => void | Promise<void>;
  productId: string;
  wert: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const zuletzt = useRef(wert.trim());
  const [gespeichert, setGespeichert] = useState(false);
  return (
    <form
      ref={formRef}
      action={async (fd) => {
        zuletzt.current = String(fd.get("marke") ?? "").trim();
        await action(fd);
        setGespeichert(true);
        setTimeout(() => setGespeichert(false), 2500);
      }}
      className="flex items-center gap-1.5 text-xs"
    >
      <input type="hidden" name="productId" value={productId} />
      <label className="text-muted" htmlFor="marke-feld">Marke</label>
      <input
        id="marke-feld"
        name="marke"
        defaultValue={wert}
        placeholder="Pflicht für Content"
        required
        className="input w-36 text-xs"
        onBlur={(e) => {
          const neu = e.target.value.trim();
          if (neu && neu !== zuletzt.current) formRef.current?.requestSubmit();
        }}
      />
      {gespeichert && <span className="text-[11px] text-good">✓</span>}
    </form>
  );
}
