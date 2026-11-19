// Response reports as files: Excel (.xlsx) and PDF, built on the server so they can be downloaded or
// sent over WhatsApp. No extra dependency for Excel (a tiny in-memory ZIP); PDF uses pdf-lib.
import zlib from 'node:zlib';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatAnswer } from './answers';
import type { FormField, SubmissionDTO } from './types';

export type ReportFormat = 'pdf' | 'xlsx';

export interface ReportInput {
  appName: string;
  formTitle: string;
  fields: FormField[];
  submissions: SubmissionDTO[];
  quiz: boolean;
}

export const REPORT_MIME: Record<ReportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function reportFileName(formTitle: string, format: ReportFormat, single?: boolean) {
  const base = formTitle.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'form';
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}_${single ? 'response' : 'responses'}_${stamp}.${format}`;
}

const when = (iso: string) => new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

/** One formatted value per field, in form order. */
function cells(input: ReportInput, s: SubmissionDTO) {
  return input.fields.map((f) => formatAnswer(f, s.data[f.id]));
}

export async function buildReport(format: ReportFormat, input: ReportInput): Promise<Buffer> {
  return format === 'pdf' ? buildPdf(input) : buildXlsx(input);
}

/* --------------------------------- Excel --------------------------------- */

const xmlEsc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i: number) => {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

export function buildXlsx(input: ReportInput): Buffer {
  const header = ['#', 'Submitted at', ...(input.quiz ? ['Score', 'Max score'] : []), ...input.fields.map((f) => f.label)];
  const rows: (string | number)[][] = [
    header,
    ...input.submissions.map((s, i) => [
      i + 1,
      when(s.createdAt),
      ...(input.quiz ? [s.score ?? '', s.maxScore ?? ''] : []),
      ...cells(input, s),
    ]),
  ];
  const widths = header.map((h, c) => Math.min(60, Math.max(8, h.length + 2, ...rows.slice(1, 200).map((r) => String(r[c] ?? '').length + 2))));
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('')}</cols><sheetData>${rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">${r
          .map((v, ci) => {
            if (v === '' || v === null || v === undefined) return '';
            const ref = `${colName(ci)}${ri + 1}`;
            const style = ri === 0 ? ' s="1"' : ' s="2"';
            if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${ri === 0 ? ' s="1"' : ''}><v>${v}</v></c>`;
            return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join('')}</sheetData><autoFilter ref="A1:${colName(header.length - 1)}${rows.length}"/></worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7F151B"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const sheetName = xmlEsc(input.formTitle.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Responses');
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName.replace(/'/g, "''")}'!$A$1:$${colName(header.length - 1)}$${rows.length}</definedName></definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Minimal in-memory ZIP (deflated entries). */
function zip(files: [string, string][]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8');
    const body = zlib.deflateRawSync(data, { level: 6 });
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(8, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, nameBuf);
    parts.push(local, nameBuf, body);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

/* ---------------------------------- PDF ---------------------------------- */

// The built-in PDF fonts cover Latin text (WinAnsi). Other scripts are replaced; the Excel file keeps everything.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const pdfSafe = (s: string) =>
  Array.from(s.replace(/\r\n?/g, '\n').replace(/\t/g, '  '))
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      if (ch === '\n' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch)) return ch;
      if (c === 0x2192) return '->';
      return '?';
    })
    .join('');

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const next = line + w;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line.trim()) out.push(line.trimEnd());
      line = w.trimStart();
      // A single word longer than the line: hard-break it.
      while (font.widthOfTextAtSize(line, size) > width) {
        let i = line.length;
        while (i > 1 && font.widthOfTextAtSize(line.slice(0, i), size) > width) i--;
        out.push(line.slice(0, i));
        line = line.slice(i);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

const BRAND = rgb(0.5, 0.08, 0.11);
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.28, 0.33, 0.41);
const RULE = rgb(0.89, 0.91, 0.94);

