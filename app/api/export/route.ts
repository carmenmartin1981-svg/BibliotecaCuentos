import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const dynamic = "force-dynamic";

type Book = {
  title?: string;
  author?: string;
  illustrator?: string;
  publisher?: string;
  location?: string;
  types?: string[];
  themes?: string[];
  collection?: string;
  characteristics?: string[];
  isbn?: string;
  notes?: string;
};

async function getBooks(request: NextRequest): Promise<Book[]> {
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  const response = await fetch(`${proto}://${host}/api/books`, { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar la biblioteca");
  const data = await response.json();
  return Array.isArray(data.books) ? data.books : [];
}

function filename(kind: "xlsx" | "pdf") {
  const date = new Date().toISOString().slice(0, 10);
  return `biblioteca-cuentos-${date}.${kind}`;
}

async function makeExcel(books: Book[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mi Biblioteca";
  const sheet = workbook.addWorksheet("Biblioteca");
  sheet.columns = [
    { header: "Título", key: "title", width: 44 },
    { header: "Autor", key: "author", width: 32 },
    { header: "Ilustrador", key: "illustrator", width: 28 },
    { header: "Editorial", key: "publisher", width: 28 },
    { header: "Ubicación", key: "location", width: 18 },
    { header: "Tipos", key: "types", width: 28 },
    { header: "Temáticas", key: "themes", width: 34 },
    { header: "Colección", key: "collection", width: 24 },
    { header: "Características", key: "characteristics", width: 28 },
    { header: "ISBN", key: "isbn", width: 18 },
    { header: "Notas", key: "notes", width: 42 },
  ];
  sheet.getRow(1).font = { bold: true };
  books.forEach(book => {
    sheet.addRow({
      title: book.title || "",
      author: book.author || "",
      illustrator: book.illustrator || "",
      publisher: book.publisher || "",
      location: book.location || "",
      types: (book.types || []).join(", "),
      themes: (book.themes || []).join(", "),
      collection: book.collection || "",
      characteristics: (book.characteristics || []).join(", "),
      isbn: book.isbn || "",
      notes: book.notes || "",
    });
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "K1" };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function splitLine(text: string, max = 92) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  words.forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines;
}

async function makePdf(books: Book[]) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28;
  const height = 841.89;
  const margin = 46;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const newPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
  };

  const draw = (text: string, size = 10, strong = false, gap = 14) => {
    if (y < margin + gap) newPage();
    page.drawText(text, { x: margin, y, size, font: strong ? bold : regular, color: rgb(0.12, 0.1, 0.08) });
    y -= gap;
  };

  draw("Mi Biblioteca de Cuentos", 18, true, 26);
  draw(`${books.length} cuentos`, 10, false, 22);

  books.forEach((book, index) => {
    const title = `${index + 1}. ${book.title || "Sin título"}`;
    splitLine(title, 76).forEach((line, lineIndex) => draw(line, 10, lineIndex === 0, 13));
    const meta = [book.author, book.publisher, book.location].filter(Boolean).join(" · ");
    if (meta) splitLine(meta, 94).forEach(line => draw(line, 8, false, 11));
    const tags = [
      ...(book.types || []),
      ...(book.themes || []),
      ...(book.collection ? [book.collection] : []),
      ...(book.characteristics || []),
    ].filter(Boolean).join(" · ");
    if (tags) splitLine(tags, 105).forEach(line => draw(line, 7.5, false, 10));
    y -= 5;
  });

  return Buffer.from(await pdf.save());
}

export async function GET(request: NextRequest) {
  try {
    const books = await getBooks(request);
    const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
    if (format === "pdf") {
      const data = await makePdf(books);
      return new NextResponse(data, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename("pdf")}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const data = await makeExcel(books);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename("xlsx")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo exportar" }, { status: 500 });
  }
}
