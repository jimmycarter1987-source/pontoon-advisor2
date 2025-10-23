import { XMLParser } from "fast-xml-parser";
import { prisma } from "./db";

const FEED = process.env.MACHINIO_FEED_URL!;

const toNum = (v: any, fb = 0) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : fb;
};
const clean = (s?: string) => String(s ?? "").trim();
const stripHtml = (html?: string) => clean(String(html ?? "").replace(/<[^>]*>/g, ""));
const inferToon = (type: string, subtype: string, title: string) =>
  /tri[-\s]?toon|tritoon|triple/i.test(`${type} ${subtype} ${title}`) ? "tritoon" : "pontoon";
const personsFromLength = (ft: number) => Math.max(6, Math.min(14, Math.round(ft * 0.5)));
const normalizeStatus = (s: string) => /sold/i.test(s) ? "sold" : /pending|hold|deposit/i.test(s) ? "pending" : "available";
const boolAvailable = (status?: string) => (status ?? "available") === "available";
const splitCityState = (loc: string) => {
  const m = loc?.match?.(/^(.*?),\s*([A-Z]{2})$/);
  return m ? { city: clean(m[1]), state: clean(m[2]) } : { city: undefined, state: undefined };
};
const inferFeatures = (it: any) => {
  const bag = `${it?.title} ${it?.description} ${it?.subtype} ${it?.category}`.toLowerCase();
  const out = new Set<string>();
  if (/fishing|fish/.test(bag)) out.add("fish");
  if (/lounge|lounger|quad/.test(bag)) out.add("rear lounge");
  if (/tri[-\s]?toon|triple/.test(bag)) out.add("performance");
  if (/lux|prem|platinum/.test(bag)) out.add("luxury");
  if (/value|entry|base/.test(bag)) out.add("value");
  if (/family|party|entertain/.test(bag)) out.add("family");
  return Array.from(out);
};

export async function syncInventoryFromFeed() {
  const res = await fetch(FEED, { cache: "no-store" });
  if (!res.ok) throw new Error("Feed not reachable");
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const data = parser.parse(xml);
  const rows: any[] = data?.rss?.channel?.item ?? [];

  for (const it of rows) {
    const extId = String(it?.guid ?? it?.id ?? "");
    const title = clean(it?.title);
    const brand = clean(it?.make) || clean(title.split(" ")[0]) || "Unknown";
    const model = clean(it?.model) || clean(title.replace(brand, ""));
    const subtype = clean(it?.subtype) || "";
    const type = clean(it?.type) || "";
    const toonType = inferToon(type, subtype, title);

    const lengthFt = toNum(it?.length || it?.length_feet, 22);
    const beamIn = toNum(it?.beam || it?.beam_inches) || undefined;

    const engineBrand = clean(it?.engine_make || it?.engine_brand || it?.engine);
    const hp = toNum(it?.engine_power || it?.horsepower || it?.hp, 150);

    const msrpRaw = toNum(it?.list_price || it?.price);
    const saleRaw = toNum(it?.sale_price || it?.price);
    const year = toNum(it?.year) || undefined;

    const hours = toNum(it?.hours) || undefined;
    const stockNumber = clean(it?.stock_number || it?.stock || it?.sku) || undefined;
    const serialNumber = clean(it?.serial_number || it?.vin) || undefined;

    const condition = /new/i.test(it?.condition) ? "new" : "used";
    const status = normalizeStatus(clean(it?.status));
    const available = boolAvailable(status);

    const fuel = clean(it?.fuel) || undefined;
    const color = clean(it?.color) || undefined;
    const hull = clean(it?.hull_material) || undefined;

    const loc = clean(it?.location || "Boat World MN");
    const { city, state } = splitCityState(loc);

    const primaryImage =
      clean(it?.image) || clean(it?.image_url) || clean(it?.images?.image?.[0]) || "";
    const images: string[] = Array.from(
      new Set(
        ([] as string[])
          .concat(it?.images?.image ?? [], it?.image ? [it.image] : [], it?.image_url ? [it.image_url] : [])
          .map(String).map(clean).filter(Boolean)
      )
    );

    const features = inferFeatures(it);
    const featuresCsv = features.join(",");

    const item = await prisma.inventoryItem.upsert({
      where: { externalId: extId || undefined },
      create: {
        externalId: extId || undefined,
        brand, model, year: year || null,
        lengthFt, beamIn: beamIn || null,
        toonType, maxPersons: personsFromLength(lengthFt),
        hp, engineBrand, fuel: fuel || null, color: color || null, hull: hull || null,
        hours: hours || null, stockNumber, serialNumber,
        condition, status, msrp: msrpRaw || saleRaw || 0, salePrice: saleRaw || msrpRaw || 0,
        available, location: loc, city, state, imageUrl: primaryImage,
        description: stripHtml(it?.description), featuresCsv,
      },
      update: {
        brand, model, year: year || null, lengthFt, beamIn: beamIn || null,
        toonType, maxPersons: personsFromLength(lengthFt),
        hp, engineBrand, fuel: fuel || null, color: color || null, hull: hull || null,
        hours: hours || null, stockNumber, serialNumber,
        condition, status, msrp: msrpRaw || saleRaw || 0, salePrice: saleRaw || msrpRaw || 0,
        available, location: loc, city, state, imageUrl: primaryImage,
        description: stripHtml(it?.description), featuresCsv,
      },
    });

    await prisma.inventoryImage.deleteMany({ where: { itemId: item.id } });
    if (images.length) {
      await prisma.inventoryImage.createMany({
        data: images.map((url) => ({ url, itemId: item.id })),
        skipDuplicates: true,
      });
    }
  }
}
