// v0.13.1
(() => {
'use strict';
const __snoozeModules = {
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
"family/reader/stream.js": function (__require, __exports, document, window) {
'use strict';
const { LIMITS, ReaderLimitError } = __require("./limits.js");
const { ERROR_CODES } = __require("./sheet.js");
const { bytesToBinaryString, utf8Read } = __require("./text.js");
const CSV_MAX_BYTES = 1024 * 1024 * 1024;
const CSV_PIECE_BYTES = 64 * 1024;
const CSV_MAX_FIELD = 1024 * 1024;
const CSV_MAX_ROW = 4 * 1024 * 1024;
function csvStopped() {
  return Object.assign(new Error('Reading stopped.'), { stale: true });
}
function csvYield() {
  return new Promise(resolve => setTimeout(resolve, 0));
}
function csvNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
async function* csvBytePieces(file, options = {}) {
  const { isCurrent = () => true, onCancel, onProgress, limits = {} } = options;
  const maxBytes = limits.maxInputBytes ?? CSV_MAX_BYTES;
  const tooLarge = () => new ReaderLimitError(`${file.name || 'CSV file'} is larger than 1 GB`);
  if (file.size > maxBytes) throw tooLarge();
  let read = 0;
  let lastYield = csvNow();
  const progress = () => {
    if (!isCurrent()) throw csvStopped();
    if (read > maxBytes) throw tooLarge();
    onProgress?.(read, file.size);
    if (!isCurrent()) throw csvStopped();
  };
  if (!isCurrent()) throw csvStopped();
  if (typeof file.stream === 'function') {
    const reader = file.stream().getReader();
    let unregister, completed = false;
    try {
      unregister = onCancel?.(() => { reader.cancel().catch(() => {}); });
      for (;;) {
        if (!isCurrent()) throw csvStopped();
        const { done, value } = await reader.read();
        if (done) { completed = true; break; }
        for (let at = 0; at < value.length; at += CSV_PIECE_BYTES) {
          const piece = value.subarray(at, at + CSV_PIECE_BYTES);
          read += piece.length;
          progress();
          yield piece;
          if (csvNow() - lastYield >= 16) { await csvYield(); lastYield = csvNow(); }
        }
      }
    } finally {
      try {
        unregister?.();
      } finally {
        try { if (!completed) await reader.cancel(); } catch {   }
        finally { reader.releaseLock(); }
      }
    }
  } else if (typeof file.slice === 'function') {
    for (let at = 0; at < file.size; at += CSV_PIECE_BYTES) {
      if (!isCurrent()) throw csvStopped();
      const piece = new Uint8Array(await file.slice(at, at + CSV_PIECE_BYTES).arrayBuffer());
      read += piece.length;
      progress();
      yield piece;
      if (csvNow() - lastYield >= 16) { await csvYield(); lastYield = csvNow(); }
    }
  } else throw new Error('This browser could not stream the CSV.');
  if (!isCurrent()) throw csvStopped();
  onProgress?.(read, file.size);
  if (!isCurrent()) throw csvStopped();
}
async function* csvTextPieces(file, options = {}, startText = () => {}) {
  let prefix = new Uint8Array(0), decoder = null, ready = false, familyUtf8 = false, carry = '';
  const decode = (piece, final = false) => {
    if (!familyUtf8) return decoder ? decoder.decode(piece, { stream: !final }) : bytesToBinaryString(piece);
    const text = carry + bytesToBinaryString(piece);
    let end = 0;
    while (end < text.length) {
      const first = text.charCodeAt(end);
      const width = first < 128 ? 1 : first > 191 && first < 224 ? 2 : first < 240 ? 3 : 4;
      if (!final && end + width > text.length) break;
      end += width;
    }
    const boundary = Math.min(end, text.length);
    carry = text.slice(boundary);
    return utf8Read(text.slice(0, boundary));
  };
  const start = piece => {
    const utf16 = piece[0] === 255 && piece[1] === 254;
    const bom = piece[0] === 239 && piece[1] === 187 && piece[2] === 191;
    if (bom && piece[3] === 60) throw new Error('This file type is not supported.');
    startText(utf16 || [60, 10, 13, 32].includes(piece[0]));
    familyUtf8 = bom;
    decoder = bom || (options.binary && !utf16) ? null : new TextDecoder(utf16 ? 'utf-16le' : 'utf-8', { fatal: !utf16 });
    return piece.subarray(utf16 ? 2 : bom ? 3 : 0);
  };
  for await (const bytes of csvBytePieces(file, options)) {
    let piece = bytes;
    if (!ready) {
      const joined = new Uint8Array(prefix.length + bytes.length);
      joined.set(prefix); joined.set(bytes, prefix.length); prefix = joined;
      if (prefix.length < 8) continue;
      ready = true;
      piece = start(prefix);
      prefix = null;
    }
    yield decode(piece);
  }
  if (!ready) yield decode(start(prefix), true);
  else yield decode(new Uint8Array(0), true);
}
function csvSeparator(sample) {
  const separators = [',', '\t', ';', '|'], counts = [0, 0, 0, 0];
  let quoted = false;
  for (const char of sample) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && separators.includes(char)) counts[separators.indexOf(char)]++;
  }
  return separators[counts.indexOf(Math.max(...counts))];
}
function csvField(raw) {
  if (raw.endsWith('\r')) raw = raw.slice(0, -1);
  if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1).replace(/""/g, '"');
  return Object.hasOwn(ERROR_CODES, raw) ? (ERROR_CODES[raw] === 0 ? null : '') : raw;
}
async function streamCsvRows(file, onRow, options = {}) {
  const { isCurrent = () => true, wanted = null, limits = {} } = options;
  const maxCell = limits.maxCellChars ?? CSV_MAX_FIELD;
  const maxRow = limits.maxRowChars ?? CSV_MAX_ROW;
  const maxColumns = limits.maxColumns ?? LIMITS.maxColumns;
  let sample = '', separator = null, field = '', first = '', quoted = false;
  let values = [], column = 0, columnCount = 1, rowHasValue = false;
  let pendingCR = false, hasField = false, fieldText = 0, rowText = 0, sourceRow = 1;
  let htmlCheck = true, html = false;
  let delimiters;
  const quote = /"/gu;
  const pairAt = (text, at) => at > 0 && at < text.length &&
    text.charCodeAt(at - 1) >= 0xd800 && text.charCodeAt(at - 1) <= 0xdbff &&
    text.charCodeAt(at) >= 0xdc00 && text.charCodeAt(at) <= 0xdfff;
  const append = run => {
    if (!hasField) first = run[0];
    hasField = true;
    let length = run.length;
    if (fieldText + length > maxCell) length = Math.min(length, Math.max(1, Math.floor(maxCell - fieldText) + 1));
    if (rowText + length > maxRow) length = Math.min(length, Math.max(1, Math.floor(maxRow - rowText) + 1));
    if (pairAt(run, length)) length++;
    fieldText += length; rowText += length;
    if (!wanted || wanted.has(column)) field += run.slice(0, length);
    else if (field.length < 32) {
      let kept = Math.min(length, 32 - field.length);
      if (pairAt(run, kept)) kept++;
      field += run.slice(0, kept);
    }
    if (fieldText > maxCell) throw new ReaderLimitError('A CSV cell is too large to read (over 1 MB of text).');
    if (rowText > maxRow) throw new ReaderLimitError('A CSV row is too large to read (over 4 MB of text).');
  };
  const endCell = () => {
    const value = csvField(field);
    if (value !== '' && value !== null) rowHasValue = true;
    values[column] = !wanted || wanted.has(column) ? value : '';
    column++;
    if (column > maxColumns) throw new ReaderLimitError('File has too many columns.');
    columnCount = Math.max(columnCount, column);
    field = ''; first = ''; hasField = false; fieldText = 0;
  };
  const endRow = (finishCell = true) => {
    if (finishCell) endCell();
    if (rowHasValue) {
      if (!isCurrent()) throw csvStopped();
      onRow(Object.defineProperty(values, 'sourceRow', { value: sourceRow }));
      if (!isCurrent()) throw csvStopped();
    }
    values = []; column = 0; rowHasValue = false; rowText = 0; sourceRow++;
  };
  const consume = piece => {
    if (!isCurrent()) throw csvStopped();
    if (htmlCheck) {
      for (const char of piece) {
        if (char !== '\n' && char !== '\r' && char !== ' ') { html = char === '<'; htmlCheck = false; }
        if (!htmlCheck) break;
      }
    }
    if (html) return;
    let at = 0;
    while (at < piece.length) {
      if (pendingCR) { pendingCR = false; if (piece[at] === '\n') { at++; continue; } }
      const pattern = quoted ? quote : delimiters;
      pattern.lastIndex = at;
      const match = pattern.exec(piece);
      const next = match ? match.index : piece.length;
      if (next > at) { append(piece.slice(at, next)); at = next; }
      if (!match) break;
      const char = match[0];
      at += char.length;
      if (!hasField) first = char;
      if (char === '"' && first === '"') quoted = !quoted;
      if (!quoted && (char === separator || char === '\n' || char === '\r')) {
        if (char === separator) {
          endCell();
          if (column >= maxColumns) throw new ReaderLimitError('File has too many columns.');
        } else { endRow(); pendingCR = char === '\r'; }
      } else append(char);
    }
  };
  const start = () => {
    if (sample.startsWith('sep=') && /[\r\n]/.test(sample[5] || '')) {
      separator = sample[4]; sample = sample.slice(sample.slice(5, 7) === '\r\n' ? 7 : 6);
    } else separator = csvSeparator(sample.slice(0, 1024));
    delimiters = new RegExp('[' + separator.replace(/[\\\]\[\^\-]/g, '\\$&') + '\\n\\r"]', 'gu');
    consume(sample); sample = '';
  };
  for await (const piece of csvTextPieces(file, options, check => { htmlCheck = check; })) {
    if (separator !== null) consume(piece);
    else { sample += piece; if (sample.length >= 1024) start(); }
  }
  if (separator === null) start();
  if (!html && (hasField || column)) endRow(hasField);
  return { hasSheet: !html, columnCount };
}
__exports.csvBytePieces = csvBytePieces;
__exports.csvTextPieces = csvTextPieces;
__exports.csvSeparator = csvSeparator;
__exports.csvField = csvField;
__exports.streamCsvRows = streamCsvRows;
__exports.CSV_MAX_BYTES = CSV_MAX_BYTES;
__exports.csvStopped = csvStopped;
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
      if (cell.v === undefined && (hasFormula || cell.arrayRef || /<f(?:\s|>|\/)/.test(body))) {
        cell.v = '#VALUE!';
        cell.t = 'e';
      } else if (cellTag.t == null && cell.v === undefined) {
        continue;
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
  if (!found || !FULL_ADDRESS.test(email.slice(found[0].length))) return '';
  const [month, day, year] = found[1].split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? found[1] : '';
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
},
"family/leave-warning.js": function (__require, __exports, document, window) {
'use strict';
function createLeaveWarning({ win = globalThis.window, atStake }) {
  let started = false;
  function beforeUnload(event) {
    let warn = true;
    try {
      warn = atStake() === true;
    } catch {
    }
    if (warn) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  function start() {
    if (started) return;
    win.addEventListener('beforeunload', beforeUnload);
    started = true;
  }
  function stop() {
    if (!started) return;
    win.removeEventListener('beforeunload', beforeUnload);
    started = false;
  }
  return { start, stop };
}
__exports.createLeaveWarning = createLeaveWarning;
},
"files/xml.js": function (__require, __exports, document, window) {
'use strict';
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const column = index => (index < 26 ? '' : column(Math.floor(index / 26) - 1)) + String.fromCharCode(65 + (index % 26));
__exports.xml = xml;
__exports.column = column;
},
"rules/prepare.js": function (__require, __exports, document, window) {
'use strict';
const { decodeFully } = __require("../family/text.js");
const { cleanEmail, plainEmail } = __require("../family/email.js");
function descriptionLines(value) {
  const text = decodeFully(value)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n?/g, '\n');
  return text.split('\n').map(line => line.replace(/[\s ]+/g, ' ').trim()).filter(Boolean);
}
const headerKey = value => String(value ?? '').replace(/^﻿/, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const valueKey = value => decodeFully(value).replace(/[-‐-―−]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const emailFormKey = value => cleanEmail(value);
const emailKey = value => plainEmail(value);
const ANY_ADDRESS = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/gi;
function addressesIn(value) {
  const text = decodeFully(value).replace(/\p{Cf}+/gu, '');
  const separated = text.replace(/\s*@\s*/g, '@').replace(/\s*\.\s*/g, '.').match(ANY_ADDRESS) || [];
  const compact = text.replace(/\s+/g, '').match(ANY_ADDRESS) || [];
  return (separated.length > compact.length ? separated : compact).map(emailKey);
}
const addressCount = value => addressesIn(value).length;
const noteTextKey = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const professionalName = record => record.person?.professional || record.pageName || record.name || record.email || '';
const rememberPageName = (record, shownName) => { record.pageName = String(shownName || '').split('(')[0].trim(); };
__exports.decodeFully = decodeFully;
__exports.descriptionLines = descriptionLines;
__exports.headerKey = headerKey;
__exports.valueKey = valueKey;
__exports.emailFormKey = emailFormKey;
__exports.emailKey = emailKey;
__exports.addressesIn = addressesIn;
__exports.addressCount = addressCount;
__exports.noteTextKey = noteTextKey;
__exports.professionalName = professionalName;
__exports.rememberPageName = rememberPageName;
},
"rules/dates.js": function (__require, __exports, document, window) {
'use strict';
const { reportWindow, todayOf } = __require("../family/report-window.js");
function readIsoDay(text) {
  const match = String(text ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const day = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  return isRealDay(day) ? day : null;
}
const dayFromParts = (y, m, d) => readIsoDay(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
function isRealDay({ y, m, d }) {
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}
const toUtc = ({ y, m, d }) => Date.UTC(y, m - 1, d);
const fromUtc = ms => {
  const date = new Date(ms);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
};
const compareDays = (a, b) => toUtc(a) - toUtc(b);
const sameDay = (a, b) => Boolean(a && b && compareDays(a, b) === 0);
const addDays = (day, count) => fromUtc(toUtc(day) + count * 86400000);
const weekday = day => new Date(toUtc(day)).getUTCDay();
const isWeekend = day => [0, 6].includes(weekday(day));
function workingDays(start, end) {
  const days = [];
  for (let day = start; compareDays(day, end) <= 0; day = addDays(day, 1)) if (!isWeekend(day)) days.push(day);
  return days;
}
const workdayCount = (start, end) => workingDays(start, end).length;
function workdayFrom(day) {
  let at = day;
  while (isWeekend(at)) at = addDays(at, 1);
  return at;
}
function workdayThrough(day) {
  let at = day;
  while (isWeekend(at)) at = addDays(at, -1);
  return at;
}
const nextWorkday = day => workdayFrom(addDays(day, 1));
function mondayOf(day) {
  return addDays(day, -((weekday(day) + 6) % 7));
}
const usDate = day => (day ? `${String(day.m).padStart(2, '0')}/${String(day.d).padStart(2, '0')}/${day.y}` : '');
function localStamp(now = new Date()) {
  const two = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}`;
}
const fileStamp = (now = new Date()) => localStamp(now).replace(':', '.');
function readDescriptionDay(text) {
  const matches = [...String(text ?? '').matchAll(/(\d+)[/.-](\d{1,2})[/.-](\d+)/g)];
  if (matches.length > 1) return { day: null, multipleDates: true };
  const match = matches[0];
  if (!match) return { day: null };
  const [first, second, third] = match.slice(1).map(Number);
  const yearFirst = first > 31 || match[1].length > 2;
  const yearLength = match[yearFirst ? 1 : 3].length;
  if (yearLength !== 2 && yearLength !== 4) return { day: null };
  let [year, month, date] = yearFirst ? [first, second, third] : [third, first, second];
  if (!yearFirst && month > 12 && date >= 1 && date <= 12) [month, date] = [date, month];
  const y = yearLength === 2 ? 2000 + year : year;
  const day = { y, m: month, d: date };
  if (!isRealDay(day)) return { day: null };
  if (!yearFirst && month <= 12 && date <= 12 && month !== date) return { day: null, readings: [day, { y, m: date, d: month }] };
  return { day };
}
function lastWorkingDayOfMay(start) {
  const y = start.m <= 5 ? start.y : start.y + 1;
  return workdayThrough({ y, m: 5, d: 31 });
}
__exports.reportWindow = reportWindow;
__exports.todayOf = todayOf;
__exports.readIsoDay = readIsoDay;
__exports.dayFromParts = dayFromParts;
__exports.compareDays = compareDays;
__exports.sameDay = sameDay;
__exports.addDays = addDays;
__exports.weekday = weekday;
__exports.isWeekend = isWeekend;
__exports.workingDays = workingDays;
__exports.workdayCount = workdayCount;
__exports.workdayFrom = workdayFrom;
__exports.workdayThrough = workdayThrough;
__exports.nextWorkday = nextWorkday;
__exports.mondayOf = mondayOf;
__exports.usDate = usDate;
__exports.localStamp = localStamp;
__exports.fileStamp = fileStamp;
__exports.readDescriptionDay = readDescriptionDay;
__exports.lastWorkingDayOfMay = lastWorkingDayOfMay;
},
"servicenow/tickets.js": function (__require, __exports, document, window) {
'use strict';
const { descriptionLines } = __require("../rules/prepare.js");
const { readDescriptionDay } = __require("../rules/dates.js");
const LINES = {
  'leave start date': ['leave', 'start'],
  'leave end date': ['leave', 'end'],
  'estimated return date': ['leave', 'estimatedReturn'],
  'confirmed return to work date': ['leave', 'confirmedReturn'],
  'date of resignation': ['exit', 'resignation'],
  'planned last working day': ['exit', 'lastWorkingDay'],
  'last work date': ['exit', 'lastWorkingDay'],
};
const LEAD_INS = ['separation meeting is complete.'];
const labelKey = text => text.replace(/\s+/g, ' ').trim().toLowerCase();
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const NUMBER_DATE = /\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/;
const WORD_DATE = new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH},?\\s+\\d{4}\\b`, 'i');
const holdsDate = text => NUMBER_DATE.test(text) || WORD_DATE.test(text);
function readSubcategory(ticket) {
  const first = String(ticket['Subcategory 1'] ?? '').trim();
  const second = String(ticket['Subcategory 2'] ?? '').trim();
  const key = text => text.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\s*-\s*/g, '-');
  const a = key(first), b = key(second);
  let kind = 'other';
  if (a === 'leaves-consulting' && !b) kind = 'leave';
  if (a === 'exit-consulting' && !b) kind = 'exit';
  if (a === 'system update-consulting' && b === 'ele update-leaves') kind = 'leave';
  if (a === 'system update-consulting' && b === 'ele update-exit') kind = 'exit';
  const tax = a === 'leaves-tax' && !b || a === 'system update-tax' && b === 'ele update-leaves';
  if (tax) kind = 'leave';
  const audit = a === 'leaves-audit' && !b || a === 'exit-audit' && !b ||
    a === 'system update-audit' && ['ele update-leaves', 'ele update-exit'].includes(b);
  if (audit) kind = a === 'leaves-audit' || b === 'ele update-leaves' ? 'leave' : 'exit';
  return { first, second, kind, text: second || first, ...(tax ? { site: 'tax' } : {}), ...(audit ? { business: 'audit' } : {}) };
}
function subcategoryProblem(subcategory, notification) {
  if (subcategory.kind === 'other') return { outcome: 'notHandled', code: 'notLeaveOrExitCase', subcategory };
  if (notification.kind !== 'mixed' && !(notification.kind === 'other' && notification.problems.length) && subcategory.kind !== notification.kind) {
    return { outcome: 'byHand', code: 'subcategoryMismatch', subcategory, descriptionKind: notification.kind };
  }
  return null;
}
function readLine(line) {
  const colon = line.indexOf(':');
  if (colon > 0) {
    let label = labelKey(line.slice(0, colon));
    for (const lead of LEAD_INS) if (label.startsWith(lead)) label = label.slice(lead.length).trim();
    const value = line.slice(colon + 1).trim();
    const known = LINES[label];
    if (known) return { kind: known[0], field: known[1], label: line.slice(0, colon).trim(), value, ...(value ? readDescriptionDay(value) : { day: null }) };
  }
  return holdsDate(line) ? { unknownDateLine: line } : { other: line };
}
function readNotification(description) {
  const lines = descriptionLines(description);
  const read = lines.map(readLine);
  const kinds = new Set(read.filter(line => line.kind).map(line => line.kind));
  const kind = kinds.size === 0 ? 'other' : kinds.size > 1 ? 'mixed' : [...kinds][0];
  const dates = {};
  const fields = [...new Set(read.filter(line => line.field).map(line => line.field))];
  const problems = [];
  for (const line of read) {
    if (line.unknownDateLine) problems.push({ code: 'unknownLine', line: line.unknownDateLine });
    if (!line.field) continue;
    const contextOnly = ['estimatedReturn', 'confirmedReturn'].includes(line.field);
    if (!line.value) continue;
    if (line.multipleDates) {
      if (contextOnly) continue;
      problems.push({ code: 'datesOnOneLine', label: line.label, value: line.value });
      continue;
    }
    if (line.readings) {
      if (contextOnly) continue;
      problems.push({ code: 'twoWayDate', label: line.label, value: line.value, readings: line.readings });
      continue;
    }
    if (!line.day) {
      if (contextOnly) continue;
      problems.push({ code: 'unreadableDate', label: line.label, value: line.value });
      continue;
    }
    const before = dates[line.field];
    if (!contextOnly && before && (before.y !== line.day.y || before.m !== line.day.m || before.d !== line.day.d)) {
      problems.push({ code: 'twoDates', label: line.label });
    }
    dates[line.field] = line.day;
  }
  return { kind, fields, ...(kind === 'leave' ? { leaveType: fields.includes('start') ? 'period' : 'endOnly' } : {}), lines, dateLines: read.filter(line => line.field).map(line => `${line.label}: ${line.value}`.trim()), dates, problems };
}
const NOTES_LIMIT = 150;
function notesFor(notification) {
  const whole = notification.lines.join(' ');
  if (whole.length <= NOTES_LIMIT) return whole;
  const dated = notification.dateLines.join(' ');
  return dated.length <= NOTES_LIMIT ? dated : null;
}
__exports.LINES = LINES;
__exports.readSubcategory = readSubcategory;
__exports.subcategoryProblem = subcategoryProblem;
__exports.readNotification = readNotification;
__exports.notesFor = notesFor;
},
"servicenow/files.js": function (__require, __exports, document, window) {
'use strict';
const { readWorkbook, ReaderUnreadableError } = __require("../family/reader/index.js");
const { emailKey, headerKey } = __require("../rules/prepare.js");
const { parseDelimited } = __require("../family/reader/csv.js");
const { readXlsx } = __require("../family/reader/xlsx.js");
const { sheetRows, ERROR_CODES } = __require("../family/reader/sheet.js");
const { bytesToBinaryString } = __require("../family/reader/text.js");
const { SN_SUBCATEGORY_COLUMNS_REQUIRED, damagedFileWords } = __require("./wording.js");
async function reportWorkbook(input, label = 'The Staff Schedule Hours Report') {
  try {
    return await readReportWorkbook(input);
  } catch (error) {
    if (error instanceof ReaderUnreadableError) throw inputReadError(error, label);
    throw error;
  }
}
async function readReportWorkbook(input) {
  const bytes = new Uint8Array(input);
  const checked = await readWorkbook(bytes);
  const keepErrors = sheet => {
    if (!sheet) return [];
    const cells = new Map(sheet.cells);
    for (const [address, cell] of cells) if (cell.t === 'e') {
      const error = Object.keys(ERROR_CODES).find(key => ERROR_CODES[key] === cell.v) || '#VALUE!';
      cells.set(address, { ...cell, t: 's', v: error, w: error });
    }
    return sheetRows({ ...sheet, cells });
  };
  if (bytes[0] === 80 && bytes[1] === 75 && bytes[2] < 9 && bytes[3] < 9) {
    const raw = await readXlsx(bytes);
    const byName = new Map();
    raw.sheetNames.forEach((name, index) => { const sheet = raw.sheetAt(index); if (sheet) byName.set(name, sheet); });
    return { sheetNames: checked.sheetNames, rows: name => keepErrors(byName.get(name)) };
  }
  if (!checked.sheetNames.length) return checked;
  let raw;
  if (bytes[0] === 255 && bytes[1] === 254) raw = new TextDecoder('utf-16le').decode(bytes.subarray(2));
  else { try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { raw = bytesToBinaryString(bytes); } }
  const rows = keepErrors(parseDelimited(raw.replace(/^\uFEFF/, '')));
  return { sheetNames: checked.sheetNames, rows: name => name === checked.sheetNames[0] ? rows : [] };
}
class InputFileError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'InputFileError';
  }
}
function inputReadError(error, label) {
  if (error instanceof InputFileError) return error;
  if (error instanceof ReaderUnreadableError) return new InputFileError(damagedFileWords(label, error.sheetName), { cause: error });
  return new InputFileError(`${label} could not be read${error?.name === 'ReaderLimitError' ? ': it is too large' : ''}.`);
}
const spreadsheetError = value => /^#(?:N\/A|VALUE!|REF!|DIV\/0!|NUM!|NAME\?|NULL!|GETTING_DATA|WTF\?)$/i.test(String(value ?? '').trim());
const SN_COLUMNS = { required: ['Number', 'Email', 'Description', 'Subcategory 1', 'Subcategory 2'], optional: ['Name'] };
const HEADER_SEARCH_ROWS = 50;
const extensionOf = name => (String(name).match(/\.[^.]+$/) || [''])[0].toLowerCase();
function requireUniqueColumns(headers, label, names) {
  const used = new Set(names.map(headerKey));
  const seen = new Set();
  for (const header of headers) {
    const key = headerKey(header);
    if (!key || !used.has(key)) continue;
    if (seen.has(key)) throw new InputFileError(`${label}: column "${String(header).trim()}" is repeated. Export it again with unique column names.`);
    seen.add(key);
  }
}
function swallowedTicket(entry, extension) {
  const prefix = extension === '.csv' ? (entry.Number?.match(/^[A-Za-z]+/) || [''])[0] : '';
  if (!prefix) return '';
  const row = new RegExp(String.raw`\n(${prefix}\d+),`);
  for (const [column, text] of Object.entries(entry)) {
    if (column === 'Number') continue;
    const hit = String(text).match(row);
    if (hit) return `${hit[1]} appears inside "${column}"`;
  }
  return '';
}
async function readTable(file, label, { required, optional }) {
  const extension = extensionOf(file.name);
  if (extension === '.xls') throw new InputFileError(`${label} is an old Excel file (.xls). Export it as .xlsx or CSV.`);
  if (!['.csv', '.xlsx'].includes(extension)) throw new InputFileError(`${label} must be a CSV or XLSX file.`);
  let workbook;
  try {
    workbook = await reportWorkbook(await file.arrayBuffer(), label);
  } catch (error) {
    throw inputReadError(error, label);
  }
  const wanted = [...required, ...optional];
  let missingSubcategories = false;
  for (const sheet of workbook.sheetNames) {
    let rows;
    try {
      rows = workbook.rows(sheet);
    } catch (error) {
      if (error instanceof ReaderUnreadableError) throw inputReadError(error, label);
      throw error;
    }
    if (['Subcategory 1', 'Subcategory 2'].every(column => required.includes(column)) && rows.slice(0, HEADER_SEARCH_ROWS).some(row =>
      ['Number', 'Email', 'Description'].every(column => row.some(cell => headerKey(cell) === headerKey(column))) &&
      ['Subcategory 1', 'Subcategory 2'].some(column => !row.some(cell => headerKey(cell) === headerKey(column))))) missingSubcategories = true;
    const at = rows.slice(0, HEADER_SEARCH_ROWS).findIndex(row => required.every(column => row.some(cell => headerKey(cell) === headerKey(column))));
    if (at < 0) continue;
    requireUniqueColumns(rows[at], label, wanted);
    const header = rows[at].map(headerKey);
    const index = Object.fromEntries(wanted.map(column => [column, header.indexOf(headerKey(column))]));
    const out = [];
    for (const [offset, row] of rows.slice(at + 1).entries()) {
      if (!row.some(cell => String(cell ?? '').trim())) continue;
      for (const column of wanted) if (index[column] >= 0 && spreadsheetError(row[index[column]])) {
        throw new InputFileError(`${label}: spreadsheet error ${String(row[index[column]]).trim()} in "${column}", row ${row.sourceRow || at + offset + 2}. Export it again with readable values.`);
      }
      const entry = Object.fromEntries(wanted.map(column => [column, index[column] >= 0 ? String(row[index[column]] ?? '').trim() : '']));
      const swallowed = swallowedTicket(entry, extension);
      if (swallowed) throw new InputFileError(`${label}: ${entry.Number || `row ${row.sourceRow || at + offset + 2}`} seems to hold other tickets inside one field (${swallowed}). A quote was probably never closed. Export it again or fix that line, then load it.`);
      out.push(entry);
    }
    return { fileName: file.name, rows: out, missing: optional.filter(column => index[column] < 0) };
  }
  if (missingSubcategories) throw new InputFileError(SN_SUBCATEGORY_COLUMNS_REQUIRED);
  throw new InputFileError(`${label} has no header row with ${required.join(', ')}.`);
}
__exports.reportWorkbook = reportWorkbook;
__exports.InputFileError = InputFileError;
__exports.inputReadError = inputReadError;
__exports.spreadsheetError = spreadsheetError;
__exports.SN_COLUMNS = SN_COLUMNS;
__exports.requireUniqueColumns = requireUniqueColumns;
__exports.readTable = readTable;
},
"servicenow/wording.js": function (__require, __exports, document, window) {
'use strict';
const SN_SUBCATEGORY_COLUMNS_REQUIRED = 'Export the SN report with Subcategory 1 and Subcategory 2.';
const damagedFileWords = (label, sheetName) => `${label} couldn't be read: ${sheetName === null ? 'it is damaged' : `its sheet "${sheetName}" is damaged`}. Open it in Excel, save it again as XLSX, and add it again.`;
__exports.SN_SUBCATEGORY_COLUMNS_REQUIRED = SN_SUBCATEGORY_COLUMNS_REQUIRED;
__exports.damagedFileWords = damagedFileWords;
},
"servicenow/collate.js": function (__require, __exports, document, window) {
'use strict';
const { addressCount, emailKey, emailFormKey, valueKey } = __require("../rules/prepare.js");
const { LINES, readNotification, readSubcategory, subcategoryProblem } = __require("./tickets.js");
const { todayOf, readDescriptionDay, usDate } = __require("../rules/dates.js");
const { decideLeave } = __require("../rules/leave.js");
const { decideExit } = __require("../rules/exit.js");
const numberOrder = (a, b) => a.number < b.number ? -1 : a.number > b.number ? 1 : 0;
const siteEmail = record => `${record.subcategory.site || 'consulting'}:${emailKey(record.email)}`;
const dateKey = note => JSON.stringify([note.kind, note.leaveType, Object.keys(note.dates).filter(field => note.kind !== 'leave' || !['estimatedReturn', 'confirmedReturn'].includes(field)).sort().map(field => {
  const day = note.dates[field];
  return [field, day.y, day.m, day.d];
})]);
const noteKey = note => JSON.stringify(note.lines.map(line => {
  const colon = line.indexOf(':');
  const field = colon >= 0 && LINES[valueKey(line.slice(0, colon))];
  if (!field) return valueKey(line);
  const value = line.slice(colon + 1).trim(), parsed = readDescriptionDay(value);
  return [field[1], parsed.day ? usDate(parsed.day) : valueKey(value)];
}));
function collate({ tickets }, today = todayOf()) {
  const seen = new Set();
  const records = [];
  for (const ticket of tickets) {
    const twoEmails = addressCount(ticket.Email) > 1;
    const email = twoEmails ? '' : emailKey(ticket.Email);
    const number = String(ticket.Number || '').trim();
    const rowKey = JSON.stringify([email, number, ticket.Name, ticket.Description, ticket['Subcategory 1'], ticket['Subcategory 2']]);
    if (number && seen.has(rowKey)) continue;
    if (number) seen.add(rowKey);
    const notification = readNotification(ticket.Description);
    const subcategory = readSubcategory(ticket);
    records.push({
      number,
      name: String(ticket.Name || '').trim(),
      email: email ? String(ticket.Email).trim() : '',
      exportEmail: String(ticket.Email ?? ''),
      notification, subcategory,
      caseProblem: twoEmails ? { outcome: 'byHand', code: 'twoEmails' } : subcategoryProblem(subcategory, notification),
      ticketsForEmail: email ? 1 : 0,
      person: { professional: '', business: '', practice: '', businessArea: '', termDate: '', resourceManager: '' },
    });
  }
  const identities = new Map();
  for (const record of records) {
    if (!record.email) continue;
    const key = siteEmail(record);
    if (!identities.has(key)) identities.set(key, []);
    identities.get(key).push(record);
  }
  for (const group of identities.values()) {
    if (!group.some(record => emailFormKey(record.exportEmail) !== emailKey(record.exportEmail))) continue;
    if (new Set(group.map(record => valueKey(record.name))).size < 2) continue;
    for (const record of group) if (!record.caseProblem) {
      record.caseProblem = { outcome: 'byHand', code: 'exportPersonDisagrees' };
    }
  }
  const groups = new Map();
  for (const record of records) {
    if (!record.email || record.caseProblem?.outcome === 'notHandled') continue;
    const key = siteEmail(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const omitted = new Set();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const mismatch = group.find(record => record.caseProblem?.code === 'subcategoryMismatch');
    if (mismatch) {
      for (const record of group) record.caseProblem = mismatch.caseProblem;
      continue;
    }
    if (group.some(record => record.caseProblem?.code === 'exportPersonDisagrees')) continue;
    for (const record of group) {
      const own = record.notification.kind === 'exit' ? decideExit(record, today) : decideLeave(record, today);
      if (own.outcome === 'byHand' || own.outcome === 'notHandled') record.ownTicketProblem = own;
    }
    const ordered = [...group].sort(numberOrder);
    const main = ordered[0];
    const same = group.every(record => !record.ownTicketProblem && record.number && dateKey(record.notification) === dateKey(main.notification) && noteKey(record.notification) === noteKey(main.notification));
    if (same) {
      main.duplicates = [];
      const numbers = new Set([main.number]);
      for (const record of ordered.slice(1)) {
        omitted.add(record);
        if (!numbers.has(record.number)) { main.duplicates.push(record); numbers.add(record.number); }
      }
    } else {
      const ticketDates = ordered.map(record => ({ number: record.number, kind: record.notification.kind, dates: record.notification.dates }));
      for (const record of group) { record.ticketsForEmail = group.length; record.ticketDates = ticketDates; }
    }
  }
  return records.filter(record => !omitted.has(record));
}
__exports.collate = collate;
},
"rules/shared.js": function (__require, __exports, document, window) {
'use strict';
const { addDays, compareDays, dayFromParts } = __require("./dates.js");
const { valueKey } = __require("./prepare.js");
const stop = (outcome, code, extra = {}) => ({ outcome, code, ...extra });
const CMAT = ['client & market acceleration team', 'client and market acceleration team'];
const levelGroupKey = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
function ticketProblem(record) {
  if (record.caseProblem) return record.caseProblem;
  if (!record.email) return stop('byHand', 'noEmail');
  if (record.ownTicketProblem) return record.ownTicketProblem;
  const problem = record.notification.problems[0];
  if (problem) return stop('byHand', problem.code, { detail: problem });
  return record.ticketsForEmail > 1 ? stop('byHand', 'twoTickets', { count: record.ticketsForEmail, tickets: record.ticketDates || [] }) : null;
}
function termDayOf(text) {
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return dayFromParts(year, match[1], match[2]);
  }
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const serial = Math.floor(Number(text));
  if (!Number.isInteger(serial) || serial < 1 || serial > 2958465 || serial === 60) return null;
  return addDays({ y: 1899, m: 12, d: serial < 60 ? 31 : 30 }, serial);
}
function checkPerson(person, decision) {
  if (!person) return null;
  if (person.site === 'tax' && ['nationaltax', 'wnt'].includes(String(person.talentGroup || '').replace(/\s/g, '').toLowerCase())) return stop('notHandled', 'taxTalentGroup', { talentGroup: person.talentGroup });
  if (person.disagreements?.length) return stop('byHand', 'reportPersonDisagrees', { fields: person.disagreements });
  if (person.site === 'tax') {
    const level = levelGroupKey(person.levelGroup);
    if (['lpp', 'lmd', 'll'].includes(level)) return stop('noReport', 'taxPartnerMd');
    if (!['l01s', 'l10s', 'l20s', 'l30s', 'l40s', 'l50s', 'l60s - l70s'].includes(level)) return stop('byHand', 'taxLevelGroup', { levelGroup: person.levelGroup || '' });
    return null;
  }
  const audit = decision.business === 'audit';
  if (!person.business && !audit) return stop('byHand', 'noBusiness');
  const businessMatches = audit ? valueKey(person.business).replace(/\s+/g, '') === 'audit&assurance' : valueKey(person.business) === 'consulting services';
  if (!businessMatches) return stop('notHandled', 'notConsulting', { business: person.business, ...(audit ? { expectedBusiness: 'Audit & Assurance' } : {}) });
  if (audit && ['', 'not applicable'].includes(valueKey(person.resourceManager))) return stop('byHand', 'auditMissingDp');
  if (!audit && CMAT.includes(valueKey(person.businessArea)) &&
      !String(person.costCenterDescription || '').replace(/\s+/g, '').toUpperCase().includes('BLOCKEDHEADCOUNT')) return stop('byHand', 'cmat');
  const text = String(person.termDate ?? '').trim();
  const term = text ? termDayOf(text) : null;
  if (text && !term) return stop('byHand', 'termDateUnreadable');
  const ends = decision.plan?.lastWorkingDay || decision.plan?.loaEnd;
  const exit = decision.plan?.action === 'dns' || audit && !!decision.plan?.lastWorkingDay;
  if (term && ends && compareDays(term, ends) < 0) return stop('byHand', exit ? 'termBeforeLwd' : 'termBeforeEnd',
    exit ? { termDate: term, lastWorkingDay: ends } : { termDate: term, loaEnd: ends });
  return null;
}
__exports.stop = stop;
__exports.levelGroupKey = levelGroupKey;
__exports.ticketProblem = ticketProblem;
__exports.termDayOf = termDayOf;
__exports.checkPerson = checkPerson;
},
"rules/leave.js": function (__require, __exports, document, window) {
'use strict';
const { compareDays, mondayOf, reportWindow } = __require("./dates.js");
const { notesFor } = __require("../servicenow/tickets.js");
const { stop, ticketProblem, checkPerson } = __require("./shared.js");
const after = (a, b) => compareDays(a, b) > 0;
function decideLeave(record, today) {
  const { notification: note } = record;
  if (record.caseProblem) return record.caseProblem;
  const unknown = note.problems.find(problem => problem.code === 'unknownLine');
  if (unknown) return stop('byHand', 'unknownLine', { detail: unknown });
  if (note.kind === 'other') return stop('notHandled', 'notLeave');
  if (note.kind === 'mixed') return stop('byHand', 'mixedNotification');
  const problem = ticketProblem(record);
  if (problem) return problem;
  const decision = decideDates(note, today, record.subcategory?.business === 'audit');
  if (record.subcategory?.business === 'audit' && ['report', 'noReport'].includes(decision.outcome)) {
    const start = note.dates.start || today, end = note.dates.end;
    return stop('report', 'auditLoa', { business: 'audit', plan: {
      action: 'auditReadOnly', notificationType: note.leaveType, loaStart: start, leaveStart: start, loaEnd: end,
      window: reportWindow(today),
    } });
  }
  if (decision.plan) useReportEnd(decision.plan, reportWindow(today).end);
  return decision;
}
function useReportEnd(plan, reportEnd) {
  const end = plan.pastReport?.windowEnd || plan.loaEnd;
  if (!end) return;
  const start = plan.window?.start || plan.loaStart;
  if (compareDays(end, reportEnd) > 0) {
    plan.pastReport = { reportEnd, windowEnd: end };
    plan.window = { start, end: reportEnd };
  } else {
    delete plan.pastReport;
    plan.window = { start, end };
  }
}
function decideDates(note, today, withoutNotes = false) {
  const { start, end } = note.dates;
  const notificationType = note.leaveType || (start ? 'period' : 'endOnly');
  if (!start && !end) return stop('byHand', 'noDates');
  if (notificationType === 'period' && !start) return stop('byHand', 'noStart');
  if (!end) return stop('byHand', start ? 'noEnd' : 'noDates');
  if (start && after(start, end)) return stop('byHand', 'endBeforeStart');
  if (after(today, end)) return stop('noReport', 'leaveOver', { start: start || end, end, notificationType });
  const notes = withoutNotes ? '' : notesFor(note);
  if (notes === null) return stop('byHand', 'notesTooLong');
  const future = start && after(start, today);
  return stop('report', 'add', { plan: {
    action: 'add', ...(notificationType === 'endOnly' ? { notificationType } : {}),
    loaStart: future ? start : today, leaveStart: start || today, loaEnd: end,
    pastDated: !!start && after(today, start),
    window: { start: future ? start : mondayOf(today), end }, notes,
  } });
}
__exports.checkPerson = checkPerson;
__exports.decideLeave = decideLeave;
__exports.useReportEnd = useReportEnd;
},
"rules/exit.js": function (__require, __exports, document, window) {
'use strict';
const { addDays, compareDays, lastWorkingDayOfMay, mondayOf, reportWindow } = __require("./dates.js");
const { notesFor } = __require("../servicenow/tickets.js");
const { stop, ticketProblem } = __require("./shared.js");
const { entryKind } = __require("./entries.js");
const { valueKey } = __require("./prepare.js");
function emptyLwd(record) {
  if (record.person?.region === undefined) return stop('noReport', 'exitNoLwd');
  const suppliedRegion = String(record.person.region ?? '');
  const region = suppliedRegion.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\s*-\s*/g, '-');
  if (region === 'us-us') return stop('byHand', 'exitNoLwdUs');
  if (region === 'us-usi') return stop('noReport', 'exitNoLwd');
  return stop('byHand', 'exitNoLwdRegion', { region: suppliedRegion });
}
function decideExit(record, today, slice = null) {
  const problem = ticketProblem(record);
  if (problem) return problem;
  const lastWorkingDay = record.notification.dates.lastWorkingDay;
  if (record.subcategory?.business === 'audit') return decideAuditExit(record, today, slice);
  if (record.person?.region !== undefined) {
    const region = String(record.person.region ?? '').replace(/[–—]/g, '-').replace(/\s+/g, '').toLowerCase();
    if (!['us-us', 'us-usi'].includes(region)) return stop('byHand', 'exitNoLwdRegion', { region: String(record.person.region ?? '') });
    if (region === 'us-usi' && lastWorkingDay) return stop('byHand', 'exitUsiLwd');
  }
  if (!lastWorkingDay) return emptyLwd(record);
  const notes = notesFor(record.notification);
  if (notes === null) return stop('byHand', 'notesTooLong');
  return dnsDecision(lastWorkingDay, today, notes);
}
function dnsDecision(lastWorkingDay, today, notes) {
  const after = addDays(lastWorkingDay, 1);
  const dnsStart = compareDays(after, today) < 0 ? today : after;
  let dnsEnd = lastWorkingDayOfMay(dnsStart);
  if (compareDays(dnsEnd, dnsStart) < 0) dnsEnd = lastWorkingDayOfMay({ y: dnsStart.y + 1, m: 5, d: 1 });
  const start = compareDays(lastWorkingDay, today) <= 0 ? mondayOf(addDays(lastWorkingDay, -14)) : mondayOf(today);
  return stop('report', 'dns', { plan: { action: 'dns', lastWorkingDay, dnsStart, dnsEnd, notes,
    pastDated: compareDays(lastWorkingDay, today) < 0,
    window: { start, end: reportWindow(today).end } } });
}
function decideAuditExit(record, today, slice) {
  const lastWorkingDay = record.notification.dates.lastWorkingDay;
  const suppliedRegion = String(record.person?.region ?? '');
  const regionKey = suppliedRegion.replace(/[–—]/g, '-').replace(/\s+/g, '').toLowerCase();
  const region = regionKey === 'us-us' ? 'US' : regionKey === 'us-usi' ? 'USI' : null;
  if (record.person?.region !== undefined && !region) return stop('byHand', 'exitNoLwdRegion', { business: 'audit', region: suppliedRegion });
  if (region === 'USI' && lastWorkingDay) return stop('byHand', 'auditUsiLwd', { business: 'audit' });
  const from = lastWorkingDay || mondayOf(today);
  const entries = (slice?.backupEntries ?? slice?.entries ?? []).filter(entry => {
    if (entryKind(entry) !== 'client') return false;
    const weekly = entry.mode === 'week' || slice?.mode === 'week' || !entry.days?.length && !entry.windowDays?.length && Array.isArray(entry.hours);
    const rows = entry.days?.length ? entry.days : entry.windowDays?.length ? entry.windowDays : entry.hours || [];
    return rows.some(row => {
      const day = row.day || row.monday;
      if (!day || !Number.isFinite(row.hours)) return true;
      const last = weekly || compareDays(day, mondayOf(day)) === 0 && row.hours > 8 ? addDays(mondayOf(day), 4) : day;
      return row.hours > 0 && compareDays(last, from) >= (lastWorkingDay ? 1 : 0);
    });
  });
  const unique = new Map(entries.map(entry => [JSON.stringify([valueKey(entry.client), valueKey(entry.wbs)]), { client: entry.client, wbs: entry.wbs || '' }]));
  const template = !lastWorkingDay ? entries.length ? 1 : 2 : entries.length ? 3 : 4;
  const audit = { region, template, clients: [...unique.values()], from };
  if (!lastWorkingDay || entries.length || !slice || !region) return stop('report', 'auditExit', { business: 'audit', audit,
    plan: { action: 'auditReadOnly', ...(lastWorkingDay ? { lastWorkingDay } : {}), window: reportWindow(today) } });
  const consulting = dnsDecision(lastWorkingDay, today, '');
  return { ...consulting, business: 'audit', audit, plan: { ...consulting.plan, notes: '', withoutNotes: true } };
}
function exitMailChoice({ clientHours, greyed }) {
  if (greyed) return clientHours > 0 ? 'B' : 'C';
  return clientHours > 0 ? 'A' : 'D';
}
__exports.emptyLwd = emptyLwd;
__exports.decideExit = decideExit;
__exports.exitMailChoice = exitMailChoice;
},
"servicenow/sort.js": function (__require, __exports, document, window) {
'use strict';
const { collate } = __require("./collate.js");
const { decideLeave } = __require("../rules/leave.js");
const { decideExit } = __require("../rules/exit.js");
const LISTS = ['report', 'noReport', 'byHand', 'notHandled'];
function sortCases({ tickets }, today) {
  const cases = collate({ tickets }, today).map(record => ({ record, decision: record.notification.kind === 'exit' ? decideExit(record, today) : decideLeave(record, today) }));
  const lists = Object.fromEntries(LISTS.map(name => [name, cases.filter(one => one.decision.outcome === name)]));
  return { cases, lists };
}
__exports.LISTS = LISTS;
__exports.sortCases = sortCases;
},
"files/groups.js": function (__require, __exports, document, window) {
'use strict';
const { reportWindow, compareDays, addDays } = __require("../rules/dates.js");
const { emailKey } = __require("../rules/prepare.js");
function reportPull(reportCases, today) {
  if (!reportCases.length) return null;
  let { start, end } = reportWindow(today);
  for (const one of reportCases) {
    if (one.decision.plan?.action === 'dns' && compareDays(one.decision.plan.window.start, start) < 0) start = one.decision.plan.window.start;
  }
  end = addDays(start, 51 * 7 + 4);
  const emails = [];
  const seen = new Set();
  for (const one of reportCases) {
    const key = emailKey(one.record.email);
    if (!seen.has(key)) { seen.add(key); emails.push(key); }
  }
  return { start, end, emails, cases: reportCases };
}
__exports.reportPull = reportPull;
},
"rules/entries.js": function (__require, __exports, document, window) {
'use strict';
const { valueKey } = __require("./prepare.js");
function entryKind(entry) {
  const client = valueKey(entry.client);
  if (client.startsWith('leave of absence') || /\(loa\)/.test(client)) return 'loa';
  if (client.startsWith('do not schedule') || /\(dns\)/.test(client)) return 'dns';
  if (client.startsWith('holiday') || /\(hol\)/.test(client)) return 'holiday';
  if (valueKey(entry.billable) === 'billable') return 'client';
  return 'other';
}
__exports.entryKind = entryKind;
},
"files/report.js": function (__require, __exports, document, window) {
'use strict';
const { InputFileError, inputReadError, reportWorkbook, spreadsheetError, requireUniqueColumns } = __require("../servicenow/files.js");
const { addressCount, addressesIn, emailKey, headerKey, valueKey } = __require("../rules/prepare.js");
const { reportComparedFields } = __require("../run/backup.js");
const { addDays, compareDays, sameDay, mondayOf, usDate } = __require("../rules/dates.js");
const { entryKind } = __require("../rules/entries.js");
const { levelGroupKey } = __require("../rules/shared.js");
const { PageError } = __require("../mysource/dom.js");
const { reportPullTime } = __require("./report-time.js");
function reportAssignPeriod(report, email) {
  if (Array.isArray(report)) {
    const matches = report.filter(one => reportHasPerson(one, email));
    return matches.length === 1 ? reportAssignPeriod(matches[0], email) : 'unknown';
  }
  const entries = report?.entries?.filter(row => row.email === emailKey(email)) || [];
  const labels = entries.map(row => {
    const raw = Object.entries(row.fields || {}).find(([key]) => headerKey(key) === headerKey('Assign Period'))?.[1];
    return ({ weekly: 'Weekly', time: 'Time' })[valueKey(raw)] || 'unknown';
  });
  return labels.length && new Set(labels).size === 1 ? labels[0] : 'unknown';
}
function requireDayReport(report) {
  if (report?.mode !== 'day') throw Object.assign(new PageError('The Staff Schedule Hours Report was not pulled by Day: pull it by Day. It is the backup (Dre, 2026-10-02).'), { batchWide: true });
}
const loadedReports = report => Array.isArray(report) ? report : report ? [report] : [];
const reportHasPerson = (report, email) => report.entries.some(row => row.email === emailKey(email) || row.emailsInCell?.includes(emailKey(email)));
function reportKind(report) {
  if (report.site === 'tax') return 'tax';
  const kindOf = value => ({ consultingservices: 'consulting', 'audit&assurance': 'audit' })[valueKey(value).replace(/\s/g, '')];
  const kinds = report.entries.map(row => {
    const facts = ['Business', 'Business Area', 'Practice'].map(key => kindOf(row.fields?.[key])).filter(Boolean);
    return new Set(facts).size === 1 ? facts[0] : null;
  });
  return kinds.length && kinds.every(kind => kind && kind === kinds[0]) ? kinds[0] : null;
}
function addLoadedReport(current, next, site, replace = null) {
  if (site === 'tax') return next;
  requireDayReport(next);
  const kind = reportKind(next);
  if (!['consulting', 'audit'].includes(kind)) throw new InputFileError('The Staff Schedule Hours Report must contain only Consulting or only Audit rows. Check Business, Business Area and Practice, then load it again.');
  const reports = loadedReports(current);
  if (replace && kind !== replace) throw new InputFileError(`This is not the ${replace === 'audit' ? 'Audit' : 'Consulting'} report. Load it on its own report line.`);
  const kept = replace ? reports.filter(one => reportKind(one) !== replace) : reports;
  if (kept.some(one => reportKind(one) === kind)) throw new InputFileError(`${kind === 'audit' ? 'An Audit' : 'A Consulting'} Staff Schedule Hours Report is already loaded. Use change to replace it.`);
  return [...kept, next];
}
const REPORT_COLUMNS = {
  email: 'Professional Email', id: 'Professional ID', professional: 'Professional',
  client: 'Client', clientName: 'Client Name', clientNumber: 'Client Number', billable: 'Billable', utilization: 'Utilization Generating',
  wbs: 'WBS', engagement: 'Engagement Name', assignStart: 'Assignment Start Date', assignEnd: 'Assignment End Date',
  jobCode: 'Job Code', assignCode1: 'Assign Code 1', assignCode2: 'Assign Code 2',
  resourceManager: 'Resource Manager', resourceManagerEmail: 'Resource Manager Email', total: 'Total Scheduled Hours',
};
const TAX_COLUMNS = { ...REPORT_COLUMNS, email: 'Email', professional: 'Name', clientNumber: 'Client #', engagement: 'WBS Description', revenue: 'Revenue Generating', levelGroup: 'Level Group', talentGroup: 'Talent Group' };
const REQUIRED = ['email', 'client', 'billable', 'total'];
const TAX_REQUIRED = ['email', 'client', 'revenue', 'total', 'levelGroup'];
const columnsIn = keys => REQUIRED.every(field => keys.includes(headerKey(REPORT_COLUMNS[field]))) ? REPORT_COLUMNS
  : TAX_REQUIRED.every(field => keys.includes(headerKey(TAX_COLUMNS[field]))) ? TAX_COLUMNS : null;
const HEADER_SEARCH_ROWS = 50;
function dateOf(header) {
  const text = String(header ?? '').trim();
  let y, m, d;
  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3].length === 2 ? `20${match[3]}` : match[3])];
  else if ((match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [y, m, d] = match.slice(1).map(Number);
  else return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return { invalid: text };
  return { y, m, d };
}
function hoursOf(value, where) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (!text) return 0;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new InputFileError(`The Staff Schedule Hours Report has "${text}" where hours should be (${where}).`);
  return number;
}
async function readReport(file, label = 'The Staff Schedule Hours Report') {
  const extension = (String(file.name).match(/\.[^.]+$/) || [''])[0].toLowerCase();
  if (extension === '.xls') throw new InputFileError(`${label} is an old Excel file (.xls). Save it as .xlsx.`);
  if (!['.csv', '.xlsx'].includes(extension)) throw new InputFileError(`${label} must be an XLSX or CSV file.`);
  let workbook;
  try {
    workbook = await reportWorkbook(await file.arrayBuffer(), label);
  } catch (error) {
    throw inputReadError(error, label);
  }
  for (const sheet of workbook.sheetNames) {
    const rows = workbook.rows(sheet);
    const at = rows.slice(0, HEADER_SEARCH_ROWS).findIndex(row => {
      const keys = row.map(headerKey);
      return !!columnsIn(keys);
    });
    if (at < 0) continue;
    return { ...readRows(rows, at, file.name, label), pullTime: reportPullTime(rows.slice(0, at), file.name), sourceFile: file };
  }
  if (workbook.sheetNames.length && workbook.rows(workbook.sheetNames[0]).slice(0, HEADER_SEARCH_ROWS).some(row => headerKey(row[0]) === headerKey('Professional ID'))) {
    throw new InputFileError(`${label} has its field names down the first column (turned sideways). Add the Staff Schedule Hours Report as downloaded, one row per entry.`);
  }
  throw new InputFileError(`${label} has no header row with ${REQUIRED.map(field => REPORT_COLUMNS[field]).join(', ')}.`);
}
function readRows(rows, at, fileName, label) {
  const headers = rows[at].map(cell => String(cell ?? '').replace(/^﻿/, '').trim());
  const columns = columnsIn(headers.map(headerKey));
  const tax = columns === TAX_COLUMNS;
  const used = new Set([...Object.values(columns), 'Business', 'Practice', 'Business Area', 'Term Date', 'Region', 'Cost Center Description'].map(headerKey));
  requireUniqueColumns(headers, label, [...used, ...headers.filter(header => dateOf(header))]);
  const keys = headers.map(headerKey);
  const errorCell = spreadsheetError;
  headers.forEach((header, column) => { if (errorCell(header)) throw new InputFileError(`${label}: spreadsheet error ${header} in column ${column + 1}, row ${rows[at].sourceRow || at + 1} (header).`); });
  rows.slice(at + 1).forEach((row, offset) => headers.forEach((header, column) => {
    if ((used.has(headerKey(header)) || dateOf(header)) && errorCell(row[column])) throw new InputFileError(`${label}: spreadsheet error ${String(row[column]).trim()} in "${header}", row ${row.sourceRow || at + offset + 2}. Pull the Staff Schedule Hours Report again with readable values.`);
  }));
  const index = Object.fromEntries(Object.entries(columns).map(([field, name]) => [field, keys.indexOf(headerKey(name))]));
  const dates = [];
  headers.forEach((header, column) => {
    const day = dateOf(header);
    if (!day) return;
    if (day.invalid) throw new InputFileError(`${label}: the date column "${header}" is not a real date.`);
    dates.push({ column, day });
  });
  if (!dates.length) throw new InputFileError(`${label} has no date columns (dates in the header). Pull it with Report Period Day.`);
  dates.sort((a, b) => compareDays(a.day, b.day));
  const gaps = dates.slice(1).map((date, i) => (compareDays(date.day, dates[i].day)) / 86400000);
  const allMondays = dates.every(date => sameDay(mondayOf(date.day), date.day));
  const mode = gaps.length && gaps.every(gap => gap === 1) ? 'day' : allMondays && gaps.every(gap => gap === 7) ? 'week' : null;
  if (!mode) {
    const odd = dates.find(date => !sameDay(mondayOf(date.day), date.day));
    throw new InputFileError(`${label}: the date columns are neither one a day nor one a week${odd ? ` (e.g. "${headers[odd.column]}" is not a Monday)` : ''}. Pull it with Report Period Day.`);
  }
  const weeks = [];
  for (const date of dates) {
    const monday = mondayOf(date.day);
    if (!weeks.some(week => sameDay(week.monday, monday))) weeks.push({ monday, columns: [] });
    weeks.find(week => sameDay(week.monday, monday)).columns.push(date.column);
  }
  const entries = [];
  rows.slice(at + 1).forEach((row, offset) => {
    if (!row.some(cell => String(cell ?? '').trim())) return;
    const text = field => (index[field] >= 0 ? String(row[index[field]] ?? '').trim() : '');
    const where = `row ${row.sourceRow || at + offset + 2}`;
    const twoEmails = addressCount(text('email')) > 1;
    const entry = {
      row: row.sourceRow || at + offset + 2,
      fields: Object.fromEntries(headers.map((header, column) => [header || `Column ${column + 1}`, String(row[column] ?? '').trim()])),
      email: twoEmails ? '' : emailKey(text('email')),
      ...(twoEmails ? { emailsInCell: addressesIn(text('email')) } : {}),
      ...Object.fromEntries(Object.keys(columns).filter(field => field !== 'email' && field !== 'total').map(field => [field, text(field)])),
      total: hoursOf(text('total'), where),
      days: mode === 'day' ? dates.map(date => ({ day: date.day, hours: hoursOf(row[date.column], `${where}, ${usDate(date.day)}`) })) : null,
      hours: weeks.map(week => ({ monday: week.monday, hours: week.columns.reduce((sum, column) => sum + hoursOf(row[column], `${where}, ${headers[column]}`), 0) })),
    };
    if (tax && !['yes', 'no'].includes(valueKey(entry.revenue))) throw new InputFileError(`${label}: Revenue Generating must be Yes or No (${where}).`);
    entry.kind = tax && valueKey(entry.client) === 'loa' ? 'loa' : entryKind(entry);
    if (tax && !['loa', 'dns', 'holiday'].includes(entry.kind)) entry.kind = valueKey(entry.revenue) === 'yes' ? 'client' : 'other';
    if (addressCount(entry.resourceManagerEmail) > 1) entry.twoManagerEmails = true;
    entries.push(entry);
  });
  const named = headers.map((header, column) => header || `Column ${column + 1}`);
  const dateColumns = new Set(dates.map(date => named[date.column]));
  const weekHeaders = mode === 'week' ? new Map(weeks.map(week => [named[week.columns[0]], week.monday])) : new Map();
  return { ...(tax ? { site: 'tax' } : {}), fileName, mode, headers: named, dateColumns, weekHeaders, weeks: weeks.map(week => week.monday), days: mode === 'day' ? dates.map(date => date.day) : null, entries };
}
function personSlice(report, email, window) {
  const key = emailKey(email);
  const first = mondayOf(window.start);
  const last = mondayOf(window.end);
  const inWindow = monday => compareDays(monday, first) >= 0 && compareDays(monday, last) <= 0;
  const covered = report.weeks.filter(inWindow);
  const wanted = [];
  for (let monday = first; compareDays(monday, last) <= 0; monday = addDays(monday, 7)) wanted.push(monday);
  const missingWeeks = report.mode === 'day'
    ? wanted.filter(monday => [0, 1, 2, 3, 4].map(n => addDays(monday, n))
      .filter(day => compareDays(day, window.start) >= 0 && compareDays(day, window.end) <= 0)
      .some(day => !report.days.some(have => compareDays(have, day) === 0)))
    : wanted.filter(monday => !report.weeks.some(week => sameDay(week, monday)));
  const all = report.entries.filter(entry => entry.email === key);
  const twoEmails = report.entries.some(entry => entry.emailsInCell?.includes(key)) || all.some(entry => entry.twoManagerEmails);
  const facts = entry => ({ ...(report.site === 'tax' ? { levelGroup: entry.levelGroup || '', talentGroup: entry.talentGroup || '' } : {}), id: entry.id || '', professional: entry.professional || '', email: entry.email || '', business: entry.fields.Business || '',
    businessArea: entry.fields['Business Area'] || '', termDate: entry.fields['Term Date'] || '',
    region: entry.fields.Region || '', costCenterDescription: entry.fields['Cost Center Description'] || '', resourceManager: entry.resourceManager || '', resourceManagerEmail: emailKey(entry.resourceManagerEmail || '') });
  const related = report.entries.filter(entry => all.some(one => entry === one
    || one.id && entry.id === one.id
    || one.professional && valueKey(entry.professional) === valueKey(one.professional)));
  const disagreements = all.length ? Object.keys(facts(all[0])).filter(field => new Set(related.map(entry =>
    field === 'email' ? facts(entry)[field] : field === 'id' ? String(facts(entry)[field]).trim() : field === 'levelGroup' ? levelGroupKey(facts(entry)[field]) : field === 'talentGroup' ? String(facts(entry)[field]).replace(/\s/g, '').toLowerCase() : valueKey(facts(entry)[field]))).size > 1) : [];
  const weekLabel = monday => usDate(monday);
  const entries = all
    .map(entry => ({
      ...entry,
      windowHours: entry.hours.filter(week => inWindow(week.monday)),
      windowDays: entry.days ? entry.days.filter(day => inWindow(mondayOf(day.day))) : null,
      fields: report.mode === 'day'
        ? { ...Object.fromEntries(Object.entries(entry.fields).filter(([column]) => !report.dateColumns.has(column))),
          ...Object.fromEntries(entry.hours.filter(week => inWindow(week.monday)).map(week => [weekLabel(week.monday), String(week.hours)])) }
        : entry.fields,
    }))
    .filter(entry => entry.windowHours.some(week => week.hours !== 0));
  const hoursOfKind = kind => entries.filter(entry => entry.kind === kind).reduce((sum, entry) => sum + entry.windowHours.reduce((s, w) => s + w.hours, 0), 0);
  return {
    ...(report.site === 'tax' ? { site: 'tax' } : {}),
    mode: report.mode,
    sourceColumns: report.headers,
    sourceDateColumns: report.dateColumns,
    dateColumns: report.mode === 'day' ? new Set(covered.map(weekLabel)) : report.dateColumns,
    sourceDays: report.days,
    sourceWindow: window,
    status: twoEmails ? 'twoEmailsInReportCell' : !all.length ? 'notOnReport' : missingWeeks.length ? 'windowNotCovered' : 'ready',
    onReport: all.length,
    weeksInWindow: covered.length,
    missingWeeks,
    entries,
    backupEntries: all,
    comparedFields: reportComparedFields(report.entries),
    clientHours: hoursOfKind('client'),
    kinds: entries.reduce((counts, entry) => ({ ...counts, [entry.kind]: (counts[entry.kind] || 0) + 1 }), {}),
    columns: report.mode === 'day'
      ? [...report.headers.filter(header => !report.dateColumns.has(header)), ...covered.map(weekLabel)]
      : report.headers.filter(header => !report.weekHeaders?.has(header) || inWindow(report.weekHeaders.get(header))),
    person: all[0] ? {
      ...(report.site === 'tax' ? { site: 'tax', levelGroup: all[0].levelGroup || '', talentGroup: all[0].talentGroup || '' } : {}),
      professional: all[0].professional, business: all[0].fields.Business || '', practice: all[0].fields.Practice || '',
      businessArea: all[0].fields['Business Area'] || '',
      region: all[0].fields.Region || '',
      ...(all[0].fields['Cost Center Description'] ? { costCenterDescription: all[0].fields['Cost Center Description'] } : {}), termDate: all[0].fields['Term Date'] || '',
      ...(disagreements.length ? { disagreements } : {}),
    } : null,
    resourceManager: all[0]?.resourceManager || '',
    resourceManagerEmail: emailKey(all[0]?.resourceManagerEmail || ''),
  };
}
__exports.reportAssignPeriod = reportAssignPeriod;
__exports.requireDayReport = requireDayReport;
__exports.loadedReports = loadedReports;
__exports.reportHasPerson = reportHasPerson;
__exports.reportKind = reportKind;
__exports.addLoadedReport = addLoadedReport;
__exports.dateOf = dateOf;
__exports.readReport = readReport;
__exports.personSlice = personSlice;
},
"screen/wording.js": function (__require, __exports, document, window) {
'use strict';
const { usDate } = __require("../rules/dates.js");
const { exitDnsDates } = __require("../rules/mails.js");
const greyedExitLine = (plan, prepared) => prepared?.removing?.length
  ? `Removed entries from ${usDate(plan.dnsStart)}; no DNS (schedule greyed out)` : 'No change needed; no DNS (schedule greyed out)';
const PAST_DATES_WORDS = 'Past dates cannot be changed. Nothing was changed; By hand.';
const caseKindWords = { leave: 'LOA', exit: 'Exit', other: 'not a leave or exit notification' };
const PROBLEMS = {
  twoWayDate: detail => `✗ ${detail.label}: "${detail.value}" reads as ${usDate(detail.readings[0])} or ${usDate(detail.readings[1])} → by hand; check which date was intended`,
  unknownLine: detail => `✗ A date line Snooze does not know: "${detail.line}" → check the ticket`,
  unreadableDate: detail => `✗ ${detail.label}: "${detail.value}" — Snooze could not read it as a date → check the ticket`,
  twoDates: detail => `✗ ${detail.label} is given twice, with two dates → check the ticket`,
};
const pastReportNote = plan => `⚠ runs past the Staff Schedule Hours Report (after ${usDate(plan.pastReport.reportEnd)}): those days are read from the page at the person's turn; by hand if that read is unclear`;
const personFieldWords = { id: 'Professional ID', professional: 'Professional', email: 'Professional Email', business: 'Business', practice: 'Practice',
  businessArea: 'Business Area', termDate: 'Term Date', region: 'Region', resourceManager: 'Resource Manager',
  resourceManagerEmail: 'Resource Manager Email', costCenterDescription: 'Cost Center Description' };
function reasonLine(decision, prepared = null) {
  const { code } = decision;
  switch (code) {
    case 'cannotRestore': return `Snooze could not put these days back if needed: ${decision.problems.join('; ')}.`;
    case 'subcategoryMismatch': return `Subcategory says ${caseKindWords[decision.subcategory.kind]} (${decision.subcategory.text}); the Description reads as ${caseKindWords[decision.descriptionKind]} → by hand`;
    case 'notLeaveOrExitCase': return `Not Snooze's case: Subcategory 1: "${decision.subcategory.first || '(blank)'}"; Subcategory 2: "${decision.subcategory.second || '(blank)'}" → no action`;
    case 'datesOnOneLine': return `✗ ${decision.detail.label}: two dates on one line → by hand; check the ticket`;
    case 'reportPersonDisagrees': return `✗ The Staff Schedule Hours Report rows disagree about this person's ${decision.fields.map(field => personFieldWords[field] || field).join(', ')} → by hand; check the Staff Schedule Hours Report`;
    case 'exportPersonDisagrees': return '✗ Different people in the SN export share the same email → by hand; Snooze will not guess';
    case 'clearClients': return `Remove entries from ${usDate(decision.plan.dnsStart)}; no DNS (greyed schedule).`;
    case 'dns': { const dates = exitDnsDates(decision.plan, prepared); return decision.plan.greyed && !prepared?.addDns ? greyedExitLine(decision.plan, prepared) : `Clear every entry from ${usDate(decision.plan.dnsStart)}; add DNS ${usDate(dates.start)} – ${usDate(dates.end)}, 8h a day, Mode Normal.`; }
    case 'exitNoLwd': return 'No last working day → no schedule action; mail F (USI).';
    case 'exitUsiLwd': return 'USI Exit with a last working day → by hand; no schedule action.';
    case 'auditUsiLwd': return 'A&A USI exit with a last working day: not in the SOP';
    case 'auditMissingDp': return 'A&A Deployment Professional missing → by hand; no schedule action.';
    case 'auditLoa': return prepared?.auditAlready ? 'A&A LOA already in place; no schedule change.' : "A&A LOA → ask the Deployment Professional; no schedule change.";
    case 'auditExit': return `A&A Exit → mail ${decision.audit.template}; no schedule change.`;
    case 'exitNoLwdUs': return '✗ US professional with no last working day → by hand; no schedule action.';
    case 'exitNoLwdRegion': return !decision.region.trim() ? 'No Region on the Staff Schedule Hours Report (expected US - USI or US - US) → by hand' : `Region "${decision.region}" not recognised (expected US - USI or US - US) → by hand`;
    case 'termBeforeLwd': return `✗ Term Date (${usDate(decision.termDate)}) is before the last working day (${usDate(decision.lastWorkingDay)}) → by hand`;
    case 'add': {
      const { plan } = decision;
      const parts = [`Add LOA ${usDate(plan.loaStart)} – ${usDate(plan.loaEnd)}`];
      if (plan.pastDated) parts.push('⚠ started in the past: from today only → add the past-dated note to the Resource Manager');
      if (plan.pastReport) parts.push(pastReportNote(plan));
      return parts.join(' · ');
    }
    case 'noDates': return '✗ No start or end date → by hand (mail 4, no action)';
    case 'noStart': return '✗ No leave start date → by hand (ask the ELE team for it; suspend; close after 2 follow-ups with no answer)';
    case 'cmat': return '✗ Client & Market Acceleration Team (on the Staff Schedule Hours Report) → by hand';
    case 'termBeforeEnd': return `✗ The Staff Schedule Hours Report shows a Term Date (${usDate(decision.termDate)}) before the LOA ends (${usDate(decision.loaEnd)}) → by hand`;
    case 'termDateUnreadable': return '✗ The Staff Schedule Hours Report shows a Term Date Snooze cannot read as a date → by hand';
    case 'notLeave': return 'Not a leave or exit notification';
    case 'notConsulting': return `Business "${decision.business}" (not ${decision.expectedBusiness || 'Consulting Services'}) → not in the LOA SOP`;
    case 'wrongSite': return `Run on ${decision.site === 'tax' ? 'Tax' : 'Consulting'} MySource`;
    case 'taxPartnerMd': return 'Partner/MD';
    case 'taxTalentGroup': return `Talent Group ${decision.talentGroup}: not supported by Snooze → no action; close incomplete.`;
    case 'taxPastEnd': return 'Existing LOA runs past the new end; no schedule change.';
    case 'taxPartialLoa': return 'An existing Tax weekly LOA starts outside the partial-week change. Nothing was changed; By hand.';
    case 'taxLevelGroup': return `Level Group: ${decision.levelGroup || '(blank)'} → by hand`;
    case 'mixedNotification': return '✗ The Description has both leave and exit dates → check the ticket';
    case 'noEmail': return '✗ The ticket has no email → check the ticket';
    case 'twoEmails': return '✗ Two email addresses in one cell → by hand; check which person the ticket means';
    case 'twoEmailsInReportCell': return '✗ Two email addresses in one report cell → by hand; check the report';
    case 'bothReports': return 'On both the Consulting and Audit Staff Schedule Hours Reports → by hand; check both reports.';
    case 'twoTickets': {
      const fields = { start: 'start', end: 'end', estimatedReturn: 'estimated return', confirmedReturn: 'confirmed return', resignation: 'resignation', lastWorkingDay: 'last working day' };
      const tickets = (decision.tickets || []).map(ticket => `${ticket.number} ${Object.entries(fields).filter(([field]) => ticket.dates[field]).map(([field, label]) => `${label} ${usDate(ticket.dates[field])}`).join(' ') || `${ticket.kind}; no readable dates`}`);
      return `✗ ${decision.count} tickets with different dates: ${tickets.join('; ')} → by hand`;
    }
    case 'unknownLine':
    case 'unreadableDate':
    case 'twoDates': return PROBLEMS[code](decision.detail);
    case 'twoWayDate': return PROBLEMS[code](decision.detail);
    case 'noBusiness': return '✗ No Business on the Staff Schedule Hours Report → check the person';
    case 'endBeforeStart': return '✗ The leave end date is before the start date → check the ticket';
    case 'leaveOver': return `✓ The whole leave is in the past (ended ${usDate(decision.end)}) → no action; mail 5 (past dates can't be changed)`;
    case 'noEnd': return '✗ No leave end date → by hand';
    case 'notesTooLong': return '✗ The notification is too long for the Notes box (150 characters), even as dates only → write the notes by hand';
    default: return '✗ Snooze could not explain this → by hand; check the ticket';
  }
}
__exports.greyedExitLine = greyedExitLine;
__exports.PAST_DATES_WORDS = PAST_DATES_WORDS;
__exports.reasonLine = reasonLine;
},
"mysource/dom.js": function (__require, __exports, document, window) {
'use strict';
const { valueKey } = __require("../rules/prepare.js");
const { reasonName, REASON_NAMES } = __require("../core/reason-names.js");
const { recordRun, reasonCode, windowName, diagnosticWaitName, FIELDS, WINDOWS } = __require("../core/run-records.js");
class PageError extends Error {
  constructor(message, { record = true, reasonName: fixedReason } = {}) {
    super(message);
    this.name = 'PageError';
    this.reasonName = REASON_NAMES.has(fixedReason) ? fixedReason : reasonName(message);
    if (record) {
      const event = { type: 'error', code: reasonCode(message), reasonName: this.reasonName };
      recordRun(event);
      if (event.liveStop) this.liveStop = event.liveStop;
    }
    if (/not found|no .*cell|no .*button|not the .*expects|not.*shown|no .*box|field.*labelled|window.*closed/i.test(message)) recordRun({ type: 'miss', name: windowName(message) || 'Schedule window' });
  }
}
let batchGuard = null;
let connectionGuard = null;
function setConnectionGuard(guard) {
  if (connectionGuard) throw new PageError('Another batch is already running.');
  connectionGuard = guard;
  return () => { if (connectionGuard === guard) connectionGuard = null; };
}
function setBatchGuard(guard) {
  if (batchGuard && guard) throw new PageError('Another batch is already running.');
  batchGuard = guard;
  return () => { if (batchGuard === guard) batchGuard = null; };
}
const personGuards = new Set();
const guardProbes = new WeakSet();
const activeGuardProbe = probe => guardProbes.has(probe) ? probe : null;
const probeStyles = {};
function probeStyleReader(probe) {
  probe = activeGuardProbe(probe);
  if (probe?.has(probeStyles)) return probe.get(probeStyles);
  const styles = new WeakMap();
  const read = node => {
    if (!styles.has(node)) styles.set(node, node.ownerDocument.defaultView.getComputedStyle(node));
    return styles.get(node);
  };
  probe?.set(probeStyles, read);
  return read;
}
async function withPersonGuard(guard, operation) {
  personGuards.add(guard);
  try {
    await guardReady(WAIT.person);
    const result = await operation();
    await guardReady(WAIT.person);
    return result;
  } finally { personGuards.delete(guard); }
}
function guardPage() {
  let pending;
  const probe = new Map();
  guardProbes.add(probe);
  try {
    for (const guard of [connectionGuard, ...personGuards, batchGuard]) {
      if (!guard) continue;
      try { guard(probe); }
      catch (error) {
        if (!error.identityPending) throw error;
        pending ||= error;
      }
    }
    if (pending) throw pending;
  } finally { guardProbes.delete(probe); probe.clear(); }
}
function guarded(action, timeout = WAIT.timeout) {
  const started = Date.now();
  let pending;
  const attempt = () => {
    if (pending && Date.now() - started >= timeout) throw pending.refuse();
    try { guardPage(); }
    catch (error) {
      if (!error.identityPending) throw error;
      pending = error;
      const remaining = Math.max(0, timeout - (Date.now() - started));
      return waitFor(() => true, 'the person on the calendar to settle', remaining).then(attempt);
    }
    return action();
  };
  return attempt();
}
const guardReady = (timeout = WAIT.timeout) => guarded(() => true, timeout);
const STOP_FLAGS = ['identityChanged', 'session', 'pageBlocked', 'schedulePage', 'batchWide', 'connectionLost'];
const stopFlagged = error => STOP_FLAGS.some(flag => error?.[flag]);
function keepFlags(from, to) {
  if (from?.reasonName) to.reasonName = from.reasonName;
  if (from?.liveStop) to.liveStop = from.liveStop;
  for (const flag of STOP_FLAGS) if (from?.[flag]) to[flag] = from[flag];
  for (const key of ['identityFacts', 'scheduleFacts', 'person', 'stage', 'operation', 'identityRecorded', 'scheduleRecorded', 'reasonName']) {
    if (from?.[key] !== undefined && to[key] === undefined) to[key] = from[key];
  }
  return to;
}
async function cleanupAfter(original, cleanup) {
  try { return await cleanup(); }
  catch (error) {
    const originalReason = original.reasonName, originalStop = original.liveStop;
    keepFlags(error, original);
    if (originalReason) original.reasonName = originalReason;
    if (originalStop) original.liveStop = originalStop;
    (original.cleanupErrors ||= []).push({ name: error.name, message: error.message });
    original.message += ` Cleanup failed: ${error.message}`;
    return null;
  }
}
const WAIT = { schedule: 2000, proof: 2000, step: 50, timeout: 60000, quiet: 800, person: 60000, window: 60000, loadingNotice: 15000 };
const openingWindows = new WeakMap();
const windowCallers = new WeakMap(), settledWindows = new WeakSet(), supportedBulkWindows = new WeakSet();
const modalCaller = modal => modal.matches('#FindAssignmentsModal') ? 'Find Assignments'
  : modal.matches('#editEventGridModal') ? 'Edit Assignment' : modal.matches('#addShiftEventModal') ? 'Add Assignment'
  : modal.matches('.bootbox-confirm') ? 'confirmation window'
  : modal.querySelector('.js-dynamic-calendar-jump-date') ? 'go-to-date' : 'Schedule window';
function observeWindowTitle(modal, { caller, purpose = 'opening' } = {}) {
  const title = text(modal.querySelector('.modal-title, .bootbox-title, h4, [role=heading]'));
  if (!title || ['Find Assignments', 'Edit Assignment', 'Add Assignment', 'No. of Periods', 'Go to Date', 'View Notes', 'Are you sure?', 'Session Expired'].includes(title)
      || title === 'Bulk Edit Assignments' && supportedBulkWindows.has(modal)) return;
  recordRun({ type: 'dialog', length: title.length, caller: WINDOWS.has(caller) ? caller : 'Schedule window',
    purpose: ['opening', 'recheck', 'cleanup'].includes(purpose) ? purpose : 'recheck' });
}
function recognizeBulkWindow(modal) {
  if (text(modal.querySelector('.modal-title, h4')) !== 'Bulk Edit Assignments') throw new PageError('The opened window is not Bulk Edit Assignments. Nothing was changed.');
  supportedBulkWindows.add(modal);
}
function waitFor(check, what, timeout = WAIT.timeout) {
  const waitStarted = Date.now();
  recordRun({ type: 'waitBegin', name: windowName(what) || 'Schedule window', waitName:diagnosticWaitName(what) });
  const finished = (result, error) => recordRun({ type: 'wait', name: windowName(what) || 'Schedule window', waitName:diagnosticWaitName(what), seconds: (Date.now() - waitStarted) / 1000, ceiling: timeout / 1000, result,
    ...(error ? {code:reasonCode(error.message),reasonName:error.reasonName || reasonName(error.message)} : {}), ...(['the delete to finish', 'Add Assignment to save and close', 'Edit Assignments to save and close'].includes(what) ? { saveSeconds: (Date.now() - waitStarted) / 1000 } : {}) });
  return new Promise((resolve, reject) => {
    const started = waitStarted;
    let noticed = false, scheduleStarted = null, identityPending = null;
    const tick = () => {
      const elapsed = Date.now() - started;
      const deadlineError = () => Object.assign(new PageError(`The page did not show ${what} within ${Math.round(timeout / 1000)} seconds.`), { timeout: true, late: Date.now() - started > timeout });
      if (elapsed >= timeout) {
        try { guardPage(); } catch (error) { return reject(error.identityPending ? error.refuse() : error); }
        if (identityPending) return reject(identityPending.refuse());
        recordRun({ type: 'miss', name: windowName(what) || 'Schedule window' });
        return reject(deadlineError());
      }
      try { guardPage(); scheduleStarted = null; identityPending = null; } catch (error) {
        if (error.identityPending) { identityPending = error; setTimeout(tick, WAIT.step); return; }
        if (!error.schedulePage || !error.scheduleFacts || error.session || error.identityChanged || error.batchWide || error.pageBlocked) return reject(error);
        scheduleStarted ??= Date.now();
        if (Date.now() - scheduleStarted >= WAIT.schedule) return reject(error);
        setTimeout(tick, WAIT.step); return;
      }
      let value;
      try {
        value = check();
      } catch (error) {
        if (error.identityPending) { identityPending = error; setTimeout(tick, WAIT.step); return; }
        if (error instanceof PageError || stopFlagged(error)) return reject(error);
        value = null;
      }
      if (Date.now() - started >= timeout) return reject(deadlineError());
      if (value) {
        if (noticed) recordRun({ type: 'waiting', done: true });
        const name = windowName(what);
        const seconds = (Date.now() - started) / 1000;
        if (name && value.nodeType === 1 && value.matches('.modal, .bootbox, [role=dialog]')) openingWindows.set(value, { name, started, recorded: seconds > 5 });
        if (name && seconds > 5) recordRun({ type: 'slow', name, seconds });
        return resolve(value);
      }
      if (!noticed && Date.now() - started >= WAIT.loadingNotice) {
        noticed = true;
        recordRun({ type: 'waiting', name: windowName(what) || 'Schedule window' });
      }
      setTimeout(tick, WAIT.step);
    };
    tick();
  }).then(value => { finished('passed'); return value; }, error => { finished(error.late ? 'late' : error.timeout ? 'failed' : 'refused', error); throw error; });
}
const text = node => (node ? String(node.textContent || '').replace(/\s+/g, ' ').trim() : '');
const sameText = (a, b) => valueKey(a) === valueKey(b);
function shown(node) {
  return shownUsing(node, at => at.ownerDocument.defaultView.getComputedStyle(at));
}
function shownUsing(node, styleOf) {
  for (let at = node; at && at.nodeType === 1; at = at.parentElement) {
    if (at.hidden || at.getAttribute('aria-hidden') === 'true' && at !== node) return false;
    const style = styleOf(at);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return Boolean(node && node.isConnected);
}
function click(node) {
  const started = Date.now();
  const view = node.ownerDocument.defaultView;
  const types = ['mousedown', 'mouseup', 'click'];
  const send = index => index < types.length ? guarded(() => {
    node.dispatchEvent(new view.MouseEvent(types[index], { bubbles: true, cancelable: true, view, button: 0 }));
    return send(index + 1);
  }, Math.max(0, WAIT.timeout - (Date.now() - started))) : undefined;
  return send(0);
}
function rightClick(node, at = null) {
  return guarded(() => rightClickReady(node, at));
}
function rightClickReady(node, at) {
  const doc = node.ownerDocument;
  const view = doc.defaultView;
  const box = node.getBoundingClientRect();
  const point = at || { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const clientX = Math.round(point.x);
  const clientY = Math.round(point.y);
  const onTop = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(clientX, clientY) : null;
  const target = onTop && (onTop === node || node.contains(onTop) || onTop.contains(node) || at) ? onTop : node;
  const common = { bubbles: true, cancelable: true, composed: true, view, clientX, clientY, screenX: clientX, screenY: clientY };
  const Pointer = view.PointerEvent || view.MouseEvent;
  target.dispatchEvent(new Pointer('pointerdown', { ...common, button: 2, buttons: 2, pointerType: 'mouse' }));
  target.dispatchEvent(new view.MouseEvent('mousedown', { ...common, button: 2, buttons: 2 }));
  target.dispatchEvent(new Pointer('pointerup', { ...common, button: 2, buttons: 0, pointerType: 'mouse' }));
  target.dispatchEvent(new view.MouseEvent('mouseup', { ...common, button: 2, buttons: 0 }));
  target.dispatchEvent(new view.MouseEvent('contextmenu', { ...common, button: 2, buttons: 0 }));
  return target;
}
const describe = node => (node ? `${node.tagName.toLowerCase()}${node.id ? '#' + node.id.replace(/\d+/g, '#') : ''}${[...node.classList].map(c => '.' + c.replace(/\d+/g, '#')).join('')}` : 'nothing');
function typeInto(input, value, afterInput = () => {}) {
  return guarded(() => { typeIntoReady(input, value); afterInput(); });
}
function typeIntoReady(input, value) {
  const view = input.ownerDocument.defaultView;
  const proto = input.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, String(value));
  for (const type of ['input', 'keyup', 'change']) input.dispatchEvent(new view.Event(type, { bubbles: true }));
}
function setChecked(box, checked) {
  const prove = () => { if (box.checked !== checked) throw new PageError('A checkbox did not change when clicked.'); };
  if (box.checked === checked) return;
  const result = click(box);
  return result?.then ? result.then(prove) : prove();
}
function fieldByLabel(form, label) {
  const found = [...form.querySelectorAll('label')].filter(node => sameText(text(node).replace(/[*?]/g, ''), label));
  if (found.length !== 1) { recordRun({ type: 'miss', name: FIELDS.has(label) ? label : 'Schedule window' }); throw new PageError(`The form has ${found.length || 'no'} field${found.length === 1 ? '' : 's'} labelled "${label}".`); }
  const labelNode = found[0];
  const byFor = labelNode.htmlFor && form.ownerDocument.getElementById(labelNode.htmlFor);
  if (byFor) return byFor;
  const row = labelNode.closest('.dynamic-form-row, .form-group, .mb-3') || labelNode.parentElement;
  const control = row.querySelector('select, input:not([type=hidden]), textarea');
  if (!control) { recordRun({ type: 'miss', name: FIELDS.has(label) ? label : 'Schedule window' }); throw new PageError(`No box found for "${label}".`); }
  return control;
}
const select2Of = select => {
  const next = select.nextElementSibling;
  if (next && next.classList.contains('select2-container')) return next;
  return [...(select.parentElement?.children || [])].find(node => node.classList.contains('select2-container')) || null;
};
const pause = ms => {
  const started=Date.now();
  return new Promise(resolve=>setTimeout(resolve,ms)).then(()=>recordRun({type:'delay',name:'Schedule window',seconds:(Date.now()-started)/1000,duration:ms/1000,ceiling:null,result:'passed'}));
};
function modalTransitioning(modal) {
  const view = modal.ownerDocument.defaultView;
  for (const readInstance of [
    () => typeof view.jQuery === 'function' ? view.jQuery(modal)?.data?.('bs.modal') : null,
    () => view.bootstrap?.Modal?.getInstance?.(modal),
    () => view.jQuery?.fn?.modal?.Constructor?.getInstance?.(modal),
  ]) {
    try {
      const instance = readInstance();
      if (typeof instance?._isTransitioning === 'boolean') return instance._isTransitioning;
      if (typeof instance?.isTransitioning === 'boolean') return instance.isTransitioning;
    } catch {   }
  }
  return null;
}
const openingFinished = modal => {
  const nodes = [modal, ...modal.querySelectorAll('.modal-dialog')];
  try {
    if (nodes.some(node => typeof node.getAnimations !== 'function')) return null;
    const animations = nodes.flatMap(node => node.getAnimations());
    if (animations.some(animation => !['running', 'pending', 'paused', 'finished', 'idle'].includes(animation.playState))) return null;
    return animations.every(animation => ['finished', 'idle'].includes(animation.playState) && !animation.pending);
  } catch { return null; }
};
const modalLoading = scope => [...scope.querySelectorAll('div.loading, .blockUI.blockOverlay, .loading-overlay')]
  .some(node => shown(node) && node.ownerDocument.defaultView.getComputedStyle(node).pointerEvents !== 'none');
async function settled(modal, { loadingScope = modal.ownerDocument, caller, purpose, deferTitle = false } = {}) {
  const opening = openingWindows.get(modal);
  const started = opening?.started ?? Date.now();
  caller = WINDOWS.has(caller) ? caller : windowCallers.get(modal) || opening?.name || modalCaller(modal);
  windowCallers.set(modal, caller);
  purpose ||= settledWindows.has(modal) ? 'recheck' : 'opening';
  settledWindows.add(modal);
  if (!deferTitle) observeWindowTitle(modal, { caller, purpose });
  let announced = false;
  const finished = () => { announced = true; };
  modal.addEventListener('shown.bs.modal', finished);
  const view = modal.ownerDocument.defaultView;
  const wrapped = typeof view.jQuery === 'function' ? view.jQuery(modal) : null;
  const jqueryEvents = typeof wrapped?.on === 'function' && typeof wrapped?.off === 'function';
  if (jqueryEvents) wrapped.on('shown.bs.modal.snooze', finished);
  try {
    await waitFor(() => modal.classList.contains('show') || modal.classList.contains('in') || !modal.classList.contains('fade'), 'the window to finish opening', 5000);
    const fallbackStarted = Date.now();
    await waitFor(() => {
      const busy = modalTransitioning(modal);
      if (busy === true) return false;
      const ended = openingFinished(modal);
      if (ended === false) return false;
      return busy === false || ended === true || announced || Date.now() - fallbackStarted >= 450;
    }, 'the window opening transition to finish', WAIT.window);
    await waitFor(() => !modalLoading(loadingScope), 'the window loading cover to go', WAIT.window);
    await waitFor(() => [...modal.querySelectorAll('select.js-select2')].every(select => select2Of(select)), "the window's search boxes", 3000).catch(error => {
      if (stopFlagged(error)) throw error;
      recordRun({ type: 'miss', name: "the window's search boxes (not ready after 3 s)" });
    });
  } finally {
    modal.removeEventListener('shown.bs.modal', finished);
    if (jqueryEvents) wrapped.off('shown.bs.modal.snooze', finished);
  }
  const seconds = (Date.now() - started) / 1000;
  if (seconds > 5 && !opening?.recorded) recordRun({ type: 'slow', name: opening?.name || 'Schedule window', seconds });
  openingWindows.delete(modal);
  return modal;
}
const windowState = modal => `${modal.isConnected ? 'still open' : 'gone'}, classes "${[...modal.classList].join(' ')}", buttons: ${[...modal.querySelectorAll('button')].filter(shown).map(text).filter(Boolean).join(' / ') || 'none'}`;
async function closeWindow(modal, what) {
  const closed = () => !modal.isConnected || !shown(modal);
  await settled(modal, { caller: windowName(what) || windowCallers.get(modal), purpose: 'cleanup' }).catch(error => { if (stopFlagged(error) || modalTransitioning(modal) === true) throw error; });
  const ways = [
    ['Cancel', () => [...modal.querySelectorAll('button')].find(button => shown(button) && sameText(text(button), 'Cancel'))],
    ['its cancel button', () => [...modal.querySelectorAll('button.bootbox-cancel')].find(shown)],
    ['✕', () => [...modal.querySelectorAll('.btn-close, .bootbox-close-button, .close, button[aria-label="Close"]')].find(shown)],
  ];
  for (const [name, find] of ways) {
    const button = find();
    if (!button) continue;
    await click(button);
    if (await waitFor(closed, `${what} to close`, 3000).then(() => true, error => { if (stopFlagged(error)) throw error; return false; })) return name;
  }
  const view = modal.ownerDocument.defaultView;
  modal.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
  if (await waitFor(closed, `${what} to close`, 3000).then(() => true, error => { if (stopFlagged(error)) throw error; return false; })) return 'Escape';
  throw new PageError(`${what} would not close (${windowState(modal)}).`);
}
const isDisabled = select => select.disabled || select2Of(select)?.classList.contains('select2-container--disabled');
const chosenText = select => text(select.selectedOptions?.[0]);
const readsAs = (node, wanted) => {
  if (sameText(text(node), wanted)) return true;
  if ([...node.querySelectorAll('*')].some(part => sameText(text(part), wanted))) return true;
  const value = valueKey(text(node));
  const key = valueKey(wanted);
  return value.startsWith(key) && /^\s*:\s*\S+$/.test(value.slice(key.length));
};
const shape = value => String(value).replace(/[A-Za-z]/g, 'a').replace(/\d/g, '9');
function choicesReport(doc, wanted) {
  const all = [...doc.querySelectorAll('.select2-container--open .select2-results__option')];
  if (!all.length) return 'no list of choices open';
  const loading = all.filter(one => one.classList.contains('loading-results')).length;
  const listed = all.filter(one => !one.classList.contains('loading-results')).slice(0, 6).map(one => {
    const value = text(one);
    const parts = one.querySelectorAll('*').length;
    const head = valueKey(value).startsWith(valueKey(wanted)) ? `"${wanted}" + "${shape(value.slice(wanted.length)).slice(0, 25)}"` : `"${shape(value).slice(0, 30)}"`;
    return `${head}${parts ? ` (${parts} inner parts)` : ''}${one.classList.contains('select2-results__message') ? ' (a message)' : ''}`;
  });
  return `${all.length} choice(s)${loading ? `, ${loading} still "Searching"` : ''}: ${listed.join(' · ') || '-'}`;
}
async function chooseInSelect2(select, wanted, label) {
  const doc = select.ownerDocument;
  const view = doc.defaultView;
  await waitFor(() => !isDisabled(select), `"${label}" ready to choose`);
  const option = [...select.options].find(one => one.value !== '' && sameText(text(one), wanted));
  if (option) {
    option.selected = true;
    select.dispatchEvent(new view.Event('change', { bubbles: true }));
  } else {
    const box = select2Of(select)?.querySelector('.select2-selection');
    if (!box) throw new PageError(`"${label}" is not the dropdown Snooze expects.`);
    await click(box);
    const search = await waitFor(() => [...doc.querySelectorAll('.select2-container--open .select2-search__field')].find(shown), `the search box of "${label}"`);
    await typeInto(search, wanted);
    const pick = await waitFor(() => {
      const results = [...doc.querySelectorAll('.select2-container--open .select2-results__option')].filter(one => !one.classList.contains('loading-results'));
      if (!results.length) return null;
      const exact = results.filter(one => !one.classList.contains('select2-results__message') && readsAs(one, wanted));
      if (exact.length === 1) return exact[0];
      if (results.every(one => one.classList.contains('select2-results__message'))) return { none: text(results[0]) };
      return exact.length > 1 ? { many: exact.length } : null;
    }, `"${wanted}" among the choices for "${label}"`).catch(error => {
      if (error.identityChanged) throw error;
      throw keepFlags(error, new PageError(`${error.message} Typed ${search.value.length} characters; ${choicesReport(doc, wanted)}.`));
    });
    if (pick.none !== undefined) throw new PageError(`"${label}": the page offers nothing for "${wanted}" (${pick.none || 'no results'}).`);
    if (pick.many) throw new PageError(`"${label}": ${pick.many} choices read "${wanted}"; Snooze will not guess.`);
    await click(pick);
  }
  await waitFor(() => select.selectedOptions?.[0] && readsAs(select.selectedOptions[0], wanted), `"${wanted}" chosen in "${label}"`).catch(error => {
    if (error.identityChanged) throw error;
    throw keepFlags(error, new PageError(`${error.message} It reads "${shape(chosenText(select)).slice(0, 40) || '(empty)'}" (shape).`));
  });
}
__exports.PageError = PageError;
__exports.setConnectionGuard = setConnectionGuard;
__exports.setBatchGuard = setBatchGuard;
__exports.activeGuardProbe = activeGuardProbe;
__exports.probeStyleReader = probeStyleReader;
__exports.withPersonGuard = withPersonGuard;
__exports.guardPage = guardPage;
__exports.guarded = guarded;
__exports.guardReady = guardReady;
__exports.stopFlagged = stopFlagged;
__exports.keepFlags = keepFlags;
__exports.cleanupAfter = cleanupAfter;
__exports.WAIT = WAIT;
__exports.observeWindowTitle = observeWindowTitle;
__exports.recognizeBulkWindow = recognizeBulkWindow;
__exports.waitFor = waitFor;
__exports.text = text;
__exports.sameText = sameText;
__exports.shown = shown;
__exports.shownUsing = shownUsing;
__exports.click = click;
__exports.rightClick = rightClick;
__exports.describe = describe;
__exports.typeInto = typeInto;
__exports.setChecked = setChecked;
__exports.fieldByLabel = fieldByLabel;
__exports.pause = pause;
__exports.modalTransitioning = modalTransitioning;
__exports.settled = settled;
__exports.closeWindow = closeWindow;
__exports.chooseInSelect2 = chooseInSelect2;
},
"mysource/site.js": function (__require, __exports, document, window) {
'use strict';
const { PageError, shown } = __require("./dom.js");
const { valueKey } = __require("../rules/prepare.js");
const sites = new WeakMap();
const hasReadSite = (doc = document) => sites.has(doc);
const isTaxPage = (doc = document) => sites.get(doc) === 'tax';
function readSite(doc = document) {
  const present = selector => [...doc.querySelectorAll(selector)].filter(node =>
    !node.closest('#snooze-panel-host, #snooze-panel'));
  const tabs = present('[role="tab"], .nav-tabs a, .nav-tabs button').filter(shown);
  const has = text => tabs.some(node => valueKey(node.textContent) === text);
  const staff = has('staff'), professional = has('professional');
  if (staff && !professional) { sites.set(doc, 'tax'); return 'tax'; }
  if (professional && !staff) { sites.set(doc, 'consulting'); return 'consulting'; }
  throw new PageError("Can't tell which MySource this is.");
}
__exports.hasReadSite = hasReadSite;
__exports.isTaxPage = isTaxPage;
__exports.readSite = readSite;
},
"mysource/tax-page.js": function (__require, __exports, document, window) {
'use strict';
const { PageError, WAIT, chooseInSelect2, click, fieldByLabel, setChecked, settled, shown, text, typeInto, waitFor } = __require("./dom.js");
const { usDate } = __require("../rules/dates.js");
const { recordRun } = __require("../core/run-records.js");
async function findTaxAssignments({ start, end, future, clients }) {
  const form = await waitFor(() => [...document.querySelectorAll('#FindMultipleEventsWeeklyForm_Form')].find(shown), 'the Tax weekly Find Assignments form', WAIT.window);
  const modal = await settled(form.closest('.modal'));
  const labels = [...form.querySelectorAll('label')].map(text);
  recordRun({ type: 'findBoxes', boxType: labels.includes('Start Week') ? 'Week' : labels.includes('Start Date') ? 'Date' : 'unknown' });
  const control = selector => {
    const nodes = [...form.querySelectorAll(selector)].filter(shown);
    if (nodes.length !== 1) throw new PageError('Tax Find Assignments has ambiguous week controls. Nothing was read or changed.');
    return nodes[0];
  };
  const from = control('.js-start-of-week-picker'), to = control('.js-end-of-week-picker');
  const clientLabel = [...form.querySelectorAll('label')].find(node => ['Client', 'Clients'].includes(text(node)));
  if (!clientLabel) throw new PageError('Tax Find Assignments has no Client filter. Nothing was read or changed.');
  const client = fieldByLabel(form, text(clientLabel));
  const futureBox = fieldByLabel(form, 'Include All Future Assignments');
  for (const select of form.querySelectorAll('select')) {
    for (const option of select.options) option.selected = false;
    if (!select.multiple) select.value = '';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  }
  const allLabel = [...form.querySelectorAll('label')].find(node => text(node) === 'Include All Clients');
  const all = allLabel ? fieldByLabel(form, 'Include All Clients') : null;
  if (all) await setChecked(all, !clients);
  for (const name of clients || []) await chooseInSelect2(client, name, 'Clients');
  await typeInto(from, usDate(start));
  await setChecked(futureBox, future);
  if (!future) await typeInto(to, usDate(end));
  const chosen = [...client.selectedOptions].filter(option => option.value).map(text);
  const expected = clients || [];
  if (!form.isConnected || from.value.trim() !== usDate(start) || !future && to.value.trim() !== usDate(end) || futureBox.checked !== future
    || all && all.checked !== !clients || chosen.length !== expected.length || expected.some(name => !chosen.includes(name))
    || [...form.querySelectorAll('select')].some(select => select !== client && [...select.selectedOptions].some(option => option.value))) {
    throw new PageError('Tax Find Assignments did not keep the requested weeks and filters. Nothing was read or changed.');
  }
  const submits = [...modal.querySelectorAll('button')].filter(node => shown(node) && text(node) === 'Submit' && !node.disabled);
  if (submits.length !== 1) throw new PageError('Tax Find Assignments has no unique Submit.');
  await click(submits[0]);
  const edit = await waitFor(() => [...document.querySelectorAll('#editEventGridModal')].find(node => shown(node) && node.querySelector('table#editGrid tbody tr')), 'the Tax Edit Assignment table', WAIT.window);
  await settled(edit);
  await waitFor(() => !modal.isConnected || !shown(modal), 'Tax Find Assignments to close');
  return edit;
}
__exports.findTaxAssignments = findTaxAssignments;
},
"mysource/tax-restore.js": function (__require, __exports, document, window) {
'use strict';
const { compareDays, mondayOf, todayOf, usDate } = __require("../rules/dates.js");
const { noteTextKey, valueKey } = __require("../rules/prepare.js");
const { copyWindow, compareCopies } = __require("./copy.js");
const { canAddAssignment } = __require("./schedule.js");
const { calendarHolds, showDate } = __require("./calendar.js");
const sameDay = (a, b) => compareDays(a, b) === 0;
const within = (day, window) => compareDays(day, window.start) >= 0 && compareDays(day, window.end) <= 0;
const on = (copy, day) => ({ days: copy.days.filter(row => sameDay(row.day, day)) });
const equal = (a, b) => compareCopies(a, b).same;
const sameLive = (a, b) => equal(a, b) && a.days.every(old => b.days.some(row => row.id === old.id && row.notes === old.notes
  && (typeof old.noteText !== 'string' || noteTextKey(row.noteText || '') === noteTextKey(old.noteText))));
function daySteps(day, wanted, actual, today) {
  const retained = [], add = [], used = new Set();
  const sameEntry = (old, row) => equal({ days: [{ ...old, hours: row.hours }] }, { days: [row] });
  for (const old of wanted) {
    const matches = actual.filter(row => old.id && row.id === old.id);
    if (matches.length > 1 || old.id && wanted.filter(row => row.id === old.id).length > 1) return null;
    if (matches.length) {
      const row = matches[0];
      if (used.has(row.id) || !sameEntry(old, row) || row.hours > old.hours) return null;
      retained.push({ old, row }); used.add(row.id);
    } else {
      if (!old.id && actual.some(row => sameEntry(old, row))) return null;
      add.push(old);
    }
  }
  const remove = actual.filter(row => !used.has(row.id));
  if (compareDays(day, today) < 0 && (remove.length || add.length)) return null;
  if (remove.some(row => retained.some(kept => valueKey(kept.row.client) === valueKey(row.client)))) return null;
  return { day, retained, remove, add };
}
async function taxRestorePlan(backup, { after = null, today = todayOf(), verifyBefore } = {}) {
  const window = backup.watchedWindow || backup.window;
  const before = await copyWindow(window, { noteRows: after?.days.filter(row => typeof row.noteText === 'string') || [] });
  await verifyBefore?.(before);
  const candidates = [...new Map([...backup.days, ...before.days.filter(row => within(row.day, backup.window))].map(row => [usDate(row.day), row.day])).values()].sort(compareDays);
  const changedDays = [], steps = [], skippedLater = [], skippedLocked = [], skippedUnconfirmed = [];
  let skippedPast = 0;
  for (const day of candidates) {
    const wanted = on(backup, day), actual = on(before, day);
    const noteChanged = (backup.noteChangedDays || []).some(old => sameDay(old, day)) && actual.days.some(row => row.notes > 0);
    if (equal(wanted, actual) && !noteChanged) continue;
    if (compareDays(day, mondayOf(today)) < 0) { skippedPast++; continue; }
    if (after && !sameLive(on(after, day), actual)) { skippedLater.push({ day, clients: actual.days.map(row => row.client) }); continue; }
    const step = daySteps(day, wanted.days, actual.days, today);
    if (!step) { skippedUnconfirmed.push(day); continue; }
    if (!calendarHolds(day)) await showDate(day);
    if (!await canAddAssignment(day, { dayOnly: true })) { skippedLocked.push(day); continue; }
    changedDays.push(day); steps.push(step);
  }
  return { window, before, changedDays, steps, skippedPast, skippedLater, skippedLocked, skippedUnconfirmed, nothing: changedDays.length ? '' : 'Nothing left to undo.' };
}
__exports.taxRestorePlan = taxRestorePlan;
},
"mysource/preflight-form.js": function (__require, __exports, document, window) {
'use strict';
const forms = new WeakMap();
let pending = null;
function retirePreflightForm() { pending?.stop(); pending = null; }
const controlsOf = modal => [...modal.querySelectorAll('input, select, textarea')];
const valueOf = node => JSON.stringify([node.value, node.checked, node.disabled,
  node.tagName === 'SELECT' ? [...node.options].map(option => option.selected) : null]);
function rememberPreflightForm(modal, identity, required) {
  retirePreflightForm();
  const doc = modal.ownerDocument;
  const controls = controlsOf(modal), values = controls.map(valueOf);
  const events = ['click', 'contextmenu', 'input', 'change', 'visibilitychange'];
  let dirty = false;
  const stop = () => {
    dirty = true; observer.disconnect();
    if (pending === proof) pending = null;
    for (const event of events) doc.removeEventListener(event, stop, true);
    doc.defaultView.removeEventListener('pagehide', stop);
  };
  const observer = new doc.defaultView.MutationObserver(stop);
  observer.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
  for (const event of events) doc.addEventListener(event, stop, true);
  doc.defaultView.addEventListener('pagehide', stop);
  const proof = { stop, identity, required: required.map(day => ({ ...day })), take() {
    const valid = pending === proof && !dirty && !observer.takeRecords().length && document === doc
      && modal.isConnected && controlsOf(modal).every((node, index) => node === controls[index] && valueOf(node) === values[index])
      && controlsOf(modal).length === controls.length;
    stop();
    return valid;
  } };
  forms.set(modal, proof); pending = proof;
}
function takePreflightForm(modal) {
  const proof = forms.get(modal);
  forms.delete(modal);
  return { valid: proof?.take() === true, required: proof?.required };
}
const preflightFormIdentity = modal => forms.get(modal)?.identity;
__exports.retirePreflightForm = retirePreflightForm;
__exports.rememberPreflightForm = rememberPreflightForm;
__exports.takePreflightForm = takePreflightForm;
__exports.preflightFormIdentity = preflightFormIdentity;
},
"mysource/schedule.js": function (__require, __exports, document, window) {
'use strict';
const { isTaxPage, hasReadSite, readSite } = __require("./site.js");
const { findTaxAssignments } = __require("./tax-page.js");
const { timedRun } = __require("../core/run-records.js");
const { retirePreflightForm } = __require("./preflight-form.js");
const { usDate, readIsoDay, compareDays, sameDay, todayOf, mondayOf, addDays } = __require("../rules/dates.js");
const { termDayOf } = __require("../rules/shared.js");
const { emailKey, emailFormKey } = __require("../rules/prepare.js");
const { findByEmail } = __require("../family/email.js");
const { recordRun, observeRun } = __require("../core/run-records.js");
const { DNS_CLIENT } = __require("./checks.js");
const { PageError, WAIT, activeGuardProbe, probeStyleReader, chooseInSelect2, click, closeWindow, describe, fieldByLabel, guardReady, guarded, keepFlags, cleanupAfter, rightClick, sameText, setChecked, settled, shown, shownUsing, stopFlagged, text, typeInto, waitFor, withPersonGuard } = __require("./dom.js");
const SEARCH_SELECT = 'select[id^="ScheduleAddForm_Staff_Form_field_"]';
const CALENDAR_VIEW = '.fc-view';
const SCHEDULE_PAGE_WORDS = {
  paste: 'Snooze works only on MySource › Schedule (Calendar view, Professional tab). Open it there and paste again.',
  pause: 'Not on the Schedule page any more. Go back to Schedule › Calendar view, then Resume.',
};
const IDENTITY_PAUSE_WORDS = 'Snooze could not confirm the person shown. Check the right Professional is on the schedule, then Resume.';
function schedulePageFacts(probe) {
  if (typeof window.jQuery !== 'function') return { fact: 'jQuery missing' };
  const select = document.querySelector(SEARCH_SELECT);
  if (!select) return { fact: 'search select missing' };
  const box = select.nextElementSibling?.querySelector('.select2-selection');
  if (!box) return { fact: 'box missing' };
  const styleOf = probeStyleReader(probe);
  let ancestor = 0;
  for (let node = box; node && node.nodeType === 1; node = node.parentElement, ancestor++) {
    const style = styleOf(node);
    const how = node.hidden ? 'hidden' : ancestor > 0 && node.getAttribute('aria-hidden') === 'true' ? 'aria-hidden'
      : style.display === 'none' ? 'display:none' : style.visibility === 'hidden' ? 'visibility:hidden' : null;
    if (how) {
      let cause = node, depth = ancestor;
      if (how === 'visibility:hidden') while (cause.parentElement && styleOf(cause.parentElement).visibility === 'hidden') { cause = cause.parentElement; depth++; }
      const tag = ['html', 'body', 'div', 'span', 'section', 'form', 'td', 'main', 'aside'].includes(cause.tagName.toLowerCase()) ? cause.tagName.toLowerCase() : 'element';
      return { fact: 'box hidden', ancestor: depth, tag, how };
    }
  }
  if (!box.isConnected) return { fact: 'box missing' };
  const pane = select.closest('.tab-pane');
  if (pane && !pane.classList.contains('active')) return { fact: 'pane not active' };
  return null;
}
const isSchedulePage = () => !schedulePageFacts();
function requireSchedulePage(probe) {
  const facts = schedulePageFacts(probe);
  if (facts) throw Object.assign(new PageError(SCHEDULE_PAGE_WORDS.pause, { record: false }), { schedulePage: true, scheduleFacts: facts });
}
const computedStyle = node => node.ownerDocument.defaultView.getComputedStyle(node);
const screenReader = (doc, styleOf = computedStyle) => {
  const laidOut = doc.body.getBoundingClientRect().width > 0;
  return node => {
  const box = node.getBoundingClientRect();
  const style = styleOf(node);
  return style.display !== 'none' && style.visibility !== 'hidden' && (!laidOut || box.width > 0 || box.height > 0);
  };
};
const onScreen = node => screenReader(node.ownerDocument)(node);
const isScheduleContent = node => {
  const control = node.closest('[id^="controlCalendar_"]');
  if (!control) return true;
  if (!control.querySelector(':scope > .fc-toolbar')) return false;
  return !node.closest('.fc-view-container, .fc-view');
};
const tilesOnScreen = () => [...document.querySelectorAll('.fc-event')].filter(isScheduleContent).filter(screenReader(document));
function calendarView() {
  return calendarViewUsing(computedStyle);
}
function calendarViewUsing(styleOf) {
  const visible = screenReader(document, styleOf);
  const visibility = new WeakMap();
  const exposed = node => {
    if (!node || node === document.body) return true;
    if (visibility.has(node)) return visibility.get(node);
    const result = !node.hidden
      && (!node.classList.contains('tab-pane') || node.classList.contains('active'))
      && exposed(node.parentElement) && visible(node);
    visibility.set(node, result);
    return result;
  };
  const wrappers = [...document.querySelectorAll('.staff-calendar-wrapper')].filter(exposed);
  if (wrappers.length > 1) throw new PageError('More than one active Professional calendar; Snooze will not guess.');
  const root = wrappers[0] || document;
  const laidOut = document.body.getBoundingClientRect().width > 0;
  const styleVisibility = new WeakMap();
  const styled = node => {
    if (!node || node === document.body) return true;
    if (styleVisibility.has(node)) return styleVisibility.get(node);
    const style = styleOf(node);
    const result = !node.hidden && style.display !== 'none' && style.visibility !== 'hidden'
      && (!node.classList.contains('tab-pane') || node.classList.contains('active')) && styled(node.parentElement);
    styleVisibility.set(node, result);
    return result;
  };
  const sizedCell = cell => {
    if (!styled(cell)) return false;
    const box = cell.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  for (const control of root.querySelectorAll('[id^="controlCalendar_"]')) {
    if (control.querySelector('.fc-event')) throw new PageError('The header calendar copy holds entries; Snooze will not guess.');
    if ([...control.querySelectorAll('td.fc-day[data-date]')].some(sizedCell)) {
      throw new PageError('The header calendar copy has visible dated cells; Snooze will not guess.');
    }
  }
  const views = [...root.querySelectorAll(CALENDAR_VIEW)].filter(isScheduleContent).filter(laidOut ? styled : exposed);
  if (!laidOut && views.length < 2) return views[0] || null;
  const dated = views.filter(view => [...view.querySelectorAll('td.fc-day[data-date]')].some(laidOut ? sizedCell : exposed));
  if (dated.length === 1) return dated[0];
  if (laidOut && !dated.length) return null;
  throw new PageError('The active calendar has more than one readable view; Snooze will not guess.');
}
const BUSY = 'div.loading, .blockUI.blockOverlay, .loading-overlay';
const coverOnCalendar = (view, styleOf = computedStyle) => {
  if (typeof document.elementFromPoint !== 'function') return null;
  const cell = [...((view === undefined ? calendarViewUsing(styleOf) : view)?.querySelectorAll('td.fc-day') || [])].find(screenReader(document, styleOf));
  const box = cell?.getBoundingClientRect();
  if (!box || !box.width || typeof document.elementFromPoint !== 'function') return null;
  return document.elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2))?.closest(BUSY) || null;
};
const busyCovers = () => {
  const styleOf = probeStyleReader(), covers = visibleCovers(styleOf);
  const onTop = coverOnCalendar(undefined, styleOf);
  return onTop && !covers.includes(onTop) ? [onTop, ...covers] : covers;
};
const visibleCovers = styleOf => {
  const visible = screenReader(document, styleOf);
  return [...document.querySelectorAll(BUSY)].filter(node => visible(node) && styleOf(node).pointerEvents !== 'none');
};
async function pageReady(what, timeout = WAIT.person) {
  const started = Date.now();
  let clearSince = null;
  await waitFor(() => {
    if (busyCovers().length) clearSince = null;
    else clearSince ??= Date.now();
    return clearSince !== null && Date.now() - clearSince >= WAIT.quiet;
  }, `the page to finish loading (${what})`, timeout).catch(error => {
    if (error.identityChanged) throw error;
    const cover = busyCovers()[0];
    const box = cover?.getBoundingClientRect();
    const style = cover && cover.ownerDocument.defaultView.getComputedStyle(cover);
    throw keepFlags(error, new PageError(`${error.message} The loading cover ${describe(cover)} is still there${box ? ` (${Math.round(box.width)}×${Math.round(box.height)} px, opacity ${style.opacity}, z-index ${style.zIndex}, position ${style.position})` : ''}.`));
  });
  pageReady.waited = Date.now() - started - WAIT.quiet;
}
pageReady.waited = 0;
function currentPerson() {
  const names = shownNames(document);
  return nameFrom(names);
}
function nameFrom(names) {
  if (names.length > 1) {
    const error = new PageError(`${names.length} schedules are open at once. Close all but one (the ✕ beside each name) and use Custom view.`);
    error.pageBlocked = true; error.multipleSchedules = true;
    throw error;
  }
  return text(names[0]);
}
const personIdentity = () => {
  const names = shownNames(document);
  return { name: nameFrom(names), id: provedIdFrom(entityElementsFrom(names), names) };
};
const identityNameKey = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
const sameIdentityName = (before, shown) => sameText(before, shown) && identityNameKey(before) === identityNameKey(shown);
function sameNameApartFromDigits(saved, shown) {
  const a = identityNameKey(saved), b = identityNameKey(shown);
  return a.length === b.length && a.replace(/\d/g, '#') === b.replace(/\d/g, '#');
}
function observeIdentityPage(probe) {
  let styleOf = probeStyleReader(probe);
  const names = shownNames(document, styleOf), elements = entityElementsFrom(names, styleOf);
  const id = provedIdFrom(elements, names, styleOf);
  let view = null, calendarAmbiguous = false;
  try { view = calendarViewUsing(styleOf); } catch {
    calendarAmbiguous = true;
    probe?.clear();
    styleOf = probeStyleReader(probe);
  }
  const covers = visibleCovers(styleOf);
  const hitCover = view ? coverOnCalendar(view, styleOf) : null;
  const calendarCover = !!hitCover || covers.some(node => !node.closest('.modal, .bootbox, [role=dialog]'));
  const rawName = names.length === 1 ? String(names[0].textContent || '') : '';
  return { names, elements, id, view, calendarAmbiguous, covers, hitCover, calendarCover, rawName };
}
function identityObservation(before, probe) {
  const page = probe?.get(document) || observeIdentityPage(probe);
  if (!page.calendarAmbiguous) probe?.set(document, page);
  const { names, elements, id, view, calendarAmbiguous, covers, hitCover, calendarCover, rawName } = page;
  const facts = { nameCount: names.length, namePresent: names.length === 1 && !!text(names[0]),
    expectedNamePresent: !!before?.name, nameEqual: names.length === 1 && sameIdentityName(before?.name, rawName),
    nameSpacingCaseOnly: names.length === 1 && !!before?.name && before.name !== rawName && sameIdentityName(before.name, rawName),
    nameLengthDifference: names.length === 1 && before?.name ? rawName.length - before.name.length : null,
    idCount: elements.length, idReadable: id !== null, expectedIdReadable: before?.id != null,
    idEqual: before?.id === id, calendarPresent: !!view, calendarAmbiguous, loadingCover: covers.length > 0 || !!hitCover };
  return { facts, names, view, calendarCover };
}
function failedIdentityFacts(before) { return identityObservation(before).facts; }
function nameShape(before) {
  try {
    const shown = shownNames(document);
    if (shown.length !== 1 || !before?.name) return null;
    const a = String(before.name), b = String(shown[0].textContent || '');
    let at = 0; while (at < a.length && at < b.length && a[at] === b[at]) at++;
    const kind = c => c === undefined ? 'none' : /\s/.test(c) ? 'space' : /\d/.test(c) ? 'digit' : /\p{L}/u.test(c) ? 'letter' : 'sign';
    const letters = value => [...value.toLowerCase().replace(/\s+/g, '')].sort().join('');
    return { at, of: a.length, savedKind: kind(a[at]), shownKind: kind(b[at]), sameLettersReordered: letters(a) === letters(b),
      shownLeadingSpace: /^\s/.test(b), shownTrailingSpace: /\s$/.test(b), shownHasLineBreak: /[\r\n]/.test(b) };
  } catch { return null; }
}
function identityRefusal(before, operation, message, flags = {}) {
  const identityFacts = failedIdentityFacts(before);
  recordRun({ type: 'identity', facts: identityFacts, operation });
  return Object.assign(new PageError(message), { identityChanged: true, identityFacts, identityShape: nameShape(before), operation, identityRecorded: true, ...flags });
}
const normalizedIdentities = new WeakSet();
function checkPersonIdentity(before, operation = 'identity check', probe) {
  probe = activeGuardProbe(probe);
  const { facts, names, view, calendarCover } = identityObservation(before, probe);
  const refuse = () => identityRefusal(before, operation,
    'The shown person changed during this turn. Snooze stopped; no further schedule changes were made.',
    shownNames(document).length > 1 ? { multipleSchedules: true, pageBlocked: true } : {});
  const name = names[0], wrapper = view?.closest('.staff-calendar-wrapper');
  const owned = !!name && !!view && (!wrapper || wrapper.contains(name));
  if (facts.nameCount !== 1 || !facts.namePresent || !owned || !view || calendarCover) {
    throw Object.assign(new Error('The calendar is redrawing.'), { identityPending: true, refuse });
  }
  if (before?.name && facts.nameCount === 1 && !facts.nameEqual && facts.idReadable && facts.expectedIdReadable && facts.idEqual
    && sameNameApartFromDigits(before.name, names[0].textContent)) return true;
  if (!before?.name || !facts.nameEqual || !facts.idReadable || !facts.expectedIdReadable || !facts.idEqual) throw refuse();
  if (facts.nameSpacingCaseOnly && !normalizedIdentities.has(before)) {
    normalizedIdentities.add(before);
    probe?.clear();
    recordRun({ type: 'identity', facts, operation });
  }
  return true;
}
function requirePersonIdentity(before, operation = 'identity check') {
  try { return checkPersonIdentity(before, operation); }
  catch (error) { throw error.identityPending ? error.refuse() : error; }
}
function waitForPersonIdentity(before, operation = 'identity check') {
  try { return checkPersonIdentity(before, operation); }
  catch (error) {
    if (!error.identityPending) throw error;
    return waitFor(() => checkPersonIdentity(before, operation), 'the person on the calendar to settle', WAIT.person);
  }
}
let rememberedPerson = null;
let findContext = null;
let writtenDocument = null;
function beginScheduleTurn() { writtenDocument = null; }
observeRun(event => { if (event.type === 'writeAttempt') writtenDocument = document; });
const futureReadRefusal = reason => new PageError(`${reason}${writtenDocument === document ? ' By hand.' : ' Nothing was changed; By hand.'}`);
const taxNameClose = name => name.parentElement?.tagName === 'SPAN'
  && name.parentElement.previousElementSibling?.matches('a')
  && name.parentElement.previousElementSibling.querySelector('i.fa-times')
  ? name.parentElement.previousElementSibling : null;
const shownNames = (doc, styleOf) => {
  const visible = node => styleOf ? shownUsing(node, styleOf) : shown(node);
  const names = [...doc.querySelectorAll('.calendar-name')].filter(visible);
  if (hasReadSite(doc) && !isTaxPage(doc)) return names;
  const taxNames = [...doc.querySelectorAll('.staff-calendar-wrapper a + span > a')].filter(node =>
    !node.closest('.fc, [class*="select2"], .js-tooltip, .schedule-tooltip, .tooltip, [role="tooltip"]')
    && [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim())
    && taxNameClose(node) && visible(node) && visible(node.closest('.staff-calendar-wrapper')));
  if (!taxNames.length) return names;
  if (!hasReadSite(doc) && readSite(doc) !== 'tax') return names;
  return [...new Set([...names, ...taxNames])];
};
const pageCalm = () => shownNames(document).length === 0 && busyCovers().length === 0;
async function searchPageReady() {
  try {
    currentPerson();
    await pageReady('before a new search');
    currentPerson();
    const name = shownNames(document)[0];
    if (name) {
      await timedRun('close person', async () => {
        const started = Date.now();
        const title = name.closest('div.calendar-title');
        const taxClose = isTaxPage() && taxNameClose(name);
        const buttons = taxClose ? [taxClose].filter(shown)
          : [...(title?.querySelectorAll('button.btn.btn-light.btn-xs[type="button"]') || [])]
            .filter(button => shown(button) && button.querySelector('i.fa.fa-times'));
        if (buttons.length !== 1) throw new PageError('The ✕ beside the current person was not found. Close their schedule by hand before Resume.');
        await click(buttons[0]);
        await waitFor(() => {
          currentPerson();
          return pageCalm();
        }, 'the current schedule to close and the page to finish loading', WAIT.person);
        await pageReady('after closing the current person', Math.max(0, WAIT.person - (Date.now() - started)));
      });
    }
    if (!pageCalm()) throw new PageError('The page still has an open schedule or is loading. Close the schedule and wait before Resume.');
  } catch (error) { error.pageBlocked = true; throw error; }
}
async function resumePageReady({ empty = false } = {}) {
  currentPerson();
  if (empty && shownNames(document).length) throw new PageError('The previous schedule is still open. Close it with the ✕ and wait before Resume.');
  await pageReady('before Resume');
  currentPerson();
  if (empty && !pageCalm()) throw new PageError('The previous schedule is still open or loading. Close it and wait before Resume.');
}
function entityElementsFrom(names, styleOf) {
  if (names.length !== 1) return [];
  if (isTaxPage(names[0].ownerDocument)) {
    const header = taxNameClose(names[0])?.parentElement;
    if (!header) return [];
    return [...header.querySelectorAll('[data-entity-id]')].filter(node => !node.closest('.fc')
      && (styleOf ? shownUsing(node, styleOf) : shown(node)));
  }
  const elementsIn = area => [...(area.hasAttribute('data-entity-id') ? [area] : []), ...area.querySelectorAll('[data-entity-id]')];
  const title = names[0].closest('div.calendar-title');
  if (title) return elementsIn(title);
  const wrapper = names[0].closest('div.js-calendar-wrapper, div.staff-calendar-wrapper');
  if (!wrapper) return [];
  return elementsIn(wrapper);
}
function personEntityId() {
  const names = shownNames(document);
  return provedIdFrom(entityElementsFrom(names), names);
}
function idFrom(elements) {
  if (elements.length !== 1) return null;
  const value = elements[0].getAttribute('data-entity-id');
  return value && !/\D/.test(value) ? value : null;
}
function taxIdConfirmed(names, id, styleOf) {
  if (!id || names.length !== 1) return false;
  const name = names[0], wrapper = name.closest('.staff-calendar-wrapper');
  if (!wrapper || !new RegExp(`(?:^|\\D)${id}(?:\\D|$)`).test(name.getAttribute('href') || '')) return false;
  const calendars = [...wrapper.querySelectorAll('.js-dynamic-calendar.rm-schedule-calendar[data-record-id]')]
    .filter(node => styleOf ? shownUsing(node, styleOf) : shown(node));
  return calendars.length > 0 && calendars.every(node => node.getAttribute('data-record-id') === id);
}
function provedIdFrom(elements, names, styleOf) {
  const id = idFrom(elements);
  return names.length === 1 && isTaxPage(names[0].ownerDocument) && !taxIdConfirmed(names, id, styleOf) ? null : id;
}
function personIdCheck() {
  const names = shownNames(document);
  const elements = entityElementsFrom(names);
  const entityId = provedIdFrom(elements, names);
  const id = elements.length > 1 ? 'ambiguous' : entityId !== null ? 'found' : 'missing';
  if (isTaxPage()) return { id, forecastLink: 'missing', matches: idFrom(elements) === null ? null : taxIdConfirmed(names, idFrom(elements)) };
  const area = names.length === 1
    ? names[0].closest('div.calendar-title') || names[0].closest('div.js-calendar-wrapper, div.staff-calendar-wrapper')
    : null;
  const links = area ? [...area.querySelectorAll('a.btn[href]')].filter(shown) : [];
  const forecast = links.filter(link => link.getAttribute('aria-label') === 'Forecast View');
  const hrefs = (forecast.length ? forecast : links).map(link => link.getAttribute('href')).filter(href => /\d/.test(href));
  const forecastLink = hrefs.length ? 'found' : 'missing';
  const matches = entityId === null || !hrefs.length ? null
    : hrefs.some(href => new RegExp(`(?:^|\\D)${entityId}(?:\\D|$)`).test(href));
  return { id, forecastLink, matches };
}
function resultEmails(option) {
  const emails = [];
  const doc = option.ownerDocument;
  const nodes = doc.createTreeWalker(option, doc.defaultView.NodeFilter.SHOW_TEXT);
  for (let node = nodes.nextNode(); node; node = nodes.nextNode()) {
    const matches = node.textContent.matchAll(/(?:^|[^A-Z0-9.!#$%&'*+/=?^_`{|}~@-])([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?)/gi);
    for (const match of matches) emails.push(match[1]);
  }
  return emails;
}
async function professionalResults() {
  const dropdown = await waitFor(() => {
    const container = document.querySelector('.select2-container--open .select2-results__options')?.closest('.select2-container--open');
    return container && shown(container) ? container : null;
  }, 'professional search results', WAIT.person);
  let changedAt = Date.now(), signature = null;
  const observer = new dropdown.ownerDocument.defaultView.MutationObserver(() => { changedAt = Date.now(); });
  observer.observe(dropdown, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'aria-busy', 'aria-disabled', 'role', 'hidden', 'style'] });
  try {
    return await waitFor(() => {
      if (!shown(dropdown)) throw Object.assign(new PageError('The professional search closed before its results could be read.'), { reasonCode: 'pageUnreadable' });
      const rows = [...dropdown.querySelectorAll('.select2-results__option')].filter(shown);
      const unfinished = dropdown.matches('[aria-busy="true"]')
        || [...dropdown.querySelectorAll('.loading-results, .select2-results__option--load-more, [aria-busy="true"]')].some(shown)
        || rows.some(row => /^\s*(searching|loading|load more|more results)\b/i.test(text(row)));
      if (unfinished || !rows.length) { signature = null; changedAt = Date.now(); return null; }
      const options = rows.filter(row => !row.classList.contains('select2-results__message')
        && !row.classList.contains('select2-results__option--group') && row.getAttribute('role') !== 'group'
        && !row.querySelector('ul.select2-results__options') && !/^\s*no results\b/i.test(text(row)));
      const messages = rows.filter(row => row.classList.contains('select2-results__message') || /^\s*no results\b/i.test(text(row)));
      const read = options.map(option => ({ option, emails: resultEmails(option), text: text(option) }));
      const next = JSON.stringify({ rows: rows.map(row => [row.className, text(row)]), emails: read.map(row => row.emails) });
      if (signature !== next) { signature = next; changedAt = Date.now(); return null; }
      if (Date.now() - changedAt < WAIT.quiet) return null;
      if (messages.some(row => !/^no results(?: found)?[.!]?$/i.test(text(row))) || (messages.length && options.length)) {
        throw Object.assign(new PageError('The professional search results could not be read.'), { reasonCode: 'pageUnreadable' });
      }
      return options.length || messages.length ? read : null;
    }, 'settled professional search results', WAIT.person);
  } finally { observer.disconnect(); }
}
async function openPersonRecorded(email, expectedName = '', record = null, { fresh = false, today = todayOf(), termDate = record?.person?.termDate } = {}) {
  openPerson.last = { emailShown: false, waitedMs: 0, idShown: false, idMatchesLink: null };
  currentPerson();
  const remembered = rememberedPerson;
  const names = shownNames(document);
  const supplied = emailFormKey(email), plain = emailKey(email);
  if (!fresh && remembered && remembered.email === supplied
    && names.length === 1 && names[0].textContent === remembered.nameText
    && personEntityId() === remembered.entityId && personIdCheck().matches === true && calendarView()) {
    const name = text(names[0]);
    try {
      await pageReady('before reusing the current person');
      await setupView();
      const after = shownNames(document);
      if (after.length !== 1 || after[0].textContent !== remembered.nameText
        || personEntityId() !== remembered.entityId || personIdCheck().matches !== true || !calendarView()) {
        throw identityRefusal({ name, id: remembered.entityId }, 'open person', 'The shown person changed while Snooze was opening the schedule. Search for the person again.');
      }
    } catch (error) {
      rememberedPerson = null;
      if (busyCovers().length) error.pageBlocked = true;
      throw error;
    }
    openPerson.last = { emailShown: remembered.emailShown, waitedMs: 0, reused: true, idShown: true, idMatchesLink: true };
    if (record && remembered.pageEmail) record.pageEmail ??= remembered.pageEmail;
    findContext = { document, identity: personIdentity(), today, termDate };
    return name;
  }
  rememberedPerson = null;
  findContext = null;
  await searchPageReady();
  const select = document.querySelector(SEARCH_SELECT);
  if (!select) {
    throw new PageError('The "Search for a Professional" box is not on this page. Open Schedule > Calendar view.');
  }
  const box = select.nextElementSibling?.querySelector('.select2-selection');
  if (!box) {
    throw new PageError('The "Search for a Professional" box is not the dropdown Snooze expects.');
  }
  const before = currentPerson();
  const nameOf = shownName => shownName.split('(')[0].trim();
  await click(box);
  const search = await waitFor(() => [...document.querySelectorAll('.select2-container--open .select2-search__field')].find(shown), 'the Search for a Professional box', WAIT.window);
  await typeInto(search, plain, () => recordRun({ type: 'searchStart' }));
  await pageReady('before choosing the professional');
  const results = await professionalResults();
  const readable = results.filter(row => row.emails.length === 1);
  const pick = findByEmail(email, readable, row => row.emails[0]);
  openPerson.last.emailShown = results.length === 1 && results[0].emails.length > 0;
  if (pick.unclear) throw Object.assign(new PageError(`${pick.count} professionals show exactly ${emailKey(email)}; Snooze will not guess.`), { reasonCode: 'personNotFound' });
  const result = pick.match;
  if (!result) {
    if (results.some(row => row.emails.length !== 1)) {
      throw Object.assign(new PageError('The professional search results have unreadable emails; Snooze will not guess.'), { reasonCode: 'pageUnreadable' });
    }
    throw Object.assign(new PageError(`No professional found for ${emailKey(email)}.`), { reasonCode: 'personNotFound' });
  }
  openPerson.last.emailShown = result.emails.length > 0;
  const pageEmail = result.emails[0]?.replace(/[\s\p{Cf}]+/gu, '');
  const beforeView = calendarView();
  let reloaded = false;
  const noteReload = () => {
    if (reloaded) return;
    if (busyCovers().length || calendarView() !== beforeView) reloaded = true;
  };
  const observer = new select.ownerDocument.defaultView.MutationObserver(noteReload);
  observer.observe(select.ownerDocument.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  const started = Date.now();
  let loadedIdentity = null;
  try {
    await timedRun('load person', async () => {
    if (!pageCalm()) {
      currentPerson();
      throw new PageError('The page still has an open schedule or is loading. Close the schedule and wait before Resume.');
    }
    await click(result.option);
    await waitFor(() => {
      noteReload();
      const name = currentPerson();
      if (!name || !calendarView()) return null;
      if (before && sameText(nameOf(name), nameOf(before)) && !reloaded) return null;
      if (expectedName) return sameText(nameOf(name), expectedName) ? name : null;
      return name !== before || reloaded ? name : null;
    }, expectedName ? `the schedule of ${expectedName} to reload` : `the schedule of ${emailKey(email)} to reload`, WAIT.person).catch(async error => {
      const name = await cleanupAfter(error, async () => currentPerson());
      if (expectedName && name && !sameText(nameOf(name), expectedName)) { error.message = `The schedule shown is "${name}", not ${expectedName}. ${error.message}`; throw error; }
      if (before && name && sameText(nameOf(name), nameOf(before)) && !reloaded) { error.message = `The searched schedule did not reload. ${error.message}`; throw error; }
      throw error;
    });
    await pageReady('after choosing the professional', Math.max(0, WAIT.person - (Date.now() - started)));
    const loadedName = currentPerson();
    if (!loadedName || !calendarView()) throw new PageError('The searched schedule was not shown after loading.');
    if (expectedName && !sameText(nameOf(loadedName), expectedName)) throw new PageError(`The schedule shown is "${loadedName}", not ${expectedName}.`);
    });
    const loadedName = currentPerson();
    loadedIdentity = personIdentity();
    if (isTaxPage() && loadedIdentity.id === null) throw identityRefusal(loadedIdentity, 'open person',
      'The Tax id could not be confirmed from the name link and calendar records. Nothing was changed; By hand.',
      { initialTaxIdUnconfirmed: true, reasonCode: 'taxIdUnconfirmed' });
    recordRun({ type: 'personLoaded' });
    await setupView();
    const loadedNodes = shownNames(document);
    const nameText = loadedNodes.length === 1 ? loadedNodes[0].textContent : null;
    const entityId = personEntityId();
    openPerson.last.reloaded = reloaded;
    openPerson.last.idShown = entityId !== null;
    openPerson.last.idMatchesLink = personIdCheck().matches;
    if (openPerson.last.idMatchesLink === true) {
      rememberedPerson = { email: supplied, entityId, nameText, emailShown: openPerson.last.emailShown, pageEmail };
    }
    currentPerson();
    if (record && pageEmail) record.pageEmail ??= pageEmail;
    findContext = { document, identity: personIdentity(), today, termDate };
    return loadedName;
  } catch (error) {
    if (!loadedIdentity) {
      error.pageBlocked = true;
    } else {
      error.noReplay = true;
      if (!error.initialTaxIdUnconfirmed || !sameIdentityName(loadedIdentity.name, currentPerson()) || personIdentity().id !== null) {
        await cleanupAfter(error, () => requirePersonIdentity(loadedIdentity));
      }
    }
    throw error;
  } finally {
    openPerson.last.waitedMs = Date.now() - started;
    observer.disconnect();
  }
}
openPerson.last = { emailShown: false, waitedMs: 0, idShown: false, idMatchesLink: null };
const PERIODS = '14';
const CUSTOM_BUTTON = 'button.fc-weeklyTimeline-button';
const CUSTOM_VIEW = '.fc-weeklyTimeline-view';
const isCustom = () => {
  const view = calendarView();
  return Boolean(view && view.matches(CUSTOM_VIEW));
};
const configuredPeriods = new WeakSet();
async function setupView() {
  if (!isCustom()) {
    const button = [...document.querySelectorAll(CUSTOM_BUTTON)].find(shown);
    if (!button) throw new PageError('The Custom view button was not found.');
    await click(button);
    let previous = null, stillSince = null;
    await waitFor(() => {
      const view = calendarView(), laidOut = document.body.getBoundingClientRect().width > 0;
      const dates = [];
      for (const cell of view?.querySelectorAll('td.fc-day[data-date]') || []) {
        if (!onScreen(cell)) continue;
        const box = cell.getBoundingClientRect();
        if (laidOut && (!box.width || !box.height)) continue;
        const date = readIsoDay(cell.getAttribute('data-date'));
        if (!date) { previous = null; stillSince = null; return false; }
        dates.push(date);
      }
      if (!view?.matches(CUSTOM_VIEW) || !dates.length) {
        previous = null; stillSince = null; return false;
      }
      const signature = dates.sort(compareDays).map(date => `${date.y}-${date.m}-${date.d}`).join(',');
      if (signature !== previous) { previous = signature; stillSince = Date.now(); }
      return Date.now() - stillSince >= Math.min(1000, WAIT.window / 4);
    }, 'the Custom view and its dated range to settle', WAIT.window);
    await pageReady('after the Custom view change');
  }
  if (!configuredPeriods.has(document)) await setPeriods();
  await pageReady('after the view change');
  configuredPeriods.add(document);
}
async function openPeriods() {
  await pageReady('before opening No. of Periods');
  const settings = [...document.querySelectorAll('button.fc-settings-button')].find(shown);
  if (!settings) throw new PageError('The ⋮ settings button was not found.');
  await click(settings);
  const item = await waitFor(() => [...document.querySelectorAll('.dropdown-menu a, .dropdown-menu button, .dropdown-menu li, .dropdown-item')]
    .find(node => shown(node) && sameText(text(node), 'No. of Periods')), '"No. of Periods" in the ⋮ menu');
  const before = new Set([...document.querySelectorAll('.modal, [role=dialog]')].filter(shown));
  await click(item);
  const dialog = await settled(await waitFor(() => [...document.querySelectorAll('.modal, [role=dialog]')].find(node => shown(node) && !before.has(node)), 'the No. of Periods window'));
  const select = dialog.querySelector('select');
  const input = select ? null : dialog.querySelector('input[type=number], input[type=text]');
  if (!select && !input) throw new PageError('The No. of Periods window has no list or box Snooze knows.');
  const current = String(select ? text(select.selectedOptions?.[0]) || select.value : input.value).trim();
  if (/^\d+$/.test(current)) recordRun({ type: 'periods', count: Number(current) });
  return { dialog, select, input, current };
}
async function waitPeriodsClosed(dialog) {
  await waitFor(() => !dialog.isConnected || !shown(dialog), 'the No. of Periods window to close', WAIT.window).catch(async error => {
    await closeWindow(dialog, 'No. of Periods').catch(closeError => { keepFlags(closeError, error); });
    throw error;
  });
}
async function waitPeriodsCalendar(value) {
  const expected = Number(value) * 3;
  let previous = null, stillSince = null;
  await waitFor(() => {
    const view = calendarView(), laidOut = document.body.getBoundingClientRect().width > 0;
    const weeks = new Set();
    for (const cell of view?.querySelectorAll('td.fc-day[data-date]') || []) {
      if (!onScreen(cell)) continue;
      const box = cell.getBoundingClientRect();
      if (laidOut && (!box.width || !box.height)) continue;
      const date = readIsoDay(cell.getAttribute('data-date'));
      if (!date) return false;
      const week = mondayOf(date);
      weeks.add(Date.UTC(week.y, week.m - 1, week.d));
    }
    const dates = [...weeks].sort((a, b) => a - b);
    if (!view?.matches(CUSTOM_VIEW) || dates.length !== expected || dates.some((date, i) => i && date - dates[i - 1] !== 7 * 86400000)) {
      previous = null; stillSince = null; return false;
    }
    const signature = dates.join(',');
    if (signature !== previous) { previous = signature; stillSince = Date.now(); }
    return Date.now() - stillSince >= Math.min(1000, WAIT.window / 4);
  }, 'the calendar to show the No. of Periods span', WAIT.window);
  await pageReady('after No. of Periods change');
}
async function setPeriods() {
  const { dialog, select, input, current } = await openPeriods();
  const buttonNamed = name => [...dialog.querySelectorAll('button')].find(b => shown(b) && sameText(text(b), name));
  if (current === PERIODS) {
    await closeWindow(dialog, 'No. of Periods');
  } else {
    if (select && select.nextElementSibling?.classList.contains('select2-container')) await chooseInSelect2(select, PERIODS, 'No. of Periods');
    else if (select) {
      const option = [...select.options].find(o => text(o) === PERIODS || o.value === PERIODS);
      if (!option) throw new PageError('No. of Periods offers no 14.');
      select.value = option.value;
      select.dispatchEvent(new select.ownerDocument.defaultView.Event('change', { bubbles: true }));
    } else await typeInto(input, PERIODS);
    const submit = buttonNamed('Submit') || buttonNamed('OK') || buttonNamed('Save') || buttonNamed('Apply');
    if (!submit) throw new PageError('The No. of Periods window has no Submit.');
    await click(submit);
  }
  await waitPeriodsClosed(dialog);
  await waitFor(isCustom, 'the Custom view after No. of Periods');
  if (current === PERIODS) return;
  let spanError;
  await waitPeriodsCalendar(PERIODS).catch(error => { if (stopFlagged(error)) throw error; spanError = error; });
  const check = await openPeriods();
  await closeWindow(check.dialog, 'No. of Periods');
  await waitPeriodsClosed(check.dialog);
  if (check.current !== PERIODS) throw new PageError(`No. of Periods did not change to 14 (it reads ${check.current || 'blank'}). Nothing was changed.`);
  if (spanError) throw spanError;
}
const MENU = 'ul.context-menu-list.context-menu-root';
const menuShown = () => [...document.querySelectorAll(MENU)].find(shown);
async function closeContextLayer() {
  const layers = () => [...document.querySelectorAll('#context-menu-layer')].filter(onScreen);
  if (!layers().length) return;
  for (const target of [...layers(), document]) target.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
  for (const layer of layers()) layer.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0 }));
  try { await waitFor(() => !layers().length, 'the right-click menu layer to close', 2000); }
  catch (error) { error.pageBlocked = true; throw error; }
}
const OWN_PANELS = '#snooze-panel-host';
async function throughOwnPanels(step) {
  const panels = [...document.querySelectorAll(OWN_PANELS)];
  const before = panels.map(panel => panel.style.pointerEvents);
  panels.forEach(panel => { panel.style.pointerEvents = 'none'; });
  try {
    return await step();
  } finally {
    panels.forEach((panel, i) => { panel.style.pointerEvents = before[i]; });
  }
}
function emptyPointIn(cell) {
  const box = cell.getBoundingClientRect();
  if (!box.width || !box.height || typeof document.elementFromPoint !== 'function') return null;
  for (const y of [box.bottom - 4, box.bottom - box.height / 4, box.top + box.height / 2]) {
    for (const x of [box.left + box.width / 2, box.left + 6, box.right - 6]) {
      if (document.elementFromPoint(Math.round(x), Math.round(y)) === cell) return { x, y };
    }
  }
  return null;
}
function entryPointIn(entry) {
  const box = entry.getBoundingClientRect();
  if (!box.width || !box.height || typeof document.elementFromPoint !== 'function') return null;
  for (const y of [box.top + box.height / 2, box.top + 4, box.bottom - 4]) {
    for (const x of [box.left + box.width / 2, box.left + 4, box.right - 4]) {
      if (document.elementFromPoint(Math.round(x), Math.round(y))?.closest('.fc-event') === entry) return { x, y };
    }
  }
  return null;
}
async function menuItem(spots, label, again = true, inspect = false) {
  await pageReady(`before right-clicking for ${label}`);
  const tried = [];
  let clicks = 0;
  for (const spot of spots) {
    if (spot.entry && label !== 'Find Assignments') throw new PageError('Only Find Assignments may use a client entry menu.');
    if (clicks >= 3) break;
    await closeContextLayer();
    spot.cell.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const laidOut = spot.cell.getBoundingClientRect().height > 0;
    const at = await throughOwnPanels(() => spot.entry ? entryPointIn(spot.cell) : emptyPointIn(spot.cell));
    if (laidOut && !at) continue;
    clicks += 1;
    const clicked = await throughOwnPanels(() => rightClick(spot.cell, at));
    if (spot.entry && clicked.closest('.fc-event') !== spot.cell) throw new PageError('Find Assignments could not prove the right-click landed on its client entry. Nothing was changed; By hand.');
    tried.push(describe(clicked));
    const menu = await waitFor(menuShown, 'the right-click menu', 3000).catch(error => { if (stopFlagged(error)) throw error; return null; });
    if (!menu) continue;
    const item = [...menu.querySelectorAll(':scope > li.context-menu-item')].find(li => shown(li) && sameText(text(li), label));
    if (!item && inspect && ['Find Assignments', 'Close Schedule'].some(known => [...menu.querySelectorAll(':scope > li.context-menu-item')].some(li => shown(li) && sameText(text(li), known)))) return false;
    if (!item) throw new PageError(`The right-click menu has no "${label}".`);
    if (inspect) {
      const enabled = !item.classList.contains('context-menu-disabled');
      return enabled;
    }
    if (item.classList.contains('context-menu-disabled')) throw new PageError(`"${label}" is greyed out in the right-click menu.`);
    await click(item);
    return tried;
  }
  if (again && !tried.length && busyCovers().length) {
    await pageReady(`a loading cover over the calendar, before ${label}`);
    return menuItem(spots, label, false, inspect);
  }
  const first = spots[0]?.cell;
  const box = first?.getBoundingClientRect();
  const onTop = box && typeof document.elementFromPoint === 'function' ? document.elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.bottom - 4)) : null;
  const open = [...document.querySelectorAll('.modal, [role=dialog]')].filter(shown).map(describe);
  throw new PageError(`No right-click menu appeared. Right-clicked: ${tried.join(' · ') || 'nothing'}. On top of the first day cell: ${describe(onTop)}${open.length ? `; windows open: ${open.join(', ')}` : ''}.`);
}
async function canAddAssignment(from = null, { exact = false, weekly = false, dayOnly = false } = {}) {
  try {
    if (weekly && emptySpots().some(({ cell }) => {
      const day = readIsoDay(cell.getAttribute('data-date'));
      return !day || new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay() !== 1;
    })) throw new PageError('The calendar does not expose readable weekly cells. Nothing was changed; By hand.');
    let spots = from ? emptySpots().map(spot => ({ ...spot, day: readIsoDay(spot.cell.getAttribute('data-date')) }))
      .filter(spot => spot.day && (exact ? sameDay(spot.day, from) : weekly ? compareDays(from, spot.day) >= 0 && compareDays(from, spot.day) < 7 * 86400000 : compareDays(spot.day, from) >= 0 && (sameDay(spot.day, from) || ![0, 6].includes(new Date(Date.UTC(spot.day.y, spot.day.m - 1, spot.day.d)).getUTCDay()))))
      .sort((a, b) => compareDays(a.day, b.day)) : emptySpots();
    if (dayOnly && from) {
      const dated = emptySpots().map(spot => ({ ...spot, day: readIsoDay(spot.cell.getAttribute('data-date')) }));
      const target = dated.filter(spot => spot.day && sameDay(spot.day, from));
      const weekCells = dated.length > 0 && dated.every(spot => spot.day && sameDay(spot.day, mondayOf(spot.day)));
      spots = target.length ? target : weekCells ? dated.filter(spot => sameDay(spot.day, mondayOf(from))) : [];
    }
    if (!spots.length) throw Object.assign(new PageError(`No readable empty day cell on or after ${usDate(from)} to check New Assignment. Nothing was changed; By hand.`), { dayCellUnavailable: true });
    return await menuItem(spots, 'New Assignment', true, true);
  } finally {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await click(document.body);
    await closeContextLayer();
    try { await waitFor(() => !menuShown(), 'the right-click menu to close', 2000); }
    catch (error) { error.pageBlocked = true; throw error; }
  }
}
function scheduleFacts() {
  const names = shownNames(document);
  nameFrom(names);
  const root = names[0]?.closest('.calendar-title');
  const labels = { Business: 'business', Practice: 'practice', 'Business Area': 'businessArea', 'Term Date': 'termDate', Region: 'region', 'Resource Manager': 'resourceManager', 'Resource Manager Email': 'resourceManagerEmail' };
  const facts = {};
  for (const dt of root?.querySelectorAll('dt') || []) {
    const key = labels[text(dt).replace(/:$/, '')];
    const dd = dt.nextElementSibling;
    if (!key || dd?.tagName !== 'DD' || !onScreen(dt) || !onScreen(dd)) continue;
    const value = text(dd);
    if (key in facts && facts[key] !== value) throw new PageError(`The schedule shows two different values for ${text(dt)}.`);
    facts[key] = value;
  }
  return facts;
}
function emptySpots() {
  const view = calendarView();
  if (!view) throw new PageError('No schedule is open.');
  const cells = [...view.querySelectorAll('td.fc-day')].filter(screenReader(document));
  if (!cells.length) throw new PageError('No day cells in the calendar: is it in Custom view?');
  const rank = cell => (cell.classList.contains('fc-today') || cell.classList.contains('fc-future') ? 0 : 2) + (cell.querySelector('.fc-event') ? 1 : 0);
  return cells.map((cell, index) => ({ cell, index })).sort((a, b) => rank(a.cell) - rank(b.cell) || a.index - b.index).map(({ cell }) => ({ cell }));
}
const EDIT_MODAL = '#editEventGridModal';
const COLUMNS = {
  date: 'column-start', hours: 'column-hours', jobCode: 'column-jobcode', assignCode: 'column-assigncodename',
  assignCode2: 'column-assigncodename2', client: 'column-clientname', wbs: 'column-engagement_name',
  billable: 'column-assignment_type_name', utilization: 'column-utilization_name', pricingId: /^column-cp\d*pricingid$/,
  professional: 'column-resourcename', notes: 'column-notesnumber',
};
const COLUMN_WORDS = { date: 'Date', hours: 'Hours', jobCode: 'Job Code', assignCode: 'Assign Code', assignCode2: 'Assign Code 2',
  client: 'Client', wbs: 'WBS', billable: 'Billable', utilization: 'Utilization Generating', pricingId: 'Pricing ID', professional: 'Professional', notes: 'Notes' };
async function findRoute() {
  const context = findContext?.document === document ? findContext : null;
  if (context) await waitForPersonIdentity(context.identity);
  const today = context?.today || todayOf();
  const termText = String(scheduleFacts().termDate ?? '').trim() || String(context?.termDate ?? '').trim();
  const term = termText ? termDayOf(termText) : null;
  if (termText && !term) throw new PageError('The Term Date cannot be read for Find Assignments. Nothing was read or changed; By hand.');
  return { today, greyed: !!term && !sameDay(term, { y: 9999, m: 12, d: 31 }) && compareDays(today, term) >= 0 };
}
const dnsFindAnchor = client => sameText(client, DNS_CLIENT);
const tileClient = entry => [...entry.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ').trim();
function currentWeekFindSpots(today) {
  const view = calendarView();
  const root = view?.closest('.staff-calendar-wrapper');
  const names = shownNames(document);
  if (!root || names.length !== 1 || !root.contains(names[0])) throw new PageError('Find Assignments has no proved Professional calendar. Nothing was changed; By hand.');
  const monday = mondayOf(today);
  const datedCells = [...view.querySelectorAll('td.fc-day[data-date]')].filter(shown);
  return [...root.querySelectorAll('.fc-event')].filter(isScheduleContent).filter(shown).filter(entry => {
    const cell = entry.closest('td.fc-day[data-date]');
    if (entry.closest('.fc') !== view.closest('.fc')) return false;
    if (entry.closest('.fc-view') && entry.closest('.fc-view') !== view) return false;
    const day = readIsoDay(entry.getAttribute('data-date') || cell?.getAttribute('data-date') || '');
    if (entry.hasAttribute('data-date') && cell && entry.getAttribute('data-date') !== cell.getAttribute('data-date')) return false;
    const clientText = tileClient(entry);
    return day && compareDays(day, monday) >= 0 && compareDays(day, addDays(monday, 6)) <= 0
      && datedCells.some(cell => {
        const date = readIsoDay(cell.getAttribute('data-date'));
        return date && sameDay(date, mondayOf(day));
      }) && (/^[^:]+:\s*\d+$/.test(clientText) || dnsFindAnchor(clientText));
  }).map(cell => ({ cell, entry: true }));
}
async function proveFindReopenAfter(removed) {
  const { greyed, today } = await findRoute();
  if (!greyed || !removed.length) return;
  const edit = await findAssignments({ start: mondayOf(today), end: addDays(mondayOf(today), 6) });
  let retained;
  try {
    const datedDns = currentWeekFindSpots(today).some(spot => dnsFindAnchor(tileClient(spot.cell)));
    retained = (await readEditTable(edit)).some(row => (/:\s*\d+\b/.test(row.client) || dnsFindAnchor(row.client) && datedDns)
      && !removed.some(old => old.id === row.id || old.date === row.date && sameText(old.client, row.client) && sameText(old.wbs, row.wbs)));
  } finally { await closeEdit(edit); }
  if (!retained) throw new PageError('Find Assignments would lose its current-week client entry or DNS entry after this change. Nothing was changed; By hand.');
}
function findClientsLabel(form) {
  const labels = ['Clients', 'Client'].filter(name => [...form.querySelectorAll('label')].some(node => sameText(text(node).replace(/[*?]/g, ''), name)));
  if (labels.length > 1) { recordRun({ type: 'miss', name: 'Clients' }); throw new PageError('The form has fields labelled both "Client" and "Clients".'); }
  return labels[0] || 'Clients';
}
const assignmentRanges = new WeakMap();
const findAssignmentsRange = edit => assignmentRanges.get(edit) || null;
function findDateBox(form, edge) {
  const labels = [`${edge} Date`, `${edge} Week`];
  const matches = [...form.querySelectorAll('label')].filter(node => labels.some(label => sameText(text(node).replace(/[*?]/g, ''), label)));
  if (matches.length !== 1) throw new PageError(`The form has ${matches.length || 'no'} fields labelled "${labels[0]}" or "${labels[1]}".`);
  return fieldByLabel(form, text(matches[0]).replace(/[*?]/g, '').trim());
}
async function findAssignments({ start, end = null, future = false, clients = null, weekEndFriday = false }) {
  await guardReady();
  if (findContext?.document === document) await waitForPersonIdentity(findContext.identity);
  const identity = personIdentity();
  return withPersonGuard(probe => checkPersonIdentity(identity, 'identity check', probe), async () => {
    const tax = isTaxPage();
    const before = new Set(document.querySelectorAll('#FindAssignmentsModal'));
    try { return await findAssignmentsRecorded({ start, end, future, clients, weekEndFriday }); }
    catch (error) {
      if (!tax && !stopFlagged(error)) {
        for (const modal of [...document.querySelectorAll('#FindAssignmentsModal')].filter(node => !before.has(node) && shown(node))) {
          await cleanupAfter(error, () => closeWindow(modal, 'the Find Assignments window'));
        }
      }
      throw error;
    }
  });
}
async function findAssignmentsRecorded({ start, end, future, clients, weekEndFriday }) {
  let stepStarted = Date.now();
  const measured = name => { recordRun({ type: 'findStep', name, seconds: (Date.now() - stepStarted) / 1000 }); stepStarted = Date.now(); };
  const { greyed, today } = await findRoute();
  let spots = greyed ? currentWeekFindSpots(today) : emptySpots();
  if (greyed) {
    const clients = spots.filter(spot => !dnsFindAnchor(tileClient(spot.cell)));
    if (clients.length) spots = clients;
  }
  if (!spots.length) throw new PageError('Find Assignments has no proved client entry or DNS entry in the current week. Nothing was read or changed; By hand.');
  await menuItem(spots, 'Find Assignments');
  if (isTaxPage()) {
    const edit = await findTaxAssignments({ start, end, future, clients });
    await editTableReady(edit);
    return edit;
  }
  const modal = await settled(await waitFor(() => [...document.querySelectorAll('#FindAssignmentsModal')].find(shown), 'the Find Assignments window', WAIT.window));
  const form = modal.querySelector('#FindMultipleEventsForm_Form, #FindMultipleEventsWeeklyForm_Form') || modal;
  const clientsLabel = findClientsLabel(form);
  const weekBoxes = [...form.querySelectorAll('label')].some(node => sameText(text(node).replace(/[*?]/g, ''), 'Start Week'));
  recordRun({ type: 'findBoxes', boxType: weekBoxes ? 'Week' : 'Date' });
  if (weekBoxes && weekEndFriday && end && compareDays(end, addDays(mondayOf(end), 4)) > 0) end = addDays(mondayOf(end), 4);
  measured('open');
  if (greyed) {
    const from = termDayOf(findDateBox(form, 'Start').value.trim());
    const to = termDayOf(findDateBox(form, 'End').value.trim());
    const selected = [...fieldByLabel(form, clientsLabel).selectedOptions].filter(option => option.value);
    if (!from || !to || !sameDay(mondayOf(from), mondayOf(today)) || !sameDay(mondayOf(to), mondayOf(today))
        || compareDays(to, from) < 0 || selected.length !== 1 || !(/^[^:]+:\s*\d+$/.test(text(selected[0])) || dnsFindAnchor(text(selected[0])))) {
      throw new PageError('Find Assignments did not prove its current-week client entry or DNS entry prefill. Nothing was read or changed; By hand.');
    }
  }
  const allClients = fieldByLabel(form, 'Include All Clients');
  if (greyed) await setChecked(allClients, true);
  if (clients) {
    await setChecked(allClients, false);
    const select = fieldByLabel(form, clientsLabel);
    for (const option of select.options) option.selected = false;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    for (const client of clients) await chooseInSelect2(select, client, clientsLabel);
  } else {
    await setChecked(allClients, true);
  }
  const pricing = fieldByLabel(form, 'Pricing ID');
  if (pricing.tagName !== 'SELECT') throw new PageError('Find Assignments Pricing ID is not a readable filter. Nothing was read or changed.');
  for (const option of pricing.options) option.selected = false;
  pricing.value = '';
  pricing.dispatchEvent(new window.Event('change', { bubbles: true }));
  const startBox = findDateBox(form, 'Start');
  await typeInto(startBox, usDate(start));
  const futureBox = fieldByLabel(form, 'Include All Future Assignments');
  await setChecked(futureBox, future);
  const endBox = findDateBox(form, 'End');
  if (!future) await typeInto(endBox, end ? usDate(end) : '');
  measured('filters');
  await pageReady('after setting Find Assignments filters');
  measured('settle');
  const from = termDayOf(startBox.value.trim()), to = termDayOf(endBox.value.trim());
  const startKept = future ? startBox.value.trim() === usDate(start) || weekBoxes && from && sameDay(from, mondayOf(start))
    : from && (sameDay(from, start) || sameDay(from, mondayOf(start)));
  const endKept = future || (end ? to && compareDays(to, end) >= 0 && sameDay(mondayOf(to), mondayOf(end)) : endBox.value.trim() === '');
  const controls = [['Include All Future Assignments', futureBox], ['Include All Clients', allClients], ['Pricing ID', pricing]];
  const dateBoxes = [startBox, endBox];
  if (!form.isConnected || controls.some(([label, node]) => !node.isConnected || !form.contains(node) || fieldByLabel(form, label) !== node)
      || dateBoxes.some(node => !node.isConnected || !form.contains(node)) || findDateBox(form, 'Start') !== startBox || findDateBox(form, 'End') !== endBox
      || !startKept || futureBox.checked !== future || !endKept) {
    throw new PageError('Find Assignments did not keep the dates Snooze typed. Nothing was read or changed.');
  }
  const chosen = [...fieldByLabel(form, clientsLabel).selectedOptions].filter(option => option.value).map(text);
  const wbs = fieldByLabel(form, 'WBS');
  const pricingRendered = pricing.nextElementSibling?.querySelector('.select2-selection__rendered');
  const pricingChip = pricing.nextElementSibling?.querySelector('.select2-selection__choice');
  const pricingText = pricingRendered && !pricingRendered.querySelector('.select2-selection__placeholder') ? text(pricingRendered) : '';
  if (allClients.checked !== !clients || clients && (chosen.length !== clients.length || clients.some(client => !chosen.some(value => sameText(value, client))))
      || clients && [...wbs.selectedOptions].some(option => option.value)
      || [...pricing.selectedOptions].some(option => option.value) || pricingChip || pricingText) {
    throw new PageError('Find Assignments did not keep the requested Clients and Pricing ID filters. Nothing was read or changed.');
  }
  const submit = [...modal.querySelectorAll('button')].find(button => sameText(text(button), 'Submit'));
  if (!submit) throw new PageError('Find Assignments has no Submit button.');
  await click(submit);
  measured('submit');
  const edit = await waitFor(() => {
    const found = [...document.querySelectorAll(EDIT_MODAL)].find(shown);
    return found && found.querySelector('table#editGrid tbody tr') ? found : null;
  }, 'the Edit Assignment table', WAIT.window);
  await settled(edit);
  await waitFor(() => !modal.isConnected || !shown(modal), 'Find Assignments to close');
  await editTableReady(edit);
  measured('table');
  assignmentRanges.set(edit, { start: from, end: future ? null : to, weekBoxes, future, clients, requestedStart: start });
  return edit;
}
async function editTableReady(edit) {
  let quietSince = Date.now();
  const observer = new edit.ownerDocument.defaultView.MutationObserver(() => { quietSince = Date.now(); });
  observer.observe(edit, { childList: true, subtree: true, characterData: true, attributes: true });
  try {
    await waitFor(() => {
      if (!shown(edit)) throw new PageError('The Edit Assignment window closed before its table finished loading.');
      const processing = [...edit.querySelectorAll('.dataTables_processing, .dt-processing, #editGrid_processing')].some(shown);
      if (processing || !edit.querySelector('table#editGrid tbody tr')) quietSince = Date.now();
      return !processing && Boolean(edit.querySelector('table#editGrid tbody tr')) && Date.now() - quietSince >= WAIT.quiet;
    }, 'the Edit Assignment table to finish loading', WAIT.window);
  } finally {
    observer.disconnect();
  }
}
const cellOf = (row, column) => (column instanceof RegExp
  ? [...row.querySelectorAll(':scope > td')].find(td => [...td.classList].some(c => column.test(c)))
  : row.querySelector(`td.${column}`)) || null;
const columnsOf = row => [...row.querySelectorAll(':scope > td')].map(td => [...td.classList].find(c => c.startsWith('column')) || '(none)').join(', ');
const numberOf = value => {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return NaN;
  const number = Number(raw);
  return Number.isFinite(number) ? number : NaN;
};
function readEditTableRecorded(edit) {
  const table = edit.querySelector('table#editGrid');
  const pager = edit.querySelector('.dataTables_paginate');
  if (pager && [...pager.querySelectorAll('a, button, li')].some(node => /^\d+$/.test(text(node)) && text(node) !== '1')) {
    throw new PageError('The Edit Assignment table has more than one page; Snooze cannot copy it whole yet.');
  }
  if (!table) throw new PageError('The Edit Assignment grid is missing. Nothing was read or changed.');
  const rows = [...table.querySelectorAll('tbody tr')];
  if (!rows.length) throw new PageError('The Edit Assignment grid has no proved rows or empty result. Nothing was read or changed.');
  const empty = rows.length === 1 && rows[0].querySelector('td.dataTables_empty');
  const range = assignmentRanges.get(edit);
  const total = dataTableRowCount(table) ?? (range?.future ? displayedTableRowCount(edit) : null);
  if (range?.future && total === null) throw futureReadRefusal('The future assignment table has no readable total row count.');
  if (total !== null && total !== (empty ? 0 : rows.length)) {
    throw new PageError(`The Edit Assignment table shows ${empty ? 0 : rows.length} of its ${total} rows; Snooze cannot copy it whole.`);
  }
  const professional = currentPerson().split('(')[0].trim();
  const readRows = empty ? [] : rows.map((row, index) => {
    const tax = isTaxPage();
    const required = new Set(['date', 'hours', 'jobCode', 'client', 'wbs', 'notes']);
    const read = Object.fromEntries(Object.entries(COLUMNS).map(([field, column]) => {
      if (tax && !required.has(field)) return [field, field === 'professional' ? professional : ''];
      const cell = cellOf(row, column);
      if (!cell) { recordRun({ type: 'miss', name: column instanceof RegExp ? 'td.column-cp#pricingid' : `td.${column}` }); throw new PageError(`Row ${index + 1} of the Edit Assignment table has no ${COLUMN_WORDS[field]} cell. Its cells: ${columnsOf(row)}.`); }
      const input = tax && field === 'hours' ? [...cell.querySelectorAll('input')].filter(shown) : [];
      if (input.length > 1) throw new PageError('Tax Hours has more than one edit box. Nothing was read or changed.');
      return [field, input.length ? input[0].value : text(cell)];
    }));
    const notes = (read.notes.match(/\((\d+)\)/) || [])[1];
    const hours = numberOf(read.hours);
    if (!read.date || !Number.isFinite(hours) || notes === undefined) throw new PageError(`Row ${index + 1} of the Edit Assignment table could not be read.`);
    if (!read.professional || !sameText(read.professional, professional)) throw new PageError(`Row ${index + 1} of the Edit Assignment table has a different or empty Professional. Nothing was changed.`);
    return { id: row.getAttribute('data-id') || '', ...read, hours, notes: Number(notes) };
  });
  if (range?.future && !isTaxPage()) {
    if (range.weekBoxes && readRows.some(row => {
      if (row.hours > 8) return true;
      const day = termDayOf(row.date);
      return row.hours > 0 && day && sameDay(day, mondayOf(day)) && compareDays(day, range.requestedStart) < 0
        && !readRows.some(other => {
          const date = termDayOf(other.date);
          return date && compareDays(date, day) > 0 && sameDay(mondayOf(date), day) && sameText(row.client, other.client) && sameText(row.wbs, other.wbs);
        });
    })) throw futureReadRefusal('A Weekly assignment does not prove its daily hours or its share after the last working day.');
    proveCalendarRows(readRows, range);
  }
  return readRows;
}
function displayedTableRowCount(edit) {
  const info = [...edit.querySelectorAll('#editGrid_info, .dataTables_info, .dt-info')];
  if (info.length !== 1) return null;
  const match = text(info[0]).match(/^Showing ([\d,]+) to ([\d,]+) of ([\d,]+) entries$/i);
  if (!match) return null;
  const [from, to, total] = match.slice(1).map(value => Number(value.replace(/,/g, '')));
  return [from, to, total].every(Number.isSafeInteger) && from === (total ? 1 : 0) && to === total ? total : null;
}
function proveCalendarRows(rows, range) {
  for (const tile of tilesOnScreen()) {
    const cell = tile.closest('td.fc-day[data-date]');
    const day = readIsoDay(tile.getAttribute('data-date') || cell?.getAttribute('data-date') || '');
    if (!day || compareDays(day, range.start) < 0) continue;
    const client = tileClient(tile);
    if (range.clients && !range.clients.some(wanted => sameText(wanted, client))) continue;
    const matching = rows.filter(row => {
      const date = termDayOf(row.date);
      return date && sameText(row.client, client) && sameDay(mondayOf(date), mondayOf(day));
    });
    const hours = text(tile.querySelector('.field-value')).match(/^(\d+(?:\.\d+)?)h$/);
    if (!matching.length || hours && sameDay(day, mondayOf(day)) && matching.reduce((sum, row) => sum + row.hours, 0) + 0.001 < Number(hours[1])) {
      throw futureReadRefusal('The calendar shows an assignment missing from the future table.');
    }
  }
}
function dataTableRowCount(table) {
  const jq = table?.ownerDocument.defaultView.jQuery;
  if (typeof jq !== 'function' || typeof jq.fn?.dataTable?.isDataTable !== 'function') return null;
  const unreadable = () => new PageError('The Edit Assignment table row count could not be read. Nothing was changed.');
  let count;
  try {
    if (!jq.fn.dataTable.isDataTable(table)) return null;
    count = jq(table).DataTable().rows().count();
  } catch { throw unreadable(); }
  if (!Number.isInteger(count) || count < 0) throw unreadable();
  return count;
}
function buttonIn(root, label) {
  const found = [...root.querySelectorAll('button')].find(button => shown(button) && sameText(text(button), label));
  if (!found) throw new PageError(`No "${label}" button.`);
  return found;
}
async function closeEdit(edit) {
  return closeWindow(edit, 'the Edit Assignment window');
}
async function openRowNotes(edit, id) {
  await readEditTable(edit);
  const matching = [...edit.querySelectorAll('tbody tr[data-id]')].filter(node => node.getAttribute('data-id') === id);
  if (!id || matching.length !== 1) throw new PageError('The assignment ID does not identify a single readable assignment.');
  const row = matching[0];
  const links = row ? [...row.querySelectorAll('td.column-notesnumber a')].filter(shown) : [];
  if (links.length !== 1) throw new PageError('The assignment has no single readable View Notes link.');
  const before = new Set([...document.querySelectorAll('.bootbox.modal')]);
  await click(links[0]);
  const popup = await settled(await waitFor(() => {
    const opened = [...document.querySelectorAll('.bootbox.modal')].filter(node => !before.has(node) && shown(node));
    if (opened.length > 1) throw new PageError('More than one View Notes window opened; Snooze will not guess.');
    return opened[0] || null;
  }, 'the View Notes window', WAIT.window));
  const boxes = [...popup.querySelectorAll('textarea')].filter(shown);
  if (boxes.length !== 1 || !popup.querySelector('button.bootbox-cancel')) {
    await closeWindow(popup, 'the View Notes window');
    throw new PageError('The View Notes window does not have its one text box and Cancel.');
  }
  return { popup, box: boxes[0], text: boxes[0].value };
}
async function readRowNote(edit, id) {
  const note = await openRowNotes(edit, id);
  try { await guardReady(); return note.text; } finally { await closeWindow(note.popup, 'the View Notes window'); }
}
function openPerson(...args) { return timedRun("open person", () => openPersonRecorded(...args)); }
function readEditTable(...args) { retirePreflightForm(); return timedRun("read", () => guarded(() => readEditTableRecorded(...args))); }
__exports.SCHEDULE_PAGE_WORDS = SCHEDULE_PAGE_WORDS;
__exports.IDENTITY_PAUSE_WORDS = IDENTITY_PAUSE_WORDS;
__exports.schedulePageFacts = schedulePageFacts;
__exports.isSchedulePage = isSchedulePage;
__exports.requireSchedulePage = requireSchedulePage;
__exports.onScreen = onScreen;
__exports.isScheduleContent = isScheduleContent;
__exports.tilesOnScreen = tilesOnScreen;
__exports.calendarView = calendarView;
__exports.pageReady = pageReady;
__exports.currentPerson = currentPerson;
__exports.personIdentity = personIdentity;
__exports.checkPersonIdentity = checkPersonIdentity;
__exports.requirePersonIdentity = requirePersonIdentity;
__exports.waitForPersonIdentity = waitForPersonIdentity;
__exports.beginScheduleTurn = beginScheduleTurn;
__exports.pageCalm = pageCalm;
__exports.searchPageReady = searchPageReady;
__exports.resumePageReady = resumePageReady;
__exports.personEntityId = personEntityId;
__exports.personIdCheck = personIdCheck;
__exports.setupView = setupView;
__exports.openPeriods = openPeriods;
__exports.waitPeriodsClosed = waitPeriodsClosed;
__exports.waitPeriodsCalendar = waitPeriodsCalendar;
__exports.closeContextLayer = closeContextLayer;
__exports.menuItem = menuItem;
__exports.canAddAssignment = canAddAssignment;
__exports.scheduleFacts = scheduleFacts;
__exports.emptySpots = emptySpots;
__exports.proveFindReopenAfter = proveFindReopenAfter;
__exports.findAssignmentsRange = findAssignmentsRange;
__exports.findAssignments = findAssignments;
__exports.buttonIn = buttonIn;
__exports.closeEdit = closeEdit;
__exports.openRowNotes = openRowNotes;
__exports.readRowNote = readRowNote;
__exports.openPerson = openPerson;
__exports.readEditTable = readEditTable;
},
"mysource/editability.js": function (__require, __exports, document, window) {
'use strict';
const { addDays, compareDays, readIsoDay, todayOf, usDate, weekday } = __require("../rules/dates.js");
const { PageError } = __require("./dom.js");
const { canAddAssignment, emptySpots, personIdentity, waitForPersonIdentity: requirePersonIdentity } = __require("./schedule.js");
const { showDate, calendarHolds } = __require("./calendar.js");
function createEditability({ today = todayOf(), term = null, identity = personIdentity(), move = showDate } = {}) {
  let reading = null;
  const cells = async () => {
    await requirePersonIdentity(identity);
    const spots = emptySpots();
    const mapped = spots.map(({ cell }) => ({ cell, day: readIsoDay(cell.getAttribute('data-date')) }));
    if (mapped.some(row => !row.day)) throw new PageError('The calendar has an unreadable date cell. Nothing was changed; By hand.');
    return [...new Map(mapped.map(row => [usDate(row.day), row])).values()].sort((a, b) => compareDays(a.day, b.day));
  };
  const holds = (rows, day, weekly) => rows.length && compareDays(day, rows[0].day) >= 0
    && compareDays(day, addDays(rows.at(-1).day, weekly ? 6 : 0)) <= 0;
  async function view(day) {
    let rows = await cells();
    let weekly = rows.length > 1 && rows.every(row => weekday(row.day) === 1);
    if (!holds(rows, day, weekly)) {
      await move(day);
      rows = await cells();
      weekly = rows.length > 1 && rows.every(row => weekday(row.day) === 1);
      if (!holds(rows, day, weekly)) throw new PageError('The calendar did not show the requested permission date. Nothing was changed; By hand.');
    }
    const sameView = reading && reading.sourceRows.length === rows.length && reading.sourceRows.every((row, i) => row.cell === rows[i].cell);
    if (sameView) return reading;
    const sourceRows = rows;
    rows = rows.filter(row => compareDays(addDays(row.day, weekly ? 6 : 0), today) >= 0);
    if (!rows.length) throw new PageError('No current or future calendar cells to check. Nothing was changed; By hand.');
    const inspected = new Map();
    const inspect = async index => {
      await requirePersonIdentity(identity);
      if (!inspected.has(index)) inspected.set(index, await canAddAssignment(rows[index].day, { exact: true }));
      await requirePersonIdentity(identity);
      return inspected.get(index);
    };
    let enabledThrough = rows.length - 1;
    if (!(await inspect(enabledThrough))) {
      let locked = enabledThrough, enabled = -1;
      for (let at = Math.max(0, locked - 5); ; at = Math.max(0, at - 5)) {
        if (await inspect(at)) { enabled = at; break; }
        locked = at;
        if (!at) break;
      }
      if (enabled >= 0) {
        while (enabled + 2 < locked) {
          if (await inspect(enabled + 2)) enabled += 2;
          else { locked = enabled + 2; break; }
        }
        if (enabled + 1 < locked && await inspect(enabled + 1)) enabled++;
      }
      enabledThrough = enabled;
    }
    reading = { sourceRows, rows, weekly, enabledThrough };
    return reading;
  }
  return {
    async through(end, start = today) {
      await requirePersonIdentity(identity);
      const limit = term && compareDays(term, end) < 0 ? term : end;
      if (compareDays(limit, today) < 0 || compareDays(limit, start) < 0) return null;
      let info = await view(start);
      let provedThrough = null;
      for (;;) {
        if (info.enabledThrough < 0) return provedThrough;
        const last = addDays(info.rows[info.enabledThrough].day, info.weekly ? 6 : 0);
        if (compareDays(last, start) < 0) return null;
        if (compareDays(last, limit) >= 0) return limit;
        if (info.enabledThrough < info.rows.length - 1) return last;
        provedThrough = last;
        info = await view(addDays(last, 1));
      }
    },
    async enabled(day, { probeAfterTerm = false } = {}) {
      await requirePersonIdentity(identity);
      if (compareDays(day, today) < 0) return false;
      if (term && compareDays(day, term) > 0) {
        if (!probeAfterTerm) return false;
        if (!calendarHolds(day)) await move(day);
        const enabled = await canAddAssignment(day, { dayOnly: true });
        await requirePersonIdentity(identity);
        return enabled;
      }
      const info = await view(day);
      return info.enabledThrough >= 0 && compareDays(day, addDays(info.rows[info.enabledThrough].day, info.weekly ? 6 : 0)) <= 0;
    },
  };
}
__exports.createEditability = createEditability;
},
"mysource/pageinfo.js": function (__require, __exports, document, window) {
'use strict';
const { shown } = __require("./dom.js");
const { isScheduleContent } = __require("./schedule.js");
const { PAGE_LIBRARIES, PAGE_SELECTORS } = __require("../core/run-records.js");
const { notePictureInfo } = __require("../files/note-picture-info.js");
const infoTry = (read, fallback = 'not found') => { try { return read(); } catch { return fallback; } };
const infoVersion = value => /^\d+(?:\.\d+)*(?:[-+][\w.-]+)?$/.test(String(value ?? '')) ? String(value) : 'not found';
function safePageInfo(version) {
  const lines = ['Page information (no values)'];
  const jq = infoTry(() => window.jQuery, null);
  const fn = infoTry(() => jq?.fn, null);
  const libraries = {
    jQuery: () => jq, Select2: () => fn?.select2,
    FullCalendar: () => infoTry(() => window.FullCalendar, null) || infoTry(() => document.querySelectorAll('.fc')[0], null),
    DataTables: () => fn?.dataTable, daterangepicker: () => fn?.daterangepicker || window.daterangepicker,
    bootbox: () => window.bootbox, 'window.moment': () => window.moment,
  };
  const versions = { jQuery: () => fn?.jquery, DataTables: () => fn?.dataTable?.version, 'window.moment': () => window.moment?.version };
  for (const name of PAGE_LIBRARIES) {
    const present = infoTry(libraries[name], null) ? 'present' : 'not found';
    const version = versions[name] ? infoTry(() => infoVersion(versions[name]())) : '';
    lines.push(`${name}: ${present}${/^\d+(?:\.\d+)*$/.test(version) ? `; version: ${version}` : ''}`);
  }
  for (const selector of PAGE_SELECTORS) {
    try { const nodes = [...document.querySelectorAll(selector)].filter(isScheduleContent); lines.push(`${selector}: ${nodes.length}; shown: ${nodes.filter(shown).length}`); }
    catch { lines.push(`${selector}: could not read`); }
  }
  lines.push(`Note picture tooltip: ${notePictureInfo.selector}; week: ${notePictureInfo.week}`);
  return lines.join('\n');
}
__exports.safePageInfo = safePageInfo;
},
"mysource/dates-box.js": function (__require, __exports, document, window) {
'use strict';
const { compareDays, sameDay, readIsoDay, dayFromParts, usDate, workingDays, workdayCount } = __require("../rules/dates.js");
const { PageError, WAIT, waitFor, stopFlagged, text, typeInto } = __require("./dom.js");
const US = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
const readUsText = value => [...String(value || '').matchAll(US)].map(m => dayFromParts(m[3], m[1], m[2]));
const readAnyDay = value => {
  const v = String(value || '').trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return readIsoDay(`${iso[1]}-${iso[2]}-${iso[3]}`);
  return readUsText(v)[0] || null;
};
const workingRange = (start, end) => {
  const days = workingDays(start, end);
  return days.length ? [days[0], days[days.length - 1]] : [start, end];
};
function parts(form) {
  const range = form.querySelector('.shift-date-picker');
  if (!range) throw new PageError('Add Assignment has no Dates box.');
  return {
    range,
    row: range.closest('.dynamic-form-row, .form-group, .row') || range.parentElement,
    startBox: range.querySelector('input[id$="-start"]'),
    endBox: range.querySelector('input[id$="-end"]'),
    shownBox: range.querySelector('input.shift-date-picker-dates') || range.querySelector('input:not([type=hidden]):not([id$="-start"]):not([id$="-end"])'),
  };
}
const pickerOf = box => {
  const jq = box && box.ownerDocument.defaultView.jQuery;
  if (typeof jq !== 'function') return null;
  const wrapped = jq(box);
  if (typeof wrapped.data !== 'function') return null;
  const bootstrap = wrapped.data('datepicker');
  if (bootstrap && typeof bootstrap === 'object' && ['getDates', 'setDates', 'update'].some(key => typeof bootstrap[key] === 'function')) return { jq, picker: bootstrap, kind: 'bootstrap' };
  const picker = wrapped.data('daterangepicker');
  return picker ? { jq, picker, kind: 'range' } : null;
};
const localDate = day => new Date(day.y, day.m - 1, day.d);
const dateDay = date => date && typeof date.getFullYear === 'function' && Number.isFinite(date.getTime())
  ? dayFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate()) : null;
const rangeInputs = picker => Array.from(picker.inputs || []);
const isRange = picker => rangeInputs(picker).length === 2 || picker.pickers?.length === 2;
const isMultidate = picker => picker.o?.multidate === true || (typeof picker.o?.multidate === 'number' && picker.o.multidate >= 2);
const subPickers = found => {
  const inputs = rangeInputs(found.picker);
  return inputs.length === 2 ? inputs.map(input => found.jq(input).data('datepicker')) : Array.from(found.picker.pickers || []);
};
const bootstrapDays = found => {
  try {
    const dates = !isMultidate(found.picker) && isRange(found.picker) ? subPickers(found).map(picker => {
      const held = picker?.getDates?.();
      return held?.length === 1 ? held[0] : null;
    }) : found.picker.getDates?.();
    return Array.from(dates || []).map(dateDay);
  } catch { return []; }
};
function proveAllowedDates(form, required, onBounds = () => {}) {
  const { shownBox } = parts(form);
  const found = pickerOf(shownBox);
  const jq = shownBox?.ownerDocument.defaultView.jQuery;
  const boundsPicker = typeof jq === 'function' ? jq(shownBox).data?.('datepicker') : null;
  const picker = found?.picker;
  const options = boundsPicker?.o || picker;
  const bound = (value, unlimited) => value === unlimited ? unlimited
    : value instanceof Date ? dayFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
      : readAnyDay(value?.format?.('MM/DD/YYYY') ?? value);
  const range = found?.kind === 'range';
  const lowValue = range ? options?.minDate : options?.startDate;
  const highValue = range ? options?.maxDate : options?.endDate;
  const low = bound(range && lowValue === false ? -Infinity : lowValue, -Infinity);
  const high = bound(range && highValue === false ? Infinity : highValue, Infinity);
  if (!low || !high || low !== -Infinity && high !== Infinity && compareDays(low, high) > 0) {
    throw new PageError('The website\u2019s allowed dates could not be read. Nothing was changed; By hand.');
  }
  onBounds({ low: low === -Infinity ? null : low, high: high === Infinity ? null : high, disabledWeekdays: Array.isArray(options.daysOfWeekDisabled) ? options.daysOfWeekDisabled.length : null, disabledDates: Array.isArray(options.datesDisabled) ? options.datesDisabled.length : null });
  for (const day of required) {
    if (!day || low !== -Infinity && compareDays(day, low) < 0 || high !== Infinity && compareDays(day, high) > 0) {
      throw new PageError('Required dates are outside the website\u2019s allowed range. Nothing was changed; By hand.');
    }
    const dow = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
    const disabled = options.daysOfWeekDisabled || [];
    const dates = options.datesDisabled || [];
    if (!Array.isArray(disabled) || disabled.some(dow => !Number.isInteger(dow) || dow < 0 || dow > 6)
      || !Array.isArray(dates) || dates.some(value => !bound(value))) throw new PageError('The website\u2019s allowed dates could not be read. Nothing was changed; By hand.');
    if (disabled.includes(dow) || dates.some(value => sameDay(bound(value), day))) throw new PageError('Required dates are disabled by the website. Nothing was changed; By hand.');
    if (typeof options.beforeShowDay === 'function') {
      const eligible = options.beforeShowDay(localDate(day));
      if (eligible === false || eligible?.enabled === false || Array.isArray(eligible) && eligible[0] === false) throw new PageError('Required dates are disabled by the website. Nothing was changed; By hand.');
    }
    if (found?.kind === 'range' && typeof picker.isInvalidDate === 'function') {
      const moment = shownBox.ownerDocument.defaultView.moment;
      if (typeof moment !== 'function') throw new PageError('The website\u2019s allowed dates could not be read. Nothing was changed; By hand.');
      if (picker.isInvalidDate(moment(usDate(day), 'MM/DD/YYYY'))) throw new PageError('Required dates are disabled by the website. Nothing was changed; By hand.');
    }
  }
  return { exact: found?.kind === 'bootstrap' && isMultidate(picker) && typeof picker.setDates === 'function' && typeof picker.getDates === 'function' };
}
function proveDateSet(form, dates, hoursPerDay = null, pending = false) {
  const d = readDates(form, hoursPerDay);
  const expected = dates.map(usDate), held = d.multidateDays?.map(usDate);
  const first = dates[0], last = dates.at(-1);
  if (!dates.length || new Set(expected).size !== dates.length || !held || held.length !== dates.length
    || new Set(held).size !== dates.length || !expected.every(date => held.includes(date))
    || d.days !== dates.length || d.totalHours === null || hoursPerDay !== null && Math.abs(d.totalHours - dates.length * hoursPerDay) > 0.001
    || !sameDay(d.shown?.start, first) || !sameDay(d.shown?.end, last)
    || !sameDay(d.boxes.start, first) || !sameDay(d.boxes.end, last)) {
    if (pending) return null;
    throw new PageError('The Add Assignment picker does not prove exactly the required dates, Days and Total Hours. Nothing was added.');
  }
  return d;
}
async function pollProof(proof) {
  try { return await waitFor(() => proof(true), 'the Add Assignment date proof', WAIT.proof); }
  catch (error) {
    if (!error.timeout || stopFlagged(error)) throw error;
    proof(false);
    throw error;
  }
}
const waitForDates = (form, start, end, hours = null) => pollProof(pending => proveDates(form, start, end, hours, pending));
const waitForDateSet = (form, dates, hours = null) => pollProof(pending => proveDateSet(form, dates, hours, pending));
async function setDateSet(form, dates, hoursPerDay = null) {
  const { shownBox } = parts(form);
  if (!proveAllowedDates(form, dates).exact) throw new PageError('The picker cannot prove separate dates. Nothing was added.');
  const found = pickerOf(shownBox);
  if (typeof found.picker.clearDates === 'function') found.picker.clearDates();
  found.jq(shownBox).datepicker('setDates', dates.map(localDate));
  return waitForDateSet(form, dates, hoursPerDay);
}
async function setDates(form, start, end) {
  [start, end] = workingRange(start, end);
  let pickerError = '';
  let pickerEvidence = null;
  const { endBox, shownBox } = parts(form);
  const found = pickerOf(shownBox);
  const hoursBox = form.querySelector('.js-daily-override');
  const hours = hoursBox?.value.trim() && Number.isFinite(Number(hoursBox.value)) ? Number(hoursBox.value) : null;
  if (found) {
    try {
      if (found.kind === 'bootstrap') {
        if (isMultidate(found.picker)) {
          if (typeof found.picker.clearDates === 'function') found.picker.clearDates();
          found.jq(shownBox).datepicker('setDates', workingDays(start, end).map(localDate));
        } else if (isRange(found.picker)) {
          const inputs = rangeInputs(found.picker);
          const pickers = subPickers(found);
          for (let i = 0; i < 2; i++) {
            const input = inputs[i] || pickers[i]?.element?.[0];
            if (!input || !found.jq(input).data('datepicker')) throw new PageError('The Dates range has no picker Snooze can set.');
            found.jq(input).datepicker('setDate', localDate(i === 0 ? start : end));
          }
        } else {
          found.jq(shownBox).datepicker('setDate', localDate(start));
          if (endBox) await typeInto(endBox, usDate(end));
        }
      } else {
        found.picker.setStartDate(usDate(start));
        found.picker.setEndDate(usDate(end));
        found.jq(shownBox).trigger('apply.daterangepicker', [found.picker]);
      }
      await waitForDates(form, start, end, hours);
      return 'set through the page’s date picker';
    } catch (error) {
      if (stopFlagged(error) || error instanceof PageError && !error.dateDiagnostics && !error.timeout) throw error;
      pickerError = error?.message || 'the picker did not take the dates';
      pickerEvidence = error?.dateDiagnostics || null;
    }
  }
  if (shownBox) {
    const join = (String(shownBox.value).match(/\d{1,2}\/\d{1,2}\/\d{4}(\s*[^\d\s]+\s*|\s+)\d{1,2}\/\d{1,2}\/\d{4}/) || [])[1] || ' to ';
    await typeInto(shownBox, `${usDate(start)}${join}${usDate(end)}`);
  } else {
    throw new PageError('The Dates box has no box Snooze can set.');
  }
  try { await waitForDates(form, start, end, hours); }
  catch (error) {
    error.datesMethod = 'typed into the shown box';
    if (pickerEvidence) error.pickerDateDiagnostics = pickerEvidence;
    if (pickerError) error.message = `${error.message} (The page’s date picker was tried first: ${pickerError})`;
    throw error;
  }
  return 'typed into the shown box';
}
function readDates(form, hoursPerDay = null) {
  const { row, startBox, endBox, shownBox } = parts(form);
  const found = pickerOf(shownBox);
  const shown = readUsText(shownBox?.value);
  const held = found?.kind === 'bootstrap' ? bootstrapDays(found) : [];
  const multidateDays = found?.kind === 'bootstrap' && isMultidate(found.picker) ? held : null;
  const singleDatePicker = found?.kind === 'bootstrap' && !isMultidate(found.picker) && !isRange(found.picker) && held.length === 1;
  const rowText = text(row);
  const days = (rowText.match(/Days\s*:?\s*(\d+)/i) || [])[1];
  const total = (rowText.match(/Total\s*Hours\s*:?\s*([\d.]+)/i) || [])[1];
  return {
    picker: found?.kind === 'bootstrap' ? multidateDays !== null
      ? { start: held[0] || null, end: held[held.length - 1] || null }
      : { start: held.length <= 2 ? held[0] || null : null, end: held.length === 2 ? held[1] : null }
      : found ? { start: readAnyDay(found.picker.startDate?.format?.('MM/DD/YYYY')), end: readAnyDay(found.picker.endDate?.format?.('MM/DD/YYYY')) } : null,
    multidateDays,
    singleDatePicker,
    shown: multidateDays !== null && shown.length > 0 ? { start: shown[0], end: shown[shown.length - 1] }
      : shown.length === 2 ? { start: shown[0], end: shown[1] }
      : found?.kind === 'bootstrap' && shown.length === 1 ? { start: shown[0], end: readAnyDay(endBox?.value) }
        : shown.length > 2 ? { start: null, end: null } : null,
    boxes: { start: readAnyDay(startBox?.value), end: readAnyDay(endBox?.value) },
    days: days === undefined ? null : Number(days),
    totalHours: total === undefined ? null : Number(total),
    hoursPerDay,
  };
}
const describeDates = d => [
  d.picker ? `picker ${usDate(d.picker.start) || '?'}–${usDate(d.picker.end) || '?'}` : 'no picker found',
  d.shown ? `shown ${usDate(d.shown.start)}–${usDate(d.shown.end)}` : 'shown box unreadable',
  `boxes ${usDate(d.boxes.start) || '?'}–${usDate(d.boxes.end) || '?'}`,
  d.days === null ? 'no Days shown' : `Days ${d.days}`,
  d.totalHours === null ? 'no Total Hours shown' : `Total Hours ${d.totalHours}`,
].join(', ');
function proveDates(form, start, end, hoursPerDay = null, pending = false) {
  [start, end] = workingRange(start, end);
  const d = readDates(form, hoursPerDay);
  const problems = [];
  const check = (label, pair) => {
    if (pair && !(sameDay(pair.start, start) && sameDay(pair.end, end))) problems.push(label);
  };
  if (d.singleDatePicker) {
    if (!sameDay(d.picker.start, start)) problems.push('the picker');
  } else check('the picker', d.picker);
  check('the shown dates', d.shown);
  const endBox = parts(form).endBox;
  const singleBlankEnd = sameDay(start, end) && sameDay(d.boxes.start, start)
    && endBox && endBox.value.trim() === ''
    && d.multidateDays?.length === 1 && sameDay(d.multidateDays[0], start)
    && d.days === 1 && (hoursPerDay === null || d.totalHours !== null && Math.abs(d.totalHours - hoursPerDay) <= 0.001);
  if (!singleBlankEnd && (d.boxes.start || d.boxes.end || sameDay(start, end) && endBox && d.multidateDays !== null)) check('the start/end boxes', d.boxes);
  const expected = workingDays(start, end);
  const days = expected.length;
  if (d.multidateDays !== null) {
    const keys = d.multidateDays.map(usDate);
    const held = new Set(keys);
    if (keys.length !== days || held.size !== days || !expected.every(day => held.has(usDate(day)))) problems.push('the picker does not hold exactly the working days');
    if (d.days === null) problems.push('no Days shown to confirm the working days');
  }
  if (d.days !== null && d.days !== days) problems.push(`Days (${d.days}, not ${days})`);
  if (d.totalHours !== null && hoursPerDay !== null && Math.abs(d.totalHours - days * hoursPerDay) > 0.001) problems.push(`Total Hours (${d.totalHours}, not ${days * hoursPerDay})`);
  const matchingRange = pair => pair && sameDay(pair.start, start) && sameDay(pair.end, end);
  if (![d.picker, d.shown].some(matchingRange)) problems.push('no readable start and end in the picker or shown dates box confirm them');
  const confirmedByPage = matchingRange(d.picker) || d.days !== null && d.days === days;
  if (!confirmedByPage) problems.push('neither the page\u2019s picker nor its Days count confirms the dates');
  if (problems.length) {
    if (pending) return null;
    const error = new PageError(`The Dates in Add Assignment are not ${usDate(start)}–${usDate(end)}: ${problems.join('; ')}. The form holds: ${describeDates(d)}.`);
    const selected = d.multidateDays?.map(usDate);
    error.dateDiagnostics = {
      expected: { start, end, days, totalHours: hoursPerDay === null ? null : days * hoursPerDay },
      picker: d.picker, shown: d.shown, boxes: d.boxes,
      selected: selected ? { count: selected.length, unique: new Set(selected).size,
        missing: expected.filter(day => !selected.includes(usDate(day))).length,
        extra: selected.filter(day => !expected.some(wanted => usDate(wanted) === day)).length } : null,
      days: d.days, totalHours: d.totalHours,
    };
    throw error;
  }
  return d;
}
__exports.workdayCount = workdayCount;
__exports.proveAllowedDates = proveAllowedDates;
__exports.proveDateSet = proveDateSet;
__exports.waitForDates = waitForDates;
__exports.waitForDateSet = waitForDateSet;
__exports.setDateSet = setDateSet;
__exports.setDates = setDates;
__exports.readDates = readDates;
__exports.proveDates = proveDates;
},
"mysource/write.js": function (__require, __exports, document, window) {
'use strict';
const { stageNotes, stageTaxHours, stageRemoval, sameAssignmentRows } = __require("./note-stage.js");
const { isTaxPage } = __require("./site.js");
const { timedRun, recordRun } = __require("../core/run-records.js");
const { addDays, compareDays, sameDay, mondayOf, todayOf, readIsoDay, usDate } = __require("../rules/dates.js");
const { valueKey } = __require("../rules/prepare.js");
const { entryKind } = __require("../rules/entries.js");
const { compareCopies, copyWindow, coverAssignmentRange, retainAssignmentEvidence, dayOf, ENTRY_FIELDS, scheduleWriteAttempt, knownAssignmentRows } = __require("./copy.js");
const { PageError, WAIT, guardReady, chooseInSelect2, click, closeWindow, fieldByLabel, keepFlags, cleanupAfter, modalTransitioning, pause, settled, shown, stopFlagged, text, typeInto, waitFor } = __require("./dom.js");
const { proveDates, setDates, proveAllowedDates, proveDateSet, setDateSet } = __require("./dates-box.js");
const { waitForDates, waitForDateSet } = __require("./dates-box.js");
const { buttonIn, emptySpots, menuItem, findAssignments, findAssignmentsRange, readEditTable, closeEdit, personIdentity, waitForPersonIdentity } = __require("./schedule.js");
const { calendarHolds, showDate } = __require("./calendar.js");
const { rememberPreflightForm, takePreflightForm, preflightFormIdentity } = __require("./preflight-form.js");
function deleteClickState(confirm) {
  const jq = confirm.ownerDocument.defaultView.jQuery;
  const count = node => {
    if (!node || typeof jq?._data !== 'function') return '?';
    try { return jq._data(node, 'events')?.click?.length || 0; } catch { return '?'; }
  };
  const button = label => [...confirm.querySelectorAll('button')].find(node => shown(node) && text(node) === label);
  return `${count(confirm)}/${count(button('Yes'))}/${count(button('No'))}`;
}
function observeDeleteOpening(doc) {
  const announced = new WeakSet();
  const notice = event => { if (event.target?.nodeType === 1) announced.add(event.target); };
  doc.addEventListener('shown.bs.modal', notice);
  let wrapped = null;
  try {
    const jq = doc.defaultView.jQuery;
    const candidate = typeof jq === 'function' ? jq(doc) : null;
    if (typeof candidate?.on === 'function' && typeof candidate?.off === 'function') {
      wrapped = candidate;
      wrapped.on('shown.bs.modal.snoozeDeleteEvidence', notice);
    }
  } catch {   }
  return {
    read(modal) {
      const transitioning = modalTransitioning(modal);
      let animations = null;
      try {
        const nodes = [modal, ...modal.querySelectorAll('.modal-dialog')];
        if (nodes.every(node => typeof node.getAnimations === 'function')) {
          animations = nodes.flatMap(node => node.getAnimations()).filter(animation => animation.pending || ['running', 'pending', 'paused'].includes(animation.playState)).length;
        }
      } catch {   }
      return { shownObserved: announced.has(modal), transitioning, animations };
    },
    stop() {
      doc.removeEventListener('shown.bs.modal', notice);
      try { wrapped?.off('shown.bs.modal.snoozeDeleteEvidence', notice); } catch {   }
    },
  };
}
async function deleteAllRecorded(edit, options = {}) {
  if (isTaxPage()) {
    const rows = await readEditTable(edit), notice = options.onWrite || (() => {});
    const allowed = () => !rows.some(row => !dayOf(row.date) || compareDays(dayOf(row.date), todayOf()) < 0);
    if (!allowed()) throw new PageError('Tax Delete All cannot change past dates.');
    options = { ...options, onWrite: async () => { await notice(); if (!allowed()) throw new PageError('Tax Delete All cannot change past dates.'); } };
  }
  const opening = observeDeleteOpening(edit.ownerDocument);
  try { return await deleteAllObserved(edit, options, opening); }
  finally { opening.stop(); }
}
async function deleteAllObserved(edit, { onWrite = () => {} }, opening) {
  const confirms = () => [...edit.ownerDocument.querySelectorAll('.bootbox-confirm')].filter(shown);
  const before = new Set(confirms());
  if (before.size) throw new PageError('Another confirmation window is already open. Close it before Delete All; nothing was deleted.');
  await click(edit.querySelector('button.js-bulk-actions') || buttonIn(edit, 'Bulk Actions'));
  const item = await waitFor(() => [...edit.querySelectorAll('.js-assignment-edit-delete-all')].find(shown), 'Delete All in Bulk Actions');
  if (confirms().length) throw new PageError('Another confirmation window opened before Delete All; nothing was deleted.');
  await click(item);
  const confirm = await waitFor(() => {
    const opened = confirms().filter(node => !before.has(node));
    if (opened.length > 1) throw new PageError('More than one confirmation window opened for Delete All; Snooze will not guess.');
    return opened[0] || null;
  }, 'the "Are you sure" window for Delete All', WAIT.window);
  const openedHandlers = deleteClickState(confirm);
  await settled(confirm, { loadingScope: confirm });
  if (confirms().length !== 1 || !shown(confirm)) throw new PageError('The confirmation windows changed before Delete All; Snooze will not guess.');
  if (text(confirm.querySelector('.bootbox-body')) !== 'Are you sure you want to delete the selected assignment(s)?') {
    throw new PageError('The confirmation does not ask to delete the selected assignments; nothing was deleted.');
  }
  const yesButtons = [...confirm.querySelectorAll('button')].filter(button => shown(button) && text(button) === 'Yes');
  if (yesButtons.length !== 1) throw new PageError('The Delete All confirmation does not have one visible Yes button; nothing was deleted.');
  const yes = await waitFor(() => {
    if (confirms().length !== 1 || confirms()[0] !== confirm) throw new PageError('The confirmation windows changed before Delete All; Snooze will not guess.');
    const button = yesButtons[0];
    return modalTransitioning(confirm) !== true && shown(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true' ? button : null;
  }, 'the Delete All Yes button to become ready', WAIT.window);
  const readyHandlers = deleteClickState(confirm);
  const view = confirm.ownerDocument.defaultView;
  let scriptErrors = 0;
  const observeError = () => { scriptErrors += 1; };
  view.addEventListener('error', observeError);
  let pressedHandlers = '?';
  let atYes = null;
  try {
    await guardReady();
    await onWrite();
    atYes = opening.read(confirm);
    scheduleWriteAttempt('delete');
    await click(yes);
    pressedHandlers = deleteClickState(confirm);
    await waitFor(() => (!confirm.isConnected || !shown(confirm)) && (!edit.isConnected || !shown(edit)), 'the delete to finish', WAIT.window);
  } catch (error) {
    error.deleteDiagnostics = { opened: openedHandlers, ready: readyHandlers, pressed: pressedHandlers,
      stopped: deleteClickState(confirm), scriptErrors, atYes };
    error.message += ` Delete diagnostics (popup/Yes/No click counts): opened ${openedHandlers}; ready ${readyHandlers}; pressed ${pressedHandlers}; stopped ${deleteClickState(confirm)}; script errors ${scriptErrors}.`;
    throw error;
  } finally { view.removeEventListener('error', observeError); }
}
async function addAssignmentRecorded(entry, mode, { onWrite = () => {}, move = showDate, onProgress = () => {}, formModal = null, preflightForm = null } = {}) {
  if (isTaxPage() && compareDays(entry.start, todayOf()) < 0) throw new PageError('Tax Add/Replace cannot start before today.');
  let retained = null;
  if (preflightForm) {
    const identity = preflightFormIdentity(preflightForm);
    if (identity) await waitForPersonIdentity(identity);
    retained = takePreflightForm(preflightForm);
    if (retained.valid && shown(preflightForm)) formModal = preflightForm;
    else {
      const open = [...document.querySelectorAll('#addShiftEventModal')].filter(shown);
      if (open.length > 1) throw Object.assign(new PageError('More than one Add Assignment window is open. Nothing was changed.'), { pageBlocked: true });
      const stale = open[0] || (preflightForm.isConnected && shown(preflightForm) ? preflightForm : null);
      if (stale) await closeWindow(stale, 'Add Assignment');
    }
  }
  const modal = formModal || await openAddForm(entry.start, move, onProgress);
  if (!modal.isConnected || !shown(modal)) throw new PageError('The preflight Add Assignment window closed before the change. Nothing was changed.');
  try {
    if (retained?.required) proveAllowedDates(modal.querySelector('#CreateWeeklyAssignmentShift_Form') || modal, retained.required);
    await fillAndAdd(modal, entry, mode, onWrite, onProgress);
  } catch (error) {
    if (modal.isConnected && shown(modal) && !error.addPressed) {
      const how = await cleanupAfter(error, () => closeWindow(modal, 'Add Assignment'));
      error.message += how ? ' Add Assignment was closed with Cancel; nothing was added.' : ' Close Add Assignment with Cancel by hand; nothing was added.';
    }
    throw error;
  }
}
async function preflightDates(required, { move = showDate, entries = [], keepOpen = false, anchor = required[0], onBounds = () => {} } = {}) {
  if (!required.length) return { exact: false };
  const modal = await openAddForm(anchor, move);
  let proved = false;
  try {
    const form = modal.querySelector('#CreateWeeklyAssignmentShift_Form') || modal;
    const capability = proveAllowedDates(form, required, onBounds);
    let exact = capability.exact;
    for (const entry of entries.filter(entry => entry.dates)) {
      if (!exact) break;
      await typeInto(fieldByLabel(form, 'Hours Per Day'), entry.hoursPerDay);
      try { await setDateSet(form, entry.dates, Number(entry.hoursPerDay)); }
      catch (error) { if (stopFlagged(error)) throw error; exact = false; }
    }
    proved = true;
    if (keepOpen) rememberPreflightForm(modal, personIdentity(), required);
    return { exact, ...(keepOpen ? { modal } : {}) };
  } catch (error) {
    await cleanupAfter(error, () => closeWindow(modal, 'Add Assignment'));
    throw error;
  } finally { if (proved && !keepOpen) await closeWindow(modal, 'Add Assignment'); }
}
async function openAddForm(start, move = showDate, onProgress = () => {}) {
  onProgress('calendar');
  if (!calendarHolds(start)) await move(start);
  const spots = emptySpots();
  const target = spots.filter(({ cell }) => {
    const day = readIsoDay(cell.getAttribute('data-date'));
    return day && sameDay(day, start);
  });
  const week = spots.filter(({ cell }) => {
    const day = readIsoDay(cell.getAttribute('data-date'));
    return day && sameDay(day, mondayOf(start));
  });
  const preferred = [...target, ...week, ...spots].filter((spot, index, all) => all.findIndex(other => other.cell === spot.cell) === index);
  onProgress('menu');
  await menuItem(preferred, 'New Assignment');
  onProgress('form');
  return settled(await waitFor(() => [...document.querySelectorAll('#addShiftEventModal')].find(shown), 'the Add Assignment window', WAIT.window));
}
async function fillAndAdd(modal, entry, mode, onWrite, onProgress) {
  const form = modal.querySelector('#CreateWeeklyAssignmentShift_Form') || modal;
  const tax = isTaxPage();
  onProgress('Client');
  await chooseInSelect2(fieldByLabel(form, 'Client'), entry.client, 'Client');
  if (entry.wbs) await chooseInSelect2(fieldByLabel(form, 'WBS'), entry.wbs, 'WBS');
  const settings = [];
  for (const [label, value] of tax ? [] : [['Billable', entry.billable], ['Utilization Generating', entry.utilization]]) {
    onProgress(label);
    const select = fieldByLabel(form, label);
    const filled = await waitFor(() => select.selectedOptions?.[0]?.value && text(select.selectedOptions[0]), `"${label}" filled in by the page after the client was chosen`, 10000);
    const expected = value || filled;
    if (valueKey(filled) !== valueKey(expected)) await chooseInSelect2(select, expected, label);
    settings.push({ label, expected });
  }
  for (const [label, value] of tax ? [['Job Code', entry.jobCode]] : [['Pricing ID', entry.pricingId], ['Job Code', entry.jobCode], ['Assign Code', entry.assignCode], ['Assign Code 2', entry.assignCode2]]) {
    if (value) await chooseInSelect2(fieldByLabel(form, label), value, label);
  }
  onProgress('dates');
  if (entry.dates) await setDateSet(form, entry.dates);
  else await setDates(form, entry.start, entry.end);
  const hoursLabel = tax ? 'Hours Per Week' : 'Hours Per Day';
  onProgress(hoursLabel);
  await typeInto(fieldByLabel(form, hoursLabel), tax ? entry.hoursPerWeek : entry.hoursPerDay);
  onProgress('Notes');
  await typeInto(fieldByLabel(form, 'Notes'), entry.notes || '');
  onProgress('Mode');
  await chooseInSelect2(fieldByLabel(form, 'Mode'), mode, 'Mode');
  onProgress('prove');
  if (entry.dates) await waitForDateSet(form, entry.dates, Number(entry.hoursPerDay));
  else await waitForDates(form, entry.start, entry.end, tax ? null : Number(entry.hoursPerDay));
  if (tax) {
    const wanted = [['Client', entry.client], ['Mode', mode], ['Hours Per Week', String(entry.hoursPerWeek)]];
    if (entry.wbs) wanted.push(['WBS', entry.wbs]);
    if (entry.jobCode) wanted.push(['Job Code', entry.jobCode]);
    for (const [label, value] of wanted) {
      const control = fieldByLabel(form, label);
      const actual = control.tagName === 'SELECT' ? text(control.selectedOptions?.[0]) : control.value;
      if (valueKey(actual) !== valueKey(value)) throw new PageError('Tax Add Assignment did not keep the requested fields. Nothing was added.');
    }
    if (!Number.isFinite(entry.hoursPerWeek) || entry.hoursPerWeek <= 0) throw new PageError('Tax weekly hours are invalid. Nothing was added.');
  }
  for (const { label, expected } of settings) {
    const select = fieldByLabel(form, label);
    if (!select.isConnected || !select.selectedOptions?.[0]?.value || valueKey(text(select.selectedOptions[0])) !== valueKey(expected)) {
      throw new PageError(`Add Assignment did not keep ${label} as expected; nothing was added.`);
    }
  }
  onProgress('submit');
  const adds = [...modal.querySelectorAll('button')].filter(button => shown(button) && text(button) === (tax ? 'Submit' : 'Add'));
  if (adds.length !== 1 || adds[0].disabled || adds[0].getAttribute('aria-disabled') === 'true') throw new PageError('The Add Assignment window does not have one enabled Add button; nothing was added.');
  const add = adds[0];
  await guardReady();
  await onWrite();
  if (tax && compareDays(entry.start, todayOf()) < 0) throw new PageError('Tax Add/Replace cannot start before today.');
  scheduleWriteAttempt('add');
  await click(add);
  onProgress('save');
  await waitFor(() => {
    if (!modal.isConnected || !shown(modal)) return true;
    const error = [...modal.querySelectorAll('.invalid-feedback, .field-validation-error, .alert-danger, .text-danger')].find(node => shown(node) && text(node));
    if (error) {
      const refusal = text(error);
      throw Object.assign(new PageError(`Add Assignment refused it: ${refusal}`), {
        employmentDateRefused: /^Failed to insert all days due to staff member['’]s start or end date\.?$/i.test(refusal),
      });
    }
    return false;
  }, 'Add Assignment to save and close', WAIT.window).catch(error => {
    error.addPressed = true;
    throw error;
  });
}
function deleteAll(...args) { return timedRun("delete", () => deleteAllRecorded(...args)); }
function splitDeleteWeeks(query) {
  const parts = [];
  for (let monday = mondayOf(query.start); compareDays(monday, query.end) <= 0; monday = addDays(monday, 7)) {
    const friday = addDays(monday, 4), sunday = addDays(monday, 6);
    const start = compareDays(query.start, monday) > 0 ? query.start : monday;
    const end = compareDays(query.end, sunday) < 0 ? query.end : sunday;
    const partial = compareDays(start, monday) > 0 || compareDays(end, friday) < 0;
    const previous = parts.at(-1);
    if (!partial && previous && !previous.partial) previous.end = end;
    else parts.push({ start, end, partial });
  }
  return parts;
}
async function deleteRange(query, before, { edit = null, read, onWrite = () => {}, validate = async () => {}, protectedRows = [] } = {}) {
  const inside = (day, range) => day && compareDays(day, range.start) >= 0 && (!range.end || compareDays(day, range.end) <= 0);
  const clientMatches = row => !query.clients || query.clients.some(client => valueKey(client) === valueKey(row.client));
  const original = edit || await findAssignments(query);
  const range = findAssignmentsRange(original);
  try {
    if (isTaxPage() || query.future || !query.end || !range || !read) throw new PageError('The week delete scope could not be proved. Nothing was deleted.');
  } catch (error) { await cleanupAfter(error, () => closeEdit(original)); throw error; }
  const parts = splitDeleteWeeks(query);
  if (parts.length !== 1) await closeEdit(original);
  let current = before;
  for (const [index, part] of parts.entries()) {
    const partQuery = { ...query, start: part.start, end: part.end };
    const findQuery = { ...partQuery, weekEndFriday: true };
    let table = parts.length === 1 && index === 0 ? original : await findAssignments(findQuery);
    const openedRange = findAssignmentsRange(table), covered = knownAssignmentRows(current).range;
    if (openedRange?.weekBoxes && covered?.end && (compareDays(openedRange.start, covered.start) < 0 || compareDays(openedRange.end, covered.end) > 0)) {
      await closeEdit(table);
      await coverAssignmentRange(current, openedRange);
      table = await findAssignments(findQuery);
    }
    const known = knownAssignmentRows(current);
    let targets;
    try {
      const actualRange = findAssignmentsRange(table);
      if (!actualRange || !known.range || compareDays(actualRange.start, known.range.start) < 0
        || known.range.end && compareDays(actualRange.end, known.range.end) > 0) throw new PageError('The whole week is not covered by the checked schedule read. Nothing was deleted.');
      if (!actualRange.weekBoxes && (compareDays(actualRange.start, part.start) !== 0 || compareDays(actualRange.end, part.end) !== 0)) throw new PageError('The exact delete dates changed. Nothing was deleted.');
      const actual = { days: (await readEditTable(table)).map(row => ({ ...row, day: dayOf(row.date) })) };
      const expected = { days: known.rows.filter(row => inside(row.day, actualRange) && clientMatches(row)) };
      if (actual.days.some(row => !row.day) || !sameAssignmentRows(expected, actual)) throw new PageError('The whole-week table changed since the checked read. Nothing was deleted.');
      targets = expected.days.filter(row => inside(row.day, part) && clientMatches(row));
      if (targets.some(row => protectedRows.some(old => old.id === row.id))) throw new PageError('A kept row is inside the delete range. Nothing was deleted.');
      if ((!actualRange.weekBoxes || !part.partial) && targets.length !== actual.days.length) throw new PageError('The whole-week table includes rows outside the delete range. Nothing was deleted.');
      await validate({ days: actual.days.filter(row => inside(row.day, part)), window: { start: part.start, end: part.end } });
      if (targets.length) {
        if (actualRange.weekBoxes && part.partial) await saveStagedNotes(await stageRemoval(table, expected, targets), onWrite);
        else await deleteAll(table, { onWrite });
      } else await closeEdit(table);
    } catch (error) {
      if (table.isConnected && shown(table) && !error.addPressed) await cleanupAfter(error, () => closeEdit(table));
      throw error;
    }
    const after = await read();
    const ids = new Set(targets.map(row => row.id));
    const expected = { days: known.rows.filter(row => !ids.has(row.id)) };
    const coverage = knownAssignmentRows(after).range;
    if (known.range?.end && (!coverage || compareDays(coverage.start, known.range.start) > 0 || coverage.end && compareDays(coverage.end, known.range.end) < 0)) {
      const checked = await copyWindow(known.range);
      if (!sameAssignmentRows(expected, { days: knownAssignmentRows(checked).rows })) throw new PageError('The week delete could not be proved. Restore this person before continuing.');
      retainAssignmentEvidence(after, checked);
    }
    if (!sameAssignmentRows(expected, { days: knownAssignmentRows(after).rows })) throw new PageError('The week delete could not be proved. Restore this person before continuing.');
    if (targets.length) recordRun({ type:'writeProof', ok:true });
    current = after;
  }
  return current;
}
function addAssignment(...args) { return timedRun("add", () => addAssignmentRecorded(...args)); }
async function setAssignmentHours(query, expected, target, hours, { onWrite = () => {}, restoring = false } = {}) {
  const allowed = () => isTaxPage() && compareDays(target.day, mondayOf(todayOf())) >= 0 && (restoring || hours <= target.hours)
    && (compareDays(target.day, todayOf()) >= 0 || !['loa', 'holiday', 'dns'].includes(entryKind(target)) && valueKey(target.client) !== 'loa');
  if (!allowed()) throw new PageError('Tax hours edit is outside the allowed change.');
  const staged = await stageTaxHours(query, expected, target, hours);
  return saveStagedNotes(staged, async () => { await onWrite(); if (!allowed()) throw new PageError('Tax hours edit moved outside the allowed dates.'); });
}
async function refreshNotes(query, expected, notes, { onWrite = () => {}, remove = [], onStage = () => {} } = {}) {
  const prepared = await stageNotes(query, expected, notes, { remove, onStage });
  if (!prepared) return false;
  return saveStagedNotes(prepared, onWrite);
}
async function saveStagedNotes(prepared, onWrite = () => {}) {
  let saving = false;
  try {
    await timedRun('save notes', async () => {
      await guardReady();
      await onWrite(); scheduleWriteAttempt('submit'); saving = true; await click(prepared.saveSubmit);
      await waitFor(() => !prepared.edit.isConnected || !shown(prepared.edit), 'Edit Assignments to save and close', WAIT.window);
    });
    return true;
  } catch (error) {
    error.noReplay = true;
    if (saving) error.addPressed = true;
    else await cleanupAfter(error, () => closeEdit(prepared.edit));
    throw error;
  }
}
__exports.preflightDates = preflightDates;
__exports.deleteAll = deleteAll;
__exports.splitDeleteWeeks = splitDeleteWeeks;
__exports.deleteRange = deleteRange;
__exports.addAssignment = addAssignment;
__exports.setAssignmentHours = setAssignmentHours;
__exports.refreshNotes = refreshNotes;
__exports.saveStagedNotes = saveStagedNotes;
},
"mysource/note-stage.js": function (__require, __exports, document, window) {
'use strict';
const { usDate } = __require("../rules/dates.js");
const { valueKey } = __require("../rules/prepare.js");
const { compareCopies, dayOf, ENTRY_FIELDS } = __require("./copy.js");
const { PageError, cleanupAfter, WAIT, click, closeWindow, fieldByLabel, settled, shown, text, typeInto, waitFor, recognizeBulkWindow, observeWindowTitle } = __require("./dom.js");
const { findAssignments, readEditTable, closeEdit } = __require("./schedule.js");
const NOTE_FIELDS = [['Professional', 'professional'], ['Client', 'client'], ['WBS', 'wbs'], ['Billable', 'billable'],
  ['Utilization Generating', 'utilization'], ['Pricing ID', 'pricingId'], ['Job Code', 'jobCode'],
  ['Assign Code', 'assignCode'], ['Assign Code 2', 'assignCode2'], ['Hours', 'hours']];
const CONTROL_OWNERS = [...NOTE_FIELDS.map(([label]) => label), 'Notes', 'no known field'];
const CONTROL_TYPES = ['text', 'search', 'number', 'radio'];
const BUTTON_WORDS = ['Submit', 'Cancel', 'Close', 'Save', 'OK', 'Apply', 'Back', 'other'];
function describeSubmit(root, windowName, when) {
  const buttons = [...root.querySelectorAll('button')];
  const submits = buttons.filter(node => text(node) === 'Submit');
  const state = !submits.length ? 'missing' : !submits.some(shown) ? 'hidden' : submits.some(node => shown(node) && !node.disabled) ? 'ok' : 'disabled';
  const kinds = new Set(buttons.filter(shown).map(node => BUTTON_WORDS.includes(text(node)) ? text(node) : 'other'));
  const listed = BUTTON_WORDS.filter(word => kinds.has(word));
  const alike = [...root.querySelectorAll('input, a, [role=button], button')].filter(node => node.tagName !== 'BUTTON' ? [text(node), node.value].includes('Submit') : /submit/i.test(text(node)) && text(node) !== 'Submit');
  return { state, detail: windowName + ' Submit ' + when + ': ' + state + '; Submit buttons ' + Math.min(submits.length, 9) + '; shown buttons ' + (listed.join(', ') || 'none') + '; other Submit-like controls ' + Math.min(alike.length, 9) + '.' };
}
const bulkFieldExits = Object.fromEntries(NOTE_FIELDS.flatMap(([label, key]) => [
  ['bulkFieldMissing_' + key, 'The Bulk Edit ' + label + ' field is missing.'],
  ['bulkBlankNotAllowed_' + key, 'The Bulk Edit ' + label + ' field is blank but a blank is not allowed.'],
  ['bulkValueDiffers_' + key, 'The Bulk Edit ' + label + ' field value differs from the retained rows.'],
  ['bulkMultipleCheckboxes_' + key, 'The Bulk Edit ' + label + ' field has more than one checkbox.'],
  ['bulkCheckboxTicked_' + key, 'A checkbox next to the Bulk Edit ' + label + ' field is already ticked.'],
  ['bulkBlankCheckboxCount_' + key, 'The blank Bulk Edit ' + label + ' field does not have exactly one checkbox next to it.']
]));
const NOTE_STAGE_EXITS = {
  "removeListRefused": "The row removal list is not eligible for staging.",
  "rowsNotEligible": "The retained rows are not eligible for a shared note refresh.",
  "notesEmpty": "The refresh note or assignment table is empty.",
  "bulkActionsMissing": "The Bulk Actions button is missing or hidden.",
  "trashButtonMissing": "A required row trash button could not be proved.",
  "editAllMissing": "The Edit all item is missing or hidden.",
  "bulkFieldMissing": "A required Bulk Edit field is missing.",
  ...bulkFieldExits,
  "notesFieldMissing": "The Bulk Edit Notes field is missing.",
  "notesBlankChecked": "The Notes blank checkbox is checked.",
  "unknownBlankControl": "A Bulk Edit blank checkbox is unknown or checked.",
  "unknownValueControl": "A Bulk Edit value field is unknown.",
  "submitMissing": "A required Submit button is missing or disabled."
};
const STAGED_WORDS = [...NOTE_FIELDS.map(([, key]) => key), 'day', 'notes'];
function sameAssignmentRows(expected, actual) {
  const byId = new Map(actual.days.map(row => [row.id, row]));
  return compareCopies(expected, actual).same && byId.size === actual.days.length
    && new Set(expected.days.map(row => row.id)).size === expected.days.length
    && expected.days.every(old => old.id && byId.has(old.id) && old.notes === byId.get(old.id).notes
      && compareCopies({ days: [old] }, { days: [byId.get(old.id)] }).same);
}
async function stageRemoval(edit, expected, remove) {
  const snapshot = async () => ({ days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) });
  let prepared = false, pressed = false, primary = null;
  const trashFor = id => {
    const rows = [...edit.querySelectorAll('tbody tr[data-id]')].filter(node => node.getAttribute('data-id') === id);
    const buttons = rows.length === 1 ? [...rows[0].querySelectorAll('td.action-column button.btn-xs.btn-danger')].filter(shown) : [];
    if (buttons.length !== 1 || buttons[0].disabled || buttons[0].getAttribute('aria-disabled') === 'true') throw new PageError(NOTE_STAGE_EXITS.trashButtonMissing);
    return buttons[0];
  };
  try {
    if (!remove.length || new Set(remove.map(row => row.id)).size !== remove.length
      || !sameAssignmentRows(expected, await snapshot()) || remove.some(row => !expected.days.some(old => old.id === row.id))) throw new PageError('The removal table changed. Nothing was saved.');
    for (const row of remove) trashFor(row.id);
    const removed = new Set();
    for (const row of remove) {
      pressed = true;
      await click(trashFor(row.id));
      await waitFor(() => ![...edit.querySelectorAll('tbody tr[data-id]')].some(node => node.getAttribute('data-id') === row.id), 'the staged row removal', WAIT.window);
      await settled(edit);
      removed.add(row.id);
      if (!sameAssignmentRows({ days: expected.days.filter(old => !removed.has(old.id)) }, await snapshot())) throw new PageError('The staged row removal could not be proved. Nothing was saved.');
    }
    const submits = [...edit.querySelectorAll('button')].filter(node => shown(node) && text(node) === 'Submit');
    if (submits.length !== 1 || submits[0].disabled || submits[0].getAttribute('aria-disabled') === 'true') throw new PageError(NOTE_STAGE_EXITS.submitMissing);
    prepared = true;
    return { edit, saveSubmit: submits[0] };
  } catch (error) { primary = error; if (pressed) error.noReplay = true; throw error; }
  finally {
    if (!prepared) {
      if (primary) await cleanupAfter(primary, () => closeEdit(edit));
      else await closeEdit(edit);
    }
  }
}
function describeStaged(retained, staged) {
  const cap = n => Math.min(n, 9), same = compareCopies(retained, staged);
  const old = new Map(retained.days.map(row => [row.id, row]));
  const differing = STAGED_WORDS.filter(key => key !== 'notes' && staged.days.some(row => {
    const was = old.get(row.id); if (!was) return false;
    return key === 'day' ? usDate(row.day) !== usDate(was.day) : key === 'hours' ? Number(row.hours) !== Number(was.hours) : valueKey(row[key]) !== valueKey(was[key]);
  }));
  const ids = staged.days.length === retained.days.length && staged.days.every(row => old.has(row.id)) ? 'same' : 'changed';
  return 'Staged rows after Bulk Edit: rows before ' + cap(retained.days.length) + '; rows after ' + cap(staged.days.length) + '; rows missing ' + cap(same.missing.length) + '; rows extra ' + cap(same.extra.length)
    + '; rows without a note ' + cap(staged.days.filter(row => !(row.notes > 0)).length) + '; row ids ' + ids + '; fields differing ' + (differing.join(', ') || 'none') + '.';
}
function singleRefusal(reason) {
  if (typeof reason !== 'string') return false;
  if (Object.values(NOTE_STAGE_EXITS).includes(reason)) return true;
  const value = /^Bulk Edit unknown (select|textarea|input|other) control: type (text|search|number|radio|other); (shown|hidden); field (.+); unknown controls ([1-8]|9\+)\.$/.exec(reason);
  if (value) return value[0] === reason && CONTROL_OWNERS.includes(value[4]);
  const words = BUTTON_WORDS.join('|');
  const submit = new RegExp('^(Bulk Edit window Submit (before|after) typing|Edit window Submit (before|after) staging): (missing|hidden|disabled|ok); Submit buttons [0-9]; shown buttons (none|(' + words + ')(, (' + words + '))*); other Submit-like controls [0-9][.]$');
  if (submit.test(reason)) return true;
  if (/^Saved rows after refresh: copies (same|differ); rows expected [0-9]; rows found [0-9]; rows missing [0-9]; notes differ [0-9]; ids differ [0-9][.]$/.test(reason)) return true;
  const sw = STAGED_WORDS.join('|');
  if (new RegExp('^Staged rows after Bulk Edit: rows before [0-9]; rows after [0-9]; rows missing [0-9]; rows extra [0-9]; rows without a note [0-9]; row ids (same|changed); fields differing (none|(' + sw + ')(, (' + sw + '))*)[.]$').test(reason)) return true;
  const blank = /^Bulk Edit (unknown|ticked) checkbox: field (.+)\.$/.exec(reason);
  return Boolean(blank && blank[0] === reason && CONTROL_OWNERS.includes(blank[2]));
}
function isNoteStageRefusal(reason) {
  if (typeof reason !== 'string') return false;
  const parts = reason.split(' | ');
  if (parts.at(-1) === 'and more') {
    if (parts.length !== 7) return false;
    parts.pop();
  }
  return parts.length <= 6 && parts.every(singleRefusal);
}
const BLANK_NOTE_FIELDS = new Set(['pricingId', 'jobCode', 'assignCode', 'assignCode2']);
const blankNoteField = field => BLANK_NOTE_FIELDS.has(field) || field === 'wbs';
function noteRowsEligible(rows) {
  return rows.length > 0 && [...ENTRY_FIELDS, 'professional'].every(field => {
    const first = valueKey(rows[0][field]);
    return (first || blankNoteField(field)) && rows.every(row => valueKey(row[field]) === first);
  });
}
async function stageTaxHours(query, expected, target, hours) {
  const edit = await findAssignments(query);
  let staged = false;
  try {
    const snapshot = async () => ({ days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) });
    const before = await snapshot();
    if (!compareCopies(expected, before).same || before.days.some(row => !row.day || !row.id) || new Set(before.days.map(row => row.id)).size !== before.days.length) throw new PageError('Tax assignments changed before the hours edit. Nothing was saved.');
    const matching = before.days.filter(row => row.id === target.id);
    if (matching.length !== 1 || !compareCopies({ days: [target] }, { days: matching }).same) throw new PageError('Tax hours edit has no unique unchanged entry. Nothing was saved.');
    const rows = [...edit.querySelectorAll('table#editGrid tbody tr')].filter(row => row.getAttribute('data-id') === target.id);
    const cell = rows.length === 1 && rows[0].querySelector('td.column-hours');
    if (!cell || !Number.isFinite(hours) || hours < 0) throw new PageError('Tax Hours cell is unreadable. Nothing was saved.');
    await click(cell);
    const input = await waitFor(() => {
      const inputs = [...cell.querySelectorAll('input')].filter(shown);
      if (inputs.length > 1) throw new PageError('Tax Hours edit is ambiguous. Nothing was saved.');
      return inputs[0];
    }, 'the Tax Hours edit box');
    if ([...cell.querySelectorAll('.editable-submit')].some(shown)) throw new PageError('Tax Hours has an unproved inline save action. Nothing was typed or saved.');
    await typeInto(input, hours);
    input.dispatchEvent(new window.Event('blur', { bubbles: true }));
    const wanted = { days: before.days.map(row => row.id === target.id ? { ...row, hours } : row) };
    const after = await snapshot();
    if (!compareCopies(wanted, after).same || after.days.some(row => !before.days.some(old => old.id === row.id && old.notes === row.notes))) throw new PageError('The staged Tax hours edit changed unexpected fields. Nothing was saved.');
    const submits = [...edit.querySelectorAll('button')].filter(node => shown(node) && text(node) === 'Submit' && !node.disabled);
    if (submits.length !== 1) throw new PageError('Tax Edit Assignment has no unique enabled Submit. Nothing was saved.');
    staged = true;
    return { edit, saveSubmit: submits[0] };
  } finally { if (!staged) await closeEdit(edit); }
}
async function stageNotes(query, expected, notes, { remove = [], onStage = () => {}, diagnose = false, liveSeven = false } = {}) {
  const refuse = (reason, detail) => { onStage('refused', { reason }, detail); return false; };
  const removedIds = new Set(remove.map(row => row.id));
  const retained = { days: expected.days.filter(row => !removedIds.has(row.id)) };
  if (remove.length && (removedIds.size !== remove.length || remove.some(row => !row.id) || new Set(remove.map(row => usDate(row.day))).size !== remove.length)) return refuse('removeListRefused');
  if (!noteRowsEligible(retained.days)) return refuse('rowsNotEligible');
  const edit = await findAssignments(query);
  let bulk = null, prepared = false, stagedPressed = false;
  const optionalField = label => { try { return fieldByLabel(bulk, label); } catch (error) { if (/form has|No box found/.test(error.message)) return null; throw error; } };
  const snapshot = async () => ({ days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) });
  let primaryError = null;
  try {
    const before = await snapshot();
    if (before.days.some(row => !row.day) || !compareCopies(expected, before).same) throw new PageError('The LOA table changed before the note refresh. Nothing was changed.');
    if (!notes || !before.days.length) return refuse('notesEmpty');
    const bulkActions = edit.querySelector('button.js-bulk-actions');
    if (!bulkActions || !shown(bulkActions)) return refuse('bulkActionsMissing');
    const trash = [];
    for (const row of remove) {
      const matching = [...edit.querySelectorAll('tbody tr[data-id]')].filter(node => node.getAttribute('data-id') === row.id);
      const buttons = matching.length === 1 ? [...matching[0].querySelectorAll('td.action-column button.btn-xs.btn-danger')].filter(shown) : [];
      if (buttons.length !== 1 || buttons[0].disabled || !before.days.some(old => old.id === row.id)) return refuse('trashButtonMissing');
      trash.push(buttons[0]);
    }
    for (let index = 0; index < trash.length; index++) {
      stagedPressed = true;
      onStage('trash');
      await click(trash[index]);
      await waitFor(() => !trash[index].isConnected, 'the staged LOA row removal', WAIT.window);
      await settled(edit);
      const ids = new Set(remove.slice(0, index + 1).map(row => row.id));
      const expectedStep = { days: before.days.filter(row => !ids.has(row.id)) };
      const actual = await snapshot();
      if (!sameAssignmentRows(expectedStep, actual)) {
        throw new PageError('The prepared LOA row removal could not be proved. Nothing was saved.');
      }
      onStage('proof', {rows:actual.days.length, days:actual.days.map(row=>usDate(row.day)), totalHours:actual.days.reduce((sum,row)=>sum+row.hours,0)});
    }
    await click(bulkActions);
    const item = edit.querySelector('.js-assignment-edit-edit-all');
    if (!item || !shown(item)) return refuse('editAllMissing');
    const existing = new Set([...document.querySelectorAll('.modal, [role=dialog]')]);
    await click(item);
    bulk = await settled(await waitFor(() => {
      const opened = [...document.querySelectorAll('.modal, [role=dialog]')].filter(node => !existing.has(node) && shown(node));
      if (opened.length > 1) throw new PageError('More than one Bulk Edit window opened; Snooze will not guess.');
      return opened[0];
    }, 'Bulk Edit Assignments', WAIT.window), { caller: 'Bulk Edit Assignments', purpose: 'opening', deferTitle: true });
    const title = text(bulk.querySelector('.modal-title, h4'));
    if (title !== 'Bulk Edit Assignments') throw new PageError('The opened window is not Bulk Edit Assignments. Nothing was changed.');
    const controls = [], failures = [];
    const failed = (reason, detail = NOTE_STAGE_EXITS[reason]) => failures.push({ reason, detail });
    for (const [label, key] of NOTE_FIELDS) {
      const control = optionalField(label);
      if (!control || !bulk.contains(control)) { failed('bulkFieldMissing', NOTE_STAGE_EXITS['bulkFieldMissing_' + key]); continue; }
      const raw = control.tagName === 'SELECT' ? (control.selectedOptions?.[0]?.value ? text(control.selectedOptions[0]) : '') : control.value;
      const value = valueKey(raw);
      const row = control.closest('.dynamic-form-row, .form-group, .row') || control.parentElement;
      const boxes = [...row.querySelectorAll('input[type=checkbox]')];
      if (!value && !blankNoteField(key)) failed('bulkBlankNotAllowed_' + key);
      if (retained.days.some(one => key === 'hours' ? Number(raw) !== one.hours : valueKey(one[key]) !== value)) failed('bulkValueDiffers_' + key);
      if (boxes.length > 1) failed('bulkMultipleCheckboxes_' + key);
      if (boxes.some(box => box.checked)) failed('bulkCheckboxTicked_' + key);
      if (!value && boxes.length !== 1 && !((key === 'wbs' || key === 'pricingId') && boxes.length === 0)) failed('bulkBlankCheckboxCount_' + key);
      controls.push({ control, rawValue: control.value, label });
    }
    const note = optionalField('Notes');
    const presentNote = note && bulk.contains(note);
    if (!presentNote) failed('notesFieldMissing');
    const rowOf = control => control.closest('.dynamic-form-row, .form-group, .row') || control.parentElement;
    if (presentNote && [...rowOf(note).querySelectorAll('input[type=checkbox]')].some(box => box.checked)) failed('notesBlankChecked');
    const labelled = [...controls.map(one => [one.label, one.control]), ...(presentNote ? [['Notes', note]] : [])];
    const known = new Set(labelled.map(([, control]) => control));
    const knownBoxes = new Set(labelled.flatMap(([, control]) => [...rowOf(control).querySelectorAll('input[type=checkbox]')]));
    const ownerOf = node => {
      const owners = labelled.filter(([, control]) => rowOf(control).contains(node));
      return owners.length === 1 ? owners[0][0] : 'no known field';
    };
    for (const box of bulk.querySelectorAll('input[type=checkbox]')) {
      if (!knownBoxes.has(box) || box.checked) failed('unknownBlankControl', 'Bulk Edit ' + (box.checked ? 'ticked' : 'unknown') + ' checkbox: field ' + ownerOf(box) + '.');
    }
    const ignorable = control => control.tagName === 'INPUT' && control.type === 'text' && !shown(control) && ownerOf(control) === 'no known field';
    const unknown = [...bulk.querySelectorAll('select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=submit]):not([type=button])')].filter(control => !known.has(control) && !ignorable(control));
    for (const control of unknown) {
      const tag = ['SELECT', 'TEXTAREA', 'INPUT'].includes(control.tagName) ? control.tagName.toLowerCase() : 'other';
      const type = tag === 'input' && CONTROL_TYPES.includes(control.type) ? control.type : 'other';
      failed('unknownValueControl', 'Bulk Edit unknown ' + tag + ' control: type ' + type + '; ' + (shown(control) ? 'shown' : 'hidden') + '; field ' + ownerOf(control) + '; unknown controls ' + (unknown.length >= 9 ? '9+' : String(unknown.length)) + '.');
    }
    if (failures.length) {
      const bulkSubmit = describeSubmit(bulk, 'Bulk Edit window', 'before typing'), editSubmit = describeSubmit(edit, 'Edit window', 'before staging');
      if (bulkSubmit.state !== 'ok') failed('submitMissing', bulkSubmit.detail);
      if (editSubmit.state !== 'ok') failed('submitMissing', editSubmit.detail);
      const details = [...new Set(failures.map(one => one.detail))];
      return refuse(failures[0].reason, [...details.slice(0, 6), ...(details.length > 6 ? ['and more'] : [])].join(' | '));
    }
    await typeInto(note, notes);
    if (note.value !== notes || controls.some(({ control, rawValue }) => control.value !== rawValue)) throw new PageError('The prepared Bulk Edit fields changed. Nothing was saved.');
    const onlySubmit = root => {
      const found = [...root.querySelectorAll('button')].filter(node => text(node) === 'Submit' && shown(node));
      return found.length === 1 && !found[0].disabled && found[0].getAttribute('aria-disabled') !== 'true' ? found[0] : null;
    };
    const stageSubmit = onlySubmit(bulk);
    if (!stageSubmit) return refuse('submitMissing', describeSubmit(bulk, 'Bulk Edit window', 'after typing').detail);
    recognizeBulkWindow(bulk);
    stagedPressed = true;
    onStage('bulk');
    await click(stageSubmit);
    await waitFor(() => !bulk.isConnected || !shown(bulk), 'Bulk Edit Assignments to stage and close', WAIT.window);
    await settled(edit);
    const staged = await snapshot();
    if (!compareCopies(retained, staged).same || staged.days.some(row => !(row.notes > 0))
      || staged.days.length !== retained.days.length || staged.days.some(row => !retained.days.some(old => old.id === row.id))) {
      const failure = new PageError('The prepared LOA note edit could not be proved. Nothing was saved.');
      if (diagnose === true) failure.stagedDiagnosis = describeStaged(retained, staged);
      throw failure;
    }
    onStage('proof', {rows:staged.days.length, days:staged.days.map(row=>usDate(row.day)), totalHours:staged.days.reduce((sum,row)=>sum+row.hours,0)});
    const saveSubmit = onlySubmit(edit);
    if (!saveSubmit) return refuse('submitMissing', describeSubmit(edit, 'Edit window', 'after staging').detail);
    prepared = true;
    return { edit, saveSubmit, retained, staged };
  } catch (error) {
    primaryError = error;
    if (stagedPressed) error.noReplay = true;
    throw error;
  } finally {
    if (bulk) observeWindowTitle(bulk, { caller: 'Bulk Edit Assignments', purpose: 'opening' });
    if (!prepared) {
      const cleanup = async () => {
        let failure = null;
        try { if (bulk?.isConnected && shown(bulk)) await closeWindow(bulk, 'Bulk Edit Assignments'); }
        catch (error) { failure = error; }
        if (failure) await cleanupAfter(failure, async () => { if (edit.isConnected && shown(edit)) await closeEdit(edit); });
        else if (edit.isConnected && shown(edit)) await closeEdit(edit);
        if (failure) throw failure;
      };
      if (primaryError) await cleanupAfter(primaryError, cleanup);
      else try { await cleanup(); } catch (error) { if (stagedPressed) error.noReplay = true; throw error; }
    }
  }
}
__exports.NOTE_STAGE_EXITS = NOTE_STAGE_EXITS;
__exports.sameAssignmentRows = sameAssignmentRows;
__exports.stageRemoval = stageRemoval;
__exports.describeStaged = describeStaged;
__exports.isNoteStageRefusal = isNoteStageRefusal;
__exports.noteRowsEligible = noteRowsEligible;
__exports.stageTaxHours = stageTaxHours;
__exports.stageNotes = stageNotes;
},
"mysource/copy.js": function (__require, __exports, document, window) {
'use strict';
const { timedRun, recordRun } = __require("../core/run-records.js");
const { compareDays, localStamp, dayFromParts, usDate, nextWorkday, isWeekend } = __require("../rules/dates.js");
const { valueKey } = __require("../rules/prepare.js");
const { PageError, cleanupAfter } = __require("./dom.js");
const { closeEdit, findAssignments, findAssignmentsRange, readEditTable, readRowNote, personIdentity, checkPersonIdentity } = __require("./schedule.js");
const { retirePreflightForm } = __require("./preflight-form.js");
let writeSequence = 0, lastWrite = null, pendingAddRead = null;
const addReads = new WeakMap();
const findCopies = new WeakMap();
const knownAssignmentRows = copy => findCopies.get(copy) || { rows: copy.days, range: copy.window };
function retainAssignmentEvidence(copy, checked) { findCopies.set(copy, knownAssignmentRows(checked)); }
async function coverAssignmentRange(copy, range) {
  const known = knownAssignmentRows(copy);
  if (!known.range || !range?.end || !known.range.end
    || compareDays(range.start, known.range.start) >= 0 && compareDays(range.end, known.range.end) <= 0) return copy;
  const window = { start: compareDays(range.start, known.range.start) < 0 ? range.start : known.range.start,
    end: compareDays(range.end, known.range.end) > 0 ? range.end : known.range.end };
  const checked = await copyWindow(window), fresh = knownAssignmentRows(checked);
  const overlap = fresh.rows.filter(row => compareDays(row.day, known.range.start) >= 0 && compareDays(row.day, known.range.end) <= 0);
  if (!compareCopies({days:known.rows},{days:overlap}).same || overlap.length !== known.rows.length
    || new Set(overlap.map(row=>row.id)).size !== overlap.length
    || known.rows.some(old => !overlap.some(row => old.id === row.id && old.notes === row.notes && compareCopies({days:[old]},{days:[row]}).same))) throw new PageError('The whole-week table changed since the checked read. Nothing was deleted.');
  retainAssignmentEvidence(copy, checked);
  return copy;
}
function retireAddRead() { pendingAddRead?.stop(); pendingAddRead = null; }
function scheduleWriteAttempt(kind) {
  retirePreflightForm();
  retireAddRead(); writeSequence++; lastWrite = { kind, document };
  recordRun({ type: 'writeAttempt', action: kind });
}
function rememberAddRead(copy, identity, sequence) {
  if (sequence !== writeSequence || lastWrite?.kind !== 'add' || lastWrite.document !== document) return;
  const doc = document, snapshot = JSON.stringify(copy);
  const events = ['click', 'contextmenu', 'input', 'change', 'visibilitychange'];
  let changed = false;
  const invalidate = () => { changed = true; stop(); };
  const observer = new doc.defaultView.MutationObserver(invalidate);
  const stop = () => {
    changed = true;
    observer.disconnect();
    for (const event of events) doc.removeEventListener(event, invalidate, true);
    doc.defaultView.removeEventListener('pagehide', invalidate);
  };
  observer.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
  for (const event of events) doc.addEventListener(event, invalidate, true);
  doc.defaultView.addEventListener('pagehide', invalidate);
  const proof = { stop, take(window, { noteRows = [] } = {}) {
    const dirty = changed || observer.takeRecords().length > 0;
    stop();
    if (pendingAddRead === proof) pendingAddRead = null;
    if (dirty || document !== doc || sequence !== writeSequence || JSON.stringify(copy) !== snapshot
      || compareDays(copy.window.start, window.start) !== 0 || compareDays(copy.window.end, window.end) !== 0) return null;
    if (copy.days.some(row => noteRows.some(old => compareDays(old.day, row.day) === 0 && valueKey(old.client) === valueKey(row.client))
      && typeof row.noteText !== 'string')) return null;
    try { checkPersonIdentity(identity); } catch { return null; }
    return copy;
  } };
  addReads.set(copy, proof); pendingAddRead = proof;
}
function reuseVerifiedAddRead(copy, window, options = {}) {
  const proof = copy && addReads.get(copy);
  if (!proof) return null;
  addReads.delete(copy);
  return proof.take(window, options);
}
const ENTRY_FIELDS = ['hours', 'jobCode', 'assignCode', 'assignCode2', 'client', 'wbs', 'billable', 'utilization', 'pricingId'];
function dayOf(text) {
  const match = String(text).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? dayFromParts(match[3], match[1], match[2]) : null;
}
async function copyWindowRecorded(window, { future = false, noteRows = [], reuseAfterAdd = false } = {}) {
  retireAddRead();
  const sequence = writeSequence;
  const identity = reuseAfterAdd ? personIdentity() : null;
  const edit = await findAssignments({ start: window.start, end: window.end, future });
  const queried = findAssignmentsRange(edit) || window;
  let rows, found, canRefreshNotes;
  try {
    rows = (await readEditTable(edit)).map(row => {
      const day = dayOf(row.date);
      if (!day) throw new PageError(`A row's date "${row.date}" could not be read.`);
      if (compareDays(day, queried.start) < 0 || (!future && compareDays(day, queried.end) > 0)) {
        throw new PageError(`The page gave a row outside the window (${row.date}); the copy is not trusted.`);
      }
      return { ...row, day };
    });
    found = rows;
    canRefreshNotes = !!edit.querySelector('.js-assignment-edit-edit-all');
    rows = rows.filter(row => compareDays(row.day, window.start) >= 0 && (future || compareDays(row.day, window.end) <= 0));
    for (const row of rows) {
      const day = dayOf(row.date);
      if (typeof row.noteText !== 'string' && day && noteRows.some(old => compareDays(old.day, day) === 0 && valueKey(old.client) === valueKey(row.client))) row.noteText = row.notes > 0 ? await readRowNote(edit, row.id) : '';
    }
  } catch (error) {
    await cleanupAfter(error, () => closeEdit(edit));
    throw error;
  }
  await closeEdit(edit);
  const days = rows;
  const end = future ? days.reduce((last, row) => compareDays(row.day, last) > 0 ? row.day : last, window.end) : window.end;
  const copy = { window: { ...window, end }, taken: localStamp(), days };
  findCopies.set(copy, { rows: found, range: queried, canRefreshNotes });
  if (reuseAfterAdd && !future) rememberAddRead(copy, identity, sequence);
  return copy;
}
const signature = row => ENTRY_FIELDS.map(field => (field === 'hours' ? String(row.hours) : valueKey(row[field]))).join('|');
function entriesToAdd(copy, { exact = false } = {}) {
  const problems = [];
  const notesLeft = copy.days.filter(row => row.notes > 0).length;
  const weekend = copy.days.filter(row => isWeekend(row.day));
  if (weekend.length) problems.push(`${weekend.length} weekend day${weekend.length === 1 ? '' : 's'} (${usDate(weekend[0].day)} …)`);
  const seen = new Set();
  for (const row of copy.days) {
    const key = `${usDate(row.day)}|${signature(row)}`;
    if (seen.has(key)) problems.push(`the same entry twice on ${usDate(row.day)}`);
    seen.add(key);
  }
  if (problems.length) return { problems, entries: [], notesLeft };
  const groups = new Map();
  for (const row of copy.days) {
    const key = signature(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const entries = [];
  for (const rows of groups.values()) {
    rows.sort((a, b) => compareDays(a.day, b.day));
    let run = null;
    for (const row of rows) {
      if (run && compareDays(nextWorkday(run.end), row.day) === 0) {
        run.end = row.day;
        run.pricingCaptured ||= row.pricingCaptured;
        continue;
      }
      run = {
        start: row.day, end: row.day, hoursPerDay: row.hours, client: row.client, wbs: row.wbs, billable: row.billable,
        utilization: row.utilization, pricingId: row.pricingId, pricingCaptured: row.pricingCaptured, jobCode: row.jobCode, assignCode: row.assignCode, assignCode2: row.assignCode2, notes: '',
      };
      entries.push(run);
    }
  }
  entries.sort((a, b) => compareDays(a.start, b.start) || a.client.localeCompare(b.client));
  if (exact) {
    const sets = new Map();
    for (const entry of entries) {
      const key = signature({ ...entry, hours: entry.hoursPerDay });
      if (!sets.has(key)) sets.set(key, { ...entry, dates: [] });
      const group = sets.get(key);
      group.pricingCaptured ||= entry.pricingCaptured;
      for (let day = entry.start; compareDays(day, entry.end) <= 0; day = nextWorkday(day)) group.dates.push(day);
      group.end = entry.end;
    }
    return { problems, entries: [...sets.values()], notesLeft };
  }
  return { problems, entries, notesLeft };
}
function compareCopiesRecorded(before, after) {
  const key = row => `${usDate(row.day)}|${signature(row)}`;
  const count = rows => rows.reduce((map, row) => map.set(key(row), (map.get(key(row)) || 0) + 1), new Map());
  const a = count(before.days);
  const b = count(after.days);
  const missing = [];
  const extra = [];
  for (const [k, n] of a) for (let i = (b.get(k) || 0); i < n; i++) missing.push(k);
  for (const [k, n] of b) for (let i = (a.get(k) || 0); i < n; i++) extra.push(k);
  return { same: !missing.length && !extra.length, missing, extra };
}
function copyWindow(...args) { return timedRun("read", () => copyWindowRecorded(...args)); }
function compareCopies(...args) { return timedRun("check", () => compareCopiesRecorded(...args)); }
__exports.knownAssignmentRows = knownAssignmentRows;
__exports.retainAssignmentEvidence = retainAssignmentEvidence;
__exports.coverAssignmentRange = coverAssignmentRange;
__exports.retireAddRead = retireAddRead;
__exports.scheduleWriteAttempt = scheduleWriteAttempt;
__exports.reuseVerifiedAddRead = reuseVerifiedAddRead;
__exports.ENTRY_FIELDS = ENTRY_FIELDS;
__exports.dayOf = dayOf;
__exports.entriesToAdd = entriesToAdd;
__exports.copyWindow = copyWindow;
__exports.compareCopies = compareCopies;
},
"mysource/checks.js": function (__require, __exports, document, window) {
'use strict';
const { timedRun } = __require("../core/run-records.js");
const { compareDays, usDate, workingDays, isWeekend } = __require("../rules/dates.js");
const { valueKey } = __require("../rules/prepare.js");
const sameDay = (a, b) => compareDays(a, b) === 0;
const LOA_CLIENT = 'Leave of Absence (LOA)';
const DNS_CLIENT = 'Do Not Schedule (DNS)';
function checkDnsAddedRecorded(copy, plan, hoursPerDay = 8) {
  const problems = [];
  for (const day of workingDays(plan.dnsStart, plan.dnsEnd)) {
    const rows = copy.days.filter(row => sameDay(row.day, day));
    if (rows.length !== 1 || valueKey(rows[0].client) !== valueKey(DNS_CLIENT)) {
      problems.push(`${usDate(day)}: DNS must be the only entry`);
      continue;
    }
    const row = rows[0];
    if (row.hours !== hoursPerDay || valueKey(row.billable) !== valueKey('Non-Billable') || valueKey(row.utilization) !== 'no' || (!plan.withoutNotes && !(row.notes > 0))) problems.push(`${usDate(day)}: DNS hours, settings or notes differ`);
  }
  for (const row of copy.days) {
    if (compareDays(row.day, plan.dnsStart) >= 0 && (compareDays(row.day, plan.dnsEnd) > 0 || isWeekend(row.day))) problems.push(`${usDate(row.day)}: entry left after the Exit clear`);
  }
  return { ok: !problems.length, problems };
}
function checkLoaAddedRecorded(copy, plan, hoursPerDay = 8) {
  const problems = [];
  for (const day of workingDays(plan.loaStart, plan.loaEnd)) {
    const rows = copy.days.filter(row => sameDay(row.day, day));
    const loa = rows.filter(row => valueKey(row.client) === valueKey(LOA_CLIENT));
    if (loa.length !== 1) problems.push(`${usDate(day)}: ${loa.length} LOA entries`);
    else {
      if (loa[0].hours !== hoursPerDay) problems.push(`${usDate(day)}: LOA ${loa[0].hours}h, not ${hoursPerDay}h`);
      if (valueKey(loa[0].billable) !== valueKey('Non-Billable') || valueKey(loa[0].utilization) !== 'no') problems.push(`${usDate(day)}: LOA must be Non-Billable / Utilization Generating No`);
      if (!(loa[0].notes > 0)) problems.push(`${usDate(day)}: the LOA has no notes`);
    }
    const others = rows.filter(row => !loa.includes(row));
    if (others.length) problems.push(`${usDate(day)}: ${others.length} other entr${others.length === 1 ? 'y' : 'ies'} still there (${others[0].client})`);
  }
  return { ok: problems.length === 0, problems };
}
function checkDnsAdded(...args) { return timedRun("check", () => checkDnsAddedRecorded(...args)); }
function checkLoaAdded(...args) { return timedRun("check", () => checkLoaAddedRecorded(...args)); }
__exports.LOA_CLIENT = LOA_CLIENT;
__exports.DNS_CLIENT = DNS_CLIENT;
__exports.checkDnsAdded = checkDnsAdded;
__exports.checkLoaAdded = checkLoaAdded;
},
"mysource/restore.js": function (__require, __exports, document, window) {
'use strict';
const { taxRestorePlan } = __require("./tax-restore.js");
const { cancelBatchWindows } = __require("./batch.js");
const { recordRun } = __require("../core/run-records.js");
const { PageError, withPersonGuard, cleanupAfter, stopFlagged, keepFlags } = __require("./dom.js");
const { addDays, compareDays, sameDay, todayOf, usDate } = __require("../rules/dates.js");
const { termDayOf } = __require("../rules/shared.js");
const { compareByDay, RESTORE_FIELDS, pastReportWarning } = __require("../run/backup.js");
const { closeEdit, findAssignments, findAssignmentsRange, readEditTable, readRowNote, personIdentity, checkPersonIdentity, scheduleFacts, pageReady, proveFindReopenAfter } = __require("./schedule.js");
const { createEditability } = __require("./editability.js");
const { deleteAll, deleteRange, addAssignment, preflightDates, setAssignmentHours } = __require("./write.js");
const { copyWindow, coverAssignmentRange, compareCopies, dayOf, entriesToAdd, ENTRY_FIELDS, reuseVerifiedAddRead, retireAddRead, knownAssignmentRows } = __require("./copy.js");
const { sameAssignmentRows } = __require("./note-stage.js");
const { valueKey, noteTextKey } = __require("../rules/prepare.js");
const compare = (backup, after) => {
  const differences = compareByDay(backup.window ? after.days.filter(row => within(row.day, backup.window)) : after.days, backup.days, null, Object.keys(RESTORE_FIELDS));
  const captured = new Set(backup.days.filter(row => row.pricingCaptured).map(row => usDate(row.day)));
  if (captured.size) {
    const priced = compareByDay(after.days.filter(row => captured.has(usDate(row.day))),
      backup.days.filter(row => captured.has(usDate(row.day))), null, [...Object.keys(RESTORE_FIELDS), 'pricingId']);
    for (let i = differences.length - 1; i >= 0; i--) if (captured.has(differences[i].date)) differences.splice(i, 1);
    differences.push(...priced); differences.sort((a, b) => a.iso.localeCompare(b.iso));
  }
  return {
    same: !differences.length, differences,
    missing: differences.filter(one => one.report > 0).map(one => one.message),
    extra: differences.filter(one => one.page > 0).map(one => one.message),
  };
};
const weekend = day => [0, 6].includes(new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay());
const within = (day, window) => compareDays(day, window.start) >= 0 && compareDays(day, window.end) <= 0;
function missingAssignments(backup, live) {
  const identity = row => JSON.stringify([valueKey(row.client), valueKey(row.wbs)]);
  const names = new Map();
  for (const row of [...backup, ...live]) {
    const key = JSON.stringify([valueKey(row.client).replace(/:\s*\d+\s*$/, ''), valueKey(row.wbs)]);
    if (!names.has(key)) names.set(key, new Set());
    names.get(key).add(identity(row));
  }
  if ([...names.values()].some(set => set.size > 1)) return null;
  const remaining = [...backup];
  const seen = new Set();
  for (const row of backup) {
    const key = `${usDate(row.day)}|${identity(row)}`;
    if (seen.has(key)) return null;
    seen.add(key);
  }
  for (const row of live) {
    const index = remaining.findIndex(old => compareDays(old.day, row.day) === 0 && identity(old) === identity(row));
    if (index < 0 || !compare({ days: [remaining[index]] }, { days: [row] }).same) return null;
    remaining.splice(index, 1);
  }
  if (remaining.some(row => live.some(old => compareDays(old.day, row.day) === 0 && identity(old) === identity(row)))) return null;
  return remaining.length ? remaining : null;
}
function changedRuns(differences, protectedDays = new Set()) {
  const days = [...new Map(differences.map(one => [one.iso, dayOf(one.date)])).values()];
  const runs = [];
  for (const day of days) {
    const previous = runs[runs.length - 1];
    let next = previous && addDays(previous.end, 1);
    while (next && compareDays(next, day) < 0 && weekend(next) && !protectedDays.has(usDate(next))) next = addDays(next, 1);
    if (next && sameDay(next, day)) previous.end = day;
    else runs.push({ start: day, end: day });
  }
  return runs;
}
const sameLive = (a, b, checkNoteText = true) => {
  const notes = copy => copy.days.map(row => JSON.stringify([usDate(row.day), ...ENTRY_FIELDS.map(field => field === 'hours' ? row.hours : valueKey(row[field])),
    row.notes || 0, checkNoteText && typeof row.noteText === 'string' ? noteTextKey(row.noteText) : null])).sort().join('\n');
  return compareCopies(a, b).same && notes(a) === notes(b);
};
const sameRetained = (a, b) => {
  const byId = new Map(b.days.map(row => [row.id, row]));
  return sameLive(a, b) && byId.size === b.days.length
    && new Set(a.days.map(row => row.id)).size === a.days.length
    && a.days.every(old => old.id && byId.has(old.id)
      && sameLive({ days: [old] }, { days: [byId.get(old.id)] }));
};
async function restorePlanRecorded(backup, { after = null, today = todayOf(), fullReport = false, automaticRecovery = false, move, verifyBefore = null } = {}) {
  const skippedPast = new Set(backup.days.filter(row => within(row.day, backup.window)
    && compareDays(row.day, today) < 0).map(row => usDate(row.day))).size;
  if (compareDays(backup.window.end, today) < 0) {
    return { skippedPast, skippedLater: [], changedDays: [], nothing: 'Nothing to put back: the whole backup window is before today.' };
  }
  const window = { start: compareDays(backup.window.start, today) < 0 ? today : backup.window.start,
    end: backup.window.end };
  const scoped = { ...backup, window, days: backup.days.filter(row => within(row.day, window)) };
  const { problems } = entriesToAdd(scoped);
  if (!fullReport && problems.length) throw new PageError(`This backup cannot be put back by Snooze: ${problems.join('; ')}.`);
  const changedNoteDays = new Set(after ? compare(scoped, after).differences.map(row => row.date) : []);
  for (const day of backup.noteChangedDays || []) changedNoteDays.add(usDate(day));
  const noteRows = after?.days.filter(row => changedNoteDays.has(usDate(row.day)) && typeof row.noteText === 'string') || [];
  const before = await copyWindow(window, { noteRows });
  await verifyBefore?.(before);
  const initial = compare(scoped, before);
  for (const day of backup.noteChangedDays || []) {
    const date = usDate(day);
    if (!within(day, window) || initial.differences.some(row => row.date === date)) continue;
    const noted = before.days.find(row => sameDay(row.day, day) && row.notes > 0);
    if (noted) initial.differences.push({ date, iso: `${day.y}-${String(day.m).padStart(2, '0')}-${String(day.d).padStart(2, '0')}`,
      client: noted.client, page: noted.hours, report: noted.hours, field: 'notes', message: `${date}: undo the replaced LOA note; restore the report's entries without notes.` });
  }
  initial.differences.sort((a, b) => a.iso.localeCompare(b.iso));
  const skippedLater = [];
  if (after) {
    const dates = new Map([...before.days, ...after.days].filter(row => within(row.day, window)).map(row => [usDate(row.day), row.day]));
    for (const day of [...dates.values()].sort(compareDays)) {
      const onDay = copy => ({ days: copy.days.filter(row => sameDay(row.day, day)) });
      if (!sameLive(onDay(after), onDay(before), changedNoteDays.has(usDate(day)))) skippedLater.push({ day, clients: [...new Set([...onDay(before).days, ...onDay(after).days].map(row => row.client))] });
    }
  }
  const protectedDays = new Set(skippedLater.map(row => usDate(row.day)));
  const skippedLocked = [];
  if (fullReport || automaticRecovery) {
    const candidates = [...new Map(initial.differences.map(row => [row.date, dayOf(row.date)])).values()];
    const termText = String(scheduleFacts().termDate ?? backup.termDate ?? '').trim();
    const term = termText ? termDayOf(termText) : null;
    if (termText && !term) throw new PageError('The Term Date cannot be read. Nothing was restored; By hand.');
    const permissions = createEditability({ today, term, move });
    for (const day of candidates) {
      const enabled = await permissions.enabled(day, { probeAfterTerm: automaticRecovery });
      if (!enabled) {
        skippedLocked.push(day); protectedDays.add(usDate(day));
      }
    }
    scoped.days = scoped.days.filter(row => !protectedDays.has(usDate(row.day)));
  }
  const differences = initial.differences.filter(row => !protectedDays.has(row.date));
  const changedDays = [...new Map(differences.map(row => [row.date, dayOf(row.date)])).values()];
  if (fullReport || automaticRecovery) {
    const changed = new Set(changedDays.map(usDate));
    const validation = entriesToAdd({ ...scoped, days: scoped.days.filter(row => changed.has(usDate(row.day))) });
    if (validation.problems.length) throw new PageError(`This backup cannot be put back by Snooze: ${validation.problems.join('; ')}.`);
  }
  return { window, scoped, before, skippedPast, skippedLater, skippedLocked, protectedDays, differences, changedDays,
    nothing: changedDays.length ? '' : 'Nothing left to undo.' };
}
async function restoreWindowRecorded(backup, { onStep = () => {}, onWrite = () => {}, today = todayOf(), after: provedAfter = null, previewBefore = null, fullReport = false, automaticRecovery = false, previewDays = null, move, verifyBefore = null } = {}) {
  const plan = await restorePlanRecorded(backup, { after: provedAfter, today, fullReport, automaticRecovery, move, verifyBefore });
  const { window, scoped, before, skippedPast, skippedLater, skippedLocked = [], changedDays, protectedDays } = plan;
  if (previewDays && changedDays.some(day => !previewDays.some(allowed => compareDays(day, allowed) === 0))) throw new PageError('The restore dates changed since the preview. Nothing was changed; preview again.');
  if (previewBefore && before && !sameLive(previewBefore, before)) throw new PageError('The schedule changed since the Undo preview. Nothing was changed; open Undo again.');
  if (plan.nothing) return { same: !automaticRecovery || !skippedLocked.length, unrestoredDates: skippedLocked.map(usDate), differences: automaticRecovery ? skippedLocked.map(day => ({ date: usDate(day), field: 'restore unconfirmed', message: `${usDate(day)}: restore unconfirmed; the day is locked.` })) : [], missing: [], extra: [], added: 0, runs: 0, skippedPast, skippedLater, skippedLocked, after: before || null,
    nothing: !provedAfter && !previewBefore && before ? 'Nothing to put back.' : plan.nothing };
  const restoreRuns = automaticRecovery ? changedDays.map(day => ({ start: day, end: day })) : changedRuns(plan.differences, protectedDays);
  const planned = restoreRuns.map(window => {
    const wanted = scoped.days.filter(row => within(row.day, window));
    const present = before.days.filter(row => within(row.day, window));
    const noteClearing = (backup.noteChangedDays || []).some(day => within(day, window));
    const missing = noteClearing ? null : missingAssignments(wanted, present);
    const days = missing || wanted;
    return { window, preserved: missing ? present : [], additionOnly: !!missing,
      days, entries: entriesToAdd({ days }, { exact: true }).entries };
  });
  await proveFindReopenAfter(planned.filter(run => !run.additionOnly).flatMap(run => before.days.filter(row => within(row.day, run.window))));
  const required = planned.flatMap(run => [...run.days.map(row => row.day), ...before.days.filter(row => within(row.day, run.window)).map(row => row.day)]);
  const firstAdditionOnly = planned[0].additionOnly;
  let preflightStarted = false, preflightDone = false;
  const preflight = async keepOpen => {
    preflightStarted = true;
    const capability = await preflightDates(required, { move, entries: planned.flatMap(run => run.entries), keepOpen });
    if (!capability.exact) for (const run of planned) run.entries = entriesToAdd({ days: run.days }).entries;
    preflightDone = true;
    return capability.modal;
  };
  if (!firstAdditionOnly) await preflight(false);
  let total = planned.reduce((sum, run) => sum + run.entries.length, 0);
  const proofIds = new WeakMap(); let proofSequence = 0;
  const recoveryFailures = [];
  let added = 0;
  let runs = 0;
  let weekBefore = before;
  for (const run of planned) {
    let entry = null;
    try {
      onStep({ step: 'clearing', runs, ofRuns: planned.length });
      let edit = await findAssignments(run.window);
      let weekBoxes = findAssignmentsRange(edit)?.weekBoxes;
      const range = findAssignmentsRange(edit), covered = weekBefore && knownAssignmentRows(weekBefore).range;
      if (weekBoxes && (!weekBefore || covered?.end && (compareDays(range.start, covered.start) < 0 || compareDays(range.end, covered.end) > 0))) {
        await closeEdit(edit);
        if (!weekBefore) weekBefore = await copyWindow(window);
        await coverAssignmentRange(weekBefore, range);
        edit = await findAssignments(run.window);
        weekBoxes = findAssignmentsRange(edit)?.weekBoxes;
      }
      let now;
      try {
        now = await readEditTable(edit);
        if (weekBoxes) {
          const range = findAssignmentsRange(edit), known = knownAssignmentRows(weekBefore);
          const expected = { days: known.rows.filter(row => within(row.day, range)) };
          const actual = { days: now.map(row => ({ ...row, day: dayOf(row.date) })) };
          if (!known.range || compareDays(range.start, known.range.start) < 0 || known.range.end && compareDays(range.end, known.range.end) > 0
            || actual.days.some(row => !row.day) || !sameAssignmentRows(expected, actual)) throw new PageError('The whole-week Undo table changed. Nothing was deleted.');
          now = now.filter(row => within(dayOf(row.date), run.window));
        }
        const wrong = now.filter(row => {
          const day = dayOf(row.date);
          return !day || !within(day, run.window);
        });
        if (wrong.length) throw new PageError(`The Edit Assignment table has ${wrong.length} row${wrong.length === 1 ? '' : 's'} outside the restore window (first: ${wrong[0].date}, ${wrong[0].client}). Nothing was deleted.`);
        const expected = { days: before.days.filter(row => within(row.day, run.window)) };
        const actual = { days: now.map(row => ({ ...row, day: dayOf(row.date) })) };
        await verifyBefore?.({ ...actual, window: run.window });
        for (const row of actual.days) {
          if (expected.days.some(old => usDate(old.day) === usDate(row.day) && valueKey(old.client) === valueKey(row.client) && typeof old.noteText === 'string')) {
            row.noteText = row.notes > 0 ? await readRowNote(edit, row.id) : '';
          }
        }
        if (!(run.additionOnly ? sameRetained(expected, actual) : sameLive(expected, actual))) throw new PageError('The schedule changed before Undo could clear these days. Nothing was deleted.');
      } catch (error) {
        await cleanupAfter(error, () => closeEdit(edit));
        throw error;
      }
      if (now.length && !run.additionOnly) {
        if (weekBoxes) weekBefore = await deleteRange(run.window, weekBefore, { edit, onWrite, read: () => copyWindow(window),
          validate: verifyBefore || (async () => {}) });
        else {
          await deleteAll(edit, { onWrite });
          if ((await copyWindow(run.window)).days.length) throw new PageError('The page still showed entries after the delete.');
        }
      } else await closeEdit(edit);
      let dateForm = !preflightDone ? await preflight(true) : null;
      total = planned.reduce((sum, run) => sum + run.entries.length, 0);
      const restoredDays = [...run.preserved];
      let lastAddCopy = null;
      for (entry of run.entries) {
        onStep({ step: 'adding', done: added, of: total, runs, ofRuns: planned.length });
        const preflightForm = dateForm;
        dateForm = null;
        await addAssignment(entry, 'Normal', { onWrite, move, preflightForm });
        const dates = entry.dates || (() => {
          const days = [];
          for (let day = entry.start; compareDays(day, entry.end) <= 0; day = addDays(day, 1)) if (!weekend(day)) days.push(day);
          return days;
        })();
        for (const day of dates) restoredDays.push({ ...entry, day, hours: entry.hoursPerDay });
        const afterEntry = await copyWindow({ start: entry.start, end: entry.end }, { noteRows: run.preserved.filter(row => typeof row.noteText === 'string'), reuseAfterAdd: true });
        proofIds.set(afterEntry, ++proofSequence);
        recordRun({ type: 'restoreRead', purpose: 'afterAdd', rows: afterEntry.days.length, selected: dates.length, proof: proofIds.get(afterEntry), result: 'passed', scope: { start: usDate(afterEntry.window.start), end: usDate(afterEntry.window.end) }, reused: false });
        const expected = { days: restoredDays.filter(row => within(row.day, afterEntry.window)) };
        if (!compare(expected, afterEntry).same) throw new PageError('The page did not show the entry as backed up.');
        const preserved = { days: run.preserved.filter(row => within(row.day, afterEntry.window)) };
        const preservedAfter = { days: afterEntry.days.filter(row => preserved.days.some(old => usDate(old.day) === usDate(row.day) && valueKey(old.client) === valueKey(row.client) && valueKey(old.wbs) === valueKey(row.wbs))) };
        if (!sameRetained(preserved, preservedAfter)) throw new PageError('Existing entries changed during the addition-only restore.');
        recordRun({ type: 'restoreComparison', purpose: 'afterAdd', proof: proofIds.get(afterEntry), ok: true });
        lastAddCopy = afterEntry;
        added += 1;
      }
      const freshRun = reuseVerifiedAddRead(lastAddCopy, run.window, { noteRows: run.preserved.filter(row => typeof row.noteText === 'string') });
      const completedRun = freshRun || await copyWindow(run.window);
      if (!freshRun) proofIds.set(completedRun, ++proofSequence);
      recordRun({ type: 'restoreRead', purpose: 'completedRun', rows: completedRun.days.length, proof: proofIds.get(completedRun), result: 'passed', scope: { start: usDate(run.window.start), end: usDate(run.window.end) }, reused: !!freshRun });
      if (!compare({ days: scoped.days.filter(row => within(row.day, run.window)) }, completedRun).same) {
        throw new PageError('The page did not show the run as backed up.');
      }
      recordRun({ type: 'restoreComparison', purpose: 'completedRun', proof: proofIds.get(completedRun), ok: true });
      weekBefore = weekBoxes ? await copyWindow(window) : null;
      runs += 1;
    } catch (error) {
      const where = entry ? `${usDate(entry.start)} to ${usDate(entry.end)}, ${entry.client}`
        : `${usDate(run.window.start)} to ${usDate(run.window.end)}`;
      const stopped = new PageError(`${added} of ${total} entries were put back and checked. Restore stopped at ${where}: ${error.message} ${runs} of ${planned.length} runs were put back and checked.`);
      stopped.cause = error;
      if (error.cleanupErrors) stopped.cleanupErrors = error.cleanupErrors;
      stopped.restoreProgress = { added, total, runs, totalRuns: planned.length, affectedDays: changedDays, failedWindow: run.window };
      if (error.deleteDiagnostics) stopped.deleteDiagnostics = error.deleteDiagnostics;
      keepFlags(error, stopped);
      if (!automaticRecovery || stopFlagged(stopped) || preflightStarted && !preflightDone) throw stopped;
      recoveryFailures.push({ window: run.window, message: stopped.message, progress: stopped.restoreProgress });
      const failures = stopped.cleanupErrors?.length || 0;
      await cleanupAfter(stopped, async () => { await cancelBatchWindows(); await pageReady('between recovery days'); });
      if ((stopped.cleanupErrors?.length || 0) > failures) { stopped.pageBlocked = true; throw stopped; }
      if (!preflightDone) await preflight(false);
    }
  }
  onStep({ step: 'checking' });
  let after;
  try {
    after = await copyWindow(window, { noteRows: before.days.filter(row => typeof row.noteText === 'string') });
  } catch (error) {
    const stopped = new PageError(`${added} of ${total} entries were put back and checked. ${runs} of ${planned.length} runs were put back and checked. The final copy could not be read: ${error.message}`);
    stopped.restoreProgress = { added, total, runs, totalRuns: planned.length, affectedDays: changedDays, failedWindow: window };
    keepFlags(error, stopped);
    throw stopped;
  }
  proofIds.set(after, ++proofSequence);
  recordRun({ type: 'restoreRead', purpose: 'wholeRestore', rows: after.days.length, proof: proofIds.get(after), result: 'passed', scope: { start: usDate(window.start), end: usDate(window.end) }, reused: false });
  const touched = new Set(changedDays.map(usDate));
  const onlyTouched = copy => ({ days: copy.days.filter(row => touched.has(usDate(row.day))) });
  const untouched = copy => ({ days: copy.days.filter(row => !touched.has(usDate(row.day))) });
  const expected = { days: [...onlyTouched(scoped).days, ...untouched(before).days] };
  const result = compare(expected, after);
  if (!sameLive(untouched(before), untouched(after))) {
    result.same = false;
    result.problems = ['Days outside Undo changed during the restore; Undo could not be proved.'];
  }
  const preserved = planned.flatMap(run => run.preserved);
  if (!sameRetained({ days: preserved }, { days: after.days.filter(row => preserved.some(old => usDate(old.day) === usDate(row.day) && valueKey(old.client) === valueKey(row.client) && valueKey(old.wbs) === valueKey(row.wbs))) })) {
    result.same = false;
    result.problems = [...(result.problems || []), 'Existing entries changed during the addition-only restore.'];
  }
  recordRun({ type: 'restoreComparison', purpose: 'wholeRestore', proof: proofIds.get(after), ok: result.same });
  const unrestoredDates = [...new Set([...skippedLocked.map(usDate), ...result.differences.map(row => row.date),
    ...recoveryFailures.flatMap(failure => changedDays.filter(day => within(day, failure.window)).map(usDate))])];
  if (automaticRecovery && unrestoredDates.length) {
    result.same = false;
    for (const date of unrestoredDates) if (!result.differences.some(row => row.date === date)) result.differences.push({
      date, field: 'restore unconfirmed', message: `${date}: restore unconfirmed; the backed-up day could not be put back and checked.`,
    });
  }
  return { ...result, added, runs, skippedPast, skippedLater, skippedLocked, after, unrestoredDates, recoveryFailures };
}
function restorePlan(backup, options = {}) {
  const identity = options.identity || personIdentity();
  return withPersonGuard(probe => checkPersonIdentity(identity, 'identity check', probe), async () => ({
    ...await (backup.site === 'tax' ? taxRestorePlan : restorePlanRecorded)(backup, options), identity,
  }));
}
function restoreWindow(backup, options = {}) {
  const identity = options.identity || personIdentity();
  return withPersonGuard(probe => checkPersonIdentity(identity, 'identity check', probe), async () => ({ ...await (backup.site === 'tax' ? restoreTaxWindow : restoreWindowRecorded)(backup, options), warning: pastReportWarning(backup) })).finally(retireAddRead);
}
async function restoreTaxWindow(backup, options = {}) {
  const on = (copy, day) => ({ days: copy.days.filter(row => sameDay(row.day, day)) });
  const equal = (a, b) => compareCopies(a, b).same;
  const sameLive = (a, b) => equal(a, b) && a.days.every(old => b.days.some(row => row.id === old.id && row.notes === old.notes
    && (typeof old.noteText !== 'string' || noteTextKey(row.noteText || '') === noteTextKey(old.noteText))));
  const { today = todayOf(), onWrite = () => {}, automaticRecovery = false, previewBefore, previewDays } = options;
  const plan = await taxRestorePlan(backup, options);
  if (previewBefore && !sameLive(previewBefore, plan.before)) throw new PageError('The schedule changed since the Undo preview. Nothing was changed; open Undo again.');
  if (previewDays && plan.changedDays.some(day => !previewDays.some(old => sameDay(old, day)))) throw new PageError('The restore dates changed since the preview. Nothing was changed; preview again.');
  const future = plan.changedDays.filter(day => compareDays(day, today) >= 0);
  if (future.length) await preflightDates(future, { anchor: future[0] });
  let current = plan.before, added = 0, runs = 0;
  const failures = [];
  const prove = async expected => {
    const after = await copyWindow(plan.window);
    if (!equal({ days: expected }, after) || expected.some(old => old.id && !after.days.some(row => row.id === old.id && row.notes === old.notes))
      || after.days.some(row => !expected.some(old => old.id === row.id) && row.notes > 0)) throw new PageError('The Tax restore step could not be proved.');
    current = after;
  };
  for (const day of plan.changedDays) {
    try {
      const step = plan.steps.find(step => sameDay(step.day, day));
      for (const { old, row } of step.retained) {
        const target = current.days.find(target => target.id === row.id);
        if (target.hours === old.hours) continue;
        await setAssignmentHours(plan.window, current, target, old.hours, { onWrite, restoring: true });
        await prove(current.days.map(row => row.id === target.id ? { ...row, hours: old.hours } : row));
      }
      if (step.remove.length) {
        const edit = await findAssignments({ start: day, end: day,
          ...(step.retained.length ? { clients: [...new Set(step.remove.map(row => row.client))] } : {}) });
        try {
          const actual = { days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) };
          if (!equal({ days: step.remove }, actual) || step.remove.some(old => !actual.days.some(row => row.id === old.id && row.notes === old.notes))) throw new PageError('The Tax restore table changed. Nothing was deleted.');
        } catch (error) { await cleanupAfter(error, () => closeEdit(edit)); throw error; }
        await deleteAll(edit, { onWrite });
        await prove(current.days.filter(row => !step.remove.some(old => old.id === row.id)));
      }
      for (const old of step.add) {
        await addAssignment({ client: old.client, wbs: old.wbs, jobCode: old.jobCode, start: day, end: day, hoursPerWeek: old.hours, notes: '' }, 'Normal', { onWrite });
        await prove([...current.days, { ...old, id: '', notes: 0 }]); added++;
      }
      runs++;
    } catch (error) {
      if (!automaticRecovery || stopFlagged(error)) throw error;
      failures.push({ day, message: error.message });
      await cancelBatchWindows(); await pageReady('between Tax recovery dates');
      current = await copyWindow(plan.window);
    }
  }
  const after = await copyWindow(plan.window, { noteRows: plan.before.days.filter(row => typeof row.noteText === 'string') });
  const touched = row => plan.changedDays.some(day => sameDay(day, row.day));
  const expected = { days: [...backup.days.filter(touched), ...plan.before.days.filter(row => !touched(row))] };
  const comparison = compareCopies(expected, after);
  if (!sameLive({ days: plan.before.days.filter(row => !touched(row)) }, { days: after.days.filter(row => !touched(row)) })) comparison.same = false;
  const unrestoredDates = [...new Set([...plan.skippedUnconfirmed.map(usDate), ...plan.skippedLocked.map(usDate), ...failures.map(row => usDate(row.day)), ...plan.changedDays.filter(day => !equal(on(expected, day), on(after, day))).map(usDate)])];
  return { ...plan, same: comparison.same && !plan.skippedUnconfirmed.length && (!automaticRecovery || !unrestoredDates.length), after, added, runs, unrestoredDates,
    differences: unrestoredDates.map(date => ({ date, message: `${date}: Tax restore unconfirmed.` })), missing: [], extra: [], recoveryFailures: failures };
}
__exports.missingAssignments = missingAssignments;
__exports.restorePlan = restorePlan;
__exports.restoreWindow = restoreWindow;
},
"mysource/calendar.js": function (__require, __exports, document, window) {
'use strict';
const { addDays, compareDays, sameDay, mondayOf, readIsoDay, usDate } = __require("../rules/dates.js");
const { PageError, WAIT, click, closeWindow, describe, keepFlags, settled, shown, text, typeInto, waitFor } = __require("./dom.js");
const { calendarView, isScheduleContent, onScreen, pageReady } = __require("./schedule.js");
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const readTitleDay = value => {
  const match = String(value).trim().match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/);
  const m = match ? MONTHS.indexOf(match[1].toLowerCase()) + 1 : 0;
  return m ? { y: Number(match[3]), m, d: Number(match[2]) } : null;
};
const titleWithIcon = (view = calendarView()) => {
  const active = view?.closest('.fc'), wrapper = view?.closest('.staff-calendar-wrapper');
  const roots = wrapper?.querySelector('[id^="controlCalendar_"] > .fc-toolbar')
    ? [wrapper] : [active, wrapper].filter(Boolean);
  if (!roots.length) roots.push(document);
  for (const root of roots) {
    const titles = [...root.querySelectorAll('.fc-center h2')].filter(isScheduleContent)
      .filter(node => onScreen(node) && node.querySelector('i[class*="calendar"]'));
    if (titles.length > 1) throw new PageError('More than one heading in the active calendar; Snooze will not guess.');
    if (titles.length) return titles[0];
  }
  return null;
};
function shownRange(view = calendarView()) {
  const h2 = titleWithIcon(view);
  const own = h2 ? [...h2.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ').replace(/\s+/g, ' ').trim() : '';
  const [from, to] = own.split(/\s+[–—-]\s+/);
  const start = readTitleDay(from || '');
  const end = readTitleDay(to || '');
  return start && end ? { start, end } : null;
}
const toNumber = day => day.y * 10000 + day.m * 100 + day.d;
const rangeHolds = (range, day) => Boolean(range && toNumber(range.start) <= toNumber(day) && toNumber(day) <= toNumber(range.end));
function calendarHolds(day) {
  const monday = mondayOf(day);
  const view = calendarView();
  return [...(view?.querySelectorAll('td.fc-day[data-date]') || [])].filter(onScreen).some(cell => {
    const date = readIsoDay(cell.getAttribute('data-date'));
    return date && (sameDay(date, day) || sameDay(date, monday));
  }) || rangeHolds(shownRange(view), day);
}
function calendarDates() {
  const view = calendarView();
  const dates = [...(view?.querySelectorAll('td.fc-day[data-date]') || [])]
    .filter(onScreen).map(cell => readIsoDay(cell.getAttribute('data-date'))).filter(Boolean).sort(compareDays);
  return { heading: shownRange(view), cells: { count: dates.length, first: dates[0] || null, last: dates.at(-1) || null } };
}
function pictureWeeksHold(start, end) {
  const view = calendarView();
  if (!view?.classList.contains('fc-weeklyTimeline-view')) return false;
  const dates = [...view.querySelectorAll('td.fc-day[data-date]')].filter(onScreen)
    .map(cell => readIsoDay(cell.getAttribute('data-date')));
  if (!dates.length || dates.some(date => !date)) return false;
  const weeks = new Set(dates.map(toNumber));
  const first = mondayOf(start), last = mondayOf(end);
  if (compareDays(first, last) > 0) return false;
  for (let week = first; compareDays(week, last) <= 0; week = addDays(week, 7)) {
    if (!weeks.has(toNumber(week))) return false;
  }
  return true;
}
function exactPictureRange(day) {
  try {
    const view = calendarView();
    if (!view?.classList.contains('fc-weeklyTimeline-view')) return null;
    const range = shownRange(view);
    if (!range || !sameDay(range.start, mondayOf(day)) || !rangeHolds(range, day)) return null;
    const dates = [...view.querySelectorAll('td.fc-day[data-date]')].filter(onScreen)
      .map(cell => readIsoDay(cell.getAttribute('data-date')));
    if (!dates.length || dates.some(date => !date)) return null;
    const unique = [...new Map(dates.map(date => [toNumber(date), date])).values()].sort(compareDays);
    const weeks = [];
    for (let date = range.start; compareDays(date, range.end) <= 0; date = addDays(date, 7)) weeks.push(date);
    if (unique.length !== weeks.length || unique.some((date, i) => !sameDay(date, weeks[i]))
      || !sameDay(range.end, addDays(weeks.at(-1), 4))) return null;
    return range;
  } catch { return null; }
}
async function showDate(day, { cellProof = true } = {}) {
  const h2 = titleWithIcon();
  if (!h2) throw new PageError('The calendar icon next to the date was not found.');
  const icon = h2.querySelector('i[class*="calendar"]');
  const before = new Set(document.querySelectorAll('.modal'));
  const titleBefore = JSON.stringify(shownRange());
  const monday = mondayOf(day);
  const weekCell = () => [...(calendarView()?.querySelectorAll('td.fc-day[data-date]') || [])]
    .filter(onScreen).find(node => {
      const date = readIsoDay(node.getAttribute('data-date'));
      return date && sameDay(date, monday);
    });
  const cellBefore = weekCell();
  await click(icon);
  const box = await waitFor(() => [...document.querySelectorAll('input.js-dynamic-calendar-jump-date')].find(node => shown(node) && !before.has(node.closest('.modal'))), 'the go-to-date window');
  const modal = await settled(box.closest('.modal') || box.parentElement);
  const ok = [...modal.querySelectorAll('button.bootbox-accept')].find(shown)
    || [...modal.querySelectorAll('button')].find(button => shown(button) && ['ok', 'submit', 'go', 'jump', 'apply'].includes(text(button).toLowerCase()));
  if (!ok) {
    const buttons = [...modal.querySelectorAll('button')].filter(shown).map(button => `${describe(button)} "${text(button).replace(/[A-Za-z]/g, 'a')}"`).join(', ');
    const error = new PageError(`The go-to-date window has no OK Snooze knows (buttons: ${buttons || 'none'}).`);
    await closeWindow(modal, 'the go-to-date window').catch(closeError => { keepFlags(closeError, error); });
    throw error;
  }
  await typeInto(box, usDate(day));
  await click(ok);
  await waitFor(() => !modal.isConnected || !shown(modal), 'the go-to-date window to close', WAIT.window).catch(async error => {
    await closeWindow(modal, 'the go-to-date window').catch(closeError => { keepFlags(closeError, error); });
    throw error;
  });
  const movingSince = Date.now();
  const range = await waitFor(() => {
    const now = shownRange();
    if (!now && Date.now() - movingSince >= Math.min(1000, WAIT.window / 4)) {
      const { cells } = calendarDates();
      const dated = cells.first && cells.last ? { start: cells.first, end: cells.last } : null;
      if (rangeHolds(dated, day)) return dated;
    }
    const movedOrClamped = JSON.stringify(now) !== titleBefore
      || rangeHolds(now, day) && Date.now() - movingSince >= Math.min(1000, WAIT.window / 4);
    if (cellProof) {
      const cell = weekCell();
      if (cell && (cell !== cellBefore || movedOrClamped || now && sameDay(now.start, monday))) {
        return rangeHolds(now, day) ? now : { start: monday, end: addDays(monday, 6) };
      }
    }
    if (now && toNumber(now.start) === toNumber(monday)) return now;
    return movedOrClamped && rangeHolds(now, day) ? now : null;
  }, `the calendar to show ${usDate(day)}`, WAIT.window);
  await pageReady(`after moving the calendar to ${usDate(day)}`);
  return range;
}
__exports.titleWithIcon = titleWithIcon;
__exports.shownRange = shownRange;
__exports.rangeHolds = rangeHolds;
__exports.calendarHolds = calendarHolds;
__exports.calendarDates = calendarDates;
__exports.pictureWeeksHold = pictureWeeksHold;
__exports.exactPictureRange = exactPictureRange;
__exports.showDate = showDate;
},
"files/note-picture-info.js": function (__require, __exports, document, window) {
'use strict';
const notePictureInfo = { selector: 'not shown', week: 'not shown' };
__exports.notePictureInfo = notePictureInfo;
},
"mysource/note-picture.js": function (__require, __exports, document, window) {
'use strict';
const { tilesOnScreen } = __require("./schedule.js");
const { shown, guardReady } = __require("./dom.js");
const { rangeHolds, shownRange } = __require("./calendar.js");
const { compareDays, mondayOf, usDate } = __require("../rules/dates.js");
const { noteTextKey, valueKey } = __require("../rules/prepare.js");
const { notePictureInfo } = __require("../files/note-picture-info.js");
const DATED = /(\d{1,2}\/\d{1,2}\/\d{4}):\s*/;
function noteKind(texts, newNote) {
  const wanted = noteTextKey(newNote);
  const notes = [...new Set(texts.map(noteTextKey).filter(Boolean))];
  if (!wanted || !notes.includes(wanted)) return 'other';
  return notes.length === 1 ? 'alone' : notes.length === 2 ? 'pair' : 'other';
}
const hoverNotes = words => String(words || '').split(DATED).filter((part, i) => i % 2 === 0 && i > 0);
async function hoverNotePicture(client, readBack = [], newNote = '') {
  notePictureInfo.selector = 'not shown';
  notePictureInfo.week = 'first note';
  const range = shownRange();
  const rows = readBack.filter(row => valueKey(row.client) === valueKey(client) && row.notes > 0 && rangeHolds(range, row.day)).sort((a, b) => compareDays(a.day, b.day));
  const tiles = tilesOnScreen().filter(tile => tile.textContent.includes(client));
  const icons = tiles.map(tile => tile.querySelector('i.fa-note-sticky, i.fa-sticky-note, [class*="note"]')).filter(node => node && shown(node));
  if (!icons.length) throw new Error('No assignment note icon in view.');
  const tooltipSelector = '.tooltip, .popover, [role="tooltip"]';
  const visibleTooltip = node => {
    if (!shown(node) || node.getAttribute('aria-hidden') === 'true') return false;
    for (let at = node; at?.nodeType === 1; at = at.parentElement) {
      const opacity = window.getComputedStyle(at).opacity;
      if (opacity !== '' && Number(opacity) === 0) return false;
    }
    return true;
  };
  let icon = icons[0], fallback = null;
  const leave = () => { for (const type of ['mouseout', 'mouseleave']) icon.dispatchEvent(new window.MouseEvent(type, { bubbles: type === 'mouseout', view: window })); };
  const cleanup = () => { leave(); fallback?.remove(); };
  const hover = async target => {
    leave(); icon = target;
    const before = new Set([...document.querySelectorAll(tooltipSelector)].filter(shown));
    for (const type of ['mouseover', 'mouseenter']) icon.dispatchEvent(new window.MouseEvent(type, { bubbles: type === 'mouseover', view: window }));
    const created = [...document.querySelectorAll(tooltipSelector)].filter(node => !before.has(node));
    const synchronous = created.length === 1 ? created[0] : null;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      await guardReady(Math.max(0, deadline - Date.now()));
      if (!icon.isConnected) return null;
      const described = (icon.getAttribute('aria-describedby') || '').split(/\s+/).map(id => document.getElementById(id)).filter(node => node?.matches(tooltipSelector));
      const candidates = described.length ? described : synchronous ? [synchronous] : [];
      const owned = candidates.filter(node => node.isConnected && visibleTooltip(node) && node.textContent.trim());
      if (Date.now() >= deadline) return null;
      if (owned.length === 1) return owned[0];
      await new Promise(resolve => setTimeout(resolve, Math.min(50, deadline - Date.now())));
    }
    return null;
  };
  const found = tooltip => {
    notePictureInfo.selector = tooltip.matches('.tooltip') ? '.tooltip' : tooltip.matches('.popover') ? '.popover' : '[role=tooltip]';
    return { tooltip, cleanup };
  };
  try {
    let tooltip = await hover(icons[0]);
    if (tooltip) {
      let pair = null;
      for (const [index, candidate] of icons.entries()) {
        if (index) tooltip = await hover(candidate);
        if (!tooltip) continue;
        const kind = noteKind(hoverNotes(tooltip.textContent), newNote);
        if (kind === 'alone') { notePictureInfo.week = 'new note alone'; return found(tooltip); }
        if (kind === 'pair' && pair === null) pair = index;
      }
      notePictureInfo.week = pair === null ? 'first note' : 'two notes';
      tooltip = await hover(icons[pair ?? 0]);
      if (tooltip) return found(tooltip);
    }
    const weeks = new Map();
    for (const row of rows.filter(row => !row.noteTextSubmitted && typeof row.noteText === 'string' && row.noteText.trim())) {
      const monday = usDate(mondayOf(row.day));
      if (!weeks.has(monday)) weeks.set(monday, []);
      const week = weeks.get(monday);
      if (!week.some(seen => noteTextKey(seen.noteText) === noteTextKey(row.noteText))) week.push(row);
    }
    const list = [...weeks.values()];
    if (!list.length) throw new Error('No read-back note text in view for the picture.');
    let pick = list.findIndex(week => noteKind(week.map(row => row.noteText), newNote) === 'alone');
    notePictureInfo.week = pick >= 0 ? 'new note alone' : 'two notes';
    if (pick < 0) pick = list.findIndex(week => noteKind(week.map(row => row.noteText), newNote) === 'pair');
    if (pick < 0) { pick = 0; notePictureInfo.week = 'first note'; }
    leave(); icon = icons[Math.min(pick, icons.length - 1)];
    const box = icon.getBoundingClientRect();
    const font = window.getComputedStyle(icon.closest('.fc-event'));
    fallback = document.createElement('div');
    fallback.setAttribute('role', 'tooltip');
    Object.assign(fallback.style, { position: 'fixed', left: `${Math.min(box.right + 10, Math.max(10, window.innerWidth - 340))}px`, top: `${Math.max(8, box.top)}px`, maxWidth: '320px', padding: '8px 10px', boxSizing: 'border-box', background: 'white', border: '1px solid #bbb', borderRadius: '3px', color: '#333', font: font.font || `${font.fontSize} ${font.fontFamily}`, lineHeight: '1.4', overflowWrap: 'anywhere', zIndex: '2147483644' });
    const arrow = document.createElement('span');
    arrow.className = 'tooltip-arrow';
    arrow.style.cssText = 'position:absolute;left:-7px;top:8px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-right:7px solid #bbb';
    const arrowInside = document.createElement('span');
    arrowInside.className = 'tooltip-arrow';
    arrowInside.style.cssText = 'position:absolute;left:-6px;top:9px;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-right:6px solid white';
    fallback.append(arrow, arrowInside);
    for (const row of list[pick]) {
      const words = document.createElement('div');
      words.textContent = `${usDate(row.day)}: ${row.noteText}`;
      fallback.append(words);
    }
    document.body.append(fallback);
    notePictureInfo.selector = 'fallback';
    return { tooltip: fallback, cleanup };
  } catch (error) { cleanup(); throw error; }
}
__exports.noteKind = noteKind;
__exports.hoverNotes = hoverNotes;
__exports.hoverNotePicture = hoverNotePicture;
},
"screen/session-clock.js": function (__require, __exports, document, window) {
'use strict';
const { COLOURS } = __require("../family/look.js");
const SESSION_MS = 60 * 60 * 1000;
const PERSON_RESERVE_MS = 8 * 60 * 1000;
const CONFIRM_RESERVE_MS = 5 * 60 * 1000;
const SESSION_WORDS = {
  pause: 'Less than 8 minutes left: no new person starts.',
  reload: 'Press Save files, reload, sign in, then load an export without the people already done (see the saved Excel).',
  confirm: 'MySource session ends soon: reload the page and sign in first.',
};
function createSessionClock({ now = () => Date.now(), origin = globalThis.window?.performance?.timeOrigin } = {}) {
  const start = Number.isFinite(origin) && origin > 0 ? origin : now();
  return { left: () => SESSION_MS - (now() - start) };
}
function clockFace(left) {
  const seconds = Math.floor(Math.abs(left) / 1000);
  const minutes = String(Math.floor(seconds / 60));
  const text = `${left < 0 ? '−' : ''}${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  const stage = left <= PERSON_RESERVE_MS ? 2 : left <= 15 * 60 * 1000 ? 1 : 0;
  return { text, stage, colour: [COLOURS.muted, COLOURS.amber, COLOURS.redText][stage],
    title: left < 0 ? `About ${text.slice(1)} past the usual time. No new person starts under 8:00.`
      : `About ${text} left (counted from when this page was opened). No new person starts under 8:00.` };
}
function paintClock(node, left, previousStage, reducedMotion = false) {
  const face = clockFace(left);
  node.textContent = face.text; node.title = face.title; node.style.color = face.colour;
  if (previousStage !== undefined && face.stage > previousStage && !reducedMotion) {
    node.classList.remove('clock-warn'); void node.offsetWidth; node.classList.add('clock-warn');
  }
  return face.stage;
}
__exports.SESSION_MS = SESSION_MS;
__exports.PERSON_RESERVE_MS = PERSON_RESERVE_MS;
__exports.CONFIRM_RESERVE_MS = CONFIRM_RESERVE_MS;
__exports.SESSION_WORDS = SESSION_WORDS;
__exports.createSessionClock = createSessionClock;
__exports.clockFace = clockFace;
__exports.paintClock = paintClock;
},
"files/report-time.js": function (__require, __exports, document, window) {
'use strict';
const { PageError } = __require("../mysource/dom.js");
const REPORT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const REPORT_CLOCK_SKEW_MS = 5 * 60 * 1000;
function reportTimeLine(time) {
  const local = value => { const date = new Date(value); return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`; };
  return `Staff Schedule Hours Report · pulled ${local(time)} · use by ${local(time + REPORT_MAX_AGE_MS)}`;
}
const REPORT_TIME_WORDS = {
  unreadable: 'The Staff Schedule Hours Report pull time could not be read. Pull the Staff Schedule Hours Report again with its date and time in the file or name.',
  old: 'The Staff Schedule Hours Report is older than 2 hours. Pull it again before starting the batch.',
  future: 'The Staff Schedule Hours Report pull time is in the future. Check the clock and pull it again.',
};
function timestamp(value) {
  const match = String(value).trim().match(/^(\d{4})[-_](\d{2})[-_](\d{2})[T _](\d{2})[:_-](\d{2})(?:[:_-](\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/)
    || String(value).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!match) return null;
  let [y, m, d, h, minute, s] = match.slice(1, 7).map(n => Number(n || 0));
  if (String(value).includes('/')) [y, m, d] = [d, y, m];
  const check = new Date(Date.UTC(y, m - 1, d, h, minute, s));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d
    || h > 23 || minute > 59 || s > 59) return null;
  if (!match[7]) return null;
  const offset = match[7];
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.replace(':', '').slice(3)) > 59)) return null;
  return Date.parse(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(s).padStart(2, '0')}${offset}`);
}
function filenameTime(fileName) {
  const name = String(fileName ?? '');
  const match = name.match(/^Staff Scheduled Hours Report (Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}) (\d{4}) (\d{2})\.(\d{2})\.(\d{2}) GMT([+-])(\d{2})(\d{2})(?: \([1-9]\d*\))?\.(?:xlsx|csv)$/);
  if (!match || match[0] !== name) return null;
  const [, weekday, month, day, year, hour, minute, second, sign, offsetHour, offsetMinute] = match;
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month) + 1;
  const time = timestamp(`${year}-${String(m).padStart(2, '0')}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`);
  if (!Number.isFinite(time)) return null;
  const writtenDay = new Date(Date.UTC(Number(year), m - 1, Number(day))).getUTCDay();
  if (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][writtenDay] !== weekday) return null;
  return { time, source: 'report name' };
}
function reportPullTime(rows, fileName) {
  const candidates = [];
  const fromName = filenameTime(fileName);
  if (fromName) candidates.push(fromName);
  let invalid = !fromName && String(fileName ?? '').startsWith('Staff Scheduled Hours Report');
  const label = /^(?:report\s+)?(?:generated(?:\s+(?:on|at))?|pulled(?:\s+(?:on|at))?|run\s+(?:date|time)|pull\s+time|generation\s+(?:date|time))\s*:?\s*(.*)$/i;
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const match = String(row[i] ?? '').trim().match(label);
      if (!match) continue;
      const time = timestamp(match[1] || row[i + 1]);
      if (!Number.isFinite(time)) invalid = true;
      else candidates.push({ time, source: 'report data' });
    }
  }
  if (invalid || !candidates.length || new Set(candidates.map(one => one.time)).size !== 1) return null;
  return { ...candidates[0] };
}
function requireFreshReport(report, now = Date.now()) {
  const time = report?.pullTime?.time;
  const fail = words => Object.assign(new PageError(words), { batchWide: true });
  if (!Number.isFinite(time)) throw fail(REPORT_TIME_WORDS.unreadable);
  if (time - now > REPORT_CLOCK_SKEW_MS) throw fail(REPORT_TIME_WORDS.future);
  if (now - time > REPORT_MAX_AGE_MS) throw fail(REPORT_TIME_WORDS.old);
}
__exports.REPORT_MAX_AGE_MS = REPORT_MAX_AGE_MS;
__exports.REPORT_CLOCK_SKEW_MS = REPORT_CLOCK_SKEW_MS;
__exports.reportTimeLine = reportTimeLine;
__exports.REPORT_TIME_WORDS = REPORT_TIME_WORDS;
__exports.reportPullTime = reportPullTime;
__exports.requireFreshReport = requireFreshReport;
},
"mysource/batch.js": function (__require, __exports, document, window) {
'use strict';
const { PageError, closeWindow, shown, waitFor, guardReady, stopFlagged } = __require("./dom.js");
const { searchPageReady, pageCalm, closeContextLayer, waitForPersonIdentity, resumePageReady } = __require("./schedule.js");
const CONNECTION_WORDS = 'Connection lost, waiting';
function watchConnection({ lost = () => {}, online = () => {} } = {}) {
  const view = window;
  let disconnected = false, loss = 0, resumeLoss = null;
  const offline = () => { loss++; if (!disconnected) { disconnected = true; lost(); } };
  const connected = () => { if (view.navigator.onLine !== false) online(); };
  view.addEventListener('offline', offline);
  view.addEventListener('online', connected);
  return {
    check(resuming = false) {
      if (view.navigator.onLine === false && !disconnected) offline();
      if (view.navigator.onLine === false || disconnected && (!resuming || resumeLoss !== loss))
        throw Object.assign(new PageError(CONNECTION_WORDS, { record: false }), { connectionLost: true });
    },
    beginResume() { resumeLoss = loss; this.check(true); },
    accept() { this.check(true); disconnected = false; },
    close() { view.removeEventListener('offline', offline); view.removeEventListener('online', connected); },
  };
}
async function connectionPageReady(identity) {
  await guardReady();
  if (identity?.name) await waitForPersonIdentity(identity);
  await resumePageReady({ empty: !!identity && !identity.name });
  await cancelBatchWindows();
  await resumePageReady({ empty: !!identity && !identity.name });
  if (identity?.name) await waitForPersonIdentity(identity);
  await guardReady();
}
function sessionExpired() {
  return [...document.querySelectorAll('.session-expired-modal')].some(shown);
}
const windowWords = modal => ({ FindAssignmentsModal: 'Find Assignments window', editEventGridModal: 'Edit Assignment window',
  addShiftEventModal: 'Add Assignment window' })[modal.id] || (modal.querySelector('textarea') ? 'View Notes window' : modal.classList.contains('bootbox-confirm') ? 'Delete All confirmation window' : 'window on Schedule');
async function cancelBatchWindows() {
  await closeContextLayer();
  for (const modal of [...document.querySelectorAll('.bootbox, #addShiftEventModal, #editEventGridModal, #FindAssignmentsModal')].filter(shown).reverse()) {
    await closeWindow(modal, `the open ${windowWords(modal)}`);
  }
  for (const type of ['keydown', 'keyup']) document.dispatchEvent(new window.KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
  const open = [...document.querySelectorAll('#addShiftEventModal, #editEventGridModal, #FindAssignmentsModal, .bootbox')].filter(shown);
  if (open.length) throw new PageError(`${windowWords(open[0])} could not be closed safely. Stop and close it by hand.`);
}
async function closeSkippedPerson() {
  try {
    await cancelBatchWindows();
    const dropdownOpen = () => [...document.querySelectorAll('.select2-container--open')].some(shown);
    const waitClosed = async () => {
      try { await waitFor(() => !dropdownOpen(), 'the Search for a Professional dropdown to close', 2000); return true; }
      catch (error) {
        if (stopFlagged(error) || !(error instanceof PageError)) throw error;
        await guardReady();
        return false;
      }
    };
    if (dropdownOpen()) {
      const field = [...document.querySelectorAll('.select2-container--open .select2-search__field')].find(shown);
      if (field) {
        await guardReady();
        field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
      }
      if (!(await waitClosed())) {
        for (const type of ['mousedown', 'mouseup']) {
          await guardReady();
          document.body.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
        }
        await waitClosed();
      }
    }
    if (dropdownOpen()) {
      throw new PageError('The Search for a Professional dropdown is still open. Close it before Resume.');
    }
    await searchPageReady();
    if (!pageCalm()) throw new PageError('The page still has an open schedule or is loading. Close the schedule and wait before Resume.');
  } catch (error) { error.pageBlocked = true; throw error; }
}
const pageLocks = new Set();
function unlockPage() { for (const release of [...pageLocks]) release(); }
function batchCover(host = document.getElementById('snooze-panel-host'), controls = host) {
  const doc = host?.ownerDocument || document;
  const cover = doc.createElement('div');
  cover.dataset.snoozePageLock = 'true';
  cover.setAttribute('style', 'position:fixed;inset:0;background:rgba(10,14,23,.12);z-index:2147483645;pointer-events:none');
  cover.setAttribute('aria-hidden', 'true');
  const line = doc.createElement('div');
  line.textContent = 'Snooze is changing schedules. Press Pause to use the page.';
  line.setAttribute('style', 'position:absolute;left:0;right:0;bottom:0;padding:4px 8px;background:white;color:#222;font:12px sans-serif');
  cover.append(line);
  (host?.shadowRoot || host || doc.body).append(cover);
  if (host) host.dataset.batchActive = 'true';
  const block = event => {
    if (!event.isTrusted || (controls && event.composedPath().includes(controls))) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const kinds = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'touchmove', 'focusin'];
  for (const kind of kinds) doc.addEventListener(kind, block, { capture: true, passive: false });
  const release = () => {
    cover.remove(); if (host) delete host.dataset.batchActive;
    for (const kind of kinds) doc.removeEventListener(kind, block, true);
    pageLocks.delete(release);
  };
  pageLocks.add(release);
  return release;
}
__exports.CONNECTION_WORDS = CONNECTION_WORDS;
__exports.watchConnection = watchConnection;
__exports.connectionPageReady = connectionPageReady;
__exports.sessionExpired = sessionExpired;
__exports.cancelBatchWindows = cancelBatchWindows;
__exports.closeSkippedPerson = closeSkippedPerson;
__exports.unlockPage = unlockPage;
__exports.batchCover = batchCover;
},
"screen/compact.js": function (__require, __exports, document, window) {
'use strict';
const { addDays, compareDays, usDate } = __require("../rules/dates.js");
const { greyedExitLine, reasonLine } = __require("./wording.js");
const { professionalName } = __require("../rules/prepare.js");
const { exitDnsDates } = __require("../rules/mails.js");
const mailFNoAction = one => one.slice?.status !== 'notOnReport' && !one.personStop && one.decision.code === 'exitNoLwd' && one.decision.outcome === 'noReport';
function undoRanges(rows) {
  const ranges = [];
  for (const row of [...rows].sort((a, b) => compareDays(a.day, b.day))) {
    const clients = [...new Set(row.clients || [])].sort();
    const key = JSON.stringify(clients);
    const previous = ranges[ranges.length - 1];
    let next = previous && addDays(previous.end, 1);
    while (next && compareDays(next, row.day) < 0 && [0, 6].includes(new Date(Date.UTC(next.y, next.m - 1, next.d)).getUTCDay())) next = addDays(next, 1);
    if (previous && previous.key === key && compareDays(next, row.day) === 0) previous.end = row.day;
    else ranges.push({ start: row.day, end: row.day, clients, key });
  }
  return ranges.map(range => ({ dates: compareDays(range.start, range.end) === 0 ? usDate(range.start) : `${usDate(range.start)} – ${usDate(range.end)}`, clients: range.clients }));
}
function undoChangeWords(days) {
  const ranges = undoRanges(days.map(day => ({ day })));
  return `Puts back the report's entries on these dates, replacing this batch's change: ${ranges.map(range=>range.dates).join('; ')}. Original notes cannot be restored.`;
}
const failedRow = row => ['failed', 'restored', 'restoreFailed', 'undoFailed'].includes(row.state);
const orderedRows = rows => [...rows].sort((a, b) => rank(a) - rank(b));
const rank = row => failedRow(row) ? 2 : row.state === 'skipped' ? 1 : 0;
const personName = one => professionalName(one.record);
const canUndo = row => ['done', 'restoreFailed', 'undoFailed'].includes(row.state) && !!row.prepared?.backup && !row.prepared.backup.undoBlocked;
const changedRow = row => ['done', 'restoreFailed', 'undoFailed', 'undone', 'undoing'].includes(row.state) && !!row.prepared?.backup && !row.prepared.backup.undoBlocked;
const undoState = row => row.prepared?.backup?.undoBlocked ? '' : ({ undone: 'undone', undoFailed: 'undo failed', undoing: 'undoing…' })[row.state] || '';
function changeLine(one, prepared = null) {
  const plan = one.decision.plan;
  if (!plan) return 'No schedule change';
  if (plan.action === 'add') return `LOA ${usDate(plan.loaStart)} – ${usDate(plan.loaEnd)}`;
  if (plan.action === 'dns') { const dates = exitDnsDates(plan, prepared); return one.exit?.greyed && !prepared?.addDns ? greyedExitLine(plan, prepared) : `DNS ${usDate(dates.start)} – ${usDate(dates.end)}`; }
  if (plan.action === 'clearClients') return `Remove entries from ${usDate(plan.dnsStart)}`;
  return 'No schedule change';
}
function undoLine(one, prepared = null) {
  const plan = one.decision.plan;
  if (plan.action === 'restore') return `Undo schedule ${usDate(plan.window.start)} – ${usDate(plan.window.end)}`;
  if (plan.action === 'add') return `Remove ${changeLine(one)}`;
  if (plan.action === 'dns' && one.exit?.greyed && !prepared?.addDns) return `Undo entries removal from ${usDate(plan.dnsStart)}`;
  if (plan.action === 'dns') { const dates = exitDnsDates(plan, prepared); return `Remove DNS ${usDate(dates.start)} – ${usDate(dates.end)}`; }
  if (plan.action === 'clearClients') return `Undo entries removal from ${usDate(plan.dnsStart)}`;
  return 'No schedule change';
}
function shortReason(row) {
  if (['personNotFound', 'pageReportMismatch'].includes(row.diagnostic?.reason) && row.message) return row.message;
  if (row.one.slice?.status === 'notOnReport' && row.state === 'skipped') return `not on the Staff Schedule Hours Report, possibly not ${row.one.record.subcategory?.business === 'audit' ? 'A&A' : row.one.record.subcategory?.site === 'tax' ? 'Tax' : 'Consulting'}`;
  const decision = row.one.personStop || row.one.decision;
  if (decision.code === 'taxTalentGroup') return reasonLine(decision);
  const codes = { cmat: 'CMAT', noDates: 'No leave dates', noStart: 'No leave start date', noEnd: 'No leave end date', noEmail: 'No email', notesTooLong: 'Notes exceed 150 characters', noBusiness: 'Business missing', termDateUnreadable: 'Term Date unreadable', notConsulting: `Business: ${decision.business || ''}`, exitNoLwdUs: 'US person; last working day missing' };
  const reason = codes[decision.code] || row.message || reasonLine(decision);
  return reason.replace(/^[✗⚠✓]\s*/, '').replace(/\s*→.*$/, '').replace(/\s*Nothing was changed\.?/g, '').trim();
}
function runningText(row) {
  const plan = row?.one.decision.plan || {};
  if (plan.action === 'auditReadOnly') return { person: `${personName(row.one)} · No schedule change`, dates: plan.loaStart ? `${usDate(plan.loaStart)} – ${usDate(plan.loaEnd)}` : '' };
  const dates = plan.action === 'dns' ? exitDnsDates(plan, row?.prepared) : null;
  const action = plan.action === 'dns' ? 'Updating DNS' : plan.action === 'add' ? 'Updating LOA' : plan.action === 'clearClients' ? 'Removing entries' : 'Removing entries';
  return { person: row ? `${personName(row.one)} · ${action}` : '', dates: plan.action === 'dns' ? `${usDate(dates.start)} – ${usDate(dates.end)}` : plan.action === 'add' ? `${usDate(plan.loaStart)} – ${usDate(plan.loaEnd)}` : `from ${usDate(plan.dnsStart)}` };
}
__exports.mailFNoAction = mailFNoAction;
__exports.undoRanges = undoRanges;
__exports.undoChangeWords = undoChangeWords;
__exports.failedRow = failedRow;
__exports.orderedRows = orderedRows;
__exports.personName = personName;
__exports.canUndo = canUndo;
__exports.changedRow = changedRow;
__exports.undoState = undoState;
__exports.changeLine = changeLine;
__exports.undoLine = undoLine;
__exports.shortReason = shortReason;
__exports.runningText = runningText;
},
"files/batch-outputs.js": function (__require, __exports, document, window) {
'use strict';
const { takeScreenshot, pictureWarnings, lastPicture } = __require("./capture.js");
const { recordRun } = __require("../core/run-records.js");
const { stopFlagged, withPersonGuard } = __require("../mysource/dom.js");
const { openPerson, personIdentity, waitForPersonIdentity: requirePersonIdentity, checkPersonIdentity } = __require("../mysource/schedule.js");
const { hoverNotePicture } = __require("../mysource/note-picture.js");
const { showDate, exactPictureRange, pictureWeeksHold } = __require("../mysource/calendar.js");
const { todayOf, usDate, readDescriptionDay, fileStamp } = __require("../rules/dates.js");
const { chooseMail, mailText, exitDnsDates } = __require("../rules/mails.js");
const { reportFile } = __require("./casefiles.js");
const { xlsxBytes, workbookBytes, zip } = __require("./xlsx-writer.js");
const { xml, column } = __require("./xml.js");
const { safeName } = __require("./folder.js");
const { saveFile } = __require("../screen/ui.js");
const { changeLine, orderedRows, failedRow, shortReason } = __require("../screen/compact.js");
const { professionalName, rememberPageName, emailKey } = __require("../rules/prepare.js");
const { reasonLine } = __require("../screen/wording.js");
const { dayRanges } = __require("../rules/leaves.js");
const { runReportDocx } = __require("./run-report-docx.js");
const { loadedReports, reportKind } = __require("./report.js");
function needsPersonPicture(row) {
  if (row.state === 'done') return true;
  if (row.state !== 'nothing' || (row.one.personStop && row.one.personStop.code !== 'taxPartnerMd') || row.one.slice?.status === 'notOnReport') return false;
  const mail = chooseMail(row.one, row.prepared);
  return !!mail && mail.template !== 'F';
}
async function capturePerson(row, options = {}) {
  if (!needsPersonPicture(row)) return;
  if (!options.alreadyOpen) {
    const record = row.one.record;
    try { rememberPageName(record, await openPerson(record.email, record.person.professional, record)); }
    catch (error) { pictureFailure(row, error); return; }
  }
  const identity = options.identity || (options.alreadyOpen ? row.prepared?.identity : personIdentity());
  {
    const previousPictures = row.one.outputs?.screenshots?.length || 0;
    try {
      return await withPersonGuard(() => checkPersonIdentity(identity, options.operation || 'capture'), () => capturePersonRecorded(row, { ...options, identity }));
    } catch (error) {
      if (error.identityChanged) row.one.outputs?.screenshots?.splice(previousPictures);
      throw error;
    }
  }
}
function notePictureNeeded(row) {
  if (row.one.record.subcategory?.business === 'audit') return false;
  if (!['done', 'nothing'].includes(row.state) || !['add', 'dns'].includes(row.one.decision.plan?.action)) return false;
  return !(row.one.exit?.greyed && !row.prepared?.addDns);
}
function pictureFailure(row, error, warnings = []) {
  if (stopFlagged(error)) throw error;
  const out = row.one.outputs ||= { screenshots: [] };
  if (notePictureNeeded(row)) warnings.push('Hover note not in the picture: take it by hand');
  warnings.push(`Screenshot not made: ${error.message}`);
  if (row.state !== 'skipped') {
    recordRun({ type: 'error', code: 'screenshotUnreadable' });
    if (row.diagnostic) row.diagnostic.paint.push({ kind: 'paint', count: 1 });
  }
  out.warnings = [...new Set(warnings)].join('; ');
}
async function capturePersonRecorded(row, { identity, operation = 'capture' } = {}) {
  if (!needsPersonPicture(row)) return;
  const one = row.one;
  const out = one.outputs ||= { screenshots: [] };
  out.screenshots ||= [];
  const warnings = [];
  const needsNotePicture = notePictureNeeded(row);
  const noteWarning = 'Hover note not in the picture: take it by hand';
  try {
    if (row.state === 'skipped') throw new Error('person is by hand');
    await requirePersonIdentity(identity, operation);
    const pictureIdentity = identity;
    const plan = one.decision.plan || {};
    const start = plan.action === 'add' && plan.pastDated ? plan.leaveStart
      : plan.loaStart || plan.dnsStart || one.decision.start || todayOf();
    const end = plan.loaEnd || (plan.action === 'dns' ? plan.dnsEnd : null) || one.decision.end;
    const shot = async date => {
      if (!needsNotePicture) return takeScreenshot();
      let note;
      try {
        note = await hoverNotePicture(plan.action === 'dns' ? 'Do Not Schedule (DNS)' : 'Leave of Absence (LOA)', row.after?.days || row.result?.after?.days || row.prepared?.copy?.days || [], plan.notes || '');
        const blob = await takeScreenshot({ noteTooltip: note.tooltip });
        if (!lastPicture.notesPainted) warnings.push(noteWarning);
        return blob;
      } catch (error) {
        if (stopFlagged(error)) throw error;
        warnings.push(noteWarning);
        if (note) throw error;
        return takeScreenshot();
      } finally { note?.cleanup(); }
    };
    let pictureStart = start;
    try {
      await requirePersonIdentity(pictureIdentity, operation);
      exactPictureRange(start) || await showDate(start);
      await requirePersonIdentity(pictureIdentity, operation);
    }
    catch (error) {
      const fallback = plan.action === 'add' && plan.pastDated ? plan.loaStart : null;
      if (stopFlagged(error) || !fallback) throw error;
      pictureStart = fallback;
      await showDate(pictureStart);
      warnings.push(`The calendar would not go back to ${usDate(start)}; the picture starts at ${usDate(pictureStart)}.`);
    }
    const endShown = end && pictureWeeksHold(pictureStart, end);
    out.screenshots.push(await shot(pictureStart));
    if (row.diagnostic) {
      row.diagnostic.paint.push(...lastPicture.omissions);
      const counts = row.diagnostic.approximations ||= {};
      for (const [kind, count] of Object.entries(lastPicture.approximations || {})) counts[kind] = (counts[kind] || 0) + count;
    }
    if (pictureWarnings()) warnings.push(pictureWarnings());
    if (end && !endShown) {
      await showDate(end);
      out.screenshots.push(await shot(end));
      if (row.diagnostic) {
      row.diagnostic.paint.push(...lastPicture.omissions);
      const counts = row.diagnostic.approximations ||= {};
      for (const [kind, count] of Object.entries(lastPicture.approximations || {})) counts[kind] = (counts[kind] || 0) + count;
    }
      if (pictureWarnings()) warnings.push(pictureWarnings());
    }
  } catch (error) {
    pictureFailure(row, error, warnings);
  }
  out.warnings = [...new Set(warnings)].join('; ');
}
const BATCH_COLUMNS = ['Ticket', 'Name', 'Email', 'Resource Manager name', 'Resource Manager email', 'Kind', 'What was done', 'Warning/failure reason', 'Resolution notes (SN)'];
const joinReasons = parts => parts.reduce((text, part) => !text ? part : `${text}${/[.!?]$/.test(text) ? ' ' : '; '}${part}`, '');
function rowWarnings(row) {
  if (row.state === 'timeLimit') return row.message;
  const one = row.one;
  const description = row.state === 'undoing' ? 'undoing…' : row.state === 'undone' ? 'undone'
    : row.state === 'skipped' || failedRow(row) ? shortReason(row)
      : row.prepared?.alreadyDone ? row.prepared.nothing
        : ['pending', 'ready'].includes(row.state) ? `Not run · ${changeLine(one, row.prepared)}` : changeLine(one, row.prepared);
  const duplicates = one.record.duplicates || [];
  return joinReasons([...new Set([
    reasonLine(one.personStop || one.decision, row.prepared),
    description && `${description}${duplicates.length ? ` · also ${duplicates.map(ticket => ticket.number).join(', ')}` : ''}`,
    row.message,
    row.result?.message,
    row.prepared?.nothing,
    row.prepared?.replacedOldNote && row.state === 'done' && 'The LOA was already on these dates with an old note; replaced with the new note.',
    row.result?.problems?.join('; '),
    row.prepared?.runs?.length && row.state === 'done' && `The same leave's LOA outside the new dates is removed: ${dayRanges(row.prepared.runs.flatMap(run => run.rows.map(day => day.day)))}.`,
    row.prepared?.kept?.length && `Another LOA block outside the new dates is kept: ${dayRanges(row.prepared.kept.map(day => day.day))}.`,
    row.state === 'restored' && 'Change not proved; restored and checked.',
    row.state === 'restoreFailed' && 'Change and restore not proved.',
    row.state === 'undoFailed' && 'Undo failed.',
    one.exit?.dpNotFound && 'RM not applicable.',
    one.outputs?.warnings,
    row.undoWarning,
  ].filter(Boolean))]);
}
function rowMail(row) {
  const one = row.one;
  if (row.state === 'skipped' && one.personStop?.code === 'auditMissingDp') return chooseMail(one);
  const proved = ['done', 'nothing'].includes(row.state);
  const alreadyThere = row.prepared?.alreadyDone && row.prepared?.nothing && ['add', 'dns'].includes(one.decision.plan?.action);
  return proved && (!row.prepared?.alreadyDone || alreadyThere) ? chooseMail(one, row.prepared) : null;
}
function rowMailText(row, signOff) {
  const one = row.one, mail = rowMail(row);
  const dpName = one.exit?.dpName || one.slice?.resourceManager || one.record.person.resourceManager || '';
  const dpEmail = one.exit?.dpEmail || one.slice?.resourceManagerEmail || '';
  const notification = { ...one.record.notification, lines: one.record.notification.lines.map(line => line.replace(/\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g, value => {
      const parsed = readDescriptionDay(value);
      return parsed.day ? usDate(parsed.day) : value;
  })) };
  return mail ? mailText({ ...one, record: { ...one.record, notification } }, mail, { dpName, dpEmail, signOff }) : null;
}
function mailsTable(rows, signOff = '') {
  return [['Ticket', 'To', 'Subject', 'Mail'], ...rows.flatMap(row => {
    const text = rowMailText(row, signOff);
    return text ? [[row.one.record.number, text.to, text.subject, text.body.trim()]] : [];
  })];
}
function batchTable(rows, signOff = '') {
  return [BATCH_COLUMNS, ...orderedRows(rows).flatMap(row => {
    const one = row.one;
    const dpName = one.exit?.dpName || one.slice?.resourceManager || one.record.person.resourceManager || '';
    const dpEmail = one.exit?.dpEmail || one.slice?.resourceManagerEmail || '';
    const proved = ['done', 'nothing'].includes(row.state);
    const text = rowMailText(row, signOff);
    const plan = one.decision.plan;
    const dates = plan?.action === 'dns' && !(one.exit?.greyed && !row.prepared?.addDns) ? exitDnsDates(plan, row.prepared) : null;
    const changed = (dates ? null : row.result?.message) || (dates ? `Cleared from ${usDate(plan.dnsStart)}; added DNS ${usDate(dates.start)} – ${usDate(dates.end)}`
      : plan?.action === 'clearClients' ? `${changeLine(one, row.prepared)}; no DNS` : changeLine(one, row.prepared));
    const status = row.state === 'undone' ? `Undone: ${changed}`
      : row.state === 'done' ? changed : row.state === 'nothing' ? row.prepared?.nothing || 'No schedule change'
        : row.state === 'restored' ? 'Change not proved; restored and checked'
          : failedRow(row) ? 'Failed' : row.state === 'skipped' ? 'By hand' : row.state === 'timeLimit' ? row.message : row.state === 'leftOut' ? 'No action' : 'Not run';
    const missing = text?.missing.length ? `Mail incomplete: ${text.missing.join(', ')}` : '';
    const duplicates = one.record.duplicates || [];
    const main = [one.record.number, professionalName(one.record), one.record.pageEmail ?? one.record.exportEmail ?? one.record.email, dpName, dpEmail,
      one.record.notification.kind === 'exit' ? 'Exit' : one.record.notification.kind === 'leave' ? 'LOA' : '', status,
      [rowWarnings(row), missing].filter(Boolean).join('; '),
      one.decision.code === 'taxTalentGroup' ? reasonLine(one.decision) : one.exit?.dpNotFound ? 'RM not applicable' : proved && duplicates.length ? `Duplicates closed: ${duplicates.map(ticket => ticket.number).join(', ')}.` : ''];
    return [main, ...duplicates.map(ticket => [ticket.number, professionalName(one.record), one.record.pageEmail ?? ticket.exportEmail ?? ticket.email, dpName, dpEmail,
      main[5], proved ? `Duplicate of ${one.record.number}: close it` : `${status}; duplicate of ${one.record.number}`,
      main[7], one.exit?.dpNotFound ? 'RM not applicable' : proved ? `Duplicate case of ${one.record.number}. Actioned under ${one.record.number}.` : ''])];
  })];
}
function batchExcelName(time = Date.now()) {
  return `Snooze batch ${fileStamp(new Date(time))}.xlsx`;
}
function expectsReport(row) {
  return !!(rowMail(row)?.attachReport || needsPersonPicture(row) && row.prepared?.removing?.some(item => item.clientHours > 0));
}
const personTicketKey = record => JSON.stringify([record.number || '', emailKey(record.email || record.exportEmail || '')]);
function personFolders(rows) {
  const people = new Map();
  for (const { one } of rows) {
    const ticket = safeName(one.record.number || 'no ticket').toLowerCase();
    if (!people.has(ticket)) people.set(ticket, new Set());
    people.get(ticket).add(personTicketKey(one.record));
  }
  const used = new Set(people.keys()), folders = new Map();
  for (const { one } of rows) {
    const key = personTicketKey(one.record);
    if (folders.has(key)) continue;
    const ticket = safeName(one.record.number || 'no ticket');
    let folder = ticket;
    if (people.get(ticket.toLowerCase()).size > 1) {
      let suffix = 1;
      do { folder = `${ticket} - ${suffix++}`; } while (used.has(folder.toLowerCase()));
    }
    used.add(folder.toLowerCase());
    folders.set(key, folder);
  }
  return folders;
}
function packageCheck(rows, files) {
  let names = null;
  try {
    if (Array.isArray(files) && files.every(file => typeof file?.name === 'string' && typeof file.blob?.arrayBuffer === 'function')) names = files.map(file => file.name);
  } catch {   }
  const folders = personFolders(rows);
  return rows.map(row => {
    const ticket = safeName(row.one.record.number || 'no ticket');
    const folder = folders.get(personTicketKey(row.one.record));
    const included = names?.filter(name => name.startsWith(`${folder}/`)) ?? null;
    const report = included?.filter(name => name === `${folder}/${ticket} - Staff Schedule Hours Report.xlsx`);
    const picture = included?.filter(name => name.startsWith(`${folder}/${ticket} - Screenshot`) && name.endsWith('.png'));
    const reason = row.one.outputs?.warnings || row.message || row.prepared?.stop || '';
    const item = (expected, matches, kind) => ({ expected,
      status: !names ? 'could not check' : matches.length ? 'included' : !expected ? `no ${kind} required` : `${kind} unavailable`,
      reason: names && expected && !matches.length ? reason || (kind === 'report' ? row.one.slice?.reason : '') || `${kind} unavailable` : '',
    });
    return { ticket: row.one.record.number, person: professionalName(row.one.record), files: included,
      report: item(expectsReport(row), report, 'report'), picture: item(needsPersonPicture(row), picture, 'picture') };
  });
}
function batchFiles(rows, signOff = '', { excelName = batchExcelName(), backupReport = null, runReport = '', batchLabel = excelName.replace(/\.xlsx$/, ''), packVersion = 1 } = {}) {
  const attachments = new Map();
  const files = [];
  const folders = personFolders(rows);
  for (const row of orderedRows(rows)) {
    const one = row.one;
    const ticket = safeName(one.record.number || 'no ticket');
    const key = personTicketKey(one.record), folder = folders.get(key);
    const added = [];
    const pictured = needsPersonPicture(row);
    if (rowMail(row)?.attachTemplate) {
      const name = `${ticket} Audit Request Template.xlsx`;
      added.push({ name: `${folder}/${name}`, blob: new Blob([auditRequestBytes(one.decision.audit.clients)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) });
    }
    if (expectsReport(row) && one.slice?.status === 'ready' && one.slice.columns?.length) {
      const report = reportFile(one.slice, ticket);
      added.push({ ...report, name: `${folder}/${report.name}` });
    }
    if (pictured) (one.outputs?.screenshots || []).forEach((blob, i) => added.push({ name: `${folder}/${ticket} - Screenshot${i ? ` ${i + 1}` : ''}.png`, blob }));
    attachments.set(key, added.map(file => file.name).join('\n'));
    files.push(...added);
  }
  const tableRows = orderedRows(rows).flatMap(owner => batchTable([owner], signOff).slice(1).map((cells, index) => ({
    cells, owner, record: index ? owner.one.record.duplicates[index - 1] : owner.one.record,
  })));
  const table = [BATCH_COLUMNS, ...tableRows.map(item => item.cells)];
  const mails = mailsTable(rows, signOff);
  const outgoing = new Map(rows.map(row => [personTicketKey(row.one.record), rowMailText(row, signOff)]));
  const checked = packageCheck(rows, files);
  const checks = new Map(rows.map((row, index) => [personTicketKey(row.one.record), checked[index]]));
  const summary = [['Ticket', 'Person', 'Result', 'Attachments', 'Mail recipient', 'Mail details', 'Expected report', 'Report check', 'Expected picture', 'Picture check', 'Missing reason'], ...tableRows.map(({ cells: row, owner, record }) => {
    const key = personTicketKey(record), check = checks.get(key), mail = outgoing.get(key);
    return [row[0], row[1],
      ['restoreFailed', 'undoFailed'].includes(owner.state) ? 'Restore unconfirmed' : ['restored', 'failed'].includes(owner.state) ? 'By hand' : row[6], attachments.get(key) || '', mail?.to || '', mail ? 'See Mails sheet' : '',
      check ? check.report.expected ? 'Report' : 'None required' : '', check?.report.status || '',
      check ? check.picture.expected ? 'Picture' : 'None required' : '', check?.picture.status || '',
      [check?.report.reason, check?.picture.reason].filter(Boolean).join('; ')];
  }), ['Batch label', batchLabel, 'Pack version', String(packVersion)]];
  const mailRows = new Map(tableRows.map(({ cells, record }) => [personTicketKey(record), cells]));
  const attention = rows.filter(row => (['done','nothing'].includes(row.state) && row.one.outputs?.warnings) || outgoing.get(personTicketKey(row.one.record))?.missing.length || row.state === 'skipped' || failedRow(row) || ['ready', 'pending', 'timeLimit'].includes(row.state))
    .sort((a, b) => Number(['restoreFailed', 'undoFailed'].includes(b.state)) - Number(['restoreFailed', 'undoFailed'].includes(a.state)));
  const needsAttention = [['Ticket', 'Person', 'Result', 'Reason'], ...attention.map(row => [row.one.record.number, professionalName(row.one.record),
    ['restoreFailed', 'undoFailed'].includes(row.state) ? 'Restore unconfirmed' : row.state === 'timeLimit' ? row.message : row.state === 'skipped' || failedRow(row) ? 'By hand' : ['done','nothing'].includes(row.state) ? mailRows.get(personTicketKey(row.one.record))?.[6] || 'No schedule change' : 'Not run', mailRows.get(personTicketKey(row.one.record))?.[7] || rowWarnings(row)])];
  files.unshift({ name: excelName, blob: new Blob([xlsxBytes([
    { name: 'Summary', rows: summary, widths: [20, 26, 52, 58, 36, 22, 20, 24, 20, 24, 64], rowHeight: 100 },
    { name: 'Mails', rows: mails, widths: [20, 38, 80, 110], rowHeight: 409 },
    { name: 'Batch', rows: table, widths: [20, 26, 36, 26, 36, 12, 52, 64, 48], rowHeight: 300 },
    { name: 'Needs attention', rows: needsAttention, widths: [20, 26, 24, 100], rowHeight: 100 },
  ])], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) });
  for (const report of loadedReports(backupReport).filter(report => report.sourceFile)) {
    const original = report.fileName || report.sourceFile.name || 'Staff Schedule Hours Report.xlsx';
    const extension = original.match(/\.(xlsx|csv)$/i)?.[0] || '.xlsx';
    const stem = original.slice(0, original.length - extension.length);
    const prefix = Array.isArray(backupReport) ? `${reportKind(report) === 'audit' ? 'Audit' : 'Consulting'} - ` : '';
    files.push({ name: `Backup/${prefix}${safeName(stem)}${extension}`, blob: report.sourceFile });
  }
  if (runReport) files.push({ name: 'Snooze run report.docx', blob: new Blob([runReportDocx(runReport)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) });
  return files;
}
function auditRequestBytes(clients) {
  const fields = ['Requestor Name *', 'Client *', 'WBS', 'Project Status *', 'Role Title*', 'Role Description*', 'Business Area*', 'Business Line*', 'Market Offering *', 'Practice*', 'Industry*', 'Industry Sector*', 'Accept Travelers *'];
  const styles = '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/></cellXfs>';
  const cell = (ref, value, style = 0) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  const widths = [26, 42, 24, 24, 26, 60, 26, 26, 26, 26, 26, 26, 24];
  const sheetXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData><row r="1">${fields.map((field, i) => cell(`${column(i)}1`, field, i === 1 || i === 2 ? 0 : 1)).join('')}</row>${clients.map((client, i) => `<row r="${i + 2}">${cell(`B${i + 2}`, client.client)}${cell(`C${i + 2}`, client.wbs)}</row>`).join('')}</sheetData></worksheet>`;
  return workbookBytes([{ name: 'Audit Request Template' }], { xml, sheetXml, styles });
}
async function saveBatch(rows, signOff, { excelName = batchExcelName(), backupReport = null, runReport = '', batchLabel = excelName.replace(/\.xlsx$/, ''), packVersion = 1 } = {}) {
  const files = batchFiles(rows, signOff, { excelName, backupReport, runReport, batchLabel, packVersion });
  const parts = await Promise.all(files.map(async file => [file.name, new Uint8Array(await file.blob.arrayBuffer())]));
  const name = `${batchLabel} v${packVersion}.zip`;
  saveFile(name, new Blob([zip(parts)], { type: 'application/zip' }));
  return { where: 'Downloads', name, count: files.length, packageCheck: packageCheck(rows, files) };
}
__exports.needsPersonPicture = needsPersonPicture;
__exports.capturePerson = capturePerson;
__exports.BATCH_COLUMNS = BATCH_COLUMNS;
__exports.rowWarnings = rowWarnings;
__exports.mailsTable = mailsTable;
__exports.batchTable = batchTable;
__exports.batchExcelName = batchExcelName;
__exports.packageCheck = packageCheck;
__exports.batchFiles = batchFiles;
__exports.saveBatch = saveBatch;
},
"files/xlsx-writer.js": function (__require, __exports, document, window) {
'use strict';
const { xml, column } = __require("./xml.js");
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function zip(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBytes = encoder.encode(name);
    const nameFlags = /[^\x00-\x7f]/.test(name) ? 0x0800 : 0;
    const data = text instanceof Uint8Array ? text : encoder.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, nameFlags, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, nameFlags, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
function workbookBytes(sheets, { xml, sheetXml, styles }) {
  const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PACKAGE_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_RELS}"><Relationship Id="rId1" Type="${RELS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${MAIN}" xmlns:r="${RELS}"><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_RELS}">${sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="${RELS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${RELS}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${MAIN}">${styles}</styleSheet>`],
    ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet)]),
  ];
  return zip(files);
}
function sheetXml({ rows, widths = [], rowHeight = 60 }) {
  const count = rows.reduce((count, row) => Math.max(count, row.length), 1);
  const cols = Array.from({ length: count }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${widths[index] || Math.min(60, Math.max(16, String(rows[0]?.[index] || '').length + 3))}" customWidth="1"/>`).join('');
  const height = cells => Math.min(rowHeight, Math.max(26, 8 + 14 * Math.max(1, ...cells.map((cell, index) => String(cell ?? '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (widths[index] || 24))), 0)))));
  const body = rows.map((cells, row) => `<row r="${row + 1}" ht="${row === 0 ? 32 : height(cells)}" customHeight="1">${cells.map((cell, index) => (String(cell ?? '') === '' ? ''
    : `<c r="${column(index)}${row + 1}" s="${row === 0 ? 1 : 2}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${column(count - 1)}${Math.max(1, rows.length)}"/></worksheet>`;
}
const STYLES = '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF000000"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>';
function xlsxBytes(sheets) {
  return workbookBytes(sheets, { xml, sheetXml, styles: STYLES });
}
__exports.zip = zip;
__exports.workbookBytes = workbookBytes;
__exports.xlsxBytes = xlsxBytes;
},
"run/time-limit.js": function (__require, __exports, document, window) {
'use strict';
const { needsPersonPicture } = __require("../files/batch-outputs.js");
const CHANGE_MINUTES = 3;
const OPEN_WITHOUT_CHANGE_MINUTES = 1;
const NEVER_OPENED_MINUTES = 0;
const BATCH_RESERVE_MINUTES = 10;
const TIME_LIMIT_WORDS = 'Not in this run, time limit';
function estimateBatch(rows, states, left) {
  const budget = Math.max(0, left / 60000 - BATCH_RESERVE_MINUTES);
  const included = [], excluded = [];
  let minutes = 0;
  rows.forEach((row, index) => {
    const state = states.get(row);
    const cost = state === 'ready' ? CHANGE_MINUTES
      : state === 'nothing' && needsPersonPicture({ ...row, state }) ? OPEN_WITHOUT_CHANGE_MINUTES : NEVER_OPENED_MINUTES;
    if (!cost) return;
    if (minutes + cost > budget) excluded.push(index);
    else { included.push(index); minutes += cost; }
  });
  const total = included.length + excluded.length;
  return { included, excluded, minutes, budget, total,
    line: excluded.length ? `Only ${included.length} of ${total} people fit in this run (about ${minutes} minutes). The other ${excluded.length} are left for the next batch.` : '' };
}
__exports.TIME_LIMIT_WORDS = TIME_LIMIT_WORDS;
__exports.estimateBatch = estimateBatch;
},
"run/batch.js": function (__require, __exports, document, window) {
'use strict';
const { createSessionClock, PERSON_RESERVE_MS, CONFIRM_RESERVE_MS, SESSION_WORDS } = __require("../screen/session-clock.js");
const { prepare, apply, restore, recover: recoverBackup } = __require("./work.js");
const { requireDayReport, loadedReports } = __require("../files/report.js");
const { requireFreshReport } = __require("../files/report-time.js");
const { PageError, setBatchGuard, stopFlagged, waitFor, WAIT, guardReady } = __require("../mysource/dom.js");
const { sessionExpired, cancelBatchWindows, closeSkippedPerson, batchCover, unlockPage, watchConnection, connectionPageReady, CONNECTION_WORDS } = __require("../mysource/batch.js");
const { todayOf, compareDays, workingDays, usDate } = __require("../rules/dates.js");
const { compareCopies, copyWindow } = __require("../mysource/copy.js");
const { openPerson, personIdentity, checkPersonIdentity, waitForPersonIdentity, pageCalm, resumePageReady, requireSchedulePage, SCHEDULE_PAGE_WORDS, IDENTITY_PAUSE_WORDS } = __require("../mysource/schedule.js");
const { reasonLine, PAST_DATES_WORDS } = __require("../screen/wording.js");
const { checkLoaAdded, checkDnsAdded } = __require("../mysource/checks.js");
const { capturePerson, needsPersonPicture, saveBatch, batchExcelName } = __require("../files/batch-outputs.js");
const { setRunRecorder, timedRun, reasonCode } = __require("../core/run-records.js");
const { safePageInfo } = __require("../mysource/pageinfo.js");
const { combinedReportText } = __require("../files/run-report.js");
const { estimateBatch, TIME_LIMIT_WORDS } = __require("./time-limit.js");
const BATCH = {
  title: 'Run the batch', confirm: 'Confirm batch',
  pause: 'Pause', resume: 'Resume', stop: 'Stop safely',
  pausing: 'Pause requested. Finishing and checking this person first.',
  stopping: 'Stop requested. Finishing and checking this person first.',
  session: 'MySource session expired. Sign in again in this tab, then press Resume.',
  expired: 'The page still says the session expired. Sign in again before Resume.',
  pageBlocked: 'Paused. Close the open schedules with the ✕ and wait for loading to finish, then Resume.',
  restored: 'By hand: the change could not be proved. The differing days were restored and checked.',
  restoreFailed: 'By hand: the change and Restore could not be proved. Check the affected days in the run report.',
  done: 'Schedule checked; skipped on Resume.', skipped: 'By hand; skipped.',
  nothing: 'Already correct; skipped.', noAction: 'No schedule change.', failed: 'Stopped before a change.',
  pendingRestore: 'This person needs Restore before the batch can carry on.',
  stopNeedsRestore: 'The batch stopped. This person still needs Restore; the change has not been proved.',
  checkingDone: 'Checking the recorded schedule before skipping this person.',
};
const STALL_MS = 2 * 60 * 1000;
const STALL_WORDS = 'Snooze has not moved for 2 minutes.';
const methodOf = plan => plan?.action === 'dns' ? 'delete and DNS add' : plan?.action === 'clearClients' ? 'delete' : 'Replace';
class SessionError extends PageError {
  constructor() { super(BATCH.session); this.session = true; }
}
function createBatch(cases, report, version, { notify = () => {}, lock = () => batchCover(), today = todayOf(), now = () => Date.now(), capture = capturePerson, noAction = 0, excludedCases = [],
  readSite: siteReader = null,
  saveResults = saveBatch, signOff = () => '', clock = createSessionClock(),
  watchNow = () => Date.now(), scheduleWatch = fn => setInterval(fn, 1000), cancelWatch = id => clearInterval(id), localToday = () => todayOf() } = {}) {
  const createdLocalDay = localToday();
  const approvedDates = new Map();
  const currentToday = () => {
    const day = localToday();
    return compareDays(day, createdLocalDay) === 0 ? today : day;
  };
  const changeDays = row => {
    const plan = row.one.decision.plan || {}, prepared = row.prepared;
    return [
      ...(plan.action === 'add' ? workingDays(plan.loaStart, plan.loaEnd) : []),
      ...(prepared?.addDns ? workingDays(plan.dnsStart, prepared.editableDnsEnd || plan.dnsEnd) : []),
      ...(prepared?.runs || []).flatMap(run => run.rows.map(entry => entry.day)),
      ...(prepared?.exitRuns || []).flatMap(run => run.rows.map(entry => entry.day)),
      ...(prepared?.earlyDns || []).map(entry => entry.day),
      ...(prepared?.taxPlan?.weeks || []).flatMap(week => week.lowerClients.map(item => item.row.day)),
    ];
  };
  const checkPlannedDates = row => {
    const day = currentToday();
    if (compareDays(day, today) === 0) return;
    const plan = row.one.decision.plan || {};
    const dates = [...approvedDates.get(row.one), plan.loaStart, plan.loaEnd, plan.dnsStart, plan.dnsEnd,
      ...changeDays(row)].filter(Boolean);
    if (plan.action === 'clearClients') dates.push(today);
    if (dates.some(date => compareDays(date, day) < 0)) throw Object.assign(new PageError(PAST_DATES_WORDS), {
      noReplay: true, reasonCode: 'allowedDatesUnreadableOrOutside',
    });
  };
  const batch = { state: 'idle', message: '', rows: cases.map(one => ({ one, state: 'pending' })), phase: 'check', index: 0,
    confirmed: false, active: false, pauseRequested: false, stopRequested: false, pendingRestore: null };
  batch.diagnostic = { today, misses: [], slow: [], dialogs: [], unread: [], resumed: 0, noAction, waits: [], visibility: [], schedulePage: [], identity: [], findSteps: [], stalls: [] };
  for (const row of batch.rows) row.diagnostic = { steps: [], paint: [] };
  let observedRow = null;
  let retrying = false;
  let recordingPicture = false, pictureError = false;
  let filesRevision = 0;
  let connection = null, connectionIdentity = null, onlinePending = false;
  const autoResume = () => {
    if (!onlinePending || batch.active) return;
    onlinePending = false;
    if (batch.connectionPaused && !batch.stopRequested && batch.state === 'paused') void batch.resume();
  };
  const watchBrowser = () => {
    connection ||= watchConnection({
      lost: () => {
        try { connectionIdentity = observedRow?.prepared?.identity || personIdentity(); }
        catch (error) { connectionIdentity = { error }; }
      },
      online: () => { onlinePending = true; autoResume(); },
    });
  };
  const reviewStates = new Map();
  const showTimeLimit = estimate => {
    batch.timeLimit = estimate;
    batch.rows.forEach((row, index) => {
      const omitted = estimate.excluded.includes(index);
      row.state = omitted ? 'timeLimit' : reviewStates.get(row);
      if (omitted) { row.message = TIME_LIMIT_WORDS; row.toDo = false; }
      else if (row.state === 'ready') { row.message = ''; row.toDo = true; }
      else if (row.message === TIME_LIMIT_WORDS) row.message = '';
    });
  };
  batch.canFit = () => {
    const estimate = estimateBatch(batch.rows, reviewStates, clock.left());
    return estimate.budget > 0 && (estimate.total === 0 || estimate.included.length > 0);
  };
  let watchTimer = null, lastProgress = watchNow(), progressRow = null, lastWait = null;
  const stopWatch = () => {
    if (watchTimer !== null) cancelWatch(watchTimer);
    watchTimer = null; batch.stallMessage = '';
  };
  const progress = row => {
    lastProgress = watchNow();
    if (row && progressRow !== row) { progressRow = row; lastWait = null; }
    const warned = !!batch.stallMessage; batch.stallMessage = '';
    if (batch.active && batch.state === 'running' && watchTimer === null) watchTimer = scheduleWatch(() => {
      if (!batch.active || batch.state !== 'running') { stopWatch(); return; }
      if (!batch.stallMessage && watchNow() - lastProgress >= STALL_MS) {
        batch.stallMessage = STALL_WORDS;
        batch.diagnostic.stalls.push({ time: watchNow(), person: progressRow ? batch.rows.indexOf(progressRow) + 1 : null,
          stage: progressRow?.diagnostic.currentStage || null, wait: lastWait, seconds: (watchNow() - lastProgress) / 1000 });
        tell();
      }
    });
    if (warned) tell();
  };
  const reportFailure = error => {
    batch.diagnostic.reason = reasonCode(error.message); batch.diagnostic.failedStage = 'report';
    batch.diagnostic.unread.push({ code: batch.diagnostic.reason, stage: 'report' });
  };
  batch.clock = clock;
  Object.defineProperty(batch, 'pauseMessage', { get: () => ['paused', 'session'].includes(batch.state) ? batch.message : '' });
  const excludedRows = excludedCases.map(one => ({ one, state: 'leftOut' }));
  Object.defineProperty(batch, 'outputRows', { get: () => [...batch.rows, ...excludedRows] });
  batch.saved = false;
  batch.excelName = batchExcelName(now());
  batch.batchLabel = batch.excelName.replace(/\.xlsx$/, '');
  batch.packVersion = 0; batch.packageCheck = null;
  let savedRevision = -1, savedSignOff = null;
  batch.invalidateFiles = () => {
    filesRevision++; batch.saved = false; batch.saveMessage = ''; tell();
  };
  batch.save = async () => {
    if (!batch.confirmed || batch.active || batch.saving) return;
    const revision = filesRevision, name = signOff();
    const packVersion = batch.packVersion + (revision !== savedRevision || name !== savedSignOff ? 1 : 0);
    batch.saving = true; progress(); tell();
    try {
      const result = await saveResults(batch.outputRows, name, { excelName: batch.excelName, backupReport: report, runReport: combinedReportText(batch, version), batchLabel: batch.batchLabel, packVersion });
      batch.packVersion = packVersion; savedRevision = revision; savedSignOff = name;
      batch.packageCheck = Array.isArray(result?.packageCheck) ? result.packageCheck : null;
      batch.hasSaved = true;
      batch.saved = revision === filesRevision && name === signOff();
      batch.saveMessage = '';
    } catch (error) { batch.saved = false; batch.packageCheck = null; batch.saveMessage = `✗ Files not saved: ${error.message}.`; }
    finally {
      batch.saving = false;
      progress();
      tell();
    }
  };
  batch.record = (row, event) => {
    const data = row?.diagnostic;
    const run = batch.diagnostic;
    if (event.type === 'personLoaded' && hiddenIdentity && !returned) hiddenIdentity = personIdentity();
    if (event.type === 'searchStart' && row && batch.active && batch.state === 'running') {
      batch.displayIndex = batch.rows.indexOf(row);
      tell();
    }
    if (['begin', 'step', 'waitBegin', 'wait', 'waiting', 'write'].includes(event.type)) {
      progress(row);
      if (['waitBegin', 'wait', 'waiting'].includes(event.type) && event.name) lastWait = event.name;
    }
    if (event.type === 'begin' && data) data.currentStage = event.stage;
    if (event.type === 'step' && data) {
      data.steps.push({ stage: event.stage, seconds: event.seconds, ok: event.ok, retry: retrying });
      if (!event.ok && !recordingPicture && event.stage !== 'screenshot') data.failedStage = event.stage;
    }
    if (event.type === 'findStep' && ['open', 'filters', 'settle', 'submit', 'table'].includes(event.name) && Number.isFinite(event.seconds) && event.seconds >= 0) {
      run.findSteps.push({ name: event.name, seconds: event.seconds, person: row ? batch.rows.indexOf(row) + 1 : null, stage: data?.currentStage });
    }
    if (event.type === 'wait') run.waits.push({ ...event, person: row ? batch.rows.indexOf(row) + 1 : null });
    if (event.type === 'schedulePage' || event.type === 'identity') {
      const items = event.type === 'identity' ? run.identity : run.schedulePage;
      items.push({ ...event.facts, seconds: event.seconds, person: event.person ?? (row ? batch.rows.indexOf(row) + 1 : null),
        stage: event.stage || (recordingPicture ? 'screenshot' : data?.currentStage), operation: event.operation || 'page check' });
    }
    if (event.type === 'error' && data) {
      if (recordingPicture && event.code === 'screenshotUnreadable') pictureError = true;
      if (!recordingPicture) data.reason = event.code;
      if (!recordingPicture && ['pageUnreadable', 'pageTimeout', 'reportUnreadable', 'backupReadFailed', 'screenshotUnreadable'].includes(event.code)) run.unread.push({ person: batch.rows.indexOf(row) + 1, code: event.code, stage: data.currentStage || 'prepare' });
    }
    if (event.type === 'comparison' && data) data.comparison = event.summary;
    if (event.type === 'restoreRead' && event.purpose === 'completedRun' && data && typeof event.reused === 'boolean') {
      const reads = data.runReads ||= { reused: 0, fresh: 0 };
      reads[event.reused ? 'reused' : 'fresh']++;
    }
    if (event.type === 'waiting') tell(event.done ? '' : `Still loading: ${event.name}.`);
    if (event.type === 'miss') run.misses.push(event.name);
    if (event.type === 'slow') run.slow.push({ name: event.name, seconds: event.seconds });
    if (event.type === 'dialog') run.dialogs.push({ length: event.length, caller: event.caller, purpose: event.purpose, stage: data?.currentStage });
  };
  const tell = message => { if (message) batch.message = message; notify(batch); };
  let returned = false, hiddenIdentity = null, visibleEvent = null, checkingResume = false;
  const visibility = () => {
    const state = document.visibilityState === 'hidden' ? 'hidden' : 'visible';
    const event = { state, seconds: (Date.now() - (batch.diagnostic.started || Date.now())) / 1000 };
    batch.diagnostic.visibility.push(event);
    if (state === 'hidden') { try { hiddenIdentity = personIdentity(); } catch (error) { hiddenIdentity = { error }; } }
    else { returned = true; visibleEvent = event; }
  };
  const guard = probe => {
    if (sessionExpired()) throw new SessionError();
    connection?.check(checkingResume);
    if (!checkingResume && returned && hiddenIdentity?.error) throw hiddenIdentity.error;
    if (!checkingResume && returned && hiddenIdentity?.name) {
      try { checkPersonIdentity(hiddenIdentity, 'identity check', probe); }
      catch (error) { if (visibleEvent) visibleEvent.checked = false; if (error.identityPending) requireSchedulePage(probe); throw error; }
    }
    requireSchedulePage(probe);
    if (!checkingResume && returned) { if (visibleEvent) visibleEvent.checked = true; returned = false; hiddenIdentity = null; }
  };
  const checkedPage = async () => {
    const started = Date.now();
    try { await waitFor(() => { guard(); return true; }, 'Schedule page', WAIT.schedule); }
    catch (error) {
      if (error.schedulePage) { batch.record(observedRow, { type: 'schedulePage', facts: error.scheduleFacts, person: error.person, stage: error.stage, operation: error.operation, seconds: (Date.now() - started) / 1000 }); error.scheduleRecorded = true; }
      throw error;
    }
  };
  let unlock = null;
  let releaseGuard = null;
  let wrote = false;
  const picture = async (row, captureOptions = {}) => {
    observedRow = row;
    recordingPicture = true; pictureError = false;
    const requested = needsPersonPicture(row);
    let blocked;
    try { if (requested) await timedRun('screenshot', () => capture(row, { alreadyOpen: !!row.prepared?.identity, ...captureOptions })); }
    catch (error) {
      if (error.connectionLost) throw error;
      blocked = stopFlagged(error) && error;
      if (error.schedulePage && !error.scheduleRecorded) {
        batch.record(row, { type: 'schedulePage', facts: error.scheduleFacts, person: error.person, stage: error.stage || 'screenshot', operation: captureOptions.operation || 'capture' });
        error.scheduleRecorded = true;
      }
      pictureError = true;
      (row.one.outputs ||= { screenshots: [] }).warnings = `Screenshot not made: ${error.message}`;
    }
    finally { recordingPicture = false; }
    row.diagnostic.pictures = row.one.outputs?.screenshots?.length || 0;
    const failed = requested && (pictureError || !row.diagnostic.pictures || /Screenshot not made:/.test(row.one.outputs?.warnings || ''));
    row.pictureToTakeByHand = failed && ['done', 'nothing'].includes(row.state);
    if (failed) batch.diagnostic.unread.push({ person: batch.rows.indexOf(row) + 1, code: 'screenshotUnreadable', stage: 'screenshot' });
    const stepRecord = row.diagnostic.steps.findLast(item => item.stage === 'screenshot');
    if (stepRecord) stepRecord.ok = !failed;
    batch.diagnostic.pageInfo = safePageInfo(version);
    if (blocked?.schedulePage && !blocked.session && !blocked.identityChanged && !blocked.batchWide && !blocked.pageBlocked) {
      try { await checkedPage(); } catch (error) { if (row.pictureToTakeByHand && batch.rows[batch.index] === row) batch.index++; throw error; }
      return;
    }
    if (blocked) { if (row.pictureToTakeByHand && batch.rows[batch.index] === row) batch.index++; throw blocked; }
  };
  async function step(fn) {
    await checkedPage();
    try { return await fn(); } catch (error) {
      if (error.connectionLost) throw error;
      if (error.name !== 'PageError') batch.record(observedRow, { type: 'error', code: reasonCode(error.message) });
      if (error.session || sessionExpired()) { error.session = true; throw error; }
      if (error.schedulePage && !error.identityChanged && !error.session && !error.batchWide && !error.pageBlocked) {
        await checkedPage();
        delete error.schedulePage; error.noReplay = true;
      }
      if (wrote || error.addPressed || error.noReplay || stopFlagged(error) || error.reasonCode === 'pageReportMismatch' || /schedule changed since|shown person changed|Nothing was deleted|Snooze will not guess/i.test(error.message)) throw error;
      retrying = true;
      tell('');
      await cancelBatchWindows();
      await checkedPage();
      try { return await fn(); } finally { retrying = false; }
    }
  }
  const options = { step, onWrite: async () => { await waitFor(() => { guard(); return true; }, 'Schedule page before a write', WAIT.schedule); checkPlannedDates(observedRow); wrote = true; batch.changesAttempted = true; progress(observedRow); } };
  const skipReason = row => row.one.personStop ? reasonLine(row.one.personStop)
    : row.one.decision.outcome !== 'report' ? reasonLine(row.one.decision)
      : 'The Staff Schedule Hours Report for this person is not ready.';
  function pauseOrStop() {
    if (batch.stopRequested) { batch.diagnostic.stopped = true; batch.state = 'stopped'; tell(''); return true; }
    if (batch.pauseRequested) {
      batch.diagnostic.paused = true; batch.state = 'paused'; batch.message = ''; tell(); return true;
    }
    return false;
  }
  async function recover(row, restart = false) {
    observedRow = row;
    row.diagnostic.reason = 'changeUnproved'; row.diagnostic.failedStage ||= 'check';
    batch.pendingRestore = row;
    if (!restart) {
      row.one.run = { state: 'failed', prepared: row.prepared, message: BATCH.pendingRestore };
      tell(BATCH.pendingRestore);
    }
    try {
      await checkedPage();
      await cancelBatchWindows();
      const recoveryToday = currentToday();
      row.restoreResult = await timedRun('restore', () => recoverBackup(row.prepared.backup, { today: recoveryToday }));
      const past = compareDays(recoveryToday, today) > 0
        ? [...new Set(changeDays(row).filter(day => compareDays(day, recoveryToday) < 0
          && !(row.prepared.tax && row.restoreResult.after && compareCopies(
            { days: row.prepared.backup.days.filter(old => compareDays(old.day, day) === 0) },
            { days: row.restoreResult.after.days.filter(old => compareDays(old.day, day) === 0) }).same)
          && (!row.prepared.backup.reportEnd || compareDays(day, row.prepared.backup.reportEnd) <= 0)).map(usDate))] : [];
      if (past.length) {
        row.restoreResult.same = false;
        row.restoreResult.unrestoredDates = [...new Set([...(row.restoreResult.unrestoredDates || []), ...past])];
        row.restoreResult.differences = [...(row.restoreResult.differences || []), ...past.map(date => ({ date, field: 'restore unconfirmed', message: `${date}: restore unconfirmed` }))];
      }
      if (restart && row.restoreResult.same) {
        row.diagnostic.recovery = { confirmed: true, window: row.prepared.backup.window, differences: [] };
        batch.pendingRestore = null; batch.connectionRetry = null;
        row.state = 'ready'; row.message = ''; delete row.one.run; delete row.byHand;
        delete row.prepared; wrote = false;
        return true;
      }
      row.state = row.restoreResult.same ? 'restored' : 'restoreFailed';
      row.one.run = { state: 'failed', prepared: row.prepared, message: row.restoreResult.same ? BATCH.restored : BATCH.restoreFailed };
      batch.pendingRestore = null;
      await picture(row);
      tell(row.restoreResult.same ? BATCH.restored : BATCH.restoreFailed);
    } catch (error) {
      if (error.connectionLost) throw error;
      if (error.session || sessionExpired()) { batch.diagnostic.expired = true; batch.state = 'session'; batch.recheckDone = true; tell(BATCH.session); return false; }
      if (error.identityChanged || error.schedulePage || error.batchWide) throw error;
      row.diagnostic.reason = 'restoreUnproved'; row.diagnostic.failedStage = 'restore';
      row.state = 'restoreFailed'; row.message = error.message;
        row.restoreProgress = error.restoreProgress || null;
      row.one.run = { state: 'failed', prepared: row.prepared, message: BATCH.restoreFailed };
      batch.pendingRestore = null; tell(BATCH.restoreFailed);
      await picture(row);
    }
    row.byHand = true;
    row.diagnostic.recovery = { confirmed: row.restoreResult?.same === true,
        window: row.prepared?.backup?.window, differences: row.restoreResult?.differences || [], progress: row.restoreProgress };
    try { await checkedPage(); await closeSkippedPerson(); await checkedPage(); }
    catch (error) {
      if (error.connectionLost) throw error;
      if (error.session || sessionExpired() || error.identityChanged || error.schedulePage || error.batchWide) throw error;
      batch.pagePaused = true; batch.diagnostic.paused = true; batch.state = 'paused';
      batch.emptyBeforeResume = !error.multipleSchedules;
      batch.index++;
      tell(BATCH.pageBlocked); return false;
    }
    wrote = false;
    batch.index++;
    batch.state = 'running';
    return !pauseOrStop();
  }
  async function drive() {
    if (batch.active) return;
    batch.invalidateFiles();
    wrote = false;
    batch.active = true;
    batch.state = 'running';
    watchBrowser();
    progress();
    const releaseRecord = setRunRecorder(event => batch.record(observedRow, event));
    try {
      releaseGuard = setBatchGuard(guard);
      unlock = lock();
      document.addEventListener('visibilitychange', visibility);
      batch.diagnostic.pageInfo = safePageInfo(version);
      await checkedPage();
      if (batch.pendingRestore && !await recover(batch.pendingRestore, batch.connectionRetry === batch.pendingRestore)) return;
      if (batch.recheckDone) {
        await cancelBatchWindows();
        for (const row of batch.rows.filter(one => one.state === 'done')) {
          observedRow = row;
          tell(BATCH.checkingDone);
          await step(() => openPerson(row.one.record.email, row.one.record.person.professional, row.one.record, {
            today: currentToday(), termDate: row.prepared.backup?.termDate ?? row.one.slice?.person?.termDate ?? row.one.record.person.termDate,
          }));
          const plan = row.one.decision.plan;
          const dnsPlan = plan.action === 'dns' && row.prepared.exitRuns
            ? row.prepared.addDns ? { ...plan, dnsEnd: row.prepared.editableDnsEnd } : null
            : plan.action === 'dns' ? plan : null;
          const again = await step(() => copyWindow(row.prepared.watchedWindow, { future: ['dns', 'clearClients'].includes(row.one.decision.plan.action) }));
          const result = compareCopies(row.after, again);
          const dnsCopy = dnsPlan && row.prepared.exitRuns ? { ...again, days: again.days.filter(row =>
            compareDays(row.day, dnsPlan.dnsStart) >= 0 && compareDays(row.day, dnsPlan.dnsEnd) <= 0) } : again;
          const loaOk = row.prepared.tax ? row.after.days.filter(row => row.noteTextSubmitted).every(old => again.days.some(row => row.date === old.date && row.client === old.client && row.hours === old.hours && row.notes > 0)) : plan.action === 'dns' ? !dnsPlan || checkDnsAdded(dnsCopy, dnsPlan, 8).ok : plan.action !== 'add' || checkLoaAdded(again, plan, 8).ok;
          if (!result.same || !loaOk) throw new PageError('A completed person changed after the run stopped. The batch stopped.');
        }
        batch.recheckDone = false;
      }
      while (batch.index < batch.rows.length) {
        wrote = false;
        await checkedPage();
        if (pauseOrStop()) return;
        if (clock.left() < PERSON_RESERVE_MS) {
          batch.clockPaused = true; batch.diagnostic.paused = true; batch.state = 'paused'; tell(SESSION_WORDS.pause); return;
        }
        const row = batch.rows[batch.index];
        observedRow = row; retrying = false;
        progress(row);
        wrote = false;
        const personStarted = Date.now();
        try {
        try {
        if (row.one.record.subcategory?.site === 'tax' && (row.one.personStop?.code === 'taxPartnerMd' || row.state === 'nothing' && ['leaveOver', 'taxPastEnd'].includes(row.one.decision.code))) row.state = 'ready';
        if (row.state === 'ready') {
          tell('');
          checkPlannedDates(row);
          row.prepared = await prepare(row.one, version, currentToday(), { step });
          row.message = row.prepared.stop || row.prepared.nothing || '';
          if (row.prepared.stop) { row.diagnostic.reason = row.prepared.reasonCode || reasonCode(row.prepared.stop); row.diagnostic.failedStage = row.diagnostic.comparison?.agreed === false ? 'compare' : row.diagnostic.currentStage || 'prepare'; }
          if (row.diagnostic.reason === 'backupReadFailed') batch.diagnostic.unread.push({ person: batch.index + 1, code: 'backupReadFailed', stage: 'read' });
          if (row.prepared.reasonCode === 'pageReportMismatch') throw Object.assign(new PageError(row.message), {
            reasonCode: 'pageReportMismatch', skipReason: row.prepared.skipReason,
          });
          if (row.prepared.stop) row.state = 'skipped';
          else if (row.prepared.nothing) {
            row.state = 'nothing'; row.one.run = { state: 'nothing', prepared: row.prepared, message: row.prepared.nothing, batch: true };
          } else {
            tell();
            try {
              row.result = await apply(row.one, row.prepared, options);
              row.diagnostic.method = row.result.method || methodOf(row.one.decision.plan);
              if (!row.result.ok) { if (!await recover(row)) return; continue; }
              row.after = row.result.after;
              row.state = 'done';
              delete row.diagnostic.reason; delete row.diagnostic.failedStage;
              row.one.run = { state: 'done', prepared: row.prepared, result: row.result, batch: true };
            } catch (error) {
              row.message = error.message;
              if (wrote) {
                if (error.identityChanged || error.schedulePage || error.batchWide || error.connectionLost) {
                  batch.pendingRestore = row;
                  if (error.connectionLost) batch.connectionRetry = row;
                  throw error;
                }
                if (!await recover(row)) return;
                continue;
              }
              throw error;
            }
          }
        }
        if (batch.phase === 'run') await picture(row);
        } catch (error) {
          if (error.connectionLost) throw error;
          if (row.pictureToTakeByHand && ['done', 'nothing'].includes(row.state) && stopFlagged(error)) throw error;
          if (error.schedulePage) throw error;
          const firstTaxId = error.initialTaxIdUnconfirmed && row.one.record.subcategory?.site === 'tax'
            && row.state === 'ready' && !row.prepared;
          if (!wrote && !error.addPressed && !error.session && !sessionExpired() &&
              error instanceof PageError && !error.pageBlocked && !error.batchWide && (!error.identityChanged || firstTaxId)) {
            if (error.timeout) error.reasonCode = 'pageTimeout';
            error.reasonCode ||= reasonCode(error.message);
            row.state = 'skipped';
            row.message = error.reasonCode === 'pageTimeout' ? `Page too slow: ${error.message} Nothing changed.`
              : error.reasonCode === 'personNotFound'
              ? `Not found on MySource: ${row.one.record.email}${/will not guess/i.test(error.message) ? `; ${error.message}` : ''}`
              : error.reasonCode === 'pageReportMismatch'
              ? error.skipReason || `Schedule differs from the Staff Schedule Hours Report: ${error.message}; nothing changed`
              : `${error.message}${/nothing (was )?(changed|deleted)/i.test(error.message) ? '' : ' Nothing changed.'}`;
            row.diagnostic.reason = error.reasonCode;
            row.diagnostic.failedStage ||= error.reasonCode === 'pageReportMismatch' ? 'compare' : error.reasonCode === 'personNotFound' ? 'open person' : (row.diagnostic.currentStage || 'prepare');
            try { await checkedPage(); await closeSkippedPerson(); await checkedPage(); }
            catch (closing) {
              if (closing.identityChanged || closing.session || sessionExpired() || !closing.pageBlocked) throw closing;
              row.diagnostic.reason = error.reasonCode;
              batch.index++;
              batch.emptyBeforeResume = !closing.multipleSchedules;
              batch.diagnostic.paused = true; batch.pagePaused = true; batch.state = 'paused';
              tell(`${closing.message} ${BATCH.pageBlocked}`); return;
            }
            row.diagnostic.reason = error.reasonCode;
            await picture(row);
          } else {
            if (error.identityChanged || !error.pageBlocked || error.session || sessionExpired() || (wrote && row.state !== 'done')) throw error;
            if (row.state !== 'done') {
              row.state = 'skipped'; row.message = error.message;
              row.diagnostic.reason = reasonCode(error.message);
              row.diagnostic.failedStage ||= row.diagnostic.currentStage || 'open person';
              await picture(row);
            }
            batch.index++;
            batch.emptyBeforeResume = !error.multipleSchedules;
            if (error.multipleSchedules || !pageCalm()) {
              batch.diagnostic.paused = true; batch.pagePaused = true; batch.state = 'paused'; tell(`${error.message} ${BATCH.pageBlocked}`); return;
            }
            tell();
            continue;
          }
        }
        } finally { row.diagnostic.seconds = (row.diagnostic.seconds || 0) + (Date.now() - personStarted) / 1000; }
        batch.index++;
        tell();
        if (pauseOrStop()) return;
      }
      batch.state = 'complete';
      tell('');
    } catch (error) {
      if (error.schedulePage && error.scheduleFacts && !error.scheduleRecorded) batch.record(observedRow, { type: 'schedulePage', facts: error.scheduleFacts, person: error.person, stage: error.stage, operation: error.operation });
      if (error.identityChanged && !error.identityRecorded) batch.record(observedRow, { type: 'identity', facts: error.identityFacts, person: error.person, stage: error.stage, operation: error.operation });
      if (error.session || sessionExpired()) {
        batch.diagnostic.expired = true;
        batch.state = 'session'; batch.recheckDone = true; tell(BATCH.session);
      } else if (error.connectionLost) {
        batch.diagnostic.paused = true; batch.connectionPaused = true; batch.state = 'paused';
        tell(CONNECTION_WORDS);
      } else if (error.identityChanged) {
        batch.diagnostic.paused = true; batch.identityPaused = true; batch.state = 'paused';
        const f = error.identityFacts, shape = error.identityShape;
        const why = [f && f.nameCount !== 1 && `names shown: ${f.nameCount}`, f && f.nameCount === 1 && !f.nameEqual && `name differs (shown name ${f.nameLengthDifference > 0 ? '+' : ''}${f.nameLengthDifference} characters${f.nameSpacingCaseOnly ? ', spacing or case only' : ''}${f.idEqual ? ', id matches' : ''}${shape ? `, first difference at character ${shape.at + 1} of ${shape.of} (saved: ${shape.savedKind}, shown: ${shape.shownKind}), ${shape.sameLettersReordered ? 'same letters in another order' : 'other letters'}${shape.shownLeadingSpace || shape.shownTrailingSpace ? ', extra space at an end' : ''}${shape.shownHasLineBreak ? ', line break inside' : ''}` : ''})`,
          f && f.idCount !== 1 && `ids found: ${f.idCount}`, f && f.idCount === 1 && !f.idReadable && 'id unreadable', f && f.idReadable && !f.idEqual && 'id differs',
          f && !f.calendarPresent && 'calendar missing', f && f.calendarAmbiguous && 'calendar unclear', error.operation && `at: ${error.operation}`].filter(Boolean).join('; ');
        tell(why ? `${IDENTITY_PAUSE_WORDS}\nWhat failed: ${why}.` : IDENTITY_PAUSE_WORDS);
      } else if (error.schedulePage) {
        batch.diagnostic.paused = true; batch.schedulePaused = true; batch.state = 'paused';
        tell(SCHEDULE_PAGE_WORDS.pause);
      } else if (error.pageBlocked && (!wrote || observedRow?.pictureToTakeByHand)) {
        batch.emptyBeforeResume = !error.multipleSchedules;
        batch.diagnostic.paused = true; batch.pagePaused = true; batch.state = 'paused';
        tell(`${error.message} ${BATCH.pageBlocked}`);
      } else if (observedRow?.pictureToTakeByHand && ['done', 'nothing'].includes(observedRow.state)) {
        batch.state = 'failed'; tell(error.message);
      } else {
        batch.state = 'failed';
        const row = batch.rows[batch.index];
        if (row) { row.state = 'failed'; row.message = error.message; row.diagnostic.reason = reasonCode(error.message); row.diagnostic.failedStage ||= row.diagnostic.currentStage || 'prepare'; if (batch.phase === 'run') await picture(row); }
        tell(error.message);
      }
    } finally {
      stopWatch();
      document.removeEventListener('visibilitychange', visibility);
      releaseRecord();
      if (['complete', 'failed', 'stopped'].includes(batch.state)) batch.diagnostic.ended = Date.now();
      releaseGuard?.(); releaseGuard = null;
      try { unlock?.(); } finally { unlockPage(); unlock = null; }
      batch.active = false;
      tell();
      if (['complete', 'failed', 'stopped'].includes(batch.state)) { connection?.close(); connection = null; }
      else autoResume();
    }
  }
  batch.start = async () => {
    if (batch.state !== 'idle') return;
    try { if (!loadedReports(report).length) requireDayReport(null); for (const one of loadedReports(report)) { requireDayReport(one); requireFreshReport(one, now()); } } catch (error) { reportFailure(error); batch.state = 'failed'; tell(error.message); return; }
    try { batch.site = siteReader ? siteReader() : 'consulting'; }
    catch (error) { batch.state = 'failed'; tell(error.message); return; }
    const otherSite = batch.rows.filter(row => (row.one.record.subcategory?.site || 'consulting') !== batch.site || row.one.personStop?.code === 'taxTalentGroup');
    for (const row of otherSite) {
      row.one.decision = (row.one.record.subcategory?.site || 'consulting') !== batch.site
        ? { outcome: 'notHandled', code: 'wrongSite', site: row.one.record.subcategory?.site || 'consulting' } : row.one.personStop;
      delete row.one.personStop;
      excludedRows.push({ ...row, state: 'leftOut', message: reasonLine(row.one.decision) });
    }
    batch.rows = batch.rows.filter(row => !otherSite.includes(row));
    noAction += otherSite.length; batch.diagnostic.noAction = noAction;
    for (const row of batch.rows) {
      if (row.one.personStop || row.one.decision.outcome !== 'report' || !row.one.decision.plan?.action || row.one.slice?.status !== 'ready') {
        row.state = row.one.slice?.status !== 'notOnReport' && !row.one.personStop && row.one.decision.outcome === 'noReport' ? 'nothing' : 'skipped';
        row.message = row.one.slice?.status === 'notOnReport' ? `not on the Staff Schedule Hours Report, possibly not ${row.one.record.subcategory?.business === 'audit' ? 'A&A' : row.one.record.subcategory?.site === 'tax' ? 'Tax' : 'Consulting'}` : skipReason(row);
        row.diagnostic.reason = row.one.slice?.status === 'notOnReport' ? 'notOnReport' : row.one.personStop?.code || row.one.decision.code;
        row.diagnostic.failedStage = 'report';
        if (['unreadableDate', 'termDateUnreadable'].includes(row.diagnostic.reason)) batch.diagnostic.unread.push({ person: batch.rows.indexOf(row) + 1, code: row.diagnostic.reason, stage: 'report' });
      } else { row.state = 'ready'; row.toDo = true; }
      reviewStates.set(row, row.state);
    }
    showTimeLimit(estimateBatch(batch.rows, reviewStates, clock.left()));
    batch.state = 'ready'; tell();
  };
  batch.confirm = async () => {
    if (batch.state !== 'ready' || batch.active) return;
    try { for (const one of loadedReports(report)) requireFreshReport(one, now()); } catch (error) { reportFailure(error); batch.state = 'failed'; tell(error.message); return; }
    const left = clock.left(), current = estimateBatch(batch.rows, reviewStates, left);
    if (left < CONFIRM_RESERVE_MS || current.budget <= 0 || current.total > 0 && current.included.length === 0) {
      showTimeLimit(current); tell(SESSION_WORDS.confirm); return;
    }
    if (batch.timeLimit.included.some(index => !current.included.includes(index))
        || batch.timeLimit.included.length === 0 && current.included.length > 0) {
      showTimeLimit(current); batch.message = ''; tell(); return;
    }
    for (const row of batch.rows) {
      const plan = row.one.decision.plan;
      approvedDates.set(row.one, [plan?.loaStart, plan?.loaEnd, plan?.dnsStart, plan?.dnsEnd].filter(Boolean).map(day => ({ ...day })));
    }
    batch.confirmed = true; batch.phase = 'run'; batch.index = 0;
    batch.diagnostic.started = Date.now(); batch.diagnostic.reportAge = Math.max(...loadedReports(report).map(one => (now() - one.pullTime.time) / 60000));
    batch.diagnostic.noAction = noAction;
    batch.total = batch.rows.filter(row => row.state === 'ready' || needsPersonPicture(row)).length;
    return drive();
  };
  batch.pause = () => { if (batch.active) { batch.pauseRequested = true; tell(BATCH.pausing); } };
  batch.stop = () => {
    batch.stopRequested = true;
    batch.diagnostic.stopped = true;
    if (batch.active) tell(BATCH.stopping);
    else {
      batch.invalidateFiles();
      if (batch.pendingRestore) { batch.pendingRestore.state = 'restoreFailed'; batch.state = 'failed'; tell(BATCH.stopNeedsRestore); }
      else { batch.state = 'stopped'; tell(''); }
      batch.diagnostic.ended = Date.now();
      connection?.close(); connection = null;
    }
  };
  batch.resume = async () => {
    if (!['paused', 'session'].includes(batch.state) || batch.active) return;
    if (batch.connectionPaused) {
      try { connection.beginResume(); }
      catch { tell(CONNECTION_WORDS); return; }
    }
    if (clock.left() < PERSON_RESERVE_MS) { tell(SESSION_WORDS.pause); return; }
    if (sessionExpired()) { tell(BATCH.expired); return; }
    batch.active = true; tell();
    let releaseResume, releaseConnectionGuard;
    try {
      checkingResume = true;
      releaseResume = lock();
      if (batch.connectionPaused) releaseConnectionGuard = setBatchGuard(guard);
      await checkedPage();
      if (batch.connectionPaused) {
        if (connectionIdentity?.error) throw connectionIdentity.error;
        await connectionPageReady(connectionIdentity);
        connection.accept();
      } else await resumePageReady({ empty: !!batch.emptyBeforeResume });
      const turn = batch.pendingRestore || batch.rows[batch.index];
      if (turn?.prepared?.identity && (batch.pendingRestore || turn.state === 'ready')) await waitForPersonIdentity(turn.prepared.identity);
      returned = false; hiddenIdentity = null; visibleEvent = null;
    }
    catch (error) {
      if (error.connectionLost) {
        batch.connectionPaused = true; batch.state = 'paused';
        queueMicrotask(autoResume);
      }
      tell(error.message); return;
    }
    finally { checkingResume = false; releaseConnectionGuard?.(); try { releaseResume?.(); } finally { unlockPage(); batch.active = false; tell(); } }
    if (batch.connectionPaused) {
      const row = batch.rows[batch.index];
      if (!batch.pendingRestore && row?.state === 'ready') delete row.prepared;
      connectionIdentity = null; batch.connectionPaused = false;
    }
    batch.emptyBeforeResume = false;
    batch.pagePaused = false;
    batch.schedulePaused = false;
    batch.identityPaused = false;
    batch.clockPaused = false;
    batch.diagnostic.resumed++;
    if (batch.state === 'session') batch.diagnostic.sessionResumed = true;
    batch.pauseRequested = false;
    return drive();
  };
  batch.retakePicture = async rowIndex => {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) return false;
    const row = batch.rows[rowIndex];
    if (batch.active || batch.pendingRestore || !['complete', 'stopped', 'failed'].includes(batch.state) || !row ||
        !['done', 'nothing'].includes(row.state) || !row.pictureToTakeByHand) return false;
    batch.active = true; observedRow = row;
    const releaseRecord = setRunRecorder(event => batch.record(row, event));
    let release, releaseCheck;
    try {
      batch.invalidateFiles();
      release = lock(); releaseCheck = setBatchGuard(guard);
      document.addEventListener('visibilitychange', visibility);
      await checkedPage();
      await openPerson(row.one.record.email, row.one.record.person?.professional, null, { fresh: true });
      const identity = personIdentity();
      row.one.outputs = { screenshots: [] };
      await picture(row, { alreadyOpen: true, identity, operation: 'retake' });
      return !row.pictureToTakeByHand;
    } catch (error) {
      row.pictureToTakeByHand = true; row.pictureRetakeReason = reasonCode(error.message);
      (row.one.outputs ||= { screenshots: [] }).warnings = `Screenshot not made: ${error.message}`;
      if (error.schedulePage && !error.scheduleRecorded) batch.record(row, { type: 'schedulePage', facts: error.scheduleFacts, operation: 'retake' });
      if (error.identityChanged && !error.identityRecorded) batch.record(row, { type: 'identity', facts: error.identityFacts, operation: 'retake' });
      return false;
    }
    finally { document.removeEventListener('visibilitychange', visibility); releaseCheck?.(); releaseRecord(); try { release?.(); } finally { unlockPage(); batch.active = false; tell(); } }
  };
  return batch;
}
__exports.BATCH = BATCH;
__exports.createBatch = createBatch;
},
"screen/batch-panel.js": function (__require, __exports, document, window) {
'use strict';
const { pastReportWarning } = __require("../run/backup.js");
const { COLOURS } = __require("../family/look.js");
const { PERSON_RESERVE_MS, CONFIRM_RESERVE_MS, SESSION_WORDS } = __require("./session-clock.js");
const { el } = __require("./ui.js");
const { createBatch, BATCH } = __require("../run/batch.js");
const { readSite } = __require("../mysource/site.js");
const { batchCover, sessionExpired } = __require("../mysource/batch.js");
const { PageError, setBatchGuard } = __require("../mysource/dom.js");
const { restore, previewRestore } = __require("../run/work.js");
const { usDate } = __require("../rules/dates.js");
const { failedRow, personName, runningText, undoLine, undoRanges, undoChangeWords, mailFNoAction, canUndo, changedRow, undoState } = __require("./compact.js");
const { LOA_CLIENT, DNS_CLIENT } = __require("../mysource/checks.js");
const { runReportScreenButton } = __require("./live-test-report.js");
const { setRunRecorder, timedRun, reasonCode } = __require("../core/run-records.js");
const { REPORT_TIME_WORDS } = __require("../files/report-time.js");
const { reportTimeLine } = __require("../files/report-time.js");
const { requireSchedulePage, waitForPersonIdentity, SCHEDULE_PAGE_WORDS } = __require("../mysource/schedule.js");
const { needsPersonPicture } = __require("../files/batch-outputs.js");
const { loadedReports, reportKind } = __require("../files/report.js");
const { reasonLine } = __require("./wording.js");
function renderBatch(batch, work, box, draw) {
  const rows = batch.rows;
  const listedRows = rows.filter(row => !mailFNoAction(row.one));
  const picturePending = row => row.state === 'nothing' && needsPersonPicture(row)
    && !row.one.outputs?.screenshots?.length && !row.pictureToTakeByHand
    && (!batch.confirmed || rows.indexOf(row) >= (batch.index || 0));
  const isDone = row => ['done', 'nothing'].includes(row.state) && !picturePending(row);
  work.saved = batch.saved === true || batch.confirmed === false;
  const ready = rows.filter(row => row.state === 'ready' || picturePending(row)).length;
  const byHand = rows.filter(row => row.state === 'skipped' || row.byHand).length;
  const failed = rows.filter(failedRow).length;
  const done = listedRows.filter(isDone).length;
  const noAction = (batch.diagnostic?.noAction || 0) + rows.filter(row => mailFNoAction(row.one)).length;
  const undone = rows.filter(row => row.state === 'undone').length;
  const notRun = rows.filter(row => ['pending', 'ready'].includes(row.state) || picturePending(row)).length;
  const ended = ['complete', 'stopped', 'failed'].includes(batch.state) && !batch.active;
  const running = batch.phase === 'run' && !ended;
  work.setScreenTitle?.('');
  const undoScroll = box.querySelector('.undo-list')?.scrollTop || 0;
  box.replaceChildren();
  const clock = batch.clock || work.clock;
  const clockLeft = () => clock?.left() ?? Infinity;
  work.refreshClockControls = null;
  const actions = el('div', { class: 'buttons' });
  const button = (label, colour, fn, disabled = false) => el('button', { class: colour, onclick: fn, disabled }, label);
  const saveButton = () => button(batch.saving ? 'Saving files…' : !batch.saved && (batch.hasSaved || batch.saveMessage || rows.some(row => row.state === 'undone')) ? 'Save files · not saved' : 'Save files', 'blue', async () => {
    if (work.busy || batch.active || batch.saving) return;
    work.busy = true; work.outputActive = true; draw();
    try { await batch.save(); } finally { work.busy = false; work.outputActive = false; draw(); }
  }, work.busy || batch.active || batch.saving);
  const reportButton = () => runReportScreenButton(work, box, draw);
  const countLine = parts => el('div', { class: 'counts', role: 'status' }, ...parts.filter((part, i) => part[0] !== null && (i === 0 || !part[0].startsWith('0 ')))
    .flatMap(([text, tone], i) => [...(i ? [el('span', { class: 'c-sep' }, '·')] : []), el('span', { class: tone || '' }, text)]));
  if (running) {
    if (batch.state === 'running' && batch.stallMessage) box.append(el('div', { class: 'warn', role: 'status' }, batch.stallMessage));
    const completed = rows.filter(row => !picturePending(row) && (row.toDo ? !['ready', 'pending'].includes(row.state) : row.state === 'done' || row.state === 'nothing' && needsPersonPicture(row) || failedRow(row) && row.prepared)).length;
    const total = batch.total || ready + completed;
    const current = Number.isInteger(batch.displayIndex) ? rows[batch.displayIndex]
      : rows[batch.index]?.state === 'ready' || picturePending(rows[batch.index] || {}) ? rows[batch.index] : rows.find(row => row.state === 'ready' || picturePending(row));
    const doneSoFar = listedRows.filter(isDone).length;
    if (current) {
      const text = runningText(current);
      box.append(el('div', { class: 'status', role: 'status' }, text.person), el('div', { class: 'run-now' }, text.dates));
    }
    box.append(el('div', { class: 'run-line' }, countLine([[`${doneSoFar} done`, 'c-done'], [`${byHand} by hand`, 'c-hand'], [`${noAction} no action`, 'c-no-action'], [`${failed} failed`, 'c-fail'], [`${notRun} to do`, 'c-todo'], [`${undone} undone`, '']]),
        el('span', { class: 'run-of' }, `${Math.min(completed + (current ? 1 : 0), total)}/${total}`)),
      el('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': completed, 'aria-valuemin': 0, 'aria-valuemax': total },
        el('div', { style: `width:${total ? Math.min(100, completed / total * 100) : 0}%` })));
    const stack = el('div', { class: 'stack' });
    if (['paused', 'session'].includes(batch.state)) {
      const message = batch.pauseMessage || batch.message || (batch.schedulePaused ? SCHEDULE_PAGE_WORDS.pause : batch.clockPaused ? SESSION_WORDS.pause : batch.state === 'session' ? BATCH.session : batch.pagePaused ? BATCH.pageBlocked : '');
      if (message && !['Paused', 'Paused. Press Resume to carry on.'].includes(message)) box.append(el('div', { class: 'warn', role: 'status' }, message));
      if (batch.clockPaused && !batch.active) box.append(el('div', { class: 'dates' }, SESSION_WORDS.reload));
      if (batch.saveMessage) box.append(el('div', { class: 'warn', role: 'status' }, batch.saveMessage));
      stack.append(saveButton(), reportButton());
      const resume = button('Resume', 'amber', () => { if (!work.busy && !batch.active && clockLeft() >= PERSON_RESERVE_MS) batch.resume(); });
      work.refreshClockControls = () => { resume.disabled = work.busy || batch.active || clockLeft() < PERSON_RESERVE_MS; };
      work.refreshClockControls(); stack.append(resume);
    } else stack.append(button(batch.pauseRequested ? 'Pausing…' : 'Pause', 'blue', () => batch.pause(), batch.pauseRequested || batch.stopRequested));
    stack.append(button(batch.stopRequested ? 'Stopping…' : 'Stop', 'red', () => batch.stop(), batch.stopRequested));
    if (['paused', 'session'].includes(batch.state)) stack.append(button('New batch', 'red', () => newBatchPopup(work), work.busy || batch.active || batch.saving));
    box.append(stack);
    return;
  }
  box.append(ended
    ? countLine([[`${done} done`, 'c-done'], [`${byHand} by hand`, 'c-hand'], [`${noAction} no action`, 'c-no-action'], [`${failed} failed`, 'c-fail'], [`${notRun} to do`, 'c-todo'], [`${undone} undone`, '']])
    : countLine([[`${ready} to do`, 'c-todo'], [`${byHand} by hand`, 'c-hand'], [`${noAction} no action`, 'c-no-action'], [`${failed} failed`, 'c-fail']]));
  if (ended) {
    if (batch.saveMessage) box.append(el('div', { class: batch.saved ? 'dates' : 'warn', role: 'status' }, batch.saveMessage));
    if (batch.state === 'failed' && (failed === 0 || Object.values(REPORT_TIME_WORDS).includes(batch.message))) box.append(el('div', { class: 'warn', role: 'status' }, batch.message));
    const stack = el('div', { class: 'stack' });
    if (batch.confirmed) stack.append(saveButton());
    stack.append(reportButton());
    if (typeof batch.retakePicture === 'function' && !batch.active && !batch.pendingRestore) {
      rows.forEach((row, index) => {
        if (!['done', 'nothing'].includes(row.state) || !row.pictureToTakeByHand) return;
        stack.append(button(`Retake picture · ${personName(row.one)}`, 'blue', async () => {
          if (work.busy || batch.active || batch.saving) return;
          work.busy = true; draw();
          try { await batch.retakePicture(index); } finally { work.busy = false; draw(); }
        }, work.busy || batch.saving));
      });
    }
    const changed = rows.filter(changedRow);
    if (changed.length) {
      const list = el('div', { id: 'snooze-undo-list', class: 'undo-list', 'aria-label': 'Changed people', hidden: !work.undoExpanded });
      const label = () => `Undo · ${changed.length} changed ${work.undoExpanded ? '▾' : '▸'}`;
      const toggle = button(label(), 'grey undo-toggle', () => {
        work.undoExpanded = !work.undoExpanded;
        list.hidden = !work.undoExpanded;
        toggle.textContent = label();
        toggle.setAttribute('aria-expanded', String(!!work.undoExpanded));
      });
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(!!work.undoExpanded));
      toggle.setAttribute('aria-controls', list.id);
      for (const row of changed) {
        const line = el('div', { class: 'person-row' }, el('div', { class: 'person-name' }, personName(row.one)));
        const state = undoState(row);
        if (state) line.append(el('div', { class: 'undo-state' }, state));
        else if (canUndo(row)) line.append(button('Undo', 'undo', () => undoPopup(row, work, draw), work.busy || batch.saving));
        const warning = ['undone', 'undoFailed'].includes(row.state) && pastReportWarning(row.prepared?.backup);
        if (warning) line.append(el('div', { class: 'warn' }, warning));
        list.append(line);
      }
      stack.append(el('div', { class: 'undo-fold' }, toggle, list));
    }
    stack.append(button('New batch', 'red', () => newBatchPopup(work), work.busy || batch.saving));
    box.append(stack);
    const list = box.querySelector('.undo-list');
    if (list) list.scrollTop = undoScroll;
  } else {
    for (const row of (batch.outputRows || rows).filter(row => (row.one.personStop || row.one.decision).code === 'bothReports' || row.one.record?.subcategory?.site === 'tax'
      && ['taxTalentGroup', 'taxPartialLoa', 'taxPastEnd', 'leaveOver'].includes((row.one.personStop || row.one.decision).code))) {
      box.append(el('div', { class: 'person-row' }, el('div', { class: 'person-name' }, personName(row.one)),
        el('div', { class: 'reason' }, reasonLine(row.one.personStop || row.one.decision))));
    }
    for (const row of listedRows.filter(row => row.state === 'ready' && row.one.reportHint)) {
      box.append(el('div', { class: 'person-row' }, el('div', { class: 'person-name' }, personName(row.one)),
        el('div', { class: 'reason' }, row.one.reportHint)));
    }
    if (batch.timeLimit?.line) box.append(el('div', { class: 'warn time-limit', role: 'status' }, batch.timeLimit.line));
    const name = el('input', { type: 'text', value: work.signOff || '', required: true, 'aria-label': 'Your name for mail sign-off' });
    box.append(el('label', { class: 'sign-off' }, 'Your name for mail sign-off', name));
    const confirm = button('Confirm batch', 'green', () => {
      if (work.busy || batch.active || batch.state !== 'ready' || clockLeft() < CONFIRM_RESERVE_MS || batch.canFit?.() === false) return;
      if (!name.value.trim()) { name.reportValidity(); name.focus(); return; }
      work.signOff = name.value.trim(); batch.confirm();
    }, batch.state !== 'ready' || batch.active);
    Object.assign(confirm.style, { background: COLOURS.green, borderColor: COLOURS.green, color: COLOURS.page, borderRadius: '8px', fontWeight: '700', fontSize: '13px', opacity: confirm.disabled ? '0.5' : '1' });
    const clockWarning = el('div', { class: 'warn', role: 'status' }, SESSION_WORDS.confirm);
    work.refreshClockControls = () => {
      const blocked = clockLeft() < CONFIRM_RESERVE_MS || batch.canFit?.() === false;
      confirm.disabled = work.busy || batch.state !== 'ready' || batch.active || blocked || !name.value.trim();
      confirm.style.opacity = confirm.disabled ? '0.5' : '1'; clockWarning.hidden = !blocked;
    };
    name.addEventListener('input', () => { work.signOff = name.value; work.refreshClockControls(); });
    work.refreshClockControls();
    if (work.reportTimes) for (const one of work.reportTimes) box.append(el('div', { class: 'dates report-use-by' }, one));
    else if (Number.isFinite(work.reportPullTime)) box.append(el('div', { class: 'dates report-use-by' }, reportTimeLine(work.reportPullTime)));
    box.append(el('div', { class: 'buttons review-actions' }, button('Back', 'grey', () => work.backToFiles?.(), batch.active || work.busy), confirm), clockWarning);
    if (['paused', 'session'].includes(batch.state)) {
      const message = batch.pauseMessage || batch.message || (batch.state === 'session' ? BATCH.session : '');
      if (message && !['Paused', 'Paused. Press Resume to carry on.'].includes(message)) box.append(el('div', { class: 'warn', role: 'status' }, message));
      box.append(button('Resume', 'amber', () => batch.resume(), batch.active || clockLeft() < PERSON_RESERVE_MS), button('Stop', 'red', () => batch.stop()),reportButton());
    }
  }
}
async function undoPopup(row, work, draw) {
  const undoable = () => canUndo(row);
  if (work.busy || !undoable()) return;
  const parent = work.dialogs || work.host.shadowRoot || work.host;
  const opener=parent.activeElement||document.activeElement;
  const dismiss=()=>{popup.remove();if(opener?.isConnected)opener.focus();};
  let preview;
  const guard = () => {
    if (sessionExpired()) throw new PageError('MySource session expired; Undo not proved');
    requireSchedulePage();
  };
  const pausePreview = () => {
    preview = null; undo.disabled = true; resume.hidden = false;
    undo.before(resume);
    detail.textContent = SCHEDULE_PAGE_WORDS.pause;
  };
  const detail = el('div', { role: 'status' }, 'Reading the days for Undo…');
  const keep = el('button', { class: 'grey', onclick: () => dismiss() }, 'Keep');
  const resume = el('button', { class: 'amber undo-resume', hidden: true, onclick: () => { if (!work.busy) readPreview(); } }, 'Resume');
  const undo = el('button', { class: 'red', onclick: async () => {
    if (work.busy || !undoable() || !preview || undo.disabled) return;
    try { requireSchedulePage(); } catch (error) { if (error.schedulePage) { pausePreview(); return; } throw error; }
    const previousState = row.state;
    let undoWrote = false;
    popup.remove(); row.state = 'undoing'; work.busy = true; work.undoActive = true; work.saved = false; work.saveMessage = '';
    work.batch?.invalidateFiles?.();
    work.host.dataset.batchReserved = 'true'; draw();
    const release = batchCover(work.host, work.host);
    const releaseGuard = setBatchGuard(guard);
    const releaseRecord = setRunRecorder(event => work.batch?.record?.(row, event));
    try {
      guard();
      await waitForPersonIdentity(preview.identity);
      const result = await timedRun('undo', () => restore(row.prepared.backup, { identity: preview.identity, after: row.after, previewBefore: preview.before, onWrite: () => { guard(); undoWrote = true; } }));
      if (!result.same) throw new Error(result.differences?.map(one => one.message).join('; ') || 'Undo could not be proved');
      row.undoResult = result;
      if(work.batch)work.batch.saveMessage='';
      row.state = 'undone'; row.one.run = { state: 'undone', prepared: row.prepared };
      row.undoWarning = result.skippedLater?.length ? undoLaterWords(result.skippedLater, row.one.decision.plan) : '';
    } catch (error) {
      if (error.schedulePage && !undoWrote) { row.state = previousState; pausePreview(); parent.append(popup); keep.focus(); }
      else {
        row.state = 'undoFailed'; row.message = error.message;
        row.diagnostic ||= { steps: [], paint: [] };
        row.diagnostic.reason = error.identityChanged ? 'identityChanged' : 'undoUnproved'; row.diagnostic.failedStage = 'undo';
      }
    }
    finally { releaseRecord(); releaseGuard(); release(); work.busy = false; work.undoActive = false; delete work.host.dataset.batchReserved; draw(); }
  }, disabled: true }, 'Undo');
  const popup = el('div', { class: 'popup-shade' }, el('div', { class: 'popup', role: 'alertdialog', 'aria-label': `Undo ${personName(row.one)}?` },
    el('div', { class: 'popup-title' }, `Undo ${personName(row.one)}?`), el('div', {}, undoLine(row.one, row.prepared)), detail, el('div', { class: 'buttons' }, keep, undo)));
  popup.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      const choices = [keep, resume, undo].filter(button => !button.hidden && !button.disabled);
      const index = choices.indexOf(parent.activeElement || document.activeElement);
      choices[(index + (event.shiftKey ? choices.length - 1 : 1)) % choices.length].focus();
    }
  });
  parent.querySelector('.popup-shade')?.remove(); parent.append(popup); keep.focus();
  return readPreview();
  async function readPreview() {
    preview = null; undo.disabled = true; resume.hidden = true; resume.remove();
    detail.textContent = 'Reading the days for Undo…';
    work.busy = true; work.undoActive = true; work.host.dataset.batchReserved = 'true';
    const release = batchCover(work.host, work.host);
    const releaseRecord = setRunRecorder(event => work.batch?.record?.(row, event));
    const releaseGuard = setBatchGuard(guard);
    try {
      if (sessionExpired()) throw new PageError('MySource session expired; Undo preview could not be read');
      requireSchedulePage();
      popup.style.pointerEvents = 'none';
      preview = await timedRun('undo preview', () => previewRestore(row.prepared.backup, { after: row.after }));
      const dates = preview.changedDays.map(usDate);
      detail.replaceChildren();
      if (preview.skippedLater.length) detail.append(el('div', { class: 'warn' }, undoLaterWords(preview.skippedLater, row.one.decision.plan)));
      const warning = pastReportWarning(row.prepared?.backup);
      if (warning) detail.append(el('div', { class: 'warn' }, warning));
      detail.append(el('div', {}, preview.nothing || undoChangeWords(preview.changedDays)));
      undo.disabled = !dates.length;
    } catch (error) {
      if (error.schedulePage) pausePreview();
      else {
        detail.textContent = `Undo preview could not be read: ${error.message}. Nothing changed. Press Keep, then Undo again.`;
        row.diagnostic ||= { steps: [], paint: [] };
        row.diagnostic.reason = reasonCode(error.message); row.diagnostic.failedStage = 'undo preview';
      }
    }
    finally { popup.style.pointerEvents = ''; releaseGuard(); releaseRecord(); release(); work.busy = false; work.undoActive = false; delete work.host.dataset.batchReserved; for (const listener of work.listeners || []) listener(); }
  }
}
function undoLaterWords(days, plan = {}) {
  const ownClient = plan.action === 'add' ? LOA_CLIENT : plan.action === 'dns' ? DNS_CLIENT : null;
  const rows = days.map(row => ({ day: row.day, clients: row.clients.some(client => client !== ownClient) ? row.clients.filter(client => client !== ownClient) : row.clients }));
  return `Not undone, changed after the batch: ${undoRanges(rows).map(range => `${range.dates} (${range.clients.join(' + ') || 'entries removed'})`).join('; ')}`;
}
function newBatchPopup(work,onDiscard=()=>work.newBatch?.()) {
  if (work.busy) return;
  if (work.saved) { onDiscard(); return; }
  const parent = work.dialogs || work.host.shadowRoot || work.host;
  const opener=parent.activeElement||document.activeElement;
  const dismiss=()=>{popup.remove();if(opener?.isConnected)opener.focus();};
  const keep = el('button', { class: 'grey', onclick: () => dismiss() }, 'Keep working');
  const start = el('button', { class: 'red', onclick: () => { dismiss(); onDiscard(); } }, 'New batch');
  const popup = el('div', { class: 'popup-shade' }, el('div', { class: 'popup', role: 'alertdialog', 'aria-label': 'New batch?' },
    el('div', { class: 'popup-title' }, 'New batch?'), el('div', {}, "This batch's files are not saved and its Undo will be gone."), el('div', { class: 'buttons' }, keep, start)));
  popup.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    if (event.key === 'Tab') { event.preventDefault(); (parent.activeElement === keep || document.activeElement === keep ? start : keep).focus(); }
  });
  parent.querySelector('.popup-shade')?.remove(); parent.append(popup); keep.focus();
}
function batchControls(cases, report, work, redrawPeople = () => {}, options = {}) {
  work.reportPullTime = report?.pullTime?.time;
  work.reportTimes = Array.isArray(report) ? loadedReports(report).filter(one => Number.isFinite(one.pullTime?.time)).map(one => `${reportKind(one) === 'audit' ? 'Audit' : 'Consulting'} · ${reportTimeLine(one.pullTime.time)}`) : null;
  const box = el('div', { class: 'batch' });
  let batch;
  let releaseCover;
  const draw = () => {
    if (batch.phase === 'check' && !batch.active) { work.busy = false; delete work.host.dataset.batchReserved; }
    if (!work.undoActive && !work.outputActive && !batch.active && ['complete', 'failed', 'stopped', 'paused', 'session'].includes(batch.state)) {
      work.busy = false; delete work.host.dataset.batchReserved;
      releaseCover?.(); releaseCover = null; redrawPeople();
    }
    renderBatch(batch, work, box, draw);
    redrawPeople();
    for (const listener of work.listeners) listener();
  };
  batch = createBatch(cases, report, work.version, { signOff: () => work.signOff, clock: work.clock, readSite, ...options, notify: draw, lock: () => {
    work.busy = true; work.host.dataset.batchReserved = 'true'; releaseCover ||= batchCover(work.host, work.host);
    for (const listener of work.listeners) listener();
    return () => {
      if (['session', 'complete', 'failed', 'stopped'].includes(batch.state)) { releaseCover?.(); releaseCover = null; }
    };
  } });
  work.batch = batch; draw();
  queueMicrotask(() => { if (box.isConnected && !work.busy) batch.start(); });
  return box;
}
__exports.renderBatch = renderBatch;
__exports.undoPopup = undoPopup;
__exports.undoLaterWords = undoLaterWords;
__exports.newBatchPopup = newBatchPopup;
__exports.batchControls = batchControls;
},
"run/backup.js": function (__require, __exports, document, window) {
'use strict';
const { compareDays, usDate } = __require("../rules/dates.js");
const { valueKey } = __require("../rules/prepare.js");
const { PageError } = __require("../mysource/dom.js");
const RESTORE_FIELDS = {
  billable: 'Billable', utilization: 'Utilization Generating', jobCode: 'Job Code',
  assignCode: 'Assign Code 1', assignCode2: 'Assign Code 2',
};
function withPagePricing(report, page, changed = () => true) {
  const remaining = page.map(row => ({ ...row, hours: Number(row.hours) }));
  return report.flatMap(row => {
    if (!changed(row)) return [{ ...row }];
    let hours = Number(row.hours);
    const result = [];
    for (const live of remaining) {
      if (!hours || !live.hours || compareByDay([live], [{ ...row, hours: live.hours }]).length) continue;
      const take = Math.min(hours, live.hours);
      result.push({ ...row, hours: take, pricingId: live.pricingId, pricingCaptured: true, notes: 0 });
      hours -= take; live.hours -= take;
    }
    if (hours > 0.001) throw new PageError('The report days could not be paired with the page Pricing ID. Nothing was changed.');
    return result;
  });
}
function validatePageDays(rows) {
  for (const row of rows) {
    if (!row.day || !Number.isFinite(row.hours) || row.hours <= 0) {
      throw new PageError('A later schedule row has unreadable Hours or Date fields. Nothing was changed.');
    }
    if (!String(row.client || '').trim() || !['billable', 'non billable', 'nonbillable'].includes(valueKey(row.billable))
      || !['yes', 'no'].includes(valueKey(row.utilization))) {
      throw new PageError('A later schedule row has unreadable Client, Billable or Utilization Generating fields. Nothing was changed.');
    }
  }
}
const fieldKey = (field, value) => {
  const key = valueKey(value);
  if (field === 'billable') {
    if (['billable', 'yes', 'y', 'true', '1'].includes(key)) return 'billable';
    if (['non billable', 'nonbillable', 'no', 'n', 'false', '0'].includes(key)) return 'non billable';
  }
  if (field === 'utilization') {
    if (['yes', 'y', 'true', '1'].includes(key)) return 'yes';
    if (['no', 'n', 'false', '0'].includes(key)) return 'no';
  }
  return key;
};
const reportComparedFields = entries => Object.keys(RESTORE_FIELDS).filter(field =>
  entries.some(entry => fieldKey(field, entry[field === 'assignCode' ? 'assignCode1' : field])));
const clientOf = entry => {
  if (String(entry.client ?? '').trim()) return entry.client;
  const name = entry.clientName || '';
  return entry.clientNumber ? `${name}:${entry.clientNumber}` : name;
};
function reportDays(slice, window) {
  const days = [];
  for (const entry of slice.entries) {
    if (!entry.days) throw new PageError('The Staff Schedule Hours Report was pulled by Week; pull it by Day: it is the backup.');
    for (const { day, hours } of entry.days) {
      if (!hours || compareDays(day, window.start) < 0 || compareDays(day, window.end) > 0) continue;
      days.push({
        day, date: usDate(day), hours, client: clientOf(entry), wbs: entry.wbs || '', billable: entry.billable || '', utilization: entry.utilization || '',
        jobCode: entry.jobCode || '', assignCode: entry.assignCode1 || '', assignCode2: entry.assignCode2 || '', pricingId: '', notes: 0,
      });
    }
  }
  Object.defineProperty(days, 'comparedFields', { value: slice.comparedFields ?? reportComparedFields(slice.entries) });
  return days.sort((a, b) => compareDays(a.day, b.day) || a.client.localeCompare(b.client));
}
function compareByDay(pageDays, reportRows, from = null, comparedFields = null) {
  for (const row of [...pageDays, ...reportRows]) {
    const raw = String(row.hours ?? '').trim();
    if (!/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw new PageError('Schedule hours could not be read as a plain non-negative number. Nothing was changed.');
  }
  const active = rows => rows.filter(row => !from || compareDays(row.day, from) >= 0);
  const identity = row => {
    const client = valueKey(row.client);
    const match = client.match(/^(.*):\s*(\d+)\s*$/);
    return { client, base: JSON.stringify([match ? match[1].trim() : client, valueKey(row.wbs)]), numbered: !!match };
  };
  const numbered = new Map();
  for (const row of [...active(pageDays), ...active(reportRows)]) {
    const id = identity(row);
    if (!id.numbered) continue;
    if (!numbered.has(id.base)) numbered.set(id.base, new Set());
    numbered.get(id.base).add(id.client);
  }
  const key = row => {
    const id = identity(row);
    const candidates = numbered.get(id.base);
    const client = !id.numbered && id.client && candidates?.size === 1 ? [...candidates][0] : id.client;
    return `${row.day.y}-${String(row.day.m).padStart(2, '0')}-${String(row.day.d).padStart(2, '0')}|${client}|${valueKey(row.wbs)}`;
  };
  const fields = comparedFields ?? reportRows.comparedFields ?? Object.keys(RESTORE_FIELDS).filter(field =>
    reportRows.some(row => fieldKey(field, row[field])));
  const group = rows => active(rows)
    .reduce((map, row) => {
      const k = key(row);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(row);
      return map;
    }, new Map());
  const sum = rows => rows.reduce((total, row) => total + Number(row.hours), 0);
  const byFields = (rows, compared) => rows.reduce((map, row) => {
    const k = JSON.stringify(compared.map(field => fieldKey(field, row[field])));
    return map.set(k, (map.get(k) || 0) + Number(row.hours));
  }, new Map());
  const same = (a, b) => [...new Set([...a.keys(), ...b.keys()])]
    .every(k => Math.abs((a.get(k) || 0) - (b.get(k) || 0)) <= 0.001);
  const names = new Map([...reportRows, ...pageDays].map(row => [key(row), row.client]));
  const page = group(pageDays);
  const report = group(reportRows);
  const differences = [];
  for (const k of new Set([...page.keys(), ...report.keys()])) {
    const pageGroup = page.get(k) || [];
    const reportGroup = report.get(k) || [];
    const a = sum(pageGroup);
    const b = sum(reportGroup);
    const hoursDiffer = Math.abs(a - b) > 0.001;
    if (hoursDiffer || !same(byFields(pageGroup, fields), byFields(reportGroup, fields))) {
      const [iso] = k.split('|');
      const client = names.get(k);
      const [y, m, d] = iso.split('-').map(Number);
      let changed = fields.filter(field => !same(byFields(pageGroup, [field]), byFields(reportGroup, [field])));
      if (!hoursDiffer && !changed.length) changed = fields.filter(field =>
        new Set([...pageGroup, ...reportGroup].map(row => fieldKey(field, row[field]))).size > 1);
      const field = [hoursDiffer ? 'Hours' : '', ...changed.map(name => RESTORE_FIELDS[name] || (name === 'pricingId' ? 'Pricing ID' : name))].filter(Boolean).join(', ');
      const date = usDate({ y, m, d });
      differences.push({ date, iso, client, page: a, report: b, field,
        message: `${date}, ${client}: ${field} differ between the page and the Staff Schedule Hours Report.` });
    }
  }
  differences.sort((x, y) => x.iso.localeCompare(y.iso));
  return differences;
}
const pastReportWarning = backup => backup?.unbackedAfter
  ? `Days after ${usDate(backup.unbackedAfter)} are not backed up; Undo does not put them back.` : '';
__exports.RESTORE_FIELDS = RESTORE_FIELDS;
__exports.withPagePricing = withPagePricing;
__exports.validatePageDays = validatePageDays;
__exports.reportComparedFields = reportComparedFields;
__exports.clientOf = clientOf;
__exports.reportDays = reportDays;
__exports.compareByDay = compareByDay;
__exports.pastReportWarning = pastReportWarning;
},
"rules/leaves.js": function (__require, __exports, document, window) {
'use strict';
const { addDays, compareDays, usDate, workingDays } = __require("./dates.js");
const inRange = (day, start, end) => compareDays(day, start) >= 0 && compareDays(day, end) <= 0;
function auditLoaInPlace(rows, plan) {
  const loa = rows.filter(row => /^leave of absence/i.test(row.client) || /\(loa\)/i.test(row.client));
  const period = leavePeriod(loa, plan, plan.loaStart);
  const days = workingDays(period.start, period.end);
  const inside = rows.filter(row => inRange(row.day, period.start, period.end));
  const touching = loaBlocks(loa).filter(block => isThisLeave(block, period.start, period.end));
  return days.length > 0 && inside.length === days.length && touching.length === 1 &&
    touching[0].rows.every(row => inRange(row.day, period.start, period.end)) && days.every(day => {
      const onDay = inside.filter(row => compareDays(row.day, day) === 0);
      return onDay.length === 1 && loa.includes(onDay[0]) && onDay[0].hours === 8;
    });
}
function leavePeriod(rows, plan, today) {
  if (plan.notificationType !== 'endOnly') return { start: plan.loaStart, end: plan.loaEnd };
  const blocks = loaBlocks(rows);
  const matching = blocks.length > 1
    ? blocks.filter(block => isThisLeave(block, today, plan.loaEnd))
    : blocks.filter(block => compareDays(block.start, addDays(plan.loaEnd, 3)) <= 0 && compareDays(block.end, addDays(today, -3)) >= 0);
  const block = matching[0];
  return { start: block && compareDays(block.start, today) > 0 ? block.start : today, end: plan.loaEnd };
}
function dayRanges(days) {
  const sorted = [...days].sort(compareDays);
  const ranges = [];
  for (const day of sorted) {
    const last = ranges.at(-1);
    if (last && compareDays(day, last.end) > 0 && (Date.UTC(day.y, day.m - 1, day.d) - Date.UTC(last.end.y, last.end.m - 1, last.end.d)) <= 3 * 86400000) last.end = day;
    else if (!last || compareDays(day, last.end) > 0) ranges.push({ start: day, end: day });
  }
  return ranges.map(range => compareDays(range.start, range.end) === 0 ? usDate(range.start) : `${usDate(range.start)} – ${usDate(range.end)}`).join(', ');
}
const noGap = (from, to) => compareDays(from, to) > 0 || workingDays(from, to).length === 0;
function isThisLeave(block, start, end) {
  if (compareDays(block.start, end) <= 0 && compareDays(block.end, start) >= 0) return true;
  return compareDays(block.end, start) < 0
    ? noGap(addDays(block.end, 1), addDays(start, -1))
    : noGap(addDays(end, 1), addDays(block.start, -1));
}
function leaveRuns(rows, { start, end }) {
  const blocks = loaBlocks(rows);
  const own = blocks.length > 1
    ? blocks.filter(block => isThisLeave(block, start, end))
    : blocks.filter(block => compareDays(block.start, end) <= 3 * 86400000 && compareDays(start, block.end) <= 3 * 86400000);
  const mine = new Set(own.flatMap(block => block.rows));
  const candidates = rows.filter(row => !inRange(row.day, start, end));
  const outside = candidates.filter(row => mine.has(row));
  const runs = [...loaBlocks(outside.filter(row => compareDays(row.day, start) < 0)),
                ...loaBlocks(outside.filter(row => compareDays(row.day, end) > 0))];
  return { runs, kept: candidates.filter(row => !mine.has(row)) };
}
function loaBlocks(rows) {
  const blocks = [];
  for (const row of [...rows].sort((a, b) => compareDays(a.day, b.day))) {
    let block = blocks.at(-1);
    if (!block || compareDays(row.day, block.end) > 3 * 86400000) blocks.push(block = { start: row.day, end: row.day, rows: [] });
    block.end = row.day; block.rows.push(row);
  }
  return blocks;
}
__exports.inRange = inRange;
__exports.auditLoaInPlace = auditLoaInPlace;
__exports.leavePeriod = leavePeriod;
__exports.dayRanges = dayRanges;
__exports.leaveRuns = leaveRuns;
__exports.loaBlocks = loaBlocks;
},
"rules/tax-weeks.js": function (__require, __exports, document, window) {
'use strict';
const { addDays, compareDays, mondayOf, workingDays } = __require("./dates.js");
const { leavePeriod, leaveRuns, inRange } = __require("./leaves.js");
const { entryKind } = __require("./entries.js");
const { valueKey } = __require("./prepare.js");
const kindOf = row => row.kind || (valueKey(row.client) === 'loa' ? 'loa' : entryKind(row));
const sameWeek = (a, b) => compareDays(mondayOf(a), mondayOf(b)) === 0;
const stopped = (outcome, code, extra = {}) => ({ outcome, code, weeks: [], holidays: [], partialWeeks: [], ...extra });
function planTaxWeeks({ plan, rows, today, greyedWeeks = [] }) {
  if (!Array.isArray(rows)) return stopped('byHand', 'backupReadFailed');
  if (compareDays(plan.loaEnd, today) < 0) return stopped('noReport', 'leaveOver');
  const loaDays = rows.filter(row => kindOf(row) === 'loa').flatMap(row =>
    workingDays(row.day, addDays(mondayOf(row.day), 4))
      .filter(day => !rows.some(other => kindOf(other) === 'holiday' && compareDays(other.day, day) === 0))
      .slice(0, Math.ceil(row.hours / 8))
      .filter(day => compareDays(day, today) >= 0).map(day => ({ ...row, day })));
  const requested = { ...plan, loaStart: compareDays(plan.loaStart, today) < 0 ? today : plan.loaStart };
  const period = leavePeriod(loaDays, requested, today);
  const { runs, kept } = leaveRuns(loaDays, period);
  if (runs.some(run => compareDays(run.end, period.end) > 0)) return stopped('noReport', 'taxPastEnd', { kept });
  const weeks = [];
  for (let monday = mondayOf(period.start); compareDays(monday, period.end) <= 0; monday = addDays(monday, 7)) {
    const weekdays = workingDays(monday, addDays(monday, 4));
    const covered = weekdays.filter(day => inRange(day, period.start, period.end));
    if (!covered.length) continue;
    const entries = rows.filter(row => sameWeek(row.day, monday));
    if (greyedWeeks.some(day => sameWeek(day, monday)) || entries.some(row => row.editable === false || row.locked === true)) return stopped('byHand', 'futureScheduleGreyed');
    const holidays = entries.filter(row => kindOf(row) === 'holiday' && inRange(row.day, period.start, period.end));
    const whole = covered.length === 5 && compareDays(monday, today) >= 0;
    const clients = entries.filter(row => kindOf(row) === 'client');
    const lowerClients = whole ? [] : clients.map(row => ({ row, hours: Math.min(row.hours, Math.round(row.hours * (5 - covered.length) / 5)) })).filter(item => item.hours < item.row.hours);
    weeks.push({ monday, start: covered[0], end: covered.at(-1),
      loa: { day: covered[0], hours: Math.max(0, covered.length * 8 - holidays.length * 8), mode: whole ? 'Replace' : 'Normal', notes: plan.notes },
      holidays, lowerClients,
      remove: whole ? entries.filter(row => kindOf(row) !== 'holiday') : [],
    });
  }
  if (weeks.some(week => rows.some(row => kindOf(row) === 'loa' && sameWeek(row.day, week.monday) && compareDays(row.day, today) >= 0 && compareDays(row.day, week.start) < 0))) return stopped('byHand', 'taxPartialLoa');
  return { outcome: 'report', code: 'taxWeeks', weeks, kept,
    holidays: weeks.flatMap(week => week.holidays),
    partialWeeks: weeks.filter(week => week.lowerClients.length).map(week => week.monday) };
}
__exports.planTaxWeeks = planTaxWeeks;
},
"run/work.js": function (__require, __exports, document, window) {
'use strict';
const { prepareTax } = __require("./tax-work.js");
const { useReportEnd } = __require("../rules/leave.js");
const { noteRowsEligible } = __require("../mysource/note-stage.js");
const { timedRun, recordRun } = __require("../core/run-records.js");
const { reportDifferenceSummary } = __require("../files/report-diagnostic.js");
const { addDays, compareDays, mondayOf, reportWindow, todayOf, usDate, workingDays } = __require("../rules/dates.js");
const { entryKind } = __require("../rules/entries.js");
const { emailKey, valueKey, rememberPageName, professionalName } = __require("../rules/prepare.js");
const { PageError, withPersonGuard, stopFlagged, cleanupAfter } = __require("../mysource/dom.js");
const { openPerson, findAssignments, findAssignmentsRange, readEditTable, closeEdit, scheduleFacts, personIdentity, waitForPersonIdentity: requirePersonIdentity, checkPersonIdentity, proveFindReopenAfter, canAddAssignment, beginScheduleTurn } = __require("../mysource/schedule.js");
const { calendarHolds, showDate } = __require("../mysource/calendar.js");
const { leaveRuns, leavePeriod, loaBlocks, dayRanges, inRange, auditLoaInPlace } = __require("../rules/leaves.js");
const { deleteAll, deleteRange, addAssignment, preflightDates, refreshNotes, setAssignmentHours } = __require("../mysource/write.js");
const { compareCopies, copyWindow, entriesToAdd, dayOf, ENTRY_FIELDS, knownAssignmentRows } = __require("../mysource/copy.js");
const { restoreWindow, restorePlan } = __require("../mysource/restore.js");
const { LOA_CLIENT, DNS_CLIENT, checkDnsAdded, checkLoaAdded } = __require("../mysource/checks.js");
const { compareByDay, reportDays, withPagePricing, validatePageDays } = __require("./backup.js");
const { requireDayReport } = __require("../files/report.js");
const { checkPerson, termDayOf } = __require("../rules/shared.js");
const { exitMailChoice, decideExit } = __require("../rules/exit.js");
const { reasonLine } = __require("../screen/wording.js");
const { batchCover, closeSkippedPerson, sessionExpired, cancelBatchWindows } = __require("../mysource/batch.js");
const { createEditability } = __require("../mysource/editability.js");
const BACKUP_KIND = 'Snooze backup 1';
const HOURS_PER_DAY = 8;
const TERM_DATE_UNDO = 'Cannot undo: MySource refuses entries after the Term Date';
function reportMismatch(stop, differences) {
  const first = differences[0];
  const hours = Math.abs(first.page - first.report) > 0.001 ? `; page ${first.page}h, Staff Schedule Hours Report ${first.report}h` : '';
  return { stop, reasonCode: 'pageReportMismatch',
    skipReason: `Schedule differs from the Staff Schedule Hours Report: ${differences.length} day${differences.length === 1 ? '' : 's'} (first: ${first.date}, ${first.client}: ${first.field}${hours}); nothing changed` };
}
function alreadyAdded(copy, start, end, client, future = false) {
  const rows = copy.days.filter(row => compareDays(row.day, start) >= 0 && (future || compareDays(row.day, end) <= 0));
  const through = future ? rows.reduce((last, row) => compareDays(row.day, last) > 0 ? row.day : last, end) : end;
  const expected = workingDays(start, through);
  return expected.length > 0 && rows.length === expected.length && expected.every(day => {
    const onDay = rows.filter(row => compareDays(row.day, day) === 0);
    return onDay.length === 1 && valueKey(onDay[0].client) === valueKey(client) && onDay[0].hours === HOURS_PER_DAY &&
      valueKey(onDay[0].billable) === valueKey('Non-Billable') && valueKey(onDay[0].utilization) === 'no';
  });
}
function writtenNoteCopy(copy, plan) {
  if (plan.withoutNotes) return copy;
  const client = plan.action === 'dns' ? DNS_CLIENT : LOA_CLIENT;
  const start = plan.loaStart || plan.dnsStart, end = plan.loaEnd || plan.dnsEnd;
  return { ...copy, days: copy.days.map(row => valueKey(row.client) === valueKey(client) && inRange(row.day, start, end)
    && typeof row.noteText !== 'string' ? { ...row, noteText: plan.notes, noteTextSubmitted: true } : row) };
}
function checkedLoa(after, plan) {
  return checkLoaAdded(after,plan,HOURS_PER_DAY);
}
async function prepare(one, version, today = todayOf(), { step = fn => fn() } = {}) {
  beginScheduleTurn();
  const { record, decision, slice } = one;
  if (record.subcategory?.site === 'tax') return prepareTax(one, version, today, { step });
  const { plan } = decision;
  if (slice?.status === 'notOnReport') return { stop: `not on the Staff Schedule Hours Report, possibly not ${record.subcategory?.business === 'audit' ? 'A&A' : record.subcategory?.site === 'tax' ? 'Tax' : 'Consulting'}`, reasonCode: 'notOnReport' };
  if (record.subcategory?.business === 'audit' && plan?.action === 'auditReadOnly') return prepareAuditReadOnly(one, today, step);
  if (!['add','dns','clearClients'].includes(plan?.action)) return {stop:'Unsupported schedule action. Nothing was changed.'};
  if (['dns', 'clearClients'].includes(plan?.action)) return prepareExit(one, version, today, { step });
  if (!slice || slice.status !== 'ready') return { stop: 'The Staff Schedule Hours Report for this person is not ready.' };
  try {
    requireDayReport(slice);
  } catch (error) {
    if (!(error instanceof PageError)) throw error;
    return { stop: error.message };
  }
  const checks = [];
  const shownName = await step(() => openPerson(record.email, record.person.professional, record, { today, termDate: slice.person?.termDate ?? record.person.termDate }));
  rememberPageName(record, shownName);
  const identity = personIdentity();
  checks.push(['✓', 'Schedule open', `${shownName || record.person.professional || record.email}${record.person.professional ? ', as the Staff Schedule Hours Report names them' : ''}`]);
  let window, futureCopy, runs = [], kept = [];
  const readLoa = async () => {
    futureCopy = await withPersonGuard(probe => checkPersonIdentity(identity, 'identity check', probe), () => copyWindow({start:today,end:today},{future:true}));
    return futureCopy.days.filter(row => valueKey(row.client) === valueKey(LOA_CLIENT));
  };
  if (plan.action === 'add') {
    const loa = await step(() => readLoa());
    const period = leavePeriod(loa, plan, today);
    plan.loaStart = period.start;
    ({ runs, kept } = leaveRuns(loa, { start: plan.loaStart, end: plan.loaEnd }));
    const first = runs[0]?.start, last = runs.at(-1)?.end;
    window = { start: first && compareDays(first, plan.loaStart) < 0 ? first : plan.loaStart, end: last && compareDays(last, plan.loaEnd) > 0 ? last : plan.loaEnd };
  }
  let watchedWindow = { start: compareDays(today, window.start) < 0 ? today : window.start, end: addDays(window.end, 8 * 7) };
  await requirePersonIdentity(identity);
  const reportEnd = slice.reportEnd || reportWindow(today).end;
  if (plan.action === 'add') useReportEnd(plan, reportEnd);
  const inReport = row => compareDays(row.day, reportEnd) <= 0;
  const reportFuture = reportDays({ ...slice, entries: slice.backupEntries ?? slice.entries }, { start: today, end: reportEnd });
  const differences = timedRun('compare', () => compareByDay(futureCopy.days.filter(inReport), reportFuture, today));
  recordRun({ type: 'comparison', summary: reportDifferenceSummary(differences) });
  if (differences.length) {
    const first = differences[0];
    const hours = Math.abs(first.page - first.report) > 0.001 ? `; page ${first.page}h, Staff Schedule Hours Report ${first.report}h` : '';
    return reportMismatch(`The page and the Staff Schedule Hours Report disagree on ${differences.length} day${differences.length === 1 ? '' : 's'} (first: ${first.date}, ${first.client}: ${first.field}${hours}). The schedule changed since the Staff Schedule Hours Report was pulled: pull it again.`, differences);
  }
  const tailEnd = futureCopy.days.reduce((last, row) => compareDays(row.day, reportEnd) > 0 && compareDays(row.day, last) > 0 ? row.day : last, watchedWindow.end);
  watchedWindow = { ...watchedWindow, end: tailEnd };
  const copy = { ...futureCopy, window: watchedWindow, days: futureCopy.days.filter(row => inRange(row.day, watchedWindow.start, watchedWindow.end)) };
  const beyond = copy.days.filter(row => !inReport(row));
  const inChange = row => compareDays(row.day, window.start) >= 0 && compareDays(row.day, window.end) <= 0;
  validatePageDays(beyond);
  const reportPart = reportFuture.filter(row => inRange(row.day, watchedWindow.start, watchedWindow.end));
  const days = withPagePricing(reportPart, copy.days.filter(inReport), inChange);
  const daysCompared = new Set(futureCopy.days.concat(reportFuture).filter(row => compareDays(row.day, today) >= 0 && inReport(row)).map(row => usDate(row.day))).size;
  if (!differences.length) checks.push(['✓', 'Page and Staff Schedule Hours Report agree', `day by day (${daysCompared} day${daysCompared === 1 ? '' : 's'} with entries)`]);
  const termText = String(scheduleFacts().termDate ?? slice.person?.termDate ?? record.person.termDate ?? '').trim();
  const term = termText ? termDayOf(termText) : null;
  if (termText && !term) return { stop: 'The Term Date cannot be read. Nothing was changed; By hand.', reasonCode: 'termDateUnreadable' };
  const reportTerm = slice.person?.termDate ?? record.person.termDate;
  if (reportTerm !== undefined && termText !== String(reportTerm ?? '').trim() && term && compareDays(term, plan.loaEnd) < 0) return {
    stop: reasonLine({ code: 'termBeforeEnd', termDate: term, loaEnd: plan.loaEnd }), reasonCode: 'termBeforeEnd',
  };
  const permissions = createEditability({ today, term, identity });
  const firstEditable = compareDays(window.start, today) < 0 ? today : window.start;
  const boundaries = [...new Map([window.end, firstEditable].map(day => [usDate(day), day])).values()];
  for (const day of boundaries) {
    if (!(await step(() => permissions.enabled(day)))) return { stop: 'Future leave dates are greyed out. Nothing was changed; By hand.', reasonCode: 'futureScheduleGreyed' };
  }
  const { problems } = entriesToAdd({ window: watchedWindow, days });
  if (problems.length) return { stop: `Snooze could not put these days back if needed: ${problems.join('; ')}.` };
  const requiredDates = [...(plan.action === 'add' ? workingDays(plan.loaStart, plan.loaEnd) : []), ...runs.flatMap(run => run.rows.map(row => row.day)).filter(day => compareDays(day, reportEnd) <= 0)]
    .filter(day => compareDays(day, today) >= 0);
  const retained = copy.days.filter(row => inRange(row.day, plan.loaStart || window.start, plan.loaEnd || window.end));
  const canRefreshNotes = knownAssignmentRows(futureCopy).canRefreshNotes;
  const bulkCandidate = plan.action === 'add' && (!runs.length || smallReduction(copy, plan, runs, canRefreshNotes)) && alreadyAdded(copy, plan.loaStart, plan.loaEnd, LOA_CLIENT)
    && noteRowsEligible(retained);
  if (plan.action === 'add') await step(() => proveFindReopenAfter(copy.days.filter(row =>
    inRange(row.day, plan.loaStart, plan.loaEnd) || onRun(runs, row))));
  const dateCheck = await caseDates(requiredDates, identity, step, { anchor: today, keepOpen: plan.action === 'add' && workingDays(plan.loaStart, plan.loaEnd).length > 0 && !bulkCandidate });
  if (dateCheck.stop) return dateCheck;
  checks.push(['✓', 'Could be put back', 'no weekend entry, no entry twice on a day']);
  const datesAlready = plan.action === 'add' && alreadyAdded(copy, plan.loaStart, plan.loaEnd, LOA_CLIENT);
  const replacedOldNote = datesAlready;
  if (plan.action === 'add') {
    if (runs.length) checks.push(['✓', "The same leave's LOA outside the new dates is removed", dayRanges(runs.flatMap(run => run.rows.map(row => row.day)))]);
    const loaThere = copy.days.filter(row => compareDays(row.day, plan.loaStart) >= 0 && compareDays(row.day, plan.loaEnd) <= 0 && entryKind(row) === 'loa');
    checks.push(loaThere.length
      ? ['⚠', 'An LOA is already there', `on ${new Set(loaThere.map(row => usDate(row.day))).size} of those days (Replace puts the new one in its place)`]
      : ['✓', 'No LOA on those days yet', '']);
  }
  if (kept.length) checks.push(['⚠', 'Another LOA block outside the new dates is kept', dayRanges(kept.map(row => row.day))]);
  const removeDays = new Set(runs.flatMap(run => run.rows.map(row => usDate(row.day))));
  const removing = new Map();
  for (const row of copy.days) {
    if (!inChange(row)) continue;
    const leaveDay = valueKey(row.client) === valueKey(LOA_CLIENT) && removeDays.has(usDate(row.day));
    if (!inRange(row.day,plan.loaStart,plan.loaEnd) && !leaveDay) continue;
    const item = removing.get(row.client) || { client: row.client, days: 0, hours: 0, clientHours: 0 };
    item.days += 1;
    item.hours += row.hours;
    if (valueKey(row.billable) === 'billable') item.clientHours += row.hours;
    removing.set(row.client, item);
  }
  const backup = {
    kind: BACKUP_KIND, snooze: version, taken: copy.taken, ticket: record.number, email: record.email,
    professional: record.person.professional, plan: Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'notes')), window: { ...watchedWindow, end: compareDays(watchedWindow.end, reportEnd) < 0 ? watchedWindow.end : reportEnd }, days, reportEnd, termDate: termText,
    report: slice.fileName || 'the Staff Schedule Hours Report by Day',
    ...(plan.action === 'add' ? { noteChangedDays: copy.days.filter(row => inReport(row) && valueKey(row.client) === valueKey(LOA_CLIENT)
      && inRange(row.day, plan.loaStart, plan.loaEnd)).map(row => row.day) } : {}),
  };
  return { window, watchedWindow, copy, watched: copy, backup, removing: [...removing.values()], daysCompared, checks, reportEnd, identity, replacedOldNote, runs, kept, canRefreshNotes, dateForm: dateCheck.modal };
}
async function prepareAuditReadOnly(one, today, step) {
  if (one.personStop) return { stop: reasonLine(one.personStop), reasonCode: one.personStop.code };
  if (one.slice?.status !== 'ready') return { stop: 'The Staff Schedule Hours Report for this person is not ready.' };
  requireDayReport(one.slice);
  const scope = checkPerson({ ...one.record.person, ...one.slice.person, resourceManager: one.slice.resourceManager ?? one.record.person.resourceManager }, one.decision);
  if (scope) return { stop: reasonLine(scope), reasonCode: scope.code };
  rememberPageName(one.record, await step(() => openPerson(one.record.email, one.record.person.professional, one.record, { today, termDate: one.record.person.termDate })));
  const identity = personIdentity();
  let copy;
  if (one.record.notification.kind === 'leave') {
    copy = await step(() => withPersonGuard(probe => checkPersonIdentity(identity, 'identity check', probe), () => copyWindow({ start: today, end: today }, { future: true })));
  } else {
    await requirePersonIdentity(identity);
  }
  const auditAlready = one.record.notification.kind === 'leave' && auditLoaInPlace(copy.days, one.decision.plan);
  return { nothing: auditAlready ? 'A&A LOA already in place; no schedule change.' : 'A&A: no schedule change.', auditAlready, identity, copy,
    checks: [['✓', 'Schedule read only; nothing changed', '']] };
}
function recordLaterChange(prepared, after, notesChanged = false) {
  if (!prepared.reportEnd) return;
  const tail = copy => ({ days: copy.days.filter(row => compareDays(row.day, prepared.reportEnd) > 0) });
  if (notesChanged || !compareCopies(tail(prepared.copy), tail(after)).same) prepared.backup.unbackedAfter = prepared.reportEnd;
}
function apply(one, prepared, options = {}) {
  return withPersonGuard(probe => checkPersonIdentity(prepared.identity, 'identity check', probe), () => applyRecorded(one, prepared, options));
}
function exitReplaceEligible(plan, prepared) {
  const targets = prepared.exitRuns.flatMap(run => run.rows);
  const dnsDates = new Set(workingDays(plan.dnsStart, prepared.editableDnsEnd || plan.dnsEnd).map(usDate));
  const later = prepared.copy.days.filter(row => compareDays(row.day, plan.dnsStart) >= 0);
  return prepared.addDns && !prepared.dnsKept?.length && !prepared.earlyDns?.length && targets.length > 0
    && !(prepared.dnsRepairRuns?.length) && !knownAssignmentRows(prepared.copy).range?.weekBoxes
    && targets.length === later.length && later.every(row => targets.includes(row) && dnsDates.has(usDate(row.day)));
}
function auditRangeTouchesKept(prepared, range) {
  return prepared.dnsKept?.some(row => compareDays(row.day, range.start) >= 0 &&
    (range.future || compareDays(row.day, range.end) <= 0));
}
function splitAuditExitRun(run, kept) {
  const cuts = kept.map(row => row.day).filter(day => inRange(day, run.start, run.end)).sort(compareDays);
  if (!cuts.length) return [run];
  if (run.future) throw new PageError('The Exit entries changed since the backup. Nothing was deleted.');
  const parts = [];
  let start = run.start;
  const through = end => {
    if (compareDays(start, end) > 0) return;
    const rows = run.rows.filter(row => inRange(row.day, start, end));
    if (rows.length) parts.push({ ...run, start, end, rows });
  };
  for (const day of cuts) {
    through(addDays(day, -1));
    start = addDays(day, 1);
  }
  through(run.end);
  if (run.rows.some(row => !parts.some(part => part.rows.includes(row)))) throw new PageError('The Exit entries changed since the backup. Nothing was deleted.');
  return parts;
}
async function applyRecorded(one, prepared, { step = fn => fn(), onWrite: writeNotice = () => {} } = {}) {
  if (prepared.tax) return applyTax(one, prepared, { step, onWrite: writeNotice });
  const { plan } = one.decision;
  if (one.record.subcategory?.business === 'audit' &&
      (one.decision.audit?.region !== 'US' || one.decision.audit?.template !== 4 || plan.action !== 'dns' || !plan.withoutNotes || plan.notes !== '')) throw new PageError('Unsupported A&A schedule action. Nothing was changed.');
  const onWrite = async () => { await requirePersonIdentity(prepared.identity); await writeNotice(); };
  const writeThrough = days => async () => {
    await onWrite();
    if (prepared.reportEnd && days.some(day => compareDays(day, prepared.reportEnd) > 0)) prepared.writtenPastReport = true;
  };
  if (['dns', 'clearClients'].includes(plan.action) && (!prepared.backup || emailKey(prepared.backup.email) !== emailKey(one.record.email))) throw new PageError('The Exit backup is not ready. Nothing was changed.');
  await requirePersonIdentity(prepared.identity);
  const outside = (allowed, after) => {
    if (!prepared.watched) return [];
    const keep = copy => ({ ...copy, days: copy.days.filter(row => !allowed(row)) });
    const result = compareCopies(keep(prepared.watched), keep(after));
    recordLaterChange(prepared, after);
    return result.same ? [] : [`${result.missing.length + result.extra.length} entr${result.missing.length + result.extra.length === 1 ? 'y' : 'ies'} changed OUTSIDE the planned days (first: ${[...result.missing, ...result.extra][0].split('|')[0]}) → check the schedule from ${usDate(prepared.watchedWindow.start)}`];
  };
  const within = (day, start, end) => compareDays(day, start) >= 0 && compareDays(day, end) <= 0;
  const checksAfter = (main, mainLabel, wrong) => [
    main.ok ? ['✓', mainLabel, ''] : ['✗', mainLabel, main.problems.join('; ')],
    wrong.length ? ['✗', 'Nothing changed outside the planned days', wrong.join('; ')] : ['✓', 'Nothing changed outside the planned days', ''],
  ];
  let current = prepared.copy;
  if (prepared.exitRuns) {
    const targets = prepared.exitRuns.flatMap(run => run.rows);
    await step(() => proveFindReopenAfter(targets));
    if (prepared.termDay && targets.some(row => compareDays(row.day, prepared.termDay) > 0)) prepared.backup.undoBlocked = TERM_DATE_UNDO;
    const target = row => targets.some(old => compareDays(old.day, row.day) === 0 && valueKey(old.client) === valueKey(row.client));
    const later = prepared.copy.days.filter(row=>compareDays(row.day,plan.dnsStart)>=0);
    const replace = exitReplaceEligible(plan, prepared);
    if (replace) await step(async () => {
      const edit = await findAssignments({ start: plan.dnsStart, future: true });
      try {
        const rows = await readEditTable(edit);
        const actual = { days: rows.map(row => ({ ...row, day: dayOf(row.date) })) };
        if (rows.length !== later.length || actual.days.some(row => !row.day) || !compareCopies({ days: later }, actual).same
          || new Set(rows.map(row => row.id)).size !== rows.length
          || actual.days.some(row => {
            const old = later.find(old => old.id === row.id);
            return !old || !compareCopies({ days: [old] }, { days: [row] }).same || (old.notes > 0) !== (row.notes > 0);
          })) throw new PageError('The Exit entries changed since the backup. Nothing was deleted.');
      } catch (error) { await cleanupAfter(error, () => closeEdit(edit)); throw error; }
      await closeEdit(edit);
    });
    let dateForm = null;
    if (prepared.exitDatePreflight) {
      const dateCheck = await caseDates(prepared.exitDatePreflight.dates, prepared.identity, step,
        { anchor: prepared.exitDatePreflight.anchor, keepOpen: replace });
      if (dateCheck.stop) throw Object.assign(new PageError(dateCheck.stop), { reasonCode: dateCheck.reasonCode });
      dateForm = dateCheck.modal;
    }
    if (!replace) for (const run of prepared.exitRuns) current = await removeExitEntries(
      { start: run.start, ...(run.future ? { future: true } : { end: run.end, clients: [run.client] }) },
      row => inRange(row.day, run.start, run.end) && (run.future || valueKey(row.client) === valueKey(run.client)), prepared, current, step, writeThrough(run.rows.map(row => row.day)));
    for (const run of prepared.dnsRepairRuns || []) {
      if (auditRangeTouchesKept(prepared, run)) throw new PageError('A kept DNS row is inside the repair range. Restore this person before continuing.');
      await step(() => addAssignment({ client: DNS_CLIENT, start: run.start, end: run.end, hoursPerDay: HOURS_PER_DAY,
        billable: 'Non-Billable', utilization: 'No', notes: plan.notes }, 'Normal', { onWrite: writeThrough(workingDays(run.start, run.end)) }));
      const after = await copyWindow(prepared.watchedWindow, { future: true });
      recordLaterChange(prepared, after);
      const added = row => inRange(row.day, run.start, run.end);
      const checked = checkDnsAdded({ days: after.days.filter(added) }, { ...plan, dnsStart: run.start, dnsEnd: run.end }, HOURS_PER_DAY);
      if (!checked.ok || !compareCopies({ days: current.days.filter(row => !added(row)) }, { days: after.days.filter(row => !added(row)) }).same
        || prepared.dnsKept?.some(old => !after.days.some(row => old.id === row.id && old.notes === row.notes))) throw new PageError('The DNS repair could not be proved. Restore this person before continuing.');
      current = writtenNoteCopy(after, { ...plan, dnsStart: run.start, dnsEnd: run.end });
    }
    if (prepared.addDns) {
      for (const run of prepared.dnsAddRuns || [{ start: plan.dnsStart, end: prepared.editableDnsEnd }]) {
        await step(() => {
          if (auditRangeTouchesKept(prepared, run)) throw new PageError('The A&A DNS step could not be proved. Restore this person before continuing.');
          return addAssignment({ client: DNS_CLIENT, start: run.start, end: run.end,
            hoursPerDay: HOURS_PER_DAY, billable: 'Non-Billable', utilization: 'No', notes: plan.notes }, replace ? 'Replace' : 'Normal', { onWrite: writeThrough(workingDays(run.start, run.end)), preflightForm: dateForm });
        });
        dateForm = null;
        const afterStep = await copyWindow(prepared.watchedWindow, { future: true });
        recordLaterChange(prepared, afterStep);
        if (plan.withoutNotes) {
          const added = row => inRange(row.day, run.start, run.end);
          const unchanged = copy => ({ days: copy.days.filter(row => !added(row)) });
          const checked = checkDnsAdded({ days: afterStep.days.filter(added) }, { ...plan, dnsStart: run.start, dnsEnd: run.end }, HOURS_PER_DAY);
          const kept = prepared.dnsKept || [];
          if (!checked.ok || !compareCopies(unchanged(current), unchanged(afterStep)).same || kept.some(old => !afterStep.days.some(row => row.id === old.id && row.notes === old.notes))) throw new PageError('The A&A DNS step could not be proved. Restore this person before continuing.');
        }
        current = afterStep;
      }
      const after = current;
      const added = row => inRange(row.day, plan.dnsStart, prepared.editableDnsEnd);
      const check = checkDnsAdded({ ...after, days: after.days.filter(row => added(row)) },
        { ...plan, dnsEnd: prepared.editableDnsEnd }, HOURS_PER_DAY);
      recordLaterChange(prepared, after, check.ok && prepared.writtenPastReport);
      const wrong = outside(row => target(row) || added(row), after);
      if (after.days.some(row => target(row) && !added(row))) check.problems.push('Removed Exit entries returned outside the DNS period.');
      check.ok = !check.problems.length;
      return { ok: check.ok && !wrong.length, problems: [...check.problems, ...wrong], checks: checksAfter(check, 'DNS and removed entries checked', wrong),
        after: check.ok && !wrong.length ? writtenNoteCopy(after, { ...plan, dnsEnd: prepared.editableDnsEnd }) : after };
    }
    const wrong = outside(target, current);
    return { ok: !wrong.length, problems: wrong, checks: wrong.length ? [] : [['✓', 'Editable entries removed; greyed-out DNS kept', '']], after: current };
  }
  if (['dns', 'clearClients'].includes(plan.action)) throw new PageError('The prepared Exit steps are missing. Nothing was changed.');
  if (plan.action === 'add') {
    const reduction = smallReduction(prepared.copy, plan, prepared.runs || [], prepared.canRefreshNotes);
    const eligible = (!(prepared.runs || []).length || reduction) && alreadyAdded(prepared.copy, plan.loaStart, plan.loaEnd, LOA_CLIENT);
    const refreshed = eligible ? await step(() => refreshNotes(reduction?.query || { start: plan.loaStart, end: plan.loaEnd, clients: [LOA_CLIENT] },
      reduction?.expected || { days: prepared.copy.days.filter(row => inRange(row.day, plan.loaStart, plan.loaEnd)) }, plan.notes, { onWrite: writeThrough([...workingDays(plan.loaStart, plan.loaEnd), ...(reduction?.remove || []).map(row => row.day)]), remove: reduction?.remove || [] })) : false;
    if (!refreshed && workingDays(plan.loaStart, plan.loaEnd).length) await step(() => {
      const formModal = prepared.dateForm;
      prepared.dateForm = null;
      return addAssignment({ client: LOA_CLIENT, start: plan.loaStart, end: plan.loaEnd, hoursPerDay: HOURS_PER_DAY,
        billable: 'Non-Billable', utilization: 'No', notes: plan.notes }, 'Replace', { onWrite: writeThrough(workingDays(plan.loaStart, plan.loaEnd)), formModal });
    });
    const readOptions = {};
    let after = await copyWindow(prepared.watchedWindow || prepared.window, readOptions);
    const added = checkedLoa(after, plan, prepared);
    if (refreshed && !compareCopies({ ...prepared.copy, days: prepared.copy.days.filter(row => !(reduction && onRun(prepared.runs, row))) }, after).same) { added.ok = false; added.problems.push('The note refresh changed assignment dates, hours or settings.'); }
    recordLaterChange(prepared, after, added.ok && prepared.writtenPastReport);
    const wrongAdd = outside(row => within(row.day, plan.loaStart, plan.loaEnd) || (refreshed && reduction && onRun(prepared.runs, row)), after);
    const method = refreshed ? reduction ? 'combined reduction' : 'in-place refresh' : 'Replace';
    if (!added.ok || wrongAdd.length) return { ok: false, method, problems: [...added.problems, ...wrongAdd], checks: [] };
    const runs = prepared.runs || [];
    if (!(refreshed && reduction)) for (const run of runs) after = await removeLeaveRun(run, prepared, step, writeThrough(run.rows.map(row => row.day)), after, readOptions);
    const result = !runs.length || (refreshed && reduction) ? added : checkedLoa(after, plan, prepared);
    const left = leftOn(runs, after);
    if (left.length) { result.ok = false; result.problems.push(`${left.length} LOA day${left.length === 1 ? '' : 's'} of the same leave still there (${dayRanges(left.map(row => row.day))})`); }
    const wrong = !runs.length || (refreshed && reduction) ? wrongAdd : outside(row => within(row.day, plan.loaStart, plan.loaEnd) || onRun(runs, row), after);
    const label = 'LOA every working day, 8h, with notes; nothing else left on those days';
    return { ok: result.ok && !wrong.length, method, problems: [...wrong, ...result.problems], checks: checksAfter(result, `${label}${runs.length ? "; the same leave's LOA outside the new dates removed" : ''}`, wrong), after: result.ok && !wrong.length ? writtenNoteCopy(after, plan) : after };
  }
  throw new PageError('Unsupported schedule action. Nothing was changed.');
}
function smallReduction(copy, plan, runs, canRefreshNotes = true) {
  if (plan.action !== 'add' || !runs.length || !alreadyAdded(copy, plan.loaStart, plan.loaEnd, LOA_CLIENT)) return null;
  const remove = copy.days.filter(row => onRun(runs, row));
  if (!remove.length || remove.length !== runs.reduce((n, run) => n + run.rows.length, 0)
    || new Set(remove.map(row => usDate(row.day))).size !== remove.length || remove.some(row => !workingDays(row.day, row.day).length)) return null;
  if (canRefreshNotes === false && remove.length > 7) return null;
  const dates = [plan.loaStart, plan.loaEnd, ...remove.map(row => row.day)].sort(compareDays);
  const query = { start: dates[0], end: dates.at(-1), clients: [LOA_CLIENT] };
  const expected = { days: copy.days.filter(row => inRange(row.day, query.start, query.end) && valueKey(row.client) === valueKey(LOA_CLIENT)) };
  if (expected.days.some(row => !inRange(row.day, plan.loaStart, plan.loaEnd) && !onRun(runs, row))) return null;
  return { query, expected, remove };
}
const onRun = (runs, row) => valueKey(row.client) === valueKey(LOA_CLIENT) && runs.some(run => run.rows.some(one => compareDays(one.day, row.day) === 0));
const leftOn = (runs, after) => after.days.filter(row => onRun(runs, row));
async function removeLeaveRun(run, prepared, step, onWrite, before, readOptions) {
  return step(async () => {
    const query = { start: run.start, end: run.end, clients: [LOA_CLIENT] };
    const edit = await findAssignments(query);
    if (findAssignmentsRange(edit)?.weekBoxes) {
      const wanted = prepared.copy.days.filter(row => inRange(row.day, run.start, run.end) && valueKey(row.client) === valueKey(LOA_CLIENT));
      if (wanted.length !== run.rows.length) {
        const error = new PageError(`The LOA ${dayRanges([run.start, run.end])} changed since the backup. Nothing was deleted.`);
        await cleanupAfter(error, () => closeEdit(edit)); throw error;
      }
      return deleteRange(query, before, {
        edit, onWrite,
        validate: async actual => {
          const wanted = prepared.copy.days.filter(row => inRange(row.day, actual.window.start, actual.window.end) && valueKey(row.client) === valueKey(LOA_CLIENT));
          if (!compareCopies({ days: wanted }, actual).same) throw new PageError(`The LOA ${dayRanges([run.start, run.end])} changed since the backup. Nothing was deleted.`);
        },
        read: async () => {
          const after = await copyWindow(prepared.watchedWindow || prepared.window, readOptions);
          recordLaterChange(prepared, after);
          return after;
        },
      });
    }
    let rows;
    try {
      rows = await readEditTable(edit);
      const actual = { days: rows.map(row => ({ ...row, day: dayOf(row.date) })) };
      const expected = { days: prepared.copy.days.filter(row => inRange(row.day, run.start, run.end) && valueKey(row.client) === valueKey(LOA_CLIENT)) };
      if (actual.days.some(row => !row.day || valueKey(row.client) !== valueKey(LOA_CLIENT)) || actual.days.length !== run.rows.length || !compareCopies(expected, actual).same) {
        throw new PageError(`The LOA ${dayRanges([run.start, run.end])} changed since the backup. Nothing was deleted.`);
      }
    } catch (error) {
      await cleanupAfter(error, () => closeEdit(edit));
      throw error;
    }
    await deleteAll(edit, { onWrite });
    const after = await copyWindow(prepared.watchedWindow || prepared.window, readOptions);
    recordLaterChange(prepared, after);
    const expected = { ...before, days: before.days.filter(row => !onRun([run], row)) };
    if (!compareCopies(expected, after).same) throw new PageError('The LOA delete could not be proved. Restore this person before continuing.');
    return after;
  });
}
async function prepareExit(one, version, today, { step }) {
  const { record, decision, slice } = one;
  const plan = decision.plan;
  const withoutNotes = record.subcategory?.business === 'audit';
  if (!slice || slice.status !== 'ready') return { stop: 'The Staff Schedule Hours Report for this person is not ready.' };
  requireDayReport(slice);
  if (withoutNotes) {
    const checked = decideExit(record, today, slice);
    if (checked.plan?.action !== 'dns' || checked.audit?.region !== 'US' || checked.audit?.template !== 4 || !plan.withoutNotes || plan.notes !== '') return { stop: 'Unsupported A&A schedule action. Nothing was changed.' };
  }
  rememberPageName(record, await step(() => openPerson(record.email, record.person.professional, record, { today, termDate: slice.person?.termDate ?? record.person.termDate })));
  const identity = personIdentity();
  const facts = scheduleFacts();
  const person = { ...record.person, ...slice.person, resourceManager: slice.resourceManager ?? record.person.resourceManager };
  const scope = checkPerson(person, decision);
  if (scope) return { stop: reasonLine(scope), reasonCode: scope.code };
  const termText = String(facts.termDate ?? '').trim() || String(person.termDate ?? '').trim();
  const termDay = termText ? termDayOf(termText) : null;
  if (termText && !termDay) return { stop: 'The Term Date shown beside the schedule cannot be read. Nothing was changed; By hand.', reasonCode: 'termDateUnreadable' };
  const termGreyed = !!termDay && compareDays(termDay, { y: 9999, m: 12, d: 31 }) !== 0 && compareDays(termDay, plan.dnsStart) < 0;
  const permissions = createEditability({ today, term: termDay, identity });
  const startGreyed = termGreyed || !(await step(() => permissions.enabled(plan.dnsStart)));
  const termLimitsDns = termDay && compareDays(termDay, plan.dnsEnd) < 0;
  const permittedEnd = startGreyed ? null : await step(() => permissions.through(plan.dnsEnd, plan.dnsStart));
  let greyed = startGreyed || !!termLimitsDns || !permittedEnd || compareDays(permittedEnd, plan.dnsEnd) < 0;
  const editableDnsEnd = permittedEnd || (termLimitsDns ? termDay : plan.dnsEnd);
  let addDns = !startGreyed && !!permittedEnd && workingDays(plan.dnsStart, editableDnsEnd).length > 0;
  const copy = await step(() => copyWindow({ start: today, end: addDays(plan.dnsEnd, 56) }, { future: true }));
  const watchedWindow = copy.window;
  const dnsAlready = plan.action === 'dns' && alreadyAdded(copy, plan.dnsStart, plan.dnsEnd, DNS_CLIENT, true);
  const keepTail = alreadyAdded({ days: copy.days.filter(row => valueKey(row.client) === valueKey(DNS_CLIENT)) }, plan.dnsStart, plan.dnsEnd, DNS_CLIENT, true)
    && copy.days.some(row => valueKey(row.client) === valueKey(DNS_CLIENT) && compareDays(row.day, plan.dnsEnd) > 0);
  if (keepTail) addDns = false;
  const properDns = row => valueKey(row.client) === valueKey(DNS_CLIENT) && workingDays(row.day, row.day).length
    && row.hours === HOURS_PER_DAY && valueKey(row.billable) === 'non billable' && valueKey(row.utilization) === 'no';
  const dnsKept = keepTail ? copy.days.filter(row => valueKey(row.client) === valueKey(DNS_CLIENT) && compareDays(row.day, plan.dnsStart) >= 0) : withoutNotes ? copy.days.filter(row => valueKey(row.client) === valueKey(DNS_CLIENT) && inRange(row.day, plan.dnsStart, editableDnsEnd)
    && workingDays(row.day, row.day).length && row.hours === HOURS_PER_DAY && valueKey(row.billable) === 'non billable' && valueKey(row.utilization) === 'no'
    && copy.days.filter(other => compareDays(other.day, row.day) === 0 && valueKey(other.client) === valueKey(DNS_CLIENT)).length === 1) : [];
  const dnsAddRuns = withoutNotes && addDns ? [] : null;
  if (dnsAddRuns) for (const day of workingDays(plan.dnsStart, editableDnsEnd).filter(day => !dnsKept.some(row => compareDays(row.day, day) === 0))) {
    const last = dnsAddRuns.at(-1);
    if (last && !workingDays(addDays(last.end, 1), addDays(day, -1)).length) last.end = day;
    else dnsAddRuns.push({ start: day, end: day });
  }
  if (dnsAddRuns && !dnsAddRuns.length) addDns = false;
  const earlyCandidates = copy.days.filter(row => compareDays(row.day, plan.dnsStart) < 0 && valueKey(row.client) === valueKey(DNS_CLIENT)
    && (!termDay || compareDays(row.day, termDay) <= 0)).sort((a, b) => compareDays(a.day, b.day));
  const dnsEditableDates = new Set();
  const improper = copy.days.filter(row => valueKey(row.client) === valueKey(DNS_CLIENT) && inRange(row.day, plan.dnsStart, plan.dnsEnd) &&
    (!properDns(row) || copy.days.filter(other => valueKey(other.client) === valueKey(DNS_CLIENT) && compareDays(other.day, row.day) === 0).length !== 1));
  const dnsCandidates = copy.days.filter(row => valueKey(row.client) === valueKey(DNS_CLIENT) && compareDays(row.day, today) >= 0
    && (!termGreyed || compareDays(row.day, termDay) <= 0 || improper.includes(row)));
  for (const day of [...new Map(dnsCandidates.map(row => [usDate(row.day), row.day])).values()]) {
    const repair = improper.some(row => compareDays(row.day, day) === 0);
    const enabled = await step(() => termGreyed || repair
      ? withPersonGuard(probe => checkPersonIdentity(identity, 'identity check', probe), async () => {
        if (!calendarHolds(day)) await showDate(day);
        return canAddAssignment(day, { dayOnly: true });
      }) : permissions.enabled(day));
    if (enabled) dnsEditableDates.add(usDate(day));
  }
  const dnsEditable = row => (!startGreyed || improper.some(old => compareDays(old.day, row.day) === 0)) && dnsEditableDates.has(usDate(row.day));
  if (improper.some(row => inRange(row.day, plan.dnsStart, editableDnsEnd) && !dnsEditable(row))) { addDns = false; greyed = true; }
  const repairDays = [...new Map(improper.filter(row => compareDays(row.day, plan.dnsEnd) <= 0 && dnsEditable(row) && (!addDns || !inRange(row.day, plan.dnsStart, editableDnsEnd)))
    .map(row => [usDate(row.day), row.day])).values()].sort(compareDays);
  if (repairDays.some(day => !workingDays(day, day).length)) return { stop: 'An improper DNS entry is on a weekend. Nothing was changed; By hand.' };
  const dnsRepairRuns = [];
  for (const day of repairDays) {
    const last = dnsRepairRuns.at(-1);
    if (last && !workingDays(addDays(last.end, 1), addDays(day, -1)).length) last.end = day;
    else dnsRepairRuns.push({ start: day, end: day });
  }
  if (!addDns && dnsRepairRuns.length) dnsKept.push(...copy.days.filter(row => compareDays(row.day, plan.dnsStart) >= 0
    && properDns(row) && !improper.includes(row) && !dnsKept.includes(row)));
  const earlyDns = earlyCandidates.filter(row => dnsEditableDates.has(usDate(row.day)));
  const window = { start: earlyDns[0]?.day || plan.dnsStart, end: watchedWindow.end };
  const inChange = row => earlyDns.includes(row) || !dnsKept.includes(row) && compareDays(row.day, plan.dnsStart) >= 0 &&
    (valueKey(row.client) !== valueKey(DNS_CLIENT) || dnsEditable(row));
  const exitPeople = { dpName: facts.resourceManager || slice.resourceManager || record.person.resourceManager || '',
    dpEmail: facts.resourceManagerEmail || slice.resourceManagerEmail || '', dpNotFound: valueKey(facts.resourceManager || slice.resourceManager || record.person.resourceManager) === 'not applicable' };
  const removing = new Map();
  for (const row of copy.days.filter(inChange)) {
    const item = removing.get(row.client) || { client: row.client, days: 0, hours: 0, clientHours: 0 };
    item.days++; item.hours += row.hours;
    if (valueKey(row.billable) === 'billable') item.clientHours += row.hours;
    removing.set(row.client, item);
  }
  const clientHours = [...removing.values()].reduce((sum, row) => sum + row.clientHours, 0);
  const mail = exitMailChoice({ clientHours, greyed });
  one.exit = { template: mail, greyed, clientHours, dnsInPlace: !addDns && dnsAlready, ...exitPeople };
  plan.greyed = greyed;
  const reportEnd = slice.reportEnd || reportWindow(today).end;
  const inReport = row => compareDays(row.day, reportEnd) <= 0;
  const backupEnd = compareDays(watchedWindow.end, reportEnd) < 0 ? watchedWindow.end : reportEnd;
  const reportPart = reportDays({ ...slice, entries: slice.backupEntries ?? slice.entries }, { start: today, end: backupEnd });
  const differences = timedRun('compare', () => compareByDay(copy.days.filter(inReport), reportPart, today));
  recordRun({ type: 'comparison', summary: reportDifferenceSummary(differences) });
  if (differences.length) return reportMismatch('The page and the Staff Schedule Hours Report disagree. Pull the Staff Schedule Hours Report again before Start.', differences);
  if (!addDns && !removing.size) {
    one.exit.dnsInPlace = dnsAlready;
    return { nothing: dnsAlready ? 'DNS already there; no change' : 'Schedule greyed out: no schedule change.',
      alreadyDone: dnsAlready, checks: [], identity, copy, termGreyed };
  }
  const beyond = copy.days.filter(row => !inReport(row));
  validatePageDays(beyond);
  const days = withPagePricing(reportPart, copy.days.filter(inReport), inChange);
  const { problems } = entriesToAdd({ window: watchedWindow, days });
  if (problems.length) return { stop: `Snooze could not put these days back if needed: ${problems.join('; ')}.` };
  const backup = { kind: BACKUP_KIND, snooze: version, taken: copy.taken, ticket: record.number, email: record.email,
    professional: professionalName(record), plan: Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'notes')), window: { ...watchedWindow, end: compareDays(watchedWindow.end, reportEnd) < 0 ? watchedWindow.end : reportEnd }, days, reportEnd, termDate: termText,
    ...((addDns || repairDays.length) && !withoutNotes ? { noteChangedDays: copy.days.filter(row => inReport(row) && valueKey(row.client) === valueKey(DNS_CLIENT)
      && (addDns && inRange(row.day, plan.dnsStart, editableDnsEnd) || repairDays.some(day => compareDays(day, row.day) === 0))).map(row => row.day) } : {}),
    report: slice.fileName || 'the Staff Schedule Hours Report by Day' };
  const later = copy.days.filter(row => compareDays(row.day, plan.dnsStart) >= 0);
  const clearLater = later.length > 0 && later.every(inChange);
  const separate = copy.days.filter(row => inChange(row) && (!clearLater || compareDays(row.day, plan.dnsStart) < 0));
  const clients = [...new Set(separate.map(row => row.client))];
  const exitRuns = clients.flatMap(client => loaBlocks(separate.filter(row => row.client === client)).map(run => ({ ...run, client })));
  if (clearLater) exitRuns.push({ start: plan.dnsStart, end: watchedWindow.end, rows: later, future: true });
  if (dnsKept.length) {
    const split = exitRuns.flatMap(run => splitAuditExitRun(run, dnsKept));
    exitRuns.splice(0, exitRuns.length, ...split);
  }
  let exitDatePreflight = null;
  if (repairDays.length) {
    const dateStop = await caseDates(repairDays, identity, step, { anchor: repairDays[0] });
    if (dateStop.stop) return dateStop;
  }
  if (termGreyed) {
    const dates = earlyDns.map(row => row.day).filter(day => compareDays(day, termDay) <= 0);
    if (dates.length) {
      const dateStop = await caseDates(dates, identity, step, { anchor: dates[0] });
      if (dateStop.stop) return dateStop;
    }
  } else if (addDns || await step(() => permissions.enabled(today))) {
    const dates = [...(addDns ? workingDays(plan.dnsStart, editableDnsEnd) : []), ...copy.days.filter(row => inChange(row) && inReport(row)).map(row => row.day)];
    if (exitReplaceEligible(plan, { exitRuns, copy, addDns, earlyDns, editableDnsEnd })) exitDatePreflight = { dates, anchor: today };
    else {
      const dateStop = await caseDates(dates, identity, step, { anchor: today });
      if (dateStop.stop) return dateStop;
    }
  }
  return { window, watchedWindow, copy, watched: copy, backup, removing: [...removing.values()], daysCompared: new Set(copy.days.map(row => usDate(row.day))).size,
    reportEnd, checks: [], earlyDns, dnsAlready: false, identity, termGreyed, termDay, exitRuns, addDns, editableDnsEnd, exitDatePreflight, dnsRepairRuns,
    ...(withoutNotes || keepTail || dnsRepairRuns.length ? { dnsKept, dnsAddRuns } : {}) };
}
async function caseDates(dates, identity, step, options = {}) {
  try { return await step(() => withPersonGuard(probe => checkPersonIdentity(identity, 'identity check', probe), () => preflightDates(dates, options))); }
  catch (error) {
    if (stopFlagged(error)) throw error;
    if (!/website.*allowed|Required dates/.test(error.message)) throw error;
    return { stop: error.message, reasonCode: 'allowedDatesUnreadableOrOutside' };
  }
}
async function removeExitEntries(query, matches, prepared, before, step, onWrite) {
  return step(async () => {
    const edit = await findAssignments(query);
    if (query.future && findAssignmentsRange(edit)?.weekBoxes) {
      await closeEdit(edit);
      return deleteRange({ start: query.start, end: prepared.watchedWindow.end, weekEndFriday: true }, before, { onWrite,
        protectedRows: prepared.dnsKept || [],
        validate: async actual => {
          if (actual.days.some(row => !matches(row))) throw new PageError('The Exit entries changed since the backup. Nothing was deleted.');
        },
        read: async () => {
          const after = await copyWindow(prepared.watchedWindow, { future: true });
          recordLaterChange(prepared, after); return after;
        },
      });
    }
    if (!query.future && findAssignmentsRange(edit)?.weekBoxes) {
      if (auditRangeTouchesKept(prepared, query)) {
        const error = new PageError('The Exit entries changed since the backup. Nothing was deleted.', { reasonName:'keptRowInRange' });
        await cleanupAfter(error, () => closeEdit(edit)); throw error;
      }
      return deleteRange(query, before, { edit, onWrite, protectedRows: prepared.dnsKept || [],
        validate: async actual => {
          if (actual.days.some(row => !matches(row) || prepared.dnsKept?.some(old => row.id === old.id))) throw new PageError('The Exit entries changed since the backup. Nothing was deleted.');
        },
        read: async () => {
          const after = await copyWindow(prepared.watchedWindow, { future: true });
          recordLaterChange(prepared, after); return after;
        },
      });
    }
    let rows;
    try {
      rows = await readEditTable(edit);
      const actual = { days: rows.map(row => ({ ...row, day: dayOf(row.date) })) };
      const expected = { days: before.days.filter(matches) };
      if (auditRangeTouchesKept(prepared, query) || prepared.dnsKept?.some(old => rows.some(row => row.id === old.id))) throw new PageError('The Exit entries changed since the backup. Nothing was deleted.', { reasonName:'keptRowInRange' });
      if (actual.days.some(row => !row.day || !matches(row)) || !compareCopies(expected, actual).same) throw new PageError('The Exit entries changed since the backup. Nothing was deleted.');
    } catch (error) { await cleanupAfter(error, () => closeEdit(edit)); throw error; }
    if (rows.length) await deleteAll(edit, { onWrite });
    else await closeEdit(edit);
    const after = await copyWindow(prepared.watchedWindow, { future: true });
    recordLaterChange(prepared, after);
    if (!compareCopies({ ...before, days: before.days.filter(row => !matches(row)) }, after).same || prepared.dnsKept?.some(old => {
      const kept = after.days.filter(row => row.id === old.id);
      return kept.length !== 1 || compareDays(kept[0].day, old.day) !== 0 || kept[0].notes !== old.notes;
    })) throw new PageError('The Exit delete could not be proved. Restore this person before continuing.');
    return after;
  });
}
async function previewRestore(backup, options = {}) {
  if (backup.undoBlocked) throw new PageError(backup.undoBlocked);
  await openForRestore(backup, options);
  const identity = personIdentity();
  if (options.identity) await requirePersonIdentity(options.identity);
  return restorePlan(backup, { ...options, identity });
}
async function restore(backup, options = {}) {
  if (backup.undoBlocked) throw new PageError(backup.undoBlocked);
  if (options.identity) await requirePersonIdentity(options.identity);
  const release = batchCover();
  try {
    await openForRestore(backup, options);
    const identity = personIdentity();
    if (options.identity) await requirePersonIdentity(options.identity);
    return await restoreWindow(backup, { ...options, identity });
  } finally { release(); }
}
async function recover(backup, options = {}) {
  if (options.identity) await requirePersonIdentity(options.identity);
  await openForRestore(backup, options);
  const identity = personIdentity();
  if (options.identity) await requirePersonIdentity(options.identity);
  return restoreWindow(backup, { ...options, identity, automaticRecovery: backup.site === 'tax' || ['dns', 'clearClients'].includes(backup.plan?.action) });
}
async function openForRestore(backup, { today = todayOf() } = {}) {
  const open = async () => {
    if (sessionExpired()) throw new PageError('MySource session expired; Undo could not be read');
    await closeSkippedPerson();
    return openPerson(backup.email, backup.professional, null, { today, termDate: backup.termDate });
  };
  try { return await open(); }
  catch (error) {
    if (!(error instanceof PageError) || stopFlagged(error) || sessionExpired() || error.addPressed || /Snooze will not guess|shown person changed|Nothing was deleted|schedule changed since/i.test(error.message)) throw error;
    return open();
  }
}
async function applyTax(one, prepared, { step = fn => fn(), onWrite = () => {} } = {}) {
  const within = (day, start, end) => compareDays(day, start) >= 0 && compareDays(day, end) <= 0;
  const same = (a, b) => compareDays(a, b) === 0;
  const loa = row => entryKind(row) === 'loa' || valueKey(row.client) === 'loa';
  const taxRow = row => ({ ...row, billable: '', utilization: '', pricingId: '', assignCode: '', assignCode2: '' });
  const match = (a, b) => valueKey(a.client) === valueKey(b.client) && valueKey(a.wbs) === valueKey(b.wbs) && valueKey(a.jobCode) === valueKey(b.jobCode);
  if (!prepared.backup || prepared.backup.email !== one.record.email || prepared.backup.site !== 'tax') throw new PageError('The Tax backup is not ready. Nothing was changed.');
  const { today, identity, window } = prepared;
  let current = prepared.copy;
  const written = async () => { await requirePersonIdentity(identity); await onWrite(); };
  const prove = async (expected, notes = []) => {
    const after = await copyWindow(window);
    if (!compareCopies({ days: prepared.copy.days.filter(row => compareDays(row.day, prepared.reportEnd) > 0) }, { days: after.days.filter(row => compareDays(row.day, prepared.reportEnd) > 0) }).same) prepared.backup.unbackedAfter = prepared.reportEnd;
    if (!compareCopies({ days: expected }, after).same || expected.some(old => old.id && !after.days.some(row => row.id === old.id && row.notes === old.notes)) || notes.some(wanted => !after.days.some(row => same(row.day, wanted.day) && match(row, wanted) && row.hours === wanted.hours && row.notes > 0))) {
      throw new PageError('The Tax schedule step could not be proved. Restore this person before continuing.');
    }
    for (const row of after.days) {
      const old = current.days.find(old => old.id === row.id && old.noteTextSubmitted);
      if (old) Object.assign(row, { noteText: old.noteText, noteTextSubmitted: true });
    }
    current = after;
    for (const wanted of notes) for (const row of current.days.filter(row => same(row.day, wanted.day) && match(row, wanted))) Object.assign(row, { noteText: one.decision.plan.notes, noteTextSubmitted: true });
    return after;
  };
  const removeLoa = async (week, all = false) => {
    const targets = current.days.filter(row => (all || loa(row)) && within(row.day, week.start, week.end));
    if (!targets.length) return;
    const edit = await findAssignments({ start: week.start, end: week.end, ...(all ? {} : { clients: [...new Set(targets.map(row => row.client))] }) });
    try {
      const actual = { days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) };
      if (!compareCopies({ days: targets }, actual).same) throw new PageError('Tax LOA changed before deletion. Nothing was deleted.');
    } catch (error) { await cleanupAfter(error, () => closeEdit(edit)); throw error; }
    await deleteAll(edit, { onWrite: written });
    await prove(current.days.filter(row => !targets.some(old => old.id === row.id)));
  };
  for (const week of prepared.taxPlan.weeks) {
    for (const item of week.lowerClients) await step(async () => {
      const target = current.days.find(row => row.id === item.row.id);
      if (!target || compareDays(target.day, mondayOf(today)) < 0) throw new PageError('Tax hours edit would change a past week. Nothing was saved.');
      await setAssignmentHours({ start: window.start, end: window.end }, current, target, item.hours, { onWrite: written });
      await prove(current.days.map(row => row.id === target.id ? { ...row, hours: item.hours } : row));
    });
    if (compareDays(week.start, today) < 0) throw new PageError('Tax Add/Replace would start before today. Nothing was added.');
    if (week.loa.mode !== 'Replace') await step(() => removeLoa(week));
    else if (!week.loa.hours) await step(() => removeLoa(week, true));
    const old = current.days;
    const added = taxRow({ day: week.loa.day, date: usDate(week.loa.day), client: 'Leave of Absence (LOA)', wbs: '', jobCode: '', hours: week.loa.hours });
    if (week.loa.hours > 0) await step(async () => {
      await addAssignment({ client: added.client, start: week.loa.day, end: week.end, hoursPerWeek: added.hours, notes: one.decision.plan.notes }, week.loa.mode, { onWrite: written });
      await prove([...(week.loa.mode === 'Replace' ? old.filter(row => !within(row.day, week.start, week.end)) : old), added], [added]);
    });
    if (week.loa.mode === 'Replace') for (const holiday of week.holidays) await step(async () => {
      await addAssignment({ client: holiday.client, start: holiday.day, end: holiday.day, hoursPerWeek: 8, wbs: holiday.wbs, jobCode: holiday.jobCode, notes: '' }, 'Normal', { onWrite: written });
      await prove([...current.days, { ...holiday, id: '', hours: 8 }]);
    });
  }
  return { ok: true, method: 'Tax weekly Replace and hours edit', after: current, checks: [['✓', 'Tax weekly hours and unchanged entries checked', '']], problems: [] };
}
__exports.BACKUP_KIND = BACKUP_KIND;
__exports.TERM_DATE_UNDO = TERM_DATE_UNDO;
__exports.alreadyAdded = alreadyAdded;
__exports.prepare = prepare;
__exports.apply = apply;
__exports.removeLeaveRun = removeLeaveRun;
__exports.previewRestore = previewRestore;
__exports.restore = restore;
__exports.recover = recover;
},
"run/tax-work.js": function (__require, __exports, document, window) {
'use strict';
const { addDays, compareDays, mondayOf, reportWindow, usDate, workingDays } = __require("../rules/dates.js");
const { valueKey, rememberPageName } = __require("../rules/prepare.js");
const { entryKind } = __require("../rules/entries.js");
const { planTaxWeeks } = __require("../rules/tax-weeks.js");
const { checkPerson } = __require("../rules/shared.js");
const { reasonLine } = __require("../screen/wording.js");
const { requireDayReport } = __require("../files/report.js");
const { PageError, withPersonGuard } = __require("../mysource/dom.js");
const { isTaxPage } = __require("../mysource/site.js");
const { openPerson, personIdentity, checkPersonIdentity, canAddAssignment } = __require("../mysource/schedule.js");
const { showDate, calendarHolds } = __require("../mysource/calendar.js");
const { copyWindow, compareCopies } = __require("../mysource/copy.js");
const { preflightDates } = __require("../mysource/write.js");
const { reportDays, compareByDay } = __require("./backup.js");
const { recordRun } = __require("../core/run-records.js");
const { reportDifferenceSummary } = __require("../files/report-diagnostic.js");
const within = (day, start, end) => compareDays(day, start) >= 0 && compareDays(day, end) <= 0;
const same = (a, b) => compareDays(a, b) === 0;
const loa = row => entryKind(row) === 'loa' || valueKey(row.client) === 'loa';
const taxRow = row => ({ ...row, billable: '', utilization: '', pricingId: '', assignCode: '', assignCode2: '' });
const match = (a, b) => valueKey(a.client) === valueKey(b.client) && valueKey(a.wbs) === valueKey(b.wbs) && valueKey(a.jobCode) === valueKey(b.jobCode);
async function prepareTax(one, version, today, { step = fn => fn() } = {}) {
  if (one.slice?.status === 'notOnReport') return { stop: 'not on the Staff Schedule Hours Report, possibly not Tax', reasonCode: 'notOnReport' };
  if (!isTaxPage()) throw new PageError('Tax tickets require Tax MySource. Nothing was changed.');
  if (one.slice?.status !== 'ready') return { stop: 'The Staff Schedule Hours Report for this person is not ready.' };
  requireDayReport(one.slice);
  const person = { ...one.record.person, ...one.slice.person, site: 'tax' };
  const scope = checkPerson(person, one.decision);
  if (scope && scope.code !== 'taxPartnerMd') return { stop: reasonLine(scope), reasonCode: scope.code };
  rememberPageName(one.record, await step(() => openPerson(one.record.email, person.professional || one.record.person.professional, one.record, { today })));
  const identity = personIdentity();
  if (scope?.code === 'taxPartnerMd' || one.personStop?.code === 'taxPartnerMd') {
    one.personStop = { outcome: 'noReport', code: 'taxPartnerMd' };
    return { nothing: reasonLine(one.personStop), code: 'taxPartnerMd', identity, checks: [] };
  }
  const plan = one.decision.plan || (one.decision.code === 'leaveOver' ? { action: 'add', loaStart: one.decision.start, loaEnd: one.decision.end } : null);
  if (!plan || plan.action !== 'add') return { stop: 'Unsupported Tax schedule action. Nothing was changed.' };
  const start = mondayOf(today), end = addDays(compareDays(plan.loaEnd, today) < 0 ? today : plan.loaEnd, 56);
  const copy = await step(() => withPersonGuard(probe => checkPersonIdentity(identity, 'identity check', probe), () => copyWindow({ start, end }, { future: true })));
  const reportEnd = one.slice.reportEnd || reportWindow(today).end;
  const source = one.slice.backupEntries ?? one.slice.entries;
  const report = reportDays({ ...one.slice, entries: source }, { start, end: reportEnd }).map(taxRow);
  const differences = compareByDay(copy.days.filter(row => compareDays(row.day, reportEnd) <= 0), report, null, ['jobCode']);
  recordRun({ type: 'comparison', summary: reportDifferenceSummary(differences) });
  if (differences.length) return { stop: 'The page and the Staff Schedule Hours Report disagree. Pull the Staff Schedule Hours Report again before Start.',
    reasonCode: 'pageReportMismatch', skipReason: `Schedule differs from the Staff Schedule Hours Report: ${differences[0].message}; nothing changed` };
  if (!compareCopies({ days: report.filter(row => compareDays(row.day, today) < 0) }, { days: copy.days.filter(row => compareDays(row.day, today) < 0 && compareDays(row.day, reportEnd) <= 0) }).same) return { stop: 'This week’s past Tax entries cannot be paired with the report for an hours-only restore. Nothing was changed; By hand.' };
  for (const row of copy.days) if (!row.client || !row.day || !Number.isFinite(row.hours) || row.hours <= 0 || !row.id) return { stop: 'A Tax schedule row cannot be backed up or read completely. Nothing was changed.' };
  if (one.decision.code === 'leaveOver') return { nothing: reasonLine(one.decision), code: 'leaveOver', identity, copy, checks: [] };
  const proposal = planTaxWeeks({ plan, today, rows: copy.days.map(row => {
    const kind = entryKind(row);
    return { ...row, kind: ['loa', 'holiday', 'dns'].includes(kind) ? kind : 'client' };
  }) });
  if (proposal.outcome === 'byHand') return { stop: reasonLine(proposal), reasonCode: proposal.code };
  if (proposal.code === 'taxPastEnd' || proposal.code === 'leaveOver') return { nothing: reasonLine(proposal), code: proposal.code, identity, copy, checks: [], kept: proposal.kept };
  if (proposal.weeks.some(week => copy.days.some(row => loa(row) && same(mondayOf(row.day), week.monday) && compareDays(row.day, today) >= 0 && compareDays(row.day, week.start) < 0))) return { stop: 'An existing Tax weekly LOA starts outside the partial-week change. Nothing was changed; By hand.' };
  for (const week of proposal.weeks) {
    const covered = copy.days.filter(row => loa(row) && compareDays(row.day, today) < 0 && same(mondayOf(row.day), week.monday)).flatMap(row =>
      workingDays(row.day, addDays(week.monday, 4)).filter(day => !copy.days.some(other => entryKind(other) === 'holiday' && same(other.day, day))).slice(0, Math.ceil(row.hours / 8)));
    const retained = workingDays(week.start, week.end).filter(day => covered.some(old => same(old, day)));
    week.loa.hours = Math.max(0, week.loa.hours - retained.length * 8);
    const uncovered = workingDays(week.start, week.end).filter(day => !covered.some(old => same(old, day)));
    if (uncovered.length) week.loa.day = uncovered[0];
  }
  for (const week of proposal.weeks) {
    if (!calendarHolds(week.monday)) await step(() => showDate(week.monday));
    if (!await step(() => withPersonGuard(probe => checkPersonIdentity(identity, 'identity check', probe), () => canAddAssignment(week.monday, { dayOnly: true })))) return { stop: 'Future leave dates are greyed out. Nothing was changed; By hand.', reasonCode: 'futureScheduleGreyed' };
  }
  const backupEnd = compareDays(copy.window.end, reportEnd) < 0 ? copy.window.end : reportEnd;
  const window = copy.window;
  const backup = { kind: 'Snooze backup 1', site: 'tax', snooze: version, email: one.record.email, professional: one.record.person.professional, ticket: one.record.number,
    taken: copy.taken, window: { start, end: backupEnd }, watchedWindow: window, today, reportEnd, days: report.filter(row => compareDays(row.day, backupEnd) <= 0),
    plan: Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'notes')), report: one.slice.fileName || 'the Staff Schedule Hours Report by Day' };
  const pairedIds = new Set();
  backup.days = backup.days.map(old => {
    const row = copy.days.find(row => !pairedIds.has(row.id) && copy.days.filter(other => other.id === row.id).length === 1
      && compareCopies({ days: [old] }, { days: [row] }).same);
    if (!row) return old;
    pairedIds.add(row.id);
    return { ...old, id: row.id };
  });
  backup.noteChangedDays = copy.days.filter(row => loa(row) && compareDays(row.day, today) >= 0 && compareDays(row.day, reportEnd) <= 0 && proposal.weeks.some(week => within(row.day, week.start, week.end))).map(row => row.day);
  const required = proposal.weeks.flatMap(week => [week.start, week.end, ...week.holidays.map(row => row.day)]);
  if (required.length) await step(() => withPersonGuard(probe => checkPersonIdentity(identity, 'identity check', probe), () => preflightDates(required, { anchor: proposal.weeks[0].start })));
  const removing = proposal.weeks.flatMap(week => {
    const rows = week.loa.mode === 'Replace' ? copy.days.filter(row => within(row.day, week.start, week.end)) : week.lowerClients.map(item => item.row);
    return rows.map(row => {
      const reportEntry = source.find(entry => match(entry, row));
      const reduced = week.lowerClients.find(item => item.row.id === row.id);
      const hours = reduced ? row.hours - reduced.hours : row.hours;
      return { client: row.client, hours, days: 1, clientHours: valueKey(reportEntry?.revenue) === 'yes' || valueKey(reportEntry?.billable) === 'billable' ? hours : 0 };
    });
  });
  return { tax: true, today, identity, window, watchedWindow: window, copy, watched: copy, backup, reportEnd, taxPlan: proposal, removing,
    holidays: proposal.holidays, partialWeeks: proposal.partialWeeks, kept: proposal.kept, checks: [], daysCompared: new Set(report.map(row => row.date)).size };
}
__exports.prepareTax = prepareTax;
},
"run/bulk-restore.js": function (__require, __exports, document, window) {
'use strict';
const { personSlice, requireDayReport } = __require("../files/report.js");
const { reportDays } = __require("./backup.js");
const { previewRestore, restore } = __require("./work.js");
const { todayOf, compareDays } = __require("../rules/dates.js");
const { emailKey } = __require("../rules/prepare.js");
const { batchCover, closeSkippedPerson, sessionExpired } = __require("../mysource/batch.js");
const { requireSchedulePage } = __require("../mysource/schedule.js");
const { PageError, setBatchGuard } = __require("../mysource/dom.js");
function bulkRestorePeople(report, today = todayOf()) {
  requireDayReport(report);
  const start = report.days?.[0], end = report.days?.at(-1);
  if (!start || !end) throw new PageError('The daily report has no readable date coverage.');
  const window = { start, end };
  const people = [...new Map(report.entries.map(entry => [emailKey(entry.email), entry.email])).values()];
  return people.filter(Boolean).map(email => {
    const slice = personSlice(report, email, window);
    const stop = slice.status !== 'ready' ? 'The report does not cover this person and period.'
      : slice.person?.disagreements?.length ? 'The report rows disagree about this person.' : '';
    const backup = { email, professional: slice.person?.professional || email, termDate: slice.person?.termDate ?? '', window,
      days: reportDays({ ...slice, entries: slice.backupEntries || slice.entries }, window),
      plan: { action: 'restore', window } };
    return { email, name: backup.professional, stop, backup,
      period: compareDays(end, today) < 0 ? null : { start: compareDays(start, today) < 0 ? today : start, end } };
  });
}
const guard = () => {
  if (sessionExpired()) throw Object.assign(new PageError('The session expired. Sign in before continuing Restore.'), { session: true });
  requireSchedulePage();
};
async function eachPerson(people, operation, onPerson) {
  const release = setBatchGuard(guard);
  const rows = [];
  try {
    for (const person of people) {
      const row = { person, state: 'checking' };
      rows.push(row); onPerson(row);
      try {
        guard();
        if (person.stop) throw new PageError(person.stop);
        Object.assign(row, await operation(person));
      } catch (error) {
        row.state = 'byHand'; row.message = error.message;
        row.restoreProgress = error.restoreProgress || null;
        if (error.session || error.identityChanged || error.schedulePage || error.batchWide) {
          row.state = 'paused'; return { rows, paused: true, message: error.message };
        }
      }
      onPerson(row);
      try { guard(); await closeSkippedPerson(); guard(); }
      catch (error) { return { rows, paused: true, message: error.message }; }
    }
    return { rows, paused: false };
  } finally { release(); }
}
function previewBulkRestore(people, { onPerson = () => {}, today = todayOf() } = {}) {
  return eachPerson(people, async person => {
    const preview = await previewRestore(person.backup, { fullReport: true, today });
    return { state: 'preview', preview };
  }, onPerson);
}
async function applyBulkRestore(rows, { onPerson = () => {}, today = todayOf() } = {}) {
  const approved = rows.filter(row => row.state === 'preview' && row.preview && !row.person.stop);
  const previews = new Map(approved.map(row => [row.person, row.preview]));
  const release = batchCover();
  try { return await eachPerson(approved.map(row => row.person), async person => {
    const preview = previews.get(person);
    const result = await restore(person.backup, { fullReport: true, today,
      previewBefore: preview.before, previewDays: preview.changedDays });
    return { state: result.same ? result.skippedLocked?.length ? 'partial' : 'restored' : 'byHand', result };
  }, onPerson); } finally { release(); }
}
__exports.bulkRestorePeople = bulkRestorePeople;
__exports.previewBulkRestore = previewBulkRestore;
__exports.applyBulkRestore = applyBulkRestore;
},
"screen/restore-panel.js": function (__require, __exports, document, window) {
'use strict';
const { el, saveFile, recoveryGuide } = __require("./ui.js");
const { readReport } = __require("../files/report.js");
const { bulkRestorePeople, previewBulkRestore, applyBulkRestore } = __require("../run/bulk-restore.js");
const { batchCover } = __require("../mysource/batch.js");
const { dayRanges } = __require("../rules/leaves.js");
const { xlsxBytes } = __require("../files/xlsx-writer.js");
function restoreReportButton(work, body, onBack) {
  const input = el('input', { type: 'file', accept: '.csv,.xlsx', hidden: true });
  const message = el('div', { class: 'warn', role: 'status', hidden: true });
  const button = el('button', { class: 'grey', onclick: () => { if (!work.busy) input.click(); } }, 'Restore from a report');
  input.addEventListener('change', async () => {
    const file = input.files[0]; input.value = '';
    if (!file || work.busy) return;
    button.disabled = true; work.busy = true;
    try { mountRestorePanel(bulkRestorePeople(await readReport(file)), work, body, onBack); }
    catch (error) { message.textContent = error.message; message.hidden = false; }
    finally { work.busy = false; button.disabled = false; }
  });
  return el('div', { class: 'restore-entry' }, button, recoveryGuide(), input, message);
}
function mountRestorePanel(people, work, body, onBack) {
  const selected = new Set();
  let previews = null, results = null, active = false, restoring = false, message = '';
  const rows = new Map();
  const box = el('div', { class: 'restore-screen' });
  const panel = body.closest('.panel');
  panel?.classList.add('restore-open');
  work.setScreenTitle?.('Restore from a report');
  work.refreshClockControls = null;
  body.replaceChildren(box);
  const countDays = () => (previews?.rows || []).reduce((sum, row) => sum + (row.preview?.changedDays.length || 0), 0);
  const back = () => {
    if (active) return;
    panel?.classList.remove('restore-open'); work.setScreenTitle?.(''); onBack();
  };
  const reset = () => { if (!active) { previews = results = null; rows.clear(); message = ''; draw(); } };
  const record = row => { rows.set(row.person.email, row); draw(); };
  const finishResults = value => {
    const completed = new Map(value.rows.map(row => [row.person.email, row]));
    const all = people.filter(person => selected.has(person.email)).map(person => {
      const prior = previews?.rows.find(row => row.person.email === person.email);
      return completed.get(person.email) || (prior?.state === 'byHand' ? prior : {
        person, state: 'notRun', message: 'Restore was not run for this person.'
      });
    });
    rows.clear(); for (const row of all) rows.set(row.person.email, row);
    return { ...value, rows: all };
  };
  async function run(restore) {
    if (active || work.busy || restore && (!previews || !countDays())) return;
    active = work.busy = true; restoring = restore; message = ''; rows.clear();
    if (restore) for (const row of previews.rows) rows.set(row.person.email, row);
    work.host.dataset.batchReserved = 'true';
    const release = batchCover(work.host, work.host);
    draw();
    try {
      const value = restore
        ? await applyBulkRestore(previews.rows, { onPerson: record })
        : await previewBulkRestore(people.filter(person => selected.has(person.email)), { onPerson: record });
      if (restore) results = finishResults(value); else previews = value;
      message = value.paused ? value.message : '';
    } catch (error) {
      message = error.message;
      if (restore) results = finishResults({ rows: [...rows.values()].filter(row => row.state !== 'preview' && row.state !== 'checking'), paused: true, message });
      else previews = null;
    } finally {
      release(); active = work.busy = false; delete work.host.dataset.batchReserved;
      draw(); for (const listener of work.listeners) listener();
    }
  }
  function draw() {
    const scroll = box.querySelector('.restore-list')?.scrollTop || 0;
    const focus = box.getRootNode().activeElement?.getAttribute?.('data-person');
    box.replaceChildren();
    const checked = previews !== null;
    const toggle = el('button', { class: 'grey restore-small', disabled: active, onclick: () => {
      if (checked || results) return reset();
      const all = people.filter(person => !person.stop && person.period);
      const choose = all.some(person => !selected.has(person.email));
      for (const person of all) { if (choose) selected.add(person.email); else selected.delete(person.email); }
      draw();
    } }, checked || results ? 'Change selection' : 'Select all');
    box.append(el('div', { class: 'restore-top' }, el('strong', {}, results ? 'Restore results' : checked ? 'Review changes' : 'Choose people'), toggle));
    const list = el('div', { class: 'restore-list', 'aria-label': 'People in the daily report' });
    for (const person of people) {
      const row = rows.get(person.email);
      const preview = row?.preview || previews?.rows.find(row => row.person.email === person.email)?.preview;
      const chosen = selected.has(person.email);
      const status = row?.state === 'checking' ? restoring ? 'Restoring…' : 'Checking…' : results ? ({ restored: 'Restored', partial: 'Partly restored', byHand: 'By hand', paused: 'Paused' }[row?.state] || (chosen ? 'Not run' : ''))
        : checked && chosen ? preview ? preview.changedDays.length ? `${preview.changedDays.length} days` : preview.skippedLocked?.length ? 'Greyed out' : 'No changes' : row?.state === 'byHand' ? 'By hand' : row?.state === 'paused' ? 'Paused' : 'Not checked' : chosen ? 'Selected' : '';
      const input = el('input', { type: 'checkbox', checked: chosen, disabled: active || checked || !!results || !!person.stop || !person.period,
        'data-person': person.email, 'aria-label': person.name, onchange: () => {
          if (input.checked) selected.add(person.email); else selected.delete(person.email);
          draw();
        } });
      const detail = preview && chosen ? preview.changedDays.length ? dayRanges(preview.changedDays) : preview.skippedLocked?.length ? 'No editable changes' : 'Already matches the report'
        : person.period ? '' : 'Past dates only';
      const card = el('label', { class: `restore-person${chosen ? ' selected' : ''}` }, input,
        el('span', { class: 'restore-main' }, el('strong', {}, `${chosen?'\u2713 ':''}${person.name}`), el('span', { class: 'restore-state' }, status)),
        detail ? el('span', { class: 'restore-dates' }, detail) : null);
      const locked = row?.result?.skippedLocked || preview?.skippedLocked;
      if (chosen && locked?.length) card.append(el('div', { class: 'restore-warning' }, `${dayRanges(locked)}: greyed out`));
      if (person.stop || row?.message) card.append(el('div', { class: 'restore-warning' }, person.stop || row.message));
      list.append(card);
    }
    if (!people.length) list.append(el('div', { class: 'dates' }, 'No people found in this daily report.'));
    box.append(list);
    const footer = el('div', { class: 'restore-footer' });
    const pending = results?.rows.filter(row => ['notRun', 'paused'].includes(row.state)).length || 0;
    const text = results ? `${results.rows.filter(row => row.state === 'restored').length} restored · ${results.rows.filter(row => row.state === 'partial').length} partial · ${results.rows.filter(row => row.state === 'byHand').length} by hand${pending ? ` · ${pending} not run` : ''}`
      : checked ? `${selected.size} selected · ${countDays()} days to restore` : `${selected.size} of ${people.length} selected`;
    footer.append(el('div', { class: 'restore-count', role: 'status' }, active ? restoring ? 'Restoring the selected schedules…' : 'Reading the selected schedules…' : text));
    if (!results) footer.append(el('div', { class: 'restore-notice' }, 'Original notes and Pricing ID cannot be restored.'));
    if (message) footer.append(el('div', { class: 'warn', role: 'status' }, message));
    const action = results
      ? el('button', { class: 'blue', disabled: active, onclick: () => {
        const table = [['Person', 'Result', 'Planned dates', 'Skipped dates', 'Reason'], ...results.rows.map(row => [row.person.name, ({restored:'Restored',partial:'Partly restored',byHand:'By hand',notRun:'Not run',paused:'Paused'})[row.state] || 'Not run',
          dayRanges(previews?.rows.find(prior => prior.person.email === row.person.email)?.preview?.changedDays || []),
          dayRanges(row.result?.skippedLocked || previews?.rows.find(prior => prior.person.email === row.person.email)?.preview?.skippedLocked || []), row.message || ''])];
        saveFile('Snooze Restore results.xlsx', xlsxBytes([{ name: 'Restore results', rows: table }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } }, 'Download results')
      : el('button', { class: checked ? 'red' : 'blue', disabled: active || !selected.size || checked && (!countDays() || previews.paused), onclick: () => run(checked) }, checked ? `Restore ${selected.size} people · ${countDays()} days` : 'Preview changes');
    footer.append(el('div', { class: 'buttons' }, el('button', { class: 'grey', disabled: active, onclick: back }, 'Back'), action));
    box.append(footer); list.scrollTop = scroll;
    if (focus) [...list.querySelectorAll('input')].find(input => input.getAttribute('data-person') === focus)?.focus();
  }
  draw();
  return box;
}
__exports.restoreReportButton = restoreReportButton;
__exports.mountRestorePanel = mountRestorePanel;
},
"run/live-connection.js": function (__require, __exports, document, window) {
'use strict';
const { PageError, setConnectionGuard } = __require("../mysource/dom.js");
const { watchConnection, connectionPageReady, CONNECTION_WORDS, sessionExpired } = __require("../mysource/batch.js");
const { personIdentity, checkPersonIdentity, requireSchedulePage, IDENTITY_PAUSE_WORDS } = __require("../mysource/schedule.js");
const { beginLiveDiagnostics } = __require("./live-diagnostics.js");
async function withLiveConnection(options, initialPage, run) {
  if (!initialPage.restartConnection) return run(options, initialPage);
  let page = initialPage, result = null, identity = null, resuming = false;
  let resolveResume = null, busy = false, onlinePending = false;
  const history = [];
  let previousWrites = 0, previousEvents = [];
  const notify = () => options.onUpdate?.(result);
  const connection = watchConnection({
    lost() {
      try { identity = personIdentity(); }
      catch (error) { identity = { error }; }
    },
    online() { onlinePending = true; if (resolveResume) void resume(); },
  });
  const release = setConnectionGuard(probe => {
    connection.check(resuming);
    if (resuming) {
      if (sessionExpired()) throw Object.assign(new PageError('Session expired.', { record: false }), { session: true });
      requireSchedulePage(probe);
      if (identity?.name) checkPersonIdentity(identity, 'identity check', probe);
    }
  });
  async function resume() {
    if (!resolveResume || busy) return false;
    busy = true; resuming = true; onlinePending = false;
    try {
      connection.beginResume();
      if (identity?.error) throw identity.error;
      await connectionPageReady(identity);
      const recoveryResult = { ...result, state: 'paused' };
      const recovery = beginLiveDiagnostics(recoveryResult, page, options.assignPeriod, options.today);
      recovery.cleanup();
      let cleanup;
      try { cleanup = await page.connectionCleanup(() => { result.writes++; }); }
      finally {
        recovery.finish();
        result.diagnostic.events.push(...recoveryResult.diagnostic.events);
      }
      result.connectionRecovery = cleanup;
      if (!['empty', 'notNeeded'].includes(cleanup)) {
        result.cleanup = 'unconfirmed';
        result.message = 'Cleanup UNCONFIRMED. Test entries may remain.';
        return false;
      }
      result.cleanup = cleanup;
      result.outstanding = [];
      await connectionPageReady(identity);
      connection.accept();
      const done = resolveResume; resolveResume = null; done();
      return true;
    } catch (error) {
      result.message = error.session ? 'MySource session expired. Sign in again in this tab, then press Resume.'
        : error.identityChanged ? IDENTITY_PAUSE_WORDS : error.connectionLost ? CONNECTION_WORDS : error.message;
      return false;
    } finally { busy = false; resuming = false; notify(); }
  }
  try {
    while (true) {
      try {
        return await run({ ...options, onUpdate(value) {
          if (value !== result) {
            value.writes += previousWrites;
            value.diagnostic.events.unshift(...previousEvents);
          }
          result = value;
          if (history.length) result.connectionHistory = history;
          if (value.state !== 'paused') options.onUpdate?.(value);
        } }, page);
      } catch (error) {
        if (!error.connectionLost || !result) throw error;
        result.state = 'paused'; result.message = CONNECTION_WORDS;
        Object.defineProperty(result, 'resume', { value: resume, configurable: true });
        const resumed = new Promise(resolve => { resolveResume = resolve; });
        notify();
        if (onlinePending) void resume();
        await resumed;
        if (result.connectionReturnState) { result.state = result.connectionReturnState; return result; }
        history.push({ steps: result.steps, writes: result.writes, cleanup: result.connectionRecovery, diagnostic: result.diagnostic });
        previousWrites = result.writes; previousEvents = result.diagnostic.events;
        page = page.restartConnection(); identity = null;
      }
    }
  } finally { release(); connection.close(); }
}
__exports.withLiveConnection = withLiveConnection;
},
"run/live-test.js": function (__require, __exports, document, window) {
'use strict';
const { beginLiveDiagnostics } = __require("./live-diagnostics.js");
const { NOTE_STAGE_EXITS, isNoteStageRefusal } = __require("../mysource/note-stage.js");
const { LIVE_TEST_PARTS, testPart, TAX_LIVE_STEPS, SMALL_LIVE_STEPS, taxLiveReport } = __require("./live-proof.js");
const { runTaxLiveTest } = __require("./tax-live-test.js");
const { withLiveConnection } = __require("./live-connection.js");
const { runAuditLiveTest, runSmallConsultingTest, AUDIT_LIVE_STEPS, auditLiveReport } = __require("./audit-live-test.js");
const { GROUP_TITLES, GROUP_PROOFS, runLiveGroups } = __require("./live-groups.js");
const { addDays, compareDays, readIsoDay, dayFromParts, todayOf, usDate } = __require("../rules/dates.js");
const { addressCount } = __require("../rules/prepare.js");
const { reasonCode, recordRun, STAGES, WINDOWS, FIELDS } = __require("../core/run-records.js");
const LIVE_TEST_PHASES = new Set(['compare', 'calendar', 'menu', 'form', 'Client', 'Billable', 'Utilization Generating', 'dates', 'Hours Per Day', 'Notes', 'Mode', 'prove', 'submit', 'save', 'read', 'clear', 'restore']);
function liveRefusalReason(step) {
  return (step.state === 'notExercised' || step.notExercised || step.state === 'failed') && isNoteStageRefusal(step.reason) ? step.reason : null;
}
const LIVE_TEST_PROBLEMS = {
  restoreChanged: 'The test schedule changed before Restore. These days were left unchanged.',
  cancelUnconfirmed: 'Cancel did not close the staged window. Nothing was saved.',
};
const EXTENSION_STEPS = {
  dateGuard: 'Check allowed dates', aEmpty: 'A · Check empty period', aSetup: 'A · Add LOA',
  aRefresh: 'A · Refresh LOA note', aCancel: 'A · Stage reduction and Cancel', aReduce: 'A · Save combined reduction',
  aClear: 'A · Clear LOA',
  bLoa: 'B · Add four-hour LOA', bDns: 'B · Add four-hour DNS',
  bDelete: 'B · Delete DNS only', bRestore: 'B · Restore missing DNS',
  bReplace: 'B · Replace both with one DNS', bClear: 'B · Clear test entries',
  cLoa: 'C · Add Monday Wednesday Friday LOA', cDns: 'C · Add Tuesday Thursday DNS',
  sevenSetup: 'Add ten working LOA days', sevenCancel: 'Stage seven removals and Cancel',
  sevenReduce: 'Save ten to three LOA days', sevenClear: 'Clear three LOA days',
  cDelete: 'C · Clear checkpoint entries', cRestore: 'C · Restore grouped dates', cClear: 'C · Clear test entries',
};
const LIVE_TEST_STEPS = {
  ...AUDIT_LIVE_STEPS,
  ...TAX_LIVE_STEPS,
  ...GROUP_TITLES,
  ...EXTENSION_STEPS,
  ...SMALL_LIVE_STEPS,
  open: 'Open professional', empty: 'Check empty period', editable: 'Check editable dates',
  loaAdd: 'Add LOA', loaReplace: 'Replace LOA, hover and screenshot',
  loaDelete: 'Delete LOA', loaAlter: 'Change test entries before Restore', loaRestore: 'Restore LOA',
  dnsAdd: 'Replace part of LOA with DNS', dnsReplace: 'Replace all with DNS, hover and screenshot',
  dnsDelete: 'Delete DNS', dnsAlter: 'Change test entries before Restore', dnsRestore: 'Restore DNS', dnsClear: 'Clear restored DNS',
  cleanup: 'Verify period empty', recovery: 'Clear verified test entries',
};
const liveStepTitle = step => (step.group && GROUP_TITLES[step.id] || LIVE_TEST_STEPS[step.id]) || 'Could not check';
function testPeriod(iso, length = 'year', today = todayOf(), through) {
  if (length !== 'year') throw new Error('Choose a supported test length.');
  const start = { y: 2028, m: 1, d: 3 }, end = through === undefined ? { y: 2028, m: 12, d: 31 } : readIsoDay(through);
  if (!end || end.y !== 2028 || compareDays(end, addDays(start, 59)) < 0) throw new Error('The long test must cover at least 60 days within 2028.');
  if (compareDays(start, today) <= 0) throw new Error('The full 2028 test period must still be in the future.');
  return { start, end };
}
function prove(copy, window) {
  if (!copy || !Array.isArray(copy.days) || copy.days.some(row => !row.day
    || compareDays(row.day, window.start) < 0 || compareDays(row.day, window.end) > 0)) throw new Error('Unconfirmed test window.');
  if (copy.days.length) throw new Error('The test change could not be proved.');
}
function dateEvidence(value) {
  if (!value || typeof value !== 'object' || !value.expected) return null;
  const number = value => Number.isFinite(value) && Math.abs(value) <= 1e9 ? value : null;
  const count = value => Number.isInteger(value) && value >= 0 && value <= 1e6 ? value : null;
  const day = value => value && ['y', 'm', 'd'].every(key => Number.isInteger(value[key]))
    ? dayFromParts(value.y, value.m, value.d) : null;
  const pair = value => value ? { start: day(value.start), end: day(value.end) } : null;
  return {
    expected: { ...pair(value.expected), days: count(value.expected.days), totalHours: number(value.expected.totalHours) },
    picker: pair(value.picker), shown: pair(value.shown), boxes: pair(value.boxes),
    selected: value.selected ? Object.fromEntries(['count', 'unique', 'missing', 'extra'].map(key => [key, count(value.selected[key])])) : null,
    days: count(value.days), totalHours: number(value.totalHours),
  };
}
function liveTimingSummary(events) {
  const seconds = value => Number.isFinite(value) && value >= 0 ? value : null;
  const waits = events.filter(event => ['wait', 'delay'].includes(event.type)).map(event => ({
    ...(Object.hasOwn(LIVE_TEST_STEPS, event.step) ? { step: event.step } : {}),
    name: WINDOWS.has(event.name) || FIELDS.has(event.name) ? event.name : 'Schedule window',
    seconds: seconds(event.seconds), ceiling: seconds(event.ceiling),
    result: ['passed', 'failed', 'refused', 'late'].includes(event.result) ? event.result : 'unconfirmed',
  }));
  const saves = events.filter(event => event.type === 'write').map(event => ({
    ...(Object.hasOwn(LIVE_TEST_STEPS, event.step) ? { step: event.step } : {}),
    name: ['Delete All', 'Add Assignment', 'Restore', 'Edit Assignments Submit'].includes(event.origin) ? event.origin : 'Save',
    seconds: seconds(event.timings?.seconds), waitSeconds: seconds(event.timings?.waitSeconds), ceiling: seconds(event.timings?.ceiling),
    result: ['passed', 'failed', 'refused', 'late'].includes(event.timings?.result) ? event.timings.result : 'unconfirmed',
  }));
  const sum = rows => rows.every(row => row.seconds !== null) ? Math.round(rows.reduce((sum,row) => sum + row.seconds, 0) * 100) / 100 : null;
  return { waits, saves, waitSeconds: sum(waits), saveSeconds: sum(saves) };
}
async function runLiveTest(options, page) {
  const { mode = 'consulting', small = false } = options;
  if (small && mode !== 'tax') return runSmallConsultingTest(options, page);
  if (mode === 'audit') return runAuditLiveTest(options, page);
  if (mode === 'tax') return runTaxLiveTest(options, page);
  return withLiveConnection(options, page, runLongLiveTest);
}
async function runLongLiveTest({ email, week, length = 'year', through, version, today = todayOf(), onUpdate = () => {}, assignPeriod = 'unknown' }, page) {
  const runStarted = Date.now();
  const window = testPeriod(week, length, today, through);
  if (!String(email || '').trim()) throw new Error('Enter the professional email.');
  if (addressCount(email) > 1) throw new Error('Enter one professional email.');
  const result = { kind: 'Snooze live test 1', version, length, week: { start: usDate(window.start), end: usDate(window.end) },
    state: 'running', cleanup: 'notNeeded', steps: [], writes: 0, events: [], pictures: [], ledger: { attempts: [], partialProofs: [], observed: [], checkpoints: [], planned: [], outstanding: [], staged: 0, confirmedWrites: 0 } };
  const diagnostic = beginLiveDiagnostics(result, page, assignPeriod);
  let known = null, uncertainWrite = false, current = null;
  const notify = () => onUpdate(result);
  const onWrite = () => { uncertainWrite = true; result.writes++;
    result.ledger.attempts.push({ step: current?.id, count: result.writes, result: 'unconfirmed' });
  };
  const observe = copy => {
    const dates=new Map(); for (const row of copy.days) { const date=usDate(row.day); if (date) dates.set(date,(dates.get(date)||0)+1); }
    result.ledger.observed=[...dates].map(([date,rows])=>({date,rows}));
  };
  const confirm = copy => { recordRun({type:'writeProof',ok:true,whole:true}); observe(copy); known = copy; uncertainWrite = false;
    result.ledger.confirmedWrites=result.writes; result.ledger.staged=0; result.ledger.planned=[]; result.ledger.outstanding=copy.days.map(row=>({ date:usDate(row.day),rows:1 }));
      for(const attempt of result.ledger.attempts) attempt.result='confirmed';
  };
  const stage = (action, proof, detail) => {
    if (!current) return;
    if (action === 'refused') {
      if (Object.hasOwn(NOTE_STAGE_EXITS, proof?.reason)) current.reason = isNoteStageRefusal(detail) ? detail : NOTE_STAGE_EXITS[proof.reason];
      return;
    }
    current.staged ||= {trash:0,bulk:0,cancel:0,proofs:[]};
    if (action==='proof') current.staged.proofs.push(proof);
    else if (['trash','bulk','cancel'].includes(action)) {current.staged[action]++; result.ledger.staged++;}
  };
  const progress = phase => { if (current && LIVE_TEST_PHASES.has(phase)) current.phase = phase; };
  const proof = (id, exercised = true) => {
    if (!current || !Object.hasOwn(GROUP_PROOFS, id)) throw new Error('Unknown diagnostic proof.');
    current.proofs.push({ id, state: exercised ? 'passed' : 'notExercised' });
    if (!exercised) current.notExercised = true;
  };
  async function step(id, action) {
    current = { id, state: 'running', writesBefore: result.writes }; result.steps.push(current); page.setStep?.(id); notify();
    if (result.design === 'grouped30') Object.assign(current, { group: result.steps.length, proofs: [] });
    const eventStart = result.events.length;
    const started = Date.now();
    try { const value = await action(); current.state = value?.notExercised ? 'notExercised' : 'passed'; return value; }
    catch (error) {
      if (error.connectionLost) { result.state = 'paused'; throw error; }
      if (current.group && ['open', 'empty', 'editable'].includes(error.liveStep)) current.id = error.liveStep;
      if (id === 'dateGuard' && error.guardEvidence) result.dateGuard = error.guardEvidence;
      if (id === 'bDns') current.notExercised = true;
      if (LIVE_TEST_PARTS.has(error.livePart)) current.part = error.livePart;
      else if (['loaReplace','dnsAdd','dnsReplace','aClear','bClear','cClear','sevenClear'].includes(id)) current.part='Saved rows failed.';
      current.state = 'failed'; current.code = error.identityChanged ? 'identityChanged' : error.session ? 'sessionExpired' : reasonCode(error.message);
      if (isNoteStageRefusal(error.stagedDiagnosis)) current.reason = error.stagedDiagnosis;
      if (Object.hasOwn(LIVE_TEST_PROBLEMS, error.testProblem)) current.problem = error.testProblem;
      const dates = dateEvidence(error.dateDiagnostics);
      if (dates) current.dates = { form: dates, pickerAttempt: dateEvidence(error.pickerDateDiagnostics), typed: error.datesMethod === 'typed into the shown box' };
      if (error.deleteDiagnostics) {
        const safe = {};
        for (const key of ['opened', 'ready', 'pressed', 'stopped']) {
          const value = error.deleteDiagnostics[key];
          if (typeof value === 'string' && /^(?:\d+|\?)\/(?:\d+|\?)\/(?:\d+|\?)$/.test(value)) safe[key] = value;
        }
        if (Number.isInteger(error.deleteDiagnostics.scriptErrors) && error.deleteDiagnostics.scriptErrors >= 0) safe.scriptErrors = error.deleteDiagnostics.scriptErrors;
        const atYes = error.deleteDiagnostics.atYes;
        if (atYes) safe.atYes = {
          shownObserved: typeof atYes.shownObserved === 'boolean' ? atYes.shownObserved : null,
          transitioning: typeof atYes.transitioning === 'boolean' ? atYes.transitioning : null,
          animations: Number.isInteger(atYes.animations) && atYes.animations >= 0 ? atYes.animations : null,
        };
        current.deleteDiagnostics = safe;
      }
      current.controls = page.observe(); throw error;
    } finally {
      page.finishStep?.();
      current.writesAfter = result.writes;
      current.ceiling = null; current.result = current.state;
      current.saved = { attempted: current.writesAfter-current.writesBefore, confirmed: Math.max(0,result.ledger.confirmedWrites-current.writesBefore) };
      const events = result.events.slice(eventStart);
      if (current.group) {
        current.finds = events.filter(event => event.type === 'findStep' && event.name === 'open').length;
        const reads = []; current.reads = 0;
        for (const event of events.filter(event => event.stage === 'read')) {
          if (event.type === 'begin') { if (reads.length) reads[reads.length - 1] = true; reads.push(false); }
          else if (event.type === 'step' && reads.length && !reads.pop()) current.reads++;
        }
      }
      current.timings = liveTimingSummary(events);
      {
        const proofs=events.filter(event=>event.type==='restoreComparison'&&event.purpose==='afterAdd'&&event.ok);
        for (const proof of proofs) {
          const read=events.find(event=>event.type==='restoreRead'&&event.proof===proof.proof);
          if(read) result.ledger.partialProofs.push({step:id,scope:read.scope,rows:read.rows,proof:proof.proof,result:'passed'});
        }
        if (['bRestore','cRestore'].includes(id) && proofs.length) {
          current.saved.confirmed=Math.max(current.saved.confirmed,proofs.length);
          for(const attempt of result.ledger.attempts.filter(row=>row.step===id).slice(0,proofs.length)) attempt.result='confirmed';
        }
      }
      const last = events.findLast(event => ['begin', 'step'].includes(event.type) && (STAGES.has(event.stage) || event.stage === 'move calendar'));
      if (last) current.lastAction = { stage: last.stage, ...(typeof last.ok === 'boolean' ? { ok: last.ok } : {}) };
      const wait = events.findLast(event => event.type === 'miss' && (WINDOWS.has(event.name) || FIELDS.has(event.name)));
      if (wait) current.waitFor = wait.name;
      current.seconds = Math.round((Date.now() - started) / 10) / 100; notify();
    }
  }
  const read = async () => {
    progress('read');
    const copy = await page.read(window); observe(copy); await testPart('Saved rows failed.',async()=>prove(copy, window));
    confirm(copy); return copy;
  };
  const clear = async () => {
    progress('clear');
    await page.clear(known, window, onWrite);
    return read();
  };
  let release = null;
  try {
    release = await page.begin(result.events);
    Object.assign(result, { design: 'grouped30', expectedSteps: 30, expectedWrites: 36 });
    await runLiveGroups({ page, window, email: String(email).trim(), result, step, known: () => known, confirm, observe, write: onWrite, stage, proof });
    result.cleanup = 'empty'; result.state = 'complete';
  } catch (error) {
    if (error.connectionLost) throw error;
    diagnostic.fail(error, current?.id); diagnostic.cleanup();
    result.state = 'failed'; result.code = error.identityChanged ? 'identityChanged' : error.session ? 'sessionExpired' : reasonCode(error.message);
    if (!result.writes) result.cleanup = 'notNeeded';
    if (result.writes) result.cleanup = 'unconfirmed';
    if (result.writes && !uncertainWrite && known && !error.identityChanged && !error.session && !error.pageBlocked) {
      try { await step('recovery', ()=>testPart('Cleanup unconfirmed.',clear)); result.cleanup = 'empty'; }
      catch (cleanupError) { if (cleanupError.connectionLost) { result.connectionReturnState = 'failed'; result.state = 'paused'; throw cleanupError; } diagnostic.fail(cleanupError,'recovery'); result.cleanup = 'unconfirmed'; }
    }
  } finally {
    try { result.controls = page.observe(); } catch { result.observationUnavailable = true; }
    if (uncertainWrite) result.ledger.outstanding = [...new Set([...result.ledger.outstanding.map(row=>row.date),...result.ledger.planned,...result.ledger.observed.map(row=>row.date)])].map(date=>({date,rows:null}));
    release?.(); diagnostic.finish();
    result.timings = { seconds: Math.round((Date.now()-runStarted)/10)/100,
      blocks: Object.fromEntries(['A','B','C'].map(block => {
        const steps = result.steps.filter(step => step.id.startsWith(block.toLowerCase()) && /^.[A-Z]/.test(step.id));
        return [block, steps.length && steps.every(step => Number.isFinite(step.seconds)) ? Math.round(steps.reduce((sum,step) => sum + step.seconds,0)*100)/100 : null];
      })),
      ...liveTimingSummary(result.events) };
    notify();
  }
  return result;
}
function liveTestReport(result) {
  if (result.mode === 'audit') return auditLiveReport(result);
  if (result.mode === 'tax') return taxLiveReport(result);
  const refusalReasons = result.steps.map(liveRefusalReason).filter(Boolean);
  const steps = result.steps.map(step => {
    if (!Object.hasOwn(step, 'reason') || isNoteStageRefusal(step.reason)) return step;
    const { reason, ...safe } = step;
    return safe;
  });
  return JSON.stringify({ kind: result.kind, version: result.version, length: result.length, week: result.week,
    design: result.design, expectedSteps: result.expectedSteps, expectedWrites: result.expectedWrites,
    state: result.state, cleanup: result.cleanup, writes: result.writes, ...(refusalReasons.length ? { refusalReasons } : {}), steps,
    code: result.code, controls: result.controls, observationUnavailable: result.observationUnavailable,
    timings: result.timings, events: result.events, ledger: result.ledger, dateGuard: result.dateGuard, grouping: result.grouping, pictures: result.pictures.map(picture => ({
      kind: picture.kind, views: picture.views, bytes: picture.bytes, notesPainted: picture.notesPainted, omissions: picture.omissions,
    })) }, null, 2);
}
__exports.liveRefusalReason = liveRefusalReason;
__exports.LIVE_TEST_PROBLEMS = LIVE_TEST_PROBLEMS;
__exports.LIVE_TEST_STEPS = LIVE_TEST_STEPS;
__exports.liveStepTitle = liveStepTitle;
__exports.testPeriod = testPeriod;
__exports.liveTimingSummary = liveTimingSummary;
__exports.runLiveTest = runLiveTest;
__exports.liveTestReport = liveTestReport;
},
"run/tax-live-test.js": function (__require, __exports, document, window) {
'use strict';
const { beginLiveDiagnostics } = __require("./live-diagnostics.js");
const { addressCount } = __require("../rules/prepare.js");
const { todayOf, usDate } = __require("../rules/dates.js");
const { TAX_LIVE_STEPS, SMALL_TAX_STEPS, TAX_LIVE_FINDINGS, taxTestPeriod } = __require("./live-proof.js");
const { withLiveConnection } = __require("./live-connection.js");
const runTaxLiveTest = (options, page) => withLiveConnection(options, page, runTaxRecorded);
async function runTaxRecorded({ email, version, today = todayOf(), onUpdate = () => {}, assignPeriod = 'unknown', small = false }, page) {
  const window = taxTestPeriod(today, { small });
  if (!String(email || '').trim() || addressCount(email) > 1) throw new Error('Enter one professional email.');
  const result = { kind: 'Snooze live test 1', mode: 'tax', version, length: small ? 'twelveWeeks' : 'month', design: small ? 'tax5' : 'tax8',
    week: { start: usDate(window.start), end: usDate(window.end) }, state: 'running', cleanup: 'notNeeded', writes: 0,
    steps: Object.keys(small ? SMALL_TAX_STEPS : TAX_LIVE_STEPS).map(id => ({ id, state: 'notExercised', findings: [] })), events: [], pictures: [] };
  const diagnostic = beginLiveDiagnostics(result, page, assignPeriod, today);
  const write = () => { result.writes++; };
  const actions = small ? [
    () => page.taxSmallStart(String(email).trim(), window), () => page.taxSmallAdd(write),
    () => page.taxHours(write), () => page.taxPartial(write, { short: true }), () => page.taxClear(write), () => page.taxPast(write),
  ] : [
    () => page.taxStart(String(email).trim(), window),
    () => page.taxFind(write), () => page.taxAdd(write), () => page.taxHoliday(write),
    () => page.taxHours(write), () => page.taxPartial(write), () => page.taxClear(write), () => page.taxPast(write),
  ];
  try {
    for (let index = 0; index < actions.length; index++) {
      const step = result.steps[index]; step.state = 'running'; page.setStep?.(step.id); onUpdate(result);
      try {
        const value = await actions[index]();
        step.state = value?.notExercised ? 'notExercised' : 'passed';
        step.findings = (value?.findings || []).filter(word => TAX_LIVE_FINDINGS.has(word));
      } catch (error) { if (error.connectionLost) { result.state = 'paused'; throw error; } diagnostic.fail(error, step.id); step.state = 'failed'; step.part = (small ? SMALL_TAX_STEPS : TAX_LIVE_STEPS)[step.id]; throw error; }
      onUpdate(result);
    }
    result.state = 'complete'; result.cleanup = 'empty';
  } catch (error) {
    if (error.connectionLost) throw error;
    result.state = 'failed'; diagnostic.cleanup();
    try { result.cleanup = await page.taxCleanup(write, error); }
    catch (cleanupError) { if (cleanupError.connectionLost) { result.connectionReturnState = 'failed'; result.state = 'paused'; throw cleanupError; } diagnostic.fail(cleanupError,'recovery'); result.cleanup = 'unconfirmed'; }
  } finally {
    page.taxFinish?.(); diagnostic.finish(); onUpdate(result);
  }
  return result;
}
__exports.runTaxLiveTest = runTaxLiveTest;
},
"run/audit-live-test.js": function (__require, __exports, document, window) {
'use strict';
const { beginLiveDiagnostics } = __require("./live-diagnostics.js");
const { addressCount } = __require("../rules/prepare.js");
const { compareDays, todayOf, usDate } = __require("../rules/dates.js");
const { SMALL_LIVE_STEPS, smallTestPeriod } = __require("./live-proof.js");
const { withLiveConnection } = __require("./live-connection.js");
const runSmallConsultingTest = (options, page) => withLiveConnection(options, page, runSmallConsultingRecorded);
async function runSmallConsultingRecorded({ email, version, today = todayOf(), onUpdate = () => {}, assignPeriod = 'unknown' }, page) {
  const window = smallTestPeriod(today);
  if (!String(email || '').trim() || addressCount(email) > 1) throw new Error('Enter one professional email.');
  const result = { kind: 'Snooze live test 1', mode: 'consulting', version, design: 'small7', length: 'twelveWeeks',
    expectedSteps: 7, week: { start: usDate(window.start), end: usDate(window.end) },
    state: 'running', cleanup: 'notNeeded', writes: 0, steps: Object.keys(SMALL_LIVE_STEPS).map(id => ({ id, state: 'notExercised' })),
    events: [], pictures: [], outstanding: [] };
  const diagnostic = beginLiveDiagnostics(result, page, assignPeriod, today);
  const write = () => { result.writes++; };
  const actions = [() => page.smallStart(String(email).trim(), window), () => page.smallAdd(write),
    () => page.smallChange(write), () => page.smallDelete(write),
    async () => { result.pictures.push(...await page.smallPicture()); },
    () => page.smallUndo(write), () => page.auditClear(write)];
  let release;
  try {
    release = await page.begin(result.events);
    for (let index = 0; index < actions.length; index++) {
      const step = result.steps[index]; step.state = 'running'; page.setStep?.(step.id); onUpdate(result);
      try { Object.assign(step, await actions[index]()); step.state = 'passed'; }
      catch (error) { if (error.connectionLost) { result.state = 'paused'; throw error; } step.state = 'failed'; step.part = SMALL_LIVE_STEPS[step.id]; diagnostic.fail(error, step.id); throw error; }
      finally { page.finishStep?.(); onUpdate(result); }
    }
    result.state = 'complete'; result.cleanup = 'empty';
  } catch (error) {
    if (error.connectionLost) throw error;
    if (!result.diagnostic.stop) diagnostic.fail(error, result.steps.find(s => s.state === 'running')?.id || 'smallOpen');
    result.state = 'failed'; diagnostic.cleanup();
    try { result.cleanup = await page.auditCleanup(write, error); }
    catch (cleanupError) { if (cleanupError.connectionLost) { result.connectionReturnState = 'failed'; result.state = 'paused'; throw cleanupError; } diagnostic.fail(cleanupError, 'recovery'); result.cleanup = 'unconfirmed'; }
  } finally {
    result.outstanding = page.auditOutstanding(result.cleanup); release?.(); diagnostic.finish(); onUpdate(result);
  }
  return result;
}
const AUDIT_LIVE_STEPS = {
  aaSetup: 'A&A · Setup LOA and DNS; read back',
  aaExit: 'A&A · Exit; delete ranges exclude Wednesday',
  aaKept: 'A&A · Wednesday DNS id and note count unchanged',
  aaDns: 'A&A · New DNS 8 h, Non-Billable / No, blank Notes',
  aaPicture: 'A&A · Plain production screenshot',
  aaUndo: 'A&A · Undo restores setup; Wednesday untouched',
  aaClear: 'A&A · Clear test entries; span empty',
};
function auditTestPeriod(today = todayOf()) {
  const window = { start: { y: 2028, m: 7, d: 3 }, end: { y: 2028, m: 7, d: 14 } };
  if (compareDays(window.start, today) <= 0) throw new Error('The A&A test period must still be in the future.');
  return window;
}
const runAuditLiveTest = (options, page) => withLiveConnection(options, page, runAuditRecorded);
async function runAuditRecorded({ email, version, today = todayOf(), onUpdate = () => {}, assignPeriod = 'unknown' }, page) {
  const window = auditTestPeriod(today);
  if (!String(email || '').trim() || addressCount(email) > 1) throw new Error('Enter one professional email.');
  const result = { kind: 'Snooze live test 1', mode: 'audit', version, design: 'audit7', length: 'twoWeeks',
    week: { start: usDate(window.start), end: usDate(window.end) }, state: 'running', cleanup: 'notNeeded', writes: 0,
    steps: Object.keys(AUDIT_LIVE_STEPS).map(id => ({ id, state: 'notExercised' })), events: [], pictures: [], outstanding: [] };
  const diagnostic = beginLiveDiagnostics(result, page, assignPeriod);
  const write = () => { result.writes++; };
  const actions = [
    async () => { await page.auditStart(String(email).trim(), window); return page.auditSetup(write); },
    () => page.auditExit(write), () => page.auditKept(), () => page.auditDns(),
    async () => { const picture = await page.auditPicture(); result.pictures.push(picture); },
    () => page.auditUndo(write), () => page.auditClear(write),
  ];
  let release;
  try {
    release = await page.begin(result.events);
    for (let index = 0; index < actions.length; index++) {
      const step = result.steps[index]; step.state = 'running'; page.setStep?.(step.id); onUpdate(result);
      try { Object.assign(step, await actions[index]()); step.state = 'passed'; }
      catch (error) { if (error.connectionLost) { result.state = 'paused'; throw error; } diagnostic.fail(error, step.id); step.state = 'failed'; throw error; }
      finally { page.finishStep?.(); onUpdate(result); }
    }
    result.state = 'complete'; result.cleanup = 'empty';
  } catch (error) {
    if (error.connectionLost) throw error;
    if (!result.diagnostic.stop) diagnostic.fail(error, result.steps.find(s=>s.state==='running')?.id || result.steps[0].id);
    result.state = 'failed'; diagnostic.cleanup();
    try { result.cleanup = await page.auditCleanup(write, error); }
    catch (cleanupError) { if (cleanupError.connectionLost) { result.connectionReturnState = 'failed'; result.state = 'paused'; throw cleanupError; } diagnostic.fail(cleanupError,'recovery'); result.cleanup = 'unconfirmed'; }
  } finally {
    result.outstanding = page.auditOutstanding(result.cleanup); release?.(); diagnostic.finish(); onUpdate(result);
  }
  return result;
}
function auditLiveReport(result) {
  return JSON.stringify({ kind: result.kind, mode: 'audit', version: result.version, design: 'audit7', week: result.week,
    state: result.state, cleanup: result.cleanup, writes: result.writes,
    steps: result.steps.map(step => ({ ...step, verdict: step.state === 'passed' ? 'PASS' : step.state === 'failed' ? 'FAIL' : 'Not exercised' })),
    events: result.events, pictures: result.pictures, outstanding: result.outstanding }, null, 2);
}
__exports.runSmallConsultingTest = runSmallConsultingTest;
__exports.AUDIT_LIVE_STEPS = AUDIT_LIVE_STEPS;
__exports.auditTestPeriod = auditTestPeriod;
__exports.runAuditLiveTest = runAuditLiveTest;
__exports.auditLiveReport = auditLiveReport;
},
"run/live-groups.js": function (__require, __exports, document, window) {
'use strict';
const { addDays, compareDays, usDate, workingDays } = __require("../rules/dates.js");
const { valueKey } = __require("../rules/prepare.js");
const { compareCopies } = __require("../mysource/copy.js");
const { LOA_CLIENT, DNS_CLIENT } = __require("../mysource/checks.js");
const { testPart } = __require("./live-proof.js");
const GROUP_TITLES = {
  dateGuard: 'Open, empty period, allowed dates and Cancel paths',
  loaAdd: 'Short LOA and one-view picture', loaReplace: 'Long LOA, periods, picture and Retake',
  loaDelete: 'Delete No, then delete LOA', dnsEmpty: 'Empty-period production DNS Add',
  loaRestore: 'Failed-check recovery and no-op Restore', dnsAdd: 'Partial DNS Replace; retain LOA',
  bReplace: 'Production Exit in one save and long picture', dnsClear: 'Clear long DNS',
  aSetup: 'Six LOA days with different notes', aRefresh: 'Production note refresh',
  aCancel: 'Bulk Cancel and five-removal Cancel', aReduce: 'Production six-to-one reduction',
  sevenSetup: 'Extend to ten days and read-only Undo preview', sevenCancel: 'Seven-removal Cancel',
  sevenReduce: 'Production ten-to-three reduction', loaFallback: 'Own ten-day setup and eight removals in one save',
  sevenClear: 'Clear reduction entries', bLoa: 'Four-hour LOA and Undo preview',
  bDns: 'Four-hour DNS, filters and protected Undo preview', bDelete: 'Delete DNS; retain LOA',
  bRestore: 'Addition-only Restore and eligible read reuse', exitFallback: 'Early DNS and beyond-end Exit fallback',
  bClear: 'Clear mixed-hour entries', cSetup: 'Alternating exact LOA and DNS dates',
  cRemove: 'Production LOA-only delete; retain DNS', cSplitRestore: 'Restore three separate runs',
  cDelete: 'Clear alternating checkpoint entries', cRestore: 'Grouped Restore and fresh larger read',
  cleanup: 'Clear and independently prove the full period empty',
};
const GROUP_PROOFS = {
  initial: 'Exact professional, readable empty owned period, allowed and editable dates.',
  cancels: 'Add, Find and Go to Date Cancel saved nothing; owned rows unchanged.',
  saved: 'Saved dates, hours, settings and note presence checked across the owned period.',
  retained: 'Untouched rows kept their IDs, hours, settings and note presence.',
  onePicture: 'One picture holds the short leave with its current hover note.',
  twoPictures: 'Two dated views hold the longer leave with its current hover note.',
  periods: 'An offered shorter period was proved; 14 was restored and proved again.',
  retake: 'Actual Retake freshly reopened the same person; checkpoint and saved rows unchanged.',
  deleteNo: 'Delete No saved nothing; a new checked table supplied Delete Yes.',
  future: 'All-future targets were wholly owned; no outside target adopted or deleted.',
  production: 'The production apply path and its after-write checks completed.',
  exitOneSave: 'The shipped Exit Replace path used one saved Add and no Delete All.',
  refresh: 'The production in-place note refresh used one saved Edit Submit.',
  recovery: 'A named failed diagnostic check was followed by production recovery and a whole-period proof.',
  restoreNoNotes: 'Rebuilt checkpoint entries have no notes, as required for Restore.',
  noOp: 'A matching Restore made zero further writes.',
  mixedNotes: 'Separate saved notes supplied the mixed-note refresh form.',
  bulkCancel: 'Bulk Cancel and Edit Cancel left saved rows and IDs unchanged.',
  stageCancel: 'Staged removals were cancelled; the original saved rows and IDs remain.',
  reduction: 'One saved Edit Submit kept exactly the required LOA rows.',
  preview: 'Read-only Undo preview made no writes; no operator press was simulated.',
  stale: 'A stale preview was refused before any write; later-changed whole days were protected.',
  filters: 'Empty-day LOA and DNS queries each returned exactly their own rows.',
  mixedRefusal: 'Mixed-client rows were refused for Bulk note staging.',
  reuse: 'The unchanged post-Add proof was reused for the completed Restore run.',
  fresh: 'A smaller final Add proof was followed by a fresh completed-run and whole-Restore read.',
  fallback: 'The production fallback checked every deletion and its Normal Add.',
  exact: 'Exact alternating dates were selected and checked after each saved Add.',
  split: 'Unchanged interleaved DNS split Restore into three separately checked Adds.',
  empty: 'A separate final read proved the entire owned period empty.',
};
async function runLiveGroups({ page, window, email, result, step, known, confirm, observe, write, stage, proof }) {
  const days = workingDays(window.start, addDays(window.start, 4));
  const week = { start: days[0], end: days.at(-1) };
  const ten = workingDays(window.start, addDays(window.start, 11));
  const six = ten.slice(0, 6), sixWindow = { start: six[0], end: six.at(-1) };
  const sameDay = (a, b) => compareDays(a, b) === 0;
  const subset = (copy, dates) => ({ ...copy, days: copy.days.filter(row => dates.some(day => sameDay(day, row.day))) });
  const retained = (before, after) => before.every(old => {
    const row = after.days.find(row => row.id === old.id);
    return row && compareCopies({ days: [old] }, { days: [row] }).same && (row.notes > 0) === (old.notes > 0);
  });
  const verify = async (expected, { keep = [], notes = false, ids = false } = {}, saved = null) => {
    const after = saved || await page.read(window); observe(after);
    if (!compareCopies(expected, after).same || expected.days.length !== after.days.length
      || !retained(keep, after) || ids && !retained(expected.days, after)
      || notes && after.days.some(row => !(row.notes > 0))) throw new Error('The owned saved rows could not be proved.');
    confirm(after); return after;
  };
  const readEmpty = async () => {
    const after = await page.read(window); observe(after);
    if (after.days.length) throw new Error('The owned test period is not empty.');
    confirm(after); return after;
  };
  const add = async (client, dates, hours = 8, mode = 'Normal', notes = 'Snooze 2028 test grouped', exact = false) => {
    const before = known(); await page.assertSame(before, window);
    result.ledger.planned = dates.map(usDate);
    await page.add({ client, start: dates[0], end: dates.at(-1), ...(exact ? { dates } : {}), hoursPerDay: hours,
      billable: 'Non-Billable', utilization: 'No', notes }, mode, write);
    const after = await page.read(window); observe(after);
    const changed = row => dates.some(day => sameDay(day, row.day));
    const keep = before.days.filter(row => mode !== 'Replace' || !changed(row));
    const added = after.days.filter(row => !keep.some(old => old.id === row.id));
    if (after.days.length !== keep.length + dates.length || added.length !== dates.length || dates.some(day => {
      const rows = added.filter(row => sameDay(day, row.day));
      return rows.length !== 1 || valueKey(rows[0].client) !== valueKey(client) || rows[0].hours !== hours
        || valueKey(rows[0].billable) !== valueKey('Non-Billable') || valueKey(rows[0].utilization) !== 'no' || !(rows[0].notes > 0);
    })) throw new Error('The grouped Add could not be proved.');
    await verify(after, { keep }, after); proof('saved'); if (keep.length) proof('retained'); return after;
  };
  const clear = async (client = null) => {
    const before = known(); await page.clear(before, window, write, client);
    const after = await verify({ days: before.days.filter(row => client && row.client !== client) }, { keep: before.days.filter(row => client && row.client !== client) });
    proof('saved'); return after;
  };
  const restore = async (checkpoint, scope, keep = []) => {
    await page.assertSame(known(), window);
    const before = result.writes, restored = await page.restore(checkpoint, scope, write, known());
    if (!restored.same || restored.skippedLocked?.length || restored.skippedLater?.length || result.writes - before !== restored.added) throw new Error('The grouped Restore could not be proved.');
    if (!restored.after) throw new Error('No checked Restore copy was returned.');
    await verify(checkpoint, { keep: [...keep, ...restored.after.days] }); proof('saved'); if (keep.length) proof('retained'); return restored;
  };
  const apply = async (plan, options = {}, method = null) => {
    const applied = await page.diagnosticApply(known(), window, plan, options, write, stage);
    if (applied.notExercised) { proof('future', false); return null; }
    if (!applied.ok) throw new Error('Production apply did not prove the diagnostic change.');
    const after = await page.read(window); observe(after);
    if (!compareCopies(applied.after, after).same || !retained(applied.after.days, after)) throw new Error('The diagnostic apply changed before its owned-period check.');
    confirm(after); proof('production'); if (options.exit) proof('future');
    if (method) {
      if (applied.method !== method) throw new Error('The required production method was not exercised.');
      proof(method === 'Replace' ? 'fallback' : method === 'in-place refresh' ? 'refresh' : 'reduction');
    }
    return after;
  };
  const loaPlan = count => ({ action: 'add', loaStart: ten[0], loaEnd: ten[count - 1], notes: 'Snooze 2028 test current LOA' });
  const runsAfter = end => {
    const rows = known().days.filter(row => row.client === LOA_CLIENT && compareDays(row.day, end) > 0);
    return rows.length ? [{ start: rows[0].day, end: rows.at(-1).day, rows }] : [];
  };
  const picture = async (client, copy, notes, options = {}) => {
    const captured = await page.picture(client, copy, notes, { diagnostic: true, ...options });
    result.pictures.push({ kind: client === LOA_CLIENT ? 'loa' : 'dns', ...captured });
    proof(options.short ? 'onePicture' : 'twoPictures', captured.views === (options.short ? 1 : 2));
    if (options.retake) proof('retake', captured.retake === true || captured.retake?.productionRetake === true);
  };
  const longPicture = async (client, copy, notes, retake = false) => {
    const periods = await page.shorterPeriods(async () => { await picture(client, copy, notes, { retake }); return { proved: true }; });
    proof('periods', !periods?.notExercised);
    if (periods?.notExercised) { proof('twoPictures', false); if (retake) proof('retake', false); }
    await page.assertSame(known(), window);
  };
  const preview = async (checkpoint, after) => {
    const writes = result.writes;
    const value = await page.diagnosticPreview(checkpoint, window, after, known());
    if (writes !== result.writes) throw new Error('Undo preview attempted a write.');
    proof('preview'); return value;
  };
  await step('dateGuard', async () => {
    const initial = async (id, action) => { try { return await action(); } catch (error) { error.liveStep = id; throw error; } };
    await initial('open', () => page.open(email, window));
    await initial('empty', readEmpty);
    result.dateGuard = await page.dateGuard(window); await readEmpty();
    await initial('editable', () => page.editable(window)); proof('initial');
    await page.cancelAdd(known(), window); await page.cancelFind(known(), window); await page.cancelGoToDate(known(), window);
    await verify(known(), { ids: true }); proof('cancels'); result.cleanup = 'pending';
  });
  const shortDates = workingDays(window.start, addDays(window.start, 59));
  await step('loaAdd', async () => { const copy = await add(LOA_CLIENT, shortDates); await picture(LOA_CLIENT, copy, 'Snooze 2028 test grouped', { short: true }); });
  let checkpoint;
  await step('loaReplace', async () => {
    checkpoint = await add(LOA_CLIENT, workingDays(window.start, window.end), 8, 'Replace', 'Snooze 2028 test long LOA');
    await longPicture(LOA_CLIENT, checkpoint, 'Snooze 2028 test long LOA', true);
  });
  await step('loaDelete', async () => { await page.deleteNo(known(), window); await verify(known(), { ids: true }); await clear(); proof('deleteNo'); });
  const exitPlan = { action: 'dns', dnsStart: window.start, dnsEnd: window.end, notes: 'Snooze 2028 test current DNS' };
  await step('dnsEmpty', () => apply(exitPlan, { exit: true }));
  await step('loaRestore', async () => {
    const failed = !compareCopies(checkpoint, known()).same;
    if (failed) result.events.push({ type: 'diagnosticFailure', step: 'loaRestore', name: 'Owned checkpoint comparison', result: 'failed' });
    const restored = await page.diagnosticRecover(checkpoint, window, write, known());
    if (!restored.same || restored.skippedLocked?.length || restored.skippedLater?.length) throw new Error('Production recovery was not proved.');
    if (!restored.after) throw new Error('No checked recovery copy was returned.');
    const recovered = await verify(checkpoint, { keep: restored.after.days }); proof('recovery', failed);
    if (failed && recovered.days.some(row => row.notes !== 0)) throw new Error('Rebuilt diagnostic entries still have notes.');
    proof('restoreNoNotes', failed);
    const writes = result.writes;
    const noop = await page.restore(checkpoint, window, write, known());
    if (!noop.same || writes !== result.writes) throw new Error('Matching Restore was not a no-op.');
    await verify(known(), { ids: true }); proof('noOp');
  });
  await step('dnsAdd', () => add(DNS_CLIENT, shortDates, 8, 'Replace'));
  await step('bReplace', async () => {
    const rows = known().days, options = { exit: true, exitRuns: [{ start: window.start, end: window.end, rows, future: true }] };
    const before = result.writes, eventStart = result.events.length;
    if (await apply(exitPlan, options)) {
      const saves = result.events.slice(eventStart).filter(row => row.type === 'write');
      if (result.writes - before !== 1 || saves.length !== 1 || saves[0].origin !== 'Add Assignment') throw new Error('The one-save Exit path was not proved.');
      proof('exitOneSave'); await longPicture(DNS_CLIENT, known(), exitPlan.notes);
    }
    else proof('twoPictures', false);
  });
  await step('dnsClear', () => clear());
  await step('aSetup', async () => {
    await add(LOA_CLIENT, six.slice(0, 5), 8, 'Normal', 'Snooze 2028 test old note A');
    checkpoint = await add(LOA_CLIENT, six.slice(5), 8, 'Normal', 'Snooze 2028 test old note B');
    result.ledger.checkpoints.push({ block: 'A', dates: checkpoint.days.map(row => usDate(row.day)), rows: checkpoint.days.length }); proof('mixedNotes');
  });
  await step('aRefresh', () => apply(loaPlan(6), {}, 'in-place refresh'));
  await step('aCancel', async () => {
    const original = known(); await page.cancelBulk(original, sixWindow, 'Snooze 2028 test discarded bulk note'); proof('bulkCancel');
    if (!await page.cancelStage(original, sixWindow, 'Snooze 2028 test cancelled', original.days.slice(1), stage)) throw new Error('Five-removal Cancel was not proved.');
    await verify(original, { ids: true }); proof('stageCancel');
  });
  await step('aReduce', () => apply(loaPlan(1), { runs: runsAfter(ten[0]) }, 'combined reduction'));
  await step('sevenSetup', async () => { await add(LOA_CLIENT, ten.slice(1)); await preview(checkpoint, known()); });
  const tenCopy = known(), tenWindow = { start: ten[0], end: ten.at(-1) }, remove = tenCopy.days.filter(row => compareDays(row.day, ten[2]) > 0);
  await step('sevenCancel', async () => {
    if (!await page.cancelStage(known(), tenWindow, 'Snooze 2028 test seven Cancel', remove, stage, { liveSeven: true })) throw new Error('Seven-removal Cancel was not proved.');
    await verify(tenCopy, { ids: true }); proof('stageCancel');
  });
  await step('sevenReduce', () => apply(loaPlan(3), { runs: runsAfter(ten[2]) }, 'combined reduction'));
  await step('loaFallback', async () => {
    await add(LOA_CLIENT, ten.slice(3));
    const before = result.writes, eventStart = result.events.length;
    await apply(loaPlan(2), { runs: runsAfter(ten[1]) }, 'combined reduction');
    const saves = result.events.slice(eventStart).filter(row => row.type === 'write');
    if (result.writes - before !== 1 || saves.length !== 1 || saves[0].origin !== 'Edit Assignments Submit') throw new Error('The one-save LOA reduction was not proved.');
  });
  await step('sevenClear', () => clear());
  const empty = known(); let stale;
  await step('bLoa', async () => { await add(LOA_CLIENT, days, 4); stale = await preview(empty, known()); });
  const loa = known();
  await step('bDns', async () => {
    checkpoint = await add(DNS_CLIENT, days, 4);
    const filters = await page.diagnosticFilters(known(), window);
    if (filters.proofs.length !== 2 || filters.proofs.some(row => row.rows !== 5 || !row.controlsProved || !row.emptyDayRoute)) throw new Error('The Find client subsets were not proved.');
    proof('filters'); proof('mixedRefusal', filters.mixedRowsEligible === false);
    const refusal = await page.diagnosticStalePreview(empty, window, stale, known());
    if (!refusal.refused || refusal.writes !== 0) throw new Error('The stale preview was not refused.');
    const protectedPreview = await preview(empty, loa);
    if (protectedPreview.skippedLater.length !== 5 || protectedPreview.changedDays.length) throw new Error('Later changed whole days were not protected.');
    proof('stale');
  });
  await step('bDelete', () => clear(DNS_CLIENT));
  await step('bRestore', async () => { const restored = await restore(checkpoint, week, loa.days); if (restored.added !== 1) throw new Error('Addition-only Restore was not one Add.'); proof('reuse', result.events.some(row => row.step === 'bRestore' && row.type === 'restoreRead' && row.purpose === 'completedRun' && row.reused)); });
  await step('exitFallback', async () => {
    const before = known(), early = before.days.filter(row => sameDay(row.day, days[0]) && row.client === DNS_CLIENT), later = before.days.filter(row => compareDays(row.day, days[1]) >= 0);
    const options = { exit: true, earlyDns: early, exitRuns: [{ start: days[0], end: days[0], rows: early, client: DNS_CLIENT }, { start: days[1], end: window.end, rows: later, future: true }] };
    const after = await apply({ action: 'dns', dnsStart: days[1], dnsEnd: days[3], notes: 'Snooze 2028 test fallback DNS' }, options);
    if (after && !retained(before.days.filter(row => sameDay(row.day, days[0]) && row.client === LOA_CLIENT), after)) throw new Error('Fallback changed retained Monday LOA.');
    if (after) { proof('fallback'); proof('retained'); }
  });
  await step('bClear', () => clear());
  const loaDates = days.filter((_, i) => i % 2 === 0), dnsDates = days.filter((_, i) => i % 2 === 1); let capability;
  await step('cSetup', async () => {
    capability = await page.exactDates(days, 8);
    for (const [client, selected] of [[LOA_CLIENT, loaDates], [DNS_CLIENT, dnsDates]]) {
      if (capability.exact) await add(client, selected, 8, 'Normal', 'Snooze 2028 test exact', true);
      else for (const date of selected) await add(client, [date]);
    }
    checkpoint = known(); result.ledger.checkpoints.push({ block: 'C', dates: checkpoint.days.map(row => usDate(row.day)), rows: checkpoint.days.length }); proof('exact', capability.exact);
  });
  await step('cRemove', async () => {
    const before = known(), rows = before.days.filter(row => row.client === LOA_CLIENT);
    const after = await page.diagnosticRemoveLeave(before, window, { start: days[0], end: days.at(-1), rows }, write);
    await verify({ days: before.days.filter(row => row.client !== LOA_CLIENT) }, { keep: before.days.filter(row => row.client !== LOA_CLIENT) }, after); proof('retained'); proof('production');
  });
  await step('cSplitRestore', async () => { const keep = known().days; const restored = await restore(checkpoint, week, keep); if (restored.added !== 3) throw new Error('Interleaved Restore did not use three runs.'); proof('split'); });
  await step('cDelete', () => clear());
  await step('cRestore', async () => { const restored = await restore(checkpoint, week); result.grouping = { setupExact: capability.exact, restoreAdds: restored.added, grouped: restored.added === 2 }; proof('exact', restored.added === 2); proof('fresh', result.events.some(row => row.step === 'cRestore' && row.type === 'restoreRead' && row.purpose === 'completedRun' && row.reused === false)); });
  await step('cleanup', async () => { await clear(); await testPart('Cleanup unconfirmed.', readEmpty); proof('empty'); });
}
__exports.GROUP_TITLES = GROUP_TITLES;
__exports.GROUP_PROOFS = GROUP_PROOFS;
__exports.runLiveGroups = runLiveGroups;
},
"run/live-proof.js": function (__require, __exports, document, window) {
'use strict';
const LIVE_TEST_PARTS = new Set(['Saved rows failed.', 'Retained rows failed.', 'Week empty check failed.', 'Whole-period empty check failed.', 'Hover note failed.', 'Picture failed.', 'Cleanup unconfirmed.']);
async function testPart(part, action) {
  try { return await action(); } catch (error) { if (!LIVE_TEST_PARTS.has(error.livePart)) error.livePart = part; throw error; }
}
const SMALL_LIVE_STEPS = {
  smallOpen: 'Open and read', smallAdd: 'Add LOA, DNS and blank-note A&A DNS',
  smallChange: 'Replace, combined Edit Submit and Cancel', smallDelete: 'Delete around a kept DNS day',
  smallPicture: 'Hover picture and plain A&A picture', smallUndo: 'Undo from the backup', cleanup: 'Clear and check empty',
};
const SMALL_TAX_STEPS = {
  taxEmpty: 'Open, read and check empty span', taxAdd: 'Add LOA, DNS, Holiday and Replace',
  taxHours: 'Lower and restore saved Hours', taxPartial: 'Partial-week apply and Undo',
  taxClear: 'Clear and check empty span', taxPast: 'Optional: restore this week’s past Monday',
};
const TAX_LIVE_STEPS = {
  taxEmpty: 'Check empty month and weekly view',
  taxFind: 'Find one day and a whole week',
  taxAdd: 'Check weekly and one-day Add',
  taxHoliday: 'Replace and re-add Holiday',
  taxHours: 'Lower and restore saved Hours',
  taxPartial: 'Partial first and last weeks, then Undo',
  taxClear: 'Clear entries and check empty month',
  taxPast: 'Lower and restore this week’s past Monday',
};
const TAX_LIVE_FINDINGS = new Set([
  'One-day Find: Monday seed only.', 'Wednesday Find: empty.', 'Whole-week Find: Monday seed only.',
  'Weekly Add: hours on Monday.', 'One-day Add: hours on Wednesday.',
  'Replace cleared Holiday.', 'Holiday re-added; weekly total checked.',
  'Hours lowered and restored; note count unchanged.',
  'DNS stand-in lowered in both partial weeks.', 'Normal Tax apply and Undo checked.',
  'Month empty and checked.', 'Past Monday restored; note count unchanged.',
  'Span empty and checked.',
]);
function smallTestPeriod(today) {
  const window = { start: { y: 2028, m: 5, d: 1 }, end: { y: 2028, m: 7, d: 21 } };
  if (!today || window.start.y * 10000 + window.start.m * 100 + window.start.d <= today.y * 10000 + today.m * 100 + today.d)
    throw new Error('The live test period must still be in the future.');
  return window;
}
function taxTestPeriod(today, { small = false } = {}) {
  const window = { start: { y: 2028, m: 4, d: 3 }, end: small ? { y: 2028, m: 6, d: 23 } : { y: 2028, m: 4, d: 28 } };
  const number = day => day.y * 10000 + day.m * 100 + day.d;
  if (!today || number(window.start) <= number(today)) throw new Error('The Tax test month must still be in the future.');
  return window;
}
function taxLiveReport(result) {
  const states = { passed: 'PASS', failed: 'FAIL', notExercised: 'not exercised' };
  return JSON.stringify({ kind: 'Snooze Tax live test', period: result.design === 'tax5' ? 'April 3–June 23, 2028' : 'April 2028',
    state: result.state === 'complete' ? 'PASS' : 'FAIL',
    cleanup: ['empty', 'notNeeded', 'unconfirmed'].includes(result.cleanup) ? result.cleanup : 'unconfirmed',
    steps: Object.entries(result.design === 'tax5' ? SMALL_TAX_STEPS : TAX_LIVE_STEPS).map(([id, title], index) => {
      const step = result.steps?.find(step => step.id === id);
      return { step: index + 1, title, result: states[step?.state] || 'not exercised',
        findings: (step?.findings || []).filter(word => TAX_LIVE_FINDINGS.has(word)) };
    }) }, null, 2);
}
__exports.LIVE_TEST_PARTS = LIVE_TEST_PARTS;
__exports.testPart = testPart;
__exports.SMALL_LIVE_STEPS = SMALL_LIVE_STEPS;
__exports.SMALL_TAX_STEPS = SMALL_TAX_STEPS;
__exports.TAX_LIVE_STEPS = TAX_LIVE_STEPS;
__exports.TAX_LIVE_FINDINGS = TAX_LIVE_FINDINGS;
__exports.smallTestPeriod = smallTestPeriod;
__exports.taxTestPeriod = taxTestPeriod;
__exports.taxLiveReport = taxLiveReport;
},
"mysource/live-test.js": function (__require, __exports, document, window) {
'use strict';
const { stageNotes, stageRemoval } = __require("./note-stage.js");
const { createLiveGroups } = __require("./live-groups.js");
const { createLivePictures } = __require("./live-pictures.js");
const { PageError, setBatchGuard, shown, click, settled, text, waitFor, WAIT, closeWindow, cleanupAfter } = __require("./dom.js");
const { calendarView, openPerson, personIdentity, checkPersonIdentity, requireSchedulePage, scheduleFacts, findAssignments, findAssignmentsRange, readEditTable, closeEdit, setupView, pageReady } = __require("./schedule.js");
const { sessionExpired, cancelBatchWindows } = __require("./batch.js");
const { copyWindow, compareCopies, dayOf, entriesToAdd, knownAssignmentRows } = __require("./copy.js");
const { createEditability } = __require("./editability.js");
const { calendarDates, showDate } = __require("./calendar.js");
const { addAssignment, deleteAll, deleteRange, refreshNotes, preflightDates, setAssignmentHours, splitDeleteWeeks, saveStagedNotes } = __require("./write.js");
const { restoreWindow } = __require("./restore.js");
const { addDays, compareDays, mondayOf, todayOf, usDate, workingDays } = __require("../rules/dates.js");
const { readSite, isTaxPage } = __require("./site.js");
const { valueKey, addressCount } = __require("../rules/prepare.js");
const { entryKind } = __require("../rules/entries.js");
const { planTaxWeeks } = __require("../rules/tax-weeks.js");
const { apply, prepare, restore, BACKUP_KIND } = __require("../run/work.js");
const { taxRestorePlan } = __require("./tax-restore.js");
const { taxTestPeriod, smallTestPeriod } = __require("../run/live-proof.js");
const { termDayOf } = __require("../rules/shared.js");
const { setRunRecorder, timedRun, recordRun, STAGES, WINDOWS, FIELDS, REASON_CODES } = __require("../core/run-records.js");
const { auditTestPeriod } = __require("../run/audit-live-test.js");
const { decideExit } = __require("../rules/exit.js");
const { readNotification } = __require("../servicenow/tickets.js");
const { capturePerson } = __require("../files/batch-outputs.js");
const { lastPicture } = __require("../files/capture.js");
const inside = (day, window) => day && compareDays(day, window.start) >= 0 && compareDays(day, window.end) <= 0;
const editOwnership = new WeakMap();
const taxViewLabel = active => {
  const labels = ['Month','Week','Day'].filter(word => active.some(node => text(node).toLowerCase() === word.toLowerCase()));
  return labels.length === 1 ? labels[0] : 'unknown';
};
function liveDiagnosticState() {
  const kinds = ['Find Assignments','Edit Assignment','Bulk Edit Assignments','Add Assignment','No. of Periods','Go to Date','View Notes'];
  let view = 'unknown';
  try {
    const node = calendarView();
    view = isTaxPage() ? taxViewLabel([...document.querySelectorAll('button.fc-state-active, button.active, button[aria-pressed=true]')].filter(shown))
      : node?.matches('.fc-weeklyTimeline-view') ? 'Custom' : node?.matches('.fc-month-view') ? 'Month' : 'unknown';
  } catch {   }
  const windows = [...document.querySelectorAll('.modal, [role=dialog]')].map(node => {
    const title = text(node.querySelector('.modal-title, .bootbox-title, h4, [role=heading]'));
    return { kind:node.matches('.bootbox-confirm') ? 'Delete confirmation' : kinds.includes(title) ? title : 'Schedule window', visible:shown(node) };
  });
  const periodWindows = [...document.querySelectorAll('.modal, [role=dialog]')].filter(node => text(node.querySelector('.modal-title, h4')) === 'No. of Periods' && shown(node));
  let periods = null;
  if (periodWindows.length === 1) {
    const control = periodWindows[0].querySelector('select, input[type=number], input[type=text]');
    const raw = control?.tagName === 'SELECT' ? text(control.selectedOptions?.[0]) || control.value : control?.value;
    if (/^\d+$/.test(raw || '')) periods = Number(raw);
  }
  const edits = [...document.querySelectorAll('#editEventGridModal')].slice(0,3).map(node => {
    const display=node.ownerDocument.defaultView.getComputedStyle(node).display;
    return {open:node.getAttribute('aria-hidden')!=='true' && openEdits().includes(node) ? 'yes' : 'no',
      shown:shown(node) ? 'yes' : 'no',display:['block','none'].includes(display) ? display : 'other',
      rows:node.querySelectorAll('#editGrid tbody tr[data-id]').length,owned:editOwnership.get(node) || 'unknown'};
  });
  return { view, periods, windows, edits, covers:[...document.querySelectorAll('div.loading, .blockUI.blockOverlay, .loading-overlay, .modal-backdrop')].filter(shown) };
}
function liveControlState() {
  const events = node => {
    try {
      const data = window.jQuery?._data?.(node, 'events');
      return data ? Object.fromEntries(['click', 'mousedown', 'mouseup', 'hide', 'hidden'].map(key => [key, data[key]?.length || 0])) : null;
    } catch { return null; }
  };
  const windows = [['.bootbox-confirm', 'Delete confirmation'], ['#editEventGridModal', 'Edit Assignment'],
    ['#FindAssignmentsModal', 'Find Assignments'], ['#addShiftEventModal', 'Add Assignment']];
  const active = [...document.querySelectorAll('button.fc-state-active, button.active, button[aria-pressed=true]')].filter(shown);
  const view = isTaxPage()
    ? taxViewLabel(active)
    : ['Custom','Month','Week','Time'].find(word => active.some(node => text(node) === word)) || 'unknown';
  return { view, calendar: calendarDates(), windows: windows.flatMap(([selector, kind]) => [...document.querySelectorAll(selector)].map(modal => ({
    kind, visible: shown(modal), fading: modal.classList.contains('fade'), showing: modal.classList.contains('show'),
    handlers: events(modal), rows: modal.querySelectorAll('td.column-start').length,
    buttons: [...modal.querySelectorAll('button')].map(button => {
      const words = button.textContent.trim(); const rect = button.getBoundingClientRect();
      const top = rect.width && rect.height && document.elementFromPoint?.(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { label: ['Yes', 'No', 'Cancel', 'Add', 'Close', 'Submit'].includes(words) ? words : 'Other',
        visible: shown(button), disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
        pointer: ['none', 'auto'].includes(window.getComputedStyle(button).pointerEvents) ? window.getComputedStyle(button).pointerEvents : 'other',
        receivesPointer: top ? top === button || button.contains(top) : null, handlers: events(button) };
    }),
  }))), covers: [...document.querySelectorAll('div.loading, .blockUI.blockOverlay, .loading-overlay, .modal-backdrop')].filter(shown).map(node => ({
    confirmation: !!node.closest('.bootbox-confirm'), edit: !!node.closest('#editEventGridModal'),
    interceptsPointer: window.getComputedStyle(node).pointerEvents !== 'none',
  })), documentHandlers: events(document) };
}
const openEdits = () => [...document.querySelectorAll('#editEventGridModal')].filter(node =>
  node.isConnected && (node.classList.contains('show') || node.classList.contains('in'))
  && node.ownerDocument.defaultView.getComputedStyle(node).display !== 'none');
async function ownedDeleteEdit(expectedFor, matches) {
  const edits = [...document.querySelectorAll('#editEventGridModal')].filter(node=>node.isConnected), owned=[];
  for (const edit of edits) editOwnership.set(edit,'unknown');
  for (const edit of edits) {
    const grids=edit.querySelectorAll('#editGrid');
    if (grids.length!==1) {
      if (grids.length>1) throw new PageError('The A&A delete table is not unique.');
      editOwnership.set(edit,'no'); continue;
    }
    const expected=expectedFor(edit);
    if (!expected || !expected.rows.days.length && !findAssignmentsRange(edit)) { editOwnership.set(edit,'no'); continue; }
    const actual={days:(await readEditTable(edit)).map(row=>({...row,day:dayOf(row.date)}))};
    const same=matches(expected.rows,actual);
    editOwnership.set(edit,same ? 'yes' : 'no');
    if (same) owned.push({edit,...expected});
  }
  if (owned.length!==1)
    throw new PageError('The A&A delete table is not unique.');
  return owned[0];
}
async function cancelLiveWindows() {
  try {
    for (const confirmation of [...document.querySelectorAll('.bootbox-confirm')].filter(shown).reverse())
      await closeWindow(confirmation, 'confirmation window');
    for (const edit of openEdits().reverse()) await closeEdit(edit);
    await cancelBatchWindows();
    if (openEdits().length) throw new PageError('Edit Assignment could not be closed safely.');
    await pageReady('live test cleanup');
  } catch (error) { error.pageBlocked = true; throw error; }
}
function liveTestPage(options = {}) {
  const page = createLiveTestPage(options);
  for (const [name, action] of Object.entries(page)) {
    if (typeof action !== 'function') continue;
    page[name] = function (...args) {
      const value = action.apply(this, args);
      if (!value?.then) return value;
      return value.catch(async error => {
        if (error.stage === 'delete' && openEdits().length || [...document.querySelectorAll('.bootbox-confirm')].some(shown))
          await cleanupAfter(error, cancelLiveWindows);
        throw error;
      });
    };
  }
  page.restartConnection = () => liveTestPage(options);
  page.connectionCleanup = write => options.mode === 'tax' ? page.taxCleanup(write, {})
    : page.auditCleanup ? page.auditCleanup(write, {}) : page.clearForConnection(write);
  return page;
}
function createLiveTestPage({ today = todayOf(), mode = 'consulting', small = false } = {}) {
  if (mode === 'audit') return auditLivePage(today);
  if (mode === 'tax') return taxLivePage(today, small);
  if (small) return auditLivePage(today, true);
  let identity = null, scope = null, observations = null, owningStep = null, verifiedOwnership = null, pendingSave = null;
  let openedEmail = null, liveGuardRelease = null;
  const check = probe => {
    requireSchedulePage(probe);
    if (sessionExpired()) throw Object.assign(new PageError('Session expired.'), { session: true });
    if (identity) checkPersonIdentity(identity, 'identity check', probe);
  };
  const checked = () => waitFor(() => { check(); return true; }, 'the person on the calendar to settle', WAIT.person);
  const bounded = async window => {
    await checked();
    if (!scope || !inside(window.start, scope) || !inside(window.end, scope) || compareDays(window.start, window.end) > 0) throw new PageError('Outside the approved test week.');
  };
  const read = async window => { await bounded(window); const copy = await copyWindow(window); await checked(); recordRun({type:'diagnosticRead',purpose:'ownership',scope:{start:usDate(window.start),end:usDate(window.end)},reused:false}); return copy; };
  const assertSame = async (expected, window) => {
    if (!expected) throw new PageError('No verified test copy.');
    const actual = await read(window);
    if (!compareCopies(expected, actual).same || actual.days.some(row=>!expected.days.some(old=>old.id===row.id)) || actual.days.some((row, i) => (row.notes > 0) !== (expected.days[i]?.notes > 0))) {
      throw new PageError('The test schedule changed before the next action.');
    }
    verifiedOwnership = expected;
  };
  const finishSave = () => {
    if (pendingSave) { pendingSave.event.timings.seconds = (Date.now() - pendingSave.started) / 1000; pendingSave = null; }
  };
  const markWrite = async (origin, onWrite) => {
    await checked(); finishSave();
    const event = { type: 'write', origin, step: owningStep, savedAttempt: 1, controls: liveControlState(), timings: { seconds: null, waitSeconds: null, ceiling: null, result: 'unconfirmed' } };
    observations?.push(event); pendingSave = { event, started: Date.now() }; await onWrite();
  };
  const context = { bounded, checked, identity: () => identity, scope: () => scope, email: () => openedEmail,
    assertSame, read, markWrite, step: () => owningStep, today,
    withRetake: async operation => {
      await checked(); liveGuardRelease?.(); liveGuardRelease = null;
      try { return await operation(); }
      finally { liveGuardRelease = setBatchGuard(check); await checked(); }
    } };
  context.withReopen = context.withRetake;
  const diagnosticPictures = createLivePictures(context);
  return {
    ...createLiveGroups(context),
    diagnosticState: liveDiagnosticState,
    observe: liveControlState,
    finishStep: finishSave,
    setStep(id) { owningStep = id; },
    async begin(events) {
      liveGuardRelease = setBatchGuard(check);
      observations = events;
      const stop = setRunRecorder(event => {
        const safe = { type: ['begin', 'step', 'error', 'miss', 'window', 'field', 'loading', 'waiting', 'slow', 'wait', 'delay', 'restoreRead', 'restoreComparison', 'diagnosticRead', 'findStep'].includes(event.type) ? event.type : 'observation' };
        if (STAGES.has(event.stage) || event.stage === 'move calendar') safe.stage = event.stage;
        if (WINDOWS.has(event.name) || FIELDS.has(event.name)) safe.name = event.name;
        if (event.type === 'findStep' && ['open', 'filters', 'settle', 'submit', 'table'].includes(event.name)) safe.name = event.name;
        if (REASON_CODES.has(event.code)) safe.code = event.code;
        if (typeof event.ok === 'boolean') safe.ok = event.ok;
        if (typeof event.done === 'boolean') safe.done = event.done;
        if (Number.isFinite(event.seconds)) safe.seconds = event.seconds;
        safe.step = owningStep;
        for (const key of ['rows','selected']) if (Number.isInteger(event[key]) && event[key]>=0) safe[key]=event[key];
        if (Number.isInteger(event.proof) && event.proof > 0) safe.proof = event.proof;
        if (event.type === 'delay') {safe.ceiling=null; if(Number.isFinite(event.duration)) safe.duration=event.duration;}
        if (Number.isFinite(event.ceiling) && event.ceiling >= 0) safe.ceiling = event.ceiling;
        if (['passed', 'refused', 'failed'].includes(event.result)) safe.result = event.result;
        if (['afterAdd', 'completedRun', 'wholeRestore', 'ownership'].includes(event.purpose)) safe.purpose = event.purpose;
        if (typeof event.reused === 'boolean') safe.reused = event.reused;
        if (event.scope && [event.scope.start, event.scope.end].every(value => /^\d{2}\/\d{2}\/2028$/.test(value))) safe.scope = { start: event.scope.start, end: event.scope.end };
        if (Number.isFinite(event.saveSeconds) && event.saveSeconds >= 0) {
          safe.saveSeconds = event.saveSeconds;
          if (pendingSave) {
            Object.assign(pendingSave.event.timings, { seconds: (Date.now() - pendingSave.started) / 1000, waitSeconds: event.saveSeconds, ceiling: safe.ceiling ?? null, result: safe.result || 'unconfirmed' });
            pendingSave = null;
          }
        }
        events.push(safe);
      });
      return () => { finishSave(); stop(); liveGuardRelease?.(); liveGuardRelease = null; observations = null; };
    },
    async open(email, window) {
      scope = window; openedEmail = email; verifiedOwnership = null; await openPerson(email); identity = personIdentity(); await checked();
      await timedRun('move calendar', () => showDate(window.start, { cellProof: true })); await checked();
    },
    read, assertSame,
    async clearForConnection(write) {
      if (!scope || !identity) return 'notNeeded';
      const actual = await read(scope);
      if (!actual.days.length) return 'empty';
      if (!verifiedOwnership) return 'unconfirmed';
      try { await assertSame(verifiedOwnership, scope); }
      catch (error) { if (error.identityChanged || error.session || error.connectionLost) throw error; return 'unconfirmed'; }
      await this.clear(verifiedOwnership, scope, write);
      return (await read(scope)).days.length ? 'unconfirmed' : 'empty';
    },
    async editable(window) {
      await bounded(window); const text = String(scheduleFacts().termDate || '').trim();
      const term = text ? termDayOf(text) : null;
      if (text && !term) throw new PageError('Unreadable Term Date.');
      const permissions = createEditability({ today, term, identity, move: day => showDate(day, { cellProof: true }) });
      const through = await permissions.through(window.end, window.start);
      if (!through || compareDays(through, window.end) !== 0) throw new PageError('The test week is greyed out.');
    },
    async add(entry, mode, onWrite, onProgress = () => {}) {
      await bounded(entry); await addAssignment(entry, mode, { move: day => showDate(day, { cellProof: true }),
        onProgress,
        onWrite: async () => { await bounded(entry); await markWrite('Add Assignment', onWrite); } }); await checked();
    },
    async clear(expected, window, onWrite, client = null) {
      await assertSame(expected, window);
      const edit = await findAssignments({ ...window, ...(client ? { clients: [client] } : {}) });
      try {
        const actual = { days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) };
        if (actual.days.some(row => !inside(row.day, window)) || !compareCopies({ days: expected.days.filter(row => !client || row.client === client) }, actual).same || actual.days.some(row=>!expected.days.some(old=>old.id===row.id))) throw new PageError('The delete table differs from the verified test copy.');
        if (!actual.days.length) { await closeEdit(edit); return; }
      } catch (error) { await closeEdit(edit); throw error; }
      await deleteAll(edit, { onWrite: () => markWrite('Delete All', onWrite) }); await checked();
    },
    async restore(checkpoint, window, onWrite, verifiedBefore = verifiedOwnership) {
      await bounded(window);
      if (checkpoint.days.some(row => !inside(row.day, scope))) throw new PageError('Checkpoint outside the test week.');
      if (!verifiedBefore) throw new PageError('No verified test copy.');
      const verifyBefore = async actual => {
        await bounded(actual.window);
        const expected = { days: verifiedBefore.days.filter(row => inside(row.day, actual.window)) };
        const ids = new Set(actual.days.map(row => row.id));
        if (!compareCopies(expected, actual).same || ids.size !== actual.days.length || actual.days.some(row => {
          const old = expected.days.find(one => one.id === row.id);
          return !old || !compareCopies({ days: [old] }, { days: [row] }).same || (row.notes > 0) !== (old.notes > 0);
        })) throw Object.assign(new PageError('The test schedule changed before Restore. These days were left unchanged.'), { testProblem: 'restoreChanged' });
      };
      return restoreWindow({ ...checkpoint, window }, { fullReport: true, today, identity,
        verifyBefore,
        move: day => showDate(day, { cellProof: true }), onWrite: () => markWrite('Restore', onWrite) });
    },
    async dateGuard(window) {
      await bounded(window);
      const probes = [];
      const probe = async (label, days) => {
        let limits = null;
        try {
          const capability = await preflightDates(days, { anchor: scope.start, move: day => showDate(day, { cellProof: true }), onBounds: value => { limits = value; } });
          probes.push({ label, result: 'allowed', limits }); return capability;
        } catch (error) {
          probes.push({label,result:limits?'refused':'unreadable',limits}); error.guardEvidence={probes}; throw error;
        } finally { await checked(); }
      };
      const capability = await probe('requiredDates', workingDays(window.start, window.end));
      return { probes, exact: capability.exact };
    },
    async exactDates(dates, hours) {
      for (const day of dates) await bounded({ start: day, end: day });
      return preflightDates(dates, { anchor: scope.start, move: day => showDate(day, { cellProof: true }), entries: [{ dates, hoursPerDay: hours }] });
    },
    async cancelStage(expected, window, notes, remove, onStage, { liveSeven = false } = {}) {
      await bounded(window); await assertSame(expected, window);
      const prepared = await stageNotes(window, expected, notes, { remove, onStage, diagnose: true, liveSeven: liveSeven === true && ['sevenCancel','sevenReduce'].includes(owningStep) });
      if (!prepared) return false;
      try {
        await settled(prepared.edit);
        const cancels = [...prepared.edit.querySelectorAll('button')].filter(button => shown(button) && text(button) === 'Cancel' && !button.disabled && button.getAttribute('aria-disabled') !== 'true');
        if (cancels.length !== 1) throw new PageError('Cancel did not close the staged window. Nothing was saved.');
        onStage('cancel'); await click(cancels[0]);
        await waitFor(() => !prepared.edit.isConnected || !shown(prepared.edit), 'Cancel to close the staged Edit Assignments window', WAIT.window);
        await checked();
      } catch(error) {
        error.pageBlocked=true;
        if (!error.identityChanged && !error.session) error.testProblem='cancelUnconfirmed';
        throw error;
      }
      return true;
    },
    async picture(client, copy, notes, options = {}) {
      return diagnosticPictures.diagnosticPicture(client, copy, notes, options);
    },
  };
}
function taxLivePage(today, small = false) {
  const LOA = 'Leave of Absence (LOA)', DNS = 'Do Not Schedule (DNS)', HOLIDAY = 'HOLIDAY';
  const fixedNote = 'Snooze Tax live test';
  const day = d => ({ y: 2028, m: 4, d });
  const longDns = { start: day(3), end: { y: 2028, m: 5, d: 12 } };
  const longLoa = { start: { y: 2028, m: 5, d: 15 }, end: { y: 2028, m: 6, d: 23 } };
  const sameDay = (a, b) => compareDays(a, b) === 0;
  const rowAt = (client, day, hours, notes = 0) => ({ day, date: usDate(day), client, hours, notes,
    wbs: '', jobCode: '', billable: '', utilization: '', pricingId: '', assignCode: '', assignCode2: '' });
  let identity = null, scope = null, email = null, release = null, started = false, known = null, pending = null;
  let seedIds = [], pastOriginal = null, pastPending = null;
  const matches = (model, actual) => {
    if (!model || !actual || !compareCopies(model, actual).same || new Set(actual.days.map(row => row.id)).size !== actual.days.length) return false;
    const used = new Set();
    for (const wanted of model.days) {
      const row = actual.days.find(row => !used.has(row.id) && (!wanted.id || wanted.id === row.id)
        && wanted.notes === row.notes && compareCopies({ days: [wanted] }, { days: [row] }).same);
      if (!row) return false;
      used.add(row.id);
    }
    return true;
  };
  const check = probe => {
    requireSchedulePage(probe);
    if (sessionExpired()) throw Object.assign(new PageError('Session expired.'), { session: true });
    if (!isTaxPage()) throw new PageError('Tax live test requires Tax MySource.');
    if (identity) checkPersonIdentity(identity, 'identity check', probe);
  };
  const bounded = window => {
    check();
    if (!scope || !inside(window.start, scope) || !inside(window.end, scope) || compareDays(window.start, window.end) > 0) throw new PageError('Outside the Tax test month.');
  };
  const read = async (window = scope) => { bounded(window); const copy = await copyWindow(window); check(); return copy; };
  const assertKnown = async () => {
    const actual = await read();
    if (!matches(known, actual)) throw new PageError('The owned Tax test rows changed.');
    return actual;
  };
  const resolve = async (mustBeAfter = false) => {
    const actual = await read();
    if (!pending ? !matches(known, actual) : !matches(pending.after, actual) && (mustBeAfter || !matches(pending.before, actual))) throw new PageError('Tax live save ownership is unconfirmed.');
    if (pending && matches(pending.after, actual)) recordRun({type:'writeProof',ok:true,whole:true});
    known = actual; pending = null; return actual;
  };
  const sequence = async (states, action, onWrite) => {
    await assertKnown(); let index = 0;
    const write = async () => {
      bounded(scope);
      if (index >= states.length - 1) throw new PageError('Unplanned Tax diagnostic write.');
      pending = { before: { days: states[index] }, after: { days: states[++index] } };
      await onWrite();
    };
    const value = await action(write);
    if (index !== states.length - 1) throw new PageError('Tax diagnostic write was not exercised.');
    await resolve(true); return value;
  };
  const change = (rows, action, write) => sequence([known.days, rows], action, write);
  const add = async (client, start, end, hours, mode, notes, write) => {
    bounded({ start, end });
    const retained = mode === 'Replace' ? known.days.filter(row => !inside(row.day, { start, end })) : known.days;
    const added = [];
    for (let date = start; compareDays(date, end) <= 0; date = addDays(mondayOf(date), 7)) added.push(rowAt(client, date, hours, notes ? 1 : 0));
    await change([...retained, ...added], notice => addAssignment({ client, start, end, hoursPerWeek: hours, notes }, mode, { onWrite: notice }), write);
  };
  const hours = async (target, value, write) => {
    bounded({ start: target.day, end: target.day });
    await change(known.days.map(row => row.id === target.id ? { ...row, hours: value } : row),
      notice => setAssignmentHours(scope, known, target, value, { restoring: value > target.hours, onWrite: notice }), write);
  };
  const clear = async write => {
    await assertKnown();
    if (!known.days.length) return;
    await change([], async notice => {
      const edit = await findAssignments(scope);
      try {
        const actual = { days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) };
        if (!matches(known, actual)) throw new PageError('The Tax test delete table changed.');
      } catch (error) { await closeEdit(edit); throw error; }
      await deleteAll(edit, { onWrite: notice });
    }, write);
  };
  const statesForApply = (checkpoint, plan) => {
    const states = [checkpoint.days];
    const put = next => states.push(next);
    for (const week of plan.weeks) {
      for (const item of week.lowerClients) put(states.at(-1).map(row => row.id === item.row.id ? { ...row, hours: item.hours } : row));
      const whole = week.loa.mode === 'Replace';
      const removed = states.at(-1).filter(row => inside(row.day, week) && (whole || entryKind(row) === 'loa'));
      if (!whole && removed.length || whole && !week.loa.hours && removed.length) put(states.at(-1).filter(row => !removed.includes(row)));
      if (week.loa.hours) put([...(whole ? states.at(-1).filter(row => !inside(row.day, week)) : states.at(-1)), rowAt(LOA, week.loa.day, week.loa.hours, 1)]);
      if (whole) for (const holiday of week.holidays) put([...states.at(-1), { ...holiday, id: '', hours: 8 }]);
    }
    return states;
  };
  const statesForRestore = (checkpoint, plan) => {
    const states = [checkpoint.days];
    for (const step of plan.steps) {
      for (const { old, row } of step.retained) if (old.hours !== row.hours) states.push(states.at(-1).map(target => target.id === row.id ? { ...target, hours: old.hours } : target));
      if (step.remove.length) states.push(states.at(-1).filter(row => !step.remove.some(old => old.id === row.id)));
      for (const old of step.add) states.push([...states.at(-1), { ...old, id: '', notes: 0 }]);
    }
    return states;
  };
  const pastAllowed = () => {
    check();
    const monday = mondayOf(todayOf());
    if (!pastOriginal || !sameDay(pastOriginal.day, monday) || compareDays(monday, todayOf()) >= 0
      || ['loa', 'holiday', 'dns'].includes(entryKind(pastOriginal)) || valueKey(pastOriginal.client) === 'loa') throw new PageError('The Tax past-Monday exception is not available.');
    return { start: monday, end: monday };
  };
  const pastRead = async () => { const window = pastAllowed(); const copy = await copyWindow(window); check(); return copy; };
  const pastHours = async (before, value, write) => {
    const window = pastAllowed();
    if (before.days.length !== 1 || !matches(before, await pastRead())) throw new PageError('The Tax Monday entry changed.');
    const after = { days: [{ ...pastOriginal, hours: value }] };
    pastPending = { before, after };
    await setAssignmentHours(window, before, before.days[0], value, { restoring: value > before.days[0].hours,
      onWrite: async () => { pastAllowed(); await write(); } });
    const actual = await pastRead();
    if (!matches(after, actual)) throw new PageError('Tax Monday hours are unconfirmed.');
    recordRun({type:'writeProof',ok:true});
    pastPending = null; return actual;
  };
  return {
    diagnosticState: liveDiagnosticState,
    observe: liveControlState,
    async taxStart(typedEmail, window) {
      if (scope || !String(typedEmail || '').trim() || addressCount(typedEmail) > 1) throw new PageError('Enter one test professional.');
      if (readSite() !== 'tax') throw new PageError('Tax live test requires Tax MySource.');
      const allowed = taxTestPeriod(today, { small });
      if (!sameDay(window.start, allowed.start) || !sameDay(window.end, allowed.end)) throw new PageError('Outside the approved Tax month.');
      scope = allowed; email = typedEmail; release = setBatchGuard(check);
      await openPerson(email); identity = personIdentity(); check();
      await setupView(); await showDate(scope.start, { cellProof: true });
      const before = await read();
      if (before.days.length) throw new PageError('The Tax test month is not empty.');
      known = before; started = true;
      return {};
    },
    async taxFind(write) {
      await add(DNS, day(3), day(7), 40, 'Normal', fixedNote, write);
      await add(DNS, day(17), day(21), 40, 'Normal', fixedNote, write);
      seedIds = known.days.filter(row => row.client === DNS).map(row => row.id);
      const monday = await read({ start: day(3), end: day(3) });
      const wednesday = await read({ start: day(5), end: day(5) });
      const week = await read({ start: day(3), end: day(7) });
      const seed = { days: known.days.filter(row => sameDay(row.day, day(3))) };
      if (seed.days.length !== 1 || !matches(seed, monday) || wednesday.days.length || !matches(seed, week)) throw new PageError('Single-day Tax Find could not be proved.');
      return { findings: ['One-day Find: Monday seed only.', 'Wednesday Find: empty.', 'Whole-week Find: Monday seed only.'] };
    },
    async taxSmallStart(typedEmail, window) {
      await this.taxStart(typedEmail, window);
      if ((await read({ start: day(3), end: day(7) })).days.length) throw new PageError('The Tax week is not empty.');
      return {};
    },
    async taxSmallAdd(write) {
      await add(LOA, longLoa.start, longLoa.end, 40, 'Normal', fixedNote, write);
      await add(DNS, longDns.start, longDns.end, 40, 'Normal', fixedNote, write);
      seedIds = known.days.filter(row => row.client === DNS).map(row => row.id);
      await add(HOLIDAY, day(18), day(18), 8, 'Normal', '', write);
      await add(LOA, day(17), day(21), 32, 'Replace', '', write);
      if (known.days.some(row => row.client === HOLIDAY)) throw new PageError('Tax Replace did not clear Holiday.');
      return { findings: ['Weekly Add: hours on Monday.', 'Replace cleared Holiday.'] };
    },
    async taxAdd(write) {
      await add(LOA, day(24), day(28), 40, 'Normal', fixedNote, write);
      await add(LOA, day(26), day(26), 24, 'Normal', fixedNote, write);
      const monday = await read({ start: day(24), end: day(24) }), wednesday = await read({ start: day(26), end: day(26) });
      if (monday.days.length !== 1 || monday.days[0].hours !== 40 || wednesday.days.length !== 1 || wednesday.days[0].hours !== 24) throw new PageError('Tax Add placement could not be proved.');
      return { findings: ['Weekly Add: hours on Monday.', 'One-day Add: hours on Wednesday.'] };
    },
    async taxHoliday(write) {
      await add(HOLIDAY, day(11), day(11), 8, 'Normal', '', write);
      await add(LOA, day(10), day(14), 32, 'Replace', '', write);
      if (known.days.some(row => row.client === HOLIDAY)) throw new PageError('Tax Replace did not clear Holiday.');
      await add(HOLIDAY, day(11), day(11), 8, 'Normal', '', write);
      return { findings: ['Replace cleared Holiday.', 'Holiday re-added; weekly total checked.'] };
    },
    async taxHours(write) {
      let target = known.days.find(row => sameDay(row.day, small ? longLoa.start : day(24)) && row.client === LOA && row.hours === 40);
      if (!target) throw new PageError('No unique owned Tax hours entry.');
      const id = target.id; await hours(target, 16, write);
      target = known.days.find(row => row.id === id); await hours(target, 40, write);
      return { findings: ['Hours lowered and restored; note count unchanged.'] };
    },
    async taxPartial(write, { short = false } = {}) {
      await assertKnown(); const checkpoint = known;
      const plan = { action: 'add', loaStart: day(5), loaEnd: short ? { y: 2028, m: 5, d: 10 } : day(19), notes: fixedNote };
      const taxPlan = planTaxWeeks({ plan, today, rows: checkpoint.days.map(row => ({ ...row,
        ...(seedIds.includes(row.id) && row.client === DNS ? { kind: 'client' } : {}) })) });
      if (taxPlan.outcome !== 'report' || taxPlan.weeks.flatMap(week => week.lowerClients).length !== 2) throw new PageError('The Tax diagnostic stand-ins were not exercised.');
      const backup = { kind: BACKUP_KIND, diagnostic: true, site: 'tax', email, professional: identity.name.split('(')[0].trim(),
        window: scope, watchedWindow: scope, today, reportEnd: scope.end, days: checkpoint.days.map(row => ({ ...row, notes: 0 })),
        plan: { action: 'add', loaStart: plan.loaStart, loaEnd: plan.loaEnd },
        noteChangedDays: checkpoint.days.filter(row => row.client === LOA && inside(row.day, { start: plan.loaStart, end: plan.loaEnd })).map(row => row.day) };
      const prepared = { tax: true, identity, today, window: scope, watchedWindow: scope, reportEnd: scope.end,
        copy: checkpoint, watched: checkpoint, backup, taxPlan };
      const applied = await sequence(statesForApply(checkpoint, taxPlan), notice => apply({ record: { email }, decision: { plan } }, prepared, { onWrite: notice }), write);
      if (!applied.ok) throw new PageError('The normal Tax apply was not proved.');
      const restorePlan = await taxRestorePlan(backup, { today, after: applied.after });
      if (restorePlan.skippedLater.length || restorePlan.skippedLocked.length || restorePlan.skippedUnconfirmed.length) throw new PageError('The normal Tax Undo was refused.');
      const restoreStates = statesForRestore(known, restorePlan);
      const restored = await sequence(restoreStates, notice => restoreWindow(backup, { today, identity, after: applied.after, onWrite: notice }), write);
      if (!restored.same || !matches({ days: restoreStates.at(-1) }, known) || !compareCopies(checkpoint, known).same) throw new PageError('The Tax month did not match its checkpoint after Undo.');
      return { findings: ['DNS stand-in lowered in both partial weeks.', 'Normal Tax apply and Undo checked.'] };
    },
    async taxClear(write) { await clear(write); if (known.days.length) throw new PageError('Tax month cleanup unconfirmed.'); return { findings: [small ? 'Span empty and checked.' : 'Month empty and checked.'] }; },
    async taxPast(write) {
      await assertKnown();
      if (known.days.length) throw new PageError('The Tax month must be empty before the Monday check.');
      const monday = mondayOf(today), covered = workingDays(today, addDays(monday, 4)).length;
      if (compareDays(today, monday) <= 0 || !covered) return { notExercised: true };
      check(); const before = await copyWindow({ start: monday, end: monday }); check();
      if (before.days.length !== 1) return { notExercised: true };
      const row = before.days[0];
      if (!row.id || ['loa', 'holiday', 'dns'].includes(entryKind(row)) || valueKey(row.client) === 'loa' || !sameDay(row.day, monday)
        || !Number.isFinite(row.hours) || row.hours <= 0) return { notExercised: true };
      const lower = Math.round(row.hours * (5 - covered) / 5);
      if (lower >= row.hours) return { notExercised: true };
      pastOriginal = row;
      const lowered = await pastHours(before, lower, write);
      await pastHours(lowered, row.hours, write);
      return { findings: ['Past Monday restored; note count unchanged.'] };
    },
    async taxCleanup(write, error) {
      if (!started) return 'notNeeded';
      if (error?.identityChanged || error?.session || error?.pageBlocked) return 'unconfirmed';
      await cancelLiveWindows(); check();
      if (pastOriginal) {
        const actual = await pastRead();
        if (!matches({ days: [pastOriginal] }, actual)) {
          if (!pastPending || !matches(pastPending.before, actual) && !matches(pastPending.after, actual)) throw new PageError('Tax Monday recovery is unconfirmed.');
          await pastHours(actual, pastOriginal.hours, write);
        }
      }
      await resolve();
      try { await clear(write); }
      catch (error) { await cancelLiveWindows(); await resolve(); if (known.days.length) throw error; }
      return known.days.length ? 'unconfirmed' : 'empty';
    },
    taxFinish() { release?.(); release = null; },
  };
}
function auditLivePage(today, small = false) {
  const LOA = 'Leave of Absence (LOA)', DNS = 'Do Not Schedule (DNS)', note = 'Snooze A&A test';
  const sameDay = (a, b) => compareDays(a, b) === 0;
  const inside = (day, range) => day && compareDays(day, range.start) >= 0 && compareDays(day, range.end) <= 0;
  const matches = (model, actual) => {
    if (!model || !actual || !compareCopies(model, actual).same || new Set(actual.days.map(row => row.id)).size !== actual.days.length) return false;
    const used = new Set();
    for (const old of model.days) {
      const row = actual.days.find(row => !used.has(row.id) && (!old.id || old.id === row.id) && old.notes === row.notes && compareCopies({ days: [old] }, { days: [row] }).same);
      if (!row) return false;
      used.add(row.id);
    }
    return true;
  };
  const entryRows = entry => (entry.dates || workingDays(entry.start, entry.end)).map(day => ({
    day, date: usDate(day), client: entry.client, hours: entry.hoursPerDay, notes: entry.notes ? 1 : 0,
    wbs: entry.wbs || '', jobCode: entry.jobCode || '', assignCode: entry.assignCode || '', assignCode2: entry.assignCode2 || '',
    pricingId: entry.pricingId || '', billable: entry.billable, utilization: entry.utilization,
  }));
  const allowed = small ? smallTestPeriod(today) : auditTestPeriod(today);
  const first = { start: allowed.start, end: addDays(allowed.start, 1) };
  const second = { start: addDays(allowed.start, 3), end: addDays(allowed.start, 4) };
  const wednesday = addDays(allowed.start, 2), thursday = second.start;
  let identity = null, scope = null, email = null, started = false, known = null, pending = null;
  let checkpoint = null, kept = null, one = null, prepared = null, applied = null, release = null, step = null;
  const check = probe => {
    requireSchedulePage(probe);
    if (sessionExpired()) throw Object.assign(new PageError('Session expired.'), { session: true });
    if (identity) checkPersonIdentity(identity, 'identity check', probe);
  };
  const bounded = range => {
    check();
    if (!scope || !inside(range.start, scope) || !inside(range.end, scope) || compareDays(range.start, range.end) > 0) throw new PageError('Outside the approved A&A period.');
  };
  const read = async () => { bounded(scope); const copy = await copyWindow(scope); check(); return copy; };
  const assertKnown = async () => { const actual = await read(); if (!matches(known, actual)) throw new PageError('The owned A&A test rows changed.'); return actual; };
  const resolveRead = (actual, mustBeAfter = false) => {
    if (!pending ? !matches(known, actual) : !matches(pending.after, actual) && (mustBeAfter || !matches(pending.before, actual))) throw new PageError('A&A save ownership is unconfirmed.');
    if (pending && matches(pending.after, actual)) {
      if (smallKept && pending.renewedIds.includes(smallKept.id)) {
        const rows = actual.days.filter(row => matches({ days: [{ ...smallKept, id: '' }] }, { days: [row] }));
        if (rows.length !== 1) throw new PageError('The kept DNS day changed.');
        smallKept = rows[0];
      }
      recordRun({type:'writeProof',ok:true,whole:true});
    }
    known = actual; pending = null; return actual;
  };
  const resolve = async (mustBeAfter = false) => resolveRead(await read(), mustBeAfter);
  const withReopen = async action => {
    check(); release?.(); release = null;
    try { return await action(); }
    finally { release = setBatchGuard(check); check(); }
  };
  const addOp = entry => ({ range: entry, after: before => [...before, ...entryRows(entry)] });
  const deleteOp = (range, client = null) => ({ kind: 'delete', range, client,
    after: before => before.filter(row => !inside(row.day, range) || client && valueKey(row.client) !== valueKey(client)) });
  const sequence = async (operations, action, write) => {
    await assertKnown(); let index = 0;
    const notice = async () => {
      const operation = operations[index];
      if (!operation) throw new PageError('Unplanned A&A test write.');
      bounded(operation.range);
      if (pending) { known = pending.after; pending = null; }
      let deleteRange = operation.range, staged = false, editRange = null;
      if (operation.kind === 'delete') {
        const owned=await ownedDeleteEdit(edit=>{
          const range=findAssignmentsRange(edit) || operation.range;
          if (!range.start || !range.end) throw new PageError('The A&A delete range could not be proved.');
          const clipped={start:compareDays(range.start,operation.range.start)>0 ? range.start : operation.range.start,
            end:compareDays(range.end,operation.range.end)<0 ? range.end : operation.range.end};
          bounded(clipped);
          const staged=!!range.weekBoxes && ![...document.querySelectorAll('.bootbox-confirm')].some(shown);
          const deletes=row=>inside(row.day,clipped) && (!operation.client || valueKey(row.client)===valueKey(operation.client));
          const queried=staged ? range : clipped;
          const rows={days:known.days.filter(row=>inside(row.day,queried) && (!operation.client || valueKey(row.client)===valueKey(operation.client)) && (!staged || !deletes(row)))};
          if (staged && !rows.days.length && !findAssignmentsRange(edit)) return null;
          return {range,clipped,staged,rows};
        },matches);
        editRange=owned.range; deleteRange=owned.clipped; staged=owned.staged;
      }
      const deletes = row => inside(row.day,deleteRange) && (!operation.client || valueKey(row.client)===valueKey(operation.client));
      const after = operation.kind === 'delete' ? known.days.filter(row=>!deletes(row)) : operation.after(known.days);
      const savedRange = small ? staged ? editRange : operation.savedEdit ? operation.range : null : null;
      const coveredBySave = row => savedRange && inside(row.day, savedRange)
        && (!operation.range.clients || operation.range.clients.some(client => valueKey(client) === valueKey(row.client)))
        && (!operation.client || valueKey(row.client) === valueKey(operation.client));
      pending = { before: known,
        after: { days: after.map(row => coveredBySave(row) ? { ...row, id: '' } : row) },
        renewedIds: known.days.filter(coveredBySave).map(row => row.id) };
      if (operation.kind !== 'delete' || !pending.after.days.some(row=>inside(row.day,operation.range) && (!operation.client || valueKey(row.client)===valueKey(operation.client)))) index++;
      const proveDelete = async () => {
        if (operation.kind !== 'delete') return;
        const queried = staged ? editRange : deleteRange;
        if (!queried?.start || !queried.end) throw new PageError('The A&A delete range could not be proved.');
        const expected = { days: (staged ? after : pending.before.days).filter(row => inside(row.day, queried) && (!operation.client || valueKey(row.client) === valueKey(operation.client))) };
        await ownedDeleteEdit(edit=>staged && !expected.days.length && !findAssignmentsRange(edit) ? null : {rows:expected},matches);
      };
      await proveDelete();
      await write();
      check(); await proveDelete();
    };
    const value = await action(notice, async action => {
      const value = await action(); if (pending) await resolve(true); return value;
    });
    if (index !== operations.length) throw new PageError('An A&A write was not exercised.');
    await resolve(true); return value;
  };
  const add = async (client, range, hours, notes, write) => {
    const entry = { ...range, client, hoursPerDay: hours, notes, billable: 'Non-Billable', utilization: 'No' };
    await sequence([addOp(entry)], notice => addAssignment(entry, 'Normal', { onWrite: notice }), write);
  };
  const clear = async write => {
    await assertKnown();
    if (!known.days.length) return;
    await sequence([deleteOp(scope)], async notice => {
      const edit = await findAssignments(scope);
      try {
        const actual = { days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) };
        if (!matches(known, actual)) throw new PageError('The A&A cleanup table changed.');
      } catch (error) { await closeEdit(edit); throw error; }
      await deleteAll(edit, { onWrite: notice });
    }, write);
  };
  const checkKept = copy => {
    const row = copy.days.filter(row => sameDay(row.day, wednesday));
    if (row.length !== 1 || !matches({ days: [kept] }, { days: row })) throw new PageError('Wednesday DNS changed.');
  };
  const smallNote = 'Snooze small live test';
  let smallCheckpoint = null, smallKept = null, smallKeptOriginalId = null;
  const smallKeep = () => {
    const row = known.days.find(row => row.id === smallKept?.id);
    if (!row || !matches({ days: [smallKept] }, { days: [row] })) throw new PageError('The kept DNS day changed.');
  };
  return {
    diagnosticState: liveDiagnosticState,
    observe: liveControlState,
    begin(events) {
      release = setBatchGuard(check);
      const stop = setRunRecorder(event => {
        if (!['begin','step','error','restoreComparison'].includes(event.type)) return;
        const safe = { type: event.type, step };
        if (STAGES.has(event.stage)) safe.stage = event.stage;
        if (REASON_CODES.has(event.code)) safe.code = event.code;
        if (typeof event.ok === 'boolean') safe.ok = event.ok;
        events.push(safe);
      });
      return () => { stop(); release?.(); release = null; };
    },
    setStep(id) { step = id; },
    async smallStart(typedEmail, window) {
      await this.auditStart(typedEmail, window);
      return {};
    },
    async smallAdd(write) {
      const week = { start: scope.start, end: addDays(scope.start, 39) };
      const next = { start: addDays(scope.start, 42), end: scope.end };
      await add(LOA, week, 8, smallNote, write);
      await add(DNS, next, 8, smallNote, write);
      await add(DNS, { start: wednesday, end: wednesday }, 8, '', write);
      smallCheckpoint = await assertKnown();
      smallKept = known.days.find(row => sameDay(row.day, addDays(scope.start, 44)) && row.client === DNS);
      if (!smallKept?.id || smallKept.notes !== 1) throw new PageError('The kept DNS checkpoint is unreadable.');
      smallKeptOriginalId = smallKept.id;
      return { blankNotesAccepted: true };
    },
    async smallChange(write) {
      await assertKnown();
      const replace = { start: addDays(scope.start, 38), end: addDays(scope.start, 39), client: DNS,
        hoursPerDay: 8, notes: smallNote, billable: 'Non-Billable', utilization: 'No' };
      await sequence([{ range: replace, after: before => [...before.filter(row => !inside(row.day, replace)), ...entryRows(replace)] }],
        notice => addAssignment(replace, 'Replace', { onWrite: notice }), write);
      const removedDay = addDays(scope.start, 37);
      const query = { start: scope.start, end: removedDay, clients: [LOA] };
      const rows = known.days.filter(row => row.client === LOA && inside(row.day, query));
      const remove = rows.filter(row => sameDay(row.day, removedDay));
      if (rows.length !== 28 || remove.length !== 1) throw new PageError('The combined reduction checkpoint is unreadable.');
      await sequence([{ range: query, savedEdit: true, after: before => before.filter(row => !remove.some(old => old.id === row.id)) }],
        notice => refreshNotes(query, { days: rows }, smallNote + ' refreshed', { remove, onWrite: notice }), write);
      await assertKnown();
      const cancelQuery = { start: scope.start, end: addDays(scope.start, 4), clients: [LOA] };
      const cancelRows = known.days.filter(row => row.client === LOA && inside(row.day, cancelQuery));
      const staged = await stageNotes(cancelQuery, { days: cancelRows }, 'Snooze small discarded note', { remove: cancelRows.slice(1) });
      if (!staged) throw new PageError('The Cancel stage could not be proved.');
      const cancels = [...staged.edit.querySelectorAll('button')].filter(node => shown(node) && text(node) === 'Cancel' && !node.disabled);
      if (cancels.length !== 1) throw new PageError('The staged Cancel button is unclear.');
      await click(cancels[0]);
      await waitFor(() => !staged.edit.isConnected || !shown(staged.edit), 'the staged Cancel to close', WAIT.window);
      await assertKnown(); smallKeep(); return { combinedReduction: true, cancelUnchanged: true };
    },
    async smallDelete(write) {
      await assertKnown(); smallKeep();
      const ranges = [{ start: scope.start, end: addDays(smallKept.day, -1) }, { start: addDays(smallKept.day, 1), end: scope.end }];
      let weekBoxes = false;
      for (const range of ranges) {
        for (const part of splitDeleteWeeks(range)) {
          await sequence([deleteOp(part)], async notice => {
            const edit = await findAssignments({ ...part, weekEndFriday: true });
            const found = findAssignmentsRange(edit);
            weekBoxes ||= !!found?.weekBoxes;
            if (found?.weekBoxes && part.partial) {
              const expected = { days: known.days.filter(row => inside(row.day, found)) };
              const targets = expected.days.filter(row => inside(row.day, part));
              if (targets.some(row => row.id === smallKept.id)) {
                await closeEdit(edit); throw new PageError('The small delete exceeds its owned days.');
              }
              await saveStagedNotes(await stageRemoval(edit, expected, targets), notice);
            } else await deleteRange(part, known, { edit, read, protectedRows: [smallKept],
              validate: async () => { check(); }, onWrite: notice });
          }, write);
        }
        smallKeep();
      }
      if (known.days.length !== 1) throw new PageError('The delete left unexpected rows.');
      return { keptId: true, keptNotes: true, partWeek: weekBoxes };
    },
    async smallPicture() {
      await assertKnown(); smallKeep();
      const pictures = createLivePictures({ today, scope: () => scope, identity: () => identity, email: () => email,
        bounded: async range => bounded(range), checked: async () => check(), assertSame: async expected => {
          if (!matches(expected, await read())) throw new PageError('The picture checkpoint changed.');
        } });
      const hover = await pictures.diagnosticPicture(DNS, known, smallNote);
      const one = { record: { email, person: { professional: identity.name.split('(')[0].trim() }, subcategory: { business: 'audit' } },
        decision: { plan: { action: 'dns', dnsStart: scope.start, dnsEnd: scope.end, withoutNotes: true } } };
      const row = { state: 'done', one, prepared: { identity }, after: known, diagnostic: { steps: [], paint: [] } };
      try {
        await capturePerson(row, { alreadyOpen: true, identity }); check(); await assertKnown();
        const shots = one.outputs?.screenshots || [];
        if (!shots.length || one.outputs.warnings || lastPicture.notesPainted || row.diagnostic.paint.length) throw new PageError('The plain A&A picture was not proved.');
        return [{ kind: 'dns', ...hover }, { kind: 'audit', views: shots.length,
          bytes: shots.reduce((sum, blob) => sum + blob.size, 0), notesPainted: false, omissions: [] }];
      } finally { if (one.outputs) one.outputs.screenshots = []; }
    },
    async smallUndo(write) {
      await assertKnown(); smallKeep();
      const ranges = [{ start: scope.start, end: addDays(smallKept.day, -1) }, { start: addDays(smallKept.day, 1), end: scope.end }];
      const missing = smallCheckpoint.days.filter(row => row.id !== smallKeptOriginalId);
      const exactEntries = ranges.flatMap(range => entriesToAdd({ days: missing.filter(row => inside(row.day, range)) }, { exact: true }).entries);
      const capability = await preflightDates(missing.map(row => row.day), { anchor: scope.start, entries: exactEntries });
      const operations = ranges.flatMap(range => entriesToAdd({ days: missing.filter(row => inside(row.day, range)) }, { exact: capability.exact }).entries.map(addOp));
      const backup = { kind: BACKUP_KIND, diagnostic: true, email, professional: identity.name.split('(')[0].trim(),
        window: scope, days: smallCheckpoint.days, plan: { action: 'add' } };
      const after = known;
      const restored = await sequence(operations, notice => restoreWindow(backup, { today, identity, after,
        verifyBefore: async actual => {
          bounded(actual.window); const expected = pending?.after || known;
          if (!matches({ days: expected.days.filter(row => inside(row.day, actual.window)) }, actual)) throw new PageError('The small Undo table changed.');
        }, onWrite: notice }), write);
      const expected = { days: smallCheckpoint.days.map(row => row.id === smallKeptOriginalId ? smallKept : { ...row, id: '', notes: 0 }) };
      if (!restored.same || restored.skippedLater?.length || !matches(expected, known)) throw new PageError('The small backup was not restored.');
      smallKeep(); return { backupRestored: true };
    },
    async auditStart(typedEmail, window) {
      if (scope || !String(typedEmail || '').trim() || addressCount(typedEmail) > 1) throw new PageError('Enter one test professional.');
      if (!sameDay(window.start, allowed.start) || !sameDay(window.end, allowed.end)) throw new PageError('Outside the approved A&A period.');
      if (readSite() !== 'consulting') throw new PageError('A&A live test requires Consulting MySource.');
      scope = allowed; email = typedEmail;
      await openPerson(email); identity = personIdentity(); check(); await showDate(scope.start, { cellProof: true });
      known = await read();
      if (known.days.length) { known = null; throw new PageError('The A&A test span is not empty.'); }
      const permissions = createEditability({ today, identity });
      const through = await permissions.through(scope.end, scope.start);
      if (!through || !sameDay(through, scope.end)) throw new PageError('The A&A test span is greyed out.');
      await preflightDates(workingDays(scope.start, scope.end), { anchor: scope.start });
      started = true;
    },
    async auditSetup(write) {
      await add(LOA, first, 8, '', write); await add(LOA, second, 8, '', write);
      await add(DNS, { start: wednesday, end: wednesday }, 8, note, write);
      await add(DNS, { start: thursday, end: thursday }, 4, '', write);
      checkpoint = await assertKnown(); kept = checkpoint.days.find(row => sameDay(row.day, wednesday));
      if (!kept?.id || kept.notes !== 1) throw new PageError('Wednesday note was not saved.');
    },
    async auditExit(write) {
      await assertKnown();
      const person = { professional: identity.name.split('(')[0].trim(), business: 'Audit & Assurance', region: 'US - US', resourceManager: 'Planner, Invented', termDate: scheduleFacts().termDate || '12/31/9999' };
      const lwd = addDays(scope.start, -3);
      const record = { number: 'diagnostic', email, person, subcategory: { business: 'audit', kind: 'exit' },
        notification: readNotification(`Date of resignation: ${usDate(addDays(lwd, -7))}\nPlanned last working day: ${usDate(lwd)}`) };
      const entries = checkpoint.days.map(row => ({ ...row, days: [{ day: row.day, hours: row.hours }], fields: {} }));
      const slice = { status: 'ready', mode: 'day', entries, backupEntries: entries, person, resourceManager: person.resourceManager, reportEnd: scope.end };
      one = { record, slice, decision: decideExit(record, scope.start, slice) };
      if (one.decision.audit?.region !== 'US' || one.decision.audit?.template !== 4 || !one.decision.plan?.withoutNotes) throw new PageError('The production A&A decision was not proved.');
      one.decision.plan.dnsEnd = scope.end;
      prepared = await withReopen(() => prepare(one, 'diagnostic', scope.start));
      if (!prepared.backup || !matches(known, prepared.copy) || prepared.copy.days.some(row => !inside(row.day, scope))) throw new PageError('Production preparation includes unowned days.');
      const expected = [first, second, { start: thursday, end: thursday }];
      if (prepared.exitRuns.length !== expected.length || prepared.exitRuns.some((run, index) => run.future || !sameDay(run.start, expected[index].start) || !sameDay(run.end, expected[index].end) || inside(wednesday, run))) throw new PageError('A&A delete ranges were not proved.');
      const operations = prepared.exitRuns.map(run => deleteOp(run, run.client));
      operations.push(...prepared.dnsAddRuns.map(run => addOp({ ...run, client: DNS, hoursPerDay: 8, billable: 'Non-Billable', utilization: 'No', notes: '' })));
      applied = await sequence(operations, (notice, step) => apply(one, prepared, { onWrite: notice, step }), write);
      if (!applied.ok) throw new PageError('The production A&A result was not proved.');
      return { deleteRanges: prepared.exitRuns.map(run => ({ start: usDate(run.start), end: usDate(run.end) })), productionPrepare: true, productionApply: true };
    },
    async auditKept() { checkKept(await assertKnown()); return { sameId: true, sameNoteCount: true }; },
    async auditDns() {
      const copy = await assertKnown(); checkKept(copy);
      const dates = workingDays(scope.start, scope.end);
      if (copy.days.length !== dates.length || dates.some(day => {
        const rows = copy.days.filter(row => sameDay(row.day, day));
        return rows.length !== 1 || rows[0].client !== DNS || rows[0].hours !== 8 || valueKey(rows[0].billable) !== 'non billable' || valueKey(rows[0].utilization) !== 'no' || !sameDay(day, wednesday) && rows[0].notes !== 0;
      })) throw new PageError('New DNS or blank Notes was not proved.');
      return { blankNotesAccepted: true, newDays: dates.length - 1 };
    },
    async auditPicture() {
      await assertKnown();
      const row = { state: 'done', one, prepared, result: applied, after: known, diagnostic: { steps: [], paint: [] } };
      try {
        await capturePerson(row, { alreadyOpen: true, identity }); check();
        const pictures = one.outputs?.screenshots || [];
        if (!pictures.length || one.outputs.warnings || lastPicture.notesPainted || row.diagnostic.paint.length) throw new PageError('Plain A&A screenshot was not proved.');
        await assertKnown();
        return { kind: 'audit', productionCapture: true, views: pictures.length, bytes: pictures.reduce((sum, blob) => sum + blob.size, 0), notesPainted: false, omissions: [] };
      } finally { if (one.outputs) one.outputs.screenshots = []; }
    },
    async auditUndo(write) {
      await assertKnown(); checkKept(known);
      const operations = [];
      for (const range of [first, { start: second.start, end: scope.end }]) {
        operations.push(deleteOp(range));
        const entries = entriesToAdd({ days: prepared.backup.days.filter(row => inside(row.day, range)) }, { exact: true }).entries;
        operations.push(...entries.map(addOp));
      }
      const restored = await sequence(operations, notice => withReopen(() => restore(prepared.backup, { today: scope.start, after: applied.after, identity,
        verifyBefore: async actual => {
          bounded(actual.window);
          const expected = pending?.after || known;
          if (!matches({ days: expected.days.filter(row => inside(row.day, actual.window)) }, actual)) throw new PageError('The A&A Undo table changed.');
        }, onWrite: notice })), write);
      if (!restored.same || restored.skippedLater?.length || !matches({ days: checkpoint.days.map(row => row.id === kept.id ? row : { ...row, id: '' }) }, known)) throw new PageError('A&A Undo was not proved.');
      checkKept(known); return { productionUndo: true, setupRestored: true };
    },
    async auditClear(write) { await clear(write); if ((await read()).days.length) throw new PageError('A&A span is not empty.'); },
    async auditCleanup(write, error) {
      if (!started) return 'notNeeded';
      if (error?.identityChanged || error?.session || error?.pageBlocked) return 'unconfirmed';
      await cancelLiveWindows(); check(); await resolve();
      try { await clear(write); }
      catch (error) { await cancelLiveWindows(); await resolve(); if (known.days.length) throw error; }
      return (await read()).days.length ? 'unconfirmed' : 'empty';
    },
    auditOutstanding(cleanup) {
      if (!started) return [];
      const rows = pending ? [...pending.before.days, ...pending.after.days] : known?.days || [];
      if (cleanup === 'unconfirmed') return workingDays(scope.start, scope.end).map(day => ({ date: usDate(day), rows: null }));
      return [...new Set(rows.map(row => usDate(row.day)))].sort().map(date => ({ date, rows: pending ? null : rows.filter(row => usDate(row.day) === date).length }));
    },
  };
}
__exports.liveDiagnosticState = liveDiagnosticState;
__exports.liveControlState = liveControlState;
__exports.ownedDeleteEdit = ownedDeleteEdit;
__exports.liveTestPage = liveTestPage;
},
"mysource/live-groups.js": function (__require, __exports, document, window) {
'use strict';
const { apply, recover, previewRestore, removeLeaveRun, BACKUP_KIND } = __require("../run/work.js");
const { restoreWindow } = __require("./restore.js");
const { copyWindow, compareCopies, dayOf } = __require("./copy.js");
const { LOA_CLIENT, DNS_CLIENT } = __require("./checks.js");
const { findAssignments, readEditTable, closeEdit, scheduleFacts, checkPersonIdentity, emptySpots, menuItem, buttonIn, openPeriods, waitPeriodsClosed, waitPeriodsCalendar } = __require("./schedule.js");
const { PageError, WAIT, shown, text, click, settled, waitFor, closeWindow, typeInto, chooseInSelect2, fieldByLabel } = __require("./dom.js");
const { showDate, titleWithIcon } = __require("./calendar.js");
const { compareDays, usDate, workingDays } = __require("../rules/dates.js");
const { valueKey } = __require("../rules/prepare.js");
const { termDayOf } = __require("../rules/shared.js");
const { preflightDates } = __require("./write.js");
const { setDates, waitForDates } = __require("./dates-box.js");
const { noteRowsEligible } = __require("./note-stage.js");
const inside = (day, window) => day && compareDays(day, window.start) >= 0 && compareDays(day, window.end) <= 0;
const sameOwned = (expected, actual) => compareCopies(expected, actual).same &&
  new Set(actual.days.map(row => row.id)).size === actual.days.length && actual.days.every(row => {
    const old = expected.days.find(one => one.id === row.id);
    return old && compareCopies({ days: [old] }, { days: [row] }).same && (row.notes > 0) === (old.notes > 0);
  });
function createLiveGroups(context) {
  const { bounded, checked, assertSame, read, markWrite, today } = context;
  const own = () => context.scope();
  const guard = async window => {
    const scope = own();
    if (!scope || scope.start.y !== 2028 || scope.end.y !== 2028 || !inside(window.start, scope) || !inside(window.end, scope) || compareDays(window.start, window.end) > 0) throw new PageError('Outside the owned 2028 diagnostic period.');
    await bounded(window);
  };
  const checkpointBackup = (checkpoint, window, plan = {}) => {
    if (!checkpoint || checkpoint.days.some(row => !inside(row.day, own()))) throw new PageError('The diagnostic checkpoint is outside its owned period.');
    const email = context.email?.();
    if (!email) throw new PageError('No exact test professional is bound to this diagnostic.');
    return { kind: BACKUP_KIND, diagnostic: true, email, professional: context.identity().name.split('(')[0].trim(),
      window, days: checkpoint.days.filter(row => inside(row.day, window)), taken: checkpoint.taken, plan };
  };
  const verifyOwned = expected => async actual => {
    await guard(actual.window);
    if (!sameOwned({ days: expected.days.filter(row => inside(row.day, actual.window)) }, actual)) throw new PageError('The diagnostic schedule changed; no unowned row can be restored or removed.');
  };
  const notice = (window, onWrite, origin) => async () => { await guard(window); await markWrite(origin, onWrite); };
  const futureInventory = async expected => {
    await guard(own());
    const inventory = await copyWindow(own(), { future: true });
    await checked();
    if (inventory.days.some(row => !inside(row.day, own()))) return { notExercised: true, ok: false, reason: 'All-future Find returned a target outside the owned 2028 period; no writes.' };
    if (!sameOwned(expected, inventory)) throw new PageError('The all-future diagnostic table changed; nothing was written.');
    return null;
  };
  const unchanged = async (expected, window) => { const after = await read(window); if (!sameOwned(expected, after)) throw new PageError('Cancel changed the saved diagnostic rows.'); return after; };
  const reopen = operation => context.withReopen ? context.withReopen(operation) : operation();
  const cancel = async (modal, name) => {
    await settled(modal);
    const buttons = [...modal.querySelectorAll('button')].filter(button => shown(button) && text(button) === 'Cancel' && !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (buttons.length !== 1) throw new PageError('The diagnostic Cancel button is unclear. Nothing was saved.');
    await click(buttons[0]);
    try { await waitFor(() => !modal.isConnected || !shown(modal), `${name} Cancel to close`, WAIT.window); }
    catch (error) { error.pageBlocked = true; throw error; }
    await checked();
  };
  return {
    async diagnosticApply(expected, window, plan, options = {}, onWrite = () => {}, onStage = () => {}) {
      await guard(window); await assertSame(expected, window);
      const exit = options.exit === true || ['dns', 'clearClients'].includes(plan.action);
      const plannedWindow = exit ? { start: plan.dnsStart, end: plan.dnsEnd } : { start: plan.loaStart, end: plan.loaEnd };
      if (!plannedWindow.start || !plannedWindow.end) throw new PageError('The diagnostic schedule plan has no bounded dates.');
      await guard(plannedWindow);
      if (!inside(plannedWindow.start, window) || !inside(plannedWindow.end, window)) throw new PageError('The diagnostic plan exceeds its checkpoint.');
      for (const run of [...(options.runs || []), ...(options.exitRuns || [])]) {
        if (!inside(run.start, window) || !inside(run.end, window) || run.rows.some(row => !inside(row.day, window) || !expected.days.some(old => old.id === row.id && compareCopies({ days: [old] }, { days: [row] }).same))) throw new PageError('The diagnostic removal contains an unowned row.');
      }
      if (exit) { const refusal = await futureInventory(expected); if (refusal) return refusal; }
      const backup = checkpointBackup(expected, window, plan);
      const prepared = { identity: context.identity(), window, watchedWindow: window, watched: expected, copy: expected, backup,
        runs: options.runs || [], kept: [], ...(exit ? { exitRuns: options.exitRuns || [], earlyDns: options.earlyDns || [],
          addDns: options.addDns !== false, editableDnsEnd: options.editableDnsEnd || plan.dnsEnd } : {}) };
      const result = await apply({ record: { email: backup.email }, decision: { plan } }, prepared, {
        onWrite: async () => {
          await guard(window);
          const edit = [...document.querySelectorAll('#editEventGridModal')].find(shown);
          const add = [...document.querySelectorAll('#addShiftEventModal')].find(shown);
          const confirmation = [...document.querySelectorAll('.bootbox-confirm')].find(shown);
          const origin = add ? 'Add Assignment' : confirmation ? 'Delete All' : edit ? 'Edit Assignments Submit' : null;
          if (!origin) throw new PageError('The diagnostic production write window is unclear. Nothing was submitted.');
          if (origin === 'Edit Assignments Submit') {
            const staged = (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) }));
            if (staged.some(row => !row.day || !inside(row.day, window))) throw new PageError('The staged diagnostic rows are outside the owned period.');
            onStage('proof', { rows: staged.length, days: staged.map(row => usDate(row.day)), totalHours: staged.reduce((sum, row) => sum + row.hours, 0) });
          }
          await markWrite(origin, onWrite);
        },
        step: async operation => { await guard(window); return operation(); },
      });
      await checked();
      if (result.after?.days.some(row => !inside(row.day, own()))) throw new PageError('Production apply returned an outside diagnostic row.');
      return result;
    },
    async diagnosticRecover(checkpoint, window, onWrite, verifiedBefore) {
      await guard(window); await assertSame(verifiedBefore, window);
      const backup = checkpointBackup(checkpoint, window, { action: 'add' });
      return reopen(() => recover(backup, { fullReport: true, today, identity: context.identity(), verifyBefore: verifyOwned(verifiedBefore),
        move: day => showDate(day, { cellProof: true }), onWrite: notice(window, onWrite, 'Restore') }));
    },
    async diagnosticPreview(checkpoint, window, after = null, verifiedBefore = after) {
      await guard(window);
      if (verifiedBefore) await assertSame(verifiedBefore, window);
      return reopen(() => previewRestore(checkpointBackup(checkpoint, window), { fullReport: true, today, identity: context.identity(), after,
        ...(verifiedBefore ? { verifyBefore: verifyOwned(verifiedBefore) } : {}), move: day => showDate(day, { cellProof: true }) }));
    },
    async diagnosticStalePreview(checkpoint, window, preview, verifiedBefore) {
      await guard(window); await assertSame(verifiedBefore, window);
      try {
        await restoreWindow(checkpointBackup(checkpoint, window), { fullReport: true, today, identity: context.identity(),
          previewBefore: preview.before, verifyBefore: verifyOwned(verifiedBefore), move: day => showDate(day, { cellProof: true }),
          onWrite: () => { throw new PageError('Diagnostic stale-preview check unexpectedly reached a write; nothing was submitted.'); } });
      } catch (error) {
        if (/schedule changed since the Undo preview/.test(error.message)) return { refused: true, writes: 0 };
        throw error;
      }
      throw new PageError('The diagnostic stale preview was not refused.');
    },
    async diagnosticRemoveLeave(expected, window, run, onWrite) {
      await guard(window); await assertSame(expected, window);
      if (!inside(run.start, window) || !inside(run.end, window) || run.rows.some(row => !expected.days.includes(row) && !expected.days.some(old => old.id === row.id))) throw new PageError('The LOA diagnostic removal is not owned.');
      return removeLeaveRun(run, { copy: expected, window, watchedWindow: window }, operation => operation(),
        notice(window, onWrite, 'Delete All'), expected);
    },
    async diagnosticFilters(expected, window) {
      await guard(window); await assertSame(expected, window);
      const termText = String(scheduleFacts().termDate || '').trim(), term = termText ? termDayOf(termText) : null;
      if (termText && !term || term && compareDays(term, today) <= 0) throw new PageError('The empty-day Find route could not be proved on this diagnostic professional.');
      const proofs = [];
      for (const client of [LOA_CLIENT, DNS_CLIENT]) {
        const edit = await findAssignments({ ...window, clients: [client] });
        try {
          const actual = { days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) };
          if (!sameOwned({ days: expected.days.filter(row => valueKey(row.client) === valueKey(client)) }, actual)) throw new PageError('The empty-day client filter did not return exactly its owned rows.');
          proofs.push({ client: client === LOA_CLIENT ? 'LOA' : 'DNS', rows: actual.days.length, controlsProved: true, emptyDayRoute: true });
        } finally { await closeEdit(edit); }
      }
      return { proofs, mixedRowsEligible: noteRowsEligible(expected.days) };
    },
    async cancelFind(expected, window) {
      await guard(window); await assertSame(expected, window);
      await menuItem(emptySpots(), 'Find Assignments');
      const modal = await settled(await waitFor(() => [...document.querySelectorAll('#FindAssignmentsModal')].find(shown), 'diagnostic Find Assignments'));
      await cancel(modal, 'Find Assignments'); return unchanged(expected, window);
    },
    async cancelAdd(expected, window) {
      await guard(window); await assertSame(expected, window);
      const day = workingDays(window.start, window.end)[0];
      if (!day) throw new PageError('No owned working day for the diagnostic Add Cancel.');
      const capability = await preflightDates([day], { anchor: day, move: date => showDate(date, { cellProof: true }), keepOpen: true });
      const modal = capability.modal;
      try {
        const form = modal.querySelector('#CreateWeeklyAssignmentShift_Form') || modal;
        await chooseInSelect2(fieldByLabel(form, 'Client'), LOA_CLIENT, 'Client');
        await typeInto(fieldByLabel(form, 'Hours Per Day'), 8);
        await setDates(form, day, day);
        await typeInto(fieldByLabel(form, 'Notes'), 'Invented cancelled diagnostic notification');
        await chooseInSelect2(fieldByLabel(form, 'Mode'), 'Normal', 'Mode');
        await waitForDates(form, day, day, 8);
        await cancel(modal, 'Add Assignment');
      } finally { if (modal.isConnected && shown(modal)) await closeWindow(modal, 'Add Assignment'); }
      return unchanged(expected, window);
    },
    async cancelGoToDate(expected, window) {
      await guard(window); await assertSame(expected, window);
      const icon = titleWithIcon()?.querySelector('i[class*=calendar]');
      if (!icon) throw new PageError('The Go to Date calendar icon is missing.');
      await click(icon);
      const box = await waitFor(() => [...document.querySelectorAll('input.js-dynamic-calendar-jump-date')].find(shown), 'diagnostic Go to Date');
      const modal = await settled(box.closest('.modal'));
      await typeInto(box, usDate(window.start)); await cancel(modal, 'Go to Date'); await checked();
      return unchanged(expected, window);
    },
    async deleteNo(expected, window, client = null) {
      await guard(window); await assertSame(expected, window);
      const edit = await findAssignments({ ...window, ...(client ? { clients: [client] } : {}) });
      try {
        const actual = { days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) };
        if (!sameOwned({ days: expected.days.filter(row => !client || row.client === client) }, actual)) throw new PageError('The diagnostic Delete No table is not owned.');
        await click(edit.querySelector('button.js-bulk-actions') || buttonIn(edit, 'Bulk Actions'));
        const item = await waitFor(() => [...edit.querySelectorAll('.js-assignment-edit-delete-all')].find(shown), 'diagnostic Delete All');
        await click(item);
        const opened = await waitFor(() => [...document.querySelectorAll('.bootbox-confirm')].find(shown), 'diagnostic Delete No');
        const confirm = await settled(opened, { loadingScope: opened });
        await click(buttonIn(confirm, 'No'));
        await waitFor(() => !confirm.isConnected || !shown(confirm), 'diagnostic No confirmation to close', WAIT.window);
      } finally { await closeEdit(edit); }
      return unchanged(expected, window);
    },
    async cancelBulk(expected, window, notes) {
      await guard(window); await assertSame(expected, window);
      const edit = await findAssignments({ ...window, clients: [LOA_CLIENT] });
      let bulk;
      try {
        const rows = { days: (await readEditTable(edit)).map(row => ({ ...row, day: dayOf(row.date) })) };
        if (!sameOwned({ days: expected.days.filter(row => row.client === LOA_CLIENT) }, rows)) throw new PageError('The diagnostic Bulk Cancel table changed.');
        await click(edit.querySelector('button.js-bulk-actions') || buttonIn(edit, 'Bulk Actions'));
        const item = await waitFor(() => [...edit.querySelectorAll('.js-assignment-edit-edit-all')].find(shown), 'diagnostic Bulk Edit');
        const before = new Set(document.querySelectorAll('.modal, [role=dialog]'));
        await click(item);
        bulk = await settled(await waitFor(() => [...document.querySelectorAll('.modal, [role=dialog]')].find(node => !before.has(node) && shown(node)), 'diagnostic Bulk Edit window'));
        if (text(bulk.querySelector('.modal-title, h4')) !== 'Bulk Edit Assignments') throw new PageError('The diagnostic Bulk Edit window could not be identified.');
        await typeInto(fieldByLabel(bulk, 'Notes'), notes); await cancel(bulk, 'Bulk Edit Assignments'); bulk = null;
        await cancel(edit, 'Edit Assignments');
      } finally { if (bulk?.isConnected && shown(bulk)) await closeWindow(bulk, 'Bulk Edit Assignments'); await closeEdit(edit); }
      return unchanged(expected, window);
    },
    async shorterPeriods(callback) {
      await guard(own());
      const open = async () => {
        await checked();
        return openPeriods();
      };
      const set = async value => {
        const form = await open();
        if (!form.select) { await closeWindow(form.dialog, 'No. of Periods'); throw new PageError('No offered period list could be proved.'); }
        if (form.select.nextElementSibling?.classList.contains('select2-container')) await chooseInSelect2(form.select, String(value), 'No. of Periods');
        else {
          const option = [...form.select.options].find(option => text(option) === String(value) || option.value === String(value));
          if (!option) { await closeWindow(form.dialog, 'No. of Periods'); throw new PageError('The requested diagnostic period count is not offered.'); }
          form.select.value = option.value; form.select.dispatchEvent(new window.Event('change', { bubbles: true }));
        }
        await click(buttonIn(form.dialog, 'Submit'));
        await waitPeriodsClosed(form.dialog);
        await waitPeriodsCalendar(value); await checked();
        const proof = await open();
        await closeWindow(proof.dialog, 'No. of Periods');
        if (proof.current !== String(value)) throw new PageError('The diagnostic period count was not kept.');
      };
      const initial = await open();
      const values = initial.select ? [...initial.select.options].map(option => Number(text(option) || option.value)) : [];
      const offered = values.filter(value => Number.isInteger(value) && value > 0 && value < 14).sort((a, b) => a - b);
      await closeWindow(initial.dialog, 'No. of Periods');
      if (!offered.length || !values.includes(14)) return { notExercised: true, reason: 'No offered shorter No. of Periods with a return to 14.' };
      const originalIdentity = context.identity();
      try { await set(offered[0]); checkPersonIdentity(originalIdentity); return await callback({ periods: offered[0], proved: true }); }
      finally { await set(14); checkPersonIdentity(originalIdentity); }
    },
  };
}
__exports.createLiveGroups = createLiveGroups;
},
"mysource/live-pictures.js": function (__require, __exports, document, window) {
'use strict';
const { PageError } = __require("./dom.js");
const { capturePerson } = __require("../files/batch-outputs.js");
const { lastPicture } = __require("../files/capture.js");
const { createBatch } = __require("../run/batch.js");
const { checkPersonIdentity } = __require("./schedule.js");
const { showDate } = __require("./calendar.js");
const { hoverNotePicture, hoverNotes } = __require("./note-picture.js");
const { compareDays } = __require("../rules/dates.js");
const { noteTextKey } = __require("../rules/prepare.js");
function createLivePictures(context) {
  const { bounded, checked, assertSame } = context;
  return {
    async diagnosticPicture(client, copy, notes, { retake = false } = {}) {
      const scope = context.scope(), identity = context.identity();
      const inside = day => day?.y === 2028 && compareDays(day, scope.start) >= 0 && compareDays(day, scope.end) <= 0;
      await bounded(copy.window);
      if (scope.start.y !== 2028 || scope.end.y !== 2028 || copy.days.some(row => !inside(row.day))) throw new PageError('Picture checkpoint outside the owned 2028 period.');
      const days = copy.days.filter(row => row.client === client).sort((a,b) => compareDays(a.day,b.day));
      if (!days.length || !['Leave of Absence (LOA)', 'Do Not Schedule (DNS)'].includes(client)) throw new PageError('No owned LOA or DNS days for the picture.');
      await assertSame(copy, copy.window);
      const start = days[0].day, end = days.at(-1).day;
      await showDate(start, { cellProof: true }); await checked();
      const hover = await hoverNotePicture(client, copy.days, notes);
      try {
        if (!hoverNotes(hover.tooltip.textContent).some(words => noteTextKey(words) === noteTextKey(notes))) throw new PageError('The actual hover note differs from the diagnostic notification.');
      } finally { hover.cleanup(); }
      const action = client === 'Leave of Absence (LOA)' ? 'add' : 'dns';
      const backup = { diagnostic: true, window: copy.window, days: copy.days };
      const prepared = { diagnostic: true, identity, backup, copy };
      const result = { diagnostic: true, after: copy };
      const one = { record: { number: 'diagnostic', email: context.email(), person: { professional: identity.name.split('(')[0].trim() } }, decision: { plan: {
        action, notes, ...(action === 'add' ? { loaStart: start, loaEnd: end } : { dnsStart: start, dnsEnd: end }),
      } } };
      const row = { state: 'done', one, prepared, result, after: copy, diagnostic: { steps: [], paint: [] } };
      const before = JSON.stringify({ prepared, result });
      const measurements = target => {
        const blobs = target.one.outputs?.screenshots || [];
        const omissions = target.diagnostic.paint.filter(item => ['name','paint','notes'].includes(item.kind));
        if (!blobs.length || !lastPicture.notesPainted || omissions.length || /Screenshot not made:|Hover note not in the picture/.test(target.one.outputs?.warnings || '')) throw new PageError('The production hover screenshot could not be proved complete.');
        return { views: blobs.length, bytes: blobs.reduce((sum, blob) => sum + blob.size, 0), notesPainted: true,
          omissions: target.diagnostic.paint.map(item => ({ kind: item.kind, count: item.count })) };
      };
      let batch;
      try {
        await capturePerson(row, { alreadyOpen: true, identity, operation: 'diagnostic picture' });
        await checked();
        const measured = measurements(row);
        const proof = { ...measured, productionCapture: true, samePerson: true };
        if (retake) {
          if (typeof context.withRetake !== 'function') throw new PageError('Diagnostic Retake guard boundary unavailable.');
          let calls = 0, freshIdentity = false;
          batch = createBatch([one], null, 'diagnostic', { today: context.today, lock: () => () => {}, capture: async (target, options) => {
            calls++;
            if (calls === 1) throw new PageError('Diagnostic capture adapter refusal before paint.', { record: false });
            checkPersonIdentity(identity, 'diagnostic retake');
            checkPersonIdentity(options.identity, 'diagnostic retake');
            freshIdentity = options.identity !== identity && options.identity.id === identity.id && options.identity.name === identity.name;
            await capturePerson(target, options);
          } });
          const target = batch.rows[0];
          Object.assign(target, { state: 'done', prepared, result, after: copy, pictureToTakeByHand: true });
          batch.state = 'complete';
          const refused = await context.withRetake(() => batch.retakePicture(0));
          const refusedBeforePaint = !refused && calls === 1 && target.pictureToTakeByHand && !target.one.outputs.screenshots.length;
          if (!refusedBeforePaint) throw new PageError('The diagnostic capture refusal was not proved.');
          await checked(); await assertSame(copy, copy.window);
          const succeeded = await context.withRetake(() => batch.retakePicture(0));
          await checked();
          const checkpointUnchanged = JSON.stringify({ prepared: target.prepared, result: target.result }) === before && target.state === 'done';
          if (!succeeded || !freshIdentity || !checkpointUnchanged) throw new PageError('The diagnostic Retake or unchanged checkpoint was not proved.');
          const retaken = measurements(target);
          proof.retake = { ...retaken, refusedBeforePaint, freshIdentity, checkpointUnchanged, productionRetake: true, attempts: calls };
        }
        await assertSame(copy, copy.window);
        return proof;
      } finally {
        if (one.outputs) one.outputs.screenshots = [];
        for (const target of batch?.rows || []) if (target.one.outputs) target.one.outputs.screenshots = [];
      }
    },
  };
}
__exports.createLivePictures = createLivePictures;
},
"screen/live-test-report.js": function (__require, __exports, document, window) {
'use strict';
const { combinedReportText, downloadRunReport } = __require("../files/run-report.js");
const { clockFace, SESSION_MS } = __require("./session-clock.js");
const { LIVE_TEST_PARTS } = __require("../run/live-proof.js");
const { el } = __require("./ui.js");
const { LIVE_TEST_STEPS, LIVE_TEST_PROBLEMS, liveTimingSummary, liveRefusalReason, liveStepTitle } = __require("../run/live-test.js");
const { GROUP_PROOFS } = __require("../run/live-groups.js");
const { usDate, readIsoDay, compareDays, workingDays } = __require("../rules/dates.js");
const { REASON_CODES } = __require("../core/run-records.js");
const { COLOURS } = __require("../family/look.js");
const date = day => day ? usDate(day) : 'Unreadable';
const range = value => value ? `${date(value.start)} – ${date(value.end)}` : 'Unreadable';
const stage = value => ({ 'open person': 'Find professional', 'load person': 'Load professional', 'move calendar': 'Move calendar' })[value] || value;
const phase = value => ({ compare: 'Compare existing schedule', calendar: 'Find calendar spot', menu: 'Open New Assignment menu', form: 'Wait for Add Assignment form', dates: 'Set dates', prove: 'Check form dates', submit: 'Find Add button', save: 'Wait for Add to finish', read: 'Read schedule', clear: 'Delete test entries', restore: 'Restore test entries' })[value] || value;
const datePair = value => value ? `${date(value.start)} – ${date(value.end)}` : 'Unreadable';
function dateLines(dates) {
  const expected = dates.form.expected;
  const lines = [`Expected dates: ${datePair(expected)} · ${expected.days ?? '?'} days · ${expected.totalHours ?? '?'} hours`];
  const describe = (name, value) => {
    lines.push(`${name}: picker ${datePair(value.picker)} · shown ${datePair(value.shown)}`,
      `${name}: boxes ${datePair(value.boxes)} · Days ${value.days ?? '?'} · Total Hours ${value.totalHours ?? '?'}`);
    if (value.selected) lines.push(`${name}: selected ${value.selected.count ?? '?'} · unique ${value.selected.unique ?? '?'} · missing ${value.selected.missing ?? '?'} · extra ${value.selected.extra ?? '?'}`);
  };
  if (dates.pickerAttempt) describe('Picker attempt', dates.pickerAttempt);
  describe(dates.typed ? 'Typing fallback' : 'Form', dates.form);
  return lines;
}
function photoReportLines(result) {
  const failed = result.steps.find(step => step.state === 'failed');
  const recovery = result.steps.find(step => step.id === 'recovery');
  const controls = recovery?.controls || failed?.controls || result.controls;
  const stages = result.events.filter(event => event.stage && ['begin', 'step'].includes(event.type));
  const lastStage = failed ? failed.lastAction || (failed.writesBefore === undefined ? stages.at(-1) : null) : stages.at(-1);
  const lines = [
    `Snooze ${result.version} · ${result.state === 'complete' ? 'Complete' : 'Stopped'} · ${liveVerdict(result).words}`,
    `Test period: ${result.week.start} – ${result.week.end}`,
    `Writes: ${result.writes} · Cleanup: ${{ empty: 'Empty and checked', notNeeded: 'Not needed', unconfirmed: 'UNCONFIRMED', pending: 'Pending' }[result.cleanup] || 'Unknown'}`,
    `Steps: ${result.steps.filter(step => step.state === 'passed' && !step.notExercised).length} passed · ${failed ? `Failed: ${liveStepTitle(failed)}` : 'No failed step'}`,
  ];
  const unexercised=result.steps.filter(step=>step.state==='notExercised'||step.notExercised);
  if (unexercised.length) lines.push(`Not exercised: ${unexercised.map(liveStepTitle).join('; ')}`);
  for (const step of unexercised) {
    const reason = liveRefusalReason(step);
    if (reason) lines.push(reason);
  }
  if (lastStage) lines.push(`Last action: ${stage(lastStage.stage)} · ${lastStage.ok === true ? 'Passed' : lastStage.ok === false ? 'Failed' : 'Started'}`);
  if (failed) lines.push(`Error: ${REASON_CODES.has(failed.code || result.code) ? failed.code || result.code : 'Unknown'} · ${failed.seconds ?? '?'} seconds`);
  if (failed && Object.hasOwn(LIVE_TEST_PROBLEMS, failed.problem)) lines.push(LIVE_TEST_PROBLEMS[failed.problem]);
  if (LIVE_TEST_PARTS.has(failed?.part)) lines.push(failed.part);
  if (failed?.phase) lines.push(`Stopped at: ${phase(failed.phase)} · writes in this step ${failed.writesAfter - failed.writesBefore}`);
  if (failed?.dates) lines.push(...dateLines(failed.dates));
  if (failed?.waitFor) lines.push(`Not confirmed: ${failed.waitFor}`);
  if (recovery) lines.push(`Cleanup: ${recovery.state === 'passed' ? 'Passed' : 'Failed'}${recovery.code ? ` · ${REASON_CODES.has(recovery.code) ? recovery.code : 'Unknown'}` : ''} · ${recovery.seconds ?? '?'} seconds`);
  if (recovery?.waitFor) lines.push(`Cleanup did not confirm: ${recovery.waitFor}`);
  const deleteDiagnostics = recovery?.deleteDiagnostics || failed?.deleteDiagnostics;
  if (deleteDiagnostics) {
    const info = deleteDiagnostics;
    lines.push(`Delete clicks (popup/Yes/No): open ${info.opened ?? '?'}; ready ${info.ready ?? '?'}`,
      `After Yes ${info.pressed ?? '?'}; stopped ${info.stopped ?? '?'}; script errors ${info.scriptErrors ?? '?'}`);
    if (info.atYes) lines.push(`At Yes: opening ${info.atYes.transitioning === true ? 'BUSY' : info.atYes.transitioning === false ? 'finished' : 'unknown'} · shown event ${info.atYes.shownObserved === true ? 'seen' : info.atYes.shownObserved === false ? 'not seen' : 'unknown'} · active animations ${info.atYes.animations ?? '?'}`);
  }
  if (controls?.calendar) {
    const calendar = controls.calendar;
    lines.push(`Calendar heading: ${range(calendar.heading)}`,
      `Dated cells: ${calendar.cells.count} · ${date(calendar.cells.first)} – ${date(calendar.cells.last)}`);
  }
  if (controls) {
    const visible = controls.windows.filter(modal => modal.visible);
    lines.push(`Open windows (${recovery?.controls ? 'after cleanup failed' : failed?.controls ? 'at failure' : 'at finish'}): ${visible.length ? visible.map(modal => `${modal.kind} (${modal.rows} rows)`).join('; ') : 'None'}`,
      `Hidden windows: ${controls.windows.length - visible.length} · Loading covers: ${controls.covers.length}`);
    for (const modal of visible) {
      const buttons = modal.buttons.filter(button => button.visible);
      for (const button of buttons.filter(button => button.label !== 'Other').slice(0, 6)) lines.push(`${modal.kind} / ${button.label}: ${button.disabled ? 'Disabled' : 'Enabled'} · Pointer ${button.receivesPointer === true ? 'reaches button' : button.receivesPointer === false ? 'blocked' : 'unknown'} · Click handlers ${button.handlers?.click ?? '?'}`);
      const others = buttons.filter(button => button.label === 'Other').length;
      if (others) lines.push(`${modal.kind}: ${others} other visible controls`);
    }
    lines.push(`Document click handlers: ${controls.documentHandlers?.click ?? '?'}`);
  }
  const waits = failed?.writesBefore !== undefined ? [] : result.events.filter(event => ['waiting', 'miss'].includes(event.type) && event.name).slice(-3);
  for (const event of waits) lines.push(`${event.type === 'miss' ? 'Not confirmed' : 'Wait'}: ${event.name}`);
  for (const picture of result.pictures) lines.push(`${picture.kind.toUpperCase()} picture: note ${picture.notesPainted ? 'painted' : 'UNCONFIRMED'}${picture.views ? ` · ${picture.views} views` : ''} · omitted items ${Array.isArray(picture.omissions) ? picture.omissions.reduce((sum, item) => sum + item.count, 0) : picture.omissions || 0}`);
  return lines;
}
const measured = value => Number.isFinite(value) && value >= 0 ? value.toFixed(2) : 'Could not check';
const status = step => step?.state === 'notExercised' || step?.notExercised && step.state === 'passed' ? 'Not exercised' : step?.state === 'passed' ? 'PASS' : step?.state === 'failed' ? 'Failed' : 'Could not check';
const ERROR_SENTENCES = {
  pageTimeout: 'The page did not finish within its wait limit.',
  identityChanged: 'The shown professional changed. The test stopped.',
  sessionExpired: 'The session expired. The test stopped.',
  allowedDatesUnreadableOrOutside: 'The required dates were outside the allowed range or the limits could not be read.',
};
function limitsLines(result) {
  const probes = result.dateGuard?.probes || [];
  const limit = probes.find(probe => probe.limits)?.limits;
  if (!limit) return ['Add date limits: Could not check', 'Last enabled Add date: Could not check'];
  const low = limit.low ? usDate(limit.low) : 'No lower limit read';
  const high = limit.high ? usDate(limit.high) : 'No upper limit read';
  const allowed = [];
  for (const probe of probes.filter(probe => probe.result === 'allowed')) {
    if (probe.label === 'requiredDates') {
      const parse = text => { const match = /^(\d{2})\/(\d{2})\/(2028)$/.exec(text); return match ? readIsoDay(`${match[3]}-${match[1]}-${match[2]}`) : null; };
      const start = parse(result.week.start), end = parse(result.week.end);
      if (start && end) allowed.push(...workingDays(start,end));
    }
  }
  const enabled = limit.high && allowed.some(day => compareDays(day,limit.high) === 0);
  return [`Add date limits: ${low} to ${high}`, `Last enabled Add date: ${enabled ? high : 'Could not check'}`];
}
function liveVerdict(result) {
  const final = result.steps.find(step=>step.id==='cleanup');
  const passed = result.state==='complete' && result.cleanup==='empty' && final?.state==='passed' && result.steps.every(step=>['passed','notExercised'].includes(step.state));
  if (!passed) return { words: 'FAIL', colour: 'red' };
  const unexercised = result.steps.filter(step=>step.state==='notExercised'||step.notExercised).length;
  return unexercised ? { words: `PASS · ${unexercised} step${unexercised === 1 ? '' : 's'} not exercised`, colour: 'amber' } : { words: 'PASS', colour: 'green' };
}
function fitPhotoReport(box, { height = box.ownerDocument.defaultView?.innerHeight } = {}) {
  const titles = [...box.querySelectorAll('[data-photo-page-title]')];
  for (const title of titles) title.hidden = true;
  const rect = box.getBoundingClientRect();
  const available = Number.isFinite(height) ? Math.max(0, height - Math.max(0, rect.top) - 88) : Infinity;
  const split = Math.max(rect.height, box.scrollHeight) > available;
  for (const title of titles) title.hidden = !split;
  box.dataset.photoSplit = String(split);
  const steps = box.querySelector('[data-photo-page="steps"]');
  steps.style.breakBefore = split ? 'page' : 'auto';
  steps.style.marginTop = split ? '18px' : '10px';
  return split;
}
function renderPhotoReport(result) {
  const box = el('div', { role: 'region', 'aria-label': 'Photo report' });
  Object.assign(box.style,{font:'15px/1.35 Segoe UI, sans-serif',color:COLOURS.text,background:COLOURS.page});
  const final = result.steps.find(step=>step.id==='cleanup');
  const verdict = liveVerdict(result);
  const finalCheck = final?.state === 'passed' && result.cleanup === 'empty' ? 'PASS'
    : !final && result.state === 'failed' && result.cleanup === 'empty' ? 'not run, the test stopped'
      : final?.state === 'failed' && !['pageUnreadable', 'pageTimeout'].includes(final.code) ? 'FAIL' : 'Could not check';
  const failed = result.steps.find(step=>step.state==='failed');
  const errorCode = REASON_CODES.has(failed?.code || result.code) ? failed?.code || result.code : 'unknownFailure';
  const problem = Object.hasOwn(LIVE_TEST_PROBLEMS, failed?.problem) ? LIVE_TEST_PROBLEMS[failed.problem] : null;
  const explanation = failed || result.state==='failed' ? problem || ERROR_SENTENCES[errorCode] || 'The test result could not be confirmed. Read the detail before another test.' : 'Error: None';
  const timing = { ...liveTimingSummary(result.events), ...result.timings };
  const blockSeconds = block => {
    if (result.timings?.blocks && Object.hasOwn(result.timings.blocks, block)) return result.timings.blocks[block];
    const steps = result.steps.filter(step=>step.id.startsWith(block.toLowerCase()) && /^.[A-Z]/.test(step.id));
    return steps.length && steps.every(step=>Number.isFinite(step.seconds)) ? steps.reduce((sum,step)=>sum+step.seconds,0) : null;
  };
  const unchanged = [result.steps.some(step=>step.id==='aCancel'&&step.state==='passed') ? 'saved rows after Cancel' : null, result.steps.some(step=>step.id==='bRestore'&&step.state==='passed') ? 'retained LOA in B' : null].filter(Boolean);
  const section=el('section',{'aria-label':'Live test report'});
  Object.assign(section.style,{padding:'12px',background:COLOURS.surface,borderRadius:'8px'});
  const resultPage=el('div',{'data-photo-page':'result'}), stepsPage=el('div',{'data-photo-page':'steps'});
  const title=(key,words)=>el('h3',{'data-photo-page-title':key,hidden:true,style:'font-size:16px;margin:0 0 8px'},words);
  resultPage.append(title('result','Photo 1: result'));
  stepsPage.append(title('steps','Photo 2: steps'));
  resultPage.append(el('div',{},`Snooze ${result.version}`));
  const badge=el('div',{'data-photo-verdict':true,role:'status'});
  const sign=verdict.colour==='green'?'✓':verdict.colour==='amber'?'⚠':'✗';
  Object.assign(badge.style,{background:COLOURS.page,color:COLOURS[verdict.colour],border:`1px solid ${COLOURS[verdict.colour]}`,padding:'12px 14px',borderRadius:'8px',fontSize:'28px',fontWeight:'800',lineHeight:'1.15',margin:'6px 0 10px'});
  badge.append(el('div',{},`${sign} ${verdict.words}`),el('div',{style:'font-size:15px;font-weight:600;margin-top:5px'},`Test entries cleaned up: ${['empty','notNeeded'].includes(result.cleanup)?'yes':'NO'} · ${result.writes} writes`));
  resultPage.append(badge);
  const lines = photoReportLines(result);
  const facts=el('div',{style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px'});
  const fact=(name,values)=>{
    const node=el('div',{'data-photo-facts':name});
    Object.assign(node.style,{fontSize:'15px',background:COLOURS.page,border:`1px solid ${COLOURS.divider}`,borderRadius:'8px',padding:'8px 10px',overflowWrap:'anywhere'});
    node.append(el('h3',{style:'font-size:15px;margin:0 0 6px'},name));
    for (const value of values) node.append(el('div',{},value));
    facts.append(node); return node;
  };
  fact('Result',[
    `Steps: ${result.steps.filter(step=>step.state==='passed'&&!step.notExercised).length} passed / ${result.steps.length}`,
    `Writes attempted: ${result.writes} / ${result.expectedWrites ?? (result.length==='year'?37:29)} expected on the happy path`,
    `Final empty-period check: ${finalCheck}`,
    lines[2].slice(lines[2].indexOf('Cleanup: ')),
    `Unchanged checks: ${unchanged.join('; ') || 'Could not check'}`,
    'Scope: one professional, selected 2028 period only.',
  ]);
  const waits=timing.waits || [], saves=timing.saves || [];
  const slow=waits.filter(row=>Number.isFinite(row.seconds)).sort((a,b)=>b.seconds-a.seconds)[0];
  fact('Timing',[
    `Whole run: ${measured(timing.seconds)} seconds`,
    ...['A','B','C'].map(block=>`Seconds: ${block} ${measured(blockSeconds(block))}`),
    `Waits: ${waits.length} / ${measured(timing.waitSeconds)}s`,
    `Saves: ${saves.length} / ${measured(timing.saveSeconds)}s`,
    `Slowest wait: ${slow ? measured(slow.seconds)+'s / '+measured(slow.ceiling)+'s limit' : 'Could not check'}`,
    ...(slow?.step?[`Slowest wait step: ${LIVE_TEST_STEPS[slow.step] || 'Could not check'} · ${slow.name} · ${slow.result}`]:[]),
  ]);
  const periodsProved=result.steps.some(step=>step.proofs?.some(proof=>proof.id==='periods'&&proof.state==='passed'));
  fact('Page limits',[`Test period: ${result.week.start} – ${result.week.end}`,`Periods: ${periodsProved?'14':'Could not check'}`,...limitsLines(result)]);
  resultPage.append(facts);
  if (result.cleanup === 'unconfirmed') resultPage.append(el('div',{style:`color:${COLOURS.amber};font-weight:700`},'⚠ Test entries may remain. Send this photo before another test.'));
  const table=el('table',{'aria-label':'All test steps',style:'width:100%;border-collapse:collapse;margin-top:6px;font-size:14px;font-variant-numeric:tabular-nums'},
    el('thead',{},el('tr',{},...['Step','Result','Writes'].map(word=>el('th',{style:'text-align:left;padding:5px 8px'},word)))));
  const rows=el('tbody');
  const rank=step=>step.state==='failed'?0:step.state==='notExercised'||step.notExercised?1:step.state==='passed'?2:1;
  const ordered=result.steps.map((step,offset)=>({step,offset})).sort((a,b)=>rank(a.step)-rank(b.step)||a.offset-b.offset);
  for(const {step,offset} of ordered) {
    const row=el('tr',{'data-photo-step':offset+1});
    const state=status(step), times=step.timings || liveTimingSummary(result.events.filter(event=>event.step===step.id));
    const durations=rows=>rows.every(row=>Number.isFinite(row.seconds)) ? rows.reduce((sum,row)=>sum+row.seconds,0).toFixed(2) : '?';
    const signed=state==='PASS'?'✓ PASS':state==='Failed'?'✗ Failed':`⚠ ${state}`;
    if(rank(step)<2)row.style.background=rank(step)===0?'rgba(201,121,114,0.14)':'rgba(201,170,104,0.12)';
    const words=el('td',{},`${offset+1}. ${liveStepTitle(step)}`,el('div',{'data-photo-seconds':true,style:'font-size:12px'},`Seconds (total / waits / saves): ${Number.isFinite(step.seconds)?step.seconds.toFixed(2):'?'} / ${durations(times.waits)} / ${durations(times.saves)}`));
    row.append(words,el('td',{style:`color:${state==='PASS'?COLOURS.greenText:state==='Failed'?COLOURS.redText:COLOURS.amber};font-weight:bold`},signed),el('td',{},Number.isFinite(step.writesAfter-step.writesBefore)?step.writesAfter-step.writesBefore:'?'));
    for (const check of step.proofs || []) if (Object.hasOwn(GROUP_PROOFS, check.id)) words.append(el('div',{},`${check.state === 'passed' ? '✓ Proved' : '⚠ Not exercised'}: ${GROUP_PROOFS[check.id]}`));
    if (step.group) words.append(el('div',{},`Find opens: ${step.finds ?? '?'} · Reads: ${step.reads ?? '?'}`));
    const reason = [liveRefusalReason(step),LIVE_TEST_PARTS.has(step.part)?step.part:null].filter(Boolean).join(' ');
    if (reason) words.append(el('div',{},reason));
    for (const cell of row.children) Object.assign(cell.style,{padding:'5px 8px',verticalAlign:'top',borderTop:`1px solid ${COLOURS.divider}`});
    rows.append(row);
  }
  table.append(rows);
  stepsPage.append(table,el('div',{style:`margin-top:6px;font-size:12px;color:${COLOURS.muted}`},'Wait and save times overlap. Do not add them to the step time.'));
  const failure=el('div',{'data-photo-failure':true,style:`border-top:1px solid ${COLOURS.divider};padding-top:8px;margin-top:10px`},
    el('strong',{},'If something failed'),el('div',{style:`margin:5px 0;color:${failed?COLOURS.redText:COLOURS.text}`},explanation));
  const diagnostics=el('div',{'data-photo-diagnostics':true,style:'display:block;font-size:13px;overflow-wrap:anywhere'});
  if (!failed && result.state==='failed') diagnostics.append(el('div',{},`Error: ${errorCode}`));
  for (const line of lines.slice(4)) diagnostics.append(el('div',{},line));
  failure.append(diagnostics);resultPage.append(failure);
  const timings=el('details',{},el('summary',{},'Every wait and save: seconds, limit and result'));
  result.steps.forEach((step,index)=>{
    const times=step.timings || liveTimingSummary(result.events.filter(event=>event.step===step.id));
    for(const [kind,rows] of [['Wait',times.waits],['Save',times.saves]]) for(const [number,row] of rows.entries()) timings.append(el('div',{},`${index+1}. ${LIVE_TEST_STEPS[step.id] || 'Could not check'} · ${kind} ${number+1}: ${row.name} · ${measured(row.seconds)}s / ${measured(row.ceiling)}s limit · ${row.result}`));
  });
  stepsPage.append(timings,el('div',{style:'margin-top:8px;font-weight:700'},'Send a photo of this report.'));
  section.append(resultPage,stepsPage);box.append(section);
  return box;
}
const styled = (node, style) => { Object.assign(node.style, style); return node; };
const heading = text => styled(el('h3', {}, text), { fontSize: '11px', margin: '6px 0 3px' });
function table(headers) {
  const node = styled(el('table'), { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', font: 'inherit' });
  const head = el('tr', {}, headers.map(text => styled(el('th', {}, text), { textAlign: 'left', padding: '2px 3px', borderBottom: `1px solid ${COLOURS.grey}` })));
  const body = el('tbody'); node.append(el('thead', {}, head), body); return { node, body };
}
function cells(values, attributes = {}, compact = false) {
  return el('tr', attributes, values.map(value => styled(el('td', {}, value), { padding: `${compact ? 1 : 2}px 3px`, verticalAlign: 'top', overflowWrap: 'anywhere', borderBottom: `1px solid ${COLOURS.divider}` })));
}
function section(lines, title, next) {
  const start = lines.indexOf(title);
  if (start < 0) return [];
  const end = next ? lines.indexOf(next, start + 1) : lines.length;
  return lines.slice(start + 1, end < 0 ? lines.length : end).filter(Boolean);
}
const pairs = line => new Map(line.split('; ').map(part => {
  const match = part.match(/^(.*?) (not recorded|yes|no|-?\d+)$/);
  return match ? [match[1], match[2]] : [part, ''];
}));
const flags = (facts, keys) => keys.map(key => facts.get(key) ?? '?').join('/');
function renderRunReport(work) {
  const text = combinedReportText(work.batch, work.version, work.pageInfo), lines = text.split('\n');
  const compact = (work.batch?.rows?.length || 0) > 12 || (globalThis.window?.innerHeight || Infinity) < 800;
  const report = styled(el('section', { role: 'region', 'aria-label': 'Batch run report' }), {
    fontFamily: 'Segoe UI, sans-serif', fontSize: compact ? '10px' : '11px', lineHeight: compact ? '1.1' : '1.15', color: COLOURS.text,
    background: COLOURS.surface, padding: '10px', borderRadius: '8px',
  });
  const overview = el('div', { 'data-report-overview': true });
  overview.append(styled(el('strong', {}, `Snooze ${/^\d+\.\d+\.\d+$/.test(work.version) ? work.version : 'unknown'} · Run report`), { fontSize: '13px' }));
  for (const line of lines.filter(line => /^(Date:|Batch:|Counts:|Paused:|Run reason:)/.test(line))) overview.append(el('div', {}, line));
  const left = (work.batch?.clock || work.clock)?.left?.();
  overview.append(el('div', {}, `Session time: ${Number.isFinite(left) ? `${clockFace(SESSION_MS - left).text} elapsed; ${clockFace(left).text} left` : 'not recorded'}`));
  const columns = styled(el('div', { 'data-report-columns': true }), { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' });
  const people = el('div'), checks = el('div'); columns.append(people, checks); overview.append(columns);
  people.append(heading('People'));
  const persons = table(['# / change and dates', 'Result / reason', 'Method', 'Time / picture']);
  const starts = lines.map((line, index) => /^#\d+ (?:LOA|Exit|unknown); rule /.test(line) ? index : -1).filter(index => index >= 0);
  const saves = [];
  for (const [index, start] of starts.entries()) {
    const end = starts[index + 1] ?? lines.indexOf('Page structure misses:');
    const block = lines.slice(start, end < 0 ? lines.length : end);
    const match = block[0].match(/^#(\d+) (LOA|Exit|unknown); rule ([^;]+); mail ([^;]+); ([^;]+); (.*?); Time: ([^;]+); method: ([^;]+); Screenshots: (.*?); painter omissions:/);
    if (!match) continue;
    const [, id, kind, , , state, change, time, method, picture] = match;
    const reason = block.find(line => line.startsWith('Reason:'));
    const reasonWords = compact ? reason?.split('; failed stage:')[0] : reason;
    const pictureFailed = picture.includes('picture to take by hand') || block.some(line => /^Step: screenshot .*; failed/.test(line));
    const pictureWords = pictureFailed ? `${picture.startsWith('not made') ? 'failed' : picture.split(';')[0] + '; failed'}; take by hand` : picture;
    persons.body.append(cells([`#${id} ${kind}\n${change}`, `${state}${reasonWords ? '\n' + reasonWords : ''}`, method, `${time}\nPicture: ${pictureWords}`], { 'data-report-person': id }, compact));
    for (const line of block.filter(line => line.startsWith('Step:'))) {
      if (/Submit|save|Delete All|Add Assignment/.test(line)) saves.push(`#${id} ${line.slice(6)}; limit not recorded`);
    }
  }
  persons.node.style.whiteSpace = 'pre-line'; people.append(persons.node);
  checks.append(heading('Person identity checks'));
  const identities = table(['# / stage / operation', 'Name', 'ID', 'Calendar']);
  const identityLines = section(lines, 'Person identity checks:', 'Find Assignments sub-steps:');
  const lengths = new Map();
  for (const line of identityLines.filter(line => /name spacing\/case only/.test(line))) {
    const id = line.match(/^#([^ ]+)/)?.[1];
    lengths.set(id, [...(lengths.get(id) || []), line]);
  }
  for (const line of identityLines.filter(line => /; names /.test(line))) {
    const parts = line.split('; '), id = parts[0].slice(1), facts = pairs(line), length = pairs(lengths.get(id)?.shift() || '');
    identities.body.append(cells([
      `${parts[0]} ${parts[1]} / ${parts[2]}`,
      `${flags(facts, ['names', 'name present', 'expected name present', 'name equal'])}; ${flags(length, [`#${id} name spacing/case only`, 'name length difference'])}`,
      flags(facts, ['IDs', 'ID readable', 'expected ID readable', 'ID equal']),
      flags(facts, ['calendar present', 'calendar ambiguous', 'loading cover']),
    ], { 'data-identity-check': id }, compact));
  }
  checks.append(el('div', {}, 'Name: count/present/expected/equal; spacing-case only/length difference. ID: count/readable/expected/equal. Calendar: present/ambiguous/cover. ? = not recorded.'), identities.node);
  if (!identities.body.children.length) checks.append(el('div', {}, 'none recorded'));
  checks.append(heading('Schedule page checks'));
  for (const line of section(lines, 'Schedule page checks:', 'Person identity checks:')) checks.append(el('div', {}, line));
  checks.append(heading('Slowest waits and saves'));
  const waits = section(lines, 'Waits:').filter(line => line !== 'none recorded');
  const slow = [...waits, ...saves].sort((a, b) => Number(b.match(/ (\d+(?:\.\d+)?) s/)?.[1] || 0) - Number(a.match(/ (\d+(?:\.\d+)?) s/)?.[1] || 0));
  for (const line of slow.slice(0, 5)) checks.append(el('div', {}, line));
  if (!slow.length) checks.append(el('div', {}, 'none recorded'));
  checks.append(el('div', {}, 'All waits, saves and limits are in Diagnostic facts below.'));
  checks.append(heading('Find Assignments sub-steps'));
  const find = new Map();
  for (const line of section(lines, 'Find Assignments sub-steps:', 'Tab visibility:')) {
    const match = line.match(/^(#\d+); (.*)$/);
    if (match) find.set(match[1], [...(find.get(match[1]) || []), match[2]]);
  }
  for (const [person, steps] of find) checks.append(el('div', {}, `${person}: ${steps.join('; ')}`));
  if (!find.size) checks.append(el('div', {}, 'none recorded'));
  overview.append(styled(el('div', {}, 'Send a photo of this report.'), { fontWeight: '700', marginTop: '6px' }));
  const arrow = el('span', { 'aria-hidden': true }, '▸ ');
  const details = el('details', {}, el('summary', {}, arrow, 'Diagnostic facts · all recorded lines'));
  details.addEventListener('toggle', () => { arrow.textContent = details.open ? '▾ ' : '▸ '; });
  const facts = styled(el('div'), { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', columns: '2', columnGap: '12px', marginTop: '6px' });
  for (const line of lines) facts.append(el('div', { 'data-report-line': true }, line));
  details.append(facts); report.append(overview, details); return report;
}
function mountRunReport(work, body, onBack, { download = downloadRunReport } = {}) {
  const panel = body.closest('.panel'), width = panel?.style.width || '';
  const wasOpen = panel?.classList.contains('restore-open');
  const refresh = work.refreshClockControls; work.refreshClockControls = null;
  panel?.classList.add('restore-open'); if (panel) panel.style.width = '1280px';
  work.setScreenTitle?.('Run report');
  const box = styled(el('div', { class: 'restore-screen' }), { overflow: 'auto', maxHeight: 'calc(100vh - 90px)' });
  const warning = el('div', { role: 'status', class: 'restore-warning' });
  const back = el('button', { class: 'grey', onclick: () => {
    if (!wasOpen) panel?.classList.remove('restore-open'); if (panel) panel.style.width = width;
    work.refreshClockControls = refresh; work.setScreenTitle?.(''); onBack();
  } }, 'Back');
  const save = el('button', { class: 'blue', onclick: async () => {
    try { await download(work); } catch { warning.textContent = 'Download did not finish. Try Download report again.'; }
  } }, 'Download report');
  box.append(renderRunReport(work), warning, el('div', { class: 'restore-footer' }, el('div', { class: 'buttons' }, back, save)));
  body.replaceChildren(box);
}
function runReportScreenButton(work, body, onBack) {
  return el('button', { class: 'grey', onclick: () => mountRunReport(work, body, onBack) }, 'Run report');
}
__exports.photoReportLines = photoReportLines;
__exports.liveVerdict = liveVerdict;
__exports.fitPhotoReport = fitPhotoReport;
__exports.renderPhotoReport = renderPhotoReport;
__exports.renderRunReport = renderRunReport;
__exports.mountRunReport = mountRunReport;
__exports.runReportScreenButton = runReportScreenButton;
},
"screen/live-test-panel.js": function (__require, __exports, document, window) {
'use strict';
const { shortLiveReport, liveEventLog } = __require("../run/live-diagnostics.js");
const { reportAssignPeriod } = __require("../files/report.js");
const { el, saveFile } = __require("./ui.js");
const { newBatchPopup } = __require("./batch-panel.js");
const { batchCover } = __require("../mysource/batch.js");
const { liveTestPage } = __require("../mysource/live-test.js");
const { renderPhotoReport, fitPhotoReport } = __require("./live-test-report.js");
const { runLiveTest, liveStepTitle, LIVE_TEST_PROBLEMS, liveRefusalReason } = __require("../run/live-test.js");
const { taxTestPeriod, smallTestPeriod } = __require("../run/live-proof.js");
const { readSite } = __require("../mysource/site.js");
const { todayOf } = __require("../rules/dates.js");
function liveTestButton(work, body, onBack) {
  let site = null;
  try { site = readSite(); } catch {   }
  const notice = el('div', { class: 'restore-warning', role: 'status' });
  const button = el('button', { disabled: !!work.busy, onclick: () => {
    if (!work.busy) {
      try { site = readSite(); }
      catch { notice.textContent = "Can't tell which MySource this is."; return; }
      mountLiveTestPanel(work, body, onBack, { mode: site });
    }
  } }, site ? `Live test · ${site === 'tax' ? 'Tax' : 'Consulting'}` : 'Live test');
  if (!site) notice.textContent = "Can't tell which MySource this is.";
  work.listeners?.add(() => { button.disabled = !!work.busy; });
  return el('div', { class: 'live-test-entry' }, button, notice);
}
function mountLiveTestPanel(work, body, onBack, { mode = 'consulting', page, run = runLiveTest, save = saveFile } = {}) {
  if (work.busy) return;
  work.setScreenTitle?.(mode === 'tax' ? 'Tax live test · 2028' : 'Live test · 2028'); work.refreshClockControls = null;
  const panel = body.closest('.panel'); panel?.classList.add('restore-open');
  const originalWidth = panel?.style.width || '';
  let result = null, active = false, slow = false, notice = '', photo = false;
  const email = el('input', { type: 'email', autocomplete: 'off', placeholder: 'Professional email', 'aria-label': 'Professional email' });
  const box = el('div', { class: 'restore-screen' }); body.replaceChildren(box);
  const back = el('button', { class: 'grey', onclick: () => {
    if (active) return;
    const leave = () => {
      work.liveTest = null;
      panel?.classList.remove('restore-open'); if (panel) panel.style.width = originalWidth; work.setScreenTitle?.(''); onBack();
    };
    if (result && !work.liveTest?.saved) newBatchPopup({ ...work, saved: false }, leave);
    else leave();
  } }, 'Back');
  async function download() {
    const live = work.liveTest;
    const saving = save('Snooze live test 2028.txt', shortLiveReport(result), 'text/plain');
    if (!saving?.then && live) live.saved = true;
    await saving;
    if (work.liveTest === live && live) live.saved = true;
  }
  async function start() {
    if (active || work.busy || result) return;
    try { if (mode === 'tax') taxTestPeriod(todayOf(), { small: true }); else smallTestPeriod(todayOf()); if (!email.value.trim() || !email.checkValidity()) throw new Error('Enter a valid professional email.'); }
    catch (error) { notice = error.message; draw(); return; }
    active = work.busy = true; notice = ''; work.host.dataset.batchReserved = 'true';
    work.liveTest = { active: true, changed: false, saved: false };
    const release = batchCover(work.host, work.host);
    let timer;
    try {
      result = await run({ email: email.value.trim(), mode, small: true, length: 'twelveWeeks', version: work.version, assignPeriod: reportAssignPeriod(work.staffReport, email.value.trim()), extended: true, onUpdate: value => {
        result = value; slow = false; clearTimeout(timer);
        work.liveTest.changed ||= value.writes > 0;
        if (value.steps.at(-1)?.state === 'running') timer = setTimeout(() => { slow = true; draw(); }, 15000);
        draw();
      } }, page || liveTestPage({ mode, small: true }));
    } catch {
      notice = 'The live test could not start. No test result was confirmed.';
    } finally {
      clearTimeout(timer); release(); active = work.busy = false; slow = false;
      work.liveTest.active = false; work.liveTest.result = !!result; work.liveTest.changed ||= result?.writes > 0;
      delete work.host.dataset.batchReserved; photo = !!result && (mode === 'consulting' || result.design === 'tax5'); draw(); for (const listener of work.listeners) listener();
    }
  }
  const go = el('button', { class: 'green', onclick: () => start() }, 'Run live test');
  const downloadButton = el('button', { class: 'blue', onclick: () => download().catch(() => {
    notice = 'Download did not finish. Try Download report again.'; draw();
  }) }, 'Download report');
  const logButton = el('button', { class: 'grey', style: 'font-size:12px;padding:5px 8px', onclick: async () => {
    try { await save('Snooze live test 2028 log.txt', liveEventLog(result), 'text/plain'); }
    catch { notice = 'Download did not finish. Try Download log again.'; draw(); }
  } }, 'Download log');
  function draw() {
    const scroll = box.querySelector('.restore-list')?.scrollTop || 0;
    if (panel) panel.style.width = photo ? 'min(1280px, calc(100vw - 32px))' : originalWidth;
    box.style.overflow = photo ? 'auto' : '';
    box.replaceChildren(); email.disabled = active || !!result;
    back.disabled = active; go.disabled = active || !!result; downloadButton.disabled = active; logButton.disabled = active;
    if (photo && result && !active) {
      const small = ['small7','tax5'].includes(result.design) || !Array.isArray(result.events);
      const report = small ? el('div', { role: 'region', 'aria-label': 'Photo report' },
        el('pre', { style: 'font:13px/1.35 Consolas,monospace;white-space:pre;margin:0' }, shortLiveReport(result))) : renderPhotoReport(result);
      box.append(report);
      if (notice) box.append(el('div', { class: 'restore-warning', role: 'status' }, notice));
      box.append(el('div', { class: 'restore-footer' }, el('div', { class: 'buttons' }, back, downloadButton, logButton)));
      if (!small) {
        fitPhotoReport(report);
        window.requestAnimationFrame?.(() => { if (report.isConnected) fitPhotoReport(report); });
      }
      return;
    }
    if (!result) {
      box.append(el('label', { class: 'sign-off' }, 'Professional email', email),
        el('div', { class: 'restore-notice' }, mode === 'tax' ? 'April 3–June 23, 2028 · twelve Monday–Friday weeks' : 'May 1–July 21, 2028 · twelve Monday–Friday weeks'),
        el('div', { class: 'restore-notice' }, mode === 'tax' ? 'Checks an empty span with LOA, DNS, Holiday and Undo, then clears its entries. Separately lowers and restores this week’s past Monday only when exactly one eligible entry is present.' : 'One Consulting and A&A test: open and read, Add, Change, Delete, Picture, Undo and Clear. Run once with a Weekly person and once with a Time person.'));
    } else {
      box.append(el('div', { class: 'restore-top' }, el('strong', {}, (active ? 'Testing…' : result.state === 'complete' ? 'Tests complete' : 'Test stopped'))),
        el('div', { class: 'restore-notice' }, `${result.week.start} – ${result.week.end}`));
      const list = el('div', { class: 'restore-list', role: 'log', 'aria-label': 'Test results' });
      for (const step of result.steps) {
        const row = el('div', { class: 'restore-person' }, el('div', { class: 'restore-main' },
        el('strong', {}, liveStepTitle(step)), el('span', { class: step.state==='failed'?'failed':step.state==='notExercised'||step.notExercised?'warn':'restore-state' },
          step.state === 'running' ? slow ? 'Still loading…' : 'Running…' : step.state === 'notExercised'||step.notExercised ? 'Not exercised' : step.state === 'passed' ? mode === 'audit' ? 'PASS' : '✓' : mode === 'audit' ? 'FAIL' : 'Failed')));
        const reason = liveRefusalReason(step);
        if (reason) row.append(el('div', { class: 'reason' }, reason));
        list.append(row);
      }
      box.append(list); list.scrollTop = scroll;
      const failed = result.steps.find(step => step.state === 'failed');
      if (failed && Object.hasOwn(LIVE_TEST_PROBLEMS, failed.problem)) box.append(el('div', { class: 'restore-warning', role: 'status' }, LIVE_TEST_PROBLEMS[failed.problem]));
      if (mode === 'tax' && !active && result.cleanup === 'unconfirmed') box.append(el('div', { class: 'restore-warning', role: 'status' }, 'Cleanup UNCONFIRMED. Test entries or lowered Monday hours may remain.'));
      if (mode === 'audit' && !active) {
        box.append(el('div', { class: result.cleanup === 'unconfirmed' ? 'restore-warning' : 'restore-notice', role: 'status' },
          result.cleanup === 'empty' ? 'Test span empty and checked.' : result.cleanup === 'notNeeded' ? 'No test changes.' : 'Cleanup UNCONFIRMED. Test entries may remain.'));
        if (result.cleanup === 'unconfirmed') for (const row of result.outstanding || []) box.append(el('div', { class: 'restore-warning' }, `${row.date}: ${row.rows === null ? 'Unconfirmed' : row.rows} rows`));
      }
    }
    if (result?.state === 'paused') {
      box.append(el('div', { class: 'restore-warning', role: 'status' }, result.message));
      box.append(el('button', { class: 'amber', onclick: () => result.resume?.() }, 'Resume'));
    }
    if (notice) box.append(el('div', { class: 'restore-warning', role: 'status' }, notice));
    const buttons = el('div', { class: 'buttons' }, back, mode !== 'consulting' && result && !active ? downloadButton : go);
    if (mode !== 'consulting' && result && !active) buttons.append(logButton);
    box.append(el('div', { class: 'restore-footer' }, buttons));
  }
  draw();
  return { email, go, download: downloadButton, downloadLog: logButton, get result() { return result; } };
}
__exports.liveTestButton = liveTestButton;
__exports.mountLiveTestPanel = mountLiveTestPanel;
},
"files/report-diagnostic.js": function (__require, __exports, document, window) {
'use strict';
const { FIELDS } = __require("../core/run-records.js");
function reportDifferenceSummary(differences) {
  return { agreed: differences.length === 0, days: new Set(differences.map(row => row.iso || row.date)).size,
    fields: [...new Set(differences.flatMap(row => String(row.field).split(', ')))].filter(field => FIELDS.has(field)) };
}
__exports.reportDifferenceSummary = reportDifferenceSummary;
},
"core/run-records.js": function (__require, __exports, document, window) {
'use strict';
let recorder = null;
const observers = new Set();
function observeRun(receive) { observers.add(receive); return () => observers.delete(receive); }
function setRunRecorder(receive) {
  const previous = recorder;
  recorder = receive;
  return () => { recorder = previous; };
}
function recordRun(event) {
  recorder?.(event);
  for (const receive of observers) { try { receive(event); } catch {   } }
}
function timedRun(stage, fn) {
  if (!recorder && !observers.size) return fn();
  const started = Date.now();
  const receive = recordRun;
  const failed = error => { if (error && typeof error === 'object') error.stage ??= stage; finish(false); throw error; };
  receive?.({ type: 'begin', stage });
  const finish = ok => receive?.({ type: 'step', stage, seconds: (Date.now() - started) / 1000, ok });
  try {
    const result = fn();
    const proved = value => value?.ok !== false && value?.same !== false && !(stage === 'compare' && Array.isArray(value) && value.length);
    if (result && typeof result.then === 'function') return result.then(value => { finish(proved(value)); return value; }, failed);
    finish(proved(result));
    return result;
  } catch (error) { return failed(error); }
}
const RULE_CODES = new Set('add shorten dns notLeave exit mixedNotification noDates noStart noEnd endBeforeStart leaveOver notesTooLong noEmail twoEmails twoEmailsInReportCell twoTickets noBusiness notConsulting cmat termDateUnreadable termBeforeLwd termBeforeEnd exitNoLwdUs exitNoLwdRegion exitUsiLwd futureScheduleGreyed exitNoLwd unknownLine twoWayDate twoDates unreadableDate reportPersonDisagrees exportPersonDisagrees datesOnOneLine auditLoa auditExit auditUsiLwd auditMissingDp'.split(' '));
const REASON_CODES = new Set('allowedDatesUnreadableOrOutside loaSeparateBlocks notOnReport reportNotReady reportUnreadable reportStale personNotFound pageReportMismatch pastReportClients backupUnrestorable backupUnavailable backupReadFailed greyedNoBackup pageUnreadable pageTimeout identityChanged writeRefused changeUnproved restoreUnproved undoUnproved screenshotUnreadable sessionExpired unknownFailure'.split(' '));
const STAGES = new Set(['open person', 'close person', 'load person', 'read', 'compare', 'delete', 'check', 'add', 'save notes', 'screenshot', 'restore', 'undo', 'undo preview', 'prepare', 'report', 'resume']);
const WINDOWS = new Set(['Schedule page', 'Find Assignments', 'Edit Assignment', 'Bulk Edit Assignments', 'Add Assignment', 'confirmation window', 'No. of Periods', 'go-to-date', 'right-click menu', 'View Notes', 'Schedule window', 'window search boxes', 'professional search', 'calendar dates', 'page loading']);
const STRUCTURES = new Set(['select[id^="ScheduleAddForm_Staff_Form_field_"]', '.calendar-name', '.fc-view', 'table#editGrid', 'td.column-start', 'td.column-hours', 'td.column-jobcode', 'td.column-assigncodename', 'td.column-assigncodename2', 'td.column-clientname', 'td.column-engagement_name', 'td.column-assignment_type_name', 'td.column-utilization_name', 'td.column-cp#pricingid', 'td.column-resourcename', 'td.column-notesnumber']);
const PAGE_LIBRARIES = ['jQuery', 'Select2', 'FullCalendar', 'DataTables', 'daterangepicker', 'bootbox', 'window.moment'];
const PAGE_SELECTORS = ['select[id^="ScheduleAddForm_Staff_Form_field_"]', '.select2-container', '.calendar-name', '.fc-view', 'td.fc-day', '.fc-event', 'div.loading', '.modal', '.bootbox', '#FindAssignmentsModal', '#editEventGridModal', '#addShiftEventModal', 'table#editGrid', 'input.shift-date-picker-dates'];
const FIELDS = new Set(['Hours', 'Client', 'WBS', 'Billable', 'Utilization Generating', 'Job Code', 'Assign Code', 'Assign Code 1', 'Assign Code 2', 'Pricing ID', 'Notes', 'Date', 'Start Date', 'End Date', 'Clients', 'Include All Clients', 'Include All Future Assignments', 'Hours Per Day', 'Mode', 'Professional']);
function reasonCode(message) {
  const text = String(message || '');
  const rules = [
    [/website.*allowed|Required dates.*(?:outside|disabled)/i, 'allowedDatesUnreadableOrOutside'],
    [/^No professional found for |^\d+ professionals (?:found for|show exactly) .*Snooze will not guess|^The Search for a Professional result does not show exactly .*Snooze will not guess|^Not found on MySource:/i, 'personNotFound'],
    [/^The professional search .*could not be read|^The professional search results have unreadable emails/i, 'pageUnreadable'],
    [/^Their schedule changed since the backup .*Nothing was changed|^Schedule differs from the Staff Schedule Hours Report:/i, 'pageReportMismatch'],
    [/page and the (?:Staff Schedule Hours )?report disagree|changed since the (?:Staff Schedule Hours )?report was pulled/i, 'pageReportMismatch'],
    [/shown person changed|schedule changed since|hours changed since|future schedule changed/i, 'identityChanged'],
    [/older than 2 hours/i, 'reportStale'], [/pull time.*read|report.*could not be read/i, 'reportUnreadable'],
    [/past the (?:Staff Schedule Hours )?report.*client entries/i, 'pastReportClients'], [/put these days back/i, 'backupUnrestorable'],
    [/backup.*saved and read back/i, 'backupReadFailed'], [/folder.*needed.*backup/i, 'backupUnavailable'],
    [/greyed out.*no (?:Staff Schedule Hours )?report backup/i, 'greyedNoBackup'],
    [/not on the (?:Staff Schedule Hours )?report/i, 'notOnReport'], [/report.*not ready/i, 'reportNotReady'],
    [/session expired/i, 'sessionExpired'], [/refused it/i, 'writeRefused'],
    [/within \d+ seconds|did not show/i, 'pageTimeout'], [/could not be proved|not been proved/i, 'changeUnproved'],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || 'pageUnreadable';
}
function windowName(what) {
  const text = String(what);
  if (text === 'Schedule page') return 'Schedule page';
  if (/page to finish loading/.test(text)) return 'page loading';
  if (/to close|to finish|save and close|delete to finish/.test(text)) return null;
  if (/calendar to show/.test(text)) return 'calendar dates';
  const names = [['Find Assignments', /Find Assignments/], ['Edit Assignment', /Edit Assignment/], ['Add Assignment', /Add Assignment/], ['confirmation window', /Are you sure/], ['No. of Periods', /No\. of Periods/], ['go-to-date', /go-to-date/], ['right-click menu', /right-click menu/], ['View Notes', /View Notes/], ['window search boxes', /window's search boxes/], ['professional search', /professional search|Search for a Professional/]];
  return names.find(([, pattern]) => pattern.test(text))?.[0] || null;
}
const WAIT_NAMES = new Set(['deleteSave','addSave','editSave','findClose','rowRemoval','periodsClose', ...WINDOWS]);
function diagnosticWaitName(what) {
  const exact = { 'the delete to finish':'deleteSave', 'Add Assignment to save and close':'addSave',
    'Edit Assignments to save and close':'editSave', 'Find Assignments to close':'findClose',
    'the staged row removal':'rowRemoval', 'the No. of Periods window to close':'periodsClose' };
  return exact[what] || windowName(what) || 'Schedule window';
}
__exports.observeRun = observeRun;
__exports.setRunRecorder = setRunRecorder;
__exports.recordRun = recordRun;
__exports.timedRun = timedRun;
__exports.RULE_CODES = RULE_CODES;
__exports.REASON_CODES = REASON_CODES;
__exports.STAGES = STAGES;
__exports.WINDOWS = WINDOWS;
__exports.STRUCTURES = STRUCTURES;
__exports.PAGE_LIBRARIES = PAGE_LIBRARIES;
__exports.PAGE_SELECTORS = PAGE_SELECTORS;
__exports.FIELDS = FIELDS;
__exports.reasonCode = reasonCode;
__exports.windowName = windowName;
__exports.WAIT_NAMES = WAIT_NAMES;
__exports.diagnosticWaitName = diagnosticWaitName;
},
"core/reason-names.js": function (__require, __exports, document, window) {
'use strict';
const reasons = [
  ['weekNotCovered', /whole week is not covered|week delete scope/],
  ['keptRowInRange', /kept row is inside/],
  ['ownedDeleteTableChanged', /owned .*delete rows changed/],
  ['tableChanged', /table changed|table differs|Exit entries changed|LOA .*changed since the backup/],
  ['rowOutsideRange', /outside the (?:delete|restore|window)|whole-week table includes rows outside/],
  ['trashMissing', /row trash button/],
  ['rowDidNotLeave', /staged row removal|prepared LOA row removal/],
  ['submitRefused', /save and close|refused it|Submit button|enabled Submit/],
  ['periodsWindowStuck', /No\. of Periods.*(?:close|finish)|(?:close|finish).*No\. of Periods/],
  ['periodsUnreadable', /No\. of Periods/],
  ['findTableSlow', /Edit Assignment table.*(?:within|loading)|Find Assignments.*within/],
  ['findDatesChanged', /Find Assignments did not keep the dates/],
  ['findFiltersChanged', /Find Assignments did not keep the requested|Pricing ID is not a readable filter/],
  ['findAnchorMissing', /Find Assignments has no proved|Find Assignments did not prove its current-week/],
  ['findFieldsMissing', /fields labelled .*Start (?:Date|Week)|fields labelled .*End (?:Date|Week)/],
  ['findDatesChanged', /exact delete dates changed/],
  ['tableClosed', /Edit Assignment window closed before/],
  ['tablePaged', /table has more than one page/],
  ['tableMissing', /grid is missing|grid has no proved rows/],
  ['tableIncomplete', /table shows .* of its .*rows/],
  ['rowCellMissing', /Row .* has no .* cell/],
  ['rowUnreadable', /Row .*could not be read|row's date .*could not be read/],
  ['rowPersonChanged', /Row .*different or empty Professional/],
  ['rowCountUnreadable', /table row count could not be read/],
  ['confirmationAlreadyOpen', /Another confirmation window/],
  ['confirmationAmbiguous', /More than one confirmation window/],
  ['confirmationChanged', /confirmation windows changed/],
  ['confirmationWrong', /confirmation does not ask to delete/],
  ['confirmationYesMissing', /confirmation does not have one visible Yes/],
  ['deleteDidNotFinish', /delete to finish/],
  ['deleteMenuMissing', /Delete All in Bulk Actions|No "Bulk Actions" button/],
  ['deleteUnproved', /delete could not be proved|still showed entries after the delete/],
  ['identityChanged', /shown person changed|schedule changed since|person.*settle/],
  ['termDateUnreadable', /Term Date.*(?:cannot|could not|unreadable)|Unreadable Term Date/],
  ['sessionExpired', /session expired/i],
  ['testOwnershipChanged', /owned .*changed|ownership is unconfirmed|test schedule changed|delete table is not unique|delete range could not be proved/],
  ['windowStuck', /to close|would not close|to finish|stage and close/],
  ['pageCovered', /loading cover|blocked|covered/],
  ['calendarAmbiguous', /more than one.*(?:calendar|view)|calendar.*more than one|header calendar copy/],
  ['menuMissing', /No right-click menu|right-click menu has no/],
  ['menuDisabled', /greyed out in the right-click menu/],
  ['checkboxUnchanged', /checkbox did not change/],
  ['fieldMissing', /field.*labelled|No .*button|no .*box|not found|missing/i],
  ['proofFailed', /could not be proved|not been proved|unconfirmed|not proved/],
  ['waitExpired', /within \d+ seconds/],
];
const REASON_NAMES = new Set([...reasons.map(([name]) => name), 'pageShapeUnreadable', 'unknownFailure', 'assignPeriodMismatch', 'boxTypeChanged']);
function reasonName(message) {
  return reasons.find(([, pattern]) => pattern.test(String(message || '')))?.[0] || 'pageShapeUnreadable';
}
function errorReason(error) {
  if (error?.identityChanged) return 'identityChanged';
  if (error?.session) return 'sessionExpired';
  return REASON_NAMES.has(error?.reasonName) ? error.reasonName : reasonName(error?.message);
}
__exports.REASON_NAMES = REASON_NAMES;
__exports.reasonName = reasonName;
__exports.errorReason = errorReason;
},
"run/live-diagnostics.js": function (__require, __exports, document, window) {
'use strict';
const { SMALL_LIVE_STEPS, SMALL_TAX_STEPS } = __require("./live-proof.js");
const { observeRun, recordRun, STAGES, WINDOWS, FIELDS, WAIT_NAMES, REASON_CODES, reasonCode } = __require("../core/run-records.js");
const { REASON_NAMES, errorReason } = __require("../core/reason-names.js");
const { dayFromParts, mondayOf, weekday, usDate } = __require("../rules/dates.js");
const steps = new Set('smallOpen smallAdd smallChange smallDelete smallPicture smallUndo aaSetup aaExit aaKept aaDns aaPicture aaUndo aaClear taxEmpty taxFind taxAdd taxHoliday taxHours taxPartial taxClear taxPast dateGuard aEmpty aSetup aRefresh aCancel aReduce aClear bLoa bDns bDelete bRestore bReplace bClear cLoa cDns sevenSetup sevenCancel sevenReduce sevenClear cDelete cRestore cClear open empty editable loaAdd loaReplace loaDelete loaAlter loaRestore dnsAdd dnsReplace dnsDelete dnsAlter dnsRestore dnsClear cleanup recovery dnsEmpty loaFallback exitFallback cSetup cRemove cSplitRestore'.split(' '));
const word = (value, allowed, fallback = 'unknown') => allowed.has(value) ? value : fallback;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const stages = new Set([...STAGES, 'move calendar']);
const types = new Set('begin step error miss window field loading waiting slow wait waitBegin delay restoreRead restoreComparison diagnosticRead findStep findBoxes writeAttempt writeProof assignPeriod crossCheck stop cleanup finish periods identity schedulePage visibility dialog personLoaded searchStart'.split(' '));
const results = new Set(['passed','failed','refused','late','unconfirmed','running']);
const actions = new Set(['delete','add','submit']);
const waitNames = new Set([...WAIT_NAMES,...FIELDS,'open','filters','settle','submit','table']);
const windowKinds = new Set([...WINDOWS,'Go to Date','Delete confirmation']);
const views = new Set(['Custom','Month','Week','Day','Time']);
const boxTypes = new Set(['Date','Week']);
const periods = new Set(['Weekly','Time','unknown']);
const yesNo = new Set(['yes','no','unknown']);
const displays = new Set(['block','none','other','unknown']);
const cleanEdits = edits => (Array.isArray(edits) ? edits : []).slice(0,3).map(edit=>({
  open:word(edit.open,yesNo),shown:word(edit.shown,yesNo),display:word(edit.display,displays),rows:count(edit.rows),owned:word(edit.owned,yesNo)}));
const stepName = value => steps.has(value) ? value : 'unknown';
const version = value => /^\d+\.\d+\.\d+$/.test(value) ? value : 'unknown';
const date = (value, span) => typeof value === 'string' && /^\d{2}\/\d{2}\/2028$/.test(value)
  && (!span || value.slice(6)+value.slice(0,2)+value.slice(3,5) >= span.start.slice(6)+span.start.slice(0,2)+span.start.slice(3,5)
    && value.slice(6)+value.slice(0,2)+value.slice(3,5) <= span.end.slice(6)+span.end.slice(0,2)+span.end.slice(3,5)) ? value : null;
const mondayDate = value => {
  const parts = typeof value === 'string' && value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const day = parts && dayFromParts(Number(parts[3]), Number(parts[1]), Number(parts[2]));
  return day && weekday(day) === 1 ? value : null;
};
function pageState(controls, seenPeriods) {
  const kinds = {}, visible = new Set();
  for (const window of controls?.windows || []) {
    const kind = word(window.kind, windowKinds); kinds[kind] = (kinds[kind] || 0) + 1;
    if (window.visible === true) visible.add(kind);
  }
  return { view: word(controls?.view, views),
    periods: Number.isSafeInteger(controls?.periods) ? controls.periods : seenPeriods,
    windows: { open: (controls?.windows || []).filter(w => w.visible === true).length,
      hidden: (controls?.windows || []).filter(w => w.visible === false).length },
    windowKinds: kinds, visibleWindows: [...visible],edits:cleanEdits(controls?.edits),
    covers: count(controls?.covers?.length) };
}
function beginLiveDiagnostics(result, page, assignPeriod = 'unknown', today) {
  const started = Date.now();
  const elapsed = () => Math.max(0, Date.now() - started) / 1000;
  const data = result.diagnostic = { assignPeriod: word(assignPeriod, periods), events: [], stop: null };
  const runDay = result.mode === 'tax' && dayFromParts(today?.y, today?.m, today?.d);
  if (runDay) data.taxMonday = usDate(mondayOf(runDay));
  let stage = 'unknown', seenPeriods = null, boxType = 'unknown', lastAction = 'unknown', forcedStep = null, writes = 0;
  const snapshot = () => { try { return pageState(page.diagnosticState?.() || page.observe?.(), seenPeriods); } catch { return { unavailable:true }; } };
  const pending = [];
  const receive = event => {
    if (stages.has(event.stage)) { stage = event.stage; if (event.type === 'begin') lastAction = stage; }
    if (event.type === 'periods' && Number.isSafeInteger(event.count)) seenPeriods = event.count;
    if (event.type === 'findBoxes') boxType = word(event.boxType, boxTypes);
    const safe = { time: elapsed(), step: stepName(event.step || forcedStep || result.steps.find(s => s.state === 'running')?.id || result.steps.at(-1)?.id),
      type: word(event.type, types, 'observation'), stage, wait: WAIT_NAMES.has(event.waitName) ? event.waitName : word(event.name, waitNames),
      seconds: Number.isFinite(event.seconds) && event.seconds >= 0 ? event.seconds : null,
      result: word(event.result, results, typeof event.ok === 'boolean' ? event.ok ? 'passed' : 'failed' : 'unconfirmed'),
      code: word(event.code, REASON_CODES, 'none'), reasonName: word(event.reasonName, REASON_NAMES, 'none'), boxType,
      assignPeriod: data.assignPeriod };
    if (event.type === 'error') { safe.page = snapshot(); safe.lastAction = lastAction; event.liveStop = {step:safe.step,stage,lastAction,page:safe.page}; }
    for (const key of ['rows','selected','count']) if (Number.isSafeInteger(event[key]) && event[key] >= 0) safe[key] = event[key];
    if (event.type === 'writeAttempt') {
      lastAction = word(event.action, actions); safe.action = lastAction; safe.write = ++writes;
      safe.proof = 'unconfirmed'; pending.push(safe);
    }
    if (event.type === 'writeProof' && event.ok === true || event.type === 'restoreComparison' && event.ok === true) {
      const proved = event.whole === true ? pending.splice(0) : pending.splice(-1);
      safe.writes = proved.map(e => e.write);
      for (const attempt of proved) attempt.proof = 'passed';
    }
    data.events.push(safe);
    if (event.type === 'findBoxes' && (data.assignPeriod === 'Weekly' && boxType === 'Date' || data.assignPeriod === 'Time' && boxType === 'Week')) {
      data.events.push({ ...safe, type:'crossCheck', result:'passed', code:'none', reasonName:'assignPeriodMismatch' });
    }
  };
  let observing = false;
  const release = observeRun(event => {
    if (observing) return;
    observing = true;
    try { receive(event); } finally { observing = false; }
  });
  recordRun({ type:'assignPeriod' });
  return {
    fail(error, step) {
      pending.length = 0;
      const failure = { step: stepName(step), code: error?.identityChanged ? 'identityChanged' : error?.session ? 'sessionExpired' : word(error?.reasonCode, REASON_CODES, reasonCode(error?.message)), reasonName:errorReason(error) };
      const source = error?.liveStop || data.events.findLast(e => e.type === 'error' && e.reasonName === failure.reasonName && e.step === failure.step);
      const stopped = { ...failure, time: elapsed(), lastAction:source?.lastAction || lastAction, stage: source?.stage || word(error?.stage, stages, stage), page: source?.page || snapshot() };
      data.stop ||= stopped;
      Object.assign(result.steps.find(s => s.id === step) || {}, { code:failure.code, reasonName:failure.reasonName });
      recordRun({ type:'stop', ...failure, result:'failed' });
    },
    cleanup() { pending.length = 0; forcedStep = 'recovery'; recordRun({type:'cleanup'}); },
    finish() { data.finish = snapshot(); if (result.state !== 'paused') recordRun({type:'finish', result:result.state === 'complete' ? 'passed' : 'failed'}); release(); },
  };
}
function cleanPage(page) {
  if (!page) return null;
  if (page.unavailable === true) return {unavailable:true};
  return {view:word(page.view,views),periods:Number.isSafeInteger(page.periods) && page.periods>=0 ? page.periods : null,
    windows:{open:count(page.windows?.open),hidden:count(page.windows?.hidden)},covers:count(page.covers),
    windowKinds:Object.fromEntries(Object.entries(page.windowKinds || {}).filter(([kind])=>windowKinds.has(kind) || kind==='unknown').map(([kind,n])=>[kind,count(n)])),
    visibleWindows:[...new Set((page.visibleWindows || []).map(kind=>word(kind,windowKinds)))],edits:cleanEdits(page.edits)};
}
function cleanEvent(event) {
  const safe = {time:Number.isFinite(event.time) && event.time>=0 ? event.time : null,step:stepName(event.step),type:word(event.type,types,'observation'),
    stage:word(event.stage,stages),wait:word(event.wait,waitNames),seconds:Number.isFinite(event.seconds) && event.seconds>=0 ? event.seconds : null,
    result:word(event.result,results,'unconfirmed'),code:word(event.code,REASON_CODES,'none'),reasonName:word(event.reasonName,REASON_NAMES,'none'),
    boxType:word(event.boxType,boxTypes),assignPeriod:word(event.assignPeriod,periods)};
  if (event.page) safe.page=cleanPage(event.page);
  if (actions.has(event.action)) safe.action=event.action;
  if (actions.has(event.lastAction) || stages.has(event.lastAction)) safe.lastAction=event.lastAction;
  for (const key of ['rows','selected','count','write']) if (Number.isSafeInteger(event[key]) && event[key]>=0) safe[key]=event[key];
  if (Array.isArray(event.writes)) safe.writes=event.writes.filter(n=>Number.isSafeInteger(n) && n>0);
  if (['passed','failed','unconfirmed'].includes(event.proof)) safe.proof=event.proof;
  return safe;
}
function liveReportSummary(result, includeMonday = true) {
  const data = result.diagnostic || {}, raw = data.stop;
  const stop = raw ? {step:stepName(raw.step),code:word(raw.code,REASON_CODES,'unknownFailure'),reasonName:word(raw.reasonName,REASON_NAMES,'unknownFailure'),
    lastAction:word(raw.lastAction,new Set([...stages,...actions])),stage:word(raw.stage,stages),time:Number.isFinite(raw.time) && raw.time>=0 ? raw.time : null,page:cleanPage(raw.page)} : null;
  const taxMonday = includeMonday && result.mode === 'tax' && result.steps?.some(s=>s.id==='taxPast' && s.state==='failed')
    && data.events?.some(e=>e.type==='writeAttempt' && e.step==='taxPast') ? mondayDate(data.taxMonday) : null;
  const outstanding = result.cleanup === 'unconfirmed' ? [...new Set([...(result.ledger?.outstanding || []).map(r=>r.date), ...(result.outstanding || []).map(r=>r.date), ...(taxMonday ? [taxMonday] : [])])].filter(d=>date(d,result.week) || taxMonday && d===taxMonday) : [];
  return { version:version(result.version), verdict: result.state === 'complete' ? 'PASS' : 'FAIL',
    span:{start:date(result.week?.start),end:date(result.week?.end)},
    assignPeriod:word(data.assignPeriod,periods), failedStep:stop ? { step:stop.step, code:stop.code, reasonName:stop.reasonName } : null,
    stop, finds:findSummary(data.events || []),
    cleanup:word(result.cleanup,new Set(['empty','notNeeded','unconfirmed']),'unconfirmed'),
    unconfirmed:dateRanges(outstanding), unconfirmedSpan:result.cleanup === 'unconfirmed' && !outstanding.length ? {start:date(result.week?.start),end:date(result.week?.end)} : null,
    writes:{attempted:result.diagnostic ? (data.events || []).filter(e=>e.type==='writeAttempt').length : count(result.writes),proved:(data.events || []).filter(e=>e.type==='writeAttempt' && e.proof==='passed').length},
    finish:cleanPage(data.finish), seconds:(data.events || []).map(e=>e.time).filter(n=>Number.isFinite(n) && n>=0).at(-1) ?? null };
}
function dateRanges(dates) {
  const sorted = [...new Set(dates)].sort((a,b)=>dateNumber(a)-dateNumber(b)), ranges = [];
  for (const day of sorted) {
    const last = ranges.at(-1);
    if (last && dateNumber(day)-dateNumber(last.end)===86400000) last.end=day;
    else ranges.push({start:day,end:day});
  }
  return ranges.map(r=>r.start===r.end ? r.start : `${r.start}-${r.end}`);
}
function dateNumber(value) {
  const [m,d,y] = value.split('/').map(Number); return Date.UTC(y,m-1,d);
}
function findSummary(events) {
  const finds = events.filter(e=>e.type==='findBoxes').map(cleanEvent), counts = {};
  for (const find of finds) counts[find.boxType]=(counts[find.boxType] || 0)+1;
  return {counts,first:finds[0]?.step || 'none',last:finds.at(-1)?.step || 'none'};
}
function packFacts(input) {
  const facts=new Map(), lines=[];
  for (const text of input) {
    const at=text.indexOf(': '), name=text.slice(0,at), value=text.slice(at+2);
    facts.set(name,[...(facts.get(name) || []),value]);
  }
  let current='';
  for (const [name,values] of facts) {
    if (/^Edit [123]$/.test(name)) {
      if (current) lines.push(current);
      lines.push(`${name}: ${values.join(' ')}`); current=''; continue;
    }
    for (const token of `${name}: ${values.join(' ')};`.split(' ')) {
      if (current.length+token.length+(current?1:0)>100) { lines.push(current); current='More:'; }
      current+=(current?' ':'')+token;
    }
  }
  if (current) lines.push(current);
  return lines;
}
function shortLiveReport(result) {
  const report = liveReportSummary(result), stop=report.stop, page=stop?.page, finish=report.finish, lines=[];
  const line = (name, value) => {
    const prefix = `${name}: `;
    let current = prefix;
    const tokens = Array.isArray(value) ? value.map((part,index)=>`${part}${index<value.length-1?',':''}`) : String(value ?? 'unknown').split(' ');
    for (const token of tokens) {
      if (current.length+token.length+(current===prefix?0:1)>100 && current!==prefix) { lines.push(current); current=prefix; }
      current += (current===prefix?'':' ')+token;
    }
    lines.push(current);
  };
  const kinds = page => Object.keys(page?.windowKinds || {}).length ? Object.entries(page.windowKinds).map(([kind,n])=>`${kind} ${n}`) : ['none'];
  const visible = page => page?.visibleWindows?.length ? page.visibleWindows : ['none'];
  const state = page => !page || page.unavailable ? 'unavailable' : `${page.view}; periods ${page.periods ?? 'unknown'}; open ${page.windows.open}; hidden ${page.windows.hidden}; covers ${page.covers}`;
  line('Verdict', `${report.verdict}; version ${report.version}`);
  const smallSteps = result.design === 'small7' ? SMALL_LIVE_STEPS : result.design === 'tax5' ? SMALL_TAX_STEPS : null;
  if (smallSteps) for (const [index, [id, title]] of Object.entries(smallSteps).entries()) {
    const step = result.steps?.find(step => step.id === id);
    line(`Step ${index + 1}`, `${title}: ${step?.state === 'passed' ? 'PASS' : step?.state === 'failed' ? 'FAIL' : 'not exercised'}`);
  }
  line('Failed step',stop ? `${stop.step}${stop.time==null?'':` at ${stop.time} s`}` : 'none'); line('Code',stop?.code || 'none'); line('Reason',stop?.reasonName || 'none');
  line('Last action',stop?.lastAction || 'none'); line('Stage',stop?.stage || 'none');
  line('Assign Period',report.assignPeriod);
  line('Finds',Object.entries(report.finds.counts).map(([kind,n])=>`${kind} ${n}`).join(', ') || 'none');
  line('Find steps',`${report.finds.first} - ${report.finds.last}`);
  line('View',page?.view); line('Periods',page?.periods);
  line('Windows',page ? `open ${page.windows?.open ?? 'unknown'}, hidden ${page.windows?.hidden ?? 'unknown'}` : 'unavailable');
  line('Window kinds',kinds(page)); line('Visible',visible(page)); line('Covers',page?.covers);
  for (const [index,edit] of (page?.edits || []).entries()) line(`Edit ${index+1}`,`open ${edit.open}, shown ${edit.shown}, display ${edit.display}, rows ${edit.rows}, owned ${edit.owned}`);
  line('Writes',`${report.writes.attempted} attempted / ${report.writes.proved} proved`);
  line('Cleanup',smallSteps && report.cleanup === 'unconfirmed' ? 'UNCONFIRMED' : report.cleanup);
  let rangeStart=lines.length;
  line('Unconfirmed',report.unconfirmed.length ? report.unconfirmed : report.unconfirmedSpan ? `${report.unconfirmedSpan.start}-${report.unconfirmedSpan.end}` : 'none');
  const rangeEnd=lines.length;
  line('Span',`${report.span.start}-${report.span.end}`);
  line('Finish',`at ${report.seconds==null?'unknown':report.seconds} s; ${state(finish)}`); line('Finish visible',visible(finish)); line('Finish kinds',kinds(finish));
  if (lines.length>30 && report.unconfirmed.length) {
    const tail=lines.slice(rangeEnd), groups={};
    for (const range of report.unconfirmed) {
      const year=range.slice(6,10);
      (groups[year] ||= []).push(range.replace(/\/\d{4}/g,''));
    }
    const grouped = compact => {
      lines.length=rangeStart;
      for (const [year,ranges] of Object.entries(groups)) line(`Unconfirmed ${year}`,compact
        ? ranges.map(range=>range.replace(/^(\d{2})\/(\d{2})-\1\/(\d{2})$/,'$1/$2-$3')) : ranges);
      lines.push(...tail);
    };
    grouped(false);
    if (lines.length>30) grouped(true);
    if (rangeStart+tail.length+1>30) {
      const header=packFacts(lines.slice(0,rangeStart));
      tail.splice(0,tail.length,...packFacts(tail));
      lines.splice(0,rangeStart,...header); rangeStart=header.length;
      grouped(true);
    }
    if (lines.length>30) {
      const ranges=Object.entries(groups).flatMap(([year,values])=>values.map(value=>({year,value})));
      let omitted=0;
      const render=()=>{
        lines.length=rangeStart;
        for (const year of new Set(ranges.map(range=>range.year))) line(`Unconfirmed ${year}`,ranges.filter(range=>range.year===year).map(range=>range.value.replace(/^(\d{2})\/(\d{2})-\1\/(\d{2})$/,'$1/$2-$3')));
        if (omitted) line('Unconfirmed',`and ${omitted} more dates (all in the log)`);
        lines.push(...tail);
      };
      while (lines.length>30 && ranges.length) {
        const {year,value}=ranges.pop(), [first,last=first]=value.split('-');
        omitted+=(dateNumber(`${last}/${year}`)-dateNumber(`${first}/${year}`))/86400000+1;
        render();
      }
    }
  }
  if (lines.length>30) {
    return packFacts(lines).join('\n');
  }
  return lines.join('\n');
}
function liveEventLog(result) {
  const report=liveReportSummary(result,false), events=(result.diagnostic?.events || []).map(cleanEvent);
  const byStep=new Map(), compact=[];
  let previous='unknown', seen=false;
  for (const event of events) {
    if (event.type!=='findBoxes') { compact.push(event); continue; }
    if (!byStep.has(event.step)) byStep.set(event.step,{step:event.step,counts:{}});
    const counts=byStep.get(event.step).counts;
    counts[event.boxType]=(counts[event.boxType] || 0)+1;
    const changed=!seen || event.boxType!==previous;
    if (changed) compact.push({...event,from:previous});
    else if (event.reasonName!=='none' || event.code!=='none' || ['failed','refused','late'].includes(event.result)) compact.push(event);
    previous=event.boxType; seen=true;
  }
  return JSON.stringify({...report,finds:{...report.finds,byStep:[...byStep.values()]},events:compact});
}
__exports.beginLiveDiagnostics = beginLiveDiagnostics;
__exports.liveReportSummary = liveReportSummary;
__exports.shortLiveReport = shortLiveReport;
__exports.liveEventLog = liveEventLog;
},
"files/run-report.js": function (__require, __exports, document, window) {
'use strict';
const { pastReportWarning } = __require("../run/backup.js");
const { compareDays, usDate, todayOf } = __require("../rules/dates.js");
const { saveFile } = __require("../screen/ui.js");
const { runReportDocx, runReportName } = __require("./run-report-docx.js");
const { failedRow } = __require("../screen/compact.js");
const { chooseMail } = __require("../rules/mails.js");
const { RULE_CODES, REASON_CODES, STAGES, WINDOWS, FIELDS, STRUCTURES, PAGE_LIBRARIES, PAGE_SELECTORS } = __require("../core/run-records.js");
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const amount = value => number(value) === null ? 'not recorded' : String(Math.round(value * 1000) / 1000);
const code = value => RULE_CODES.has(value) || REASON_CODES.has(value) ? value : 'unknownFailure';
const ruleCode = value => typeof value === 'string' && /^[a-z][a-zA-Z0-9]{0,63}$/.test(value) ? value : code(value);
const stageWords = { 'open person': 'Search for a Professional (total)', 'load person': 'Search for a Professional (load schedule)',
  'close person': 'Close Schedule', read: 'Find Assignments / Edit Assignment', add: 'Add Assignment', 'save notes': 'Edit Assignments Submit (notes and staged removals)', delete: 'Delete All', report: 'Staff Schedule Hours Report' };
const stage = value => STAGES.has(value) ? stageWords[value] || value : 'not recorded';
const windowWords = value => value === 'professional search' ? 'Search for a Professional'
  : value === 'Schedule window' ? 'Schedule (window name not recorded)' : value;
const offset = (day, today) => {
  if (![day?.y, day?.m, day?.d, today?.y, today?.m, today?.d].every(Number.isInteger)) return 'unreadable date';
  const days = Math.round(compareDays(day, today) / 86400000);
  return `today${days < 0 ? '' : '+'}${days}`;
};
const states = new Set(['pending', 'ready', 'done', 'nothing', 'skipped', 'failed', 'restored', 'restoreFailed', 'undone', 'undoFailed', 'undoing', 'timeLimit']);
const APPROXIMATIONS = new Set('roundedCorners shadows unsupportedShadows shadowSpread gradients unsupportedGradients backgroundImages backgroundImagePlacement unsupportedBackgroundImages unsupportedBackgrounds dashedBorders dottedBorders unsupportedBorders letterSpacing lineThrough ellipses unsupportedSVG scrollbars scrollbarThumbs unsupportedTransforms unsupportedFilters unsupportedMasks unsupportedBackdropFilters checkboxes'.split(' '));
function action(one, today) {
  const plan = one.decision?.plan || {};
  if (plan.action === 'add') return `LOA ${offset(plan.loaStart, today)} .. ${offset(plan.loaEnd, today)}`;
  if (plan.action === 'dns') return `DNS ${offset(plan.dnsStart, today)} .. ${offset(plan.dnsEnd, today)}`;
  if (plan.action === 'clearClients') return `remove client hours from ${offset(plan.dnsStart, today)}`;
  return 'no schedule change';
}
const METHODS = new Set(['in-place refresh', 'combined reduction', 'Replace', 'delete', 'delete and DNS add']);
function methodWords(row, data) {
  const method = METHODS.has(data.method) ? data.method : null;
  if (row.state === 'skipped') return 'By hand';
  if (row.state === 'nothing') return 'no change';
  if (['restored', 'restoreFailed'].includes(row.state)) return `${method || 'change'}, then restore`;
  if (row.state === 'undone') return `${method || 'change'}, then Undo`;
  return method || 'not recorded';
}
function runReportText(batch, version, now = Date.now()) {
  const records = batch?.diagnostic || {};
  const rows = batch?.rows || [];
  const today = records.today || todayOf();
  const safeVersion = /^\d+\.\d+\.\d+$/.test(version) ? version : 'unknown';
  const start = number(records.started);
  const end = number(records.ended) ?? number(now);
  const counts = {
    LOA: rows.filter(row => row.one.record.notification?.kind === 'leave' || !row.one.record.notification && row.one.decision.plan?.action === 'add').length,
    Exit: rows.filter(row => row.one.record.notification?.kind === 'exit').length,
    'no action': (number(records.noAction) ?? 0) + rows.filter(row => row.state === 'nothing').length,
    done: rows.filter(row => row.state === 'done').length,
    'by hand': rows.filter(row => row.state === 'skipped' || row.byHand).length,
    failed: rows.filter(failedRow).length, undone: rows.filter(row => row.state === 'undone').length,
  };
  const lines = [`Snooze ${safeVersion} run report`, `Date: ${[today.y, today.m, today.d].every(Number.isInteger) ? usDate(today) : 'not recorded'}`,
    `Batch: ${start !== null && end !== null ? amount((end - start) / 1000) + ' s' : 'not started'}; Staff Schedule Hours Report age at Confirm: ${amount(records.reportAge)} min`,
    `Counts: ${Object.entries(counts).map(([key, value]) => `${key} ${amount(value)}`).join(' / ')}`,
    `Paused: ${records.paused === true ? 'yes' : 'no'}; stopped: ${records.stopped === true ? 'yes' : 'no'}; session expired: ${records.expired === true ? 'yes' : 'no'}; resumed: ${amount(records.resumed || 0)}; expired session resumed: ${records.sessionResumed === true ? 'yes' : 'no'}`];
  if (records.reason) lines.push(`Run reason: ${code(records.reason)}; failed stage: ${stage(records.failedStage)}`);
  if (batch.timeLimit?.line) lines.push(batch.timeLimit.line);
  rows.forEach((row, index) => {
    const one = row.one;
    const data = row.diagnostic || {};
    const kind = one.record.notification?.kind === 'exit' ? 'Exit' : one.record.notification?.kind === 'leave' || one.decision.plan?.action === 'add' ? 'LOA' : 'unknown';
    let mail;
    try { mail = row.state === 'timeLimit' || one.slice?.status === 'notOnReport' ? null : one.record.subcategory?.business === 'audit' ? chooseMail(one, row.prepared)?.template : one.exit?.template || chooseMail(one, row.prepared)?.template; } catch { mail = null; }
    const safeMail = ['A', 'B', 'C', 'D', 'F', 1, 2, 3, 4, 5, '1', '2', '3', '4', '5', 'AA1', 'AA2', 'AA3', 'AA4', 'AALoaAsk', 'AALoaAlready', 'AAMissingDp'].includes(mail) ? mail : 'none';
    const comparison = data.comparison;
    const fields = (comparison?.fields || []).filter(value => FIELDS.has(value));
    const pictures = number(data.pictures) ?? one.outputs?.screenshots?.length ?? 0;
    const paint = (data.paint || []).filter(item => ['icons', 'pictures', 'pseudo elements', 'name', 'calendar', 'paint', 'notes'].includes(item.kind)).map(item => `${item.kind} ${amount(item.count)}`).join(', ') || 'none recorded';
    const approximations = Object.entries(data.approximations || {}).filter(([kind]) => APPROXIMATIONS.has(kind)).map(([kind, count]) => `${kind} ${amount(count)}`).join(', ') || 'none recorded';
    const slow = (data.steps || []).some(step => number(step.seconds) > 5) || (records.waits || []).some(wait => wait.person === index + 1 && number(wait.seconds) > 5);
    const detail = failedRow(row) || row.byHand || row.state === 'skipped' || row.state === 'undone' || data.reason || data.failedStage || data.recovery || row.pictureToTakeByHand || slow || (data.steps || []).some(step => step.ok === false);
    lines.push('', `#${index + 1} ${kind}; rule ${ruleCode(one.personStop?.code || one.decision.code)}; mail ${safeMail}; ${states.has(row.state) ? row.state : 'unknown'}; ${action(one, today)}; Time: ${number(data.seconds) === null ? 'not recorded' : amount(Math.round(data.seconds * 10) / 10) + ' s'}; method: ${methodWords(row, data)}; Screenshots: ${pictures ? `made ${amount(pictures)}` : 'not made'}${row.pictureToTakeByHand ? '; picture to take by hand' : ''}; run reads: reused ${amount(data.runReads?.reused || 0)}; fresh ${amount(data.runReads?.fresh || 0)}; painter omissions: ${paint}; painter approximations: ${approximations}`);
    const warning = pastReportWarning(row.prepared?.backup);
    if (warning) lines.push(warning);
    if (kind === 'Exit' && row.prepared?.termGreyed) lines.push('Greyed from the Term Date: days after it cannot be put back by Undo.');
    if (!detail) return;
    lines.push(
      `${row.state === 'done' || row.state === 'undone' ? 'Done' : 'Planned'}: ${action(one, today)}${row.state === 'undone' ? '; undone' : ''}`,
      `Page/Staff Schedule Hours Report: ${comparison?.agreed === true ? 'agreed' : comparison?.agreed === false ? 'disagreed' : 'not compared'}; differing days: ${amount(comparison?.days)}; fields: ${fields.join(', ') || 'none'}`);
    for (const step of data.steps || []) lines.push(`Step: ${stage(step.stage)} ${amount(step.seconds)} s; ${step.ok === true ? 'ok' : 'failed'}${step.retry === true ? '; retry' : ''}`);
    if (data.reason || row.state === 'skipped' || failedRow(row)) lines.push(`Reason: ${code(data.reason || one.personStop?.code)}; failed stage: ${stage(data.failedStage)}`);
    if (data.recovery) {
      const recovery = data.recovery;
      lines.push(`By hand; restore ${recovery.confirmed ? 'confirmed' : 'UNCONFIRMED'}; watched period: ${offset(recovery.window?.start, today)} .. ${offset(recovery.window?.end, today)}`);
      const affected = [...new Set((recovery.differences || []).map(item => item.date))];
      if (affected.length) lines.push(`Unrestored dates: ${affected.join(', ')}`);
      if (recovery.progress) {
        const progress = recovery.progress;
        lines.push(`Restore entries checked: ${amount(progress.added)} of ${amount(progress.total)}; runs checked: ${amount(progress.runs)} of ${amount(progress.totalRuns)}`);
        lines.push(`Restore dates needing review: ${(progress.affectedDays || []).map(day => offset(day, today)).join(', ') || 'not recorded'}`);
      }
    }
  });
  lines.push('', 'Page structure misses:');
  for (const miss of records.misses || []) lines.push(WINDOWS.has(miss) || FIELDS.has(miss) || STRUCTURES.has(miss) ? windowWords(miss) : 'unrecognized structure');
  if (!records.misses?.length) lines.push('none recorded');
  lines.push('Windows over 5 s:');
  for (const item of records.slow || []) if (WINDOWS.has(item.name) && number(item.seconds) > 5) lines.push(`${windowWords(item.name)}: ${amount(item.seconds)} s`);
  if (!records.slow?.some(item => WINDOWS.has(item.name) && number(item.seconds) > 5)) lines.push('none recorded');
  lines.push('Unexpected dialog titles:');
  const dialogCounts = new Map();
  for (const item of records.dialogs || []) {
    const caller = WINDOWS.has(item.caller) ? item.caller : 'Schedule window';
    const purpose = ['opening', 'recheck', 'cleanup'].includes(item.purpose) ? item.purpose : 'not recorded';
    const key = `unrecognized title (${amount(item.length)} characters; text omitted); ${caller}; ${purpose}; ${stage(item.stage)}`;
    dialogCounts.set(key, (dialogCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of dialogCounts) {
    const boundary = key.indexOf(');') + 1;
    lines.push(`${key.slice(0, boundary)}${count > 1 ? ` × ${count}` : ''}${key.slice(boundary)}`);
  }
  if (!records.dialogs?.length) lines.push('none recorded');
  lines.push('Could not read:');
  const unread = (records.unread || []).map(item => `#${number(item.person) === null ? '?' : item.person}: ${code(item.code)} (${stage(item.stage)})`);
  lines.push(...(unread.length ? [...new Set(unread)] : ['none recorded']));
  if (new Set(unread).size < unread.length) lines.push('Repeated checks, retries or Resume can record the same unreadable step for one person; each person/reason/stage is shown once.');
  lines.push('Schedule page checks:');
  for (const item of records.schedulePage || []) {
    const fact = ['jQuery missing', 'search select missing', 'box missing', 'box hidden', 'pane not active'].includes(item.fact) ? item.fact : 'unknown fact';
    const tag = ['html', 'body', 'div', 'span', 'section', 'form', 'td', 'main', 'aside', 'element'].includes(item.tag) ? item.tag : 'not recorded';
    const how = ['hidden', 'aria-hidden', 'display:none', 'visibility:hidden'].includes(item.how) ? item.how : 'not recorded';
    lines.push(`${fact}; ancestor ${amount(item.ancestor)}; tag ${tag}; ${how}; ${amount(item.seconds)} s; #${amount(item.person)}; ${stage(item.stage)}`);
  }
  if (!records.schedulePage?.length) lines.push('none recorded');
  lines.push('Person identity checks:');
  const yesNo = value => value === true ? 'yes' : value === false ? 'no' : 'not recorded';
  for (const item of records.identity || []) {
    const operation = ['identity check', 'capture', 'retake', 'page check', 'open person'].includes(item.operation) ? item.operation : 'not recorded';
    lines.push(`#${amount(item.person)}; ${stage(item.stage)}; ${operation}; names ${amount(item.nameCount)}; name present ${yesNo(item.namePresent)}; expected name present ${yesNo(item.expectedNamePresent)}; name equal ${yesNo(item.nameEqual)}; IDs ${amount(item.idCount)}; ID readable ${yesNo(item.idReadable)}; expected ID readable ${yesNo(item.expectedIdReadable)}; ID equal ${yesNo(item.idEqual)}; calendar present ${yesNo(item.calendarPresent)}; calendar ambiguous ${yesNo(item.calendarAmbiguous)}; loading cover ${yesNo(item.loadingCover)}`);
  }
  if (!records.identity?.length) lines.push('none recorded');
  for (const item of records.identity || []) {
    lines.push(`#${amount(item.person)} name spacing/case only ${yesNo(item.nameSpacingCaseOnly)}; name length difference ${Number.isSafeInteger(item.nameLengthDifference) ? item.nameLengthDifference : 'not recorded'}`);
  }
  lines.push('Find Assignments sub-steps:');
  for (const item of records.findSteps || []) {
    if (['open', 'filters', 'settle', 'submit', 'table'].includes(item.name)) lines.push(`#${amount(item.person)}; ${item.name}: ${amount(item.seconds)} s`);
  }
  if (!records.findSteps?.length) lines.push('none recorded');
  lines.push('Tab visibility:');
  for (const item of records.visibility || []) lines.push(`${['hidden', 'visible'].includes(item.state) ? item.state : 'unknown'} at ${amount(item.seconds)} s; checked: ${item.checked === true ? 'yes' : item.checked === false ? 'failed' : 'not recorded'}`);
  if (!records.visibility?.length) lines.push('none recorded');
  if (records.stalls?.length) for (const item of records.stalls) {
    const time = number(item.time);
    lines.push(`Stall: ${time === null ? 'not recorded' : new Date(time).toISOString()}; #${amount(item.person)}; step ${stage(item.stage)}; last wait ${WINDOWS.has(item.wait) ? windowWords(item.wait) : 'not recorded'}; stuck ${amount(item.seconds)} s`);
  }
  lines.push('Waits:');
  for (const item of records.waits || []) lines.push(`#${amount(item.person)} ${WINDOWS.has(item.name) ? windowWords(item.name) : 'unrecognized window'}: ${amount(item.seconds)} s / ${amount(item.ceiling)} s limit; ${['passed', 'failed', 'late', 'refused', 'unconfirmed'].includes(item.result) ? item.result : 'unconfirmed'}`);
  if (!records.waits?.length) lines.push('none recorded');
  return lines.join('\n');
}
function combinedReportText(batch, version, pageInfo) {
  const safeVersion = /^\d+\.\d+\.\d+$/.test(version) ? version : 'unknown';
  const raw = String(batch?.diagnostic?.pageInfo || pageInfo || '').split('\n');
  const lines = ['Page information (no values)'];
  for (const name of PAGE_LIBRARIES) {
    const line = raw.find(value => value.startsWith(`${name}: `));
    const value = line?.slice(name.length + 2);
    if (/^(?:present|not found)(?:; version: \d+(?:\.\d+)*)?$/.test(value)) lines.push(`${name}: ${value}`);
  }
  for (const name of PAGE_SELECTORS) {
    const line = raw.find(value => value.startsWith(`${name}: `));
    const value = line?.slice(name.length + 2);
    if (/^(?:\d+; shown: \d+|could not read)$/.test(value)) lines.push(`${name}: ${value}`);
  }
  const tooltip = raw.find(line => /^Note picture tooltip: (?:\.tooltip|\.popover|\[role=tooltip\]|fallback|not shown)$/.test(line));
  if (tooltip) lines.push(tooltip);
  if (lines.length === 1) lines.push('not recorded');
  return `Snooze ${safeVersion} report\n\n${lines.join('\n')}${batch?.confirmed ? '\n\n' + runReportText(batch, version) : ''}`;
}
function downloadRunReport(work) {
  const text = combinedReportText(work.batch, work.version, work.pageInfo);
  saveFile(runReportName(), new Blob([runReportDocx(text)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
}
__exports.runReportText = runReportText;
__exports.combinedReportText = combinedReportText;
__exports.downloadRunReport = downloadRunReport;
},
"files/run-report-docx.js": function (__require, __exports, document, window) {
'use strict';
const { zip } = __require("./xlsx-writer.js");
const { xml } = __require("./xml.js");
const { fileStamp } = __require("../rules/dates.js");
const heading = line => /^Snooze \d+\.\d+\.\d+ (?:run )?report$|^#\d+ /.test(line)
  || ['Page information (no values)', 'Page structure misses:', 'Windows over 5 s:', 'Unexpected dialog titles:', 'Could not read:'].includes(line);
function runReportDocx(text) {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PACKAGE = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const paragraphs = text.split('\n').map(line => `<w:p>${heading(line) ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ''}<w:r>${heading(line) ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`).join('');
  return zip([
    ['[Content_Types].xml', `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`],
    ['_rels/.rels', `${declaration}<Relationships xmlns="${PACKAGE}"><Relationship Id="rId1" Type="${RELS}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', `${declaration}<w:document xmlns:w="${W}"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`],
    ['word/_rels/document.xml.rels', `${declaration}<Relationships xmlns="${PACKAGE}"><Relationship Id="rId1" Type="${RELS}/styles" Target="styles.xml"/></Relationships>`],
    ['word/styles.xml', `${declaration}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>`],
  ]);
}
function runReportName(time = Date.now()) {
  return `Snooze run report ${fileStamp(new Date(time))}.docx`;
}
__exports.runReportDocx = runReportDocx;
__exports.runReportName = runReportName;
},
"screen/ui.js": function (__require, __exports, document, window) {
'use strict';
const { COLOURS } = __require("../family/look.js");
function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else if (value === true) node.setAttribute(name, '');
    else if (value !== false && value != null) node.setAttribute(name, value);
  }
  for (const child of children.flat()) if (child != null) node.append(child.nodeType ? child : String(child));
  return node;
}
function wrongPageNotice(message) {
  document.getElementById('snooze-wrong-page-notice')?.remove();
  const host = el('div', { id: 'snooze-wrong-page-notice' });
  const root = host.attachShadow({ mode: 'open' });
  const close = el('button', { type: 'button', 'aria-label': 'Dismiss notice', onclick: () => host.remove() }, '✕');
  root.append(el('style', {}, `:host{all:initial}.notice{position:fixed;top:16px;right:16px;z-index:2147483647;width:340px;max-width:calc(100vw - 32px);display:flex;align-items:start;gap:12px;padding:12px;background:${COLOURS.page};color:${COLOURS.text};border:1px solid ${COLOURS.grey};border-radius:10px;font:12px/1.5 system-ui;box-shadow:0 8px 28px rgba(0,0,0,0.3333333333333333)}button{flex:none;padding:0;border:0;background:none;color:${COLOURS.muted};font:16px system-ui;cursor:pointer}button:focus-visible{outline:2px solid ${COLOURS.selection};outline-offset:3px}`),
    el('div', { class: 'notice', role: 'status' }, el('span', {}, message), close));
  document.body.append(host);
  console.log(message);
}
function saveFile(name, content, type = 'application/json') {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}
function recoveryGuide() {
  return el('details', { class: 'recovery-guide' }, el('summary', {}, 'Which recovery?'),
    el('p', {}, el('strong', {}, "Undo this batch's change"),
      ": per person, from this batch's backup, with Pricing ID read at the turn. Notes are not restored."),
    el('p', {}, el('strong', {}, 'Bulk Restore from a report'),
      ': report only, no notes or Pricing ID.'));
}
__exports.el = el;
__exports.wrongPageNotice = wrongPageNotice;
__exports.saveFile = saveFile;
__exports.recoveryGuide = recoveryGuide;
},
"rules/mails.js": function (__require, __exports, document, window) {
'use strict';
const { usDate, workdayFrom, workingDays } = __require("./dates.js");
const { professionalName } = __require("./prepare.js");
const { dayRanges } = __require("./leaves.js");
const NOT_A_NAME = ['', 'not applicable', 'n/a', 'na', '-1', 'none', 'tbd'];
function greetingName(name) {
  const text = String(name || '').trim();
  if (NOT_A_NAME.includes(text.toLowerCase())) return '';
  const [last, first] = text.split(',').map(part => part.trim());
  return first ? first.split(/\s+/)[0] : last;
}
const subjectLine = (ticket, name) => `${ticket} - Deployment RMIS Request - System Updates for ${name}`;
const ATTACHED = {
  withReport: 'Please find the screenshot and the Staff Schedule Hours Report attached.',
  noReport: 'Please find the screenshot attached.',
  noReportLoa: 'Please find the screenshot attached. No Staff Schedule Hours Report has been attached as there were no Client Service Hours in the schedule.',
};
const HELP = 'Please reach out if there are any further changes.';
function exitDnsDates(plan, worked = null) {
  if (!plan?.dnsStart || !(worked?.editableDnsEnd || plan.dnsEnd)) return { start: null, end: null };
  const start = workdayFrom(plan.dnsStart);
  const days = workingDays(start, worked?.editableDnsEnd || plan.dnsEnd);
  return { start, end: days.at(-1) || null };
}
function chooseMail(one, worked = null) {
  if (one.slice?.status === 'notOnReport') return null;
  if (one.record.subcategory?.business === 'audit') return chooseAuditMail(one, worked);
  const tax = one.record.subcategory?.site === 'tax';
  if (tax && one.personStop?.code === 'taxPartnerMd') return { template: 2, attachReport: false, paragraphs: [TAX_MAIL_WORDS.partner, TAX_MAIL_WORDS.partnerPicture] };
  if (tax && (one.decision.code === 'taxPastEnd' || worked?.code === 'taxPastEnd')) return { template: 2, attachReport: false, paragraphs: [TAX_MAIL_WORDS.pastEnd, `${ATTACHED.noReport} ${HELP}`] };
  if (one.record.notification?.kind === 'exit' || one.decision.plan?.action === 'dns') return chooseExitMail(one, worked);
  const { decision } = one;
  const plan = decision.plan;
  if (decision.outcome === 'report') {
    if (!worked) return null;
    const clientHours = (worked.removing || []).reduce((sum, item) => sum + item.clientHours, 0);
    const attach = clientHours > 0 ? ATTACHED.withReport : ATTACHED.noReportLoa;
    const kept = worked.kept?.length ? [`Other LOA already on the schedule was left unchanged: ${dayRanges(worked.kept.map(row => row.day))}.`] : [];
    const result = plan.pastDated
      ? `The LOA has been updated from ${usDate(workdayFrom(plan.loaStart))} through ${usDate(plan.loaEnd)}. The leave starts on ${usDate(plan.leaveStart || plan.loaStart)}, but past dates cannot be changed in the schedule.`
      : plan.notificationType === 'endOnly'
      ? `LOA is in place through ${usDate(plan.loaEnd)}, as per the notification below.`
      : `LOA is in place from ${usDate(plan.leaveStart || plan.loaStart)} through ${usDate(plan.loaEnd)}, as per the notification below.`;
    return { template: plan.pastDated ? 3 : 2, attachReport: clientHours > 0,
      paragraphs: [result, ...kept, ...(tax ? taxMailLines(worked) : []), `${attach} ${HELP}`] };
  }
  switch (decision.code) {
    case 'leaveOver':
      return {
        template: 5, attachReport: false,
        paragraphs: ['We are unable to edit past dates, as the schedule is greyed out. Hence, no action has been taken from our end.', `Please find the screenshot attached. ${HELP}`],
      };
    default:
      return null;
  }
}
function mailText(one, mail, { dpName = '', dpEmail = '', signOff = '' } = {}) {
  if (one.record.subcategory?.business === 'audit') return auditMailText(one, mail, { dpName, signOff });
  const { record } = one;
  const tax = record.subcategory?.site === 'tax';
  if (tax) dpEmail = '';
  const name = professionalName(record);
  const details = record.notification.lines.join('\n');
  const greeting = greetingName(dpName);
  const rmNotApplicable = !greeting && String(dpName || '').trim() !== '';
  const exit = typeof mail.template === 'string' && /^[A-DF]$/.test(mail.template);
  const email = record.exportEmail ?? record.email;
  const fields = exit ? [`Professional Email: ${email}`, '', 'Exit Details:', details]
    : [`Email ID: ${email}`, '', 'LOA Details:', details];
  const nameOnly = signOff.trim().replace(/^(?:thank you!?|regards,?)\s*\n/i, '').trim();
  const closing = `Regards,\n${nameOnly || (exit ? '<Your First Name>' : '<Your sign-off>')}`;
  const body = [`Hi ${greeting || '<Deployment Professional Name>'},`, '', ...mail.paragraphs.flatMap(p => [p, '']), ...fields, '', closing].join('\n');
  return {
    to: dpEmail || (greeting ? tax ? dpName : `(${dpName}: email not in the files)` : rmNotApplicable ? '(RM not applicable)' : '(no Resource Manager on the profile)'),
    subject: subjectLine(record.number, name),
    body,
    copyBody: dpEmail ? `${dpEmail}\n\n${body}` : body,
    missing: [!greeting && (rmNotApplicable ? 'RM not applicable' : 'the Resource Manager'), greeting && !dpEmail.trim() && 'Resource Manager email missing: add the recipient before sending', !signOff.trim() && 'your name for mail sign-off', mail.needsDeletionReview && "mail B's deletion statement (Snooze made no schedule change)"].filter(Boolean),
  };
}
const AUDIT_LOA_ASK = "We have received the ELE notification below for the professional's Leave of Absence. As per the Audit process, we update the LOA only with your approval. Kindly let us know if the LOA should be updated for the dates below and the scheduled hours in that period removed. Please find the screenshot of the current schedule attached.";
const AUDIT_LOA_ALREADY = "We have received the ELE notification below for the professional's Leave of Absence. The LOA is already updated on the schedule for these dates, so no action was needed from our end. Please find the screenshot of the current schedule attached.";
function chooseAuditMail(one, worked) {
  if (one.personStop?.code === 'auditMissingDp') return { template: 'AAMissingDp', attachReport: false, paragraphs: [
    'I hope you are doing well.',
    'I am reaching out to inform you that this profile in MySource does not have a Deployment Professional aligned. As per the instructions received from A&A Deployment Leadership, we are forwarding this update to you for further action.',
    'If you require any additional information, please let us know.', 'Thank you.',
  ] };
  if (one.personStop || ['byHand', 'notHandled'].includes(one.decision.outcome) || !worked) return null;
  if (one.record.notification.kind === 'leave') return { template: worked.auditAlready ? 'AALoaAlready' : 'AALoaAsk', attachReport: false,
    paragraphs: ['Greetings!', worked.auditAlready ? AUDIT_LOA_ALREADY : AUDIT_LOA_ASK] };
  const audit = one.decision.audit;
  if (!audit?.region) return null;
  const date = usDate(audit.from);
  const paragraphs = {
    1: [audit.region === 'USI'
      ? "We have received notification regarding the practitioner's exit. Could you please confirm Last working date for the Professional? Also, kindly advise if we need to create any requirements for the Professional. If so, please find the attached template and fill in the necessary details. Once you confirm the last working day and the requirements, we will create the requirements, remove the scheduled hours after the last working day and add Do Not Schedule (DNS) to the schedule."
      : "We have received notification regarding the practitioner's exit. Could you please confirm the exit date for the practitioner. Also, kindly advise if we need to create any requirements for the practitioner. If so, please find the attached template and fill in the necessary details. Once you confirm the last working day and the requirements, we will create the requirements, remove the scheduled hours after the last working day and add Do Not Schedule (DNS) to the schedule.", 'Thank you for your support.'],
    2: [`We have received the notification regarding the Professional's exit. Could you please confirm Last working date for the Professional? However, we have noted that there is no client time scheduled beyond the ${date}. Please find the attached screenshot for your reference. Kindly let us know if any further action is required from our end. Once you confirm the last working day, we will add Do Not Schedule (DNS) to the schedule after it.`, 'Thank you.'],
    3: [`We have received notification regarding the practitioner's exit. Kindly advise if we need to create any requirements for the practitioner after the last working day (${date}). If so, please find the attached template and fill in the necessary details. Once you confirm, we will create the requirements, remove the scheduled hours after the last working day (${date}) and add Do Not Schedule (DNS) to the schedule.`, 'Thank you for your support.'],
    4: [`We have received notification regarding the practitioner's exit. However, we have noted that there is no client time scheduled beyond the ${date}. Hence, we have scheduled Do Not Schedule (DNS) post the LWD. Please find the attached screenshot for your reference. Kindly let us know if any further action is required from our end.`,
      ...(one.exit?.greyed ? ['We are unable to add DNS to the schedule as the schedule is greyed out.'] : [])],
  }[audit.template];
  return paragraphs ? { template: `AA${audit.template}`, attachReport: false, attachTemplate: [1, 3].includes(audit.template), paragraphs: ['I hope you are doing well.', ...paragraphs] } : null;
}
function auditMailText(one, mail, { dpName, signOff }) {
  const record = one.record, name = professionalName(record), email = record.exportEmail ?? record.email;
  const greeting = greetingName(dpName), missingDp = mail.template === 'AAMissingDp';
  const date = field => record.notification.dates[field] ? usDate(record.notification.dates[field]) : '';
  const exit = /^AA[1-4]$/.test(mail.template);
  const details = exit ? [`${name} – ${email}`, `Date of Resignation: ${date('resignation')}`, `Planned Last Working Day: ${date('lastWorkingDay')}`]
    : ['LOA Details:', `Professional Name: ${name}`, `Mail ID: ${email}`, `Leave Start Date: ${date('start')}`, `Leave End Date: ${date('end')}`];
  const nameOnly = signOff.trim().replace(/^(?:thank you!?|thanks & regards,?|regards,?)\s*\n/i, '').trim();
  const body = missingDp ? ['Hi <PR>,', '', ...mail.paragraphs.flatMap((p, i) => i ? ['', p] : [p])].join('\n')
    : [`Hi ${greeting || '<Deployment Professional Name>'},`, '', ...mail.paragraphs.flatMap(p => [p, '']), ...details, '', exit ? 'Thanks & Regards,' : 'Thank You!', nameOnly || '<Your Name>'].join('\n');
  return { to: missingDp ? '' : greeting ? dpName : '', subject: subjectLine(record.number, name), body, copyBody: body,
    missing: [missingDp && 'the mail recipient', !missingDp && !greeting && 'the Resource Manager', !missingDp && !nameOnly && 'your name for mail sign-off'].filter(Boolean) };
}
const TAX_MAIL_WORDS = {
  pastEnd: 'The LOA on the schedule already runs beyond the end date in the notification below; as per the process it has been left as it is.',
  holiday: 'The Holiday on MM/DD/YYYY was kept, and the LOA for that week was reduced by 8 hours.',
  partialWeek: 'The client hours in the week of MM/DD/YYYY were reduced to the days outside the leave.',
  partner: 'As the Professional is Partner/Managing Director, the Scheduled hours are not available in MySource, nor are we supposed to update the schedule with LOA.',
  partnerPicture: 'Please find the attached screenshot for your reference.',
};
function taxMailLines(worked) {
  return [...(worked.holidays || []).map(row => TAX_MAIL_WORDS.holiday.replace('MM/DD/YYYY', usDate(row.day))),
    ...(worked.partialWeeks || []).map(day => TAX_MAIL_WORDS.partialWeek.replace('MM/DD/YYYY', usDate(day)))];
}
const EXIT_MAIL_WORDS = {
  lead: 'As per the Separation notification below, we have taken the following steps:',
  greyed: 'We are unable to add DNS, as the schedule is greyed out.',
  deactivate: 'Profile will be automatically de-activated on the date of termination.',
  waiting: "We have received the ELE notification below for the PR's resignation and are waiting for the ELE Exits Team to update the LWD details. For now, we are sharing the resignation date for reference only, and we will share the LWD once we receive it from the ELE Exits Team.",
  noAction: 'No action has been taken in MySource for this professional at this time.',
};
function chooseExitMail(one, worked) {
  if (one.personStop || one.exit?.dpNotFound || ['byHand', 'notHandled'].includes(one.decision.outcome)) return null;
  const template = one.decision.code === 'exitNoLwd' ? 'F' : one.exit?.template;
  if (!['A', 'B', 'C', 'D', 'F'].includes(template) || (!worked && !['B', 'C', 'F'].includes(template))) return null;
  const w = EXIT_MAIL_WORDS;
  if (template === 'F') return { template, attachReport: false, paragraphs: [w.waiting, w.noAction] };
  const clientHours = (worked?.removing || []).reduce((sum, item) => sum + item.clientHours, 0);
  const attachReport = clientHours > 0;
  const plan = one.decision.plan;
  const dates = exitDnsDates(plan, worked);
  const dnsInPlace = one.exit?.dnsInPlace || !one.exit?.greyed;
  const result = dnsInPlace
    ? `DNS is in place from ${usDate(dates.start)} through ${usDate(dates.end)}, as per the notification below.`
    : w.greyed;
  return { template, attachReport, paragraphs: [...(dnsInPlace ? [w.lead, result] : ['As per the Separation notification below, we are unable to add DNS, as the schedule is greyed out.']),
    ...(attachReport ? ['Client hours after the last working day have been removed.'] : []),
    attachReport ? ATTACHED.withReport : ATTACHED.noReport] };
}
__exports.greetingName = greetingName;
__exports.subjectLine = subjectLine;
__exports.exitDnsDates = exitDnsDates;
__exports.chooseMail = chooseMail;
__exports.mailText = mailText;
__exports.TAX_MAIL_WORDS = TAX_MAIL_WORDS;
__exports.EXIT_MAIL_WORDS = EXIT_MAIL_WORDS;
},
"files/xlsx.js": function (__require, __exports, document, window) {
'use strict';
const { workbookBytes } = __require("./xlsx-writer.js");
const { xml, column } = __require("./xml.js");
function sheetXml(rows) {
  const count = rows.reduce((count, row) => Math.max(count, row.length), 1);
  const cols = Array.from({ length: count }, (_, index) => {
    const heading = String(rows[0]?.[index] || '');
    const width = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(heading) ? 13 : /email/i.test(heading) ? 38 : /client|engagement/i.test(heading) ? 42 : 26;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join('');
  const body = rows.map((cells, row) => `<row r="${row + 1}">${cells.map((cell, index) => {
    const ref = `${column(index)}${row + 1}`;
    const style = row === 0 ? 2 : 1;
    if (typeof cell === 'number' && Number.isFinite(cell)) return `<c r="${ref}" s="${style}"><v>${cell}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}
const STYLES = '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><sz val="9"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="9"/><name val="Calibri"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF000000"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf></cellXfs>';
function xlsxBytes(sheets) {
  return workbookBytes(sheets, { xml, sheetXml: sheet => sheetXml(sheet.rows), styles: STYLES });
}
__exports.xlsxBytes = xlsxBytes;
},
"files/paint.js": function (__require, __exports, document, window) {
'use strict';
const { PageError } = __require("../mysource/dom.js");
const { isScheduleContent } = __require("../mysource/schedule.js");
const PICTURE_DEADLINE = 5000;
const bounded = start => new Promise(resolve => {
  let done = false;
  const deadline = Date.now() + PICTURE_DEADLINE;
  const finish = value => { if (done) return; done = true; clearTimeout(timer); resolve(Date.now() >= deadline ? null : value); };
  const timer = setTimeout(() => finish(null), PICTURE_DEADLINE);
  try { start(finish); } catch { finish(null); }
});
async function paintCalendar({ noteTooltip = null } = {}) {
  const started = performance.now();
  const notes = [];
  const approximations = {};
  const mark = kind => { approximations[kind] = (approximations[kind] || 0) + 1; };
  let imageFailed = false;
  const count = { boxes: 0, words: 0, icons: 0, pictures: 0, picturesSkipped: 0, svgs: 0, pseudoSkipped: 0, pinned: 0, besideText: 0, arrows: 0 };
  const painted = new Set();
  let paintingTooltip = false;
  const visible = node => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
  };
  const name = [...document.querySelectorAll('.calendar-name')].find(visible);
  const weeks = [...document.querySelectorAll('.fc-view')].filter(isScheduleContent).filter(visible)
    .sort((a, b) => b.querySelectorAll('td.fc-day').length - a.querySelectorAll('td.fc-day').length)[0];
  let target = null;
  if (name && weeks) {
    target = name.parentElement;
    while (target && !target.contains(weeks)) target = target.parentElement;
    if (target === document.body || target === document.documentElement) target = null;
  }
  target = target || [...document.querySelectorAll('.js-calendar-wrapper, .staff-calendar-wrapper, #calendar, .fc')].filter(isScheduleContent).find(visible);
  if (!target) throw new PageError('No calendar on screen to take a picture of: open the person’s schedule in Custom view.');
  notes.push(name && target.contains(name) ? 'The person\'s name is in the picture' : '✗ The person\'s name was not found next to the calendar: it is not in the picture');
  const calendarArea = target.getBoundingClientRect();
  const noteArea = noteTooltip;
  const popupArea = noteArea?.getBoundingClientRect();
  const includeTooltip = noteTooltip?.isConnected && visible(noteTooltip) && noteTooltip.textContent.trim();
  const area = includeTooltip ? { left: Math.min(calendarArea.left, popupArea.left - 8), top: Math.min(calendarArea.top, popupArea.top),
    right: Math.max(calendarArea.right, popupArea.right), bottom: Math.max(calendarArea.bottom, popupArea.bottom),
    width: Math.max(calendarArea.right, popupArea.right) - Math.min(calendarArea.left, popupArea.left - 8),
    height: Math.max(calendarArea.bottom, popupArea.bottom) - Math.min(calendarArea.top, popupArea.top) } : calendarArea;
  let notesPainted = false;
  const requiredTooltipCharacters = includeTooltip ? noteTooltip.textContent.replace(/\s/g, '').length : 0;
  let paintedTooltipCharacters = 0;
  const W = Math.ceil(area.width);
  const H = Math.ceil(area.height);
  const ratio = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  const g = canvas.getContext('2d');
  g.scale(ratio, ratio);
  g.translate(-area.left, -area.top);
  g.fillStyle = '#fff';
  g.fillRect(area.left, area.top, W, H);
  const clear = colour => !colour || colour === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(colour);
  const fontOf = style => `${style.fontStyle} ${style.fontVariant === 'small-caps' ? 'small-caps ' : ''}${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const hidden = style => style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || Number(style.opacity) === 0;
  const splitCSS = value => {
    const parts = []; let start = 0, depth = 0, quote = '';
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (quote) { if (c === quote && value[i - 1] !== '\\') quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && !depth) { parts.push(value.slice(start, i).trim()); start = i + 1; }
    }
    parts.push(value.slice(start).trim()); return parts;
  };
  const backgroundImages = new Map();
  const sameSiteImage = el => el.src.startsWith('data:') || new URL(el.src).origin === location.origin;
  const imageFor = async source => {
    if (backgroundImages.has(source)) return backgroundImages.get(source);
    const pending = (async () => {
      if (source.startsWith('data:') && !/^data:image\/(?:png|jpeg|gif|webp|avif|bmp);/i.test(source)) return null;
      if (source.startsWith('data:')) {
        const image = new Image();
        const loaded = await bounded(done => { image.onload = () => done(image); image.onerror = () => done(null); image.src = `data:${source.slice(5)}`; });
        image.onload = image.onerror = null;
        if (!loaded) imageFailed = true;
        return loaded;
      }
      try {
        const url = new URL(source, document.baseURI);
        if (!sameSiteImage({ src: url.href })) return null;
        return [...document.images].find(image => image.complete && image.naturalWidth && (image.currentSrc || image.src) === url.href) || null;
      } catch { return null; }
    })();
    backgroundImages.set(source, pending); return pending;
  };
  const meet = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  const empty = r => r.right <= r.left || r.bottom <= r.top;
  const withClip = (clip, paint) => {
    if (empty(clip)) return;
    g.save();
    g.beginPath();
    g.rect(clip.left, clip.top, clip.right - clip.left, clip.bottom - clip.top);
    g.clip();
    try {
      const result = paint();
      if (result?.then) return result.finally(() => g.restore());
      g.restore();
      return result;
    } catch (error) { g.restore(); throw error; }
  };
  const transformText = (text, style) => {
    if (style.textTransform === 'uppercase') return text.toUpperCase();
    if (style.textTransform === 'lowercase') return text.toLowerCase();
    if (style.textTransform === 'capitalize') return text.replace(/\b\p{L}/gu, c => c.toUpperCase());
    return text;
  };
  const paintBox = async (el, style, clip) => {
    const rects = [...el.getClientRects()];
    for (const r of rects) {
      if (empty(meet(r, clip))) continue;
      const radii = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(corner => {
        const values = (style[`border${corner}Radius`] || '0').split(/\s+/);
        const size = (value, length) => Math.max(0, Math.min(parseFloat(value) * (value?.endsWith('%') ? length / 100 : 1) || 0, length / 2));
        return { x: size(values[0], r.width), y: size(values[1] || values[0], r.height) };
      });
      if (radii.some(radius => radius.x || radius.y)) mark('roundedCorners');
      const shape = (inset = 0) => {
        g.beginPath();
        if (g.roundRect) g.roundRect(r.left + inset, r.top + inset, Math.max(0, r.width - inset * 2), Math.max(0, r.height - inset * 2), radii.map(v => ({ x: Math.max(0, v.x - inset), y: Math.max(0, v.y - inset) })));
        else g.rect(r.left + inset, r.top + inset, r.width - inset * 2, r.height - inset * 2);
      };
      if (style.boxShadow && style.boxShadow !== 'none') {
        mark('shadows');
        for (const shadow of splitCSS(style.boxShadow).reverse()) {
          const colour = shadow.match(/rgba?\([^)]*\)|#[\da-f]+|\b[a-z]+\b/i)?.[0];
          const lengths = shadow.replace(/rgba?\([^)]*\)|#[\da-f]+/gi, '').match(/-?[\d.]+px/g)?.map(parseFloat) || [];
          if (/inset/.test(shadow) || !colour || lengths.length < 2) { mark('unsupportedShadows'); continue; }
          g.save(); g.shadowColor = colour; g.shadowOffsetX = lengths[0]; g.shadowOffsetY = lengths[1]; g.shadowBlur = lengths[2] || 0;
          g.fillStyle = clear(style.backgroundColor) ? '#fff' : style.backgroundColor;
          g.beginPath(); g.rect(r.left - 1000, r.top - 1000, r.width + 2000, r.height + 2000);
          if (g.roundRect) g.roundRect(r.left, r.top, r.width, r.height, radii); else g.rect(r.left, r.top, r.width, r.height);
          g.clip('evenodd');
          const spread = lengths[3] || 0;
          if (spread) mark('shadowSpread');
          shape(-spread); g.fill(); g.restore();
        }
      }
      if (!clear(style.backgroundColor)) {
        g.fillStyle = style.backgroundColor;
        shape(); g.fill();
        count.boxes += 1;
      }
      const backgrounds = splitCSS(style.backgroundImage || 'none');
      for (const layer of backgrounds.reverse()) {
        if (layer === 'none') continue;
        g.save(); shape(); g.clip();
        if (/^linear-gradient\(/.test(layer)) {
          mark('gradients');
          const stops = splitCSS(layer.slice(layer.indexOf('(') + 1, -1));
          let direction = 'to bottom';
          if (/^(to |[-\d.]+deg)/.test(stops[0])) direction = stops.shift();
          const angle = direction.endsWith('deg') ? parseFloat(direction) * Math.PI / 180 : ({ 'to top': 0, 'to right': Math.PI / 2, 'to bottom': Math.PI, 'to left': Math.PI * 1.5 })[direction];
          if (angle === undefined || stops.length < 2) mark('unsupportedGradients');
          else {
            const dx = Math.sin(angle), dy = -Math.cos(angle), length = Math.abs(r.width * dx) + Math.abs(r.height * dy);
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const gradient = g.createLinearGradient(cx - dx * length / 2, cy - dy * length / 2, cx + dx * length / 2, cy + dy * length / 2);
            try {
              const parsed = stops.map(stop => { const m = stop.match(/^(.*?)(?:\s+([\d.]+)%)?$/); return { color: m[1], offset: m[2] === undefined ? null : Number(m[2]) / 100 }; });
              parsed[0].offset ??= 0; parsed[parsed.length - 1].offset ??= 1;
              let last = 0;
              for (let i = 1; i < parsed.length; i++) if (parsed[i].offset !== null) {
                for (let j = last + 1; j < i; j++) parsed[j].offset = parsed[last].offset + (parsed[i].offset - parsed[last].offset) * (j - last) / (i - last);
                last = i;
              }
              for (const stop of parsed) gradient.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
              g.fillStyle = gradient; g.fillRect(r.left, r.top, r.width, r.height);
            } catch { mark('unsupportedGradients'); }
          }
        } else if (/^url\(/.test(layer)) {
          mark('backgroundImages');
          const image = await imageFor(layer.slice(4, -1).trim().replace(/^["']|["']$/g, ''));
          if (image) {
            mark('backgroundImagePlacement');
            g.drawImage(image, r.left, r.top, r.width, r.height);
          } else mark('unsupportedBackgroundImages');
        } else if (/gradient\(/.test(layer)) { mark('gradients'); mark('unsupportedGradients'); }
        else mark('unsupportedBackgrounds');
        g.restore();
      }
      for (const [side, x, y, w, h] of [
        ['Top', r.left, r.top, r.width, parseFloat(style.borderTopWidth)],
        ['Bottom', r.left, r.bottom - parseFloat(style.borderBottomWidth), r.width, parseFloat(style.borderBottomWidth)],
        ['Left', r.left, r.top, parseFloat(style.borderLeftWidth), r.height],
        ['Right', r.right - parseFloat(style.borderRightWidth), r.top, parseFloat(style.borderRightWidth), r.height],
      ]) {
        const colour = style[`border${side}Color`];
        if (style[`border${side}Style`] !== 'none' && style[`border${side}Style`] !== 'hidden' && w > 0 && h > 0 && !clear(colour)) {
          const borderStyle = style[`border${side}Style`];
          if (borderStyle === 'dashed' || borderStyle === 'dotted') mark(borderStyle === 'dashed' ? 'dashedBorders' : 'dottedBorders');
          if (!['solid', 'dashed', 'dotted'].includes(borderStyle)) mark('unsupportedBorders');
          g.save();
          g.beginPath();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          g.moveTo(cx, cy);
          if (side === 'Top') { g.lineTo(r.left, r.top); g.lineTo(r.right, r.top); }
          if (side === 'Right') { g.lineTo(r.right, r.top); g.lineTo(r.right, r.bottom); }
          if (side === 'Bottom') { g.lineTo(r.right, r.bottom); g.lineTo(r.left, r.bottom); }
          if (side === 'Left') { g.lineTo(r.left, r.bottom); g.lineTo(r.left, r.top); }
          g.closePath(); g.clip();
          const width = parseFloat(style[`border${side}Width`]);
          shape(width / 2); g.strokeStyle = colour; g.lineWidth = width;
          g.lineCap = borderStyle === 'dotted' ? 'round' : 'butt';
          g.setLineDash(borderStyle === 'dashed' ? [width * 3, width * 2] : borderStyle === 'dotted' ? [0, width * 2] : []);
          g.stroke(); g.restore();
        }
      }
    }
  };
  const paintText = (node, style, clip) => {
    const text = node.textContent;
    if (!text.trim()) return;
    g.font = fontOf(style);
    g.fillStyle = style.color;
    g.textBaseline = 'alphabetic';
    const range = document.createRange();
    const underline = /underline/.test(style.textDecorationLine || style.textDecoration);
    const strike = /line-through/.test(style.textDecorationLine || style.textDecoration);
    const spacing = parseFloat(style.letterSpacing) || 0;
    if (spacing) mark('letterSpacing');
    if (strike) mark('lineThrough');
    g.letterSpacing = `${spacing}px`;
    const holder = node.parentElement;
    const ellipsis = style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap' && holder.scrollWidth > holder.clientWidth;
    if (ellipsis) mark('ellipses');
    let ellipsisDrawn = false;
    const paintPiece = (start, end) => {
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = [...range.getClientRects()].filter(r => r.width > 0);
      if (!rects.length) return;
      let piece = transformText(text.slice(start, end), style);
      if (rects.length > 1 && end - start > 1) {
        for (let i = start; i < end; i++) paintPiece(i, i + 1);
        return;
      }
      const r = rects[0];
      if (ellipsis) {
        const box = holder.getBoundingClientRect();
        const right = box.right - (parseFloat(style.paddingRight) || 0) - (parseFloat(style.borderRightWidth) || 0);
        if (ellipsisDrawn || r.left >= right) return;
        if (r.right > right - g.measureText('…').width) {
          while (piece && g.measureText(piece + '…').width > right - r.left) piece = piece.slice(0, -1);
          piece += '…'; ellipsisDrawn = true;
        }
      }
      const m = g.measureText(piece);
      const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
      const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
      const y = r.top + (r.height - (ascent + descent)) / 2 + ascent;
      g.fillText(piece, r.left, y, r.width + 1);
      if (paintingTooltip && noteTooltip.contains(node) && piece === transformText(text.slice(start, end), style)
        && r.left >= clip.left && r.top >= clip.top && r.right <= clip.right && r.bottom <= clip.bottom) {
        paintedTooltipCharacters += text.slice(start, end).replace(/\s/g, '').length;
      }
      if (underline) g.fillRect(r.left, y + Math.max(1, descent / 3), r.width, Math.max(1, parseFloat(style.fontSize) / 14));
      if (strike) g.fillRect(r.left, y - ascent / 3, Math.min(r.width, g.measureText(piece).width), Math.max(1, parseFloat(style.fontSize) / 14));
      count.words += 1;
    };
    const tokens = /\S+/g;
    let match;
    while ((match = tokens.exec(text))) paintPiece(match.index, match.index + match[0].length);
  };
  const paintEdgeArrow = (el, which, style, clip) => {
    const w = { top: parseFloat(style.borderTopWidth) || 0, bottom: parseFloat(style.borderBottomWidth) || 0, left: parseFloat(style.borderLeftWidth) || 0, right: parseFloat(style.borderRightWidth) || 0 };
    const solid = side => w[side] > 0 && style[`border${side[0].toUpperCase()}${side.slice(1)}Style`] !== 'none' && !clear(style[`border${side[0].toUpperCase()}${side.slice(1)}Color`]);
    const coloured = ['top', 'bottom', 'left', 'right'].filter(solid);
    if (coloured.length !== 1) return;
    const side = coloured[0];
    const width = side === 'top' || side === 'bottom' ? w.left + w.right : w[side];
    const height = side === 'top' || side === 'bottom' ? w[side] : w.top + w.bottom;
    if (!width || !height) return;
    const box = el.getBoundingClientRect();
    const own = getComputedStyle(el);
    const parts = [...el.children].filter(child => child.getBoundingClientRect().width > 0);
    const marginLeft = parseFloat(style.marginLeft) || 0;
    const x = which === '::after'
      ? (parts.length ? parts[parts.length - 1].getBoundingClientRect().right : box.left + parseFloat(own.paddingLeft)) + marginLeft
      : box.left + parseFloat(own.borderLeftWidth) + parseFloat(own.paddingLeft) + marginLeft;
    const y = box.top + box.height / 2 - height / 2;
    withClip(clip, () => {
      g.fillStyle = style[`border${side[0].toUpperCase()}${side.slice(1)}Color`];
      g.beginPath();
      if (side === 'top') { g.moveTo(x, y); g.lineTo(x + width, y); g.lineTo(x + width / 2, y + height); }
      if (side === 'bottom') { g.moveTo(x, y + height); g.lineTo(x + width, y + height); g.lineTo(x + width / 2, y); }
      if (side === 'left') { g.moveTo(x, y); g.lineTo(x, y + height); g.lineTo(x + width, y + height / 2); }
      if (side === 'right') { g.moveTo(x + width, y); g.lineTo(x + width, y + height); g.lineTo(x, y + height / 2); }
      g.closePath();
      g.fill();
    });
    count.arrows += 1;
  };
  const paintPseudo = (el, which, clip) => {
    const style = getComputedStyle(el, which);
    if (hidden(style) || hidden(getComputedStyle(el))) return;
    const content = style.content;
    if (!content || content === 'none' || content === 'normal') return;
    const glyph = content.replace(/^["']|["']$/g, '').replace(/\\([0-9a-f]{1,6})\s?/gi, (m, hex) => String.fromCodePoint(parseInt(hex, 16)));
    if (!glyph.trim()) {
      paintEdgeArrow(el, which, style, clip);
      return;
    }
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) {
      count.pseudoSkipped += 1;
      return;
    }
    const own = getComputedStyle(el);
    withClip(clip, () => {
      g.globalAlpha *= Number.isFinite(parseFloat(style.opacity)) ? parseFloat(style.opacity) : 1;
      g.font = fontOf(style);
      g.letterSpacing = style.letterSpacing || '0px';
      g.fillStyle = style.color;
      g.textBaseline = 'middle';
      const after = getComputedStyle(el, '::after');
      const afterToo = which === '::before' && !hidden(after) && !!after.content && !['none', 'normal'].includes(after.content);
      if (!el.textContent.trim() && !afterToo && !el.children.length) {
        g.textAlign = 'center';
        g.fillText(glyph, r.left + r.width / 2, r.top + r.height / 2);
      } else if (!el.textContent.trim()) {
        g.textAlign = 'start';
        g.fillText(glyph, r.left + parseFloat(own.borderLeftWidth) + parseFloat(own.paddingLeft), r.top + r.height / 2);
      } else {
        const rects = [...el.getClientRects()];
        const line = which === '::before' ? rects[0] : rects[rects.length - 1];
        const lineHeight = parseFloat(own.lineHeight) || parseFloat(own.fontSize) * 1.2;
        const y = line.top + parseFloat(own.borderTopWidth) + parseFloat(own.paddingTop) + lineHeight / 2;
        const pinned = style.position === 'absolute' || style.position === 'fixed' || style.float === 'right' || style.float === 'left';
        if (pinned) {
          count.pinned += 1;
          const holder = style.position === 'absolute' ? (el.closest('.fc-event') || el.offsetParent || el) : (el.closest('.fc-event') || el);
          const b = holder.getBoundingClientRect();
          const hs = getComputedStyle(holder);
          const size = parseFloat(style.fontSize) || 12;
          const fromRight = parseFloat(style.right);
          const fromLeft = parseFloat(style.left);
          const fromTop = parseFloat(style.top);
          const rightSide = style.float === 'right' || (!Number.isNaN(fromRight) && Number.isNaN(fromLeft));
          const top = b.top + parseFloat(hs.borderTopWidth) + (Number.isNaN(fromTop) ? parseFloat(hs.paddingTop) : fromTop);
          g.textBaseline = 'top';
          if (rightSide) {
            g.textAlign = 'end';
            g.fillText(glyph, b.right - parseFloat(hs.borderRightWidth) - (Number.isNaN(fromRight) ? parseFloat(hs.paddingRight) : fromRight), top + Math.max(0, (lineHeight - size) / 2));
          } else {
            g.textAlign = 'start';
            g.fillText(glyph, b.left + parseFloat(hs.borderLeftWidth) + (Number.isNaN(fromLeft) ? parseFloat(hs.paddingLeft) : fromLeft), top + Math.max(0, (lineHeight - size) / 2));
          }
        } else if ((count.besideText += 1) && which === '::before') {
          g.textAlign = 'start';
          g.fillText(glyph, line.left + parseFloat(own.borderLeftWidth) + parseFloat(own.paddingLeft), y);
        } else {
          g.textAlign = 'end';
          g.fillText(glyph, line.right - parseFloat(own.borderRightWidth) - parseFloat(own.paddingRight), y);
        }
      }
      g.textAlign = 'start';
    });
    painted.add(el);
    count.icons += 1;
  };
  const paintPicture = async (el, clip) => {
    const r = el.getBoundingClientRect();
    if (el.tagName.toLowerCase() === 'img') {
      let sameSite = false;
      try {
        sameSite = sameSiteImage(el);
      } catch {   }
      if (!sameSite || !el.complete || !el.naturalWidth) {
        count.picturesSkipped += 1;
        return;
      }
      withClip(clip, () => g.drawImage(el, r.left, r.top, r.width, r.height));
      count.pictures += 1;
      return;
    }
    const copy = el.cloneNode(true);
    if ([copy, ...copy.querySelectorAll('*')].some(node =>
      ['image', 'use', 'style', 'foreignobject', 'script', 'feimage'].includes(node.tagName.toLowerCase()) ||
      [...node.attributes].some(attr => /href$/i.test(attr.name) || /url\s*\(|@import/i.test(attr.value)))) {
      mark('unsupportedSVG'); count.picturesSkipped++; return;
    }
    copy.setAttribute('width', String(r.width));
    copy.setAttribute('height', String(r.height));
    if (!copy.getAttribute('xmlns')) copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.style.color = getComputedStyle(el).color;
    const image = new Image();
    const ready = await bounded(done => {
      image.onload = () => done(true);
      image.onerror = () => done(null);
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
    });
    image.onload = image.onerror = null;
    if (!ready) { imageFailed = true; count.picturesSkipped++; return; }
    withClip(clip, () => g.drawImage(image, r.left, r.top, r.width, r.height));
    painted.add(el);
    count.svgs += 1;
  };
  const paintScroll = (el, style, clip) => {
    const overflowing = el.scrollHeight > el.clientHeight;
    if (style.overflowY !== 'scroll' && !(style.overflowY === 'auto' && overflowing)) return;
    mark('scrollbars');
    const r = el.getBoundingClientRect(), size = Math.min(12, r.height / 3), x = r.right - size;
    const colours = (style.scrollbarColor || '').match(/rgba?\([^)]*\)|#[\da-f]+|\b[a-z]+\b/gi) || [];
    const thumb = colours.length === 2 ? colours[0] : '#0070c0', track = colours.length === 2 ? colours[1] : '#dcebf5';
    withClip(clip, () => {
      g.font = `${Math.max(6, size - 3)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#0070c0';
      g.fillText('▲', x + size / 2, r.top + size / 2);
      g.fillText('▼', x + size / 2, r.bottom - size / 2);
      if (overflowing) {
        mark('scrollbarThumbs');
        const height = r.height - size * 2, thumbHeight = Math.min(height, Math.max(4, height * el.clientHeight / el.scrollHeight));
        const fraction = Math.max(0, Math.min(1, el.scrollTop / (el.scrollHeight - el.clientHeight)));
        g.fillStyle = track; g.fillRect(x, r.top + size, size, height);
        g.fillStyle = thumb; g.fillRect(x + 2, r.top + size + fraction * (height - thumbHeight), Math.max(1, size - 4), thumbHeight);
      }
      g.textAlign = 'start';
    });
  };
  const layers = new Map(), deferred = new Set(), states = new Map();
  const collect = (el, context) => {
    if (!isScheduleContent(el)) return;
    if (el === noteTooltip && !paintingTooltip) return;
    const style = getComputedStyle(el);
    if (hidden(style) || el.id === 'snooze-panel-host') return;
    const positioned = style.position && style.position !== 'static';
    const creates = el === target || el === noteTooltip ||
      (positioned && style.zIndex && style.zIndex !== 'auto') ||
      ['fixed', 'sticky'].includes(style.position) || Number(style.opacity) < 1 ||
      (style.transform && style.transform !== 'none') || style.isolation === 'isolate';
    if (el !== context && (positioned || creates)) {
      if (!layers.has(context)) layers.set(context, []);
      layers.get(context).push({ el, z: parseInt(style.zIndex) || 0 }); deferred.add(el);
    }
    const owner = creates ? el : context;
    for (const child of el.children) collect(child, owner);
  };
  const walk = async (el, clip, alpha, released = false) => {
    if (!isScheduleContent(el)) return;
    if (el === noteTooltip && !paintingTooltip) return;
    if (deferred.has(el) && !released) { states.set(el, { clip, alpha }); return; }
    const style = getComputedStyle(el);
    if (style.display === 'none' || el.id === 'snooze-panel-host') return;
    const opacity = alpha * (Number.isFinite(parseFloat(style.opacity)) ? parseFloat(style.opacity) : 1);
    if (opacity <= 0) return;
    const shown = style.visibility !== 'hidden';
    const tag = el.tagName.toLowerCase();
    g.globalAlpha = opacity;
    if (shown && includeTooltip && noteTooltip.contains(el) && el.matches('.tooltip-arrow, .arrow, .popover-arrow')) {
      const sides = ['Top', 'Bottom', 'Left', 'Right'].filter(side => parseFloat(style[`border${side}Width`]) > 0 && !clear(style[`border${side}Color`]));
      if (sides.length === 1) {
        const r = el.getBoundingClientRect(), side = sides[0];
        g.fillStyle = style[`border${side}Color`]; g.beginPath();
        if (side === 'Right') { g.moveTo(r.right, r.top); g.lineTo(r.right, r.bottom); g.lineTo(r.left, (r.top + r.bottom) / 2); }
        if (side === 'Left') { g.moveTo(r.left, r.top); g.lineTo(r.left, r.bottom); g.lineTo(r.right, (r.top + r.bottom) / 2); }
        if (side === 'Top') { g.moveTo(r.left, r.top); g.lineTo(r.right, r.top); g.lineTo((r.left + r.right) / 2, r.bottom); }
        if (side === 'Bottom') { g.moveTo(r.left, r.bottom); g.lineTo(r.right, r.bottom); g.lineTo((r.left + r.right) / 2, r.top); }
        g.closePath(); g.fill(); count.arrows++; return;
      }
    }
    if (shown) {
      for (const [property, kind] of [['transform', 'unsupportedTransforms'], ['filter', 'unsupportedFilters'], ['maskImage', 'unsupportedMasks'], ['backdropFilter', 'unsupportedBackdropFilters']]) {
        if (style[property] && style[property] !== 'none') mark(kind);
      }
      await withClip(clip, () => paintBox(el, style, clip));
    }
    if (tag === 'img' || tag === 'svg') {
      if (shown) await paintPicture(el, clip);
      return;
    }
    if (['script', 'style', 'template', 'noscript', 'iframe', 'canvas', 'video'].includes(tag)) return;
    if (tag === 'input' && el.type === 'checkbox') {
      if (shown) withClip(clip, () => {
        mark('checkboxes');
        const r = el.getBoundingClientRect(), size = Math.min(14, r.width, r.height), x = r.left + (r.width - size) / 2, y = r.top + (r.height - size) / 2;
        g.fillStyle = el.checked ? (style.accentColor && style.accentColor !== 'auto' ? style.accentColor : '#0070c0') : '#fff';
        g.fillRect(x, y, size, size); g.strokeStyle = '#666'; g.lineWidth = 1; g.setLineDash([]); g.strokeRect(x, y, size, size);
        if (el.checked) { g.beginPath(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.moveTo(x + size * .2, y + size * .5); g.lineTo(x + size * .45, y + size * .75); g.lineTo(x + size * .85, y + size * .2); g.stroke(); }
      });
      return;
    }
    if (tag === 'select' || tag === 'textarea' || (tag === 'input' && !['checkbox', 'radio', 'hidden', 'file', 'image', 'range', 'color'].includes(el.type))) {
      const value = tag === 'select' ? (el.selectedOptions[0]?.textContent || '') : (el.value || el.placeholder || '');
      if (shown && value.trim()) {
        const r = el.getBoundingClientRect();
        withClip(meet(clip, { left: r.left, top: r.top, right: r.right, bottom: r.bottom }), () => {
          g.font = fontOf(style);
          g.fillStyle = el.value || tag === 'select' ? style.color : '#888';
          g.textBaseline = 'middle';
          const left = r.left + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0);
          if (tag === 'textarea') {
            const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
            const top = r.top + (parseFloat(style.paddingTop) || 0) + parseFloat(style.fontSize) / 2 + 2;
            const width = r.right - left - (parseFloat(style.paddingRight) || 0) - (parseFloat(style.borderRightWidth) || 0);
            const lines = [];
            for (const paragraph of value.split(/\r?\n/)) {
              let line = '';
              for (const word of paragraph.split(/\s+/).filter(Boolean)) {
                const next = line ? `${line} ${word}` : word;
                if (line && g.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
              }
              lines.push(line);
            }
            lines.forEach((line, i) => g.fillText(line, left, top + i * lineHeight));
          } else g.fillText(value.replace(/\s+/g, ' ').trim(), left, r.top + r.height / 2);
        });
        count.words += 1;
      }
      return;
    }
    let inner = clip;
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      const r = el.getBoundingClientRect();
      inner = meet(clip, {
        left: r.left + parseFloat(style.borderLeftWidth), top: r.top + parseFloat(style.borderTopWidth),
        right: r.right - parseFloat(style.borderRightWidth), bottom: r.bottom - parseFloat(style.borderBottomWidth),
      });
      if (empty(inner)) return;
    }
    if (shown) paintPseudo(el, '::before', inner);
    const localLayers = (layers.get(el) || []).sort((a, b) => a.z - b.z);
    const remember = (parent, parentClip, parentAlpha) => {
      for (const child of parent.children) {
        if (!isScheduleContent(child)) continue;
        const cs = getComputedStyle(child);
        if (hidden(cs)) continue;
        states.set(child, { clip: parentClip, alpha: parentAlpha });
        const cr = child.getBoundingClientRect();
        const childClip = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' ? meet(parentClip, cr) : parentClip;
        remember(child, childClip, parentAlpha * (parseFloat(cs.opacity) || 1));
      }
    };
    if (localLayers.length) remember(el, inner, opacity);
    for (const layer of localLayers.filter(layer => layer.z < 0)) {
      const state = states.get(layer.el); if (state) await walk(layer.el, state.clip, state.alpha, true);
    }
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (shown) {
          g.globalAlpha = opacity;
          withClip(inner, () => paintText(child, style, inner));
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) await walk(child, inner, opacity);
    }
    if (shown) {
      g.globalAlpha = opacity;
      paintPseudo(el, '::after', inner);
      paintScroll(el, style, clip);
    }
    for (const layer of localLayers.filter(layer => layer.z >= 0)) {
      const state = states.get(layer.el); if (state) await walk(layer.el, state.clip, state.alpha, true);
    }
  };
  const whole = { left: area.left, top: area.top, right: area.right, bottom: area.bottom };
  collect(target, target);
  await walk(target, whole, 1);
  if (includeTooltip) {
    paintingTooltip = true;
    collect(noteTooltip, noteTooltip); await walk(noteTooltip, whole, 1);
    notesPainted = requiredTooltipCharacters > 0 && paintedTooltipCharacters === requiredTooltipCharacters;
    notes.push(notesPainted ? 'The hover note is in the picture' : '✗ Hover note not in the picture: take it by hand');
  }
  g.globalAlpha = 1;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  notes.push(`Painted in ${seconds} s: ${count.boxes} boxes, ${count.words} words, ${count.icons} icon(s) from the page's own fonts; picture ${W}×${H} px${ratio !== 1 ? ` (×${ratio} for this screen)` : ''}`);
  if (count.pictures || count.svgs) notes.push(`${count.pictures} picture(s) and ${count.svgs} drawn icon(s) copied`);
  if (count.picturesSkipped) notes.push(`${count.picturesSkipped} picture(s) left out (from another site, or not loaded)`);
  if (count.arrows) notes.push(`${count.arrows} arrow(s) drawn from box edges`);
  if (count.pseudoSkipped) notes.push(`${count.pseudoSkipped} decoration(s) with no size left out`);
  const describe = node => `${node.tagName.toLowerCase()}${[...node.classList].map(c => '.' + c.replace(/\d+/g, '#')).join('')}`;
  const iconLike = [...target.querySelectorAll('i, svg, [class*="fa-"], [class*="icon"], [class*="glyph"]')]
    .filter(isScheduleContent)
    .filter(node => !node.closest('svg') || node.tagName.toLowerCase() === 'svg')
    .filter(node => { const b = node.getBoundingClientRect(); return b.width > 0 || b.height > 0; });
  const missed = iconLike.filter(node => !painted.has(node) && ![...painted].some(p => node.contains(p)) && !node.textContent.trim());
  notes.push(`Icons on screen: ${iconLike.length}; painted: ${iconLike.length - missed.length} (${count.pinned} pinned to a corner, ${count.besideText} beside text)`);
  const kinds = new Map();
  for (const node of missed) {
    const before = getComputedStyle(node, '::before');
    const b = node.getBoundingClientRect();
    const key = `${describe(node)} (::before ${before.content && before.content !== 'none' ? 'yes' : 'no'}, font ${before.fontFamily.slice(0, 30)}, ${Math.round(b.width)}×${Math.round(b.height)}, shown ${getComputedStyle(node).visibility}, opacity ${getComputedStyle(node).opacity})`;
    kinds.set(key, (kinds.get(key) || 0) + 1);
  }
  for (const [key, n] of [...kinds].slice(0, 8)) notes.push(`✗ not painted ×${n}: ${key}`);
  let blob = null;
  try {
    if (!imageFailed) blob = await bounded(done => canvas.toBlob(done, 'image/png'));
    if (!blob) notes.push('✗ Picture not confirmed: an image or PNG export failed or exceeded its time limit.');
  } catch (error) {
    notes.push(`✗ The browser would not let the picture out (${error.name}).`);
  }
  const omissions = [
    { kind: 'icons', count: missed.length }, { kind: 'pictures', count: count.picturesSkipped },
    { kind: 'pseudo elements', count: count.pseudoSkipped },
    { kind: 'name', count: name && target.contains(name) ? 0 : 1 }, { kind: 'paint', count: blob ? 0 : 1 },
  ].filter(item => item.count > 0);
  if (noteTooltip && !notesPainted) omissions.push({ kind: 'notes', count: 1 });
  for (const [kind, total] of Object.entries(approximations)) notes.push(`Approximation: ${kind} ${total}`);
  return { blob, notes, omissions, approximations, notesPainted: !!blob && notesPainted };
}
__exports.paintCalendar = paintCalendar;
},
"files/capture.js": function (__require, __exports, document, window) {
'use strict';
const { paintCalendar } = __require("./paint.js");
const lastPicture = { notes: [], omissions: [], approximations: {} };
let latestPicture = 0;
async function takeScreenshot(options = {}) {
  const picture = ++latestPicture;
  lastPicture.notes = []; lastPicture.omissions = [];
  lastPicture.approximations = {}; lastPicture.notesPainted = false;
  const { blob, notes, omissions, approximations, notesPainted } = await paintCalendar(options);
  if (picture !== latestPicture) throw new Error('Picture not confirmed: another picture started.');
  lastPicture.notes = notes;
  lastPicture.omissions = omissions;
  lastPicture.approximations = approximations;
  lastPicture.notesPainted = notesPainted;
  if (!blob) throw new Error(notes.find(note => note.startsWith('✗')) || 'The picture could not be made.');
  return blob;
}
function pictureWarnings() {
  const missed = lastPicture.notes.map(note => note.match(/^✗ not painted ×(\d+)/)).filter(Boolean).reduce((sum, match) => sum + Number(match[1]), 0);
  const others = lastPicture.notes.filter(note => note.startsWith('✗') && !note.startsWith('✗ not painted')).map(note => note.slice(2));
  return [missed ? `${missed} icon${missed === 1 ? '' : 's'} could not be drawn` : '', ...others].filter(Boolean).join('; ');
}
__exports.lastPicture = lastPicture;
__exports.takeScreenshot = takeScreenshot;
__exports.pictureWarnings = pictureWarnings;
},
"files/folder.js": function (__require, __exports, document, window) {
'use strict';
const safeName = name => String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 120) || 'case';
__exports.safeName = safeName;
},
"files/casefiles.js": function (__require, __exports, document, window) {
'use strict';
const { xlsxBytes } = __require("./xlsx.js");
const { addDays, compareDays, mondayOf, usDate } = __require("../rules/dates.js");
const { dateOf } = __require("./report.js");
const NUMBER = /^-?\d+(\.\d+)?$/;
function reportFile(slice, prefix) {
  if (slice.sourceDays?.length) {
    const sorted = [...slice.sourceDays].sort(compareDays);
    const start = sorted[0], end = sorted.at(-1);
    const weeks = [];
    for (let d = mondayOf(start); compareDays(d, end) <= 0; d = addDays(d, 7)) weeks.push(d);
    const label = usDate;
    const dateColumns = slice.sourceDateColumns || new Set(slice.sourceColumns.filter(column => { const day = dateOf(column); return day && !day.invalid; }));
    const columns = [];
    let placed = false;
    for (const column of slice.sourceColumns) {
      if (!dateColumns.has(column)) columns.push(column);
      else if (!placed) { columns.push(...weeks.map(label)); placed = true; }
    }
    const rows = [columns, ...(slice.backupEntries ?? slice.entries).map(entry => {
      const sums = new Map(weeks.map(d => [label(d), 0]));
      let total = 0;
      for (const { day, hours } of entry.days || []) {
        if (compareDays(day, start) < 0 || compareDays(day, end) > 0) continue;
        const key = label(mondayOf(day));
        sums.set(key, sums.get(key) + hours); total += hours;
      }
      return columns.map(column => column === 'Total Scheduled Hours' ? total : sums.has(column) ? sums.get(column) : entry.fields[column] ?? '');
    })];
    const bytes = xlsxBytes([{ name: 'Staff Scheduled Hours', rows }]);
    return { name: `${prefix} - Staff Schedule Hours Report.xlsx`, blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
  }
  const numeric = new Set([...(slice.dateColumns || slice.columns.filter(column => { const day = dateOf(column); return day && !day.invalid; })), 'Total Scheduled Hours']);
  const headings = slice.columns.map(column => column.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_, month, day, year) => `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`));
  const rows = [headings, ...slice.entries.map(entry => slice.columns.map(column => {
    const value = entry.fields[column] ?? '';
    return numeric.has(column) && NUMBER.test(value) ? Number(value) : value;
  }))];
  const bytes = xlsxBytes([{ name: 'Staff Scheduled Hours', rows }]);
  return { name: `${prefix} - Staff Schedule Hours Report.xlsx`, blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
}
__exports.reportFile = reportFile;
},
"screen/panel.js": function (__require, __exports, document, window) {
'use strict';
const { COLOURS } = __require("../family/look.js");
const { createLeaveWarning } = __require("../family/leave-warning.js");
const { createSessionClock, paintClock } = __require("./session-clock.js");
const { SN_COLUMNS, readTable } = __require("../servicenow/files.js");
const { todayOf, compareDays, addDays, mondayOf } = __require("../rules/dates.js");
const { sortCases } = __require("../servicenow/sort.js");
const { reportPull } = __require("../files/groups.js");
const { checkPerson, termDayOf } = __require("../rules/shared.js");
const { planTaxWeeks } = __require("../rules/tax-weeks.js");
const { decideExit } = __require("../rules/exit.js");
const { entriesToAdd } = __require("../mysource/copy.js");
const { reportDays } = __require("../run/backup.js");
const { alreadyAdded } = __require("../run/work.js");
const { DNS_CLIENT, LOA_CLIENT } = __require("../mysource/checks.js");
const { leavePeriod, leaveRuns } = __require("../rules/leaves.js");
const { valueKey } = __require("../rules/prepare.js");
const { personSlice, readReport, loadedReports, reportHasPerson, reportKind, addLoadedReport } = __require("../files/report.js");
const { readSite } = __require("../mysource/site.js");
const { el, wrongPageNotice } = __require("./ui.js");
const { isSchedulePage, SCHEDULE_PAGE_WORDS } = __require("../mysource/schedule.js");
const { safePageInfo } = __require("../mysource/pageinfo.js");
const { batchControls, newBatchPopup } = __require("./batch-panel.js");
const { restoreReportButton } = __require("./restore-panel.js");
const { requireFreshReport, reportTimeLine } = __require("../files/report-time.js");
const { mailFNoAction } = __require("./compact.js");
const { liveTestButton } = __require("./live-test-panel.js");
const HOST_ID = 'snooze-panel-host';
function panelAtStake(work) {
  const batch = work.batch, live = work.liveTest;
  return !!(batch?.active || batch?.confirmed && ['running', 'paused', 'session'].includes(batch.state)
    || batch?.changesAttempted && !batch.saved
    || live?.active || live?.state === 'paused' || (live?.changed || live?.result) && !live.saved);
}
const COMPACT_STYLE = `
@keyframes snooze-clock-warn{0%{transform:none}35%{transform:scale(1.14)}100%{transform:none}}
@media(prefers-reduced-motion:no-preference){.counter.clock-warn{animation:snooze-clock-warn .4s ease-out}}
@media(prefers-reduced-motion:reduce){.counter.clock-warn{animation:none}}
:host{all:initial;--family-lavender:${COLOURS.lavender};--family-muted:${COLOURS.muted}}*{box-sizing:border-box}[hidden]{display:none!important}
*::-webkit-scrollbar{width:6px;height:6px}*::-webkit-scrollbar-thumb{background:${COLOURS.grey};border-radius:999px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-button{display:none;width:0;height:0}
.panel{position:fixed;top:16px;right:16px;width:340px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;z-index:2147483647;background:${COLOURS.page};color:${COLOURS.text};border:1px solid ${COLOURS.divider};border-radius:10px;font:13px/1.45 system-ui,"Segoe UI",sans-serif;box-shadow:0 8px 28px rgba(0,0,0,0.4666666666666667)}
.head{height:30px;display:flex;align-items:center;gap:8px;padding:0 10px;background:${COLOURS.header};border-bottom:1px solid ${COLOURS.divider};cursor:move;touch-action:none}.title{font-weight:700;flex:1}.counter{font-variant-numeric:tabular-nums;color:${COLOURS.muted};font-size:11px;font-weight:500}.body{padding:12px;display:grid;gap:10px}.batch{display:grid;gap:10px}
button{font:bold 13px system-ui,sans-serif;border:0;border-radius:8px;padding:8px 10px;cursor:pointer;color:${COLOURS.text};background:${COLOURS.grey}}button:hover:not(:disabled){filter:brightness(1.1);transform:translateY(-1px)}button:active:not(:disabled){transform:scale(.98)}button:disabled{opacity:.5;cursor:default}button:focus-visible,summary:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid ${COLOURS.selection};outline-offset:2px}.head button{font:16px system-ui;padding:0 3px;background:none;height:26px}.file-line{display:flex;align-items:center;gap:4px;white-space:nowrap;font-size:12px}.file-line>span{flex:1}.change{font-size:11px;font-weight:600;color:${COLOURS.text};background:${COLOURS.surface};border:1px solid ${COLOURS.grey};border-radius:6px;padding:3px 9px}.start-files{display:grid;gap:10px}
.green{background:${COLOURS.green};color:${COLOURS.page}}.blue{background:${COLOURS.blue};color:${COLOURS.page}}.amber{background:${COLOURS.amber};color:${COLOURS.page}}.grey,.undo{background:${COLOURS.grey}}.buttons{display:flex;gap:8px}.buttons>button{flex:1}.counts{white-space:nowrap}.drop{padding:14px 8px;border:1px dashed ${COLOURS.grey};border-radius:8px;background:${COLOURS.surface};text-align:center;font-weight:400;width:100%}summary{cursor:pointer;list-style:none;padding:8px 0}summary::-webkit-details-marker{display:none}.package-check summary::before{content:'\\25b6';display:inline-block;width:14px}.package-check[open] summary::before{content:'\\25bc'}.person-row{position:relative;padding:8px 0;border-top:1px solid ${COLOURS.divider}}.person-name{overflow-wrap:anywhere;font-weight:600;padding-right:48px}.reason,.dates{color:${COLOURS.muted}}.failed{color:${COLOURS.redText};overflow-wrap:anywhere}.warn{color:${COLOURS.amber};overflow-wrap:anywhere}.undo{position:absolute;right:0;top:8px;font-size:11px;padding:4px 6px;color:${COLOURS.muted}}.progress{height:3px;background:${COLOURS.divider};border-radius:2px;overflow:hidden}.progress>div{height:100%;background:${COLOURS.green}}.running-person{background:${COLOURS.surface};border:1px solid ${COLOURS.divider};border-radius:8px;padding:10px}.dates{margin-top:4px}textarea,input{background:${COLOURS.surface};color:${COLOURS.text};border:1px solid ${COLOURS.grey};border-radius:6px;padding:6px;font:inherit;width:100%}.popup-shade{position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,0.4666666666666667);z-index:2147483647}.popup{width:340px;max-width:calc(100vw - 32px);padding:16px;background:${COLOURS.surface};color:${COLOURS.text};border:1px solid ${COLOURS.grey};border-radius:10px;font:13px/1.45 system-ui;box-shadow:0 8px 28px rgba(0,0,0,0.4666666666666667)}.popup-title{font-weight:700;margin-bottom:8px}.popup .buttons{margin-top:16px}
/* Yoink's look, measured from Yoink's own panel (Dre, 2026-10-06): DESIGN.md says Yoink is the reference. */
.panel{width:360px;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.5);font:13px/1.5 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.head{padding:0 6px 0 12px}.title{font-size:12px;font-weight:600;letter-spacing:.01em}
.head button{width:24px;height:24px;padding:0;border-radius:6px;display:grid;place-items:center;font-size:14px;line-height:1;color:${COLOURS.muted};background:transparent}.head button:hover:not(:disabled){background:${COLOURS.divider};color:${COLOURS.text};filter:none;transform:none;box-shadow:none}
.body,.batch{gap:12px}button{font-weight:700;transition:filter .15s ease,transform .15s ease,box-shadow .15s ease}button:hover:not(:disabled){box-shadow:0 4px 12px rgba(0,0,0,.4)}button:active:not(:disabled){transform:scale(.985)}
.red{background:${COLOURS.red};color:${COLOURS.page}}.stack{display:grid;gap:8px}.stack>button{width:100%}
.status{font-weight:600;font-size:12px;line-height:1.35;overflow-wrap:anywhere;white-space:normal}
.counts{font-size:12px;font-weight:500}.c-todo{color:var(--family-lavender)}.c-no-action{color:var(--family-muted)}.c-done{color:${COLOURS.greenText}}.c-hand{color:${COLOURS.amber}}.c-fail{color:${COLOURS.redText}}.c-sep{color:${COLOURS.grey};margin:0 5px}
.run-line{display:flex;align-items:baseline;gap:8px}.run-line>.counts{flex:1;min-width:0}.run-of{font-size:11px;white-space:nowrap;color:${COLOURS.muted};font-variant-numeric:tabular-nums}
.run-now{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:${COLOURS.muted};overflow-wrap:anywhere;white-space:normal}
.progress{height:8px;margin-top:6px;background:${COLOURS.surface};border-radius:8px}.progress>div{background:${COLOURS.green};border-radius:8px;transition:width .2s linear}
.popup-shade{background:rgba(10,10,10,.6)}
.popup{width:360px;padding:0;background:${COLOURS.page};border:1px solid ${COLOURS.divider};border-radius:14px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.6);font:13px/1.5 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.popup-title{margin:0;padding:8px 12px;background:${COLOURS.header};border-bottom:1px solid ${COLOURS.divider};font-size:14px}.popup>div:not(.popup-title){padding:12px;line-height:1.6}.popup .buttons{display:grid;gap:8px;margin:0;padding:0 12px 12px!important}.popup .buttons>button{width:100%}
.counts{white-space:normal;display:flex;flex-wrap:wrap;align-items:baseline}.file-line>span{white-space:normal;min-width:0}.undo-state{color:var(--family-muted);font-size:12px}
.undo-fold{display:grid;gap:6px}.undo-toggle{width:100%}.stack>button,.undo-toggle{line-height:17px}.undo-list{max-height:240px;overflow-y:auto;overscroll-behavior:contain}.undo-list .person-row{min-height:44px}
.recovery-guide,.package-check{font-size:11px;line-height:1.5;overflow-wrap:anywhere}.recovery-guide summary,.package-check summary{cursor:pointer;padding:4px 0}.package-scroll{overflow:auto;max-height:240px}.package-check table{border-collapse:collapse;min-width:620px;font-size:11px}.package-check th{background:${COLOURS.header};color:${COLOURS.text};font-weight:bold}.package-check td,.package-check th{padding:5px;border:1px solid ${COLOURS.divider};text-align:left;vertical-align:top;white-space:pre-wrap}
.screen-title{font-size:11px;color:${COLOURS.muted};white-space:nowrap}.sign-off{display:grid;gap:4px;font-size:12px;color:${COLOURS.muted}}.sign-off input{margin:0;padding:7px 9px;line-height:18px}.review-actions{margin-top:0}.batch{gap:8px}.restore-entry>button{width:100%}
.live-test-entry{margin-top:8px;padding-top:8px;border-top:1px solid ${COLOURS.grey}}.live-test-entry>button{font:11px system-ui,sans-serif;background:transparent;color:${COLOURS.muted};padding:2px 0}.live-test-entry>button:hover:not(:disabled){box-shadow:none;filter:none;transform:none;text-decoration:underline}
.panel.restore-open{display:flex;flex-direction:column;overflow:hidden}.restore-open>.head{flex:none}.restore-open>.body{display:flex;flex-direction:column;min-height:0;overflow:hidden}.restore-screen{display:flex;flex-direction:column;min-height:0;gap:0}.restore-top{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex:none}.restore-top strong{font-size:12px;flex:1}.restore-small{padding:6px 8px;font-size:11px;white-space:nowrap}.restore-list{max-height:calc(100vh - 265px);min-height:0;overflow:auto;overscroll-behavior:contain}.restore-person{display:block;background:${COLOURS.surface};border-radius:8px;padding:8px 10px 9px;margin-bottom:4px;cursor:pointer}.restore-person:hover{filter:brightness(1.08)}.restore-person:focus-within{outline:2px solid ${COLOURS.selection};outline-offset:2px}.restore-person input{position:absolute;width:1px;height:1px;opacity:0;margin:0}.restore-main{display:flex;align-items:baseline;gap:8px;line-height:17px}.restore-main strong{font-size:12px;font-weight:600;flex:1;min-width:0;overflow-wrap:anywhere}.restore-state{font-size:11px;white-space:nowrap;color:${COLOURS.muted}}.restore-person.selected strong,.restore-person.selected .restore-state{color:${COLOURS.greenText}}.restore-dates{display:inline-block;margin-top:3px;padding:1px 5px;border-radius:4px;font-size:10px;color:${COLOURS.muted};background:${COLOURS.divider}}.restore-warning{font-size:10px;color:${COLOURS.amber};margin-top:3px;overflow-wrap:anywhere}.restore-footer{flex:none}.restore-count{font-size:11px;font-weight:600;color:${COLOURS.muted};margin-top:8px}.restore-footer .buttons{margin-top:8px}.restore-notice{font-size:11px;line-height:1.45;color:${COLOURS.muted};margin-top:8px}
`;
function mountPanel(version, { clock = createSessionClock(), schedule = fn => window.setInterval(fn, 1000), cancel = id => window.clearInterval(id) } = {}) {
  const host = el('div', { id: HOST_ID });
  const root = host.attachShadow({ mode: 'open' });
  const work = { version, busy: false, listeners: new Set(), host, dialogs: root, signOff: '', clock };
  const leaveWarning = createLeaveWarning({ win: window, atStake: () => host.isConnected && panelAtStake(work) });
  const removal = new window.MutationObserver(() => { if (!host.isConnected) work.close(); });
  work.close = () => { leaveWarning.stop(); work.stopClock?.(); removal.disconnect(); host.remove(); };
  work.pageInfo = safePageInfo(version);
  const body = el('div', { class: 'body' });
  work.counter = el('span', { class: 'counter' });
  const screenTitle = el('span', { class: 'screen-title' });
  work.setScreenTitle = text => { screenTitle.textContent = text; };
  work.backToFiles = null;
  const title=el('span',{class:'title'},'Snooze');
  const head = el('div', { class: 'head' }, title, screenTitle, work.counter,
    el('button', { 'aria-label': 'Close', title: 'Close', onclick: () => { if(work.busy)return;if(work.batch?.confirmed&&!work.batch.saved || (work.liveTest?.result || work.liveTest?.changed)&&!work.liveTest.saved){newBatchPopup({ ...work, saved: false },work.close);}else work.close(); } }, '✕'));
  const panel = el('div', { class: 'panel', role: 'dialog', 'aria-label': 'Snooze' }, head, body);
  root.append(el('style', {}, COMPACT_STYLE), panel); document.body.append(host);
  leaveWarning.start(); removal.observe(document.body, { childList: true });
  let clockStage;
  work.tickClock = () => {
    clockStage = paintClock(work.counter, clock.left(), clockStage, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
    work.refreshClockControls?.();
  };
  work.tickClock();
  const clockTimer = schedule(() => { if (!host.isConnected) { work.close(); return; } work.tickClock(); });
  work.stopClock = () => cancel(clockTimer);
  head.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    const bounds = panel.getBoundingClientRect();
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    const move = e => { panel.style.right = 'auto'; panel.style.left = `${Math.max(0, Math.min(window.innerWidth - bounds.width, e.clientX - x))}px`; panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 30, e.clientY - y))}px`; };
    const end = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', end);
  });
  return { work, body, root };
}
function showLoad(body, sorted, onReport, work, { onTickets = () => {}, report = null } = {}) {
  const cases = sorted.cases;
  const actionable = cases.filter(one => one.decision.outcome !== 'notHandled');
  const loa = actionable.filter(one => one.record.notification.kind === 'leave').length;
  const exit = actionable.filter(one => one.record.notification.kind === 'exit').length;
  const unknown = actionable.filter(one => !['leave', 'exit'].includes(one.record.notification.kind)).length;
  const noAction = cases.filter(one => one.decision.outcome === 'notHandled' || mailFNoAction(one)).length;
  const duplicates = cases.reduce((count, one) => count + (one.record.duplicates?.length || 0), 0);
  const ticketLine = fileLine(`${cases.length + duplicates} tickets: ${loa} LOA · ${exit} Exit${unknown ? ` · ${unknown} by hand` : ''} · ${noAction} no action${duplicates ? ` · ${duplicates} duplicates` : ''}`, onTickets, work);
  body.replaceChildren(ticketLine);
  if (Array.isArray(report)) {
    for (const one of report) body.append(fileLine(`${reportKind(one) === 'audit' ? 'Audit' : 'Consulting'} · ${reportTimeLine(one.pullTime.time)}`, file => onReport(file, reportKind(one)), work));
    if (report.length < 2) body.append(dropArea(`Drop ${reportKind(report[0]) === 'audit' ? 'Consulting' : 'Audit'} Staff Schedule Hours Report · max 2 h old`, file => { if (!work.busy) return onReport(file); }));
  }
  else if (report) body.append(fileLine(reportTimeLine(report.pullTime.time), file => onReport(file), work));
  else body.append(dropArea('Drop Staff Schedule Hours Report · max 2 h old', file => { if (!work.busy) return onReport(file); }));
}
function fileLine(label, receive, work) {
  const input = el('input', { type: 'file', accept: '.csv,.xlsx', hidden: true });
  const locked = () => work.busy || work.batch?.confirmed === true;
  input.addEventListener('change', () => { const file = input.files[0]; input.value = ''; if (file && !locked()) receive(file); });
  const change = el('button', { class: 'change', onclick: () => { if (!locked()) input.click(); } }, 'change');
  work.listeners.add(() => { change.disabled = locked(); });
  return el('div', { class: 'file-line' }, el('span', {}, label), change, input);
}
function dropArea(label, receive) {
  const input = el('input', { type: 'file', accept: '.csv,.xlsx', hidden: true });
  const drop = el('button', { class: 'drop', onclick: () => { if (!drop.disabled) input.click(); } }, label);
  const read = async file => {
    if (!file || drop.disabled) return;
    drop.disabled = input.disabled = true;
    drop.textContent = label.includes('ServiceNow') ? 'Reading ServiceNow export…' : 'Reading Staff Schedule Hours Report…';
    try { await receive(file); }
    finally { drop.disabled = input.disabled = false; drop.textContent = label; }
  };
  input.addEventListener('change', () => { const file = input.files[0]; input.value = ''; read(file); });
  drop.addEventListener('dragover', event => event.preventDefault());
  drop.addEventListener('drop', event => { event.preventDefault(); read(event.dataTransfer.files[0]); });
  return el('div', { class: 'drop-wrap' }, drop, input);
}
function attachReport(cases, input, pull) {
  for (const one of cases.filter(one => one.decision.outcome === 'report' || ['exitNoLwd', 'leaveOver'].includes(one.decision.code))) {
    const reports = loadedReports(input);
    const matches = reports.filter(report => reportHasPerson(report, one.record.email));
    if (matches.length > 1) {
      one.slice = { status: 'bothReports' };
      one.personStop = { outcome: 'byHand', code: 'bothReports' };
      continue;
    }
    const report = matches[0] || reports[0];
    const wanted = { ...(one.decision.plan?.window || { start: pull.start, end: pull.end }) };
    const reportEnd = report.days?.at(-1) || pull.end;
    if (one.decision.plan?.action === 'dns') wanted.end = pull.end;
    if (one.decision.plan && compareDays(wanted.end, reportEnd) > 0) {
      one.decision.plan.pastReport = { reportEnd, windowEnd: one.decision.plan.pastReport?.windowEnd || wanted.end };
      wanted.end = reportEnd;
    }
    if (one.decision.plan) one.decision.plan.window = wanted;
    one.slice = personSlice(report, one.record.email, wanted);
    Object.assign(one.slice, { reportEnd: report.days?.at(-1), pullTime: report.pullTime, fileName: report.fileName });
    one.record.person.professional = '';
    if (one.slice.person) Object.assign(one.record.person, one.slice.person, { resourceManager: one.slice.resourceManager });
    if (one.record.notification.kind === 'exit' && one.slice.backupEntries?.[0]) one.record.person.region = one.slice.backupEntries[0].fields.Region || '';
    one.personStop = one.slice.status === 'ready' ? checkPerson(one.slice.person && { ...one.slice.person, resourceManager: one.slice.resourceManager, site: one.record.subcategory?.site || 'consulting' }, one.decision)
      : one.slice.status === 'twoEmailsInReportCell' ? { outcome: 'byHand', code: 'twoEmailsInReportCell' } : null;
    if (one.record.notification.kind === 'exit' && one.slice.person) {
      const checked = decideExit(one.record, todayOf(), one.slice);
      if (checked.outcome !== one.decision.outcome || checked.code !== one.decision.code || one.record.subcategory?.business === 'audit') one.decision = checked;
      if (one.record.subcategory?.business === 'audit' && one.slice.status === 'ready') one.personStop = checkPerson({ ...one.record.person, resourceManager: one.slice.resourceManager }, one.decision);
    }
    delete one.reportHint;
    if (one.record.subcategory?.site === 'tax' && !one.personStop && one.slice.status === 'ready' && one.slice.mode === 'day' && one.decision.plan?.action === 'add') {
      const proposal = planTaxWeeks({ plan: one.decision.plan, today: todayOf(), rows: reportDays({ ...one.slice, entries: one.slice.backupEntries }, { start: mondayOf(todayOf()), end: reportEnd }) });
      if (proposal.code === 'taxPastEnd') one.decision = { ...one.decision, outcome: 'noReport', code: proposal.code };
      if (proposal.code === 'taxPartialLoa') one.personStop = { outcome: 'byHand', code: proposal.code };
    }
    if (one.record.subcategory?.site === 'tax' || one.slice.site === 'tax' || one.personStop || one.slice.status !== 'ready' || one.slice.mode !== 'day'
      || !['add', 'dns', 'clearClients'].includes(one.decision.plan?.action)) continue;
    const plan = one.decision.plan;
    const window = { start: todayOf(), end: reportEnd };
    const days = reportDays({ ...one.slice, entries: one.slice.backupEntries }, window);
    if (plan.action === 'add') {
      const loa = days.filter(row => valueKey(row.client) === valueKey(LOA_CLIENT));
      const { runs } = leaveRuns(loa, leavePeriod(loa, plan, window.start));
      const last = runs.at(-1)?.end;
      const watchedEnd = addDays(last && compareDays(last, plan.loaEnd) > 0 ? last : plan.loaEnd, 56);
      if (compareDays(watchedEnd, window.end) < 0) window.end = watchedEnd;
    }
    const { problems } = entriesToAdd({ window, days: days.filter(row => compareDays(row.day, window.end) <= 0) });
    if (problems.length) {
      one.personStop = { outcome: 'byHand', code: 'cannotRestore', problems };
      continue;
    }
    if (plan.action !== 'dns') continue;
    const termText = String(one.slice.person?.termDate || '').trim();
    const term = termText ? termDayOf(termText) : null;
    const dnsEnd = compareDays(plan.dnsEnd, reportEnd) < 0 ? plan.dnsEnd : reportEnd;
    if (term && compareDays(term, plan.dnsStart) < 0) one.reportHint = 'Schedule greyed out: no schedule change.';
    else if (alreadyAdded({ days }, plan.dnsStart, dnsEnd, DNS_CLIENT, true)) one.reportHint = 'DNS already there; no change';
  }
}
function start(version) {
  if (!isSchedulePage()) { wrongPageNotice(SCHEDULE_PAGE_WORDS.paste); return; }
  document.getElementById('snooze-wrong-page-notice')?.remove();
  if (document.getElementById(HOST_ID)?.dataset.batchReserved === 'true') return;
  document.getElementById(HOST_ID)?.remove();
  const { work, body } = mountPanel(version);
  let loading = false;
  let tickets = null, data = null;
  const errorLine = message => { body.querySelector('.load-error')?.remove(); body.append(el('div', { class: 'load-error warn', role: 'status' }, `✗ ${message}`)); };
  const rebuild = () => {
    work.saveMessage = ''; work.saved = false; work.batch = null; work.refreshClockControls = null; work.undoExpanded = false;
    const sorted = sortCases({ tickets }, todayOf());
    const cases = sorted.cases.filter(one => one.decision.outcome !== 'notHandled');
    const pull = reportPull(cases.filter(one => one.record.email), todayOf());
    if (data) attachReport(cases, data, pull);
    const files = el('div', { class: 'start-files' });
    showLoad(files, sorted, loadReport, work, { onTickets: loadTickets, report: data });
    work.setScreenTitle('');
    work.backToFiles = () => {
      if (work.busy || work.batch?.active) return;
      work.batch = null; work.refreshClockControls = null; work.setScreenTitle('');
      files.hidden = false;
      body.replaceChildren(files, el('div', { class: 'buttons' }, el('button', { class: 'blue', onclick: rebuild }, 'Review batch')));
    };
    files.hidden = !!data;
    body.replaceChildren(files);
    if (data) {
      const excludedCases = sorted.cases.filter(one => one.decision.outcome === 'notHandled');
      const box = batchControls(cases, data, work, () => { files.hidden = true; }, { noAction: excludedCases.length, excludedCases });
      body.append(box);
    }
  };
  const beginRead = () => {
    if (loading || work.busy) return null;
    loading = work.busy = true;
    const read = { screen: body.firstChild };
    work.fileRead = read; work.host.dataset.batchReserved = 'true';
    for (const listener of work.listeners) listener();
    return read;
  };
  const currentRead = read => work.fileRead === read && work.host.isConnected && body.firstChild === read.screen;
  const endRead = read => {
    if (work.fileRead !== read) return;
    work.fileRead = null; loading = work.busy = false;
    delete work.host.dataset.batchReserved;
    for (const listener of work.listeners) listener();
  };
  const loadReport = async (file, replace = null) => {
    const read = beginRead(); if (!read) return;
    try {
      const next = await readReport(file);
      if (!currentRead(read)) return;
      requireFreshReport(next);
      const loaded = addLoadedReport(data, next, readSite(), replace);
      data = loaded; work.staffReport = loaded; rebuild();
    } catch (error) { if (currentRead(read)) errorLine(error.message); }
    finally { endRead(read); }
  };
  const loadTickets = async file => {
    const read = beginRead(); if (!read) return;
    try {
      const sn = await readTable(file, 'The ServiceNow export', SN_COLUMNS);
      if (!currentRead(read)) return;
      tickets = sn.rows; rebuild();
    } catch (error) { if (currentRead(read)) errorLine(error.message); }
    finally { endRead(read); }
  };
  work.newBatch = () => {
    if (work.fileRead) { work.fileRead = null; loading = work.busy = false; delete work.host.dataset.batchReserved; }
    tickets = data = null; work.batch = null; work.refreshClockControls = null; work.saved = false; work.saveMessage = ''; work.undoExpanded = false;
    work.setScreenTitle('');
    body.closest('.panel')?.classList.remove('restore-open');
    body.replaceChildren(dropArea('Drop ServiceNow export', loadTickets), restoreReportButton(work, body, work.newBatch), liveTestButton(work, body, work.newBatch));
  };
  work.newBatch();
  return work;
}
__exports.reportTimeLine = reportTimeLine;
__exports.COMPACT_STYLE = COMPACT_STYLE;
__exports.mountPanel = mountPanel;
__exports.showLoad = showLoad;
__exports.attachReport = attachReport;
__exports.start = start;
}
};
const __snoozeCache = new Map();
function __snoozeResolve(parent, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  const parts = parent.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}
function __snoozeLoad(id) {
  if (__snoozeCache.has(id)) return __snoozeCache.get(id);
  const factory = __snoozeModules[id];
  if (!factory) throw new Error('Snooze module not found: ' + id);
  const exports = {};
  __snoozeCache.set(id, exports);
  factory(specifier => __snoozeLoad(__snoozeResolve(id, specifier)), exports, document, window);
  return exports;
}
__snoozeLoad("screen/panel.js").start("0.13.1");
})();
