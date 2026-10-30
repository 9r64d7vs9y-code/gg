/* 1.2.0-console.46 */
(() => {
'use strict';
const __yoinkModules = {
"family/reader/index.js": function (__require, __exports, document, window) {
'use strict';
const { LIMITS, ReaderLimitError, ReaderUnreadableError } = __require("./limits.js");
const { parseDelimited } = __require("./csv.js");
const { sheetRows } = __require("./sheet.js");
const { bytesToBinaryString, utf8Read } = __require("./text.js");
const { readXlsx } = __require("./xlsx.js");
const NOT_A_SPREADSHEET = 'This file type is not supported.';
const DBF_LEAD_BYTES = [2, 3, 48, 49, 131, 139, 140, 245];
function delimitedWorkbook(text) {
  const sheet = parseDelimited(text);
  return { sheetNames: ['Sheet1'], rows: name => (name === 'Sheet1' ? sheetRows(sheet) : []) };
}
function noSheets() {
  return { sheetNames: [], rows: () => [] };
}
function textWorkbook(text) {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 10 || code === 13 || code === 32) continue;
    if (code === 60) return noSheets();
    break;
  }
  return delimitedWorkbook(text);
}
function decodePlain(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return bytesToBinaryString(bytes);
  }
}
function plainText(bytes) {
  if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
    return delimitedWorkbook(utf8Read(bytesToBinaryString(bytes).slice(3)));
  }
  return delimitedWorkbook(decodePlain(bytes));
}
async function readWorkbook(input, options = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > LIMITS.maxInputBytes) throw new ReaderLimitError('File is too large.');
  const [b0, b1, b2, b3, b4, b5, b6, b7] = bytes;
  switch (b0) {
    case 208:
      if (b1 === 207 && b2 === 17 && b3 === 224 && b4 === 161 && b5 === 177 && b6 === 26 && b7 === 225) throw new Error(NOT_A_SPREADSHEET);
      break;
    case 9:
      if (b1 <= 8) throw new Error(NOT_A_SPREADSHEET);
      break;
    case 60:
      return noSheets();
    case 73:
      if (b1 === 73 && b2 === 42 && b3 === 0) throw new Error(NOT_A_SPREADSHEET);
      if (b1 === 68) return plainText(bytes);
      break;
    case 84:
      if (b1 === 65 && b2 === 66 && b3 === 76) throw new Error(NOT_A_SPREADSHEET);
      break;
    case 80: {
      if (b1 === 75 && b2 < 9 && b3 < 9) {
        const workbook = await readXlsx(bytes, options);
        const byName = new Map();
        workbook.sheetNames.forEach((name, index) => {
          try {
            const sheet = workbook.sheetAt(index);
            if (sheet) byName.set(name, sheet);
          } catch (error) {
            if (!(error instanceof ReaderUnreadableError)) throw error;
            byName.set(name, error);
          }
        });
        return {
          sheetNames: workbook.sheetNames,
          rows: name => {
            const sheet = byName.get(name);
            if (sheet instanceof ReaderUnreadableError) throw sheet;
            return sheetRows(sheet || null);
          },
        };
      }
      return plainText(bytes);
    }
    case 239:
      if (b3 === 60) throw new Error(NOT_A_SPREADSHEET);
      return plainText(bytes);
    case 255:
      if (b1 === 254) return textWorkbook(new TextDecoder('utf-16le').decode(bytes.subarray(2)));
      if (b1 === 0 && b2 === 2 && b3 === 0) throw new Error(NOT_A_SPREADSHEET);
      break;
    case 0:
      if (b1 === 0 && ((b2 >= 2 && b3 === 0) || (b2 === 0 && (b3 === 8 || b3 === 9)))) throw new Error(NOT_A_SPREADSHEET);
      break;
    case 3: case 131: case 139: case 140:
      throw new Error(NOT_A_SPREADSHEET);
    case 123:
      if (b1 === 92 && b2 === 114 && b3 === 116) throw new Error(NOT_A_SPREADSHEET);
      break;
    case 10: case 13: case 32:
      return textWorkbook(decodePlain(bytes));
    case 137:
      if (b1 === 80 && b2 === 78 && b3 === 71) throw new Error(NOT_A_SPREADSHEET);
      break;
    case 8:
      if (b1 === 231) throw new Error(NOT_A_SPREADSHEET);
      break;
    case 12:
      if (b1 === 236 || b1 === 237) throw new Error(NOT_A_SPREADSHEET);
      break;
    default:
      break;
  }
  if (DBF_LEAD_BYTES.includes(b0) && b2 <= 12 && b3 <= 31) throw new Error(NOT_A_SPREADSHEET);
  return plainText(bytes);
}
__exports.ReaderUnreadableError = ReaderUnreadableError;
__exports.readWorkbook = readWorkbook;
},
"family/reader/limits.js": function (__require, __exports, document, window) {
'use strict';
const LIMITS = {
  maxInputBytes: 64 * 1024 * 1024,
  maxZipEntries: 5000,
  maxEntryBytes: 256 * 1024 * 1024,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxCells: 5_000_000,
  maxRows: 1_048_576,
  maxColumns: 16_384,
  maxSheets: 256,
};
class ReaderLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReaderLimitError';
  }
}
class ReaderUnreadableError extends Error {
  constructor(message, sheetName = null) {
    super(message);
    this.name = 'ReaderUnreadableError';
    this.sheetName = sheetName;
  }
}
__exports.LIMITS = LIMITS;
__exports.ReaderLimitError = ReaderLimitError;
__exports.ReaderUnreadableError = ReaderUnreadableError;
},
"family/reader/zip.js": function (__require, __exports, document, window) {
'use strict';
const { LIMITS, ReaderLimitError } = __require("./limits.js");
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
function findEndOfCentralDirectory(view) {
  const minimum = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= minimum; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new Error('ZIP end of central directory not found.');
}
function decodeName(bytes, utf8) {
  if (utf8) return new TextDecoder('utf-8').decode(bytes);
  let name = '';
  for (const byte of bytes) name += String.fromCharCode(byte);
  return name;
}
function normalizeZipPath(path) {
  return String(path).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}
async function inflateRaw(data, expectedSize, DecompressionStreamImpl, budget) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStreamImpl('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > expectedSize || total > LIMITS.maxEntryBytes || !budget.take(value.byteLength)) {
      await reader.cancel();
      throw new ReaderLimitError('Workbook part is larger than declared or allowed.');
    }
    chunks.push(value);
  }
  if (total !== expectedSize) throw new Error('Workbook part size does not match its header.');
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.byteLength;
  }
  return out;
}
function readZip(bytes, { DecompressionStreamImpl = globalThis.DecompressionStream } = {}) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || centralDisk !== 0) throw new Error('Multi-disk ZIP archives are not supported.');
  if (entryCount === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported.');
  }
  if (entryCount > LIMITS.maxZipEntries) throw new ReaderLimitError('Workbook has too many parts.');
  if (centralOffset + centralSize > eocd) throw new Error('ZIP central directory is out of range.');
  let declaredTotal = 0;
  let consumed = 0;
  const budget = {
    take(size) {
      consumed += size;
      return consumed <= LIMITS.maxTotalUncompressedBytes;
    },
  };
  const entries = new Map();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error('ZIP central directory entry is invalid.');
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decodeName(bytes.subarray(offset + 46, offset + 46 + nameLength), (flags & 0x800) !== 0);
    offset += 46 + nameLength + extraLength + commentLength;
    if (flags & 0x1) throw new Error('Encrypted workbooks are not supported.');
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported.');
    }
    if (name.endsWith('/')) continue;
    if (size > LIMITS.maxEntryBytes) throw new ReaderLimitError('Workbook part is too large.');
    declaredTotal += size;
    if (declaredTotal > LIMITS.maxTotalUncompressedBytes) throw new ReaderLimitError('Workbook is too large when expanded.');
    const entry = { name, method, compressedSize, size, localOffset };
    entry.read = async () => {
      if (entry.cache) return entry.cache;
      if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
        throw new Error('ZIP local header is invalid.');
      }
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const end = start + compressedSize;
      if (end > bytes.byteLength) throw new Error('ZIP entry data is out of range.');
      const data = bytes.subarray(start, end);
      if (method === 0) {
        if (compressedSize !== size) throw new Error('Stored ZIP entry size mismatch.');
        if (!budget.take(size)) throw new ReaderLimitError('Workbook is too large when expanded.');
        entry.cache = data;
      } else if (method === 8) {
        if (!DecompressionStreamImpl) throw new Error('This browser cannot decompress workbooks.');
        entry.cache = await inflateRaw(data, size, DecompressionStreamImpl, budget);
      } else {
        throw new Error(`Unsupported ZIP compression method ${method}.`);
      }
      return entry.cache;
    };
    entries.set(normalizeZipPath(name), entry);
  }
  return entries;
}
__exports.normalizeZipPath = normalizeZipPath;
__exports.readZip = readZip;
},
"family/reader/text.js": function (__require, __exports, document, window) {
'use strict';
function bytesToBinaryString(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(index, Math.min(bytes.length, index + chunk)));
  }
  return out;
}
function utf8Read(binary) {
  let out = '';
  let index = 0;
  while (index < binary.length) {
    const first = binary.charCodeAt(index++);
    if (first < 128) {
      out += String.fromCharCode(first);
      continue;
    }
    const second = binary.charCodeAt(index++);
    if (first > 191 && first < 224) {
      out += String.fromCharCode(((first & 31) << 6) | (second & 63));
      continue;
    }
    const third = binary.charCodeAt(index++);
    if (first < 240) {
      out += String.fromCharCode(((first & 15) << 12) | ((second & 63) << 6) | (third & 63));
      continue;
    }
    const fourth = binary.charCodeAt(index++);
    const code = (((first & 7) << 18) | ((second & 63) << 12) | ((third & 63) << 6) | (fourth & 63)) - 65536;
    out += String.fromCharCode(55296 + ((code >>> 10) & 1023));
    out += String.fromCharCode(56320 + (code & 1023));
  }
  return out;
}
const XML_ENTITIES = { '&quot;': '"', '&apos;': "'", '&gt;': '>', '&lt;': '<', '&amp;': '&' };
function unescapeSegment(text) {
  return text
    .replace(/&(?:quot|apos|gt|lt|amp|#x?([\da-fA-F]+));/gi, (match, code) => XML_ENTITIES[match] || String.fromCharCode(parseInt(code, match.indexOf('x') > -1 ? 16 : 10)) || match)
    .replace(/_x([\da-fA-F]{4})_/gi, (match, code) => String.fromCharCode(parseInt(code, 16)));
}
function unescapeWithCdata(text) {
  const value = text + '';
  const start = value.indexOf('<![CDATA[');
  if (start === -1) return unescapeSegment(value);
  const end = value.indexOf(']]>');
  return unescapeWithCdata(value.slice(0, start)) + value.slice(start + 9, end) + unescapeWithCdata(value.slice(end + 3));
}
function unescapeXml(text, normalizeNewlines) {
  const out = unescapeWithCdata(text);
  return normalizeNewlines ? out.replace(/\r\n/g, '\n') : out;
}
function parseBool(value) {
  switch (value) {
    case 1: case true: case '1': case 'true': return true;
    case 0: case false: case '0': case 'false': return false;
    default: return false;
  }
}
const ATTRIBUTE = /\s([^"\s?>/]+)\s*=\s*((?:")([^"]*)(?:")|(?:')([^']*)(?:')|([^'">\s]+))/g;
function parseTag(tag, skipName) {
  const attributes = {};
  let position = 0;
  for (; position !== tag.length; ++position) {
    const code = tag.charCodeAt(position);
    if (code === 32 || code === 10 || code === 13) break;
  }
  if (!skipName) attributes[0] = tag.slice(0, position);
  if (position === tag.length) return attributes;
  const matches = tag.match(ATTRIBUTE);
  if (!matches) return attributes;
  for (const match of matches) {
    const body = match.slice(1);
    let equals = 0;
    for (; equals !== body.length; ++equals) if (body.charCodeAt(equals) === 61) break;
    let name = body.slice(0, equals).trim();
    while (body.charCodeAt(equals + 1) === 32) ++equals;
    const quoteCode = body.charCodeAt(equals + 1);
    const quoted = quoteCode === 34 || quoteCode === 39 ? 1 : 0;
    const value = body.slice(equals + 1 + quoted, body.length - quoted);
    let colon = 0;
    for (; colon !== name.length; ++colon) if (name.charCodeAt(colon) === 58) break;
    if (colon === name.length) {
      if (name.indexOf('_') > 0) name = name.slice(0, name.indexOf('_'));
      attributes[name] = value;
      attributes[name.toLowerCase()] = value;
    } else {
      const key = (colon === 5 && name.slice(0, 5) === 'xmlns' ? 'xmlns' : '') + name.slice(colon + 1);
      if (attributes[key] && name.slice(colon - 3, colon) === 'ext') continue;
      attributes[key] = value;
      attributes[key.toLowerCase()] = value;
    }
  }
  return attributes;
}
const TAG_PATTERN = /<[/?]?[a-zA-Z0-9:_-]+(?:\s+[^"\s?<>/]+\s*=\s*(?:"[^"]*"|'[^']*'|[^'"<>\s=]+))*\s*[/?]?>/gm;
function stripTagNamespace(tagName) {
  return tagName.replace(/<(\/?)\w+:/, '<$1');
}
const ELEMENT_CACHE = new Map();
function elementPatterns(name) {
  let patterns = ELEMENT_CACHE.get(name);
  if (!patterns) {
    patterns = [new RegExp(`<(?:\\w+:)?${name}\\b[^<>]*>`, 'g'), new RegExp(`</(?:\\w+:)?${name}>`, 'g')];
    ELEMENT_CACHE.set(name, patterns);
  }
  return patterns;
}
function matchElement(text, name) {
  const [open, close] = elementPatterns(name);
  open.lastIndex = 0;
  close.lastIndex = 0;
  const start = open.exec(text);
  if (!start) return null;
  const outerStart = start.index;
  const innerStart = open.lastIndex;
  close.lastIndex = open.lastIndex;
  const end = close.exec(text);
  if (!end) return null;
  return [text.slice(outerStart, close.lastIndex), text.slice(innerStart, end.index)];
}
function removeElements(text, name) {
  const [open, close] = elementPatterns(name);
  open.lastIndex = 0;
  close.lastIndex = 0;
  const pieces = [];
  let end = 0;
  let match;
  while ((match = open.exec(text))) {
    pieces.push(text.slice(end, match.index));
    end = match.index;
    close.lastIndex = open.lastIndex;
    match = close.exec(text);
    if (!match) return null;
    end = close.lastIndex;
    open.lastIndex = close.lastIndex;
  }
  pieces.push(text.slice(end));
  return pieces.join('');
}
__exports.bytesToBinaryString = bytesToBinaryString;
__exports.utf8Read = utf8Read;
__exports.unescapeXml = unescapeXml;
__exports.parseBool = parseBool;
__exports.parseTag = parseTag;
__exports.TAG_PATTERN = TAG_PATTERN;
__exports.stripTagNamespace = stripTagNamespace;
__exports.matchElement = matchElement;
__exports.removeElements = removeElements;
},
"family/reader/sheet.js": function (__require, __exports, document, window) {
'use strict';
const { LIMITS, ReaderLimitError } = __require("./limits.js");
const { formatValue, general } = __require("./number-format.js");
const ERROR_CODES = { '#NULL!': 0, '#DIV/0!': 7, '#VALUE!': 15, '#REF!': 23, '#NAME?': 29, '#NUM!': 36, '#N/A': 42, '#GETTING_DATA': 43, '#WTF?': 255 };
function encodeColumn(column) {
  let out = '';
  for (++column; column; column = Math.floor((column - 1) / 26)) out = String.fromCharCode(((column - 1) % 26) + 65) + out;
  return out;
}
function encodeCell(row, column) {
  return encodeColumn(column) + (row + 1);
}
function decodeRange(range) {
  const out = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
  let value = 0;
  let index = 0;
  let code = 0;
  const length = range.length;
  for (value = 0; index < length; ++index) {
    if ((code = range.charCodeAt(index) - 64) < 1 || code > 26) break;
    value = 26 * value + code;
  }
  out.s.c = --value;
  for (value = 0; index < length; ++index) {
    if ((code = range.charCodeAt(index) - 48) < 0 || code > 9) break;
    value = 10 * value + code;
  }
  out.s.r = --value;
  if (index === length || code !== 10) {
    out.e.c = out.s.c;
    out.e.r = out.s.r;
    return out;
  }
  ++index;
  for (value = 0; index !== length; ++index) {
    if ((code = range.charCodeAt(index) - 64) < 1 || code > 26) break;
    value = 26 * value + code;
  }
  out.e.c = --value;
  for (value = 0; index !== length; ++index) {
    if ((code = range.charCodeAt(index) - 48) < 0 || code > 9) break;
    value = 10 * value + code;
  }
  out.e.r = --value;
  return out;
}
function createSheet() {
  return { cells: new Map(), range: null, used: null };
}
function noteUsed(sheet, row, column) {
  const used = sheet.used;
  if (!used) {
    sheet.used = { s: { r: row, c: column }, e: { r: row, c: column } };
    return;
  }
  if (row < used.s.r) used.s.r = row;
  if (row > used.e.r) used.e.r = row;
  if (column < used.s.c) used.s.c = column;
  if (column > used.e.c) used.e.c = column;
}
function displayText(cell, value) {
  if (cell.w !== undefined) return cell.w;
  try {
    return formatValue(0, value);
  } catch {
    return '' + value;
  }
}
function sheetRows(sheet) {
  if (!sheet || !sheet.range) return [];
  const range = { s: { ...sheet.range.s }, e: { ...sheet.range.e } };
  const area = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
  if (area > LIMITS.maxCells) {
    if (!sheet.used) return [];
    range.s.r = Math.max(range.s.r, sheet.used.s.r);
    range.e.r = Math.min(range.e.r, sheet.used.e.r);
    range.e.c = Math.min(range.e.c, sheet.used.e.c);
    if ((range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1) > LIMITS.maxCells) {
      throw new ReaderLimitError('Worksheet has too many cells.');
    }
  }
  const columns = [];
  for (let column = range.s.c; column <= range.e.c; ++column) columns[column] = encodeColumn(column);
  const rows = [];
  for (let row = range.s.r; row <= range.e.r; ++row) {
    const out = [];
    let empty = true;
    const rowName = String(row + 1);
    for (let column = range.s.c; column <= range.e.c; ++column) {
      const index = column - range.s.c;
      const cell = sheet.cells.get(columns[column] + rowName);
      if (cell === undefined || cell.t === undefined) {
        out[index] = '';
        continue;
      }
      let value = cell.v;
      switch (cell.t) {
        case 'z':
          if (value == null) break;
          continue;
        case 'e':
          value = value == 0 ? null : undefined;
          break;
        default:
          break;
      }
      if (value == null) {
        out[index] = cell.t === 'e' && value === null ? null : '';
      } else {
        out[index] = displayText(cell, value);
        empty = false;
      }
    }
    if (!empty) rows.push(Object.defineProperty(out, 'sourceRow', { value: row + 1 }));
  }
  return rows;
}
__exports.general = general;
__exports.ERROR_CODES = ERROR_CODES;
__exports.encodeColumn = encodeColumn;
__exports.encodeCell = encodeCell;
__exports.decodeRange = decodeRange;
__exports.createSheet = createSheet;
__exports.noteUsed = noteUsed;
__exports.sheetRows = sheetRows;
},
"family/reader/csv.js": function (__require, __exports, document, window) {
'use strict';
const { LIMITS, ReaderLimitError } = __require("./limits.js");
const { createSheet, encodeCell, ERROR_CODES, noteUsed } = __require("./sheet.js");
const SEPARATORS = { 44: ',', 9: '\t', 59: ';', 124: '|' };
const SEPARATOR_WEIGHTS = { 44: 3, 9: 2, 59: 1, 124: 0 };
function guessSeparator(sample) {
  let counts = {};
  let inQuotes = false;
  for (let index = 0; index < sample.length; ++index) {
    const code = sample.charCodeAt(index);
    if (code === 34) inQuotes = !inQuotes;
    else if (!inQuotes && code in SEPARATORS) counts[code] = (counts[code] || 0) + 1;
  }
  let candidates = [];
  for (const key in counts) if (Object.prototype.hasOwnProperty.call(counts, key)) candidates.push([counts[key], key]);
  if (!candidates.length) {
    counts = SEPARATOR_WEIGHTS;
    for (const key in counts) if (Object.prototype.hasOwnProperty.call(counts, key)) candidates.push([counts[key], key]);
  }
  candidates.sort((a, b) => a[0] - b[0] || SEPARATOR_WEIGHTS[a[1]] - SEPARATOR_WEIGHTS[b[1]]);
  return SEPARATORS[candidates.pop()[1]] || 44;
}
function parseDelimited(input) {
  let text = input;
  let separator = '';
  const sheet = createSheet();
  const range = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
  if (text.slice(0, 4) === 'sep=') {
    if (text.charCodeAt(5) === 13 && text.charCodeAt(6) === 10) {
      separator = text.charAt(4);
      text = text.slice(7);
    } else if (text.charCodeAt(5) === 13 || text.charCodeAt(5) === 10) {
      separator = text.charAt(4);
      text = text.slice(6);
    } else {
      separator = guessSeparator(text.slice(0, 1024));
    }
  } else {
    separator = guessSeparator(text.slice(0, 1024));
  }
  let row = 0;
  let column = 0;
  let start = 0;
  let end = 0;
  const separatorCode = typeof separator === 'string' ? separator.charCodeAt(0) : separator;
  let inQuotes = false;
  let code = 0;
  let startCode = text.charCodeAt(0);
  let cellCount = 0;
  function finishCell() {
    let field = text.slice(start, end);
    if (field.slice(-1) === '\r') field = field.slice(0, -1);
    const cell = {};
    if (field.charAt(0) === '"' && field.charAt(field.length - 1) === '"') field = field.slice(1, -1).replace(/""/g, '"');
    cell.w = field;
    if (field.length === 0) cell.t = 'z';
    else if (field.charCodeAt(0) === 35 && ERROR_CODES[field] != null) {
      cell.t = 'e';
      cell.v = ERROR_CODES[field];
    } else {
      cell.t = 's';
      cell.v = field;
    }
    if (cell.t !== 'z') {
      if (++cellCount > LIMITS.maxCells) throw new ReaderLimitError('File has too many cells.');
      sheet.cells.set(encodeCell(row, column), cell);
      noteUsed(sheet, row, column);
    }
    start = end + 1;
    startCode = text.charCodeAt(start);
    if (range.e.c < column) range.e.c = column;
    if (range.e.r < row) range.e.r = row;
    if (code === separatorCode) ++column;
    else {
      column = 0;
      ++row;
    }
    if (column >= LIMITS.maxColumns || row > LIMITS.maxRows) throw new ReaderLimitError('File has too many rows or columns.');
  }
  for (; end < text.length; ++end) {
    switch ((code = text.charCodeAt(end))) {
      case 34:
        if (startCode === 34) inQuotes = !inQuotes;
        break;
      case 13:
        if (inQuotes) break;
        if (text.charCodeAt(end + 1) === 10) ++end;
        finishCell();
        break;
      case separatorCode:
      case 10:
        if (!inQuotes) finishCell();
        break;
      default:
        break;
    }
  }
  if (end - start > 0) finishCell();
  sheet.range = range;
  return sheet;
}
__exports.parseDelimited = parseDelimited;
},
"family/reader/xlsx.js": function (__require, __exports, document, window) {
'use strict';
const { LIMITS, ReaderLimitError, ReaderUnreadableError } = __require("./limits.js");
const { readZip, normalizeZipPath } = __require("./zip.js");
const { BUILTIN_FORMATS, IMPLICIT_FORMATS, formatValue, generalNumber, general } = __require("./number-format.js");
const { createSheet, decodeRange, encodeCell, ERROR_CODES, noteUsed } = __require("./sheet.js");
const { TAG_PATTERN, bytesToBinaryString, matchElement, parseBool, parseTag, removeElements, stripTagNamespace, unescapeXml, utf8Read } = __require("./text.js");
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const WORKBOOK_NAMESPACES = [
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://purl.oclc.org/ooxml/spreadsheetml/main',
  'http://schemas.microsoft.com/office/excel/2006/main',
  'http://schemas.microsoft.com/office/excel/2006/2',
];
const WORKBOOK_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  'application/vnd.ms-excel.sheet.macroEnabled.main+xml',
  'application/vnd.ms-excel.sheet.binary.macroEnabled.main',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml',
  'application/vnd.ms-excel.template.macroEnabled.main+xml',
  'application/vnd.ms-excel.addin.macroEnabled.main+xml',
]);
const SHARED_STRING_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml',
  'application/vnd.ms-excel.sharedStrings',
]);
const STYLE_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml',
  'application/vnd.ms-excel.styles',
]);
const WORKSHEET_RELATIONSHIPS = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/worksheet',
];
const OTHER_SHEET_RELATIONSHIPS = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/dialogsheet',
  'http://schemas.microsoft.com/office/2006/relationships/xlMacrosheet',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/chartsheet',
]);
const FORMAT_ALIASES = { 'd.m': 'd\\.m' };
class XlsxStoppedError extends Error {
  constructor() { super('Reading stopped.'); this.stale = true; }
}
function xlsxWork(options) {
  const isCurrent = options?.isCurrent ?? (() => true);
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now() : () => Date.now();
  let lastYield = now();
  let steps = 0;
  return () => {
    if (!isCurrent()) throw new XlsxStoppedError();
    if ((++steps & 255) !== 0 || now() - lastYield < 16) return null;
    return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
      lastYield = now();
      if (!isCurrent()) throw new XlsxStoppedError();
    });
  };
}
function stripLeadingSlash(path) {
  return String(path).replace(/^\//, '');
}
async function readPart(entries, path, work) {
  const pause = work(); if (pause) await pause;
  const entry = entries.get(normalizeZipPath(path));
  if (!entry) return null;
  const bytes = await entry.read();
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    const pause = work(); if (pause) await pause;
    text += bytesToBinaryString(bytes.subarray(at, at + 0x8000));
  }
  const done = work(); if (done) await done;
  return text;
}
function hasPart(entries, path) {
  return entries.has(normalizeZipPath(path));
}
async function checkXmlPart(xml, rootName, work) {
  if (typeof xml !== 'string') throw new Error('File part is missing.');
  const text = xml.replace(/^\xEF\xBB\xBF/, '');
  const tags = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?([A-Za-z_][\w:.-]*)(?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>/g;
  const stack = [];
  let rootSeen = false;
  let end = 0;
  let match;
  while ((match = tags.exec(text))) {
    const pause = work(); if (pause) await pause;
    const between = text.slice(end, match.index);
    if (between.includes('<') || (!stack.length && between.trim())) throw new Error('Broken XML.');
    end = tags.lastIndex;
    const [tag, name] = match;
    if (!name) continue;
    if (tag.startsWith('</')) {
      if (!/^<\/[\w:.-]+\s*>$/.test(tag) || stack.pop() !== name) throw new Error('Broken XML.');
    } else {
      if (!stack.length) {
        if (rootSeen || name.split(':').pop() !== rootName) throw new Error('Wrong XML part.');
        rootSeen = true;
      }
      if (!tag.endsWith('/>')) stack.push(name);
    }
  }
  if (!rootSeen || stack.length || text.slice(end).trim()) throw new Error('Incomplete XML.');
}
function parseContentTypes(xml) {
  const types = { workbooks: [], strs: [], styles: [], xmlns: '' };
  for (const tag of xml.match(TAG_PATTERN) || []) {
    const attributes = parseTag(tag);
    switch (stripTagNamespace(attributes[0])) {
      case '<Types':
        types.xmlns = attributes['xmlns' + (attributes[0].match(/<(\w+):/) || ['', ''])[1]];
        break;
      case '<Override':
        if (WORKBOOK_TYPES.has(attributes.ContentType)) types.workbooks.push(attributes.PartName);
        else if (SHARED_STRING_TYPES.has(attributes.ContentType)) types.strs.push(attributes.PartName);
        else if (STYLE_TYPES.has(attributes.ContentType)) types.styles.push(attributes.PartName);
        break;
      default:
        break;
    }
  }
  if (types.xmlns !== CONTENT_TYPES_NS) throw new Error('Unknown content types namespace.');
  return types;
}
async function parseWorkbook(xml, work) {
  await checkXmlPart(xml, 'workbook', work);
  const workbook = { sheets: [], date1904: false, xmlns: '' };
  let xmlnsKey = 'xmlns';
  for (const tag of xml.match(TAG_PATTERN) || []) {
    const attributes = parseTag(tag);
    switch (stripTagNamespace(attributes[0])) {
      case '<workbook':
        if (tag.match(/<\w+:workbook/)) xmlnsKey = 'xmlns' + tag.match(/<(\w+):/)[1];
        workbook.xmlns = attributes[xmlnsKey];
        break;
      case '<workbookPr':
      case '<workbookPr/>':
        if (attributes.date1904 != null) workbook.date1904 = parseBool(attributes.date1904);
        break;
      case '<sheet':
        workbook.sheets.push({ name: unescapeXml(utf8Read(attributes.name ?? '')), id: attributes.id });
        break;
      default:
        break;
    }
  }
  if (!WORKBOOK_NAMESPACES.includes(workbook.xmlns)) throw new Error('Unknown workbook namespace.');
  return workbook;
}
function parseRelationships(xml) {
  const byId = {};
  if (!xml) return byId;
  for (const tag of xml.match(TAG_PATTERN) || []) {
    const attributes = parseTag(tag);
    if (attributes[0] === '<Relationship') {
      byId[attributes.Id] = { type: attributes.Type, target: unescapeXml(attributes.Target) };
    }
  }
  return byId;
}
function parseStringItem(item) {
  if (!item) return { t: '' };
  if (item.match(/^\s*<(?:\w+:)?t[^>]*>/)) {
    return { t: unescapeXml(utf8Read(item.slice(item.indexOf('>') + 1).split(/<\/(?:\w+:)?t>/)[0] || ''), true) };
  }
  if (item.match(/<(?:\w+:)?r\b[^<>]*>/)) {
    const withoutPhonetic = removeElements(item, 'rPh');
    const runs = withoutPhonetic.match(/<(?:\w+:)?t\b[^<>]*>([^<]*)<\/(?:\w+:)?t>/g) || [];
    return { t: unescapeXml(utf8Read(runs.join('').replace(/<[^<>]*>/g, '')), true) };
  }
  return {};
}
async function parseSharedStrings(xml, work) {
  const strings = [];
  const sst = matchElement(xml, 'sst');
  if (!sst) return strings;
  const items = sst[1].replace(/<(?:\w+:)?(?:si|sstItem)>/g, '').split(/<\/(?:\w+:)?(?:si|sstItem)>/);
  for (const item of items) {
    const pause = work(); if (pause) await pause;
    strings.push(parseStringItem(item.trim()));
  }
  return strings;
}
function parseStyles(xml) {
  const styles = { numberFormats: null, cellFormats: [], table: { ...BUILTIN_FORMATS } };
  if (!xml) return styles;
  const text = xml.replace(/<!--([\s\S]*?)-->/gm, '').replace(/<!DOCTYPE[^[]*\[[^\]]*\]>/gm, '');
  const numFmts = matchElement(text, 'numFmts');
  if (numFmts) {
    styles.numberFormats = { ...BUILTIN_FORMATS };
    for (const tag of numFmts[0].match(TAG_PATTERN) || []) {
      const attributes = parseTag(tag);
      if (stripTagNamespace(attributes[0]) !== '<numFmt') continue;
      const code = unescapeXml(utf8Read(attributes.formatCode ?? ''));
      let id = parseInt(attributes.numFmtId, 10);
      styles.numberFormats[id] = code;
      if (id > 0) {
        if (id > 392) {
          for (id = 392; id > 60; --id) if (styles.numberFormats[id] == null) break;
          styles.numberFormats[id] = code;
        }
        styles.table[id] = FORMAT_ALIASES[code] || code;
      }
    }
  }
  const cellXfs = matchElement(text, 'cellXfs');
  if (cellXfs) {
    for (const tag of cellXfs[0].match(TAG_PATTERN) || []) {
      const attributes = parseTag(tag);
      switch (stripTagNamespace(attributes[0])) {
        case '<xf': case '<xf/>': case '<xf>': {
          const format = {};
          if (attributes.numFmtId) format.numFmtId = parseInt(attributes.numFmtId, 10);
          if (styles.numberFormats && format.numFmtId > 392) {
            for (let id = 392; id > 60; --id) {
              if (styles.numberFormats[format.numFmtId] == styles.numberFormats[id]) {
                format.numFmtId = id;
                break;
              }
            }
          }
          styles.cellFormats.push(format);
          break;
        }
        default:
          break;
      }
    }
  }
  return styles;
}
function setDisplayText(cell, formatId, styles, date1904) {
  if (cell.t === 'z') return;
  try {
    if (styles.table[formatId] == null) {
      const implicit = IMPLICIT_FORMATS[formatId] || 'General';
      styles.table[formatId] = FORMAT_ALIASES[implicit] || implicit;
    }
    if (cell.t === 'e') cell.w = cell.w || Object.keys(ERROR_CODES).find(key => ERROR_CODES[key] === cell.v);
    else if (formatId === 0) {
      if (cell.t === 'n') {
        cell.w = (cell.v | 0) === cell.v ? cell.v.toString(10) : generalNumber(cell.v);
      } else if (cell.v === undefined) {
        return;
      } else {
        cell.w = general(cell.v);
      }
    } else {
      cell.w = formatValue(formatId, cell.v, { table: styles.table, date1904 });
    }
  } catch {
  }
}
function parseIsoDate(text, date1904) {
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return NaN;
  let time = parsed.getTime();
  if (date1904) time -= 1462 * 86400000;
  return (time - Date.UTC(1899, 11, 30)) / 86400000;
}
async function parseSheetData(data, sheet, used, strings, styles, date1904, work) {
  const cellSplit = /<(?:\w+:)?c[ />]/;
  const referencePattern = /r=["']([^"']*)["']/;
  const arrayRefPattern = /ref=["']([^"']*)["']/;
  const rowEnd = /<\/(?:\w+:)?row>/g;
  const sharedFormulas = [];
  const arrayFormulas = [];
  let rowNumber = 0;
  let column = 0;
  let cellCount = 0;
  let at = 0;
  while (at <= data.length) {
    const pause = work(); if (pause) await pause;
    const match = rowEnd.exec(data);
    let chunk = data.slice(at, match ? match.index : data.length).trim();
    at = match ? rowEnd.lastIndex : data.length + 1;
    const length = chunk.length;
    if (length === 0) continue;
    let tagStart = 0;
    let position = 0;
    scan: for (position = 0; position < length; ++position) {
      switch (chunk[position]) {
        case '>':
          if (chunk[position - 1] !== '/') {
            ++position;
            break scan;
          }
          break;
        case '<':
          tagStart = position;
          break;
        default:
          break;
      }
    }
    if (tagStart >= position) break;
    const rowTag = parseTag(chunk.slice(tagStart, position), true);
    rowNumber = rowTag.r != null ? parseInt(rowTag.r, 10) : rowNumber + 1;
    column = -1;
    if (rowNumber > LIMITS.maxRows) throw new ReaderLimitError('Worksheet has too many rows.');
    if (used.s.r > rowNumber - 1) used.s.r = rowNumber - 1;
    if (used.e.r < rowNumber - 1) used.e.r = rowNumber - 1;
    let parts = chunk.slice(position).split(cellSplit);
    let skip = 0;
    for (; skip !== parts.length; ++skip) if (parts[skip].trim().charAt(0) !== '<') break;
    parts = parts.slice(skip);
    for (let partIndex = 0; partIndex !== parts.length; ++partIndex) {
      const pause = work(); if (pause) await pause;
      let part = parts[partIndex].trim();
      if (part.length === 0) continue;
      const reference = part.match(referencePattern);
      part = '<c ' + (part.slice(0, 1) === '<' ? '>' : '') + part;
      if (reference != null && reference.length === 2) {
        let index = 0;
        const letters = reference[1];
        for (let letter = 0; letter !== letters.length; ++letter) {
          const code = letters.charCodeAt(letter) - 64;
          if (code < 1 || code > 26) break;
          index = 26 * index + code;
        }
        column = index - 1;
      } else {
        ++column;
      }
      if (column >= LIMITS.maxColumns) throw new ReaderLimitError('Worksheet has too many columns.');
      let end = 0;
      for (; end !== part.length; ++end) if (part.charCodeAt(end) === 62) break;
      ++end;
      const cellTag = parseTag(part.slice(0, end), true);
      if (!cellTag.r) cellTag.r = encodeCell(rowNumber - 1, column);
      const body = part.slice(end);
      const cell = { t: '' };
      let match = matchElement(body, 'v');
      if (match != null && match[1] !== '') cell.v = unescapeXml(match[1]);
      let hasFormula = false;
      if ((match = matchElement(body, 'f')) != null) {
        if (match[1] === '') {
          if (match[0].indexOf('t="shared"') > -1) {
            const formulaTag = parseTag(match[0]);
            if (sharedFormulas[formulaTag.si]) hasFormula = true;
          }
        } else {
          hasFormula = true;
          if (match[0].indexOf('t="array"') > -1) {
            const ref = (body.match(arrayRefPattern) || [])[1];
            cell.arrayRef = ref;
            if (ref && ref.indexOf(':') > -1) arrayFormulas.push(decodeRange(ref));
          } else if (match[0].indexOf('t="shared"') > -1) {
            const formulaTag = parseTag(match[0]);
            sharedFormulas[parseInt(formulaTag.si, 10)] = true;
          }
        }
      } else if ((match = body.match(/<f[^<>]*\/>/))) {
        const formulaTag = parseTag(match[0]);
        if (sharedFormulas[formulaTag.si]) hasFormula = true;
      }
      const address = decodeRange(cellTag.r).s;
      for (const area of arrayFormulas) {
        if (address.r >= area.s.r && address.r <= area.e.r && address.c >= area.s.c && address.c <= area.e.c) hasFormula = true;
      }
      if (cellTag.t == null && cell.v === undefined) {
        if (hasFormula || cell.arrayRef) {
          cell.v = 0;
          cell.t = 'n';
        } else {
          continue;
        }
      } else {
        cell.t = cellTag.t || 'n';
      }
      if (used.s.c > column) used.s.c = column;
      if (used.e.c < column) used.e.c = column;
      switch (cell.t) {
        case 'n':
          if (cell.v == '' || cell.v == null) continue;
          cell.v = parseFloat(cell.v);
          break;
        case 's': {
          if (typeof cell.v === 'undefined') continue;
          const entry = strings[parseInt(cell.v, 10)];
          cell.v = entry.t;
          break;
        }
        case 'str':
          cell.t = 's';
          cell.v = cell.v != null ? unescapeXml(utf8Read(cell.v), true) : '';
          break;
        case 'inlineStr': {
          const inline = matchElement(body, 'is');
          cell.t = 's';
          const entry = inline != null ? parseStringItem(inline[1]) : null;
          cell.v = entry ? entry.t : '';
          break;
        }
        case 'b':
          cell.v = parseBool(cell.v);
          break;
        case 'd':
          cell.v = parseIsoDate(cell.v, date1904);
          cell.t = 'n';
          break;
        case 'e':
          cell.w = cell.v;
          cell.v = ERROR_CODES[cell.v];
          break;
        default:
          break;
      }
      let formatId = 0;
      if (cellTag.s !== undefined) {
        const format = styles.cellFormats[cellTag.s];
        if (format != null && format.numFmtId != null) formatId = format.numFmtId;
      }
      setDisplayText(cell, formatId, styles, date1904);
      delete cell.arrayRef;
      if (++cellCount > LIMITS.maxCells) throw new ReaderLimitError('Worksheet has too many cells.');
      sheet.cells.set(cellTag.r, cell);
      noteUsed(sheet, rowNumber - 1, column);
    }
  }
}
async function parseWorksheet(xml, strings, styles, date1904, work) {
  const sheet = createSheet();
  const used = { s: { r: 2000000, c: 2000000 }, e: { r: 0, c: 0 } };
  const sheetData = matchElement(xml, 'sheetData');
  const dimensionIndex = (xml.match(/<(?:\w*:)?dimension/) || { index: -1 }).index;
  if (dimensionIndex > 0) {
    const ref = xml.slice(dimensionIndex, dimensionIndex + 50).match(/"(\w*:\w*)"/);
    if (ref) {
      const range = decodeRange(ref[1]);
      if (range.s.r <= range.e.r && range.s.c <= range.e.c && range.s.r >= 0 && range.s.c >= 0) sheet.range = range;
    }
  }
  if (sheetData) await parseSheetData(sheetData[1], sheet, used, strings, styles, date1904, work);
  if (!sheet.range && used.e.c >= used.s.c && used.e.r >= used.s.r) sheet.range = used;
  return sheet;
}
async function readXlsx(bytes, options = {}) {
  const work = xlsxWork(options);
  const pause = work(); if (pause) await pause;
  const entries = readZip(bytes);
  if (!hasPart(entries, '[Content_Types].xml')) throw new Error('Unsupported ZIP file.');
  const types = parseContentTypes(await readPart(entries, '[Content_Types].xml', work));
  if (types.workbooks.length === 0 && hasPart(entries, 'xl/workbook.xml')) types.workbooks.push('xl/workbook.xml');
  if (types.workbooks.length === 0 || types.workbooks[0].slice(-3) === 'bin') {
    throw new Error('Binary or missing workbooks are not supported.');
  }
  let strings = [];
  if (types.strs.length) {
    try {
      const xml = await readPart(entries, stripLeadingSlash(types.strs[0]), work);
      await checkXmlPart(xml, 'sst', work);
      strings = await parseSharedStrings(xml, work);
    } catch (error) {
      if (error instanceof ReaderLimitError || error instanceof XlsxStoppedError) throw error;
      throw new ReaderUnreadableError("Couldn't read the text in this file.");
    }
  }
  let styles = parseStyles(null);
  if (types.styles.length) styles = parseStyles(await readPart(entries, stripLeadingSlash(types.styles[0]), work));
  const workbookPath = stripLeadingSlash(types.workbooks[0]);
  const workbookXml = await readPart(entries, workbookPath, work);
  if (!workbookXml) throw new Error('Could not find the workbook.');
  const workbook = await parseWorkbook(workbookXml, work);
  if (workbook.sheets.length > LIMITS.maxSheets) throw new ReaderLimitError('Workbook has too many sheets.');
  const slash = types.workbooks[0].lastIndexOf('/');
  let relsPath = (types.workbooks[0].slice(0, slash + 1) + '_rels/' + types.workbooks[0].slice(slash + 1) + '.rels').replace(/^\//, '');
  if (!hasPart(entries, relsPath)) relsPath = 'xl/_rels/workbook.xml.rels';
  const relationships = parseRelationships(await readPart(entries, relsPath, work));
  let sheetTargets = null;
  try {
    sheetTargets = workbook.sheets.map(sheet => [sheet.name, relationships[sheet.id].target, relationships[sheet.id].type]);
    if (!sheetTargets.length) sheetTargets = null;
  } catch {
    sheetTargets = null;
  }
  const bareSheet = hasPart(entries, 'xl/worksheets/sheet.xml') ? 1 : 0;
  const sheets = new Map();
  for (let index = 0; index !== workbook.sheets.length; ++index) {
    const pause = work(); if (pause) await pause;
    const name = workbook.sheets[index].name;
    let path;
    let type = 'sheet';
    if (sheetTargets && sheetTargets[index]) {
      path = 'xl/' + sheetTargets[index][1].replace(/[/]?xl\//, '');
      if (!hasPart(entries, path)) path = sheetTargets[index][1];
      if (!hasPart(entries, path)) path = relsPath.replace(/_rels\/[\S\s]*$/, '') + sheetTargets[index][1];
      const relationType = sheetTargets[index][2];
      if (WORKSHEET_RELATIONSHIPS.includes(relationType)) type = 'sheet';
      else if (OTHER_SHEET_RELATIONSHIPS.has(relationType)) type = 'other';
      else type = relationType && relationType.length ? 'unknown' : 'sheet';
    } else {
      path = ('xl/worksheets/sheet' + (index + 1 - bareSheet) + '.xml').replace(/sheet0\./, 'sheet.');
    }
    if (type !== 'sheet') continue;
    try {
      const xml = await readPart(entries, path, work);
      await checkXmlPart(xml, 'worksheet', work);
      sheets.set(index, await parseWorksheet(xml, strings, styles, workbook.date1904, work));
    } catch (error) {
      if (error instanceof ReaderLimitError || error instanceof XlsxStoppedError) throw error;
      sheets.set(index, new ReaderUnreadableError(`Couldn't read the sheet "${name}" in this file.`, name));
    }
  }
  const done = work(); if (done) await done;
  return {
    sheetNames: workbook.sheets.map(sheet => sheet.name),
    sheetAt: index => {
      const sheet = sheets.get(index);
      if (sheet instanceof ReaderUnreadableError) throw sheet;
      return sheet || null;
    },
  };
}
__exports.readXlsx = readXlsx;
},
"family/reader/number-format.js": function (__require, __exports, document, window) {
'use strict';
const BUILTIN_FORMATS = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00',
  12: '# ?/?', 13: '# ??/??', 14: 'm/d/yy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
  18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yy h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
  56: '"上午/下午 "hh"時"mm"分"ss"秒 "',
};
const IMPLICIT_FORMATS = {
  5: '"$"#,##0_);\\("$"#,##0\\)', 6: '"$"#,##0_);[Red]\\("$"#,##0\\)',
  7: '"$"#,##0.00_);\\("$"#,##0.00\\)', 8: '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)',
  23: 'General', 24: 'General', 25: 'General', 26: 'General',
  27: 'm/d/yy', 28: 'm/d/yy', 29: 'm/d/yy', 30: 'm/d/yy', 31: 'm/d/yy',
  32: 'h:mm:ss', 33: 'h:mm:ss', 34: 'h:mm:ss', 35: 'h:mm:ss', 36: 'm/d/yy',
  41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)', 42: '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"_);_(@_)',
  43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)', 44: '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)',
  50: 'm/d/yy', 51: 'm/d/yy', 52: 'm/d/yy', 53: 'm/d/yy', 54: 'm/d/yy', 55: 'm/d/yy', 56: 'm/d/yy', 57: 'm/d/yy', 58: 'm/d/yy',
  59: '0', 60: '0.00', 61: '#,##0', 62: '#,##0.00',
  63: '"$"#,##0_);\\("$"#,##0\\)', 64: '"$"#,##0_);[Red]\\("$"#,##0\\)',
  65: '"$"#,##0.00_);\\("$"#,##0.00\\)', 66: '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)',
  67: '0%', 68: '0.00%', 69: '# ?/?', 70: '# ??/??', 71: 'm/d/yy', 72: 'm/d/yy', 73: 'd-mmm-yy', 74: 'd-mmm',
  75: 'mmm-yy', 76: 'h:mm', 77: 'h:mm:ss', 78: 'm/d/yy h:mm', 79: 'mm:ss', 80: '[h]:mm:ss', 81: 'mmss.0',
};
const DEFAULT_MAP = {
  5: 37, 6: 38, 7: 39, 8: 40, 23: 0, 24: 0, 25: 0, 26: 0, 27: 14, 28: 14, 29: 14, 30: 14, 31: 14,
  50: 14, 51: 14, 52: 14, 53: 14, 54: 14, 55: 14, 56: 14, 57: 14, 58: 14, 59: 1, 60: 2, 61: 3, 62: 4,
  67: 9, 68: 10, 69: 12, 70: 13, 71: 14, 72: 14, 73: 15, 74: 16, 75: 17, 76: 20, 77: 21, 78: 22,
  79: 45, 80: 46, 81: 47, 82: 0,
};
const DAYS = [['Sun', 'Sunday'], ['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday']];
const MONTHS = [
  ['J', 'Jan', 'January'], ['F', 'Feb', 'February'], ['M', 'Mar', 'March'], ['A', 'Apr', 'April'],
  ['M', 'May', 'May'], ['J', 'Jun', 'June'], ['J', 'Jul', 'July'], ['A', 'Aug', 'August'],
  ['S', 'Sep', 'September'], ['O', 'Oct', 'October'], ['N', 'Nov', 'November'], ['D', 'Dec', 'December'],
];
const unsupported = format => new Error(`Unsupported number format |${format}|`);
const padZero = (value, width) => String(value).padStart(width, '0');
const isGeneral = (format, start = 0) => format.slice(start, start + 7).toLowerCase() === 'general';
const stripDecimal = text => (text.indexOf('.') === -1 ? text : text.replace(/(?:\.0*|(\.\d*[1-9])0+)$/, '$1'));
function normalizeExponent(text) {
  if (text.indexOf('E') === -1) return text;
  return text.replace(/(?:\.0*|(\.\d*[1-9])0+)[Ee]/, '$1E').replace(/(E[+-])(\d)$/, '$10$2');
}
function smallExponent(value) {
  const width = value < 0 ? 12 : 11;
  let out = stripDecimal(value.toFixed(12));
  if (out.length <= width) return out;
  out = value.toPrecision(10);
  if (out.length <= width) return out;
  return value.toExponential(5);
}
function largeExponent(value) {
  const out = stripDecimal(value.toFixed(11));
  return out.length > (value < 0 ? 12 : 11) || out === '0' || out === '-0' ? value.toPrecision(6) : out;
}
function generalNumber(value) {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? '#NUM!' : '#DIV/0!';
  const magnitude = Math.floor(Math.log(Math.abs(value)) * Math.LOG10E);
  let out;
  if (magnitude >= -4 && magnitude <= -1) out = value.toPrecision(10 + magnitude);
  else if (Math.abs(magnitude) <= 9) out = smallExponent(value);
  else if (magnitude === 10) out = value.toFixed(10).substr(0, 12);
  else out = largeExponent(value);
  return stripDecimal(normalizeExponent(out.toUpperCase()));
}
function general(value) {
  switch (typeof value) {
    case 'string': return value;
    case 'boolean': return value ? 'TRUE' : 'FALSE';
    case 'number': return (value | 0) === value ? value.toString(10) : generalNumber(value);
    case 'undefined': return '';
    case 'object': if (value == null) return ''; break;
    default: break;
  }
  throw new Error('Unsupported value in General format.');
}
function normalizePrecision(value) {
  const text = value.toPrecision(16);
  const cut = digits => (digits.indexOf('.') > -1
    ? digits.slice(0, digits.slice(0, 2) === '0.' ? 17 : 16)
    : digits.slice(0, 15) + '0'.repeat(Math.max(0, digits.length - 15)));
  const exponent = text.indexOf('e');
  return Number(exponent > -1 ? cut(text.slice(0, exponent)) + text.slice(exponent) : cut(text));
}
function parseDateCode(input, options) {
  if (input > 2958465 || input < 0) return null;
  const value = normalizePrecision(input);
  let date = value | 0;
  let time = Math.floor(86400 * (value - date));
  let dayOfWeek = 0;
  let parts = [];
  const out = { D: date, T: time, u: 86400 * (value - date) - time, y: 0, m: 0, d: 0, H: 0, M: 0, S: 0, q: 0 };
  if (Math.abs(out.u) < 1e-6) out.u = 0;
  if (options && options.date1904) date += 1462;
  if (out.u > 0.9999) {
    out.u = 0;
    if (++time === 86400) {
      out.T = time = 0;
      ++date;
      ++out.D;
    }
  }
  if (date === 60) {
    parts = [1900, 2, 29];
    dayOfWeek = 3;
  } else if (date === 0) {
    parts = [1900, 1, 0];
    dayOfWeek = 6;
  } else {
    if (date > 60) --date;
    const calendar = new Date(Date.UTC(1900, 0, 1));
    calendar.setUTCDate(calendar.getUTCDate() + date - 1);
    parts = [calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate()];
    dayOfWeek = calendar.getUTCDay();
    if (date < 60) dayOfWeek = (dayOfWeek + 6) % 7;
  }
  [out.y, out.m, out.d] = parts;
  out.S = time % 60;
  time = Math.floor(time / 60);
  out.M = time % 60;
  out.H = Math.floor(time / 60);
  out.q = dayOfWeek;
  return out;
}
function writeDatePart(code, token, date, subsecondDigits) {
  switch (code) {
    case 'y': return token.length <= 2 ? padZero(date.y % 100, 2) : padZero(date.y % 10000, 4);
    case 'e': return padZero(date.y, 1);
    case 'm':
      if (token.length <= 2) return padZero(date.m, token.length);
      return MONTHS[date.m - 1][token.length === 3 ? 1 : token.length === 5 ? 0 : 2];
    case 'd': return token.length <= 2 ? padZero(date.d, token.length) : DAYS[date.q][token.length === 3 ? 0 : 1];
    case 'h': case 'H': case 'M': {
      if (token.length > 2) throw new Error('Bad hour or minute format.');
      return padZero(code === 'h' ? 1 + ((date.H + 11) % 12) : code === 'H' ? date.H : date.M, token.length);
    }
    case 's': {
      if (!['s', 'ss', '.0', '.00', '.000'].includes(token)) throw new Error('Bad second format.');
      if (date.u === 0 && (token === 's' || token === 'ss')) return padZero(date.S, token.length);
      const scale = [1, 10, 100, 1000][subsecondDigits];
      let seconds = Math.round(scale * (date.S + date.u));
      if (seconds >= 60 * scale) seconds = 0;
      if (token === 's') return seconds === 0 ? '0' : '' + seconds / scale;
      const text = padZero(seconds, 2 + subsecondDigits);
      return token === 'ss' ? text.substr(0, 2) : '.' + text.substr(2, token.length - 1);
    }
    case 'Z': {
      const hours = date.D * 24 + date.H;
      const unit = token.charAt(1).toLowerCase();
      const value = unit === 'h' ? hours : unit === 'm' ? hours * 60 + date.M
        : (hours * 60 + date.M) * 60 + (subsecondDigits === 0 ? Math.round(date.S + date.u) : date.S);
      return padZero(value, token.length === 3 ? 1 : 2);
    }
    default: return '';
  }
}
const commaify = text => text.replace(/\B(?=(\d{3})+$)/g, ',');
const TWO_POW_32 = 2 ** 32;
const roundPad = (value, width) => (value > TWO_POW_32 || value < -TWO_POW_32 ? String(Math.round(value)).padStart(width, '0') : padZero(Math.round(value), width));
const roundText = (value, digits) => '' + Math.round(value * 10 ** digits) / 10 ** digits;
const decimalPart = (value, digits) => Math.round((value - Math.floor(value)) * 10 ** digits);
function writeNumber(pattern, value) {
  const percent = pattern.length - pattern.replace(/%/g, '').length;
  if (percent) return writeNumber(pattern.replace(/%/g, ''), value * 100 ** percent) + '%'.repeat(percent);
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const integer = (value | 0) === value;
  let match;
  if (pattern === '0') return roundPad(value, 0);
  if (/^00+$/.test(pattern)) return sign + roundPad(absolute, pattern.length);
  if (pattern === '#,##0') return sign + commaify(roundPad(absolute, 0));
  if ((match = /^#,##0\.(0+)$/.exec(pattern))) {
    const digits = match[1].length;
    if (integer) return sign + commaify('' + absolute) + '.' + '0'.repeat(digits);
    const carry = digits < ('' + decimalPart(absolute, digits)).length ? 1 : 0;
    return sign + commaify('' + (Math.floor(absolute) + carry)) + '.' + padZero(carry ? 0 : decimalPart(absolute, digits), digits);
  }
  if ((match = /^0\.(0+)$/.exec(pattern))) {
    const [whole, decimals = ''] = (integer ? '' + value : roundText(value, match[1].length)).split('.');
    return `${whole}.${decimals.padEnd(match[1].length, '0')}`;
  }
  throw unsupported(pattern);
}
function splitSections(format) {
  const sections = [];
  let inString = false;
  let start = 0;
  for (let index = 0; index < format.length; ++index) {
    const character = format.charAt(index);
    if (character === '"') inString = !inString;
    else if (!inString && '_*\\'.includes(character)) ++index;
    else if (!inString && character === ';') {
      sections.push(format.slice(start, index));
      start = index + 1;
    }
  }
  sections.push(format.slice(start));
  if (inString) throw new Error('Unterminated string in number format.');
  return sections;
}
function chooseSection(format, value) {
  let sections = splitSections(format);
  if (sections.length > 4 || /\[[=<>]/.test(format)) throw unsupported(format);
  let count = sections.length;
  const textAt = sections[count - 1].indexOf('@');
  if (count < 4 && textAt > -1) --count;
  if (typeof value !== 'number') return [4, sections.length === 4 || textAt > -1 ? sections[sections.length - 1] : '@'];
  if (!Number.isFinite(value)) value = 0;
  const [first, second = first, third = first] = sections;
  switch (sections.length) {
    case 1: sections = textAt > -1 ? ['General', 'General', 'General'] : [first, first, first]; break;
    case 2: sections = textAt > -1 ? [first, first, first] : [first, second, first]; break;
    case 3: sections = textAt > -1 ? [first, second, first] : [first, second, third]; break;
    default: break;
  }
  return [count, value > 0 ? sections[0] : value < 0 ? sections[1] : sections[2]];
}
const DATE_LETTERS = 'ymdhse';
const LITERALS = ",$-+/():!^&'~{}<>=€acfijklopqrtuvwxzP ";
function tokenize(section) {
  const tokens = [];
  let index = 0;
  const literal = v => tokens.push({ t: 't', v });
  while (index < section.length) {
    const character = section.charAt(index);
    const lower = character.toLowerCase();
    if (character === '"') {
      const end = section.indexOf('"', index + 1);
      literal(section.slice(index + 1, end < 0 ? section.length : end));
      index = end < 0 ? section.length : end + 1;
    } else if (character === '\\') {
      literal(section.charAt(index + 1));
      index += 2;
    } else if (character === '_') {
      literal(' ');
      index += 2;
    } else if (character === '*') {
      index += section.charAt(index + 1) === ' ' || section.charAt(index + 1) === '*' ? 2 : 1;
    } else if (character === '@') {
      tokens.push({ t: '@' });
      ++index;
    } else if (DATE_LETTERS.includes(lower)) {
      let text = lower;
      while (++index < section.length && section.charAt(index).toLowerCase() === lower) text += lower;
      tokens.push({ t: lower, v: text });
    } else if (section.substr(index, 5).toUpperCase() === 'AM/PM' || section.substr(index, 3).toUpperCase() === 'A/P') {
      const long = section.substr(index, 5).toUpperCase() === 'AM/PM';
      tokens.push({ t: 'ampm', v: long ? null : [character, section.charAt(index + 2)] });
      index += long ? 5 : 3;
    } else if (character === '[') {
      const end = section.indexOf(']', index);
      if (end < 0) throw new Error(`Unterminated "[" block in ${section}`);
      const block = section.slice(index, end + 1);
      index = end + 1;
      if (/^\[(h+|m+|s+)\]$/i.test(block)) tokens.push({ t: 'Z', v: block.toLowerCase() });
      else if (block.indexOf('$') > -1 && !/^\[\$-[0-9A-Za-z-]+\]$/.test(block)) throw unsupported(section);
      else if (block.indexOf('$') > -1) tokens.push({ t: 'locale' });
    } else if (character === '.' && tokens.some(token => DATE_LETTERS.includes(token.t) || ['Z', 'ampm'].includes(token.t))) {
      let text = '.';
      while (section.charAt(++index) === '0') text += '0';
      tokens.push({ t: 'fraction', v: text });
    } else if ('0#.'.includes(character)) {
      let text = character;
      while (++index < section.length && '0#?.,E+-%'.includes(section.charAt(index))) text += section.charAt(index);
      tokens.push({ t: 'n', v: text });
    } else if (LITERALS.includes(character) || character === 'A' || character === 'a') {
      literal(character);
      ++index;
    } else {
      throw unsupported(section);
    }
  }
  return tokens;
}
function formatDate(tokens, value, options) {
  if (value < 0) return '';
  const date = parseDateCode(value, options);
  if (date == null) return '';
  const twelveHour = tokens.some(token => token.t === 'ampm');
  const afternoon = date.H >= 12;
  let last = '';
  for (const token of tokens) {
    if (token.t === 'm' && last === 'h') token.t = 'M';
    if (DATE_LETTERS.includes(token.t) || token.t === 'M') last = token.t;
    else if (token.t === 'Z') last = token.v.charAt(1);
    else if (token.t === 'ampm') last = 'a';
  }
  last = '';
  for (let index = tokens.length - 1; index >= 0; --index) {
    const token = tokens[index];
    if (token.t === 'm' && last === 's') token.t = 'M';
    if ('ydhse'.includes(token.t) || token.t === 'M') last = token.t;
  }
  const fraction = tokens.find(token => token.t === 'fraction');
  const subsecondDigits = fraction ? Math.min(3, fraction.v.length - 1) : 0;
  const showsTime = tokens.some(token => ['h', 'M', 's', 'Z'].includes(token.t));
  if (fraction) {
    date.u = Math.round(date.u * 10 ** subsecondDigits) / 10 ** subsecondDigits;
    if (date.u >= 1) { date.u = 0; ++date.S; }
  } else if (showsTime && date.u >= 0.5) {
    date.u = 0;
    ++date.S;
  }
  if (showsTime || fraction) {
    if (date.S >= 60) { date.S = 0; ++date.M; }
    if (date.M >= 60) { date.M = 0; ++date.H; }
    if (date.H >= 24) {
      const next = parseDateCode(date.D + 1);
      Object.assign(next, { u: date.u, S: date.S, M: date.M, H: 0 });
      Object.assign(date, next);
    }
  }
  return tokens.map(token => {
    switch (token.t) {
      case 't': return token.v;
      case 'locale': return '';
      case 'ampm': return token.v ? token.v[afternoon ? 1 : 0] : afternoon ? 'PM' : 'AM';
      case 'fraction': return writeDatePart('s', token.v, date, subsecondDigits);
      case 'h': return writeDatePart(twelveHour ? 'h' : 'H', token.v, date, subsecondDigits);
      case '@': case 'n': throw unsupported(token.v);
      default: return writeDatePart(token.t, token.v, date, subsecondDigits);
    }
  }).join('');
}
function evaluate(section, value, options, sectionCount) {
  const tokens = tokenize(section);
  if (typeof value !== 'number') {
    if (tokens.some(token => !['t', '@'].includes(token.t))) throw unsupported(section);
    return tokens.map(token => (token.t === '@' ? value : token.v)).join('');
  }
  if (tokens.some(token => DATE_LETTERS.includes(token.t) || ['Z', 'ampm', 'fraction'].includes(token.t))) return formatDate(tokens, value, options);
  if (tokens.some(token => token.t === '@' || token.t === 'locale')) throw unsupported(section);
  const numbers = tokens.filter(token => token.t === 'n');
  if (numbers.length > 1) throw unsupported(section);
  if (numbers.length) {
    const working = value < 0 && sectionCount > 1 ? -value : value;
    let written = writeNumber(numbers[0].v, working);
    if (working < 0 && tokens[0].t === 't') {
      written = written.slice(1);
      tokens[0].v = '-' + tokens[0].v;
    }
    numbers[0].v = written;
  }
  return tokens.map(token => token.v).join('');
}
function formatValue(format, value, options = {}) {
  let resolved = format;
  if (typeof format === 'number') {
    const table = options.table || BUILTIN_FORMATS;
    resolved = table[format] ?? table[DEFAULT_MAP[format]] ?? IMPLICIT_FORMATS[format] ?? 'General';
  }
  if (isGeneral(resolved)) return general(value);
  const [sectionCount, section] = chooseSection(resolved, value);
  if (isGeneral(section)) return general(value);
  let working = value;
  if (working === true) working = 'TRUE';
  else if (working === false) working = 'FALSE';
  else if (working === '' || working == null) return '';
  else if (Number.isNaN(Number(working)) && section.indexOf('0') > -1) return '#NUM!';
  else if (!Number.isFinite(Number(working)) && section.indexOf('0') > -1) return '#DIV/0!';
  return evaluate(section, working, options, sectionCount);
}
__exports.BUILTIN_FORMATS = BUILTIN_FORMATS;
__exports.IMPLICIT_FORMATS = IMPLICIT_FORMATS;
__exports.generalNumber = generalNumber;
__exports.general = general;
__exports.parseDateCode = parseDateCode;
__exports.formatValue = formatValue;
},
"family/text.js": function (__require, __exports, document, window) {
'use strict';
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeOnce(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, token) => {
    const lower = token.toLowerCase();
    try {
      if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
      if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    } catch {
      return match;
    }
    return ENTITIES[lower] ?? match;
  });
}
function decodeFully(value) {
  let text = String(value ?? '');
  for (let round = 0; round < 3; round++) {
    const next = decodeOnce(text);
    if (next === text) break;
    text = next;
  }
  return text;
}
__exports.decodeFully = decodeFully;
},
"family/email.js": function (__require, __exports, document, window) {
'use strict';
const { decodeFully } = __require("./text.js");
const INVISIBLE = /[\s\p{Cf}]+/gu;
const ADDRESS = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/;
const FULL_ADDRESS = new RegExp(`^(?:${ADDRESS.source})$`);
const DATE_IN_FRONT = /^((?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])-\d{4})_/;
function cleanEmail(value) {
  const text = decodeFully(value).replace(INVISIBLE, '').toLowerCase();
  return (text.match(ADDRESS) || [text])[0];
}
function emailDate(value) {
  const email = cleanEmail(value);
  const found = email.match(DATE_IN_FRONT);
  return found && FULL_ADDRESS.test(email.slice(found[0].length)) ? found[1] : '';
}
function plainEmail(value) {
  const email = cleanEmail(value);
  const date = emailDate(email);
  return date ? email.slice(date.length + 1) : email;
}
function emailIndex(records, getEmail = record => record) {
  const exact = new Map();
  const plain = new Map();
  const add = (map, key, record) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  };
  for (const record of records) {
    const email = cleanEmail(getEmail(record));
    if (!email) continue;
    add(exact, email, record);
    if (emailDate(email)) add(plain, plainEmail(email), record);
  }
  return { exact, plain };
}
function findByEmail(given, records, getEmail) {
  const email = cleanEmail(given);
  if (!email) return found([], 'exact');
  const index = Array.isArray(records) ? emailIndex(records, getEmail) : records;
  const exact = index.exact.get(email) || [];
  const date = emailDate(email);
  if (date) {
    const plain = index.exact.get(plainEmail(email)) || [];
    return plain.length ? found(plain, 'plain') : found(exact, 'exact');
  }
  if (exact.length) return found(exact, 'exact');
  const other = index.plain.get(email) || [];
  return other.length ? found(other, 'dated') : found([], 'exact');
}
const found = (candidates, form) => ({
  match: candidates.length === 1 ? candidates[0] : null,
  form,
  unclear: candidates.length > 1,
  count: candidates.length,
});
__exports.cleanEmail = cleanEmail;
__exports.emailDate = emailDate;
__exports.plainEmail = plainEmail;
__exports.emailIndex = emailIndex;
__exports.findByEmail = findByEmail;
},
"family/report-window.js": function (__require, __exports, document, window) {
'use strict';
const DAY = 86400000;
const toUtc = day => Date.UTC(day.y, day.m - 1, day.d);
const fromUtc = ms => {
  const date = new Date(ms);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
};
const addDays = (day, count) => fromUtc(toUtc(day) + count * DAY);
const pad = number => String(number).padStart(2, '0');
const todayOf = (now = new Date()) => ({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
function reportWindow(today) {
  const back = addDays(today, -14);
  const start = addDays(back, -((new Date(toUtc(back)).getUTCDay() + 6) % 7));
  return { start, end: addDays(start, 361) };
}
const usDate = day => `${pad(day.m)}/${pad(day.d)}/${day.y}`;
__exports.todayOf = todayOf;
__exports.reportWindow = reportWindow;
__exports.usDate = usDate;
},
"family/look.js": function (__require, __exports, document, window) {
'use strict';
const COLOURS = {
  green: '#A9C77D',
  blue: '#86B8C8',
  amber: '#C9AA68',
  red: '#C97972',
  grey: '#3A3A3A',
  lavender: '#A58ECC',
  page: '#151515',
  surface: '#1C1C1C',
  header: '#1B1B1B',
  divider: '#242424',
  text: '#EEEEEE',
  muted: '#A8A8A8',
  greenText: '#BCD99B',
  selection: '#C6D9A8',
  redText: '#D98982',
};
const SIGNS = {
  problem: '✗',
  check: '⚠',
  fine: '✓',
  wait: '⏳',
  back: '↩',
  becomes: '→',
};
__exports.COLOURS = COLOURS;
__exports.SIGNS = SIGNS;
}
};
function __yoinkCreateModuleSystem(env) {
  const cache = new Map();
  function resolveSpecifier(parent, specifier) {
    if (!specifier.startsWith('.')) return specifier;
    const parts = parent.split('/').slice(0, -1);
    for (const part of specifier.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return parts.join('/');
  }
  function load(id) {
    if (cache.has(id)) return cache.get(id);
    const factory = __yoinkModules[id];
    if (!factory) throw new Error('Yoink module not found: ' + id);
    const exports = {};
    cache.set(id, exports);
    factory(specifier => load(resolveSpecifier(id, specifier)), exports, env.document, env.window);
    return exports;
  }
  return load;
}
const __yoinkLoad = __yoinkCreateModuleSystem({ document, window });
const { readWorkbook: __yoinkReadWorkbook } = __yoinkLoad('family/reader/index.js');
const { cleanEmail, emailDate, plainEmail, findByEmail } = __yoinkLoad('family/email.js');
const { reportWindow, todayOf, usDate } = __yoinkLoad('family/report-window.js');
const { COLOURS } = __yoinkLoad('family/look.js');
void (async () => {
  const VERSION = '1.2.0-console.46';
  const TOOL_KEY = '__yoinkTool';
  if (window[TOOL_KEY]?.active || document.getElementById('bp-panel')) {
    alert('Yoink is already running. Close the existing panel before running it again.');
    return;
  }
  const tool = { active: true, cleanups: [] };
  window[TOOL_KEY] = tool;
  const on = (target, event, handler, options) => {
    target.addEventListener(event, handler, options);
    const remove = () => target.removeEventListener(event, handler, options);
    tool.cleanups.push(remove);
    return remove;
  };
  const T = {
    settle: 150,
    gap: 60,
    poll: 50,
    chip: 1200,
    wait: 4500,
    confirm: 400,
    nav: 8000,
    stallCheck: 2000,
  };
  const MAX_LOOKUP_PAGES = 20;
  const EMAIL_RE = /(?:[a-zA-Z0-9._%+-]\p{Cf}*)+@\p{Cf}*(?:[a-zA-Z0-9.-]\p{Cf}*)+\.(?:\p{Cf}*[a-zA-Z]){2,}\p{Cf}*/gu;
  const APPROVED_ORIGIN = '';
  const APPROVED_PATH = '/Maintenance/StaffSearch';
  const FIELD_SELECTOR = '#GroupSearchCriteria_field_103';
  const EMPID_SELECTOR = '#GroupSearchCriteria_field_41';
  const SESSION_EXPIRED_SELECTOR = '.session-expired-modal';
  const CONSULTING_REPORT_PAGE = {
    path: '/Reports/ScheduledHoursReport_Staff',
    labels: { start: 'Start Week', end: 'End Week', period: 'Report Period', business: 'Professional Business',
      practice: 'Practice', area: 'Business Area', advanced: 'Advanced', email: 'Professional' },
    columns: { start: 'START_DATE', end: 'END_DATE' },
    label: 'label', column: 'div.dynamic-field-column', select: 'select',
    date: 'input:not([type=hidden]):not([type=search])',
    excluded: '.modal, template, #bp-panel', group: 'div.dynamic-form-group[data-group-name="Advanced"]',
    collapse: 'div.collapse', toggle: '[data-bs-target], [href], [aria-controls]',
    searchAgain: 'Search Again', searchAgainAction: 'a.js-search-again, button[data-action="search-again"]',
    searchAgainControl: 'a, button, [role=button]', form: '.grid-search',
    searchInput: '.select2-search__field',
    row: 'li.select2-results__option', list: '.select2-results__options',
    period: 'Day', business: 'Consulting Services',
    advanced: true, singles: ['period', 'business'], all: ['practice', 'area'],
  };
  const REPORT_PAGES = {
    consulting: CONSULTING_REPORT_PAGE,
    tax: {
      ...CONSULTING_REPORT_PAGE,
      path: '/Reports/StaffScheduledHoursReport',
      labels: { start: 'Start Week', end: 'End Week', period: 'Report Period', email: 'Name' },
      columns: { ...CONSULTING_REPORT_PAGE.columns, period: 'REPORT_PERIOD' },
      column: 'div.dynamic-field-column, div.dynamic-field-container',
      advanced: false, singles: ['period'], all: [],
    },
  };
  const REPORT_PAGE = Object.values(REPORT_PAGES).find(page => page.path === location.pathname) || REPORT_PAGES.consulting;
  const PALETTE = {
    green: COLOURS.green, greenDk: '#8FAE66', bright: COLOURS.selection,
    blue: COLOURS.blue, gray: COLOURS.grey.toLowerCase(), red: COLOURS.red, amber: COLOURS.amber, lavender: COLOURS.lavender,
    greenText: COLOURS.greenText, redText: COLOURS.redText, ink: COLOURS.page, muted: COLOURS.muted, subtle: '#969696',
  };
  const BTN_BASE = 'padding:8px 10px;border:0;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;';
  const BTN_CTRL = 'bp-ctrl';
  const SUBTEXT = `font-size:11px;color:${PALETTE.muted};margin:6px 0 0;line-height:1.4;`;
  const SURFACE = '#1c1c1c';
  const DISCLOSURE = 'width:100%;margin-top:8px;padding:0;border:0;background:none;text-align:left;' +
    `font:inherit;font-size:12px;line-height:1.5;color:${PALETTE.muted};cursor:pointer;user-select:none;`;
  const TEXTAREA = `width:100%;box-sizing:border-box;background:${SURFACE};color:#eeeeee;border:1px solid #242424;` +
    `border-radius:8px;padding:8px 10px;font-family:monospace;font-size:11px;line-height:1.5;resize:vertical;outline:none;`;
  let panel, shield, style;
  const runMoves = {
    idle: ['setup', 'adding', 'cancelling', 'recovery', 'closed'],
    setup: ['adding', 'paused', 'idle', 'recovery', 'closed'],
    adding: ['idle', 'paused', 'cancelling', 'recovery', 'closed'],
    paused: ['setup', 'adding', 'cancelling', 'recovery', 'closed'],
    cancelling: ['idle', 'recovery', 'closed'],
    recovery: ['closed'], closed: [],
  };
  const runState = { phase: 'idle', generation: 0, operation: null,
    resumePhase: null, causes: new Set(), settlements: new Set(), interaction: null, reason: '' };
  const moveRun = phase => {
    if (phase === runState.phase || !runMoves[runState.phase].includes(phase)) return false;
    runState.phase = phase;
    if (phase === 'closed') runState.generation++;
    return true;
  };
  const runPaused = () => runState.phase === 'paused';
  const recovering = () => runState.phase === 'recovery';
  const runStopped = () => ['cancelling', 'recovery', 'closed'].includes(runState.phase);
  const hasSettlement = kind => [...runState.settlements].some(work => work.kind === kind);
  const holdSettlement = kind => {
    const work = { kind };
    runState.settlements.add(work);
    return () => runState.settlements.delete(work);
  };
  const beginRun = (phase, kind) => {
    if (runState.phase !== 'idle' || !moveRun(phase)) return false;
    runState.generation++;
    runState.operation = { kind };
    return true;
  };
  const finishRun = () => {
    if (['setup', 'adding', 'cancelling'].includes(runState.phase)) moveRun('idle');
  };
  const pagePermission = policy => {
    const phase = runState.phase;
    if (policy === 'dropdown-close' && phase === 'closed') return hasSettlement('lookup');
    if (phase === 'closed') return false;
    if (policy === 'settlement') return true;
    if (policy === 'cleanup' || policy === 'dropdown-close') return phase !== 'recovery' || runState.settlements.size > 0;
    if (policy === 'wait') return !runStopped();
    if (policy === 'remove') return phase === 'cancelling';
    return phase === 'setup' || phase === 'adding';
  };
  let cancelFileInteraction = null, cancelOpenModal = null, recoveryTask = null;
  const focusBeforeYoink = document.activeElement;
  const dropTargets = new Set();
  let dropCueTimer = 0;
  const clearDropTargets = (keep = null) => {
    clearTimeout(dropCueTimer);
    dropCueTimer = 0;
    let cleared = false;
    dropTargets.forEach((node) => {
      if (node !== keep && node.classList.contains('bp-drop-target')) {
        node.classList.remove('bp-drop-target');
        cleared = true;
      }
    });
    return cleared;
  };
  const lightDropTarget = (node) => {
    clearDropTargets(node);
    if (!node) return;
    dropTargets.add(node);
    node.classList.add('bp-drop-target');
    dropCueTimer = setTimeout(() => clearDropTargets(), 700);
  };
  const cancelPendingFileInteraction = () => {
    const cancel = cancelFileInteraction;
    cancelFileInteraction = null;
    try { cancel?.(); } catch {   }
  };
  let inputNotice = '', fileNotice = '';
  let lastProgressAt = Date.now();
  const active = () => tool.active && runState.phase !== 'closed';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (v) => String(v ?? '').toLowerCase().trim();
  const uniq = (list) => [...new Set(list)];
  const sortUniq = (list) => uniq(list).sort();
  const fmt = (ms) => {
    if (ms == null || ms < 0) return '—';
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  };
  const emailsIn = (text) => (String(text ?? '').match(EMAIL_RE) || []).map(cleanEmail);
  const wholeEmail = (value) => {
    const text = norm(value).replace(/\p{Cf}/gu, '');
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(text) ? cleanEmail(text) : null;
  };
  const splitEmail = (email) => {
    const value = String(email ?? '');
    const address = wholeEmail(value);
    return address ? { plain: plainEmail(address), date: emailDate(address) || null } : { plain: value, date: null };
  };
  const emailKey = (term) => {
    const text = String(term ?? '').trim();
    const address = wholeEmail(text);
    return address ? plainEmail(address) : text;
  };
  const ID_RE = /^(?:\d{8}|\d{8}1)$/;
  const isId = (term) => /^\d+$/.test(String(term ?? '').trim());
  const LOCAL_CHAR = /[A-Za-z0-9._%+\-\p{Cf}]/u, DOMAIN_CHAR = /[A-Za-z0-9.\-\p{Cf}]/u;
  const { decodeFully } = __yoinkLoad('family/text.js');
  const decodeInput = (text) => decodeFully(text).replace(/&commat;/gi, '@');
  const takenEmail = (text) => {
    const value = Array.from(decodeInput(text));
    if (value.join('').includes('&#')) return '';
    const at = value.indexOf('@');
    if (at < 0 || value.indexOf('@', at + 1) >= 0) return '';
    let start = at, end = at + 1;
    while (start > 0 && LOCAL_CHAR.test(value[start - 1])) start--;
    while (end < value.length && DOMAIN_CHAR.test(value[end])) end++;
    while (end > at + 1 && /[.\-\p{Cf}]/u.test(value[end - 1])) end--;
    const email = wholeEmail(value.slice(start, end).join(''));
    if (!email) return '';
    let before = start;
    while (before > 0 && /[\s\p{Cf}]/u.test(value[before - 1])) before--;
    if (before < start && before > 0 && LOCAL_CHAR.test(value[before - 1])) return '';
    if (/email\s*id\s*:\s*$/i.test(value.slice(0, start).join(''))) return email;
    if (/\d/.test(value.slice(0, start).join('')) || /\d/.test(value.slice(end).join(''))) return '';
    return email;
  };
  const takenId = (text) => {
    const runs = String(text ?? '').match(/\d+/g) || [];
    return runs.length === 1 ? runs[0] : '';
  };
  const DIGIT_ENTITY_NAMES = new Set([
    'blk12', 'blk14', 'blk34', 'emsp13', 'emsp14', 'frac12', 'frac13', 'frac14',
    'frac15', 'frac16', 'frac18', 'frac23', 'frac25', 'frac34', 'frac35', 'frac38',
    'frac45', 'frac56', 'frac58', 'frac78', 'sup1', 'sup2', 'sup3', 'there4',
  ]);
  const entityDigits = (raw) => {
    for (let at = raw.indexOf('&'); at >= 0; at = raw.indexOf('&', at + 1)) {
      let i = at + 1;
      while (raw.slice(i, i + 4).toLowerCase() === 'amp;') i += 4;
      let numeric = i;
      while (raw.slice(numeric, numeric + 3).toLowerCase() === 'amp') numeric += raw[numeric + 3] === ';' ? 4 : 3;
      if (raw[numeric] === '#') return true;
      let j = i, digit = false;
      for (; j < raw.length && /[a-z0-9]/i.test(raw[j]); j++) if (/\d/.test(raw[j])) digit = true;
      if (digit && (raw[j] === ';' || DIGIT_ENTITY_NAMES.has(raw.slice(i, j)))) return true;
    }
    return false;
  };
  const takeValue = (text) => {
    const raw = String(text ?? ''), value = decodeInput(raw);
    if (value.includes('@')) return takenEmail(raw);
    if (entityDigits(raw)) return '';
    return reportMode ? '' : takenId(value);
  };
  const inputEmails = (text) => {
    const value = String(text ?? '');
    if (!value.includes('@') && !value.includes('&')) return [];
    const email = takeValue(value);
    return email && !isId(email) ? [email] : [];
  };
  const lookupTerm = (term) => {
    const value = takeValue(term);
    return Boolean(value) && value === (isId(term) ? String(term).trim() : wholeEmail(decodeInput(term)));
  };
  const termsIn = (text) => {
    const tokens = String(text ?? '').match(/(?:&(?:amp;)*(?:#\d+|#x[0-9a-f]+|[a-z0-9]+);|[^\n\r,;\t|])+/gi) || [];
    return tokens.flatMap((token) => {
      const term = token.trim();
      return term ? [takeValue(term) || term] : [];
    });
  };
  const idShape = (term) => !ID_RE.test(term) ? '' : term.length === 8 ? 'active' : 'deactivated';
  const isActiveId = (term) => idShape(term) === 'active';
  const mayBeInactiveId = (term) => idShape(term) === 'deactivated';
  const columnName = (index) => {
    let v = index + 1, name = '';
    while (v) { v--; name = String.fromCharCode(65 + (v % 26)) + name; v = Math.floor(v / 26); }
    return name;
  };
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
  const dedupe = (list) => {
    const seen = new Map();
    const unique = [], dupes = [];
    list.map((term) => wholeEmail(term) ? norm(term) : String(term).trim()).filter(Boolean).forEach((email) => {
      const key = emailKey(email);
      if (seen.has(key)) {
        const index = seen.get(key);
        dupes.push(email);
        if (!splitEmail(unique[index]).date && splitEmail(email).date) unique[index] = email;
      } else { seen.set(key, unique.length); unique.push(email); }
    });
    return { list: unique, raw: list.length, dupes };
  };
  const stamp = () => {
    const d = new Date(), p = (v) => String(v).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  };
  const settle = async ({ read, classify, signature = value => value, deadline,
    quietWindow = 0, token }) => {
    const windows = new Map();
    if (deadline.delay != null) await wait(deadline.delay);
    while (token.current()) {
      const wasPaused = runPaused();
      if (deadline.ready && !(await deadline.ready())) break;
      if (wasPaused && deadline.resume) { deadline.resume(); windows.clear(); }
      if (deadline.now() >= deadline.at) break;
      const answer = read();
      let decision = classify(answer);
      for (const channel of decision.reset || []) windows.delete(channel);
      if (decision.state === 'candidate') {
        const channel = decision.channel || 'answer', key = signature(answer);
        const previous = windows.get(channel);
        if (!previous || previous.key !== key) {
          windows.set(channel, { key, at: deadline.now() });
          decision.changed?.();
        } else if (deadline.now() - previous.at >= quietWindow) {
          decision = decision.stable ? decision.stable(key) : { state: 'confirmed', value: decision.value };
        }
      }
      for (const channel of decision.reset || []) windows.delete(channel);
      if (decision.state === 'confirmed' || decision.state === 'refusal') return decision.value;
      await wait(typeof deadline.interval === 'function' ? deadline.interval() : deadline.interval ?? T.poll);
    }
    return deadline.fallback;
  };
  const select2Driver = (() => {
    const tokenFor = (policy = 'write') => {
      const generation = runState.generation;
      return { current: () => (window[TOOL_KEY] === tool
        || (policy === 'dropdown-close' && runState.phase === 'closed' && !window[TOOL_KEY]))
        && generation === runState.generation && pagePermission(policy) };
    };
    const write = (token, action) => {
      if (!token.current()) throw new Error('Page operation stopped.');
      return action();
    };
    const cleanupToken = () => tokenFor('cleanup');
    const container = field => jQuery(field).data('select2')?.$container?.[0] || null;
    const open = (field, token = tokenFor()) => write(token, () => jQuery(field).select2('open'));
    const type = (input, value, token = tokenFor()) => write(token, () => jQuery(input).val(value).trigger('input'));
    const pageFurther = (list, token = tokenFor()) => write(token, () => {
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    const selectExact = (row, token = tokenFor()) => write(token, () => jQuery(row).trigger('mouseup'));
    const pressKey = (input, code, token = tokenFor()) => write(token,
      () => jQuery(input).trigger(jQuery.Event('keydown', { which: code, keyCode: code })));
    const setValues = (field, values, token = tokenFor()) => write(token, () => jQuery(field).val(values).trigger('change'));
    const value = field => jQuery(field).val();
    const waitDuration = async duration => {
      if (duration <= 0) { await wait(0); return lookupReady(); }
      const end = lookupTime() + duration;
      await settle({
        read: lookupTime,
        classify: () => ({ state: 'incomplete' }),
        deadline: { now: lookupTime, at: end, ready: lookupReady,
          interval: () => Math.min(T.poll, end - lookupTime()) },
        token: tokenFor('settlement'),
      });
      return lookupReady();
    };
    const SELECTORS = { email: FIELD_SELECTOR, id: EMPID_SELECTOR };
    const empidReady = () => !reportMode && Boolean(EMPID_SELECTOR) && Boolean(document.querySelector(EMPID_SELECTOR));
    const fieldOf = (term) => isId(term) ? 'id' : inputEmails(term).length ? 'email' : null;
    const personField = (which = 'email') => ({
      kind: 'person', which,
      resolve: () => reportMode ? (which === 'email' ? reportField('email') : null)
        : (SELECTORS[which] ? document.querySelector(SELECTORS[which]) : null),
    });
    const filterField = key => ({ kind: 'filter', key, resolve: () => reportField(key) });
    const getSelect = (which = 'email') => personField(which).resolve();
    const staffIdLabel = () => {
      const field = getSelect('id');
      const label = [...(field?.labels || [])].find(node => node.getClientRects().length);
      if (!label) return 'Empid';
      const copy = label.cloneNode(true);
      copy.querySelectorAll('select, input, .select2-container').forEach(node => node.remove());
      return copy.textContent.trim() || 'Empid';
    };
    const select2Data = (which = 'email') => {
      try { return jQuery(getSelect(which)).select2('data') || []; }
      catch { throw new Error('Selection is unreadable.'); }
    };
    const selectedIds = (which = 'email') => {
      try {
        const values = jQuery(getSelect(which)).val();
        if (values != null) return [].concat(values).map(String);
      } catch {   }
      return select2Data(which).filter((item) => item.id != null).map((item) => String(item.id));
    };
    const fieldRoot = (which = 'email') => {
      try { return jQuery(getSelect(which)).data('select2')?.$container?.[0] || null; } catch { return null; }
    };
    const selectDropdown = (field) => {
      try {
        const instance = jQuery(field).data('select2');
        const dropdown = instance?.$dropdown?.[0] || instance?.dropdown?.$dropdown?.[0];
        if (!dropdown?.isConnected) return null;
        if ([...document.querySelectorAll('.select2-container--open .select2-results__options')]
          .some(list => !dropdown.contains(list))) return null;
        return dropdown;
      } catch { return null; }
    };
    const fieldDropdown = (which = 'email') => selectDropdown(reportMode && which === 'email' ? reportField('email', true) : getSelect(which));
    const fieldSearchInput = (which) => fieldRoot(which)?.querySelector('.select2-search__field')
      || fieldDropdown(which)?.querySelector('.select2-search__field');
    const rowSelected = (row) => {
      if (row.classList.contains('select2-results__option--selected')) return true;
      if (!row.classList.contains('select2-results__option--selectable') && row.getAttribute('aria-selected') === 'true') return true;
      try { if (jQuery(row).data('data')?.selected === true) return true; } catch {}
      try { return jQuery.fn.select2.amd.require('select2/utils').GetData(row, 'data')?.selected === true; }
      catch { return false; }
    };
    const ownChips = (which = 'email') => {
      const root = fieldRoot(which);
      return root ? [...root.querySelectorAll('.select2-selection__choice')] : [];
    };
    const fieldOnScreen = () => {
      if (reportMode) return REPORT_PAGE.advanced ? Boolean(reportAdvancedGroup()) : reportRendered(fieldRoot());
      const root = fieldRoot();
      return Boolean(root && root.getClientRects().length);
    };
    const addedTermsById = (which = 'email') => {
      const entries = new Map();
      for (const batch of [...state.batches, state.pendingBatch]) {
        for (const entry of batch?.addedEmails || []) {
          const term = termOfEntry(entry);
          if (entry.optionId != null && fieldOf(term) === which) entries.set(String(entry.optionId), term);
        }
      }
      return entries;
    };
    const selectedEmails = () => {
      const entries = addedTermsById();
      const selected = new Set(selectedIds());
      const terms = new Set([...selected].filter((id) => entries.has(id)).map((id) => entries.get(id)));
      select2Data().forEach((item) => {
        if (!selected.has(String(item.id)) || entries.has(String(item.id))) return;
        emailsIn(item.email || item.text).forEach((email) => terms.add(emailKey(email)));
      });
      for (const chip of ownChips()) {
        if (entries.has(chipId(chip))) continue;
        emailsIn(chip.title || chip.textContent).forEach((email) => terms.add(emailKey(email)));
      }
      return terms;
    };
    const selectedEmailFor = (term) => {
      try {
        const records = select2Data().flatMap((item) => emailsIn(item.email || item.text));
        const chips = ownChips().flatMap((chip) => emailsIn(chip.title || chip.textContent));
        const emails = [...records, ...chips];
        return emails.find((email) => email === term) || emails.find((email) => emailKey(email) === term) || null;
      } catch { return undefined; }
    };
    const emailOfOption = (option, text) => {
      const subtext = option.querySelector('.select2-results__option-subtext');
      return emailsIn(subtext ? subtext.textContent : (text ?? option.textContent))[0] || null;
    };
    const selectionLabel = text => String(text || '').replace(/\s+/g, ' ').trim();
    const labelOfOption = option => {
      const copy = option.cloneNode(true);
      copy.querySelectorAll('.select2-results__option-subtext').forEach(node => node.remove());
      return selectionLabel(copy.textContent.replace(EMAIL_RE, ''));
    };
    const idOfOption = (option, which = 'email') => {
      try {
        const direct = jQuery(option).data('data');
        if (direct && direct.id != null) return String(direct.id);
      } catch {   }
      try {
        const utils = jQuery.fn.select2.amd.require('select2/utils');
        const data = utils.GetData(option, 'data');
        if (data && data.id != null) return String(data.id);
      } catch {   }
      if (!reportMode && which === 'id') {
        const text = option.textContent.trim();
        if (text) return text;
      }
      return '';
    };
    const closeSelect = (which = 'email') => { try { write(tokenFor('dropdown-close'), () => jQuery(getSelect(which)).select2('close')); } catch {} };
    const click = (selector) => {
      const node = typeof selector === 'function' ? selector() : document.querySelector(selector);
      if (!node) { return false; }
      write(cleanupToken(), () => node.scrollIntoView({ block: 'center' }));
      write(cleanupToken(), () => node.click());
      return true;
    };
    const getSearchAgainButton = () => {
      if (reportMode) return reportSearchAgainButtons()[0] || null;
      const controls = [...document.querySelectorAll(REPORT_PAGE.searchAgainAction)];
      return controls.find(node => node.getClientRects().length > 0) || controls[0] || null;
    };
    const isApprovedPage = () => (!APPROVED_ORIGIN || location.origin === APPROVED_ORIGIN)
      && (reportMode ? location.pathname === REPORT_PAGE.path : (!APPROVED_PATH || location.pathname === APPROVED_PATH));
    const preflight = () => {
      const failures = [];
      if (!isApprovedPage()) failures.push('This is not the page this tool is configured for.');
      if (!window.jQuery) failures.push('jQuery is not available.');
      if (reportMode) {
        Object.keys(REPORT_PAGE.labels).forEach((key) => {
          if (!reportField(key, true)) failures.push(`Can't find ${REPORT_PAGE.labels[key]} on this page`);
        });
        if (sessionExpiredOnPage()) failures.push('The session has expired — refresh the page and start again.');
        return { ready: failures.length === 0, failures };
      }
      if (!getSelect()) failures.push('Email Select2 field is missing.');
      if (EMPID_SELECTOR && !getSelect('id')) failures.push('Empid Select2 field is missing.');
      if (!getSearchAgainButton()) failures.push('Search Again button is missing.');
      if (sessionExpiredOnPage()) failures.push('The session has expired — refresh the page and start again.');
      return { ready: failures.length === 0, failures };
    };
    const waitFor = (predicate, { timeout = T.wait, interval = 100 } = {}) => settle({
      read: () => { try { return predicate(); } catch { return null; } },
      classify: value => value ? { state: 'confirmed', value } : { state: 'incomplete' },
      deadline: { now: Date.now, at: Date.now() + timeout, interval, fallback: null },
      token: cleanupToken(),
    });
    const inputViewVisible = () => reportMode && reportSearchForm()
      ? reportFormVisible(reportSearchForm()) : fieldOnScreen();
    const goToInputView = async () => {
      if (reportMode && inputViewVisible()) return true;
      const reportFormOpening = reportMode && reportSearchForm()
        && getComputedStyle(reportSearchForm()).display !== 'none';
      if (!reportFormOpening && !click(getSearchAgainButton)) return false;
      if (reportMode && reportSearchForm()) {
        if (await waitFor(() => reportFormVisible(reportSearchForm()), { timeout: T.nav, interval: 150 })) {
          await wait(T.settle); return active();
        }
        return false;
      }
      if (await waitFor(fieldOnScreen, { timeout: T.nav, interval: 150 })) { await wait(T.settle); return active(); }
      return false;
    };
    const clearBox = (which = 'email') => {
      if (which === 'id' && !empidReady()) return;
      try { setValues(getSelect(which), null, tokenFor('remove')); }
      catch {
        const root = fieldRoot(which);
        if (!root) { return; }
        root.querySelectorAll('.select2-selection__choice__remove').forEach((b) => write(tokenFor('remove'), () => b.click()));
      }
    };
    const chipId = (chip) => idOfOption(chip, fieldRoot('id')?.contains(chip) ? 'id' : 'email') || chip.getAttribute('data-select2-id') || '';
    const undoChipIndex = (fields) => {
      const indexes = new Map();
      for (const which of fields) {
        const root = fieldRoot(which), known = addedTermsById(which);
        const ids = new Map(), emails = new Map(), keys = new Map();
        const add = (map, key, chip) => {
          if (!map.has(key)) map.set(key, new Set());
          map.get(key).add(chip);
        };
        const update = chip => {
          const old = keys.get(chip);
          if (old) {
            for (const [map, values] of [[ids, old.ids], [emails, old.emails]]) for (const value of values) {
              const chips = map.get(value);
              chips?.delete(chip);
              if (!chips?.size) map.delete(value);
            }
            keys.delete(chip);
          }
          if (!root?.contains(chip)) return;
          const id = chipId(chip);
          const idKeys = new Set([id, chip.getAttribute('data-select2-id') || '',
            chip.querySelector('[data-select2-id]')?.getAttribute('data-select2-id') || '']);
          const emailKeys = known.has(id) ? [] : emailsIn(chip.title || chip.textContent).map(emailKey);
          keys.set(chip, { ids: idKeys, emails: emailKeys });
          idKeys.forEach(value => add(ids, value, chip));
          emailKeys.forEach(value => add(emails, value, chip));
        };
        const changes = records => {
          const touched = new Set();
          for (const record of records) {
            const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
            const owner = target?.closest('.select2-selection__choice');
            if (owner) touched.add(owner);
            for (const node of [...(record.addedNodes || []), ...(record.removedNodes || [])]) {
              if (node.nodeType !== 1) continue;
              if (node.matches('.select2-selection__choice')) touched.add(node);
              node.querySelectorAll('.select2-selection__choice').forEach(chip => touched.add(chip));
            }
          }
          touched.forEach(update);
        };
        const observer = new MutationObserver(changes);
        if (root) observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
        ownChips(which).forEach(update);
        const first = (chips, matches) => [...(chips || [])].filter(chip => chip.isConnected && root?.contains(chip) && matches(chip))
          .sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 4 ? -1 : 1)[0] || null;
        indexes.set(which, { observer, find(optionId, email) {
          changes(observer.takeRecords());
          const id = String(optionId);
          return (optionId != null ? first(ids.get(id), chip => chipId(chip) === id
            || (chip.getAttribute('data-select2-id') || '') === id
            || (chip.querySelector('[data-select2-id]')?.getAttribute('data-select2-id') || '') === id) : null)
            || first(emails.get(emailKey(email)), chip => !known.has(chipId(chip))
              && emailsIn(chip.title || chip.textContent).some(value => emailKey(value) === emailKey(email)));
        } });
      }
      return {
        find: (optionId, email, which) => indexes.get(which)?.find(optionId, email) || null,
        disconnect: () => indexes.forEach(index => index.observer.disconnect()),
      };
    };
    const chipFor = (optionId, email, which = 'email', index = null) => {
      if (index) return index.find(optionId, email, which);
      const chips = ownChips(which);
      if (optionId != null) {
        const id = String(optionId);
        const byId = chips.find((chip) => {
          if (chipId(chip) === id) return true;
          const own = chip.getAttribute('data-select2-id') || '';
          const inner = chip.querySelector('[data-select2-id]')?.getAttribute('data-select2-id') || '';
          return own === id || inner === id;
        });
        if (byId) return byId;
      }
      const known = addedTermsById(which);
      return chips.find((chip) => !known.has(chipId(chip)) && emailsIn(chip.title || chip.textContent).some((value) => emailKey(value) === emailKey(email))) || null;
    };
    const isGone = (optionId, email, which = 'email') => {
      try { return optionId != null
        ? !selectedIds(which).includes(String(optionId))
        : !selectedEmails().has(emailKey(email)); }
      catch { return false; }
    };
    const removeSelectedEmail = async (email, optionId, which = 'email', optionIdConfirmed = false, chipIndex = null, label = '') => {
      try {
        if (!removalAllowed()) return false;
        if (optionId == null && email) {
          const selected = select2Data(which);
          const matches = selected.filter((item) =>
            emailsIn(item.email || item.text || '').some((value) => norm(value) === norm(email)));
          if (matches.length === 1 && matches[0].id != null) optionId = String(matches[0].id);
          else if (!matches.length && selectionLabel(label)) {
            const named = selected.filter(item => selectionLabel(item.text) === selectionLabel(label));
            if (named.length !== 1 || named[0].id == null) return false;
            optionId = String(named[0].id);
          }
        }
        if (optionId != null) {
          if (isGone(optionId, email, which)) return optionIdConfirmed === true;
          const current = selectedIds(which);
          const filtered = current.filter((value) => value !== String(optionId));
          if (filtered.length !== current.length) {
            try {
              if (!removalAllowed()) return false;
              setValues(getSelect(which), filtered, tokenFor('remove'));
              const gone = await waitFor(() => !removalAllowed() || isGone(optionId, email, which), { timeout: 2500, interval: 100 });
              if (!removalAllowed()) return isGone(optionId, email, which);
              if (gone) return true;
            } catch {   }
          }
        }
        const chip = chipFor(optionId, email, which, chipIndex);
        const remove = chip?.querySelector('.select2-selection__choice__remove');
        if (!remove) return false;
        if (!removalAllowed()) return false;
        try { write(tokenFor('remove'), () => jQuery(remove).trigger('click')); } catch { if (removalAllowed()) write(tokenFor('remove'), () => remove.click()); }
        const gone = await waitFor(() => !removalAllowed() || isGone(optionId, email, which), { timeout: 2500, interval: 100 });
        return removalAllowed() ? Boolean(gone) : isGone(optionId, email, which);
      } catch { return false; }
    };
    const reportDropdown = (key) => selectDropdown(filterField(key).resolve());
    const reportValues = (key) => {
      const select = reportField(key);
      if (!select || select.disabled) return null;
      try {
        const ids = [].concat(jQuery(select).val() || []).map(String);
        const native = [...select.selectedOptions].map((option) => option.value);
        return ids.length === native.length && ids.every((id) => native.includes(id)) ? ids : null;
      } catch { return null; }
    };
    const sameValues = (a, b) => Boolean(a && b && a.length === b.length && a.every((id) => b.includes(id)));
    const closeReportField = (key) => { if (!active()) return; try { write(cleanupToken(), () => jQuery(reportField(key)).select2('close')); } catch {} };
    const reportListState = (key) => {
      const popup = reportDropdown(key);
      const all = [...(popup?.querySelectorAll(REPORT_PAGE.row) || [])];
      const searching = (row) => !idOfOption(row) && /^searching(?:…|\.{3})?$/i.test(row.textContent.trim());
      const loadMore = all.filter((row) => row.matches('.select2-results__option--load-more')
        || (!idOfOption(row) && /^loading more results(?:…|\.{3})?$/i.test(row.textContent.trim())));
      const messages = all.filter((row) => row.matches('.loading-results, .select2-results__message') || searching(row) || loadMore.includes(row));
      const rows = all.filter((row) => !messages.includes(row) && !loadMore.includes(row)
        && !row.querySelector(REPORT_PAGE.list) && !row.classList.contains('select2-results__option--group'));
      const loading = Boolean(popup?.querySelector('.loading-results, [aria-busy=true]'))
        || messages.some((row) => searching(row) && !loadMore.includes(row));
      const message = messages.some(searching) ? 'Searching…'
        : loadMore.length ? 'Loading more results…' : messages.length ? 'present' : 'none';
      Object.assign(reportDiagnostic, { rows: rows.length, loading, loadMore: Boolean(loadMore.length), message });
      return { popup, rows, loading, loadMore, blocked: messages.some((row) => !loadMore.includes(row)) };
    };
    const reportOptionKey = (item) => item.id ? `id:${item.id}` : `text:${item.text}`;
    const reportAllIs = (key, offered) => {
      const ids = reportValues(key), field = reportField(key);
      if (!ids || !offered || ids.length !== offered.length || !field) return false;
      const chosen = [...field.selectedOptions];
      return offered.every((item) => chosen.filter((option) => item.id
        ? option.value === item.id : option.textContent.trim() === item.text).length === 1)
        && chosen.every((option) => offered.filter((item) => item.id
          ? option.value === item.id : option.textContent.trim() === item.text).length === 1);
    };
    const settleReportOptions = (read) => {
      let scrolledSignature = null;
      const rowKeys = new WeakMap(); let nextKey = 0;
      const deadline = { now: Date.now, at: Date.now() + T.wait, ready: lookupReady, fallback: null,
        resume: () => { deadline.at = Date.now() + T.wait; } };
      return settle({ read, deadline, quietWindow: T.confirm,
        token: tokenFor('wait'),
        signature: answer => JSON.stringify([answer.values.map(item => [reportOptionKey(item), item.text, item.selected]),
          answer.rows.map(row => { if (!rowKeys.has(row)) rowKeys.set(row, ++nextKey); return rowKeys.get(row); })]),
        classify: answer => {
          if (answer?.stop) return { state: 'refusal', value: null };
          const { popup, rows = [], loading, loadMore = [], blocked, values } = answer || {};
          if (!values || loading || blocked || !rows.length) return { state: 'incomplete', reset: ['answer'] };
          return { state: 'candidate', stable: () => {
            if (!loadMore.length) return { state: 'confirmed', value: values };
            reportDiagnostic.step = 'page';
            const next = JSON.stringify(values.map(item => [reportOptionKey(item), item.text, item.selected]));
            if (scrolledSignature !== next) {
              scrolledSignature = next;
              const list = popup.querySelector(REPORT_PAGE.list);
              if (!list) return { state: 'refusal', value: null };
              pageFurther(list);
              deadline.at = Date.now() + T.wait;
              return { state: 'incomplete', reset: ['answer'] };
            }
            return { state: 'incomplete' };
          } };
        },
      });
    };
    const openReportOptions = async (key, fullList = false) => {
      if (!(await lookupReady())) return null;
      reportStep('find');
      const field = reportField(key);
      if (!field || field.disabled) return null;
      try {
        reportStep('open');
        if (!jQuery(field).data('select2')) return null;
        const root = jQuery(field).data('select2').$container?.[0];
        if (!root?.classList.contains('select2-container--open')) open(field);
        if (!(await waitFor(() => root?.classList.contains('select2-container--open') && reportDropdown(key), { interval: T.poll }))) return null;
        if (!(await lookupReady())) return null;
        if (fullList) {
          reportStep('type');
          const input = await waitFor(() => root?.querySelector(REPORT_PAGE.searchInput)
            || reportDropdown(key)?.querySelector(REPORT_PAGE.searchInput), { interval: T.poll });
          if (!input || !(await lookupReady())) return null;
          write(tokenFor(), () => input.focus());
          type(input, ' ');
          type(input, '  ');
        }
        reportStep('load');
        return await settleReportOptions(() => {
          const { popup, rows, loading, loadMore, blocked } = reportListState(key);
          if (!popup) return { stop: true };
          const values = rows.map(row => ({ row, id: idOfOption(row), text: row.textContent.trim(),
            selected: rowSelected(row) }));
          if (!loading && !blocked && rows.length && (values.some(({ row, id, text }) => (!id && !text) || row.getAttribute('aria-disabled') === 'true')
            || new Set(values.map(reportOptionKey)).size !== values.length)) return { stop: true };
          return { popup, rows, loading, loadMore, blocked, values };
        });
      } catch {   }
      return null;
    };
    const reportSingleOption = (field, wanted) => {
      if (!field || field.disabled || field.multiple) return null;
      const matches = [...field.options].filter((option) => option.value !== '' && norm(option.textContent) === norm(wanted));
      return matches.length === 1 ? matches[0] : null;
    };
    const reportSingleIs = (key, wanted) => {
      const field = reportField(key);
      const option = reportSingleOption(field, wanted);
      if (!option || field.value !== option.value || field.selectedOptions.length !== 1
        || norm(field.selectedOptions[0].textContent) !== norm(wanted)) return false;
      const rendered = jQuery(field).data('select2')?.$container?.[0]?.querySelector('.select2-selection__rendered');
      return Boolean(rendered && (norm(rendered.title) === norm(wanted) || norm(rendered.textContent) === norm(wanted)));
    };
    const setReportSingle = async (key, wanted) => {
      if (!(await lookupReady())) return false;
      reportStep('find');
      const field = reportField(key);
      const option = reportSingleOption(field, wanted);
      if (!option) return false;
      reportStep('pick');
      if (field.value !== option.value || field.selectedOptions.length !== 1
        || norm(field.selectedOptions[0].textContent) !== norm(wanted)) setValues(field, option.value);
      reportStep('verify');
      const set = await waitFor(() => reportSingleIs(key, wanted), { timeout: T.chip, interval: T.poll });
      return Boolean(set && await lookupReady());
    };
    const setReportAll = async (key) => {
      try {
        const options = await openReportOptions(key, true);
        if (!options || !(await lookupReady())) return null;
        const offered = options.map(({ id, text }) => ({ id, text }));
        const liveOptions = () => {
          const { popup, rows, loading, loadMore, blocked } = reportListState(key);
          const root = jQuery(reportField(key)).data('select2')?.$container?.[0];
          if (!root?.classList.contains('select2-container--open') || !popup || loading || loadMore.length || blocked) return null;
          const values = rows.map(row => ({ row, id: idOfOption(row), text: row.textContent.trim(),
            selected: rowSelected(row) }));
          return values.length === offered.length && values.every((value, i) => reportOptionKey(value) === reportOptionKey(offered[i])
            && value.row.getAttribute('aria-disabled') !== 'true') ? values : null;
        };
        let current = options;
        for (const item of offered) {
          if (!(await lookupReady())) return null;
          if (!current) current = await openReportOptions(key, true);
          if (!current || !(await lookupReady())) return null;
          if (!sameValues(current?.map(reportOptionKey), offered.map(reportOptionKey))) { reportDiagnostic.step = 'verify'; return null; }
          const chosen = () => item.id ? reportValues(key)?.includes(item.id)
            : [...(reportField(key)?.selectedOptions || [])].some((option) => option.textContent.trim() === item.text);
          if (chosen()) continue;
          reportDiagnostic.step = 'pick';
          const root = jQuery(reportField(key)).data('select2')?.$container?.[0];
          const input = root?.querySelector(REPORT_PAGE.searchInput) || reportDropdown(key)?.querySelector(REPORT_PAGE.searchInput);
          const highlighted = (values) => {
            if (!values) return null;
            const marked = values.filter(value => value.row.classList.contains('select2-results__option--highlighted'));
            if (marked.length) return marked.length === 1 ? marked[0] : null;
            const aria = values.filter(value => value.row.getAttribute('aria-selected') === 'true'
              && !value.row.classList.contains('select2-results__option--selected')
              && !(value.id ? reportValues(key)?.includes(value.id)
                : [...(reportField(key)?.selectedOptions || [])].some(option => option.textContent.trim() === value.text)));
            return aria.length === 1 ? aria[0] : null;
          };
          let values = liveOptions(), marked = highlighted(values);
          for (let presses = 0; input?.isConnected && marked && reportOptionKey(marked) !== reportOptionKey(item)
            && presses < current.length; presses++) {
            pressKey(input, 40);
            values = liveOptions(); marked = highlighted(values);
          }
          const fresh = values?.find(value => reportOptionKey(value) === reportOptionKey(item));
          if (!fresh) return null;
          if (chosen()) continue;
          if (fresh.row.classList.contains('select2-results__option--selected')) return null;
          const before = reportValues(key);
          if (!before || !active() || runStopped()) return null;
          const keyboard = Boolean(input?.isConnected && marked && reportOptionKey(marked) === reportOptionKey(item));
          if (keyboard) pressKey(input, 13);
          else {
            if (fresh.selected) return null;
            selectExact(fresh.row);
          }
          const outcome = await waitFor(() => {
            const after = reportValues(key);
            if (!after) return { added: false };
            if (sameValues(before, after)) return false;
            const selected = [...(reportField(key)?.selectedOptions || [])].filter(option => item.id
              ? option.value === item.id : option.textContent.trim() === item.text);
            return { added: selected.length === 1 && after.length === before.length + 1
              && before.every(id => after.includes(id)) && !before.includes(selected[0].value)
              && after.includes(selected[0].value) };
          }, { timeout: T.chip, interval: T.poll });
          if (!outcome?.added || !(await lookupReady())) return null;
          current = null;
          if (keyboard) {
            current = await settleReportOptions(() => {
              const values = liveOptions();
              return values ? { values, rows: values.map(value => value.row) } : null;
            });
            if (!active() || runStopped()) return null;
          }
          if (!current) closeReportField(key);
        }
        reportDiagnostic.step = 'verify';
        return reportAllIs(key, offered) ? offered : null;
      } finally { closeReportField(key); }
    };
    const setReportDate = async (key, value) => {
      if (!(await lookupReady())) return false;
      reportStep('find');
      const field = reportField(key);
      if (!field || field.disabled || field.readOnly) return false;
      reportStep('type');
      write(tokenFor(), () => field.focus());
      write(tokenFor(), () => { field.value = value; });
      write(tokenFor(), () => field.dispatchEvent(new Event('input', { bubbles: true })));
      write(tokenFor(), () => field.dispatchEvent(new Event('change', { bubbles: true })));
      reportDateEscape = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
      try { write(tokenFor(), () => field.dispatchEvent(reportDateEscape)); } finally { reportDateEscape = null; }
      write(tokenFor(), () => field.blur());
      return settle({
        read: () => { reportStep('verify'); return reportField(key) === field && field.value === value; },
        classify: value => ({ state: 'confirmed', value }),
        deadline: { delay: T.settle, now: Date.now, at: Infinity, ready: lookupReady, fallback: false },
        token: tokenFor('wait'),
      });
    };
    const reportAdvancedOpen = () => reportCollapseOpen(reportAdvancedCollapse()) && reportRendered(fieldRoot());
    const openReportAdvanced = async () => {
      if (!(await lookupReady())) return false;
      reportStep('find');
      const collapse = reportAdvancedCollapse();
      if (!collapse) return false;
      reportStep('open');
      if (!reportCollapseOpen(collapse)) {
        const linked = [...document.querySelectorAll(REPORT_PAGE.toggle)].filter((node) => reportRendered(node)
          && collapse.id && (node.getAttribute('data-bs-target') === `#${collapse.id}`
            || node.getAttribute('href') === `#${collapse.id}`
            || (node.getAttribute('aria-controls') || '').split(/\s+/).includes(collapse.id)));
        const named = [...reportAdvancedGroup().querySelectorAll('*')].filter((node) => reportRendered(node)
          && norm(node.textContent) === norm(REPORT_PAGE.labels.advanced)
          && ![...node.children].some((child) => norm(child.textContent) === norm(REPORT_PAGE.labels.advanced)));
        const toggles = linked.length ? linked : named;
        if (toggles.length !== 1 || toggles[0].disabled || toggles[0].getAttribute('aria-disabled') === 'true') return false;
        write(tokenFor(), () => toggles[0].click());
      }
      reportStep('verify');
      const opened = await waitFor(reportAdvancedOpen, { timeout: T.chip, interval: T.poll });
      return Boolean(opened && await lookupReady());
    };
    const lookupSnapshot = (dropdown, term) => {
      const rows = [...dropdown.querySelectorAll('li.select2-results__option, .select2-results__message, .loading-results, .select2-results__option--load-more, [aria-busy=true]')];
      const texts = new Map(rows.map(row => [row, row.textContent]));
      const isTerm = row => row.matches('li.select2-results__option, .select2-results__message') && texts.get(row).trim() === term;
      const messages = rows.filter(row => row.classList.contains('select2-results__message'));
      const loadMore = rows.find(row => row.classList.contains('select2-results__option--load-more'));
      const loading = dropdown.matches('[aria-busy=true]') || rows.some(row => row.matches('.loading-results, [aria-busy=true]')
        || (!isTerm(row) && /^\s*searching\b/i.test(texts.get(row))));
      const unfinished = loading || Boolean(loadMore) || rows.some(row => !isTerm(row) && /^\s*(loading|load more|more results)\b/i.test(texts.get(row)));
      const options = rows.filter(row => row.matches('li.select2-results__option')
        && !row.matches('.select2-results__option--group, .select2-results__option--load-more, [aria-busy=true], .select2-results__message, .loading-results')
        && !row.querySelector('ul.select2-results__options')
        && (isTerm(row) || !/^\s*(searching|loading|no results)/i.test(texts.get(row))));
      const emails = new Map(), ids = new Map();
      const emailOf = row => {
        if (!emails.has(row)) {
          emails.set(row, emailOfOption(row, texts.get(row)));
        }
        return emails.get(row);
      };
      const idOf = row => {
        if (!ids.has(row)) ids.set(row, idOfOption(row, 'id'));
        return ids.get(row);
      };
      return { messages, options, loadMore, loading, unfinished, emailOf, idOf, textOf: row => texts.get(row) };
    };
    const noResultsText = (which) => {
      try {
        const options = jQuery(getSelect(which)).data('select2').options;
        const resolved = options.get?.('translations')?.get('noResults');
        const lang = options.options?.language;
        const wording = resolved ?? lang?.noResults;
        const value = typeof wording === 'function' ? wording() : wording;
        return value ? norm(value) : null;
      } catch { return null; }
    };
    const waitForExactMatch = (term, query = null) => {
      let pages = 0, scrolledSignature = null;
      const deadline = { now: lookupTime, at: lookupTime() + T.wait, ready: lookupReady, fallback: { timeout: true } };
      return settle({ deadline, quietWindow: T.confirm,
        token: tokenFor('wait'),
        read: () => {
          const dropdown = fieldDropdown(fieldOf(term));
          if (!dropdown) return { closed: true };
          if (query && (query.dropdown !== dropdown || !query.fresh())) return { stale: true };
          return { dropdown, ...lookupSnapshot(dropdown, term) };
        },
        signature: answer => answer.options.map(o => answer.emailOf(o) || answer.textOf(o).trim()).join('|'),
        classify: answer => {
          if (answer.closed) return { state: 'refusal', value: { failed: true, reason: 'the dropdown closed before the lookup finished' } };
          if (answer.stale) return { state: 'incomplete' };
          const { dropdown, messages, options, unfinished, loading, loadMore, emailOf, idOf, textOf } = answer;
          if (loading) return { state: 'incomplete', reset: ['answer'] };
          if (!unfinished && messages.length) {
            const noResults = noResultsText(fieldOf(term));
            const unfamiliar = messages.find(message => !noResults || norm(textOf(message)) !== noResults);
            if (unfamiliar) return { state: 'refusal', value: { failed: true, reason: textOf(unfamiliar).trim() } };
            if (options.length) return { state: 'refusal', value: { failed: true, reason: 'the dropdown no-results message contradicted its rows' } };
            return { state: 'confirmed', value: null };
          }
          if (!options.length) return { state: 'incomplete', reset: ['answer'] };
          if (isId(term) && options.some(o => !idOf(o))) return { state: 'refusal', value: { failed: true, reason: 'the dropdown ids could not be read' } };
          const exact = options.filter(o => isId(term) ? idOf(o) === term : emailOf(o) === term);
          const dated = !isId(term) && (splitEmail(term).date || options.some(o => splitEmail(emailOf(o)).date && emailKey(emailOf(o)) === emailKey(term)));
          if (!dated) {
            if (exact.length > 1) return { state: 'refusal', value: { multiple: true, count: exact.length } };
            if (exact.length === 1 && !unfinished && (isId(term) || options.every(emailOf))) return { state: 'confirmed', value: exact[0] };
          }
          if (unfinished) {
            const list = dropdown.querySelector('.select2-results__options');
            if (!loadMore || !list || pages >= MAX_LOOKUP_PAGES) return { state: 'incomplete', reset: ['answer'] };
            return { state: 'candidate', channel: 'page', reset: ['answer'],
              changed: () => { if (pages) lastProgressAt = Date.now(); },
              stable: page => {
                if (scrolledSignature !== page) {
                  scrolledSignature = page; pages++; deadline.at = lookupTime() + T.wait;
                  pageFurther(list);
                }
                return { state: 'incomplete' };
              } };
          }
          return { state: 'candidate', changed: () => { if (pages) lastProgressAt = Date.now(); }, stable: () => {
            if (!isId(term) && options.some(o => !emailOf(o))) return { state: 'refusal', value: { failed: true, reason: 'the dropdown email parts could not be read' } };
            if (dated) {
              const chosen = findByEmail(term, options, emailOf);
              if (chosen.unclear) return { state: 'refusal', value: { multiple: true, count: chosen.count } };
              if (chosen.match) return { state: 'confirmed', value: chosen.match };
            }
            return { state: 'confirmed', value: null };
          } };
        },
      });
    };
    const tryAdd = async (term) => {
      const which = fieldOf(term);
      try {
        if (!which || !lookupTerm(term)) return 'error';
        if (!state.selectedSet) return 'error';
        if (which === 'id' && !empidReady()) {
          return 'error';
        }
        let idAlreadySelected = false;
        if (which === 'id') {
          const ids = new Set(selectedIds('id'));
          for (const [known, key] of confirmedIdKeys) if (!ids.has(key)) confirmedIdKeys.delete(known);
          idAlreadySelected = ids.has(term) || ids.has(confirmedIdKeys.get(term));
        }
        if (which === 'id' ? idAlreadySelected : state.selectedSet.has(emailKey(term))) {
          if (which === 'email' && selectedEmailFor(emailKey(term)) === undefined) return 'error';
          return 'dup';
        }
        if (!(await lookupReady())) return 'error';
        open(getSelect(which));
        const dropdown = fieldDropdown(which), input = fieldSearchInput(which);
        if (!dropdown || !input) { closeSelect(which); return 'error'; }
        let changed = false;
        const changedAnswer = records => records.some(record => record.type !== 'attributes'
          || record.attributeName === 'aria-busy' || record.target.classList.contains('loading-results')
          || /\bloading-results\b/.test(record.oldValue || ''));
        const observer = new MutationObserver(records => { changed ||= changedAnswer(records); });
        const list = dropdown.querySelector('.select2-results__options') || dropdown;
        observer.observe(list, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-busy', 'class'] });
        if (list !== dropdown) observer.observe(dropdown, { attributes: true, attributeFilter: ['aria-busy'] });
        const query = { dropdown, fresh: () => {
          changed ||= (dropdown.querySelector('.select2-results__options') || dropdown) !== list
            || changedAnswer(observer.takeRecords());
          return changed;
        } };
        let match;
        try {
          type(input, emailKey(term));
          await lookupWait(T.settle);
          match = await waitForExactMatch(term, query);
        } finally { observer.disconnect(); }
        while (runPaused() && active() && !runStopped()) {
          if (!(await lookupReady())) break;
          match = await waitForExactMatch(term);
        }
        if (match && match.timeout) {
          closeSelect(which);
          return 'timeout';
        }
        if (match && match.multiple) {
          closeSelect(which);
          return 'multiple';
        }
        if (match && match.failed) {
          closeSelect(which);
          return 'error';
        }
        if (!match) { closeSelect(which); return false; }
        if (!active() || runStopped() || runPaused() || !match.isConnected || !fieldDropdown(which)?.contains(match)) { closeSelect(which); return 'error'; }
        if (rowSelected(match)) { closeSelect(which); return 'dup'; }
        let optionId = idOfOption(match, which) || null;
        let optionIdConfirmed = false;
        const email = emailOfOption(match) || (isId(term) ? null : term);
        const beforeIds = which === 'id' ? new Set(selectedIds('id')) : null;
        const readValues = () => {
          try { return [].concat(value(getSelect(which)) || []).map(String); }
          catch { return null; }
        };
        const beforeValues = optionId != null ? readValues() : null;
        const currentDropdown = fieldDropdown(which);
        if (!currentDropdown?.contains(match)) { closeSelect(which); return 'error'; }
        const current = lookupSnapshot(currentDropdown, term);
        if (current.unfinished || current.messages.length) { closeSelect(which); return 'error'; }
        const currentOptions = current.options;
        if (currentOptions.some(row => !(which === 'id' ? current.idOf(row) : current.emailOf(row)))) {
          closeSelect(which); return 'error';
        }
        const exact = which === 'id' ? currentOptions.filter(row => current.idOf(row) === term) : null;
        const chosen = exact ? { match: exact[0], unclear: exact.length > 1 } : findByEmail(term, currentOptions, current.emailOf);
        if (chosen.unclear) { closeSelect(which); return 'multiple'; }
        if (chosen.match !== match) { closeSelect(which); return 'error'; }
        const label = optionId == null ? labelOfOption(match) : '';
        selectExact(match);
        if (which === 'id' && optionId != null) {
          try {
            const storedId = await waitFor(() => {
              const added = selectedIds('id').filter((id) => !beforeIds.has(id));
              return added.length === 1 ? added[0] : null;
            }, { timeout: T.chip, interval: T.poll });
            if (storedId != null) {
              optionId = storedId; optionIdConfirmed = true;
              confirmedIdKeys.set(term, String(storedId));
            }
          } catch {   }
        }
        const afterValues = optionId != null ? readValues() : null;
        if (beforeValues && afterValues) {
          const before = new Set(beforeValues);
          const added = [...new Set(afterValues.filter(value => !before.has(value)))];
          if (added.length === 1) optionId = added[0];
          if (which !== 'id' && optionId != null && afterValues.includes(String(optionId))) optionIdConfirmed = true;
        }
        closeSelect(which);
        if (email) state.selectedSet.add(emailKey(email));
        const result = { added: true, optionId, email };
        Object.defineProperty(result, 'optionIdConfirmed', { value: optionIdConfirmed });
        Object.defineProperty(result, 'label', { value: label });
        return result;
      } catch (err) {
        closeSelect(which);
        return 'error';
      }
    };
    return {
      container, open, type, readAnswer: lookupSnapshot, pageFurther, selectExact,
      readSelected: selectedIds, removeAndVerify: removeSelectedEmail, pressKey, setValues, waitDuration,
      empidReady, fieldOf, getSelect, staffIdLabel, selectedIds, fieldOnScreen,
      selectedEmails, selectedEmailFor, click, preflight, inputViewVisible, goToInputView,
      clearBox, undoChipIndex, removeSelectedEmail, reportAllIs, reportSingleIs,
      setReportSingle, setReportAll, setReportDate, reportAdvancedOpen, openReportAdvanced, tryAdd,
    };
  })();
  const {
    empidReady, fieldOf, getSelect, staffIdLabel, selectedIds, fieldOnScreen,
    selectedEmails, selectedEmailFor, click, preflight, inputViewVisible, goToInputView,
    clearBox, undoChipIndex, removeSelectedEmail, reportAllIs, reportSingleIs,
    setReportSingle, setReportAll, setReportDate, reportAdvancedOpen, openReportAdvanced, tryAdd,
  } = select2Driver;
  const reportRendered = (node) => Boolean(node && !node.closest(REPORT_PAGE.excluded) && node.getClientRects().length
    && !['hidden', 'collapse'].includes(getComputedStyle(node).visibility));
  const reportAdvancedGroup = () => {
    const groups = [...document.querySelectorAll(REPORT_PAGE.group)].filter(reportRendered);
    return groups.length === 1 ? groups[0] : null;
  };
  const reportAdvancedCollapse = () => {
    const group = reportAdvancedGroup();
    const collapses = [...(group?.querySelectorAll(REPORT_PAGE.collapse) || [])]
      .filter((node) => !node.closest(REPORT_PAGE.excluded));
    return collapses.length === 1 ? collapses[0] : null;
  };
  const reportCollapseOpen = (collapse) => Boolean(collapse
    && (collapse.classList.contains('show') || collapse.getAttribute('aria-expanded') === 'true'));
  const reportCandidate = (node, allowClosed = false) => {
    if (!node || node.closest(REPORT_PAGE.excluded)) return false;
    let rendered = node;
    if (node.matches(REPORT_PAGE.select)) {
      try { rendered = select2Driver.container(node) || node; } catch {   }
    }
    if (reportRendered(rendered)) return true;
    const collapse = allowClosed && reportAdvancedCollapse();
    if (!collapse || reportCollapseOpen(collapse) || !collapse.contains(rendered)) return false;
    for (let parent = rendered; parent !== collapse; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent.hidden || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) return false;
    }
    return true;
  };
  const reportLabels = (key, allowClosed = false) => [...document.querySelectorAll(REPORT_PAGE.label)]
    .filter((label) => reportCandidate(label, allowClosed)
      && norm(label.textContent.replace(/\*/g, '').replace(/\s+/g, ' ')) === norm(REPORT_PAGE.labels[key]));
  const reportField = (key, allowClosed = false) => {
    if (key === 'advanced') return reportAdvancedGroup();
    const selector = ['start', 'end'].includes(key) ? REPORT_PAGE.date : REPORT_PAGE.select;
    const column = REPORT_PAGE.columns[key];
    if (column) {
      const fields = [...document.querySelectorAll(`[data-column-name="${column}"]`)]
        .filter((field) => field.matches(selector) && reportCandidate(field));
      if (fields.length) return fields.length === 1 ? fields[0] : null;
    }
    const labels = reportLabels(key, allowClosed);
    if (labels.length !== 1) return null;
    const label = labels[0];
    const linked = label.control;
    if (linked?.matches(selector) && reportCandidate(linked, allowClosed)) return linked;
    const root = label.closest(REPORT_PAGE.column) || label;
    const fields = [...root.querySelectorAll(selector)].filter((field) => reportCandidate(field, allowClosed));
    return fields.length === 1 ? fields[0] : null;
  };
  const reportMode = Boolean(reportField('start') || reportField('end')) || reportLabels('start').length > 0 || reportLabels('end').length > 0;
  let reportDateEscape = null;
  const reportSearchForm = () => {
    const forms = [...document.querySelectorAll(REPORT_PAGE.form)]
      .filter((node) => !node.closest(REPORT_PAGE.excluded));
    return forms.length === 1 ? forms[0] : null;
  };
  const reportFormVisible = (form) => reportRendered(form)
    && getComputedStyle(form).display !== 'none'
    && [...form.getClientRects()].some((rect) => rect.height > 0);
  const reportSearchAgainButtons = () => [...document.querySelectorAll(REPORT_PAGE.searchAgainControl)]
    .filter((node) => reportRendered(node) && (node.matches(REPORT_PAGE.searchAgainAction)
      || norm(node.textContent) === norm(REPORT_PAGE.searchAgain)));
  let reportDiagnostic = { step: 'find', rows: 0, loading: false, loadMore: false, message: 'none' };
  const reportStep = (step) => { reportDiagnostic = { step, rows: 0, loading: false, loadMore: false, message: 'none' }; };
  let reportRememberedAll = {};
  const validateReportSetup = () => {
    const settingsError = reportMode && validateReportSettings();
    if (settingsError) {
      reportRememberedAll = {};
      showReportSettings(settingsError);
      return { ready: false, message: settingsError };
    }
    return true;
  };
  const beginReportSetup = async () => {
    reportStep('find');
    return Boolean(reportSettings && await lookupReady());
  };
  const setReportSetupDate = (_, key) => setReportDate(key, reportSettings[key]);
  const setReportSetupSingle = (_, key) => setReportSingle(key, reportSettings[key]);
  const setReportSetupAll = async (context, key) => {
    if (!(await lookupReady())) return false;
    if (reportRememberedAll[key] && reportAllIs(key, reportRememberedAll[key])) {
      context.all[key] = reportRememberedAll[key];
      return true;
    }
    context.all[key] = await setReportAll(key);
    return Boolean(context.all[key]);
  };
  const verifyReportSetup = async (context) => {
    reportStep('verify');
    if (!(await lookupReady())) return false;
    for (context.key of ['start', 'end']) if (reportField(context.key)?.value !== reportSettings[context.key]) return false;
    for (context.key of REPORT_PAGE.singles) if (!reportSingleIs(context.key, reportSettings[context.key])) return false;
    for (context.key of REPORT_PAGE.all) if (!reportAllIs(context.key, context.all[context.key])) return false;
    context.key = 'advanced';
    if (REPORT_PAGE.advanced && !reportAdvancedOpen()) return false;
    reportRememberedAll = context.all;
    return true;
  };
  const reportSetupSteps = {
    consulting: [
      { run: validateReportSetup },
      { run: beginReportSetup },
      { key: 'advanced', run: openReportAdvanced },
      { key: 'start', run: setReportSetupDate },
      { key: 'end', run: setReportSetupDate },
      { key: 'period', run: setReportSetupSingle },
      { key: 'business', run: setReportSetupSingle },
      { key: 'practice', run: setReportSetupAll },
      { key: 'area', run: setReportSetupAll },
      { run: verifyReportSetup },
    ],
    tax: [
      { run: validateReportSetup },
      { run: beginReportSetup },
      { key: 'start', run: setReportSetupDate },
      { key: 'end', run: setReportSetupDate },
      { key: 'period', run: setReportSetupSingle },
      { run: verifyReportSetup },
    ],
  };
  const prepareReportFields = async () => {
    const context = { key: 'advanced', all: {} };
    const steps = REPORT_PAGE.advanced ? reportSetupSteps.consulting : reportSetupSteps.tax;
    const validation = steps[0].run(context);
    if (validation?.ready === false) return validation;
    const fail = () => {
      reportRememberedAll = {};
      const d = reportDiagnostic, key = context.key;
      console.warn(`[Yoink] ${REPORT_PAGE.labels[key]} not set: step=${d.step}, rows=${d.rows}, loading=${d.loading}, loadMore=${d.loadMore}, message=${d.message}`);
      const message = key === 'advanced' ? '✗ Advanced did not open → open it, load or paste again'
        : `✗ ${REPORT_PAGE.labels[key]} not set → load or paste again`;
      setStatus(message);
      return { ready: false, message };
    };
    try {
      for (const step of steps.slice(1)) {
        if (step.key) {
          context.key = step.key;
          if (hasSettlement('setup')) setLive(REPORT_PAGE.labels[step.key]);
        }
        const result = await step.run(context, step.key);
        if (!result) return fail();
      }
      return { ready: true };
    } catch { return fail(); }
  };
  const reportDates = (clock = () => new Date()) => {
    const { start, end } = reportWindow(todayOf(clock()));
    return { start: usDate(start), end: usDate(end) };
  };
  const intakeSkipNotice = (terms) => `⚠ ${terms.length} ${terms.length === 1 ? 'value' : 'values'} skipped (${reportMode
    ? 'the report takes one email per value' : 'staff search takes one email or one number per value'}); listed in the CSV.`;
  const classifyIntakeSources = (sources, excluded) => {
    const supplied = new Set(sources.flatMap((source) => [...source.emails, ...(source.excluded || [])]));
    const skipOnlyValues = excluded.filter((term) => !lookupTerm(term) && !supplied.has(term));
    return sources.map((source, index) => {
      const rejected = rejectedCellTerms.get(source.emails)
        || new Set(source.emails.filter(term => !lookupTerm(term)));
      for (const term of source.excluded || []) if (!rejected.has(term) && !lookupTerm(term)) rejected.add(term);
      if (!index) skipOnlyValues.forEach(term => rejected.add(term));
      const emails = source.emails.filter(term => !rejected.has(term));
      rejectedCellTerms.set(emails, rejected);
      return {
        ...source,
        emails,
        excluded: uniq([...(source.excluded || []), ...rejected]),
      };
    });
  };
  const tone = (color) => `background:${PALETTE[color]};color:${color === 'gray' ? '#fff' : PALETTE.ink};`;
  const TONES = ['green', 'blue', 'gray', 'red', 'amber'];
  const dom = (tag, attributes = {}, ...children) => {
    const element = document.createElement(tag);
    let state = '';
    Object.entries(attributes).forEach(([name, value]) => {
      if (value == null || value === false) return;
      if (name === 'style') state = String(value);
      else if (name === 'className') element.className = String(value);
      else if (name === 'text') element.textContent = String(value);
      else element.setAttribute(name, value === true ? '' : String(value));
    });
    paintLook(element, state);
    children.flat(Infinity).forEach((child) => {
      if (child == null || child === false) return;
      element.appendChild(child?.nodeType ? child : document.createTextNode(String(child)));
    });
    return element;
  };
  const clearDom = (node) => { while (node?.firstChild) node.removeChild(node.firstChild); };
  const buttonClasses = (color, extra = '') => `bp-btn bp-tone-${color}${extra ? ` ${extra}` : ''}`;
  const buttonNode = (id, label, color, extra = '') =>
    dom('button', { type: 'button', id, className: buttonClasses(color, extra) }, label);
  const unescapeText = (value) => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (match, name) => ({
    amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'",
  })[name] || match);
  const appendRichText = (root, value) => {
    const source = String(value ?? '');
    const pattern = /<br>|<\/?strong>|<span style="([^"]*)">|<\/span>/g;
    const stack = [];
    let parent = root, at = 0;
    for (const match of source.matchAll(pattern)) {
      if (match.index > at) parent.appendChild(document.createTextNode(unescapeText(source.slice(at, match.index))));
      if (match[0] === '<br>') parent.appendChild(document.createElement('br'));
      else if (match[0][1] === '/') parent = stack.pop() || root;
      else {
        const child = dom(match[0] === '<strong>' ? 'strong' : 'span', match[1] ? { style: match[1] } : {});
        parent.appendChild(child);
        stack.push(parent);
        parent = child;
      }
      at = match.index + match[0].length;
    }
    if (at < source.length) parent.appendChild(document.createTextNode(unescapeText(source.slice(at))));
  };
  const restyle = (node, color, extra = '') => { if (node) { node.className = buttonClasses(color, extra); paintLook(node); } };
  const LOOK = [
    ['.bp-btn', BTN_BASE],
    ...TONES.map(color => [`.bp-tone-${color}`, tone(color)]),
    ['.bp-grow', 'flex:1;'],
    ['.bp-ctrl', 'flex:1;padding:8px 4px;'],
    ['.bp-mode', 'flex:1;padding:6px 4px;font-size:12px;'],
    ['.bp-full', 'width:100%;'],
    ['.bp-half', 'flex:1 1 calc(50% - 4px);min-width:0;'],
    ['.bp-pad6', 'padding:8px 6px;'],
    ['.bp-pad4', 'padding:8px 4px;'],
    ['.bp-gap-below', 'margin-bottom:8px;'],
    ['.bp-undo-button', 'padding:6px 10px;font-size:11px;flex:0 0 auto;'],
    ['.bp-row', 'gap:8px;'],
    ['.bp-sub', SUBTEXT],
    ['.bp-dim', `color:${PALETTE.subtle};`],
    ['.bp-sep', 'color:#4a4a4a;'],
    ['#bp-panel', `z-index:999999;width:360px;max-width:calc(100vw - 32px);background:${PALETTE.ink};color:#eeeeee;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.5);border:1px solid #242424;overflow:hidden;font-size:13px;line-height:1.5;max-height:calc(100vh - 32px);flex-direction:column;`],
    ['#bp-head', 'align-items:center;gap:8px;height:30px;padding:0 6px 0 12px;background:#1b1b1b;border-bottom:1px solid #242424;flex-shrink:0;user-select:none;'],
    ['#bp-mark', 'font-size:12px;font-weight:600;letter-spacing:.01em;color:#eeeeee;'],
    ['#bp-clock', `margin-left:auto;font-size:11px;color:${PALETTE.muted};font-variant-numeric:tabular-nums;white-space:nowrap;`],
    ['#bp-settings-open, #bp-x', 'width:24px;height:24px;padding:0;border:0;border-radius:6px;place-items:center;cursor:pointer;font-size:14px;line-height:1;'],
    ['#bp-x', 'background:transparent;color:#c7c7c7;'],
    ['#bp-input-nav', 'flex:0 0 auto;'],
    ['#bp-retained-files', 'margin-top:8px;'],
    ['#bp-retained-source', SUBTEXT + 'overflow-wrap:anywhere;margin-bottom:6px;'],
    ['#bp-manual-toggle', DISCLOSURE + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'],
    ['#bp-skip-badge', `color:${PALETTE.amber};`],
    ['#bp-manual-wrap', 'margin-top:6px;'],
    ['.bp-mode-row', 'margin-bottom:6px;'],
    ['#bp-manual-box', TEXTAREA],
    ['#bp-manual-count', SUBTEXT + 'margin:6px 0;'],
    ['#bp-add-row, #bp-skip-row', 'margin-top:8px;'],
    ['#bp-skip-clear-wrap', 'flex:1;'],
    ['.bp-setting', 'margin-top:10px;'],
    ['.bp-setting-label', 'font-size:12px;margin-bottom:4px;'],
    ['.bp-setting-field', TEXTAREA + 'font-family:inherit;font-size:12px;'],
    ['.bp-setting-select', 'position:static;height:auto;min-height:36px;overflow:visible;clip:auto;clip-path:none;visibility:visible;appearance:auto;'],
    ['.bp-heading', 'font-size:13px;font-weight:700;'],
    ['#bp-inner', 'padding:12px;flex-direction:column;gap:12px;'],
    ['#bp-status, #bp-recovery-note', 'font-weight:600;font-size:12px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;'],
    ['#bp-meter', 'align-items:baseline;gap:8px;'],
    ['#bp-counts', 'flex:1;min-width:0;font-size:12px;font-weight:500;'],
    ['#bp-bar-txt', `font-size:11px;color:${PALETTE.muted};font-variant-numeric:tabular-nums;white-space:nowrap;`],
    ['#bp-track', `background:${SURFACE};border-radius:8px;height:8px;overflow:hidden;margin:6px 0 0;`],
    ['#bp-bar', `height:100%;background:${PALETTE.green};transition:width .2s linear;border-radius:8px;`],
    ['#bp-more, #bp-controls', 'flex-direction:column;gap:8px;'],
    ['#bp-alternatives', 'flex-wrap:wrap;gap:8px;'],
    ['#bp-retry-wrap, #bp-undo-wrap', 'flex:1 1 calc(50% - 4px);min-width:0;'],
    ['#bp-recovery-title', 'font-size:13px;font-weight:700;margin:0 0 4px;outline:none;'],
    ['#bp-body', 'overflow-y:auto;min-height:0;flex:1 1 auto;'],
    ['.bp-modal-back', 'position:fixed;inset:0;z-index:1000000;background:rgba(10,10,10,.6);align-items:center;justify-content:center;'],
    ['.bp-modal-card', `width:360px;max-width:90vw;background:${PALETTE.ink};color:#eeeeee;border-radius:14px;border:1px solid #242424;box-shadow:0 16px 48px rgba(0,0,0,.6);overflow:hidden;animation:bp-pop .18s ease;`],
    ['.bp-modal-title', 'padding:8px 12px;background:#1b1b1b;border-bottom:1px solid #242424;font-weight:700;color:#eeeeee;font-size:14px;'],
    ['.bp-modal-message', 'padding:12px;font-size:13px;line-height:1.6;color:#eeeeee;'],
    ['.bp-modal-choices', 'padding:0 12px 12px;'],
    ['.bp-stack', 'flex-direction:column;gap:8px;'],
    ['#bp-shield', 'position:fixed;inset:0;z-index:999990;background:transparent;cursor:not-allowed;'],
    ['.bp-col', 'border-radius:8px;padding:8px 10px 9px;margin:0 0 4px;cursor:pointer;'],
    ['.bp-col-top', 'align-items:center;gap:9px;line-height:17px;'],
    ['.bp-col-box', 'position:absolute;width:1px;height:1px;opacity:0;margin:0;'],
    ['.bp-hd', 'flex:1;min-width:0;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'],
    ['.bp-nm', 'flex:0 0 auto;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;'],
    ['.bp-col-detail', 'align-items:center;gap:8px;margin:3px 0 0;'],
    ['.bp-col-where', `flex:0 1 125px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;font-size:10px;font-weight:500;color:${PALETTE.subtle};background:#242424;border-radius:4px;padding:2px 5px;`],
    ['.bp-col-kind', 'flex:0 0 auto;font-size:10px;font-weight:600;'],
    ['.bp-col-preview', `flex:1;min-width:0;font-family:monospace;font-size:10px;line-height:1.3;color:${PALETTE.subtle};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`],
    ['.bp-meter', 'flex:0 0 30px;height:3px;border-radius:2px;background:#2a2a2a;overflow:hidden;'],
    ['.bp-meter-fill', `height:100%;background:${PALETTE.subtle};`],
    ['#bp-column-list', 'overflow-y:auto;overscroll-behavior:contain;padding-right:6px;margin-right:-6px;'],
    ['.bp-col-group', `border-top:1px solid #3a3a3a;padding-top:8px;margin-top:8px;color:${PALETTE.amber};font-size:11px;font-weight:700;`],
    ['#bp-column-count', `font-size:11px;line-height:1.4;margin:8px 0 0;font-weight:600;color:${PALETTE.muted};`],
    ['.bp-picked', `flex:0 0 auto;font-size:10px;font-weight:700;color:${PALETTE.greenText};`],
    ['.bp-shared', `color:${PALETTE.subtle};font-weight:400;`],
    ['.bp-gap-top', 'margin-top:8px;'],
    ['.bp-gap-top-wide', 'margin-top:12px;'],
    ['#bp-confirm-sources', 'font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'],
    ['#bp-confirm-summary', 'font-size:12px;font-weight:600;margin-top:2px;'],
    ['.bp-batch', `align-items:center;gap:8px;background:${SURFACE};border-radius:8px;padding:8px;`],
    ['.bp-batch-gap', 'margin-bottom:6px;'],
    ['.bp-batch-text', 'flex:1;min-width:0;font-size:11px;line-height:1.45;'],
    ['.bp-batch-name', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'],
  ];
  const lookFor = (node) => LOOK.filter(([names]) => names.split(', ').some((name) => (name[0] === '#'
    ? node.id === name.slice(1) : node.classList.contains(name.slice(1))))).map(([, body]) => body).join('');
  function paintLook(node, state = '') { node.style.cssText = lookFor(node) + state; }
  style = document.createElement('style');
  style.textContent = `
    #bp-panel { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
    #bp-panel, .bp-modal-back { user-select:none;-webkit-user-select:none; }
    #bp-panel textarea, #bp-panel input { user-select:text;-webkit-user-select:text; }
    #bp-panel textarea::placeholder { color:${PALETTE.subtle};opacity:1; }
    #bp-panel button { transition:filter .15s ease,transform .15s ease,box-shadow .15s ease,background-color .12s ease,opacity .12s ease; }
    #bp-panel button:hover:not(:disabled) { filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.4); }
    #bp-panel button:active:not(:disabled) { transform:scale(.985);filter:brightness(.95);transition-duration:.12s; }
    #bp-panel button:disabled { opacity:.5;cursor:not-allowed; }
    #bp-panel .bp-col { background:#1c1c1c; }
    #bp-panel .bp-col:hover { background:#1e1e1e; }
    #bp-panel .bp-col .bp-hd { color:#eeeeee; }
    #bp-panel .bp-col .bp-nm { color:${PALETTE.muted}; }
    #bp-panel .bp-col.bp-on .bp-hd, #bp-panel .bp-col.bp-on .bp-nm { color:${PALETTE.greenText}; }
    #bp-panel .bp-col.bp-on .bp-meter i { background:${PALETTE.muted}; }
    @media (prefers-reduced-motion: no-preference) {
      #bp-panel .bp-col { transition:background .12s ease,color .12s ease; }
    }
    #bp-panel button:focus-visible, #bp-panel textarea:focus-visible,
    #bp-panel input:focus-visible, #bp-status:focus-visible, #bp-recovery-note:focus-visible, #bp-settings select:focus-visible, .bp-modal-card button:focus-visible {
      outline:2px solid ${PALETTE.bright};outline-offset:2px;
    }
    #bp-panel.bp-drop-target, #bp-panel .bp-drop-target {
      outline:2px dashed ${PALETTE.blue};outline-offset:-3px;
    }
    #bp-panel *::-webkit-scrollbar { width:7px;height:7px; }
    #bp-panel *::-webkit-scrollbar-thumb { background:#3a3a3a;border-radius:8px; }
    #bp-panel *::-webkit-scrollbar-track { background:${SURFACE}; }
    #bp-mark:hover:not(:disabled),#bp-manual-toggle:hover:not(:disabled),
    #bp-x:hover:not(:disabled),#bp-settings-open:hover:not(:disabled) { filter:none;transform:none;box-shadow:none; }
    #bp-x:hover { background:#242424!important;color:#ffffff!important; }
    #bp-settings-open:hover:not(:disabled) { background:#242424!important;color:#ffffff!important; }
    #bp-settings-open.bp-settings-highlight:not(:disabled),
    #bp-settings-open.bp-settings-highlight:hover:not(:disabled) { background:${PALETTE.blue}24!important;color:${PALETTE.blue}!important; }
    #bp-x,#bp-settings-open { transition:background .14s ease,color .14s ease; }
    #bp-bar { background:linear-gradient(90deg,${PALETTE.greenDk},${PALETTE.green})!important; }
    .bp-modal-card button { transition:filter .15s ease,transform .15s ease; }
    .bp-modal-card button:hover { filter:brightness(1.08);transform:translateY(-1px); }
    @keyframes bp-pop { from{opacity:0;transform:translateY(8px) scale(.97)} to{opacity:1;transform:none} }
    @keyframes bp-fade { from{opacity:0} to{opacity:1} }
    @keyframes bp-enter { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
    @keyframes bp-back { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
    @media (prefers-reduced-motion: no-preference) {
      #bp-body { transition:height .4s cubic-bezier(.19,1,.22,1); }
      #bp-panel .bp-enter { animation:bp-enter .2s cubic-bezier(.455,.03,.515,.955); }
      #bp-panel .bp-back { animation:bp-back .2s cubic-bezier(.455,.03,.515,.955); }
      #bp-panel label { transition:background .12s ease, box-shadow .12s ease; }
    }
    @media (prefers-reduced-motion: reduce) {
      #bp-panel button:hover:not(:disabled) { transform:none;box-shadow:none; }
      #bp-panel button:active:not(:disabled) { transform:none; }
      #bp-x:hover { transform:none; }
      .bp-modal-card button:hover { transform:none; }
      .bp-modal-back,.bp-modal-card { animation:none; }
      #bp-bar { transition:none; }
    }
  `;
  document.head.appendChild(style);
  shield = document.createElement('div');
  shield.id = 'bp-shield';
  paintLook(shield, 'display:none;');
  ['click', 'mousedown', 'mouseup', 'dblclick', 'wheel', 'contextmenu', 'touchstart'].forEach((event) =>
    on(shield, event, (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true, passive: false })
  );
  document.body.appendChild(shield);
  on(document, 'dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer && !e.__bpClaimed) e.dataTransfer.dropEffect = 'none';
  });
  on(document, 'drop', (e) => { clearDropTargets(); e.preventDefault(); });
  on(document, 'dragend', () => clearDropTargets());
  on(document, 'dragleave', (e) => { if (!e.relatedTarget) clearDropTargets(); });
  on(window, 'blur', () => clearDropTargets());
  const focusableWithin = (root, selector = 'button, input, textarea, select, a[href], [tabindex]') => root ? [...root.querySelectorAll(selector)].filter((node) => !node.disabled && node.getAttribute('tabindex') !== '-1' && node.offsetParent !== null) : [];
  let modalSeq = 0, reportSettingsOpened = false, inputReading = false;
  const syncSettingsControl = () => {
    const locked = hasSettlement('lookup') || hasSettlement('setup') || Boolean(cancelOpenModal) || recovering();
    if (shield) shield.style.display = locked ? 'block' : 'none';
    panel?.setAttribute('aria-modal', String(locked));
    const button = document.getElementById('bp-settings-open');
    if (!button) return;
    button.disabled = inputReading || hasSettlement('lookup') || hasSettlement('setup') || Boolean(cancelOpenModal) || recovering();
    const open = document.getElementById('bp-settings')?.style.display !== 'none';
    if (open) reportSettingsOpened = true;
    const highlighted = !button.disabled && (open || !reportSettingsOpened);
    button.classList.toggle('bp-settings-highlight', highlighted);
    button.style.color = highlighted ? PALETTE.blue : '#c7c7c7';
    button.style.background = highlighted ? `${PALETTE.blue}24` : 'transparent';
    button.setAttribute('aria-pressed', String(open));
    button.setAttribute('aria-expanded', String(open));
  };
  const choiceModal = ({ title, message, choices, defaultValue, cancelValue }) => (
    recovering() ? Promise.resolve(cancelValue) : new Promise((resolve) => {
    const returnFocusTo = document.activeElement;
    const titleId = `bp-modal-title-${++modalSeq}`;
    const backdrop = document.createElement('div');
    backdrop.className = 'bp-modal-back';
    paintLook(backdrop, 'display:flex;animation:bp-fade .18s ease;');
    const card = dom('div', { className: 'bp-modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
    const titleNode = dom('div', { id: titleId, className: 'bp-modal-title' }, title);
    const messageNode = dom('div', { className: 'bp-modal-message' });
    appendRichText(messageNode, message);
    const stackedChoices = choices.length > 2 || choices.some((choice) => choice.color === 'red');
    const choiceNodes = dom('div', { className: `bp-modal-choices ${stackedChoices ? 'bp-stack' : 'bp-row'}`, style: 'display:flex;' });
    choices.forEach((choice, index) => choiceNodes.appendChild(dom('button', {
      type: 'button', 'data-choice': index, className: buttonClasses(choice.color || 'gray', 'bp-grow'),
    }, choice.label)));
    card.append(titleNode, messageNode, choiceNodes);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      removeKey();
      const parked = tool.cleanups.indexOf(removeKey);
      if (parked >= 0) tool.cleanups.splice(parked, 1);
      if (cancelOpenModal === dismiss) cancelOpenModal = null;
      syncSettingsControl();
      try { if (returnFocusTo?.isConnected && returnFocusTo.getClientRects().length) returnFocusTo.focus(); } catch {   }
      resolve(value);
      backdrop.style.pointerEvents = 'none';
      backdrop.style.animation = 'none';
      backdrop.style.transition = 'opacity .12s ease';
      backdrop.style.opacity = '0';
      setTimeout(() => backdrop.remove(), 120);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); finish(cancelValue); }
      if (e.key === 'Enter') {
        const onButton = backdrop.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON';
        if (!onButton) { e.stopImmediatePropagation(); finish(defaultValue); }
      }
      if (e.key === 'Tab') {
        const stops = focusableWithin(backdrop);
        if (!stops.length) return;
        e.preventDefault();
        const at = stops.indexOf(document.activeElement);
        stops[(at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
      }
    };
    const dismiss = () => finish(cancelValue);
    cancelOpenModal = dismiss;
    syncSettingsControl();
    const removeKey = on(document, 'keydown', onKey, true);
    backdrop.querySelectorAll('button[data-choice]').forEach((node) => {
      const choice = choices[Number(node.dataset.choice)];
      node.onclick = () => finish(choice.value);
      if (choice.value === defaultValue) node.focus();
    });
    let pressedBackdrop = false;
    backdrop.addEventListener('mousedown', (e) => { pressedBackdrop = e.target === backdrop; });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && pressedBackdrop) finish(cancelValue);
      pressedBackdrop = false;
    });
  }));
  const confirmModal = (title, message, yesLabel = 'Yes', noLabel = 'No', yesColor = 'red') => choiceModal({
    title, message,
    choices: [
      { value: false, label: noLabel, color: 'gray' },
      { value: true, label: yesLabel, color: yesColor },
    ],
    defaultValue: false,
    cancelValue: false,
  });
  panel = document.createElement('div');
  panel.id = 'bp-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'Yoink bulk add');
  panel.setAttribute('tabindex', '-1');
  paintLook(panel, 'position:fixed;top:16px;right:16px;display:flex;');
  const head = dom('div', { id: 'bp-head', style: 'display:flex;' },
    dom('span', { id: 'bp-mark', title: `Build ${VERSION}` }, 'Yoink'),
    dom('span', { id: 'bp-clock', title: 'Adding time left on this page' }),
    reportMode ? dom('button', { type: 'button', id: 'bp-settings-open', 'aria-label': 'Settings', title: 'Settings',
      'aria-pressed': 'false', 'aria-expanded': 'false', 'aria-controls': 'bp-settings',
      style: 'background:transparent;display:grid;color:#c7c7c7;' }, '⚙') : null,
    dom('button', { type: 'button', id: 'bp-x', 'aria-label': 'Close Yoink', title: 'Close', style: 'display:grid;' }, '×'));
  const input = dom('div', { id: 'bp-input', style: 'display:none;' },
    dom('div', { className: 'bp-row', style: 'display:flex;' }, dom('div', { id: 'bp-input-nav', style: 'display:none;' }, buttonNode('bp-input-back', '← Back', 'gray')), buttonNode('bp-use-file', 'Load / drop files', 'blue', 'bp-grow')),
    dom('div', { id: 'bp-retained-files', style: 'display:none;' },
      dom('div', { id: 'bp-retained-source' })),
    dom('button', { type: 'button', id: 'bp-manual-toggle', 'aria-expanded': 'false', 'aria-controls': 'bp-manual-wrap', style: 'display:block;' },
      dom('span', { id: 'bp-manual-toggle-label' }, '▸ Paste / skip list'), dom('span', { id: 'bp-skip-badge' })),
    dom('div', { id: 'bp-manual-wrap', style: 'display:none;' },
      dom('div', { role: 'group', 'aria-label': 'What the box below is for', className: 'bp-row bp-mode-row', style: 'display:flex;' },
        buttonNode('bp-mode-add', 'Add these', 'gray', 'bp-mode'), buttonNode('bp-mode-skip', 'Skip these', 'gray', 'bp-mode')),
      dom('textarea', { id: 'bp-manual-box', rows: '4', style: 'display:block;' }),
      dom('div', { id: 'bp-manual-count' }),
      dom('div', { id: 'bp-add-row', style: 'display:none;' }, buttonNode('bp-use-paste', 'Add pasted', 'green', 'bp-full')),
      dom('div', { id: 'bp-skip-row', className: 'bp-row', style: 'display:flex;' },
        buttonNode('bp-exclude-file', 'Load / drop skip list', 'gray', BTN_CTRL), dom('span', { id: 'bp-skip-clear-wrap', style: 'display:none;' }, buttonNode('bp-exclude-clear', 'Clear', 'gray', 'bp-full bp-pad4'))),
      dom('textarea', { id: 'bp-paste', style: 'display:none;', 'aria-hidden': 'true', tabindex: '-1' }),
      dom('textarea', { id: 'bp-exclude', style: 'display:none;', 'aria-hidden': 'true', tabindex: '-1' })));
  const settingsField = (key, tag) => dom('div', { className: 'bp-setting' },
    dom('label', { for: `bp-setting-${key}`, className: 'bp-setting-label', style: 'display:block;' }, REPORT_PAGE.labels[key]),
    dom(tag, { id: `bp-setting-${key}`, className: `bp-setting-field${tag === 'select' ? ' bp-setting-select' : ''}`, type: tag === 'input' ? 'text' : null,
      placeholder: tag === 'input' ? 'mm/dd/yyyy' : null, style: 'display:block;' }));
  const settings = reportMode ? dom('div', { id: 'bp-settings', style: 'display:none;' },
    dom('div', { className: 'bp-heading' }, 'Settings'),
    settingsField('start', 'input'), settingsField('end', 'input'),
    ...REPORT_PAGE.singles.map(key => settingsField(key, 'select'))) : null;
  const inner = dom('div', { id: 'bp-inner', style: 'display:flex;' },
    dom('div', { id: 'bp-status', tabindex: '0', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', style: 'white-space:nowrap;' }, 'Loading…'),
    input, settings,
    dom('div', { id: 'bp-column-picker', style: 'display:none;' }),
    dom('div', { id: 'bp-confirm', style: 'display:none;' }),
    dom('div', { id: 'bp-meter', style: 'display:none;' },
      dom('span', { id: 'bp-counts' }),
      dom('span', { id: 'bp-bar-txt' })),
    dom('div', { id: 'bp-progress', style: 'display:none;' }, dom('div', { id: 'bp-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': 'Entries processed' }, dom('div', { id: 'bp-bar', style: 'width:0%;' }))),
    dom('div', { id: 'bp-more', style: 'display:none;' },
      buttonNode('bp-csv-dl', 'Download CSV', 'blue', 'bp-full'),
      dom('div', { id: 'bp-alternatives', style: 'display:flex;' },
        buttonNode('bp-add-more', 'Another batch', 'blue', 'bp-half bp-pad6'),
        dom('div', { id: 'bp-retry-wrap', style: 'display:none;' }, buttonNode('bp-retry', 'Retry', 'amber', 'bp-full bp-pad6')),
        dom('div', { id: 'bp-undo-wrap', style: 'display:none;' }, buttonNode('bp-undo-toggle', '↩ Undo a batch', 'gray', 'bp-full bp-pad6'))),
      dom('div', { id: 'bp-batches', style: 'display:none;' }),
      buttonNode('bp-cancel-all', 'Start over', 'red', 'bp-full')),
    dom('div', { id: 'bp-controls', style: 'display:none;' }, buttonNode('bp-pause', 'Pause', 'blue', 'bp-full'), buttonNode('bp-stop', 'Cancel this batch', 'red', 'bp-full')),
    dom('div', { id: 'bp-recovery', style: 'display:none;' },
      dom('div', { id: 'bp-recovery-title', tabindex: '-1' }, 'Run stopped safely'),
      buttonNode('bp-recovery-csv', 'Download CSV', 'blue', 'bp-full bp-gap-below'),
      buttonNode('bp-recovery-reload', 'Reload page', 'red', 'bp-full')));
  panel.append(head, dom('div', { id: 'bp-body' }, inner));
  document.body.appendChild(panel);
  on(panel, 'mousedown', (event) => {
    event.stopPropagation();
    const control = event.target.closest('button, input, textarea, select, a[href], label, summary, [role="button"], [contenteditable], .bp-modal-back, .bp-modal-card, dialog, [role="dialog"]');
    if (event.button === 0 && !(control && control !== panel && panel.contains(control))) event.preventDefault();
  });
  on(panel, 'click', (event) => event.stopPropagation());
  panel.focus({ preventScroll: true });
  const el = (id) => document.getElementById(id);
  const messages = { status: { text: 'Loading…', title: '' }, live: '', pause: '', pauseNotice: '', resumed: '', held: null, readiness: '', recovery: '' };
  let statusText = 'Loading…';
  const paintStatus = n => {
    const expanded = document.activeElement === n;
    const warning = /[⚠✗]/u.test(statusText);
    n.style.display = statusText ? (warning && !expanded ? '-webkit-box' : 'block') : 'none';
    const full = expanded || Boolean(messages.readiness);
    n.style.whiteSpace = full ? 'pre-wrap' : statusText.includes('\n') ? 'pre-line' : warning ? 'normal' : 'nowrap';
    n.style.webkitLineClamp = warning && !full ? '2' : '';
    n.style.webkitBoxOrient = warning && !full ? 'vertical' : '';
    n.style.overflowWrap = expanded ? 'anywhere' : '';
    const banner = Boolean(messages.readiness) || statusText.startsWith('✗');
    n.style.background = banner ? '#451f1f' : '';
    n.style.color = banner ? '#ffb3ae' : '';
    n.style.padding = banner ? '8px 10px' : '';
    n.style.borderRadius = banner ? '8px' : '';
    const text = expanded ? n.title || statusText : statusText;
    if (n.textContent !== text) n.textContent = text;
  };
  on(el('bp-status'), 'focus', event => paintStatus(event.currentTarget));
  on(el('bp-status'), 'blur', event => paintStatus(event.currentTarget));
  const renderMessage = (required = false) => {
    const n = el('bp-status') || el('bp-recovery-note');
    if (!n && !required) return;
    let text, title;
    if (messages.recovery) text = messages.recovery;
    else if (messages.readiness) {
      text = [messages.held?.text, messages.status.text, messages.readiness].filter(Boolean).join('\n');
      title = [messages.held?.title, messages.status.title || messages.status.text, messages.readiness].filter(Boolean).join('\n');
    }
    else if (messages.held) ({ text, title } = messages.held);
    else if (messages.pause) text = [messages.pauseNotice, messages.pause].filter(Boolean).join('\n');
    else {
      text = [messages.status.text, messages.live, messages.resumed].filter(Boolean).join('\n');
      title = [messages.status.title || messages.status.text, messages.live, messages.resumed].filter(Boolean).join('\n');
    }
    statusText = text || '';
    if (n && statusText) n.style.display = 'block';
    if (required || n.textContent !== statusText) n.textContent = statusText;
    n.title = messages.recovery ? '' : title || statusText;
    paintStatus(n);
  };
  const clearHeldMessage = () => { messages.held = null; renderMessage(); };
  const messageStatus = () => ({ ...messages.status });
  const setPauseMessage = (text, notice = false) => {
    if (recovering()) return;
    if (notice) messages.pauseNotice = text;
    else {
      if (text && runPaused()) { messages.held = null; messages.resumed = ''; }
      messages.pause = text && runPaused() ? text : '';
      messages.pauseNotice = '';
      messages.resumed = text && !runPaused() ? text : '';
    }
    renderMessage(true);
  };
  const setRecoveryMessage = text => {
    messages.recovery = text;
    const n = el('bp-status');
    if (n) n.id = 'bp-recovery-note';
    renderMessage();
  };
  const setStatus = (text, title = '') => {
    if (recovering()) return;
    const value = { text: text || '', title: title || text || '' };
    if (/[⚠✗]/u.test(value.text)) messages.held = value;
    else messages.status = value;
    renderMessage();
  };
  const clip = (v, n = 30) => {
    const s = String(v ?? '');
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  };
  const setLive = (text) => {
    if (text && recovering()) return;
    messages.live = text || '';
    renderMessage();
  };
  const ANIMATED = new Set(['bp-input', 'bp-settings', 'bp-column-picker', 'bp-confirm', 'bp-more',
    'bp-recovery', 'bp-controls', 'bp-manual-wrap', 'bp-batches', 'bp-meter']);
  let goingBack = false;
  const show = (id, visible, display = 'block') => {
    if (visible && recovering() && id !== 'bp-recovery') return;
    const n = el(id);
    if (!n) return;
    const wasHidden = n.style.display === 'none';
    n.style.display = visible ? display : 'none';
    if (id === 'bp-settings') syncSettingsControl();
    if (visible && wasHidden && ANIMATED.has(id)) {
      const which = goingBack ? 'bp-back' : 'bp-enter';
      goingBack = false;
      n.classList.remove('bp-enter', 'bp-back');
      void n.offsetWidth;
      n.classList.add(which);
    }
  };
  const showReadiness = ({ ready, failures }) => {
    if (!ready) {
      messages.status = { text: '', title: '' };
      messages.readiness = failures.length === 1
        ? `● Not ready — ${failures[0]}`
        : `● Not ready — ${failures.length} problems:\n${failures.map(failure => `• ${failure}`).join('\n')}`;
      renderMessage();
      return;
    }
    messages.readiness = '';
    renderMessage();
  };
  const askOne = (choices) => new Promise((resolve) => {
    const entries = Object.entries(choices).map(([id, value]) => [el(id), value]);
    if (entries.some(([node]) => !node)) return resolve(entries[entries.length - 1][1]);
    entries.forEach(([node, value]) => { node.onclick = () => resolve(value); });
  });
  const pageAge = () => performance.now();
  const lookupTimings = [];
  const recordLookupTiming = ms => { if (Number.isFinite(ms) && ms >= 0) lookupTimings.push(ms); };
  const lookupEstimate = () => {
    if (!lookupTimings.length) return 710;
    const sorted = [...lookupTimings].sort((a, b) => a - b);
    return sorted[Math.ceil(sorted.length * 0.9) - 1];
  };
  const lookupBudgetEstimate = () => lookupEstimate() * (lookupTimings.length ? 1 : 1.35);
  const batchFits = count => !count || count * lookupBudgetEstimate() <= 50 * 60000 - pageAge();
  let updateConfirmationEstimate = null, addClockStarted = false;
  const startAddClock = () => {
    if (addClockStarted) return;
    addClockStarted = true;
    const tick = () => {
      if (!active()) return;
      const seconds = Math.ceil(Math.max(0, 60 * 60000 - pageAge()) / 1000);
      el('bp-clock').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      updateConfirmationEstimate?.();
    };
    tick();
    const timer = setInterval(tick, 1000);
    tool.cleanups.push(() => clearInterval(timer));
  };
  const sessionExpiredOnPage = () => {
    if (!SESSION_EXPIRED_SELECTOR) return false;
    try {
      return [...document.querySelectorAll(SESSION_EXPIRED_SELECTOR)]
        .some((node) => {
          if (node.closest('#bp-panel, template, [inert], [hidden], [aria-hidden="true"]')) return false;
          for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
            const css = getComputedStyle(ancestor);
            if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse') return false;
          }
          return node.getClientRects().length > 0;
        });
    } catch { return false; }
  };
  const enterRecovery = (mode, detail = '') => {
    if (recovering()) return recoveryTask || Promise.resolve();
    if (!moveRun('recovery')) return Promise.resolve();
    runState.reason = mode;
    cancelPendingFileInteraction();
    try { cancelOpenModal?.(); } catch {   }
    panel?.removeAttribute('aria-busy');
    clearDropTargets();
    ['bp-input', 'bp-settings', 'bp-column-picker', 'bp-confirm', 'bp-more', 'bp-controls',
      'bp-progress', 'bp-manual-wrap', 'bp-batches'].forEach((id) => show(id, false));
    setLive('');
    setRecoveryMessage(mode === 'session'
      ? '⏳ Session expired. Finishing the current lookup…'
      : `⏳ The stalled run was stopped${detail ? ` after ${detail}` : ''}. Finishing the current lookup…`);
    show('bp-recovery', true);
    if (shield) shield.style.display = 'block';
    if (panel) panel.setAttribute('aria-modal', 'true');
    const reload = el('bp-recovery-reload'), csv = el('bp-recovery-csv');
    if (reload) reload.disabled = true;
    if (csv) csv.disabled = true;
    requestAnimationFrame(() => el('bp-recovery-title')?.focus({ preventScroll: true }));
    recoveryTask = (async () => {
      while (runState.settlements.size && active()) await wait(50);
      if (!active()) return;
      if (isRetry(state.pendingBatch)) settleRetry(state.pendingBatch);
      else commitBatch(state.pendingBatch);
      state.queuedBatches.splice(0).forEach(commitBatch);
      renderCounts();
      if (active()) {
        const lead = mode === 'session' ? '✗ Session expired. ' : '⚠ Stop — the stalled run was stopped safely. ';
        setRecoveryMessage(`${lead}Reload the page before adding again.`);
      }
      if (reload && active()) reload.disabled = false;
      if (csv && active()) csv.disabled = false;
    })();
    return recoveryTask;
  };
  const onSessionLost = (reason) => {
    if ((recovering() && runState.reason === 'session') || !active()) return;
    enterRecovery('session', reason);
  };
  let stallPrompted = false;
  const watchStalls = () => {
    const timer = setInterval(async () => {
      if (!active() || !hasSettlement('lookup') || runPaused() || stallPrompted) return;
      if (document.querySelector('.bp-modal-back')) return;
      const idleFor = Date.now() - lastProgressAt;
      if (idleFor < T.wait * 3) return;
      stallPrompted = true;
      const bail = await confirmModal('Run appears stalled',
        `Nothing has moved for ${fmt(idleFor)}. Stop and keep the results so far, or keep waiting.`,
        'Stop safely', 'Keep waiting', 'amber');
      if (bail && active() && !recovering()) {
        await enterRecovery('stall', fmt(idleFor));
      }
      lastProgressAt = Date.now();
      stallPrompted = false;
    }, T.stallCheck);
    tool.cleanups.push(() => clearInterval(timer));
  };
  const watchSession = () => {
    if (SESSION_EXPIRED_SELECTOR && window.MutationObserver) {
      const check = () => { if (sessionExpiredOnPage()) onSessionLost('the page reported the session expired'); };
      const observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'inert'] });
      tool.cleanups.push(() => observer.disconnect());
      check();
    }
  };
  const destroy = () => {
    if ((runState.phase === 'closed')) return;
    const focusTarget = focusBeforeYoink?.isConnected
      ? focusBeforeYoink
      : document.querySelector('button[data-action="view-report"], button.js-clear-search, [data-action="search-again"]');
    moveRun('closed');
    cancelPendingFileInteraction();
    clearDropTargets();
    dropTargets.clear();
    tool.active = false;
    tool.cleanups.splice(0).forEach((remove) => { try { remove(); } catch {} });
    panel?.remove();
    shield?.remove();
    style?.remove();
    if (window[TOOL_KEY] === tool) delete window[TOOL_KEY];
    requestAnimationFrame(() => { try { focusTarget?.focus(); } catch {   } });
  };
  const confirmClose = async () => {
    if (recovering()) { await recoveryTask; destroy(); return; }
    if (!hasSettlement('lookup') && !hasSettlement('setup')) { destroy(); return; }
    if (await confirmModal('Close Yoink?', 'Stops the current batch.', 'Close', 'Keep working')) destroy();
  };
  el('bp-x').onclick = confirmClose;
  const focusablePanelNodes = () => focusableWithin(panel, 'button, textarea, input, select, [tabindex]');
  on(document, 'keydown', (e) => {
    if (!active()) return;
    if (e === reportDateEscape) return;
    const modalOpen = Boolean(document.querySelector('.bp-modal-back'));
    if (e.key === 'Escape' && !modalOpen) {
      if (clearDropTargets()) { e.preventDefault(); return; }
      if (!panel.contains(e.target)) return;
      const picker = el('bp-column-picker');
      if (picker && picker.style.display !== 'none') { (el('bp-column-cancel') || el('bp-confirm-back'))?.click(); return; }
      confirmClose();
      return;
    }
    if (e.key !== 'Tab' || modalOpen || panel.getAttribute('aria-modal') !== 'true') return;
    const stops = focusablePanelNodes();
    if (!stops.length) { e.preventDefault(); panel.focus(); return; }
    const at = stops.indexOf(document.activeElement);
    if (at < 0) {
      e.preventDefault();
      stops[e.shiftKey ? stops.length - 1 : 0].focus();
    } else if ((!e.shiftKey && at === stops.length - 1) || (e.shiftKey && at === 0)) {
      e.preventDefault();
      stops[e.shiftKey ? stops.length - 1 : 0].focus();
    }
  });
  (() => {
    const margin = 8, header = el('bp-head');
    header.style.cursor = 'move';
    let moved = false, press = null;
    const place = (left, top) => {
      const rect = panel.getBoundingClientRect();
      const viewport = document.documentElement;
      const x = Math.max(margin, Math.min(left, viewport.clientWidth - rect.width - margin));
      const y = Math.max(margin, Math.min(top, viewport.clientHeight - rect.height - margin));
      for (const [name, value] of [['left', `${x}px`], ['top', `${y}px`], ['right', 'auto']]) {
        if (panel.style.getPropertyValue(name) !== value) panel.style.setProperty(name, value);
      }
    };
    const reclamp = () => {
      if (!moved || !active()) return;
      const rect = panel.getBoundingClientRect();
      place(rect.left, rect.top);
    };
    const stop = () => { press = null; };
    const pointer = Boolean(window.PointerEvent);
    on(header, pointer ? 'pointerdown' : 'mousedown', event => {
      if (!active() || event.button !== 0 || event.isPrimary === false
        || event.target.closest('button, input, textarea, select, a[href], [role="button"]')) return;
      const rect = panel.getBoundingClientRect();
      press = { x: event.clientX, y: event.clientY, dx: event.clientX - rect.left,
        dy: event.clientY - rect.top, id: event.pointerId, dragging: false };
    });
    on(document, pointer ? 'pointermove' : 'mousemove', event => {
      if (!press || !active() || (pointer && event.pointerId !== press.id)) return;
      if (!(event.buttons & 1)) return stop();
      if (!press.dragging && Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y) < 4) return;
      press.dragging = moved = true;
      place(event.clientX - press.dx, event.clientY - press.dy);
      event.preventDefault();
    }, { capture: true, passive: false });
    on(document, pointer ? 'pointerup' : 'mouseup', event => {
      if (!pointer || event.pointerId === press?.id) stop();
    }, true);
    if (pointer) on(document, 'pointercancel', stop, true);
    on(window, 'blur', stop);
    on(window, 'resize', reclamp);
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(reclamp);
      observer.observe(panel);
      tool.cleanups.push(() => observer.disconnect());
    }
    tool.cleanups.push(stop);
  })();
  const freshState = () => ({
    people: new Map(), batches: [], pendingBatch: null, queuedBatches: [],
    batchSeq: 0, pasteSeq: 0, selectedSet: new Set(),
  });
  const state = freshState();
  const confirmedIdKeys = new Map();
  const forgetConfirmedIdKey = (key) => {
    for (const [term, stored] of confirmedIdKeys) if (stored === String(key)) confirmedIdKeys.delete(term);
  };
  const termOfEntry = entry => entry?.term || entry?.email || '';
  const inputKeys = () => state.batches.flatMap(batch => batch.people);
  const excludedKeys = () => state.batches.flatMap(batch => batch.skips.map(skip => skip.key));
  const isAdded = key => state.people.get(key)?.status === 'added';
  const batchSelected = batch => batch.people.filter(isAdded);
  const ownedAdded = batch => batch.created.map(key => {
    const person = state.people.get(key);
    return person?.owner === batch ? person.entry : null;
  }).filter(Boolean);
  const operationAdded = batch => (batch.operation?.created || []).map(key => state.people.get(key)?.entry).filter(Boolean);
  const removalEntries = batch => state.pendingBatch === batch ? operationAdded(batch) : ownedAdded(batch);
  const suppliedIndex = (extra = null) => {
    const preferred = new Map(), fallback = new Map();
    const take = (map, key, value) => {
      const old = map.get(key);
      if (!old || (!splitEmail(old).date && splitEmail(value).date)) map.set(key, value);
    };
    const batches = new Set([...state.batches, state.pendingBatch, extra,
      ...state.queuedBatches, ...[...state.people.values()].map(person => person.owner)]);
    for (const batch of batches) {
      if (!batch?.people) continue;
      for (const key of batch.people) {
        const person = state.people.get(key);
        if (person?.owner === batch) take(preferred, key, person.supplied);
      }
      for (const duplicate of batch.dupes) take(preferred, duplicate.key, duplicate.supplied);
      for (const skip of batch.skips) take(fallback, skip.key, skip.supplied);
    }
    for (const [key, value] of preferred) fallback.set(key, value);
    return fallback;
  };
  const suppliedOfTerm = (term, extra = null, index = null) =>
    (index || suppliedIndex(extra)).get(term) || term;
  const addedEntryOfTerm = () => new Map([...state.people].filter(([, person]) => person.entry).map(([key, person]) => [key, person.entry]));
  const newOperation = targets => ({ targets: targets.slice(), before: new Map(), touched: new Set(), created: [] });
  const snapshotPerson = (operation, key) => {
    if (!operation.before.has(key)) {
      const person = state.people.get(key);
      operation.before.set(key, person ? { ...person } : null);
    }
  };
  const settleLookup = (batch, key, result, pickedEmail) => {
    const person = state.people.get(key);
    if (!person) return;
    batch.operation.touched.add(key);
    person.status = result?.added || result === 'dup' ? 'added' : 'not_found';
    person.reason = person.status === 'added' ? '' : result === 'multiple' ? 'two people matched'
      : result === false ? 'no match' : 'did not finish';
    if (result?.added) {
      person.entry = { term: key, email: result.email || key, optionId: result.optionId ?? null,
        optionIdConfirmed: result.optionIdConfirmed === true, label: result.label || '' };
      if (!person.owner.created.includes(key)) person.owner.created.push(key);
      if (!batch.operation.created.includes(key)) batch.operation.created.push(key);
    } else if (result === 'dup' && !isId(key)) person.pickedEmail = pickedEmail;
  };
  const rollbackOperation = (batch, keep = []) => {
    if (!batch?.operation) return;
    const kept = new Set(keep);
    for (const [key, before] of batch.operation.before) {
      if (kept.has(key)) continue;
      const person = state.people.get(key);
      if (person?.entry && person.entry !== before?.entry) person.owner.created = person.owner.created.filter(term => term !== key);
      if (before) state.people.set(key, before); else state.people.delete(key);
    }
    batch.operation.created = batch.operation.created.filter(key => kept.has(key));
    if (batch.people) batch.people = batch.people.filter(key => state.people.get(key)?.owner === batch);
  };
  const dropOwnedPeople = (batch, keep = []) => {
    const kept = new Set(keep);
    for (const key of batch.people) if (!kept.has(key) && state.people.get(key)?.owner === batch) state.people.delete(key);
    batch.people = batch.people.filter(key => kept.has(key));
    batch.created = batch.created.filter(key => kept.has(key));
  };
  const keepUnremovedEntries = (batch, failed) => {
    if (state.pendingBatch === batch) rollbackOperation(batch, failed);
    else dropOwnedPeople(batch, failed);
    batch.dupes = [];
  };
  const isRetry = batch => batch?.kind === 'retry';
  const makeRetry = targets => {
    const operation = newOperation(targets);
    targets.forEach(key => snapshotPerson(operation, key));
    return { kind: 'retry', operation, source: `Retry of ${plural(targets.length, 'entry')}` };
  };
  const refreshRecordBoundary = () => {
    state.pendingBatch = null;
    try { state.selectedSet = selectedEmails(); }
    catch { state.selectedSet = null; }
  };
  const settleRetry = scratch => {
    const gained = operationAdded(scratch).length;
    state.pendingBatch = null;
    scratch.operation = null;
    refreshRecordBoundary(); renderCounts();
    return { gained };
  };
  const commitBatch = batch => {
    if (!batch) { state.pendingBatch = null; return; }
    if (!state.batches.includes(batch) && (batch.people.length || batch.skips.length || batch.dupes.some(duplicate => splitEmail(suppliedOfTerm(duplicate.key, batch)).date))) {
      state.batches.push(batch);
    }
    batch.operation = null;
    state.pendingBatch = null;
  };
  const runningCounts = () => {
    const pending = state.pendingBatch, active = new Set(inputKeys());
    for (const key of pending?.operation?.touched || []) active.add(key);
    let added = 0, notFound = 0;
    for (const key of active) {
      if (isAdded(key)) added++;
      else if (state.people.has(key)) notFound++;
    }
    const batches = [...state.batches];
    if (pending?.people && !batches.includes(pending)) batches.push(pending);
    return { added, notFound, dupes: new Set(batches.flatMap(batch => batch.dupes.map(duplicate => duplicate.key))).size,
      excluded: new Set(batches.flatMap(batch => batch.skips.map(skip => skip.key))).size };
  };
  const renderCounts = () => {
    const node = el('bp-counts');
    const { added, notFound, dupes, excluded } = runningCounts();
    if (node) {
      const parts = [
        { key: 'added', text: `${added} added`, color: PALETTE.greenText },
        notFound ? { key: 'missing', text: `${notFound} not found`, color: PALETTE.amber } : null,
        dupes ? { key: 'dupes', text: `${dupes} duplicate${dupes === 1 ? '' : 's'}`, color: PALETTE.muted } : null,
        excluded ? { key: 'excluded', text: `${excluded} skipped`, color: PALETTE.muted } : null,
      ].filter(Boolean);
      const wanted = new Set(parts.map(part => part.key));
      for (const child of [...node.children]) if (child.dataset.count && !wanted.has(child.dataset.count)) {
        child.previousSibling?.remove(); child.remove();
      }
      parts.forEach((part, i) => {
        let span = node.querySelector(`[data-count="${part.key}"]`);
        if (!span) {
          span = dom('span', { 'data-count': part.key, style: `color:${part.color};` }, part.text);
          const before = node.children[Math.max(0, i * 2 - 1)] || null;
          if (i) node.insertBefore(dom('span', { className: 'bp-sep' }, ' · '), before);
          node.insertBefore(span, before);
        } else if (span.textContent !== part.text) span.textContent = part.text;
      });
    }
    syncMeter();
  };
  const syncMeter = () => {
    const counts = el('bp-counts'), text = el('bp-bar-txt');
    show('bp-meter', Boolean((counts && counts.textContent) || (text && text.textContent)), 'flex');
  };
  const setBar = (done, total) => {
    const bar = el('bp-bar'), text = el('bp-bar-txt'), track = el('bp-track');
    const pct = total ? Math.round((done / total) * 100) : 100;
    if (bar) bar.style.width = `${pct}%`;
    if (track) {
      track.setAttribute('aria-valuenow', String(pct));
      track.setAttribute('aria-valuetext', `${done} of ${total}`);
    }
    const label = `${done}/${total}`;
    if (text) text.textContent = label;
    lastProgressAt = Date.now();
    syncMeter();
  };
  const { LIMITS: CSV_LIMITS } = __yoinkLoad('family/reader/limits.js');
  const csvCellTerms = (value) => {
    const text = String(value ?? '').trim();
    return !text ? [] : [takeValue(text) || text];
  };
  const wholeValue = (value) => {
    const text = String(value ?? '').trim();
    return Boolean(text && (wholeEmail(decodeInput(text)) || isId(text)));
  };
  const rejectedCellTerms = new WeakMap();
  const chosenCellTerms = choices => {
    const emails = choices.flatMap(choice => choice.emails || []);
    const rejected = new Set(choices.flatMap(choice => (choice.emails || []).filter(term => !lookupTerm(term))));
    rejectedCellTerms.set(emails, rejected);
    return { emails, rejected };
  };
  const rejectedSources = sources => uniq(sources.flatMap(source => [...(rejectedCellTerms.get(source.emails) || [])]));
  const columnPeople = new WeakMap();
  const columnSummariser = () => {
    const columns = [];
    let rows = 0;
    const row = (values) => {
      const firstRow = rows++ === 0;
      for (let ci = 0; ci < values.length; ci++) {
        if (!columns[ci]) {
          const firstValue = firstRow ? values[ci] : '';
          const firstCellIsTerm = wholeValue(firstValue);
          columns[ci] = { firstCellIsTerm, header: firstCellIsTerm ? '(no header row)' : String(firstValue ?? '').trim() || '(unnamed)',
            filled: 0, terms: 0, lookups: 0, mails: 0, digits: 0, seen: new Set(), sample: '', emails: [] };
        }
        const c = columns[ci];
        if (firstRow && !c.firstCellIsTerm) continue;
        const terms = csvCellTerms(values[ci]);
        if (terms.length) c.filled++;
        for (const term of terms) {
          c.terms++; if (inputEmails(term).length) c.mails++; else if (isId(term)) c.digits++;
          const looked = lookupTerm(term);
          if (looked) c.lookups++;
          if (looked && !c.sample) c.sample = term;
          const key = looked ? emailKey(term) : '';
          if (looked) c.seen.add(key);
          c.emails.push(term);
        }
      }
    };
    const choices = (file, sheetName) => columns.flatMap((c, ci) => {
      if (!c.lookups) return [];
      const choice = {
        file, sheetName, columnIndex: ci, column: `Column ${columnName(ci)}`, header: c.header,
        rows: Math.max(0, rows - (c.firstCellIsTerm ? 0 : 1)), filled: c.filled,
        label: `${sheetName} — ${c.header}`, unique: Math.max(1, c.seen.size), sample: c.sample,
        kind: classifyColumnCounts(c.terms, c.mails, c.digits, c.header),
        emails: c.emails,
      };
      columnPeople.set(choice, c.seen);
      return [choice];
    });
    return { row, choices, empty: sheetName => ({ sheetName, rows: Math.max(rows - 1, 0) }) };
  };
  const csvReadError = (file, error) => {
    if (error.stale) return { file: file.name, choices: [], empties: [], stale: true };
    const reason = String(error.message || '');
    return { file: file.name, choices: [], empties: [], error: true, reason };
  };
  const csvErrorMessage = (result) => {
    if (result.oversized) return result.reason;
    return `Could not read ${result.file}${result.reason ? `: ${result.reason}` : ''} → save it again as XLSX or CSV, then load it.`;
  };
  const loadChosenColumns = async (chosen, current = active) => {
    if (!current()) {
      const error = new Error('File reading stopped.'); error.stale = true; throw error;
    }
    return chosen.map(choice => ({ ...choice }));
  };
  const reportSettingKeys = ['start', 'end', ...REPORT_PAGE.singles];
  const reportSettings = reportMode ? { ...reportDates(),
    ...Object.fromEntries(REPORT_PAGE.singles.map(key => [key, REPORT_PAGE[key]])) } : null;
  const reportSettingsOptions = (key) => {
    const options = [...(reportField(key, true)?.options || [])]
      .filter((option) => option.value !== '' && !option.disabled && option.textContent.trim())
      .map((option) => option.textContent.trim());
    return options.length ? options : key === 'period' ? ['Day', 'Week', 'Period']
      : ['Audit & Assurance', 'Consulting Services', 'Talent'];
  };
  const reportDateValue = (text) => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if (!match) return null;
    const [, month, day, year] = match.map(Number);
    if (year < 1) return null;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() : null;
  };
  const readReportSettings = () => {
    if (reportMode) reportSettingKeys.forEach((key) => { reportSettings[key] = el(`bp-setting-${key}`).value; });
  };
  const validateReportSettings = () => {
    if (!reportMode) return '';
    readReportSettings();
    const start = reportDateValue(reportSettings.start), end = reportDateValue(reportSettings.end);
    if (start === null) return '✗ Start Week: use a real date in mm/dd/yyyy';
    if (end === null) return '✗ End Week: use a real date in mm/dd/yyyy';
    if (end <= start) return '✗ End Week must be after Start Week';
    if (end - start > 370 * 86400000) return '✗ Keep the dates within 370 days';
    if (!reportSettings.period) return '✗ Choose a Report Period → then ⚙';
    if (REPORT_PAGE.singles.includes('business') && !reportSettings.business) return '✗ Choose a Professional Business → then ⚙';
    return '';
  };
  let reportSettingsReturnStatus = { text: '', title: '' };
  let reportSettingsReturnScreen = [];
  const showReportSettings = (message = '') => {
    if (el('bp-settings')?.style.display === 'none') {
      reportSettingsReturnStatus = messageStatus();
      reportSettingsReturnScreen = [...el('bp-inner').children]
        .filter((node) => node.id !== 'bp-status' && node.id !== 'bp-settings')
        .map((node) => ({ node, display: node.style.display }));
    }
    reportSettingsReturnScreen.forEach(({ node }) => { node.style.display = 'none'; });
    show('bp-settings', true);
    setStatus(message);
    el('bp-setting-start')?.focus();
  };
  if (reportMode) {
    reportSettingKeys.forEach((key) => {
      const control = el(`bp-setting-${key}`);
      if (control.tagName === 'SELECT') {
        reportSettingsOptions(key).forEach((label) => control.appendChild(dom('option', { value: label }, label)));
        control.value = [...control.options].find((option) => norm(option.value) === norm(reportSettings[key]))?.value || '';
      } else control.value = reportSettings[key];
      on(control, 'input', readReportSettings);
      on(control, 'change', readReportSettings);
    });
    readReportSettings();
    syncSettingsControl();
    el('bp-settings-open').onclick = () => {
      if (el('bp-settings-open').disabled) return;
      if (el('bp-settings').style.display === 'none') return showReportSettings();
      const error = validateReportSettings();
      if (error) return setStatus(error);
      show('bp-settings', false);
      goingBack = true;
      reportSettingsReturnScreen.forEach(({ node, display }) => {
        show(node.id, display !== 'none', display || 'block');
        node.style.display = display;
      });
      setStatus(reportSettingsReturnStatus.text, reportSettingsReturnStatus.title);
      el('bp-settings-open').focus();
    };
  }
  const mostlyActiveIds = (active, shaped) => active > shaped / 2;
  const classifyColumnCounts = (terms, mails, digits, header) => {
    if (terms - mails < terms / 2) return 'emails';
    if (terms - mails - digits > terms / 2) return 'text';
    if (String(header).toLowerCase().replace(/[^a-z]/g, '').includes('costcent')) return 'numbers';
    const words = String(header).toLowerCase().replace(/[^a-z]+/g, ' ');
    if (/\b(date|quantity|qty|amount|count|total|hours)\b/.test(words)
      && !/\b(employee|emp|empid|id|ids)\b/.test(words)) return 'numbers';
    return 'ids';
  };
  const summariseRows = async (rows, current = active) => {
    const summary = columnSummariser();
    let sliceStart = Date.now();
    for (let i = 0; i < rows.length; i++) {
      if (!current()) return null;
      summary.row(Array.isArray(rows[i]) ? rows[i] : []);
      if (i % 128 === 0 && Date.now() - sliceStart >= 12) {
        await wait(0); sliceStart = Date.now();
        if (!current()) return null;
      }
    }
    return current() ? summary : null;
  };
  let wholeFileReads = 0;
  const fileReadQueue = [];
  const drainFileReads = () => {
    while (wholeFileReads < 2 && fileReadQueue.length) {
      const { current, resolve } = fileReadQueue.shift();
      if (!current()) { resolve(null); continue; }
      wholeFileReads++;
      resolve(() => { wholeFileReads--; drainFileReads(); });
    }
  };
  const acquireFileRead = current => new Promise(resolve => {
    fileReadQueue.push({ current, resolve });
    drainFileReads();
  });
  const scanWorkbook = async (file, current = active) => {
    const choices = [], empties = [];
    let releaseRead;
    try {
      if (file.size > CSV_LIMITS.maxInputBytes) return {
        file: file.name, choices, empties, error: true, oversized: true,
        reason: `${file.name} is over 64 MB → split it into smaller files, then load them.`,
      };
      releaseRead = await acquireFileRead(current);
      if (!releaseRead) return { file: file.name, choices, empties, stale: true };
      const bytes = await file.arrayBuffer();
      if (!current()) return { file: file.name, choices, empties, stale: true };
      const workbook = await __yoinkReadWorkbook(bytes, { isCurrent: current });
      if (!current()) return { file: file.name, choices, empties, stale: true };
      for (const sheetName of workbook.sheetNames) {
        const summary = await summariseRows(workbook.rows(sheetName), current);
        if (!summary) return { file: file.name, choices: [], empties: [], stale: true };
        const found = summary.choices(file.name, sheetName);
        choices.push(...found);
        if (!found.length) empties.push(summary.empty(sheetName));
      }
      return { file: file.name, choices, empties };
    } catch (err) {
      if (err?.stale === true && !current()) return { file: file.name, choices: [], empties: [], stale: true };
      return csvReadError(file, err);
    } finally { releaseRead?.(); }
  };
  const ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.txt';
  const ACCEPT_RE = new RegExp(`(${ACCEPT.split(',').map((x) => x.replace('.', '\\.')).join('|')})$`, 'i');
  const readableFile = (file) => ACCEPT_RE.test(file.name || '');
  const scanFiles = async (files, current = active) => {
    const inputs = [...files], results = new Array(inputs.length);
    let next = 0;
    const worker = async () => {
      while (current()) {
        const index = next++;
        if (index >= inputs.length) return;
        results[index] = await scanWorkbook(inputs[index], current);
      }
    };
    await Promise.all([worker(), worker()]);
    return current() ? results : [];
  };
  const pickFiles = (current = active) => new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: ACCEPT, style: 'display:none' });
    input.multiple = true;
    document.body.appendChild(input);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      input.remove();
      if (cancelFileInteraction === cancel) cancelFileInteraction = null;
      resolve(value);
    };
    const cancel = () => finish(null);
    cancelFileInteraction = cancel;
    input.onchange = async (e) => {
      try {
        const files = [...e.target.files];
        input.remove();
        if (!files.length || !current()) return finish(null);
        const results = await scanFiles(files, current);
        finish(current() ? results : null);
      } catch (error) {
        finish(current() ? [{ file: 'the file', choices: [], empties: [], error: true, reason: String(error.message || error) }] : null);
      }
    };
    input.oncancel = cancel;
    input.click();
  });
  const likelyColumn = (choice) => {
    if (choice.kind === 'emails') return true;
    if (choice.kind !== 'ids') return false;
    const ids = choice.emails.filter((term) => ID_RE.test(term));
    return mostlyActiveIds(ids.filter(isActiveId).length, ids.length);
  };
  const rememberedHeadings = new Set();
  tool.cleanups.push(() => rememberedHeadings.clear());
  const headingKey = choice => {
    const header = String(choice.header || '').trim();
    return !header || header === '(unnamed)' || header === '(no header row)' || /^column\s+(?:\d+|[a-z]+)$/i.test(header)
      ? '' : header.toLowerCase();
  };
  const columnSources = (chosen) => uniq(chosen.map(c => c.file)).map(file => {
    const mine = chosen.filter(c => c.file === file);
    const { emails, rejected } = chosenCellTerms(mine);
    return { name: file, emails, column: mine.map(c => c.label).join(' + '), excluded: [...rejected] };
  });
  const chooseColumn = (source, current = active, ready = false) => new Promise((resolve) => {
    const picker = el('bp-column-picker');
    if (!picker || !current()) return resolve(null);
    const options = source.choices;
    const multiFile = uniq(options.map((choice) => choice.file)).length > 1;
    const fillOf = (c) => (c.rows ? Math.min(1, c.filled / c.rows) : 0);
    const KIND_LABEL = { emails: 'addresses', ids: 'employee IDs', numbers: 'numbers', text: 'text' };
    const KIND_ORDER = (choice) => ({ numbers: 1, text: 2 })[choice.kind] || 0;
    const kindWords = (choice) => `${likelyColumn(choice) ? 'people: ' : ''}${KIND_LABEL[choice.kind] || ''}`;
    const ranked = (list) => [...list].sort((a, b) =>
      Number(likelyColumn(b)) - Number(likelyColumn(a)) || KIND_ORDER(a) - KIND_ORDER(b)
      || fillOf(b) - fillOf(a) || b.unique - a.unique);
    const row = (choice) => {
      const pct = Math.round(fillOf(choice) * 100);
      const preview = choice.sample;
      const where = `${multiFile ? `${choice.file} · ` : ''}${choice.sheetName}·${choice.column.replace('Column ', '')}`;
      const previewNode = dom('span', { className: 'bp-col-preview', title: preview }, preview);
      const card = dom('label', { className: 'bp-col', style: 'display:block;' },
        dom('span', { className: 'bp-col-top', style: 'display:flex;' },
          dom('input', { type: 'checkbox', name: 'bp-email-column', checked: rememberedHeadings.has(headingKey(choice))
            || ready && source.autoChoices.includes(choice), value: options.indexOf(choice),
            className: 'bp-col-box', 'aria-label': `${choice.header} · ${choice.file} · ${choice.sheetName} · ${choice.column} · ${kindWords(choice)} · ${plural(choice.unique, 'entry')}` }),
          dom('strong', { className: 'bp-hd', title: choice.header }, choice.header),
          ' ',
          dom('span', { className: 'bp-nm', title: 'unique entries in this column' }, `${choice.unique}`)),
        ' ',
        dom('span', { className: 'bp-col-detail', style: 'display:flex;' },
          dom('span', { className: 'bp-col-where', title: where }, where),
          ' ',
          dom('span', { className: 'bp-col-kind', style: `color:${likelyColumn(choice) ? PALETTE.subtle : PALETTE.amber};`, title: likelyColumn(choice) ? 'why this column is first' : 'what this column looks like' }, kindWords(choice)),
          ' ',
          previewNode,
          ' ',
          dom('span', { className: 'bp-meter', title: `${choice.filled} of ${choice.rows} rows filled` },
            dom('i', { className: 'bp-meter-fill', style: `display:block;width:${pct}%;` }))));
      return card;
    };
    const list = dom('div', { id: 'bp-column-list', style: 'max-height:172px;' });
    let pastLikely = false;
    ranked(options).forEach((choice) => {
      if (!likelyColumn(choice) && !pastLikely) {
        list.appendChild(dom('div', { className: 'bp-col-group' }, 'Other IDs or columns — check before using'));
        pastLikely = true;
      }
      list.appendChild(row(choice));
    });
    const empties = source.empties || [];
    el('bp-column-all')?.remove();
    clearDom(picker);
    picker.appendChild(list);
    if (empties.length) picker.appendChild(dom('div', { className: 'bp-sub bp-dim' },
      `No usable entries in ${empties.map((entry) => `${entry.sheetName} (${entry.rows} rows)`).join(', ')}.`));
    picker.appendChild(dom('div', { id: 'bp-column-count' }));
    if (!ready) picker.appendChild(dom('div', { className: 'bp-row bp-gap-top', style: 'display:flex;' }, buttonNode('bp-column-confirm', 'Add selected', 'green', BTN_CTRL), buttonNode('bp-column-all', 'Select all', 'gray', BTN_CTRL), buttonNode('bp-column-cancel', 'Cancel', 'gray', BTN_CTRL)));
    else picker.appendChild(buttonNode('bp-column-all', 'Select all', 'gray', 'bp-grow'));
    show('bp-input', false);
    show('bp-column-picker', true);
    let done = false;
    const finish = (value, restoreInput = true) => {
      if (done) return;
      done = true;
      if (cancelFileInteraction === cancel) cancelFileInteraction = null;
      show('bp-column-picker', false);
      if (restoreInput && current()) show('bp-input', true);
      resolve(value);
    };
    const cancel = () => finish(null, false);
    cancelFileInteraction = cancel;
    const boxes = [...picker.querySelectorAll('input[name="bp-email-column"]')];
    const chosen = () => boxes.filter(b => b.checked).map(b => options[Number(b.value)]).filter(Boolean);
    const columns = {
      sources: () => {
        const selected = chosen();
        return [...source.autoChoices.filter(choice => selected.includes(choice)).map(choice => columnSources([choice])[0]),
          ...columnSources(selected.filter(choice => !source.autoChoices.includes(choice)))];
      },
      used: () => source.autoChoices.filter(choice => chosen().includes(choice)),
      remember: () => chosen().map(headingKey).filter(Boolean).forEach(key => rememberedHeadings.add(key)),
      hide: () => show('bp-column-picker', false),
      show: () => show('bp-column-picker', true),
      hasChoice: () => chosen().length > 0,
      onChange: null,
    };
    const confirmButton = el('bp-column-confirm');
    const paint = (box) => {
      const card = box.closest('label');
      card?.classList.toggle('bp-on', box.checked);
      const marker = card?.querySelector('.bp-picked');
      if (box.checked && !marker) card?.querySelector('.bp-hd')?.after(dom('span',
        { className: 'bp-picked' }, 'Selected'));
      if (!box.checked) marker?.remove();
    };
    const sync = () => {
      const selected = chosen();
      const people = new Set(), shared = new Set();
      for (const choice of selected) {
        const keys = columnPeople.get(choice) || new Set((choice.emails || []).filter(lookupTerm).map(emailKey));
        for (const key of keys) { if (people.has(key)) shared.add(key); people.add(key); }
      }
      const total = Math.max(people.size, ...selected.map(c => c.unique), 0);
      const count = el('bp-column-count');
      if (count) {
        clearDom(count);
        if (selected.length) {
          if (!ready) count.appendChild(document.createTextNode(`${selected.length} column${selected.length === 1 ? '' : 's'} · ${plural(total, 'entry')}`));
          if (shared.size) count.appendChild(dom('span', { className: 'bp-shared' }, ` (${shared.size} shared)`));
        }
      }
      if (confirmButton) confirmButton.disabled = !selected.length;
      if (allButton) allButton.textContent = boxes.every(box => box.checked) ? 'Clear' : 'Select all';
      boxes.forEach(paint);
      columns.onChange?.();
      return selected;
    };
    boxes.forEach((b) => {
      b.onchange = sync;
      b.onfocus = () => b.closest('label')?.scrollIntoView?.({ block: 'nearest' });
    });
    requestAnimationFrame(() => {
      const rows = [...list.children].slice(0, 3 + Number([...list.children].slice(0, 3).some(n => n.tagName !== 'LABEL')));
      const height = rows.reduce((sum, node) => sum + node.offsetHeight
        + (parseFloat(getComputedStyle(node).marginTop) || 0) + (parseFloat(getComputedStyle(node).marginBottom) || 0), 0);
      if (height > 0 && list.children.length > rows.length) list.style.maxHeight = `${Math.ceil(height)}px`;
    });
    const allButton = el('bp-column-all');
    if (allButton) allButton.onclick = () => {
      const turnOn = boxes.some((x) => !x.checked);
      boxes.forEach((x) => { x.checked = turnOn; });
      sync();
    };
    sync();
    requestAnimationFrame(() => { if (current()) boxes[0]?.focus(); });
    if (ready) { resolve(columns); return; }
    const cancelButton = el('bp-column-cancel');
    if (cancelButton) cancelButton.onclick = () => {
      if (!current()) return finish(null, false);
      setStatus('↩ Cancelled — load another file, or paste.');
      finish(null);
    };
    confirmButton.onclick = async () => {
      if (!current()) return finish(null, false);
      let chosen = [];
      const readingCurrent = () => current() && !done;
      readingCurrent.onCancel = current.onCancel;
      try {
        chosen = sync();
        if (!chosen.length) return;
        confirmButton.disabled = true;
        boxes.forEach(box => { box.disabled = true; });
        if (allButton) allButton.disabled = true;
        const selectedHeadings = chosen.map(headingKey).filter(Boolean);
        chosen = await loadChosenColumns(chosen, readingCurrent);
        if (!readingCurrent()) return finish(null, false);
        selectedHeadings.forEach(key => rememberedHeadings.add(key));
        const picked = uniq(chosen.map((c) => c.file)).map((file) => {
          const mine = chosen.filter((c) => c.file === file);
          const { emails, rejected } = chosenCellTerms(mine);
          return {
            name: file,
            emails,
            column: mine.map((c) => c.label).join(' + '),
            excluded: [...rejected],
          };
        });
        finish(picked);
      } catch (error) {
        if (readingCurrent()) setStatus(`✗ ${csvErrorMessage(csvReadError({ name: source.name }, error))}`);
        return finish(null);
      }
    };
  });
  const mergeSkipText = (box, cells) => {
    box.value = sortUniq([...termsIn(box.value), ...cells])
      .map(value => value.replace(/\r\n?/g, '\n')).join('\n');
  };
  const readPasteBoxes = () => ({
    pasted: termsIn(el('bp-paste')?.value),
    excluded: uniq(termsIn(el('bp-exclude')?.value)),
  });
  const plural = (n, word) => {
    if (n === 1) return `${n} ${word}`;
    if (/[^aeiou]y$/i.test(word)) return `${n} ${word.slice(0, -1)}ies`;
    return `${n} ${word}${word.endsWith('s') ? 'es' : 's'}`;
  };
  let manualMode = 'add';
  const MODE_EXTRA = 'bp-mode';
  const PLACEHOLDER = {
    add: reportMode ? 'One email per value, like Ann Lee <ann@example.test>. Anything else is skipped and listed in the CSV.'
      : 'One email or one number per value, like Ann Lee <ann@example.test>. Anything else is skipped and listed in the CSV.',
    skip: 'Held back, never looked up',
  };
  const draftFor = (mode) => el(mode === 'add' ? 'bp-paste' : 'bp-exclude');
  const syncManualBox = () => {
    const box = el('bp-manual-box'), draft = draftFor(manualMode);
    if (box && draft) box.value = draft.value;
    refreshPasteCounts();
  };
  const setManualMode = (mode) => {
    manualMode = mode;
    const box = el('bp-manual-box'), draft = draftFor(mode);
    if (box) box.placeholder = PLACEHOLDER[mode];
    if (box && draft) box.value = draft.value;
    ['add', 'skip'].forEach((m) => {
      const node = el(`bp-mode-${m}`);
      if (!node) return;
      node.setAttribute('aria-pressed', String(m === mode));
      restyle(node, m === mode ? 'blue' : 'gray', MODE_EXTRA);
    });
    refreshPasteCounts();
  };
  let countTimer = 0;
  const scheduleCounts = () => {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => { countTimer = 0; if (active()) refreshPasteCounts(); }, 150);
  };
  tool.cleanups.push(() => clearTimeout(countTimer));
  const refreshPasteCounts = () => {
    clearTimeout(countTimer); countTimer = 0;
    const { pasted, excluded } = readPasteBoxes();
    const unique = uniq(pasted.map((term) => lookupTerm(term) ? emailKey(term) : term));
    const inAdd = manualMode === 'add';
    const dupes = pasted.length - unique.length;
    const lookups = unique.filter(lookupTerm).length, skipped = unique.length - lookups;
    const found = !skipped ? `${plural(unique.length, 'entry')} found`
      : `${lookups ? `${lookups} to look up` : 'Nothing to look up'} · ${skipped} will be skipped`;
    const count = el('bp-manual-count');
    if (count) count.textContent = inAdd && unique.length
      ? `${found}${dupes ? ` (${plural(dupes, 'duplicate')})` : ''}.`
      : '';
    show('bp-manual-count', Boolean(count && count.textContent));
    show('bp-add-row', inAdd && unique.length > 0);
    show('bp-skip-row', !inAdd, 'flex');
    show('bp-skip-clear-wrap', !inAdd && excluded.length > 0);
    const badge = el('bp-skip-badge');
    if (badge) badge.textContent = excluded.length ? ` · ${excluded.length} skipped` : '';
    return { pasted, excluded };
  };
  const applyExclusions = (emails, excluded) => {
    if (!excluded.length) return { kept: emails, dropped: [] };
    const block = new Set(excluded.map(emailKey));
    const kept = [], dropped = [];
    emails.forEach((email) => (block.has(emailKey(email)) ? dropped : kept).push(email));
    return { kept, dropped };
  };
  const dragHasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const wireDropTarget = (node, accepts, onFiles) => {
    if (!node) return;
    node.ondragover = (e) => {
      if (e.__bpClaimed || !accepts() || !dragHasFiles(e)) return;
      e.__bpClaimed = true;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      lightDropTarget(node);
    };
    node.ondragleave = (e) => { if (e.target === node) clearDropTargets(); };
    node.ondrop = async (e) => {
      try {
        clearDropTargets();
        if (e.__bpClaimed || !accepts()) return;
        e.__bpClaimed = true;
        const dropped = [...(e.dataTransfer?.files || [])];
        if (!dropped.length) return;
        clearHeldMessage();
        const files = dropped.filter(readableFile);
        const ignored = dropped.length - files.length;
        if (!files.length) return setStatus('⚠ Spreadsheets and text files only.');
        const unsupported = ignored ? `${plural(ignored, 'file')} not read (unsupported type): ${clip(dropped.filter((file) => !readableFile(file)).map((file) => file.name).join(', '))}` : '';
        await onFiles(files, unsupported);
      } catch (error) {
        if (accepts()) setStatus(`✗ Could not read the file: ${error.message || error}`);
      }
    };
  };
  const collectFromFiles = async (purpose, files = null, current = active, unsupported = '') => {
    fileNotice = '';
    if (!files) setStatus(`Choose your ${purpose} file${purpose === 'input' ? '(s)' : ''}…`);
    const results = files ? await scanFiles(files, current) : await pickFiles(current);
    if (!current()) return null;
    if (!results) { setStatus(''); return null; }
    if (results.every((r) => r.error)) {
      setStatus(results.some(r => r.reason)
        ? `✗ ${results.map(csvErrorMessage).join(' · ')}`
        : `✗ Could not read ${clip(results.map((r) => r.file).join(', '))} → save it again as XLSX or CSV, then load it.`);
      return null;
    }
    const withEmails = results.filter((r) => r.choices.length);
    const unreadable = results.filter((r) => r.error).length;
    const empty = results.filter((r) => !r.error && !r.choices.length).length;
    fileNotice = [
      unsupported,
      unreadable ? `${plural(unreadable, 'unreadable file')} skipped${results.filter(r => r.error && r.reason).map(r => ` · ${csvErrorMessage(r)}`).join('')}` : '',
      empty ? `${plural(empty, 'file')} without usable entries skipped` : '',
    ].filter(Boolean).join(' · ');
    if (!withEmails.length) {
      setStatus(fileNotice ? `⚠ No usable entries · ${fileNotice}.` : '⚠ No email addresses or employee IDs in that file.');
      fileNotice = '';
      return null;
    }
    if (purpose === 'input') return {
      name: withEmails.map(r => r.file).join(' + '),
      choices: withEmails.flatMap(r => r.choices),
      empties: withEmails.flatMap(r => (r.empties || []).map(e => ({ ...e, file: r.file }))),
      autoChoices: withEmails.filter(r => r.choices.length === 1 && likelyColumn(r.choices[0])).map(r => r.choices[0]),
    };
    const sources = [], ambiguous = [], autoUsed = [];
    for (const r of withEmails) {
      const choices = r.choices;
      if (choices.length === 1 && likelyColumn(choices[0])) {
        autoUsed.push(`${clip(choices[0].header, 40)} (${clip(r.file, 40)})`);
        let choice;
        try { [choice] = await loadChosenColumns([choices[0]], current); }
        catch (error) {
          if (current()) setStatus(`✗ ${csvErrorMessage(csvReadError({ name: r.file }, error))}`);
          return null;
        }
        if (!current()) return null;
        const { emails } = chosenCellTerms([choice]);
        sources.push({ name: r.file, emails, column: choice.label });
        r.choices.forEach(c => { c.emails = null; });
      } else ambiguous.push({ ...r, choices });
    }
    if (ambiguous.length) {
      setStatus('');
      const picked = await chooseColumn({
        name: ambiguous.map((r) => r.file).join(' + '),
        choices: ambiguous.flatMap((r) => r.choices),
        empties: ambiguous.flatMap((r) => (r.empties || []).map((e) => ({ ...e, file: r.file }))),
      }, current);
      ambiguous.forEach(r => r.choices.forEach(c => { c.emails = null; }));
      if (!picked) { fileNotice = ''; return null; }
      for (const source of picked) sources.push(source);
    }
    if (autoUsed.length && purpose === 'input') fileNotice = [fileNotice, `Used ${autoUsed.join(', ')}, the only ${reportMode
      ? 'email column' : 'column with emails or numbers'}`].filter(Boolean).join(' · ');
    return sources.length ? sources : null;
  };
  const setDisclosureLabel = (toggleId, text) => {
    const node = el(`${toggleId}-label`) || el(toggleId);
    if (node) node.textContent = text;
  };
  const wireDisclosure = (toggleId, wrapId, label, focusId) => {
    const toggle = el(toggleId);
    if (!toggle) return;
    toggle.onclick = () => {
      const open = el(wrapId)?.style.display !== 'none';
      show(wrapId, !open);
      setDisclosureLabel(toggleId, `${open ? '▸' : '▾'} ${label}`);
      toggle.setAttribute('aria-expanded', String(!open));
      if (!open && focusId) el(focusId)?.focus();
    };
  };
  let inputGeneration = 0;
  let cancelInputRead = null;
  const getInput = () => new Promise((resolve) => {
    cancelInputRead?.();
    const generation = ++inputGeneration;
    let accepted = false;
    let confirming = false;
    const current = () => active() && !recovering() && !accepted && generation === inputGeneration;
    let readGeneration = 0, reading = false;
    const readCancels = new Set();
    const invalidateRead = () => {
      const wasReading = reading;
      readGeneration++;
      cancelPendingFileInteraction();
      for (const cancel of readCancels) cancel();
      readCancels.clear();
      reading = false;
      inputReading = false; syncSettingsControl();
      if (current()) {
        show('bp-input', true);
        if (wasReading) setStatus('');
      }
    };
    const beginRead = () => {
      clearHeldMessage();
      invalidateRead();
      reading = true;
      inputReading = true; syncSettingsControl();
      const owned = readGeneration;
      const live = () => current() && owned === readGeneration;
      live.onCancel = (cancel) => { readCancels.add(cancel); return () => readCancels.delete(cancel); };
      return live;
    };
    cancelInputRead = invalidateRead;
    const withFiles = async (action) => {
      const live = beginRead();
      const owned = readGeneration;
      try { await action(live); }
      catch (error) { if (live()) setStatus(`✗ Could not read the file: ${error.message || error}`); }
      finally {
        if (owned === readGeneration) {
          reading = false; inputReading = false; syncSettingsControl();
        }
      }
    };
    setStatus(inputNotice || '');
    inputNotice = '';
    show('bp-input', true);
    show('bp-retained-files', false);
    const useFile = el('bp-use-file'), usePaste = el('bp-use-paste');
    if (!useFile || !usePaste) return resolve({ name: null, emails: [] });
    wireDisclosure('bp-manual-toggle', 'bp-manual-wrap', 'Paste / skip list', 'bp-manual-box');
    show('bp-manual-wrap', false);
    setDisclosureLabel('bp-manual-toggle', '▸ Paste / skip list');
    el('bp-manual-toggle')?.setAttribute('aria-expanded', 'false');
    const manualBox = el('bp-manual-box');
    if (manualBox) manualBox.oninput = () => {
      invalidateRead();
      const draft = draftFor(manualMode);
      if (draft) draft.value = manualBox.value;
      scheduleCounts();
    };
    ['add', 'skip'].forEach((m) => {
      const node = el(`bp-mode-${m}`);
      if (node) node.onclick = () => setManualMode(m);
    });
    setManualMode('add');
    if (reportMode) {
      show('bp-settings', false);
      const error = validateReportSettings();
      if (error) showReportSettings(error);
    }
    show('bp-input-nav', state.batches.length > 0);
    const backNav = el('bp-input-back');
    if (backNav) backNav.onclick = () => { clearHeldMessage(); accepted = true; cancelPendingFileInteraction(); goingBack = true; show('bp-input', false); show('bp-input-nav', false); resolve({ back: true }); };
    const clearExclude = el('bp-exclude-clear');
    if (clearExclude) clearExclude.onclick = () => {
      const box = el('bp-exclude');
      if (box) box.value = '';
      syncManualBox();
      setStatus('✓ Skip list cleared.');
    };
    const settle = (sourceValues, pasted = false, columns = null) => {
      if (!current() || confirming) return;
      if (reportMode) {
        const error = validateReportSettings();
        if (error) return showReportSettings(error);
      }
      const makePlan = (sources, excluded) => {
        const kept = [], allDropped = [];
        const eligible = classifyIntakeSources(sources, excluded);
        const rejected = rejectedSources(eligible);
        eligible.forEach((source, index) => {
          const { kept: keep, dropped } = applyExclusions(source.emails, excluded);
          for (const term of dropped) allDropped.push(term);
          const heldValues = new Set([...(source.excluded || []), ...dropped]);
          const held = uniq([...sources[index].emails.filter(term => heldValues.has(term)), ...heldValues]);
          if (keep.length || held.length) {
            rejectedCellTerms.set(keep, rejectedCellTerms.get(source.emails));
            kept.push({ ...source, emails: keep, excluded: held });
          }
        });
        const droppedUnique = sortUniq(allDropped);
        const people = dedupe(kept.flatMap(source => source.emails)).list.filter(lookupTerm).map(emailKey);
        const skipped = sortUniq(kept.flatMap(source => [
          ...(source.excluded || []), ...source.emails.filter(term => !lookupTerm(term)),
        ])).length;
        const sourceText = sources.map(source => source.name
          ? `${source.name}${source.column ? ` · ${source.column}` : ''}` : 'Paste').join('; ');
        return { kept, rejected, droppedUnique, people, skipped, sourceText };
      };
      let plan;
      if (!el('bp-confirm-start')) el('bp-confirm').append(
        dom('div', { id: 'bp-confirm-sources' }),
        dom('div', { id: 'bp-confirm-summary' }),
        dom('div', { className: 'bp-row bp-gap-top-wide', style: 'display:flex;' },
          buttonNode('bp-confirm-start', 'Start', 'green', 'bp-grow'),
          buttonNode('bp-confirm-back', '↩ Back', 'gray', 'bp-grow')));
      if (columns) el('bp-confirm-back').before(el('bp-column-all'));
      else el('bp-column-all')?.remove();
      if (!pasted) {
        const notice = fileNotice;
        if (!el('bp-retained-add')) el('bp-retained-files').appendChild(buttonNode('bp-retained-add', 'Add', 'green', 'bp-full'));
        el('bp-retained-add').onclick = () => {
          if (!current() || confirming) return;
          fileNotice = notice;
          columns?.show();
          settle(sourceValues, pasted, columns);
        };
        show('bp-retained-files', true);
      }
      const previousStatus = messageStatus();
      confirming = true;
      const refreshEstimate = (replan = false) => {
        if (!current() || !confirming) return false;
        if (!plan || replan) plan = makePlan(typeof sourceValues === 'function' ? sourceValues() : sourceValues,
          refreshPasteCounts().excluded);
        const { people, skipped, sourceText } = plan;
        el('bp-confirm-sources').textContent = sourceText;
        el('bp-confirm-sources').title = sourceText;
        if (!pasted) el('bp-retained-source').textContent = sourceText;
        let toAdd = 0, already = 0;
        try {
          const selected = selectedEmails();
          const ids = new Set(empidReady() ? selectedIds('id') : []);
          const selection = { has: person => isId(person)
            ? ids.has(person) || ids.has(confirmedIdKeys.get(person)) : selected.has(person) };
          const seen = new Set(inputKeys().filter(term => finalReason(term) !== 'not reached'));
          const counts = batchPeople(people, selection, seen);
          toAdd = counts.toAdd.length;
          already = counts.already.length;
        } catch {
          el('bp-confirm-start').disabled = true;
          setStatus('⚠ Could not read the selection → load or paste again.');
          return null;
        }
        const fits = batchFits(toAdd), button = el('bp-confirm-start');
        button.disabled = !fits || Boolean(columns && !columns.hasChoice());
        restyle(button, button.disabled ? 'gray' : 'green', 'bp-grow');
        const summary = el('bp-confirm-summary');
        clearDom(summary);
        const part = (key, text, color) => {
          if (summary.childNodes.length) summary.append(' · ');
          summary.append(dom('span', { 'data-count': key, style: color ? `color:${color};` : null }, text));
        };
        part('to-add', `${toAdd} to add`, PALETTE.green);
        if (already) part('already', `${already} already added`, PALETTE.blue);
        if (skipped) part('skipped', `${skipped} skipped`, PALETTE.muted);
        const seconds = Math.round(toAdd * lookupBudgetEstimate() / 1000);
        const time = seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)}m`;
        part('time', `~${time}${fits ? '' : ", won't fit"}`, fits ? null : PALETTE.amber);
        return !button.disabled;
      };
      if (columns) columns.onChange = () => refreshEstimate(true);
      updateConfirmationEstimate = refreshEstimate;
      setStatus('');
      if (refreshEstimate() === null) {
        confirming = false;
        columns?.hide();
        show('bp-input', true);
        return;
      }
      show('bp-input', false);
      show('bp-confirm', true);
      el('bp-confirm-start').focus();
      el('bp-confirm-back').onclick = () => {
        if (!current() || !confirming || el('bp-confirm').style.display === 'none') return;
        clearHeldMessage();
        confirming = false;
        columns?.hide();
        show('bp-confirm', false);
        goingBack = true;
        show('bp-input', true);
        setStatus(previousStatus.text, previousStatus.title);
        el(pasted ? 'bp-use-paste' : 'bp-retained-add').focus();
      };
      el('bp-confirm-start').onclick = () => {
        if (!current() || !confirming || el('bp-confirm').style.display === 'none') return;
        clearHeldMessage();
        if (!refreshEstimate(true)) return;
        if (reportMode) {
          const error = validateReportSettings();
          if (error) return showReportSettings(error);
        }
        confirming = false;
        columns?.remember();
        columns?.hide();
        show('bp-confirm', false);
        if (pasted) {
          el('bp-paste').value = '';
          syncManualBox();
        }
        try { finish(plan.kept, plan.rejected, plan.droppedUnique); }
        catch (error) {
          setStatus(`✗ Could not read ${pasted ? 'the input' : 'the file'}: ${error.message || error}`);
          show('bp-input', true);
        }
      };
    };
    const finish = (kept, rejected, droppedUnique) => {
      if (!kept.some((s) => s.emails.length)) {
        if (kept.length) {
          const seen = new Set(inputKeys());
          kept.forEach((source) => commitBatch(prepareBatch(source, seen).batch));
          refreshRecordBoundary();
          renderCounts();
        }
        show('bp-input-nav', state.batches.length > 0);
        const message = rejected.length ? intakeSkipNotice(rejected)
          : droppedUnique.length ? '⚠ All of it is on the skip list.' : '⚠ No email addresses or employee IDs found.';
        setStatus(fileNotice ? `${message} ${fileNotice}.` : message);
        fileNotice = '';
        show('bp-input', true);
        return;
      }
      accepted = true;
      cancelPendingFileInteraction();
      resolve({ sources: kept });
    };
    usePaste.onclick = () => {
      clearHeldMessage();
      invalidateRead();
      const { pasted } = refreshPasteCounts();
      if (!pasted.length) return setStatus('⚠ Paste at least one email address or employee ID first.');
      if (reportMode) {
        const error = validateReportSettings();
        if (error) return showReportSettings(error);
      }
      settle([{ name: '', emails: pasted, column: '' }], true);
    };
    const loadAddFiles = async (files, live, unsupported = '') => {
      const source = await collectFromFiles('input', files, live, unsupported);
      if (!live() || !source) return;
      if (source.choices.some(choice => !source.autoChoices.includes(choice))) setStatus('');
      const columns = await chooseColumn(source, live, true);
      if (!live() || !columns) return;
      const notice = fileNotice;
      const values = () => {
        const selected = columns.sources();
        const used = columns.used().map(choice => `${clip(choice.header, 40)} (${clip(choice.file, 40)})`);
        fileNotice = [notice, used.length ? `Used ${used.join(', ')}, the only ${reportMode
          ? 'email column' : 'column with emails or numbers'}` : ''].filter(Boolean).join(' · ');
        return selected;
      };
      settle(values, false, columns);
    };
    useFile.onclick = () => withFiles(live => loadAddFiles(null, live));
    const excludeFile = el('bp-exclude-file');
    const mergeSkipFiles = (files, unsupported = '') => withFiles(async (live) => {
      const sources = await collectFromFiles('exclusion', files, live, unsupported);
      if (!live() || !sources) return;
      const emails = uniq(sources.flatMap(s => [...s.emails, ...(s.excluded || [])]));
      const box = el('bp-exclude');
      if (box) mergeSkipText(box, emails);
      syncManualBox();
      setStatus(`✓ Skip list loaded — ${plural(uniq(emails).length, 'entry')}${fileNotice ? ` · ${unsupported ? '⚠ ' : ''}${fileNotice}` : ''}.`);
      fileNotice = '';
    });
    if (excludeFile) excludeFile.onclick = () => mergeSkipFiles(null);
    const inputScreenLive = () => current() && !confirming && (reading || el('bp-input')?.style.display !== 'none')
      && !document.querySelector('.bp-modal-back');
    wireDropTarget(el('bp-manual-wrap'),
      () => inputScreenLive() && manualMode === 'skip' && el('bp-manual-wrap')?.style.display !== 'none',
      mergeSkipFiles);
    wireDropTarget(panel, inputScreenLive,
      (files, unsupported) => withFiles(live => loadAddFiles(files, live, unsupported)));
  });
  const batchPeople = (people, selected, seen = new Set()) => {
    const toAdd = [], alreadyInBox = [], already = [];
    for (const person of people) {
      const inBox = selected.has(person);
      if (inBox) alreadyInBox.push(person);
      if (inBox || isAdded(person)) already.push(person);
      if (!inBox && !seen.has(person)) toAdd.push(person);
    }
    return { toAdd, alreadyInBox, already };
  };
  const prepareBatch = (source, seen) => {
    const rejected = source.emails.filter(term => !lookupTerm(term));
    source = { ...source, emails: source.emails.filter(lookupTerm), excluded: [...(source.excluded || []), ...rejected] };
    const { list, raw, dupes } = dedupe(source.emails);
    const suppliedEmails = Object.fromEntries(dedupe([...source.emails, ...(source.excluded || [])]).list
      .map((term) => [emailKey(term), term]));
    const priorDupes = [], fresh = [];
    list.map(emailKey).forEach((email) => {
      if (seen.has(email)) priorDupes.push(email);
      else { seen.add(email); fresh.push(email); }
    });
    const allDupes = [...dupes.map(emailKey), ...priorDupes];
    const { toAdd, alreadyInBox } = batchPeople(fresh, state.selectedSet);
    const pickedEmails = Object.fromEntries(alreadyInBox.map((term) => {
      const email = selectedEmailFor(term);
      if (email === undefined) throw new Error('Selection is unreadable.');
      return [term, email];
    }));
    const targets = fresh;
    const batch = {
      label: `Batch ${++state.batchSeq}`, source: source.name || `Pasted ${++state.pasteSeq}`, column: source.column || '',
      people: [], created: [], dupes: allDupes.map(key => ({ key, supplied: suppliedEmails[key] || key })),
      skips: (source.excluded || []).map(value => ({ key: emailKey(value), supplied: suppliedEmails[emailKey(value)] || value })),
      operation: newOperation(targets),
    };
    for (const key of list.map(emailKey)) snapshotPerson(batch.operation, key);
    for (const key of targets) {
      if (!state.people.has(key)) {
        batch.people.push(key);
        state.people.set(key, { key, owner: batch, supplied: suppliedEmails[key] || key,
          status: 'not_found', reason: 'not reached', entry: null, pickedEmail: '' });
      }
    }
    for (const key of targets) {
      const person = state.people.get(key), value = suppliedEmails[key];
      if (person && value && !splitEmail(person.supplied).date && splitEmail(value).date) person.supplied = value;
    }
    alreadyInBox.forEach(key => settleLookup(batch, key, 'dup', pickedEmails[key]));
    return { batch, toAdd, raw, dupes: allDupes, alreadyInBox };
  };
  const confirmBatches = (sources) => {
    sources = classifyIntakeSources(sources, []);
    const { batchSeq, pasteSeq } = state;
    let prepared;
    try {
      state.selectedSet = selectedEmails();
      const seen = new Set(inputKeys().filter((email) => finalReason(email) !== 'not reached'));
      prepared = [];
      for (const source of sources) prepared.push(prepareBatch(source, seen));
    } catch {
      for (const item of (prepared || []).reverse()) rollbackOperation(item.batch);
      Object.assign(state, { selectedSet: null, batchSeq, pasteSeq });
      inputNotice = '⚠ Could not read the selection → load or paste again.';
      setStatus(inputNotice); show('bp-input', true);
      return null;
    }
    const forms = new Map(dedupe(sources.flatMap((source) => source.emails)).list.map((term) => [emailKey(term), term]));
    prepared.forEach(({ batch }) => batch.operation.targets.forEach(term => {
      const person = state.people.get(term), value = forms.get(term);
      if (person && value && !splitEmail(person.supplied).date) person.supplied = value;
    }));
    const rejected = rejectedSources(sources);
    if (rejected.length) inputNotice = intakeSkipNotice(rejected);
    const sum = (pick) => prepared.reduce((n, p) => n + pick(p), 0);
    const totals = {
      raw: sum((p) => p.raw + p.batch.skips.length),
      dupes: sum((p) => p.dupes.length),
      excluded: sum((p) => p.batch.skips.length),
      already: sum((p) => p.alreadyInBox.length),
      toAdd: sum((p) => p.toAdd.length),
    };
    show('bp-input', false);
    const head = prepared.length > 1
      ? `${prepared.length} files`
      : clip(prepared[0].batch.column || prepared[0].batch.source || 'Pasted');
    const parts = [head];
    if (totals.excluded) parts.push(`${totals.excluded} skipped`);
    if (totals.dupes) parts.push(`${totals.dupes} duplicate${totals.dupes === 1 ? '' : 's'}`);
    if (totals.already) parts.push(`${totals.already} already in`);
    parts.push(`${totals.toAdd} to add`);
    if (fileNotice) parts.push(`⚠ ${fileNotice}`);
    setStatus(parts.join(' · '), [
      `${totals.raw} supplied`,
      ...prepared.map((p) => `${p.batch.source || 'Pasted'}${p.batch.column ? ` · ${p.batch.column}` : ''} — ${p.toAdd.length} to add`),
      fileNotice,
    ].filter(Boolean).join('\n'));
    fileNotice = '';
    return { prepared, toAdd: totals.toAdd };
  };
  const removalAllowed = () => pagePermission('remove');
  const removeBatchSelections = async (batch) => {
    const removed = [], failed = [];
    let chipIndex;
    const removalsSettled = holdSettlement('removal');
    try {
      if (removalAllowed()) chipIndex = undoChipIndex(new Set(removalEntries(batch).map(entry => fieldOf(termOfEntry(entry))).filter(Boolean)));
      for (const entry of [...removalEntries(batch)].reverse()) {
        const term = termOfEntry(entry);
        if (!removalAllowed()) { failed.push(term); continue; }
        const { email, optionId } = entry;
        setLive(`Removing: ${clip(term, 34)}`);
        if (await removeSelectedEmail(email, optionId, fieldOf(term), entry.optionIdConfirmed, chipIndex, entry.label)) {
          if (fieldOf(term) === 'id') forgetConfirmedIdKey(optionId);
          removed.push(term); state.selectedSet?.delete(emailKey(email));
        } else { failed.push(term); }
      }
      setLive('');
      return { removed, failed };
    } finally { chipIndex?.disconnect(); removalsSettled(); }
  };
  let pauseStartedAt = null, pausedFor = 0;
  const pauseCauses = runState.causes;
  const showPauseCause = text => setPauseMessage(text);
  const renderPauseCauses = () => showPauseCause(`Paused — ${[...pauseCauses].join(', ')}. Press Resume to continue.`);
  const setPaused = value => {
    if (!value) {
      if (pauseCauses.size) showPauseCause('');
      pauseCauses.clear();
    }
    if (value === runPaused()) return;
    if (value) pauseStartedAt = Date.now();
    else if (pauseStartedAt !== null) { pausedFor += Date.now() - pauseStartedAt; pauseStartedAt = null; }
    if (value) {
      runState.resumePhase = runState.phase;
      moveRun('paused');
    } else if (runPaused()) {
      moveRun(runState.resumePhase);
      runState.resumePhase = null;
    }
  };
  const lookupTime = () => Date.now() - pausedFor - (pauseStartedAt === null ? 0 : Date.now() - pauseStartedAt);
  const setPauseButton = () => {
    const pb = el('bp-pause');
    if (!pb) return;
    pb.textContent = runPaused() ? 'Resume' : 'Pause';
    restyle(pb, runPaused() ? 'green' : 'blue', BTN_CTRL);
  };
  const togglePause = () => {
    if (runPaused()) clearHeldMessage();
    setPaused(!runPaused());
    if (runPaused()) { pauseCauses.add('Stop'); renderPauseCauses(); }
    else showPauseCause('Resumed after a pause.');
    if (!runPaused()) lastProgressAt = Date.now();
    setPauseButton();
  };
  const autoPause = () => {
    if ((!hasSettlement('lookup') && !hasSettlement('setup')) || !active()) return;
    pauseCauses.add('hidden tab');
    setPaused(true); setPauseButton();
    renderPauseCauses();
    if (hasSettlement('setup')) {
      show('bp-controls', true, 'flex');
      const pauseButton = el('bp-pause');
      if (pauseButton) pauseButton.onclick = togglePause;
    }
    setPauseMessage('⏳ Paused — tab hidden → press Resume.', true);
  };
  on(document, 'visibilitychange', () => { if (document.hidden) autoPause(); });
  const pauseFor = (reason) => {
    if ((!hasSettlement('lookup') && !hasSettlement('setup')) || !active() || recovering()) return;
    pauseCauses.add(reason);
    setPaused(true); setPauseButton();
    renderPauseCauses();
    setPauseMessage(`⚠ ${reason} — paused. Press Resume when it is back.`, true);
  };
  on(window, 'offline', () => pauseFor('Network lost'));
  on(window, 'online', () => {
    if (!active() || runStopped() || !pauseCauses.delete('Network lost')) return;
    if (document.hidden) pauseCauses.add('hidden tab');
    if (pauseCauses.size) { renderPauseCauses(); return; }
    setPaused(false); setPauseButton(); lastProgressAt = Date.now();
    showPauseCause('Paused and resumed for the network.');
    setStatus('Network is back — adding resumed.');
  });
  const lookupReady = async () => {
    while (runPaused() && active() && !runStopped()) await wait(50);
    return active() && !runStopped();
  };
  const lookupWait = select2Driver.waitDuration;
  const runList = async (list, label, batch) => {
    if ((recovering() && runState.reason === 'session')) {
      setStatus('✗ Session expired → download the CSV, then reload before adding more.');
      return { cancelled: true };
    }
    showPauseCause('');
    if (reportMode) {
      setPaused(false);
      if (!beginRun('setup', isRetry(batch) ? 'retry' : 'batch')) return { cancelled: true };
      const setupSettled = holdSettlement('setup');
      setStatus('Setting the report fields…');
      el('bp-bar').style.width = '0%';
      show('bp-progress', true);
      renderCounts(); setBar(0, list.length || 1);
      show('bp-controls', true, 'flex'); show('bp-stop', true);
      el('bp-stop').disabled = true;
      el('bp-pause').onclick = togglePause;
      setPauseButton();
      if (document.hidden) autoPause();
      syncSettingsControl();
      let setup;
      try { setup = await prepareReportFields(); }
      finally {
        setupSettled(); syncSettingsControl();
        const setupStop = el('bp-stop');
        if (setupStop) setupStop.disabled = false;
        if (!setup?.ready || !list.length || !active() || runStopped()) {
          show('bp-controls', false); show('bp-progress', false); setLive('');
          const setupBarText = el('bp-bar-txt');
          if (setupBarText) setupBarText.textContent = '';
          syncMeter();
        }
      }
      if (!active() || runStopped()) return { cancelled: true };
      if (!setup.ready) { finishRun(); return { setupFailed: true, message: setup.message }; }
      setStatus('');
      if (!list.length) { finishRun(); return { finished: true }; }
    }
    if (reportMode) {
      if (runPaused()) runState.resumePhase = 'adding';
      else moveRun('adding');
    } else if (!beginRun('adding', isRetry(batch) ? 'retry' : 'batch')) return { cancelled: true };
    setPaused(runPaused() || document.hidden);
    const lookupSettled = holdSettlement('lookup');
    if (document.hidden) { pauseCauses.add('hidden tab'); renderPauseCauses(); }
    syncSettingsControl();
    const barNode = el('bp-bar');
    if (barNode) barNode.style.width = '0%';
    show('bp-progress', true);
    try { state.selectedSet = selectedEmails(); }
    catch { state.selectedSet = null; }
    show('bp-controls', true, 'flex');
    const stopButton = el('bp-stop');
    if (stopButton) { stopButton.textContent = 'Cancel this batch'; restyle(stopButton, 'red', BTN_CTRL); stopButton.onclick = triggerCancel; }
    setPauseButton();
    if (runPaused() && document.hidden) setPauseMessage('⏳ Paused — tab hidden → press Resume.', true);
    const pauseButton = el('bp-pause');
    if (pauseButton) pauseButton.onclick = togglePause;
    renderCounts(); setBar(0, list.length);
    for (let i = 0; i < list.length; i++) {
      if (!active() || runStopped()) break;
      while (runPaused() && active() && !runStopped()) { setLive('⏳ Paused.'); await wait(200); }
      if (!active() || runStopped()) break;
      const term = list[i];
      setLive(`${label}: ${clip(term, 30)}`);
      const lookupStarted = lookupTime();
      let result = await tryAdd(suppliedOfTerm(term, batch));
      if (!runStopped() && active()) recordLookupTiming(lookupTime() - lookupStarted + T.gap);
      let pickedEmail;
      if (result === 'dup' && !isId(term)) {
        pickedEmail = selectedEmailFor(term);
        if (pickedEmail === undefined) result = 'error';
      }
      settleLookup(batch, term, result, pickedEmail);
      if (active()) { renderCounts(); setBar(i + 1, list.length); }
      if (!active() || runStopped()) break;
      if (i + 1 < list.length) await wait(T.gap);
    }
    lookupSettled(); setPaused(false); setPauseButton();
    const stopped = runStopped();
    if (!stopped) finishRun();
    syncSettingsControl();
    show('bp-progress', false);
    const barText = el('bp-bar-txt');
    if (barText) barText.textContent = '';
    syncMeter();
    show('bp-controls', false); setLive('');
    if (!active() || stopped) return { cancelled: true };
    return { finished: true };
  };
  async function triggerCancel() {
    if (runStopped() || !active()) return;
    const target = state.pendingBatch;
    if (!target) return;
    if (!(await confirmModal('Cancel this batch?', 'Everything added by this batch will be removed. Earlier batches stay.', 'Cancel batch', 'Keep working'))) return;
    if (state.pendingBatch !== target) {
      setStatus(state.pendingBatch
        ? '⚠ That batch finished before you confirmed — the next one is running → press Cancel again to stop that one.'
        : '⚠ That batch finished before you confirmed. Nothing was cancelled — use ↩ Undo a batch to remove it.');
      return;
    }
    if (!moveRun('cancelling')) return;
    runState.operation.kind = 'cancel';
    const cancelSettled = holdSettlement('cancel');
    setStatus('⏳ Cancelling current batch…');
    while (hasSettlement('lookup') && active()) await wait(100);
    if (recovering()) { cancelSettled(); return; }
    const batch = target;
    const { failed } = batch ? await removeBatchSelections(batch) : { failed: [] };
    if (!active()) { cancelSettled(); return; }
    if (failed.length) {
      keepUnremovedEntries(batch, failed);
      if (isRetry(batch)) settleRetry(batch);
      else { commitBatch(batch); refreshRecordBoundary(); renderCounts(); }
      setStatus(`⚠ ${plural(failed.length, 'entry')} could not be removed — kept as the latest batch.`);
      cancelSettled(); finishRun();
      await offerAfterBatch();
      return;
    }
    rollbackOperation(batch);
    state.pendingBatch = null;
    refreshRecordBoundary();
    renderCounts();
    setStatus('↩ Batch cancelled. Earlier batches stay.');
    cancelSettled(); finishRun();
    if (active()) { if (state.batches.length) offerAfterBatch(); else collectAndFinish(); }
  }
  const resetUIAndState = () => {
    Object.assign(state, freshState());
    updateConfirmationEstimate = null;
    showPauseCause('');
    confirmedIdKeys.clear();
    const bar = el('bp-bar'), barText = el('bp-bar-txt'), counts = el('bp-counts');
    if (bar) bar.style.width = '0%';
    if (barText) barText.textContent = '';
    if (counts) clearDom(counts);
    setLive('');
    ['bp-paste', 'bp-exclude', 'bp-manual-box'].forEach((id) => { const node = el(id); if (node) node.value = ''; });
    setDisclosureLabel('bp-manual-toggle', '▸ Paste / skip list');
    el('bp-manual-toggle')?.setAttribute('aria-expanded', 'false');
    setManualMode('add');
    ['bp-controls', 'bp-more', 'bp-settings', 'bp-column-picker', 'bp-confirm', 'bp-retained-files', 'bp-manual-wrap', 'bp-progress', 'bp-batches', 'bp-input-nav',
      'bp-retry-wrap', 'bp-undo-wrap', 'bp-meter'].forEach((id) => show(id, false));
  };
  const finalReason = (term) => {
    const person = state.people.get(term) || state.people.get(emailKey(term));
    return person?.status === 'added' ? '' : person?.reason || 'not reached';
  };
  const finalStatus = (term) => finalReason(term) ? 'not_found' : 'added';
  const sourceOf = () => {
    const map = new Map();
    const name = (batch) => batch.source || batch.label;
    state.batches.forEach((b) => b.people.forEach((e) => { if (!map.has(e)) map.set(e, name(b)); }));
    state.batches.forEach((b) => b.skips.map(skip => skip.key).forEach((e) => { if (!map.has(e)) map.set(e, name(b)); }));
    return map;
  };
  const buildCsv = () => {
    const source = sourceOf();
    const rows = [['supplied', 'status', 'reason', 'source', 'profile']];
    const profile = (term) => mayBeInactiveId(term) ? 'may be inactive' : '';
    const supplied = new Set(inputKeys());
    const entries = addedEntryOfTerm();
    const spellings = suppliedIndex();
    const csvTerm = (term) => isId(term) ? term : entries.get(term)?.email
      || state.people.get(term)?.pickedEmail || suppliedOfTerm(term, null, spellings);
    const emitted = new Set();
    for (const batch of state.batches) {
      for (const term of batch.people) {
        if (emitted.has(term) || state.people.get(term)?.owner !== batch) continue;
        emitted.add(term);
        rows.push([csvTerm(term), finalStatus(term), finalReason(term), source.get(term) || '', profile(term)]);
      }
      for (const { key: term } of batch.skips) {
        if (emitted.has(term) || supplied.has(term)) continue;
        emitted.add(term);
        rows.push([suppliedOfTerm(term, null, spellings), 'skipped', '', source.get(term) || '', profile(term)]);
      }
    }
    const cell = (v) => String(v).replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""');
    return rows.map((row) => row.map((v) => `"${cell(v)}"`).join(',')).join('\n');
  };
  const downloadText = (filename, text, mime = 'text/plain;charset=utf-8') => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = Object.assign(document.createElement('a'), { href: url, download: filename, style: 'display:none' });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (err) {
      return false;
    }
  };
  const flash = (node, text, original) => {
    if (!node) return;
    node.textContent = text;
    setTimeout(() => { if (active() && node.isConnected) node.textContent = original; }, 2000);
  };
  const withBusy = async (fn) => {
    if (runState.interaction || !active() || runState.phase !== 'idle') return;
    const lease = {};
    runState.interaction = lease;
    try { return await fn(); } finally { if (runState.interaction === lease) runState.interaction = null; }
  };
  const retryable = () => sortUniq(inputKeys()).filter(term => !isAdded(term));
  const undoableBatches = () => state.batches
    .map((batch, index) => ({ batch, index }))
    .filter(({ batch }) => batchSelected(batch).length > 0);
  const undoToggleLabel = (open) => `${open ? '▾' : '↩'} Undo a batch`;
  const renderBatches = () => {
    const node = el('bp-batches');
    const canRetry = retryable().length;
    show('bp-retry-wrap', canRetry > 0);
    const retry = el('bp-retry');
    if (retry) {
      retry.textContent = `Retry ${canRetry}`;
      retry.title = `${canRetry} not found`;
    }
    show('bp-undo-wrap', undoableBatches().length > 0);
    show('bp-batches', false);
    const toggle = el('bp-undo-toggle');
    if (toggle) toggle.textContent = undoToggleLabel(false);
    if (!node) return;
    const undoable = undoableBatches();
    clearDom(node);
    if (!undoable.length) return;
    undoable.forEach(({ batch, index: i }, position) => {
      const notFound = batch.people.filter(term => !isAdded(term)).length;
      const outcomeData = [
        { text: `${batchSelected(batch).length} added`, color: PALETTE.greenText },
        notFound ? { text: `${notFound} not found`, color: PALETTE.amber } : null,
      ].filter(Boolean);
      const outcomes = dom('span');
      outcomeData.forEach((outcome, outcomeIndex) => {
        if (outcomeIndex) outcomes.appendChild(dom('span', { className: 'bp-sep' }, ' · '));
        outcomes.appendChild(dom('span', { style: `color:${outcome.color};` }, outcome.text));
      });
      node.appendChild(dom('div', { className: `bp-batch${position < undoable.length - 1 ? ' bp-batch-gap' : ''}`, style: 'display:flex;' },
        dom('span', { className: 'bp-batch-text' },
          dom('span', { className: 'bp-batch-name', style: 'display:block;' }, `${position + 1}. ${batch.source || batch.label}`), outcomes),
        dom('button', { type: 'button', 'data-undo': i, className: buttonClasses('gray', 'bp-undo-button') }, 'Undo')));
    });
    node.querySelectorAll('button[data-undo]').forEach((b) => { b.onclick = () => undoBatch(Number(b.dataset.undo)); });
  };
  const retryNotFound = () => withBusy(async () => {
    const targets = retryable();
    if (!targets.length) return false;
    show('bp-more', false);
    setStatus(`⏳ Retrying ${plural(targets.length, 'entry')}…`);
    const scratch = makeRetry(targets);
    state.pendingBatch = scratch;
    const result = await runList(targets, 'Retrying', scratch);
    if (result.setupFailed) {
      state.pendingBatch = null;
      inputNotice = result.message;
      return true;
    }
    if (!active() || recovering() || result.cancelled) return false;
    const { gained } = settleRetry(scratch);
    setStatus(gained
      ? `✓ Retry matched ${gained} of ${targets.length}.`
      : `⚠ Retry matched none of the ${targets.length}.`);
    return true;
  }).then((ok) => ok && active() && !recovering() && offerAfterBatch());
  const undoQuestion = (batch) => {
    const name = escapeHtml(clip(batch.source || batch.label, 40));
    const notFound = batch.people.filter(term => !isAdded(term)).length;
    const skipped = sortUniq(batch.skips.map(skip => skip.key)).length;
    const leaving = [notFound ? plural(notFound, 'not-found entry') : '', skipped ? plural(skipped, 'skipped value') : ''].filter(Boolean);
    const verb = notFound + skipped === 1 ? 'leaves' : 'leave';
    return `Remove the ${plural(ownedAdded(batch).length, 'added entry')} from "${name}"?`
      + (leaving.length ? ` Its ${leaving.join(' and ')} ${verb} the CSV too.` : '') + ' Every other batch stays.';
  };
  const undoBatch = (index) => withBusy(async () => {
    const batch = state.batches[index];
    if (!batch) return;
    const name = batch.source || batch.label;
    if (!(await confirmModal('Undo this batch?', undoQuestion(batch), 'Undo batch', 'Keep working'))) return;
    if (!beginRun('cancelling', 'undo')) return;
    const undoSettled = holdSettlement('undo');
    show('bp-more', false);
    setStatus(`↩ Removing "${clip(name, 40)}"…`);
    const { failed } = await removeBatchSelections(batch);
    if (!active()) { undoSettled(); return; }
    if (failed.length) {
      keepUnremovedEntries(batch, failed);
      batch.skips = [];
      inputNotice = `⚠ ${plural(failed.length, 'entry')} could not be removed and stay in "${clip(name, 30)}" — could not verify → try Undo again.`;
      setStatus(inputNotice);
    } else {
      dropOwnedPeople(batch);
      state.batches.splice(index, 1);
      setStatus(`↩ Undid "${clip(name, 40)}".`);
    }
    refreshRecordBoundary();
    renderCounts();
    undoSettled();
    if (recovering()) return;
    finishRun();
    return true;
  }).then((done) => {
    if (!done || !active()) return;
    if (!state.batches.length) { renderBatches(); return collectAndFinish(); }
    return offerAfterBatch();
  });
  const startFresh = async () => {
    if (!(await confirmModal('Start over?',
      reportMode ? `Empties the ${REPORT_PAGE.labels.email} box and drops every batch and count. Report dates and filters stay. Cannot be undone.` : `Empties the Email and ${escapeHtml(staffIdLabel())} boxes, <strong>clears your other search filters</strong>, `
      + 'and drops every batch and count. Cannot be undone.',
      'Start over', 'Keep working', 'red'))) return false;
    if (!beginRun('cancelling', 'reset')) return false;
    try {
      setStatus('⏳ Starting over…');
      if (!inputViewVisible()) {
        if (!(await goToInputView()) || !inputViewVisible()) {
          setStatus('⚠ Could not return to the search form. Nothing was cleared.');
          return false;
        }
      }
      if (!active()) return false;
      if (!reportMode && document.querySelector('button.js-clear-search')) click('button.js-clear-search');
      await wait(T.gap);
      if (!active()) return false;
      clearBox();
      clearBox('id');
      let stillThere;
      try { stillThere = selectedIds().length + (empidReady() ? selectedIds('id').length : 0); }
      catch { setStatus('⚠ Could not read the selection. Run record kept → try Start over again.'); return false; }
      if (stillThere) {
        setStatus('⚠ The field did not empty. Nothing was cleared.');
        return false;
      }
      resetUIAndState();
      return true;
    } finally { finishRun(); }
  };
  async function collectAndFinish() {
    if (recovering()) return;
    while (active() && !recovering()) {
      const input = await getInput();
      if (!active() || recovering()) return;
      if (input.back) { show('bp-input', false); return offerAfterBatch(); }
      const confirmation = confirmBatches(input.sources);
      if (!confirmation) continue;
      const { prepared } = confirmation;
      state.queuedBatches = prepared.map(({ batch }) => batch);
      for (const { batch, toAdd } of prepared) {
        if (!active() || recovering()) return;
        state.queuedBatches.shift();
        state.pendingBatch = batch;
        const result = toAdd.length || reportMode ? await runList(toAdd, 'Adding', batch) : { finished: true };
        if (result.setupFailed) {
          if (!active() || recovering()) return;
          commitBatch(batch);
          state.queuedBatches.splice(0).forEach(commitBatch);
          refreshRecordBoundary();
          renderCounts();
          inputNotice = result.message;
          return collectAndFinish();
        }
        if (!active() || result.cancelled) {
          if (!recovering()) {
            const queued = state.queuedBatches.splice(0);
            if (active() && result.cancelled) queued.forEach(commitBatch);
          }
          return;
        }
        commitBatch(batch);
        renderCounts();
      }
      setLive('');
      return offerAfterBatch();
    }
  }
  const offerAfterBatch = async () => {
    if (!active() || recovering()) return;
    setStatus(inputNotice || '');
    inputNotice = '';
    renderBatches();
    show('bp-more', true, 'flex');
    const choices = { 'bp-add-more': 'more', 'bp-cancel-all': 'reset' };
    let choice = await askOne(choices);
    while (choice === 'reset' && active() && !(await startFresh())) choice = await askOne(choices);
    if (!active() || recovering()) return;
    show('bp-more', false);
    return collectAndFinish();
  };
  const saveCsv = button => {
    const ok = downloadText(`yoink-${reportMode ? 'report' : 'staff'}-${stamp()}.csv`, buildCsv(), 'text/csv;charset=utf-8');
    flash(button, ok ? 'Saved' : 'Could not save', 'Download CSV');
  };
  el('bp-retry').onclick = retryNotFound;
  el('bp-undo-toggle').onclick = () => {
    const open = el('bp-batches')?.style.display !== 'none';
    show('bp-batches', !open);
    el('bp-undo-toggle').textContent = undoToggleLabel(!open);
  };
  el('bp-csv-dl').onclick = () => saveCsv(el('bp-csv-dl'));
  el('bp-recovery-csv').onclick = async () => {
    await recoveryTask;
    if (active()) saveCsv(el('bp-recovery-csv'));
  };
  el('bp-recovery-reload').onclick = async () => {
    await recoveryTask;
    if (active()) location.reload();
  };
  const BENIGN = /ResizeObserver loop|Script error\.?$/i;
  const fail = (message, mine) => {
    if (!active() || BENIGN.test(message)) return;
    if (mine && !hasSettlement('lookup')) setStatus(`✗ ${clip(message, 80)}`, message);
  };
  on(window, 'error', (e) => {
    const from = String(e.filename || '');
    const ours = !from || /yoink|chrome-extension:|^blob:|^debugger/i.test(from);
    fail(`Page error: ${e.message}`, ours);
  });
  on(window, 'unhandledrejection', (e) => fail(`Unhandled rejection: ${e.reason?.message || e.reason}`, true));
  try {
    const readiness = preflight();
    startAddClock();
    showReadiness(readiness);
    if (readiness.ready) {
      watchSession();
      watchStalls();
    }
    if (readiness.ready && active() && !fieldOnScreen()) {
      setStatus('⏳ Returning to the search form…');
      if (reportMode || !(await goToInputView()) || !fieldOnScreen()) {
        readiness.ready = false;
        readiness.failures.unshift('The search form is not open — go back to it and start Yoink again.');
        showReadiness(readiness);
      } else {
        setStatus('');
      }
    }
    try {
      const carried = selectedEmails();
      state.selectedSet = carried;
      if (carried.size) inputNotice = `${plural(carried.size, 'entry')} already in the box — they will not be re-searched.`;
    } catch {
      state.selectedSet = null;
      inputNotice = '⚠ Could not read the selection → load or paste again.';
    }
    if (!readiness.ready) {
      setStatus('Tool locked — close Yoink.');
      return;
    }
    if (!active()) return;
    await collectAndFinish();
  } catch (err) {
    const message = err.message || 'Bootstrap failed.';
    destroy();
    alert(`Yoink could not start: ${message}`);
  }
})();
})();
