import { NextRequest, NextResponse } from "next/server";

const BASE_ID = "appnts6AotQifD9PL";
const TABLE_ID = "tblQuQ0P29Bffj19h";
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
const FIELD = {
  title: "fld4iP3akORNjHwRk",
  author: "fld0AMYanafahEc8U",
  illustrator: "fldadrEKPJgooiTMR",
  publisher: "fldxajZRgOoovM6dD",
  publisherText: "fldiiZiz342x9E0Fb",
  location: "fldDuBR7a35k7bViW",
  topics: "fldVB281fxZKCzlLi",
  types: "fld16qNhSRP73HUTE",
  themes: "fldZuHSrCgCuPbr0a",
  collection: "fldH4NmXGk25M7Poa",
  collectionText: "fld9RU093z2zlWzo5",
  characteristics: "fldwAzkBa3gwsrO6q",
  cover: "fldtJTUoiCpxqNZzN",
  archived: "fldFNEfPxbrXNHvbo",
  isbn: "fldIYf7diH3XgPvCs",
  notes: "fld2Bvjrdblnx2XSh",
  favorite: "fldBlnzYb0OYHqil2",
} as const;

type BookInput = {
  id?: string;
  title?: string;
  author?: string;
  illustrator?: string;
  publisher?: string;
  location?: string;
  topics?: string[];
  types?: string[];
  themes?: string[];
  collection?: string;
  characteristics?: string[];
  cover?: string;
  isbn?: string;
  notes?: string;
  favorite?: boolean;
  removeCover?: boolean;
};

function token() {
  const value = process.env.AIRTABLE_TOKEN;
  if (!value) throw new Error("AIRTABLE_TOKEN no está configurado");
  return value;
}

function headers() {
  return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function selectList(value: unknown) {
  return (Array.isArray(value) ? value : []).map(item => typeof item === "object" ? text((item as { name?: string }).name) : text(item)).filter(Boolean);
}

function selectOne(value: unknown) {
  return typeof value === "object" && value ? text((value as { name?: string }).name) : text(value);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

function toBook(record: { id: string; createdTime?: string; fields?: Record<string, unknown> }) {
  const fields = record.fields || {};
  const attachments = Array.isArray(fields[FIELD.cover]) ? fields[FIELD.cover] as Array<{ url?: string }> : [];
  const topics = Array.isArray(fields[FIELD.topics]) ? fields[FIELD.topics] as unknown[] : [];
  return {
    id: record.id,
    title: text(fields[FIELD.title]).trim() || "Sin título",
    author: text(fields[FIELD.author]),
    illustrator: text(fields[FIELD.illustrator]),
    publisher: text(fields[FIELD.publisherText]) || (typeof fields[FIELD.publisher] === "object" ? text((fields[FIELD.publisher] as { name?: string }).name) : text(fields[FIELD.publisher])),
    location: text(fields[FIELD.location]),
    topics: topics.map(item => typeof item === "object" ? text((item as { name?: string }).name) : text(item)).filter(Boolean),
    types: selectList(fields[FIELD.types]),
    themes: selectList(fields[FIELD.themes]),
    collection: text(fields[FIELD.collectionText]) || selectOne(fields[FIELD.collection]),
    characteristics: selectList(fields[FIELD.characteristics]),
    cover: text(attachments.at(-1)?.url),
    isbn: text(fields[FIELD.isbn]).replace(/\D/g, ""),
    notes: text(fields[FIELD.notes]),
    favorite: Boolean(fields[FIELD.favorite]),
    createdAt: record.createdTime || "",
  };
}

async function airtable(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: { message?: string } }).error?.message || "Error de Airtable");
  return payload;
}

async function listBooks() {
  const records: Array<{ id: string; createdTime?: string; fields?: Record<string, unknown> }> = [];
  let offset = "";
  do {
    const params = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true", filterByFormula: `NOT({${FIELD.archived}})` });
    Object.values(FIELD).forEach(field => params.append("fields[]", field));
    if (offset) params.set("offset", offset);
    const payload = await airtable(await fetch(`${AIRTABLE_URL}?${params}`, { headers: headers(), cache: "no-store" })) as { records?: typeof records; offset?: string };
    records.push(...(payload.records || []));
    offset = payload.offset || "";
  } while (offset);
  return records.map(toBook);
}