export async function buildPdf(input: ReportInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(input.formTitle));
  pdf.setProducer(input.appName);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const labelW = 170;
  const valueX = M + labelW + 12;
  const valueW = W - M - valueX;

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const header = (withTitle = true) => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: BRAND });
    page.drawText(pdfSafe(input.appName).toUpperCase(), { x: M, y: H - M + 8, size: 8, font: bold, color: MUTED });
    // The form's name on every later page, so a page printed or shared on its own still says which form it's from.
    if (!withTitle) return;
    let title = pdfSafe(input.formTitle);
    while (title.length > 1 && font.widthOfTextAtSize(title, 8) > W / 2 - M) title = title.slice(0, -2) + '…';
    title = pdfSafe(title);
    page.drawText(title, { x: W - M - font.widthOfTextAtSize(title, 8), y: H - M + 8, size: 8, font, color: MUTED });
  };
  const newPage = () => {
    page = pdf.addPage([W, H]);
    header();
    y = H - M - 14;
  };
  const need = (h: number) => {
    if (y - h < M + 20) newPage();
  };

  header(false);
  y -= 14;
  for (const line of wrap(input.formTitle, bold, 18, W - 2 * M)) {
    page.drawText(line, { x: M, y: y - 18, size: 18, font: bold, color: INK });
    y -= 24;
  }
  const n = input.submissions.length;
  page.drawText(pdfSafe(`${n} ${n === 1 ? 'response' : 'responses'} · generated ${when(new Date().toISOString())}`), { x: M, y: y - 10, size: 10, font, color: MUTED });
  y -= 30;

  input.submissions.forEach((s, idx) => {
    // Each response starts on a page of its own (the first one under the title).
    if (idx > 0) newPage();
    need(60);
    page.drawRectangle({ x: M, y: y - 22, width: W - 2 * M, height: 22, color: rgb(0.97, 0.95, 0.95) });
    page.drawText(pdfSafe(`Response ${n > 1 ? `${idx + 1} of ${n}` : ''}`.trim()), { x: M + 8, y: y - 15, size: 10.5, font: bold, color: BRAND });
    const meta = pdfSafe(`${when(s.createdAt)}${input.quiz && s.score !== null ? `  ·  Score ${s.score}/${s.maxScore ?? '?'}` : ''}`);
    page.drawText(meta, { x: W - M - 8 - font.widthOfTextAtSize(meta, 9), y: y - 15, size: 9, font, color: MUTED });
    y -= 30;

    input.fields.forEach((f) => {
      const value = formatAnswer(f, s.data[f.id]) || '—';
      const labelLines = wrap(f.label, bold, 9.5, labelW);
      const valueLines = wrap(value, font, 10, valueW);
      const rows = Math.max(labelLines.length, valueLines.length);
      const h = rows * 13 + 8;
      if (h > H - 2 * M - 40) {
        // A very long answer: print it in page-sized chunks.
        let i = 0;
        while (i < valueLines.length) {
          need(40);
          const fit = Math.max(1, Math.floor((y - M - 28) / 13));
          if (i === 0) labelLines.forEach((l, k) => page.drawText(l, { x: M, y: y - 10 - k * 13, size: 9.5, font: bold, color: MUTED }));
          valueLines.slice(i, i + fit).forEach((l, k) => page.drawText(l, { x: valueX, y: y - 10 - k * 13, size: 10, font, color: INK }));
          y -= Math.min(fit, valueLines.length - i) * 13 + 8;
          i += fit;
        }
      } else {
        need(h);
        labelLines.forEach((l, k) => page.drawText(l, { x: M, y: y - 10 - k * 13, size: 9.5, font: bold, color: MUTED }));
        valueLines.forEach((l, k) => page.drawText(l, { x: valueX, y: y - 10 - k * 13, size: 10, font, color: INK }));
        y -= h;
      }
      page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.5, color: RULE });
    });
    y -= 16;
  });

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 8), y: 24, size: 8, font, color: MUTED });
  });
  return Buffer.from(await pdf.save());
}
