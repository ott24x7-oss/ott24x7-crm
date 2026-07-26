// Parses an untrusted spreadsheet in an isolated worker thread.
//
// xlsx@0.18.5 is the last npm release and carries known issues (prototype pollution during
// parse, and ReDoS on crafted input). The patched build only ships from SheetJS's own CDN,
// which this environment cannot reach, so instead we contain the blast radius:
//   * a worker has its OWN JS realm, so any Object.prototype pollution dies with it and
//     never touches the Electron main process
//   * the parent kills the worker on a timeout, so a ReDoS payload cannot hang the app
//   * only extracted phone-number text is returned, never live objects
const { parentPort, workerData } = require('node:worker_threads');

function extractNumbers(text) {
  const out = [];
  const seen = new Set();
  for (const m of String(text).matchAll(/\d[\d\s\-()]{5,}\d/g)) {
    const d = m[0].replace(/\D/g, '');
    if (d.length >= 7 && d.length <= 15 && !seen.has(d)) { seen.add(d); out.push(d); }
  }
  return out;
}

try {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(workerData.filePath, { cellFormula: false, cellHTML: false });
  let text = '';
  for (const sheet of wb.SheetNames) {
    text += XLSX.utils.sheet_to_csv(wb.Sheets[sheet]) + '\n';
    if (text.length > 20 * 1024 * 1024) break; // don't build an unbounded string
  }
  parentPort.postMessage({ ok: true, numbers: extractNumbers(text) });
} catch (e) {
  parentPort.postMessage({ ok: false, err: String((e && e.message) || e) });
}