function fieldsFrom(input: BookInput, options: { includeHttpCover?: boolean } = {}) {
  const fields: Record<string, unknown> = {
    [FIELD.title]: text(input.title).trim(),
    [FIELD.author]: text(input.author).trim(),
    [FIELD.illustrator]: text(input.illustrator).trim(),
    [FIELD.location]: text(input.location).trim(),
    [FIELD.topics]: Array.isArray(input.topics) ? input.topics.filter(Boolean) : [],
    [FIELD.types]: Array.isArray(input.types) ? input.types.filter(Boolean) : [],
    [FIELD.themes]: Array.isArray(input.themes) ? input.themes.filter(Boolean) : [],
    [FIELD.collectionText]: input.collection?.trim() || "",
    [FIELD.characteristics]: Array.isArray(input.characteristics) ? input.characteristics.filter(Boolean) : [],
    [FIELD.isbn]: text(input.isbn).replace(/\D/g, ""),
    [FIELD.notes]: text(input.notes).trim(),
    [FIELD.favorite]: Boolean(input.favorite),
  };
  fields[FIELD.publisherText] = input.publisher?.trim() || "";
  if (input.removeCover || input.cover?.startsWith("data:")) fields[FIELD.cover] = [];
  else if (options.includeHttpCover && input.cover?.startsWith("http")) fields[FIELD.cover] = [{ url: input.cover }];
  return fields;
}

async function uploadCover(recordId: string, dataUrl?: string) {
  if (!dataUrl?.startsWith("data:")) return;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Formato de portada no válido");
  const extension = match[1].includes("png") ? "png" : match[1].includes("jpeg") ? "jpg" : "webp";
  await airtable(await fetch(`https://content.airtable.com/v0/${BASE_ID}/${recordId}/${FIELD.cover}/uploadAttachment`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ contentType: match[1], filename: `portada-${recordId}.${extension}`, file: match[2] }),
  }));
}

export async function GET() {
  try {
    const books = await listBooks();
    return NextResponse.json({ books, count: books.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo leer Airtable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const input = await request.json() as BookInput;
    if (!input.title?.trim()) return NextResponse.json({ error: "El título es obligatorio" }, { status: 400 });
    const current = await listBooks();
    const isbn = text(input.isbn).replace(/\D/g, "");
    const same = current.find(book => (isbn && book.isbn === isbn) || (normalize(book.title) === normalize(input.title || "") && (!input.author || !book.author || normalize(book.author) === normalize(input.author))));
    if (same) return NextResponse.json({ error: "Este cuento ya está en la biblioteca", existing: same }, { status: 409 });
    const payload = await airtable(await fetch(`${AIRTABLE_URL}?returnFieldsByFieldId=true&typecast=true`, {
      method: "POST", headers: headers(), body: JSON.stringify({ records: [{ fields: fieldsFrom(input, { includeHttpCover: true }) }] }),
    })) as { records: Array<{ id: string; fields?: Record<string, unknown> }> };
    const created = payload.records[0];
    await uploadCover(created.id, input.cover);
    const books = await listBooks();
    console.log(JSON.stringify({ level: "info", msg: "book-created", recordId: created.id, count: books.length, ms: Date.now() - started }));
    return NextResponse.json({ book: books.find(book => book.id === created.id), count: books.length }, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "book-create-failed", error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }));
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const input = await request.json() as BookInput;
    if (!input.id?.startsWith("rec") || !input.title?.trim()) return NextResponse.json({ error: "Registro no válido" }, { status: 400 });
    await airtable(await fetch(`${AIRTABLE_URL}?returnFieldsByFieldId=true&typecast=true`, {
      method: "PATCH", headers: headers(), body: JSON.stringify({ records: [{ id: input.id, fields: fieldsFrom(input) }] }),
    }));
    await uploadCover(input.id, input.cover);
    const books = await listBooks();
    return NextResponse.json({ book: books.find(book => book.id === input.id), count: books.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo actualizar" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json() as { id?: string };
    if (!id?.startsWith("rec")) return NextResponse.json({ error: "Registro no válido" }, { status: 400 });
    await airtable(await fetch(`${AIRTABLE_URL}?returnFieldsByFieldId=true`, {
      method: "PATCH", headers: headers(), body: JSON.stringify({ records: [{ id, fields: { [FIELD.archived]: true } }] }),
    }));
    const books = await listBooks();
    return NextResponse.json({ archived: id, count: books.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo archivar" }, { status: 500 });
  }
}
