import zlib from 'node:zlib';

/**
 * Minimal dependency-free PDF text extractor.
 * Walks raw `stream ... endstream` objects, inflates FlateDecode content,
 * then pulls strings out of Tj / TJ text operators. Works on digitally
 * generated PDFs (typical lab-report PDFs). Scanned images return ''.
 */
export function extractPdfText(buf) {
  try {
    const chunks = [];
    const latin = buf.toString('latin1');
    let idx = 0;
    while (true) {
      const s = latin.indexOf('stream', idx);
      if (s === -1) break;
      let start = s + 6;
      if (latin[start] === '\r') start++;
      if (latin[start] === '\n') start++;
      const e = latin.indexOf('endstream', start);
      if (e === -1) break;
      idx = e + 9;

      // trim trailing EOL before endstream
      let end = e;
      if (latin[end - 1] === '\n') end--;
      if (latin[end - 1] === '\r') end--;

      const slice = buf.subarray(start, end);
      let data = null;
      for (const fn of [zlib.inflateSync, zlib.inflateRawSync]) {
        try { data = fn(slice); break; } catch { /* not deflate */ }
      }
      if (data) chunks.push(data.toString('latin1'));
      else if (/BT[\s\S]*ET/.test(latin.slice(s, e + 9))) chunks.push(latin.slice(start, end));
    }
    let out = '';
    for (const c of chunks) out += textOps(c) + '\n';
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return '';
  }
}

function textOps(content) {
  // Only consider blocks inside BT..ET (text objects)
  let out = '';
  const btEt = content.match(/BT[\s\S]*?ET/g) || [];
  for (const block of btEt) {
    const tokens = block.match(/\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>/g) || [];
    for (const t of tokens) {
      if (t.startsWith('(')) {
        out += unescapePdf(t.slice(1, -1));
        out += ' ';
      } else {
        // hex string — decode byte pairs as latin1
        const hex = t.slice(1, -1).replace(/\s+/g, '');
        let str = '';
        for (let i = 0; i + 1 < hex.length; i += 2) str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        if (/[\x20-\x7E]/.test(str)) out += str + ' ';
      }
    }
    out += '\n';
  }
  return out;
}

function unescapePdf(s) {
  return s
    .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[c]))
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}
