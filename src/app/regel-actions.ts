"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { getSessionUser } from "@/lib/auth/session";
import {
  AENDERBARE_REGELN,
  SETTINGS_KEY_OVERRIDES,
  SETTINGS_KEY_HISTORIE,
  standardWert,
  type RegelAenderung,
  type RegelKey,
  type RegelOverrides,
} from "@/lib/validation/regelstand";
import {
  ladeRegelOverrides,
  ladeRegelHistorie,
  pruefeAlleMarken,
  ladeRegelUebersicht,
  ladeWaechterStand,
  SETTINGS_KEY_WAECHTER,
} from "@/lib/validation/regelstand-db";
import { sucheRegelaenderungen } from "@/lib/validation/regelwaechter";

/**
 * Amazon ändert eine Vorgabe — das Tool zieht nach und meldet, wer betroffen ist.
 *
 * Der Ablauf, der ohne dieses Modul niemand von Hand schafft: Ein neuer
 * Titel-Grenzwert macht schlagartig jeden bereits FREIGEGEBENEN Titel ungültig.
 * Genau diese Texte schaut niemand mehr an — bis Amazon das Listing
 * unterdrückt. Hier entsteht stattdessen je betroffenem Produkt ein Alert.
 */



export async function regelAendern(formData: FormData) {
  const key = String(formData.get("key") ?? "") as RegelKey;
  const neu = Number(formData.get("wert"));
  const quelle = String(formData.get("quelle") ?? "").trim();
  const def = AENDERBARE_REGELN.find((r) => r.key === key);
  const ziel = "/einstellungen";

  if (!def) redirect(`${ziel}?fehler=${encodeURIComponent("Unbekannte Regel.")}&code=REG-01`);
  if (!Number.isFinite(neu) || neu <= 0)
    redirect(`${ziel}?fehler=${encodeURIComponent("Der neue Wert muss eine Zahl größer als 0 sein.")}&code=REG-01`);
  if (!quelle)
    redirect(
      `${ziel}?fehler=${encodeURIComponent(
        'Bitte die Quelle angeben (z. B. „Amazon-Ankündigung 07/2026") — ohne Herkunft keine Regel.',
      )}&code=REG-01`,
    );

  const db = await getDb();
  const user = await getSessionUser();
  const overrides = await ladeRegelOverrides();
  const alt = overrides[key!] ?? standardWert(key!);
  if (alt === neu) redirect(`${ziel}?hinweis=${encodeURIComponent("Der Wert war bereits so hinterlegt — nichts geändert.")}`);

  const neueOverrides: RegelOverrides = { ...overrides, [key!]: neu };
  const historie = ((await ladeRegelHistorie()) ?? []).slice().reverse();
  const eintrag: RegelAenderung = {
    key: key!,
    label: def!.label,
    alt,
    neu,
    quelle,
    gueltigAb: new Date().toISOString(),
    erfasstVon: user?.name ?? null,
  };

  const jetzt = new Date();
  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY_OVERRIDES, value: neueOverrides, updatedBy: user?.name ?? null, updatedAt: jetzt })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: neueOverrides, updatedBy: user?.name ?? null, updatedAt: jetzt },
    });
  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY_HISTORIE, value: [...historie, eintrag], updatedBy: user?.name ?? null, updatedAt: jetzt })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: [...historie, eintrag], updatedBy: user?.name ?? null, updatedAt: jetzt },
    });

  const betroffen = await pruefeAlleMarken();
  redirect(
    `${ziel}?hinweis=${encodeURIComponent(
      `${def!.label}: ${alt} → ${neu}. ${betroffen} betroffene Stelle(n) gefunden — die Alerts stehen bei der jeweiligen Marke unter Content-Verwaltung.`,
    )}`,
  );
}

/** Regel auf den Auslieferungsstand zurücksetzen. */
export async function regelZuruecksetzen(formData: FormData) {
  const key = String(formData.get("key") ?? "") as RegelKey;
  const db = await getDb();
  const user = await getSessionUser();
  const overrides = await ladeRegelOverrides();
  if (!(key in overrides)) redirect("/einstellungen");
  delete overrides[key];
  const jetzt = new Date();
  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY_OVERRIDES, value: overrides, updatedBy: user?.name ?? null, updatedAt: jetzt })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: overrides, updatedBy: user?.name ?? null, updatedAt: jetzt },
    });
  await pruefeAlleMarken();
  revalidatePath("/einstellungen");
}

/**
 * „Nach Amazon-Änderungen suchen" — der Wächter läuft los.
 *
 * Er ÜBERNIMMT nichts. Er legt Vorschläge ab, die hier zur Annahme stehen:
 * Eine Websuche kann eine Zahl falsch lesen, und eine still geänderte
 * Titel-Grenze würde bei allen Kunden Alerts auf einer Falschmeldung erzeugen.
 */
export async function regelaenderungenSuchen() {
  const ziel = "/einstellungen";
  const uebersicht = await ladeRegelUebersicht();

  let ergebnis;
  try {
    const vorher = await ladeWaechterStand();
    ergebnis = await sucheRegelaenderungen(
      uebersicht.map((u) => ({ key: u.key, label: u.label, wert: u.wirksam, einheit: u.einheit })),
      vorher?.gepruefaAm ?? null,
    );
  } catch (e) {
    redirect(`${ziel}?fehler=${encodeURIComponent(e instanceof Error ? e.message : String(e))}&code=REG-02`);
  }

  const db = await getDb();
  const user = await getSessionUser();
  const jetzt = new Date();
  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY_WAECHTER, value: ergebnis!, updatedBy: user?.name ?? null, updatedAt: jetzt })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: ergebnis!, updatedBy: user?.name ?? null, updatedAt: jetzt },
    });

  const n = ergebnis!.funde.length;
  redirect(
    `${ziel}?hinweis=${encodeURIComponent(
      n === 0
        ? 'Suche abgeschlossen — keine belegte Änderung gefunden. Was die Suche sonst gesehen hat, steht unter „Zuletzt geprüft".' 
        : `Suche abgeschlossen — ${n} Vorschlag/Vorschläge zum Durchgehen.`,
    )}`,
  );
}

/** Einen Vorschlag verwerfen (bleibt im Protokoll als „geprüft und abgelehnt"). */
export async function vorschlagVerwerfen(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const stand = await ladeWaechterStand();
  if (!stand) redirect("/einstellungen");
  const db = await getDb();
  const user = await getSessionUser();
  const neu = { ...stand!, funde: stand!.funde.filter((f) => f.key !== key) };
  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY_WAECHTER, value: neu, updatedBy: user?.name ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: neu, updatedBy: user?.name ?? null, updatedAt: new Date() },
    });
  revalidatePath("/einstellungen");
}
