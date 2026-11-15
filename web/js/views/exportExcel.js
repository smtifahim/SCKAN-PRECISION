// Exports an HTML <table> element as an Excel-compatible .xls file. Excel
// opens HTML tables natively when served with the `application/vnd.ms-excel`
// MIME type, so this needs no extra charting/spreadsheet library - it also
// preserves the table's hyperlinks (SCKAN Explorer / NervoSensus / DOI links).

export function exportTableAsExcel(tableEl, filename = 'sckan-precision-candidate-mappings.xls') {
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8" /></head>
    <body>${tableEl.outerHTML}</body>
    </html>
  `;
  const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
