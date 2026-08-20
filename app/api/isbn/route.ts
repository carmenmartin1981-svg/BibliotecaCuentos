import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type BookMetadata = {
  found: true;
  source: string;
  title: string;
  authors: string[];
  illustrator?: string;
  publisher?: string;
  collection?: string;
  cover?: string;
};

const clean = (value = "") => value
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&#039;|&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  .replace(/\s+/g, " ")
  .trim();

const field = (html: string, label: string) => {
  const match = html.match(new RegExp(`<dt>\\s*${label}\\s*:?\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`, "i"));
  return clean(match?.[1]);
};

async function fromSpanishBookshops(isbn: string): Promise<BookMetadata | null> {
  const response = await fetch(`https://www.todostuslibros.com/busquedas?keyword=${encodeURIComponent(isbn)}`, {
    headers: { "User-Agent": "BibliotecaCuentos/1.0" },
    signal: AbortSignal.timeout(7000),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const html = await response.text();
  const title = clean(html.match(/<h1 class="title">([\s\S]*?)<\/h1>/i)?.[1]);
  if (!title) return null;
  const author = field(html, "Autoría");
  const illustrator = field(html, "Ilustración");
  const publisher = field(html, "Editorial");
  const collection = field(html, "Colección");
  const cover = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] ||
    html.match(/<img class="portada"[^>]+src="([^"]+)"/i)?.[1] || "";
  return {
    found: true,
    source: "TodosTusLibros",
    title,
    authors: author ? [author] : [],
    ...(illustrator && { illustrator }),
    ...(publisher && { publisher }),
    ...(collection && { collection }),
    ...(cover && { cover: cover.replace(/^http:/, "https:") }),
  };
}

async function fromOpenLibrary(isbn: string): Promise<BookMetadata | null> {
  const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, {
    headers: { "User-Agent": "BibliotecaCuentos/1.0" },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json();
  const info = data[`ISBN:${isbn}`];
  if (!info?.title) return null;
  return {
    found: true,
    source: "Open Library",
    title: info.title,
    authors: (info.authors || []).map((author: { name?: string }) => author.name).filter(Boolean),
    publisher: info.publishers?.[0]?.name || "",
    cover: info.cover?.large || info.cover?.medium || info.cover?.small || "",
  };
}

export async function GET(request: NextRequest) {
  const isbn = (request.nextUrl.searchParams.get("isbn") || "").replace(/\D/g, "");
  if (isbn.length !== 10 && isbn.length !== 13) {
    return NextResponse.json({ found: false, error: "ISBN no válido" }, { status: 400 });
  }
  for (const provider of [fromSpanishBookshops, fromOpenLibrary]) {
    try {
      const book = await provider(isbn);
      if (book) return NextResponse.json(book);
    } catch {}
  }
  return NextResponse.json({ found: false, isbn });
}
