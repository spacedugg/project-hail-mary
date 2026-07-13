"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, desc, and } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { generateSection, type ListingSection, type RecipeInputs } from "@/lib/recipes/listing";
import type { ProductFacts } from "@/db/schema";

const id = () => crypto.randomUUID();
const slugify = (s: string) =>
  s.toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] ?? c).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function createClient(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const db = await getDb();
  const clientId = id();
  await db.insert(schema.clients).values({ id: clientId, name, slug: slugify(name) || clientId.slice(0, 8) });
  // Default-Marke = Kundenname (vereinfachter v0-Flow; mehrere Marken jederzeit möglich)
  await db.insert(schema.brands).values({ id: id(), clientId, name });
  revalidatePath("/");
}

export async function createProduct(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const asin = String(formData.get("asin") ?? "").trim() || null;
  if (!brandId || !name) return;
  const db = await getDb();
  const productId = id();
  await db.insert(schema.products).values({ id: productId, brandId, name, asin });
  redirect(`/produkte/${productId}`);
}

export async function saveFacts(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const split = (k: string) =>
    String(formData.get(k) ?? "").split(/[|;\n]/).map((s) => s.trim()).filter(Boolean);
  const facts: ProductFacts = {
    productType: String(formData.get("productType") ?? "").trim() || undefined,
    materials: split("materials"),
    dimensions: String(formData.get("dimensions") ?? "").trim() || undefined,
    usps: split("usps"),
    targetAudience: String(formData.get("targetAudience") ?? "").trim() || undefined,
    certifications: split("certifications"),
  };
  const db = await getDb();
  await db.update(schema.products).set({ facts }).where(eq(schema.products.id, productId));
  revalidatePath(`/produkte/${productId}`);
}

export async function saveKeywords(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const raw = String(formData.get("keywords") ?? "");
  const db = await getDb();
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  await db.delete(schema.keywords).where(and(eq(schema.keywords.productId, productId), eq(schema.keywords.source, "manual")));
  // v0-Tiering nach Reihenfolge: 1–3 primary, 4–13 secondary, 14–18 tertiary, Rest backend
  const rows = lines.map((line, i) => {
    const [kw, vol] = line.split(/[;\t]/).map((s) => s?.trim());
    const tier = i < 3 ? "primary" : i < 13 ? "secondary" : i < 18 ? "tertiary" : "backend";
    return {
      id: id(),
      productId,
      keyword: kw,
      searchVolume: vol ? parseInt(vol.replace(/\D/g, ""), 10) || null : null,
      tier: tier as "primary" | "secondary" | "tertiary" | "backend",
      source: "manual",
    };
  });
  if (rows.length) await db.insert(schema.keywords).values(rows);
  revalidatePath(`/produkte/${productId}`);
}

export async function generateContent(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const section = String(formData.get("section") ?? "") as ListingSection;
  const db = await getDb();

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });
  const kws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, productId) });
  const insights = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, productId),
    orderBy: desc(schema.reviewInsights.createdAt),
  });

  const byTier = (t: string) => kws.filter((k) => k.tier === t).map((k) => k.keyword);

  // Freigegebene/neueste Sektionen als Kontext (temoa-os-Ablauf)
  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, productId),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const latest = (t: string) => versions.find((v) => v.type === t)?.payload as Record<string, unknown> | undefined;

  const inputs: RecipeInputs = {
    brand: brand?.name ?? "",
    productName: product.name,
    marketplace: product.marketplace,
    facts: product.facts,
    keywords: {
      primary: byTier("primary"),
      secondary: byTier("secondary"),
      tertiary: byTier("tertiary"),
      backendPool: byTier("backend"),
    },
    reviewInsights: insights?.payload ?? null,
    voiceTone: brand?.voiceTone,
    approved: {
      title: latest("title")?.text as string | undefined,
      bullets: latest("bullets")?.items as string[] | undefined,
    },
  };

  const result = await generateSection(section, inputs);

  const dbType = section === "backend" ? "backend_keywords" : section;
  const prev = versions.filter((v) => v.type === dbType);
  await db.insert(schema.contentVersions).values({
    id: id(),
    productId,
    type: dbType as "title" | "bullets" | "description" | "backend_keywords",
    version: (prev[0]?.version ?? 0) + 1,
    payload: result.payload,
    status: "draft",
    validation: {
      passed: !result.issues.some((i) => i.severity === "error"),
      issues: result.issues,
      checkedAt: new Date().toISOString(),
    },
    generatedBy: `${result.provider}:${result.model}`,
  });
  revalidatePath(`/produkte/${productId}`);
}
