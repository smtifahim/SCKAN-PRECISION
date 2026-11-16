// Exports an HTML <table> element as a real Excel workbook (.xlsx). The
// workbook is assembled by hand - an .xlsx is a zip of a few XML parts, and a
// store-only zip needs no compression library - so Excel opens it without the
// "file format and extension don't match" warning that an HTML table saved as
// .xls triggers. Header cells are bold, and a cell whose table cell holds a
// link (SCKAN Explorer / NervoSensus / DOI) becomes a clickable HYPERLINK.

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAX_FORMULA_TEXT = 250; // Excel rejects string literals longer than 255 characters in a formula
const MAX_COLUMN_WIDTH = 60;

const escapeXml = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A zip archive with every entry stored uncompressed. @param {Array<{name: string, data: string}>} files */
function zipStore(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (bytes) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  for (const { name, data } of files) {
    const nameBytes = encoder.encode(name);
    const bytes = encoder.encode(data);
    const crc = crc32(bytes);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nameBytes.length, true);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, bytes.length, true);
    entry.setUint32(24, bytes.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);

    push(new Uint8Array(local.buffer));
    push(nameBytes);
    push(bytes);
  }

  const centralStart = offset;
  central.forEach(push);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, offset - centralStart, true);
  end.setUint32(16, centralStart, true);
  push(new Uint8Array(end.buffer));
  return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** @param {Array<Array<{text: string, url?: string, header?: boolean}>>} rows */
function buildSheetXml(rows) {
  const widths = [];
  const rowXml = rows.map((cells, r) => {
    const cellXml = cells.map((cell, c) => {
      widths[c] = Math.min(MAX_COLUMN_WIDTH, Math.max(widths[c] ?? 8, cell.text.length + 2));
      const ref = `${columnName(c)}${r + 1}`;
      const text = escapeXml(cell.text);
      if (cell.url && cell.text.length <= MAX_FORMULA_TEXT && cell.url.length <= MAX_FORMULA_TEXT) {
        const formula = `HYPERLINK("${escapeXml(cell.url)}","${text.replace(/&quot;/g, '""')}")`;
        return `<c r="${ref}" s="2" t="str"><f>${formula}</f><v>${text}</v></c>`;
      }
      return `<c r="${ref}" s="${cell.header ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
    });
    return `<row r="${r + 1}">${cellXml.join('')}</row>`;
  });
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return (
    `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols><sheetData>${rowXml.join('')}</sheetData></worksheet>`
  );
}

const STYLES_XML =
  `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
  '<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function buildWorkbook(rows, sheetName) {
  return zipStore([
    {
      name: '[Content_Types].xml',
      data:
        `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      data:
        `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      data:
        `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data:
        `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    },
    { name: 'xl/styles.xml', data: STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', data: buildSheetXml(rows) },
  ]);
}

const cellText = (el) => el.textContent.replace(/\s+/g, ' ').trim();

/**
 * @param {HTMLTableElement} tableEl
 * @param {string} [filename] - should end in .xlsx
 */
export function exportTableAsExcel(tableEl, filename = 'sckan-precision-candidate-mappings.xlsx') {
  const rows = [...tableEl.querySelectorAll('tr')].map((tr) =>
    [...tr.children].map((cell) => {
      // A cell holding several links stays plain text: one hyperlink would point at only one of them.
      const links = cell.querySelectorAll('a[href]');
      return {
        text: cellText(cell),
        url: links.length === 1 ? links[0].href : undefined,
        header: cell.tagName === 'TH',
      };
    })
  );
  const url = URL.createObjectURL(buildWorkbook(rows, 'Mappings'));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
