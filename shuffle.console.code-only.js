// 0.7.0-console.61
(() => {
'use strict';
const __transfersModules = {
"common.js": function (__require, __exports, document, window) {
'use strict';
const { readSheetMatrix } = __require("./spreadsheet.js");
const { InputFileError } = __require("./input-error.js");
const SERVICE_NOW_HEADERS = [
  'Number', 'Subcategory 1', 'Subcategory 2', 'State', 'Subject person',
  'Opened', 'Updated', 'Follow up', 'SLA', 'Description',
];
const MY_SOURCE_HEADERS = [
  'Professional', 'Email', 'Empid', 'Level', 'Level Group', 'Region',
  'Cost Center', 'Resource Manager', 'Coach', 'People Leader', 'Business',
  'Major/Minor', 'Practice', 'Talent Model', 'Business Area', 'Market Offering',
  'Business Line', 'Sub Business Line', 'Job Family', 'Job Sub Family',
  'Talent Group', 'Talent Sub Group', 'Focus Area 1', 'Focus Area 2',
  'Primary Key Skill', 'Secondary Key Skill', 'Vendor', 'Vendor Module',
  'Audit STX Industry', 'Primary Industry', 'Secondary Industry',
  'Primary Sector', 'Secondary Sector', 'US Citizen', 'Visa Ready Status',
  'Delivery Pool Professional', 'Cohort Tagging', 'FS IPP', 'LSHC IPP',
  'CNSR IPP', 'ER&I IPP', 'TMT IPP', 'GPS IPP', 'Start Date', 'Term Date',
  'Location', 'USI Resource Cluster', 'Active', 'Department', 'Legal Name',
  'Assign Period', 'Security', 'Authorization', 'Schedule Compliance',
  'Hire Type', 'Position Title', 'City', 'State', 'Zip', 'Cell Phone',
  'WkHrs/Period', 'LOA', 'FWA', 'Possible LCA Required', 'CPA',
  'Comments 1', 'Comments 2', 'Comments 3', 'Comments 4', 'Rev Date',
];
function cleanHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim();
}
function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}
async function readRowRecords(file, requiredHeaders, label) {
  const extension = extensionOf(file.name);
  if (!['.csv', '.xlsx'].includes(extension)) {
    throw new InputFileError(`${label} must be a CSV or XLSX file.`);
  }
  const { sheetName, matrix } = await readSheetMatrix(file, label);
  const headerIndex = matrix.findIndex(row => row.some(value => String(value ?? '').trim()));
  if (headerIndex < 0) throw new InputFileError(`${label} is empty.`);
  const headers = matrix[headerIndex].map(cleanHeader);
  const folded = new Map();
  headers.forEach((header, index) => {
    const key = header.toLocaleLowerCase();
    if (key && folded.has(key)) {
      throw new InputFileError(`${label} has a duplicate column named “${header}”.`);
    }
    if (key) folded.set(key, index);
  });
  const missing = requiredHeaders.filter(header => !folded.has(header.toLocaleLowerCase()));
  if (missing.length) {
    const unknown = headers.filter(header => header && !requiredHeaders.some(required => required.toLocaleLowerCase() === header.toLocaleLowerCase()));
    throw new InputFileError(`${label} is missing required columns.`, [
      `Missing: ${missing.join(', ')}`,
      ...(unknown.length ? [`Other headers found: ${unknown.slice(0, 8).join(', ')}${unknown.length > 8 ? ', …' : ''}`] : []),
    ]);
  }
  const rows = matrix.slice(headerIndex + 1)
    .map((values, offset) => {
      const record = {
        __row: values.sourceRow || headerIndex + offset + 2,
        __file: file.name,
      };
      requiredHeaders.forEach(header => {
        record[header] = String(values[folded.get(header.toLocaleLowerCase())] ?? '').trim();
      });
      return record;
    })
    .filter(record => requiredHeaders.some(header => record[header] !== ''));
  if (!rows.length) throw new InputFileError(`${label} has headers but no data rows.`);
  return {
    fileName: file.name,
    sheetName,
    rows,
    unknownHeaders: headers.filter(header => header && !requiredHeaders.some(required => required.toLocaleLowerCase() === header.toLocaleLowerCase())),
  };
}
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
__exports.InputFileError = InputFileError;
__exports.SERVICE_NOW_HEADERS = SERVICE_NOW_HEADERS;
__exports.MY_SOURCE_HEADERS = MY_SOURCE_HEADERS;
__exports.readRowRecords = readRowRecords;
__exports.csvCell = csvCell;
},
"input-error.js": function (__require, __exports, document, window) {
'use strict';
class InputFileError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'InputFileError';
    this.details = details;
  }
}
__exports.InputFileError = InputFileError;
},
"rules.js": function (__require, __exports, document, window) {
'use strict';
const TICKET_FIELDS = [
  'Email ID', 'Title', 'Cost Center', 'Entity', 'Operating Model',
  'Business Area', 'Business Line', 'Sub Business Line',
  'Primary Market Offering', 'Secondary Market Offering', 'Focus Area',
  'Talent Group', 'Talent Sub Group',
];
const FIELD_BY_FOLDED_NAME = new Map(TICKET_FIELDS.map(field => [field.toLocaleLowerCase(), field]));
const ENTITY_MAP = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};
function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, token) => {
    const lower = token.toLocaleLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return ENTITY_MAP[lower] ?? match;
  });
}
function normalizeText(value) {
  return decodeEntities(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}
function descriptionToText(value) {
  return decodeEntities(value)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n')
    .replace(/<\s*p(?:\s[^>]*)?>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n?/g, '\n');
}
function sundayOrNull(year, month, day) {
  if (month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid && date.getUTCDay() === 0 ? date : null;
}
function nextMondayAfterSunday(value) {
  const match = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/.exec(String(value ?? ''));
  if (!match) return { effectiveDate: '', ambiguous: false };
  const a = Number(match[1]);
  const b = Number(match[2]);
  const year = Number(match[3]);
  const asMonthFirst = sundayOrNull(year, a, b);
  const asDayFirst = a === b ? null : sundayOrNull(year, b, a);
  if (asMonthFirst && asDayFirst) return { effectiveDate: '', ambiguous: true };
  const sunday = asMonthFirst || asDayFirst;
  if (!sunday) return { effectiveDate: '', ambiguous: false };
  sunday.setUTCDate(sunday.getUTCDate() + 1);
  return {
    effectiveDate: `${String(sunday.getUTCMonth() + 1).padStart(2, '0')}/${String(sunday.getUTCDate()).padStart(2, '0')}/${sunday.getUTCFullYear()}`,
    ambiguous: false,
  };
}
function calendarDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? ''));
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}
function calendarToday(asOfDate) {
  const date = asOfDate instanceof Date ? asOfDate : new Date(asOfDate ?? Date.now());
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}
function isAwaitingEffectiveDate(effectiveDate, asOfDate = new Date()) {
  const effective = calendarDate(effectiveDate);
  const today = calendarToday(asOfDate);
  return Boolean(effective && today && today < effective);
}
function extractPhase3EffectiveDate(value) {
  const text = descriptionToText(value);
  const match = /transfer\s+effective\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/i.exec(text);
  if (!match) {
    const phrasePresent = /transfer\s+effective\b/i.test(text);
    return {
      statedDate: '',
      effectiveDate: '',
      warning: phrasePresent
        ? 'No transfer-effective date is stated in this ticket. If most fields still show pre-transfer values, the effective date may simply not have arrived yet — confirm with a fresh MySource export before treating this as an error.'
        : 'The transfer-effective date could not be read from the ticket Description.',
    };
  }
  const { effectiveDate, ambiguous } = nextMondayAfterSunday(match[1]);
  if (effectiveDate) return { statedDate: match[1], effectiveDate, warning: '' };
  return {
    statedDate: match[1],
    effectiveDate: '',
    warning: ambiguous
      ? `The ticket transfer-effective date "${match[1]}" is ambiguous (month/day order unclear) and could not be resolved automatically.`
      : 'The ticket transfer-effective date must be a valid Sunday before a Date Sensitive row can be staged.',
  };
}
function parseTicketDescription(value) {
  const current = {};
  const future = {};
  const warnings = [];
  const phase3Date = extractPhase3EffectiveDate(value);
  if (phase3Date.warning) warnings.push(phase3Date.warning);
  for (const rawLine of descriptionToText(value).split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    let label = match[1].trim();
    const isFuture = /^future\s+/i.test(label);
    if (isFuture) label = label.replace(/^future\s+/i, '').trim();
    const canonical = FIELD_BY_FOLDED_NAME.get(label.toLocaleLowerCase());
    if (!canonical) {
      warnings.push(`Unrecognized description field: ${match[1].trim()}`);
      continue;
    }
    (isFuture ? future : current)[canonical] = match[2].trim();
  }
  return {
    current,
    future,
    warnings,
    email: current['Email ID'] || future['Email ID'] || '',
    transferEffectiveDate: phase3Date.statedDate,
    phase3EffectiveDate: phase3Date.effectiveDate,
  };
}
function extractLevelCode(value) {
  const match = /\bL\s*(?:[_-]\s*)?(CEO|PP|MD|70|65|60|55|50|45|40|35|30|25|20|15|10|5|L)(?=[^A-Za-z0-9]|$)/i.exec(String(value ?? ''));
  return match ? `L${match[1].toLocaleUpperCase()}` : '';
}
function meaningfulFutureFields(ticket) {
  return Object.entries(ticket.future)
    .filter(([field, value]) => field !== 'Email ID' && normalizeText(value))
    .filter(([field, value]) => normalizeText(value) !== normalizeText(ticket.current[field]));
}
function normalizedCode(value) {
  const leading = String(value ?? '').match(/^\s*(\d+)/)?.[1] ?? '';
  return leading.replace(/^0+(?=\d)/, '');
}
function withoutLeadingCode(value) {
  return String(value ?? '').replace(/^\s*\d+\s*(?:[_-]\s*)?/, '');
}
function withoutLeadingLevel(value) {
  return String(value ?? '').replace(/^\s*L\s*(?:[_-]\s*)?(?:CEO|PP|MD|70|65|60|55|50|45|40|35|30|25|20|15|10|5|L)\s*(?:[_-]\s*)?/i, '');
}
function compareText(ticketValue, reportValue) {
  return normalizeText(ticketValue) === normalizeText(reportValue);
}
function compareCode(ticketValue, reportValue) {
  return normalizedCode(ticketValue) !== '' && normalizedCode(ticketValue) === normalizedCode(reportValue);
}
function compareStrippedCode(ticketValue, reportValue) {
  return normalizeText(withoutLeadingCode(ticketValue)) === normalizeText(reportValue);
}
function compareTitle(ticketValue, reportValue) {
  const ticketText = normalizeText(withoutLeadingLevel(ticketValue));
  const reportText = normalizeText(withoutLeadingLevel(reportValue));
  if (ticketText === reportText) return true;
  const [shorter, longer] = ticketText.length <= reportText.length
    ? [ticketText, reportText]
    : [reportText, ticketText];
  return shorter.length > 0 && longer.startsWith(shorter);
}
function containsAuditOrTax(value) {
  return /\b(audit|tax)\b/i.test(normalizeText(value));
}
function isMAndA(value) {
  const normalized = normalizeText(value);
  return /\bm\s*(?:&|and)\s*a\b/.test(normalized) || /mergers?.*acquisitions?/.test(normalized);
}
function profileKind(report) {
  const gps = /\bgps\b/i.test(normalizeText(report.Practice));
  const ma = isMAndA(report['Business Line']);
  if (gps && ma) return 'conflict';
  if (gps) return 'gps';
  if (ma) return 'ma';
  return 'cs';
}
__exports.compareCode = compareCode;
__exports.compareStrippedCode = compareStrippedCode;
__exports.compareText = compareText;
__exports.compareTitle = compareTitle;
__exports.containsAuditOrTax = containsAuditOrTax;
__exports.meaningfulFutureFields = meaningfulFutureFields;
__exports.profileKind = profileKind;
__exports.withoutLeadingCode = withoutLeadingCode;
__exports.decodeEntities = decodeEntities;
__exports.normalizeText = normalizeText;
__exports.descriptionToText = descriptionToText;
__exports.isAwaitingEffectiveDate = isAwaitingEffectiveDate;
__exports.extractPhase3EffectiveDate = extractPhase3EffectiveDate;
__exports.parseTicketDescription = parseTicketDescription;
__exports.extractLevelCode = extractLevelCode;
},
"spreadsheet.js": function (__require, __exports, document, window) {
'use strict';
const { InputFileError } = __require("./input-error.js");
const { readWorkbook: readWorkbookBytes, ReaderUnreadableError } = __require("./family/reader/index.js");
function readWorkbook(bytes) {
  return readWorkbookBytes(bytes);
}
function spreadsheetReaderAvailable() {
  return typeof globalThis.DecompressionStream === 'function' && typeof globalThis.TextDecoder === 'function';
}
async function readSheetMatrix(file, label) {
  if (!spreadsheetReaderAvailable()) {
    throw new InputFileError('The local spreadsheet reader did not load. Refresh and try again.');
  }
  let workbook;
  try {
    workbook = await readWorkbook(await file.arrayBuffer());
  } catch {
    throw new InputFileError(`${label} could not be read. Export it again as CSV or XLSX.`);
  }
  if (workbook.sheetNames.length !== 1) {
    throw new InputFileError(
      `${label} must contain exactly one worksheet.`,
      [`Found ${workbook.sheetNames.length} worksheets.`],
    );
  }
  const sheetName = workbook.sheetNames[0];
  let rows;
  try {
    rows = workbook.rows(sheetName);
  } catch (error) {
    if (!(error instanceof ReaderUnreadableError)) throw error;
    throw new InputFileError(
      `${label} couldn't be read: its sheet "${error.sheetName}" is damaged.`,
      ['Open it in Excel, save it again as XLSX, and add it again.'],
    );
  }
  const matrix = rows.map(row => Object.defineProperty(row.map(value => String(value ?? '')), 'sourceRow', { value: row.sourceRow }));
  return { sheetName, matrix };
}
__exports.spreadsheetReaderAvailable = spreadsheetReaderAvailable;
__exports.readSheetMatrix = readSheetMatrix;
},
"run/start.js": function (__require, __exports, document, window) {
'use strict';
const { connectMySource, describeMySourcePage } = __require("../mysource/mysource-window.js");
const { startWorklist } = __require("../screen/worklist.js");
const { COLOURS } = __require("../family/look.js");
const INSTANCE_KEY = Symbol.for('transfers.console.instance');
const TRANSFERS_WIDTH = 420;
const WINDOW_NAME = 'transfers-window';
const INTRO_ID = 'transfers-start-steps';
const BUTTON_ID = 'transfers-open-window';
const ON_TOP = '2147483646';
function supported() {
  return typeof Document !== 'undefined'
    && 'adoptedStyleSheets' in Document.prototype
    && typeof CSSStyleSheet === 'function'
    && typeof CSSStyleSheet.prototype.replaceSync === 'function'
    && typeof DecompressionStream === 'function'
    && typeof structuredClone === 'function';
}
function setStyles(element, styles) {
  for (const [property, value] of Object.entries(styles)) element.style.setProperty(property, value, 'important');
}
function buildNodes(doc, parent, nodes) {
  for (const node of nodes) {
    if (typeof node === 'string') {
      parent.appendChild(doc.createTextNode(node));
      continue;
    }
    const [tag, attributes, children] = node;
    const element = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    buildNodes(doc, element, children);
    parent.appendChild(element);
  }
}
function prepareFrame(frame, { title, css, tree }) {
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!doc.doctype) doc.insertBefore(doc.implementation.createDocumentType('html', '', ''), doc.documentElement);
  if (!doc.documentElement) doc.appendChild(doc.createElement('html'));
  doc.documentElement.setAttribute('lang', 'en');
  let head = doc.head;
  if (!head) {
    head = doc.createElement('head');
    doc.documentElement.insertBefore(head, doc.documentElement.firstChild);
  }
  let body = doc.body;
  if (!body) {
    body = doc.createElement('body');
    doc.documentElement.appendChild(body);
  }
  head.replaceChildren();
  const titleElement = doc.createElement('title');
  titleElement.textContent = title;
  head.appendChild(titleElement);
  body.replaceChildren();
  for (const attribute of [...body.attributes]) body.removeAttribute(attribute.name);
  doc.adoptedStyleSheets = css.map(text => {
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(text);
    return sheet;
  });
  const colours = {
    '--bg': COLOURS.page, '--surface': COLOURS.surface, '--border': COLOURS.divider,
    '--text': COLOURS.text, '--muted': COLOURS.muted, '--sage': COLOURS.green,
    '--blue': COLOURS.blue, '--amber': COLOURS.amber, '--coral': COLOURS.red,
    '--head': COLOURS.header, '--border-soft': COLOURS.divider,
    '--lavender': COLOURS.lavender, '--selected-text': COLOURS.selection,
  };
  for (const [property, value] of Object.entries(colours)) doc.documentElement.style.setProperty(property, value);
  buildNodes(doc, body, tree);
  return { doc, win };
}
function placeOnTheRight(win, screen) {
  try {
    if (!win.innerWidth) return false;
    const width = TRANSFERS_WIDTH + Math.max(0, win.outerWidth - win.innerWidth);
    const height = screen.availHeight || win.outerHeight;
    win.resizeTo(width, height);
    win.moveTo(Math.max(screen.availLeft || 0, (screen.availLeft || 0) + (screen.availWidth || width) - width), screen.availTop || 0);
    return true;
  } catch {
    return false;
  }
}
function windowFeatures(screen) {
  const left = (screen.availLeft || 0) + Math.max(0, (screen.availWidth || 1800) - TRANSFERS_WIDTH);
  return `popup,width=${TRANSFERS_WIDTH},height=${screen.availHeight || 1000},left=${left},top=${screen.availTop || 0}`;
}
function showStartSteps(win) {
  const doc = win.document;
  doc.title = 'Shuffle';
  const body = doc.body || doc.documentElement.appendChild(doc.createElement('body'));
  setStyles(body, { margin: '0', background: '#151515', color: '#eeeeee', font: '14px/1.6 system-ui, sans-serif' });
  doc.getElementById(INTRO_ID)?.remove();
  const intro = doc.createElement('div');
  intro.id = INTRO_ID;
  const header = doc.createElement('div');
  header.textContent = 'Shuffle';
  setStyles(header, {
    display: 'flex', 'align-items': 'center', 'min-height': '48px', padding: '8px 14px', 'box-sizing': 'border-box',
    background: '#1c1c1c', 'border-bottom': '1px solid #3a3a3a', font: '700 14px system-ui, sans-serif',
  });
  const content = doc.createElement('div');
  setStyles(content, { padding: '16px' });
  const heading = doc.createElement('h2');
  heading.textContent = 'Step 2 of 2: start Shuffle here';
  setStyles(heading, { 'font-size': '18px', margin: '0 0 12px' });
  content.append(heading);
  const step = (text, keys) => {
    const line = doc.createElement('p');
    setStyles(line, { margin: '0 0 10px' });
    line.append(doc.createTextNode(text));
    (keys || []).forEach((key, index) => {
      if (index) line.append(doc.createTextNode(' +'));
      const box = doc.createElement('span');
      box.textContent = key;
      setStyles(box, {
        display: 'inline-block', margin: '0 4px', padding: '1px 7px', 'border-radius': '5px',
        background: '#242424', border: '1px solid #4b4b4b', font: '600 13px ui-monospace, Consolas, monospace',
      });
      line.append(box);
    });
    content.append(line);
  };
  step('1. Click anywhere in this window.');
  step('2. Press', ['F12']);
  step('3. Press', ['Ctrl', 'P']);
  step('4. Type !Shuffle and press', ['Enter']);
  for (const text of [
    'Shuffle then appears here, and F12 closes the developer tools again.',
    'You only do this once. Keep this window open: moving between profiles in MySource does not affect it.',
    'Open profiles in your MySource window as usual, in that same window rather than a new tab: Shuffle reads that window.',
  ]) {
    const line = doc.createElement('p');
    line.textContent = text;
    setStyles(line, { margin: '14px 0 0', color: '#a8a8a8', 'font-size': '13px' });
    content.append(line);
  }
  intro.append(header, content);
  body.append(intro);
}
function offerTheWindow() {
  document.getElementById(BUTTON_ID)?.remove();
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = 'Open Shuffle window';
  setStyles(button, {
    position: 'fixed', right: '16px', bottom: '16px', 'z-index': ON_TOP, padding: '10px 14px',
    border: '0', 'border-radius': '8px', background: '#a9c77d', color: '#151515', font: '600 14px system-ui, sans-serif', cursor: 'pointer',
  });
  button.addEventListener('click', () => {
    const win = window.open('', WINDOW_NAME, windowFeatures(window.screen));
    if (!win) {
      console.warn('Chrome would not open the Shuffle window. Follow your company\'s approved process for pop-ups; do not change a managed browser setting.');
      return;
    }
    button.remove();
    const screen = window.screen;
    placeOnTheRight(win, screen);
    setTimeout(() => placeOnTheRight(win, screen), 250);
    try {
      if (win[INSTANCE_KEY]?.isAlive?.()) {
        win.focus();
        console.info('Shuffle is already open in its own window.');
        return;
      }
      showStartSteps(win);
      win.focus();
      console.info('The Shuffle window is open on the right. Run the Shuffle snippet again inside it.');
    } catch {
      console.warn('The Shuffle window opened but could not be prepared. Run the Shuffle snippet inside it.');
    }
  });
  document.documentElement.appendChild(button);
  console.info('Step 1 of 2: click "Open Shuffle window" at the bottom right of this page.');
}
function start(assets) {
  try {
    if (window.top !== window && window.top[INSTANCE_KEY]?.isAlive()) {
      console.info('Shuffle is already open in the page around this one.');
      return;
    }
  } catch {
  }
  const running = window[INSTANCE_KEY];
  if (running && running.isAlive()) {
    running.reveal();
    return;
  }
  if (!supported()) {
    console.error('Shuffle needs a current version of Chrome (116 or later).');
    return;
  }
  if (window.name !== WINDOW_NAME) {
    offerTheWindow();
    return;
  }
  document.getElementById(INTRO_ID)?.remove();
  placeOnTheRight(window, window.screen);
  const origin = window.origin && window.origin !== 'null' ? window.origin : window.location.origin;
  const mySource = connectMySource({ transfersWindow: window, origin, pageReaders: assets.pageReaders });
  const container = document.createElement('div');
  container.setAttribute('data-transfers-console', assets.version);
  const frame = document.createElement('iframe');
  frame.title = 'Shuffle';
  setStyles(container, {
    position: 'fixed', top: '0', right: '0', bottom: '0', left: '0', margin: '0', padding: '0', border: '0',
    'z-index': ON_TOP, background: '#151515', display: 'block', 'box-sizing': 'border-box',
    'max-width': 'none', 'max-height': 'none', transform: 'none', opacity: '1', visibility: 'visible',
  });
  setStyles(frame, {
    position: 'absolute', top: '0', right: '0', bottom: '0', left: '0', width: '100%', height: '100%',
    border: '0', margin: '0 auto', padding: '0', display: 'block', background: '#151515', 'max-width': 'none',
    'max-height': 'none', visibility: 'visible', opacity: '1', 'pointer-events': 'auto',
  });
  container.append(frame);
  document.documentElement.appendChild(container);
  const screens = prepareFrame(frame, { title: 'Shuffle', css: assets.styles, tree: assets.screens });
  const pageRoot = document.documentElement;
  const savedOverflow = {
    hadStyle: pageRoot.hasAttribute('style'),
    value: pageRoot.style.getPropertyValue('overflow'),
    priority: pageRoot.style.getPropertyPriority('overflow'),
  };
  pageRoot.style.setProperty('overflow', 'hidden', 'important');
  let destroyed = false;
  const modules = assets.createModuleSystem({ document: screens.doc, window: screens.win });
  const worklist = modules('screen/worklist.js')
    .startWorklist({
      version: assets.version,
      mySource,
      describeMySourcePage: options => describeMySourcePage(mySource, assets.version, options),
      onClose: () => {
        setTimeout(() => {
          destroy();
          window.close();
        }, 0);
      },
    });
  const autoPage = modules('auto/page.js').attachAutoPage({mySource,worklist});
  const onBeforeUnload = event => {
    if (!worklist.hasBatch()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    autoPage.destroy();
    worklist.stop();
    window.removeEventListener('beforeunload', onBeforeUnload);
    container.remove();
    if (savedOverflow.value) pageRoot.style.setProperty('overflow', savedOverflow.value, savedOverflow.priority);
    else pageRoot.style.removeProperty('overflow');
    if (!savedOverflow.hadStyle && !pageRoot.getAttribute('style')) pageRoot.removeAttribute('style');
    if (window[INSTANCE_KEY] === instance) delete window[INSTANCE_KEY];
    console.info('Shuffle closed. Its in-memory data was cleared.');
  }
  const instance = {
    isAlive: () => !destroyed && container.isConnected,
    reveal: () => {
      try {
        frame.contentWindow.focus();
      } catch {
      }
      console.info('Shuffle is already open in this window.');
    },
    destroy,
  };
  Object.defineProperty(window, INSTANCE_KEY, { value: instance, configurable: true, writable: true, enumerable: false });
  try {
    frame.contentWindow.focus();
  } catch {
  }
  console.info(`Shuffle ${assets.version} opened. It checks the profile shown in your MySource window. Data stays in this window's memory and is cleared when Shuffle closes.`);
}
__exports.start = start;
},
"mysource/mysource-window.js": function (__require, __exports, document, window) {
'use strict';
const MESSAGES = {
  changed: 'The MySource page changed. Shuffle checks it again once it has loaded.',
  notAProfile: 'This MySource page is not a profile Shuffle can check. Open the person\'s profile there.',
  otherSite: 'Your MySource window is showing another site right now (for example a sign-in page). Go back to the profile there; Shuffle checks it by itself.',
  closed: 'Your MySource window is closed. Click Open MySource to open it again; your worklist is kept.',
  loading: 'The MySource page is still loading.',
};
function problemError(message) {
  const error = new Error(message);
  error.forOperator = true;
  return error;
}
function connectMySource({ transfersWindow, origin, pageReaders }) {
  let reopened = null;
  let lastAddress = '';
  function mySourceWindow() {
    if (reopened && !reopened.closed) return reopened;
    try {
      return transfersWindow.opener;
    } catch {
      return null;
    }
  }
  function look() {
    const win = mySourceWindow();
    if (!win || win.closed) return { problem: MESSAGES.closed };
    try {
      if (win.location.origin !== origin) return { problem: MESSAGES.otherSite };
      return { win, doc: win.document, state: win.document.readyState, address: win.location.href };
    } catch {
      return { problem: MESSAGES.otherSite };
    }
  }
  return {
    origin,
    observedPage() { const seen = look(); return seen.problem ? null : seen; },
    current() {
      const seen = look();
      if (seen.problem) throw problemError(seen.problem);
      if (seen.state === 'loading') throw problemError(MESSAGES.loading);
      return seen.win;
    },
    loadedPage() {
      const seen = look();
      if (seen.problem || seen.state !== 'complete') return null;
      lastAddress = seen.address;
      return seen.doc;
    },
    problem() {
      return look().problem || '';
    },
    reopen() {
      reopened = transfersWindow.open(lastAddress || origin + '/', 'transfers-mysource');
      try {
        reopened?.focus();
      } catch {
      }
      return Boolean(reopened);
    },
    readersFor: win => pageReaders(win.document, win.CSS),
  };
}
function describeMySourcePage(mySource, version, { bare = false } = {}) {
  let win;
  try {
    win = mySource.current();
  } catch (error) {
    if (bare) return null;
    return error.forOperator ? error.message : MESSAGES.notAProfile;
  }
  const doc = win.document;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const lines = [...(bare ? [] : [`Shuffle ${version} — MySource field names (no values)`, '']), 'Fields (label | field code | column name | type)'];
  const labelOf = control => {
    const linked = control.id ? [...doc.querySelectorAll('label')].find(label => label.htmlFor === control.id) : null;
    return clean((linked || control.closest('.dynamic-field-container, div')?.querySelector('label'))?.textContent) || '(no label)';
  };
  const controls = [...doc.querySelectorAll('input, select, textarea')]
    .filter(control => control.type !== 'hidden' && (control.id || control.getAttribute('data-column-name')));
  for (const control of controls.slice(0, 300)) {
    lines.push([
      labelOf(control),
      control.id || '(no code)',
      control.getAttribute('data-column-name') || '(none)',
      control.getAttribute('data-field-type') || control.tagName.toLowerCase(),
    ].join(' | '));
  }
  lines.push('', 'Buttons');
  const buttons = [...doc.querySelectorAll('button, input[type="button"], input[type="submit"]')];
  for (const [wanted, name] of [['save', 'Save'], ['add', 'Add']]) {
    const found = buttons.filter(button => clean(button.textContent || button.value).toLowerCase() === wanted);
    lines.push(found.length
      ? found.map(button => `${name}: found (id ${button.id || '-'}, data-action ${button.getAttribute('data-action') || '-'})`).join('; ')
      : `${name}: not found`);
  }
  lines.push('', 'What Shuffle can find today');
  try {
    const readers = mySource.readersFor(win);
    const identity = readers.readIdentity({ email: '', employeeId: '' });
    lines.push(`Email: ${identity.email.found ? 'found' : 'not found'} · Employee ID: ${identity.employeeId.found ? 'found' : 'not found'}`);
    for (const field of readers.listFields()) {
      lines.push(`${field.label}: ${field.found
        ? `found by ${field.byColumn ? 'column name' : 'label only'} · ${field.readable ? 'value readable' : 'no value readable'}`
        : 'not found'}`);
    }
    const table = readers.readDateSensitiveRow(null);
    lines.push(table.found
      ? `Date Sensitive table: found · ${table.rows.length} rows shown of ${table.entries} · columns: ${table.columns.join(', ') || '(none named)'}`
      : 'Date Sensitive table: not found');
  } catch {
    lines.push('Could not be checked');
  }
  return bare ? lines : lines.join('\n');
}
__exports.MESSAGES = MESSAGES;
__exports.connectMySource = connectMySource;
__exports.describeMySourcePage = describeMySourcePage;
},
"screen/worklist.js": function (__require, __exports, document, window) {
'use strict';
const { InputFileError, MY_SOURCE_HEADERS, SERVICE_NOW_HEADERS, readRowRecords } = __require("../common.js");
const { readDpMapping } = __require("../rules/dp-mapping.js");
const { readRoster, rosterPeople } = __require("../files/roster.js");
const { COLUMNS_NOT_USED, pageHealthWarning, ROSTER_NAME, RULES_DATE } = __require("../rules/mappings.js");
const { usDateOf } = __require("../rules/prepare.js");
const { checkTickets, manualOrder } = __require("../rules/rulebook.js");
const { employeeIdOf } = __require("../rules/gates.js");
const { LATER_HEADINGS, caseChanges, endPoint, laterHeading, opensReview, personName, statusTag } = __require("./case-summary.js");
const { button, caseBox, caseScreen, changeLines, changesList, changesSection, copyToClipboard, doneRow, element } = __require("./case-view.js");
const { confirmClose, confirmDiscard } = __require("./confirm.js");
const { TOOL_NAME } = __require("./wording.js");
const { fileCheck, loadedFilesCheck } = __require("../files/file-check.js");
const { openReview } = __require("../rules/review.js");
const { createReportSession } = __require("../files/report-session.js");
const { ticketMailContext } = __require("../files/run-workbook.js");
function redact(value) {
  return String(value ?? '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\bHRC\d+\b/gi, '[case]')
    .replace(/\b\d{5,}\b/g, '[identifier]')
    .replace(/(?:[A-Z]:)?[^\s"']+\.(csv|xlsx|json)\b/gi, '[file].$1');
}
const TAB_EMPTY = {
  action: 'All Action cases are done.',
  deactivation: 'No deactivations left in this batch.',
  'by-hand': 'No cases to handle by hand in this batch.',
  later: 'Nothing waiting for a later import.',
  'no-action': 'No cases need no action.',
  done: 'No cases done in this session yet.',
};
function startWorklist({ version, mySource, onClose, describeMySourcePage }) {
  const refs = Object.fromEntries([
    'header-back', 'download', 'self-check', 'file-check', 'file-check-output', 'close',
    'intake', 'service-drop', 'service-file', 'service-state', 'profile-drop', 'profile-file', 'profile-state',
    'dp-drop', 'dp-file', 'dp-state', 'roster-drop', 'roster-file', 'roster-state', 'run', 'run-status', 'error-panel', 'error-title', 'error-details',
    'results', 'queue', 'summary-grid',
    'batch-warning', 'search', 'filter-row', 'filter-label', 'worklist-cases', 'empty-filter',
    'case-pane', 'case-preview', 'profile-review', 'detail', 'review-progress',
    'case-steps', 'case-previous', 'case-position', 'case-next',
  ].map(id => [id.replace(/-(.)/g, (match, letter) => letter.toUpperCase()), document.getElementById(id)]));
  const state = {
    building: false,
    files: { service: null, profile: null, dp: null, roster: null },
    cases: [],
    exportCases: [],
    read: null,
    warning: '',
    selected: null,
    trail: [],
    trailAt: -1,
    filter: 'action',
    query: '',
    done: new Set(),
    outcomes: new Map(),
    skipped: new Set(),
    notes: new Map(),
    findings: new Map(),
    scheduleConfirmed: new Set(),
    pageDescriptions: new Map(),
    wrong: new Map(),
    pageHealth: null,
  };
  const exportCases = () => state.cases.length ? state.cases : state.exportCases;
  const hasBatch = () => exportCases().length > 0;
  const FILE_SLOTS = {
    service: { drop: refs.serviceDrop, input: refs.serviceFile, state: refs.serviceState },
    profile: { drop: refs.profileDrop, input: refs.profileFile, state: refs.profileState },
    dp: { drop: refs.dpDrop, input: refs.dpFile, state: refs.dpState },
    roster: { drop: refs.rosterDrop, input: refs.rosterFile, state: refs.rosterState },
  };
  let stopReview = null, pageBack = null;
  const getBatch = () => ({cases:exportCases(),done:state.done,outcomes:state.outcomes,
    skipped:state.skipped,notes:state.notes,findings:state.findings,wrong:state.wrong,
    contexts:new Map(exportCases().map(item => {
      const tickets=(state.read?.service.rows || []).filter(row=>row.Number===item.ticketNumber && (!item.sourceRow || row.__row===item.sourceRow));
      return [item.key,tickets.length===1 ? ticketMailContext(tickets[0]) : {}];
    }))});
  const reports=createReportSession({getBatch,signOffControl:document.getElementById('run-signoff')});
  const REQUIRED = { service: 'ServiceNow export', profile: 'MySource export', dp: 'DP mapping', roster: 'Roster' };
  const missingFiles = files => Object.keys(REQUIRED).filter(kind => !files[kind]).map(kind => REQUIRED[kind]);
  function updateFileSlot(kind) {
    const slot = FILE_SLOTS[kind];
    const file = state.files[kind];
    slot.drop.classList.toggle('loaded', Boolean(file));
    slot.state.textContent = file ? file.name : '';
    slot.state.title = file ? file.name : '';
    if (kind in REQUIRED) {
      slot.drop.querySelector('.file-sign').textContent = file ? '✓' : '○';
      slot.drop.querySelector('.file-control').textContent = file ? 'Change' : 'Choose file';
    }
  }
  function updateStartScreen() {
    const { files } = state;
    const missing = missingFiles(files);
    const built = state.cases.length;
    refs.run.disabled = missing.length > 0 || state.building || !reports.signOff.trim();
    refs.download.disabled = !hasBatch();
    refs.download.hidden = !hasBatch();
    document.getElementById('auto-mode').hidden = !hasBatch();
    const started = Object.keys(REQUIRED).some(kind => files[kind]);
    if (built) refs.runStatus.textContent = `${built} tickets checked. Worklist ready.`;
    else if (started && missing.length) refs.runStatus.textContent = `Add the ${missing.join(', ').replace(/, ([^,]*)$/, ' and $1')} to build: all four files are needed.`;
    else refs.runStatus.textContent = '';
    refs.runStatus.title = refs.runStatus.textContent;
  }
  async function setFile(kind, file) {
    if (state.building || !file) return;
    hideError();
    if (!/\.(csv|xlsx)$/i.test(file.name || '')) {
      showError('Only CSV and XLSX files are accepted.', ['The selected file is not a supported export.']);
      return;
    }
    const newBatch = kind === 'service' && (hasBatch() || state.done.size > 0);
    if (newBatch && !await confirmDiscard({ title: 'Replace this batch?', exportCsv: exportCsv })) {
      FILE_SLOTS[kind].input.value = '';
      return;
    }
    const hadBatch = state.cases.length > 0;
    showList();
    state.files[kind] = file;
    updateFileSlot(kind);
    refs.results.hidden = true;
    if (state.cases.length && !newBatch) state.exportCases = state.cases;
    clearBatch();
    if (newBatch) {
      state.exportCases = [];
      clearWhatWasDone();
    }
    updateStartScreen();
    if (hadBatch && !newBatch) refs.runStatus.textContent = 'A file changed, so the worklist was cleared. Build it again: cases already done stay done.';
  }
  function wireDrop(kind) {
    const { drop, input } = FILE_SLOTS[kind];
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', () => setFile(kind, input.files[0]));
    for (const name of ['dragenter', 'dragover']) {
      drop.addEventListener(name, event => {
        event.preventDefault();
        drop.classList.add('dragging');
      });
    }
    for (const name of ['dragleave', 'drop']) {
      drop.addEventListener(name, event => {
        event.preventDefault();
        drop.classList.remove('dragging');
      });
    }
    drop.addEventListener('drop', event => setFile(kind, event.dataTransfer.files[0]));
  }
  function showError(message, details = []) {
    refs.errorTitle.textContent = redact(message);
    refs.errorDetails.replaceChildren(...details.map(detail => element('li', '', redact(detail))));
    refs.errorDetails.hidden = !details.length;
    refs.errorPanel.hidden = false;
  }
  function hideError() {
    refs.errorPanel.hidden = true;
    refs.errorDetails.replaceChildren();
  }
  function clearBatch() {
    reports.reset();
    state.pageDescriptions.clear();
    state.cases = [];
    state.read = null;
    refs.fileCheckOutput.hidden = true;
    refs.fileCheckOutput.textContent = '';
    state.warning = '';
  }
  function clearWhatWasDone() {
    for (const store of [state.done, state.outcomes, state.skipped, state.notes, state.findings, state.wrong, state.scheduleConfirmed]) store.clear();
  }
  async function startOver() {
    if (state.building) return;
    reports.reset();
    reports.signOff = '';
    showList();
    state.files = { service: null, profile: null, dp: null, roster: null };
    state.filter = 'action';
    state.query = '';
    clearBatch();
    state.exportCases = [];
    clearWhatWasDone();
    for (const [kind, slot] of Object.entries(FILE_SLOTS)) {
      slot.input.value = '';
      updateFileSlot(kind);
    }
    refs.results.hidden = true;
    refs.intake.hidden = false;
    refs.search.value = '';
    refs.headerBack.hidden = true;
    hideError();
    updateStartScreen();
  }
  async function build() {
    if (state.building || missingFiles(state.files).length || !reports.signOff.trim()) return;
    showList();
    state.building = true;
    for (const slot of Object.values(FILE_SLOTS)) {
      slot.drop.disabled = true;
      slot.input.disabled = true;
    }
    refs.run.disabled = true;
    hideError();
    refs.runStatus.textContent = 'Checking the files…';
    try {
      const [service, profile, dp] = await Promise.all([
        readRowRecords(state.files.service, SERVICE_NOW_HEADERS, 'ServiceNow export'),
        readRowRecords(state.files.profile, MY_SOURCE_HEADERS, 'MySource report'),
        readDpMapping(state.files.dp),
      ]);
      refs.runStatus.textContent = 'Reading the roster…';
      const roster = await readRoster(state.files.roster, 'The roster', {
        extra: [ROSTER_NAME],
        people: rosterPeople(profile.rows, service.rows),
        ids: new Set(profile.rows.map(employeeIdOf).filter(Boolean)),
      });
      clearBatch();
      state.read = { service, profile, dp, roster };
      state.cases = checkTickets({ tickets: service.rows, profiles: profile.rows, dpMapping: dp, roster: roster.rows });
      state.exportCases = [];
      state.warning = fileWarnings([
        { kind: 'service', file: state.files.service, unknown: service.unknownHeaders },
        { kind: 'profile', file: state.files.profile, unknown: profile.unknownHeaders },
        { kind: 'dp', file: state.files.dp, unknown: [] },
        { kind: 'roster', file: state.files.roster, unknown: [] },
      ]);
      renderList({ resetFilter: true });
      refs.results.hidden = false;
      refs.intake.hidden = true;
      window.scrollTo(0, 0);
    } catch (error) {
      const known = error instanceof InputFileError;
      showError(known ? error.message : 'The worklist could not be built.', known ? error.details : ['Refresh and try again.']);
      refs.runStatus.textContent = 'The file couldn\'t be read. Fix it and try again.';
    } finally {
      state.building = false;
      for (const slot of Object.values(FILE_SLOTS)) {
        slot.drop.disabled = false;
        slot.input.disabled = false;
      }
      updateStartScreen();
    }
  }
  const DATED = { profile: 'The MySource export', roster: 'The roster' };
  const fileDay = file => (file?.lastModified ? usDateOf(new Date(file.lastModified)) : '');
  const fromToday = file => fileDay(file) === fileDay({ lastModified: Date.now() });
  const notToday = inputs => inputs.filter(input => DATED[input.kind] && input.file?.lastModified && !fromToday(input.file))
    .map(input => `${DATED[input.kind]} is from ${fileDay(input.file)}, not today: check it is the latest.`);
  function fileWarnings(inputs) {
    const when = kind => inputs.find(input => input.kind === kind)?.file?.lastModified || 0;
    const warnings = [...notToday(inputs)];
    if (when('service') && when('profile') && when('profile') + 60_000 < when('service')) {
      warnings.push('The MySource file is older than the ServiceNow file. Check it is the right export.');
    }
    const names = { service: 'The ServiceNow file', profile: 'The MySource file', dp: 'The DP mapping' };
    for (const input of inputs) {
      const unknown = (input.unknown || []).filter(header => !COLUMNS_NOT_USED.includes(header));
      if (unknown.length) warnings.push(`${names[input.kind]} has columns the tool does not recognise: ${unknown.slice(0, 4).join(', ')}.`);
    }
    return warnings.join(' ');
  }
  const isDone = item => state.done.has(item.key);
  const WORK = ['action', 'deactivation', 'by-hand'];
  function inTab(item, tab) {
    if (tab === 'done') return isDone(item) && ['ready', 'manual', 'no-action'].includes(item.status);
    return endPoint(item) === tab && !isDone(item);
  }
  function counts() {
    const tally = tab => state.cases.filter(item => inTab(item, tab)).length;
    return Object.fromEntries(['action', 'deactivation', 'by-hand', 'later', 'no-action', 'done'].map(tab => [tab, tally(tab)]));
  }
  const END_ORDER = ['action', 'deactivation', 'by-hand', 'later', 'no-action'];
  const byTicket = (one, two) => String(one.ticketNumber).localeCompare(String(two.ticketNumber), undefined, { numeric: true });
  const byGroup = (one, two) => END_ORDER.indexOf(endPoint(one)) - END_ORDER.indexOf(endPoint(two))
    || (endPoint(one) === 'by-hand' ? manualOrder(one) - manualOrder(two) : 0)
    || (endPoint(one) === 'later' ? LATER_HEADINGS.indexOf(laterHeading(one)) - LATER_HEADINGS.indexOf(laterHeading(two)) : 0)
      || byTicket(one, two);
  function visibleCases() {
    const query = state.query.trim().toLocaleLowerCase();
    const cases = state.cases.filter(item => {
      if (!query) return inTab(item, state.filter);
      return [item.ticketNumber, item.rosterName, item.profileName, item.subjectPerson, item.email, item.employeeId, item.rosterEmployeeId, item.dp.name, item.dp.email, item.scenario]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    });
    return cases.sort(byGroup);
  }
  function clearTrail() {
    state.trail = [];
    state.trailAt = -1;
  }
  const trailCase = by => state.trail[state.trailAt + by];
  function showCaseSteps(rows) {
    const at = state.selected ? rows.indexOf(state.selected) : -1;
    const back = trailCase(-1);
    const forward = trailCase(1);
    refs.caseSteps.hidden = !state.selected;
    refs.casePosition.textContent = at < 0 ? '' : `${at + 1} of ${rows.length}`;
    refs.casePrevious.disabled = !back && at <= 0;
    refs.caseNext.disabled = !forward && (at < 0 || at === rows.length - 1);
    refs.casePrevious.title = back ? `Back to ${back.ticketNumber} (Alt+↑)` : 'Previous case (Alt+↑)';
    refs.casePrevious.setAttribute('aria-label', back ? refs.casePrevious.title : 'Previous case');
    refs.caseNext.title = forward ? `Forward to ${forward.ticketNumber} (Alt+↓)` : 'Next case (Alt+↓)';
    refs.caseNext.setAttribute('aria-label', forward ? refs.caseNext.title : 'Next case');
  }
  function stepCase(by) {
    const remembered = trailCase(by);
    if (remembered) {
      state.trailAt += by;
      selectCase(remembered, { keepTrail: true });
      return;
    }
    const rows = visibleCases();
    const at = rows.indexOf(state.selected);
    const to = rows[at + by];
    if (at >= 0 && to) selectCase(to);
  }
  function renderList({ resetFilter = false } = {}) {
    const tally = counts();
    if (resetFilter) {
      state.filter = END_ORDER.find(tab => tally[tab]) || 'action';
      state.query = '';
      refs.search.value = '';
    }
    for (const card of refs.summaryGrid.querySelectorAll('.summary-card')) {
      const tab = card.dataset.filter;
      card.querySelector('strong').textContent = tally[tab] ?? 0;
      card.classList.toggle('active', tab === state.filter);
      card.querySelector('input').checked = tab === state.filter;
    }
    const outstanding = state.cases.filter(item => WORK.includes(endPoint(item)));
    const done = outstanding.filter(isDone).length;
    refs.reviewProgress.textContent = outstanding.length ? `${done} of ${outstanding.length} done. ${outstanding.length - done} left.` : '';
    const warning = [state.pageHealth?.length ? pageHealthWarning(state.pageHealth) : '', state.warning].filter(Boolean).join(' ');
    refs.batchWarning.textContent = warning;
    refs.batchWarning.hidden = !warning;
    const rows = visibleCases();
    const headed = state.filter === 'later' && !state.query;
    refs.worklistCases.replaceChildren(...rows.flatMap((item, index) => {
      const heading = headed && (index === 0 || laterHeading(rows[index - 1]) !== laterHeading(item)) ? [element('p', 'list-heading', laterHeading(item))] : [];
      return [...heading, rowFor(item, index)];
    }));
    showCaseSteps(rows);
    refs.emptyFilter.hidden = rows.length > 0;
    refs.emptyFilter.textContent = state.query ? 'No cases match this search.' : TAB_EMPTY[state.filter] || 'No tickets match this view.';
    refs.filterRow.hidden = !state.query;
    refs.filterLabel.textContent = rows.length === 1 ? '1 case matches this search' : `${rows.length} cases match this search`;
    refs.headerBack.hidden = !state.selected && !pageBack;
  }
  function rowFor(item, index) {
    const row = element('label', 'queue-row');
    const choose = element('input', 'selection-input');
    choose.type = 'radio';
    choose.name = 'selected-case';
    choose.checked = state.selected === item;
    choose.setAttribute('aria-label', [item.ticketNumber, personName(item) || item.email].filter(Boolean).join(' · '));
    choose.addEventListener('change', () => {
      if (choose.checked) selectCase(item);
    });
    choose.addEventListener('click', () => {
      if (state.selected === item) selectCase(item);
    });
    const top = element('span', 'row-top');
    const number = element('span', 'ticket-number');
    number.append(element('span', 'row-number', `${index + 1}.`), item.ticketNumber || 'No number');
    top.append(number);
    const badges = element('div');
    if (isDone(item) && state.outcomes.get(item.key) === 'edited, not saved') {
      badges.append(element('span', 'status-note', 'Edited, not saved'));
    }
    if (state.query || state.filter === 'no-action') {
      const tag = statusTag(item, isDone(item));
      badges.append(element('span', `badge ${tag.key}`, tag.label));
    }
    if (state.skipped.has(item.key) && !isDone(item)) badges.append(element('span', 'status-note', 'Not done yet'));
    if (badges.children.length) top.append(badges);
    const person = element('span', 'person', personName(item) || item.email || 'Unnamed person');
    row.append(choose, top, person);
    return row;
  }
  function setNote(item, text) {
    const value = String(text ?? '').trim().slice(0, 280);
    if (value) state.notes.set(item.key, value);
    else state.notes.delete(item.key);
  }
  function setWrong(item, reason) {
    if (reason) state.wrong.set(item.key, reason);
    else state.wrong.delete(item.key);
  }
  const kept = item => ({
    scheduleConfirmed: state.scheduleConfirmed.has(item.key),
    onScheduleConfirmed: value => value ? state.scheduleConfirmed.add(item.key) : state.scheduleConfirmed.delete(item.key),
    note: state.notes.get(item.key),
    onNote: value => setNote(item, value),
    wrong: state.wrong.get(item.key) || '',
    onWrong: value => setWrong(item, value),
  });
  function closeCase() {
    stopReview?.();
    stopReview = null;
    state.selected = null;
    refs.casePane.hidden = true;
    refs.profileReview.hidden = true;
    refs.casePreview.hidden = false;
    refs.casePreview.replaceChildren();
    refs.detail.replaceChildren();
  }
  let listPlace = 0;
  function showList({ keepPlace = false } = {}) {
    pageBack = null;
    clearTrail();
    closeCase();
    refs.queue.hidden = false;
    if (state.cases.length) renderList();
    window.scrollTo(0, keepPlace ? listPlace : 0);
  }
  function selectCase(item, { keepTrail = false } = {}) {
    if (!keepTrail) clearTrail();
    if (!refs.queue.hidden) listPlace = window.scrollY;
    const alreadyDone = isDone(item);
    closeCase();
    state.selected = item;
    refs.queue.hidden = true;
    refs.casePane.hidden = false;
    if (!alreadyDone && opensReview(item)) showReview(item);
    else showCard(item);
    renderList();
    window.scrollTo(0, 0);
  }
  function showCard(item) {
    refs.profileReview.hidden = true;
    refs.casePreview.hidden = false;
    const done = isDone(item);
    const card = element('article', 'case-card');
    const list = changesList(changeLines(caseChanges(item)));
    card.append(...caseScreen(item, {
      done,
      outcome: state.outcomes.get(item.key) === 'edited, not saved' ? 'edited, not saved' : '',
      changes: changesSection(item, list),
      box: cardButtons(item, done),
      ...kept(item),
    }));
    refs.casePreview.replaceChildren(card);
  }
  function cardButtons(item, done) {
    if (done) {
      const reopen = button('Reopen case', 'quiet');
      reopen.addEventListener('click', () => {
        state.done.delete(item.key);
        state.outcomes.delete(item.key);
        selectCase(item);
      });
      return caseBox(reopen);
    }
    if (endPoint(item) === 'later') {
      const onward = button('Next', 'primary');
      onward.title = 'Ctrl+Enter';
      onward.addEventListener('click', () => continueQueue(listOrderFrom(item), item.key));
      return caseBox(doneRow(onward));
    }
    if (item.status !== 'manual') return null;
    const next = button('Done & next', 'primary');
    next.title = 'Ctrl+Enter';
    next.addEventListener('click', () => markDone(item, ''));
    return caseBox(doneRow(next, notDoneButton(item)));
  }
  function notDoneButton(item) {
    const skip = button('Not done & next', 'quiet');
    skip.title = 'Leave this case open and go to the next one';
    skip.addEventListener('click', () => skipCase(item));
    return skip;
  }
  function completeCase(item, outcome = '') {
    if (!state.cases.includes(item) || isDone(item)) return false;
    state.done.add(item.key);
    state.skipped.delete(item.key);
    if (outcome) state.outcomes.set(item.key, outcome);
    else state.outcomes.delete(item.key);
    renderList();
    return true;
  }
  function markDone(item, outcome) {
    const order = listOrderFrom(item);
    completeCase(item, outcome);
    continueQueue(order);
  }
  function skipCase(item) {
    const order = listOrderFrom(item);
    state.skipped.add(item.key);
    continueQueue(order);
  }
  function showReview(item) {
    refs.casePreview.hidden = true;
    refs.profileReview.hidden = false;
    stopReview = openReview({
      item,
      into: refs.detail,
      mySource,
      ...kept(item),
      onFinding: text => state.findings.set(item.key, text),
      pageHealth: {
        checked: () => state.pageHealth !== null,
        report: missing => { state.pageHealth = missing; },
      },
      onDone: outcome => markDone(item, outcome),
      onSkip: () => skipCase(item),
      onReplan: description => replanCase(item, description),
      pageDescription: state.pageDescriptions.get(item.ticketNumber) || '',
    });
  }
  function replanCase(item, description) {
    const { service, profile, dp, roster } = state.read || {};
    if (!service || state.selected !== item) return false;
    if (state.pageDescriptions.get(item.ticketNumber) === description) return false;
    state.pageDescriptions.set(item.ticketNumber, description);
    const again = checkTickets({ tickets: service.rows, profiles: profile.rows, dpMapping: dp, roster: roster.rows, pageDescriptions: state.pageDescriptions })
      .find(one => one.key === item.key);
    if (!again) return false;
    state.cases = state.cases.map(one => (one === item ? again : one));
    state.trail = state.trail.map(one => (one === item ? again : one));
    selectCase(again, { keepTrail: true });
    return true;
  }
  function listOrderFrom(item) {
    const cases = visibleCases();
    const at = cases.findIndex(one => one.key === item.key);
    return at < 0 ? [] : [...cases.slice(at + 1), ...cases.slice(0, at)].map(one => one.key);
  }
  function continueQueue(order = [], passed = null) {
    const left = state.selected;
    closeCase();
    renderList();
    const rank = new Map(order.map((key, index) => [key, index]));
    const outstanding = () => {
      const cases = visibleCases().sort((one, two) => (rank.get(one.key) ?? order.length) - (rank.get(two.key) ?? order.length));
      return cases.find(item => !isDone(item) && !state.skipped.has(item.key) && item.key !== passed
        && (WORK.includes(endPoint(item)) || (state.filter === endPoint(item) && ['later', 'no-action'].includes(state.filter) && item.status !== 'later')));
    };
    let next = outstanding();
    if (!next && !state.query) {
      const tally = counts();
      const other = WORK.find(tab => tally[tab]) || null;
      if (other && other !== state.filter) {
        state.filter = other;
        renderList();
        next = outstanding();
      }
    }
    if (next) {
      state.trail = state.trail.slice(0, state.trailAt + 1);
      if (!state.trail.length && left) state.trail.push(left);
      state.trail.push(next);
      state.trailAt = state.trail.length - 1;
      selectCase(next, { keepTrail: true });
    }
    else showList();
  }
  function exportCsv() { reports.download(); }
  Object.keys(FILE_SLOTS).forEach(wireDrop);
  refs.run.addEventListener('click', build);
  refs.download.addEventListener('click', exportCsv);
  refs.headerBack.addEventListener('click', () => pageBack ? pageBack() : showList({ keepPlace: true }));
  document.getElementById('run-signoff').addEventListener('input', updateStartScreen);
  refs.casePrevious.addEventListener('click', () => stepCase(-1));
  refs.caseNext.addEventListener('click', () => stepCase(1));
  refs.close.addEventListener('click', async () => {
    if (!hasBatch()) { onClose(); return; }
    const action = await confirmClose({ download: exportCsv });
    if (action === 'start-over') await startOver();
    else if (action === 'close') onClose();
  });
  refs.search.addEventListener('input', () => {
    clearTrail();
    state.query = refs.search.value;
    renderList();
  });
  refs.summaryGrid.addEventListener('change', event => {
    const card = event.target.closest('.summary-card');
    if (!card) return;
    clearTrail();
    state.filter = card.dataset.filter;
    closeCase();
    refs.queue.hidden = false;
    renderList();
  });
  refs.fileCheck.addEventListener('click', async () => {
    const text = state.read
      ? fileCheck({ version, ...state.read, cases: state.cases, session: state, page: describeMySourcePage({ bare: true }) })
      : `${state.files.profile || state.files.dp || state.files.roster ? await loadedFiles() : ''}${describeMySourcePage()}\n\n(Build the worklist and copy again to add the file check.)`;
    refs.fileCheckOutput.textContent = text;
    refs.fileCheckOutput.hidden = false;
    try {
      await copyToClipboard(text);
      refs.fileCheck.textContent = 'Copied';
    } catch {
      refs.fileCheck.textContent = 'Select the text below to copy it';
    }
    setTimeout(() => { refs.fileCheck.textContent = 'Copy check'; }, 2500);
  });
  async function loadedFiles() {
    const { service, profile, dp, roster } = state.files;
    if (!profile && !dp && !roster) return '';
    const read = async (file, reader) => {
      if (!file) return { value: null };
      try {
        return { value: await reader(file) };
      } catch (error) {
        return { value: null, problem: error instanceof InputFileError ? error.message : 'A file could not be read.' };
      }
    };
    const [mySource, mapping, tickets] = await Promise.all([
      read(profile, file => readRowRecords(file, MY_SOURCE_HEADERS, 'MySource report')),
      read(dp, file => readDpMapping(file)),
      read(service, file => readRowRecords(file, SERVICE_NOW_HEADERS, 'ServiceNow export')),
    ]);
    const people = mySource.value || tickets.value ? rosterPeople(mySource.value?.rows, tickets.value?.rows) : null;
    const list = await read(roster, file => readRoster(file, 'The roster', { people }));
    const problems = [mySource, mapping, list].filter(one => one.problem).map(one => `(${one.problem})`);
    return `${loadedFilesCheck({ version, service: tickets.value, profile: mySource.value, dp: mapping.value, roster: list.value })}${problems.length ? `\n${problems.join('\n')}` : ''}\n\n`;
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (document.querySelector('dialog[open]')) return;
      const open = event.target.closest('details[open]');
      if (open) {
        open.open = false;
        open.querySelector('summary')?.focus();
        event.preventDefault();
      }
      return;
    }
    const editing = event.target.matches('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !editing && !refs.results.hidden) {
      event.preventDefault();
      showList();
      refs.search.focus();
    }
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key) && state.selected) {
      event.preventDefault();
      stepCase(event.key === 'ArrowUp' ? -1 : 1);
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      const next = [...refs.casePane.querySelectorAll('.case-box button')]
        .find(control => ['Done & next', 'Next'].includes(control.textContent) && !control.hidden && !control.disabled);
      if (next) {
        event.preventDefault();
        next.click();
      }
    }
  });
  refs.selfCheck.textContent = version;
  refs.selfCheck.title = `Version ${version} · rules of ${RULES_DATE}`;
  updateStartScreen();
  return {
    hasBatch, getBatch, reports,
    showList,
    showPage(onBack) { showList(); pageBack = onBack; refs.headerBack.hidden = false; refs.caseSteps.hidden = true; },
    complete: completeCase,
    stop: () => {
      reports.destroy();
      stopReview?.();
      stopReview = null;
    },
  };
}
__exports.startWorklist = startWorklist;
},
"rules/review.js": function (__require, __exports, document, window) {
'use strict';
const { button, caseBox, caseScreen, changeLine, changesSection, dateSensitiveLine, doneRow, element, showChanges, statusLine, textLines } = __require("../screen/case-view.js");
const { TOOL_NAME } = __require("../screen/wording.js");
const { caseChanges, personName } = __require("../screen/case-summary.js");
const { confirmDoneAnyway, confirmReturn } = __require("../screen/confirm.js");
const { OTHER_COMMENT, pageHealthWarning } = __require("./mappings.js");
const { MESSAGES } = __require("../mysource/mysource-window.js");
const { watchProfilePage } = __require("../mysource/profile-page.js");
const { DEACTIVATED_ALREADY, emailMatchNote } = __require("./gates.js");
const { BLOCKED_HEADCOUNT, X_TERM_DEPARTMENT } = __require("./mappings.js");
const { isClosingBusinessArea, EMPLOYEE_ID_WITH_ONE_BY_HAND } = __require("./facts.js");
const LOOK_EVERY = 300;
const SETTLE_TIME = 500;
const SECOND_LOOK = 2000;
const READ_AGAIN = 1000;
function openReview({ item, into, mySource, note, onNote, onDone, onSkip, onFinding, wrong = '', onWrong = null, pageHealth = null, onReplan = null, pageDescription = '', scheduleConfirmed = false, onScheduleConfirmed = null }) {
  const manual = item.status === 'manual' && !item.deadEnd;
  const noAction = item.status === 'no-action';
  const completedDeactivation = isCompletedDeactivation(item);
  const { informationOnly, changes: plannedChanges, dateSensitive: plannedRow, dateNote } = caseChanges(item);
  const rules = liveChecks(item, pageDescription);
  const comparable = !(manual && !rules);
  const canCheck = Boolean(item.email);
  const name = personName(item) || 'this person';
  let person = null;
  let fields = null;
  let busy = false;
  let stopped = false;
  let operation = 0;
  let pageLoad = 0;
  let found = null;
  let noticed = null;
  let pageWorkFound = false;
  const changesList = element('div', 'case-lines');
  const changes = changesSection(item, changesList);
  const status = statusLine();
  const health = element('p', 'health-line');
  health.hidden = true;
  const openMySource = button('Open MySource', 'secondary');
  openMySource.hidden = true;
  const done = button('Done & next', 'primary');
  done.title = 'Ctrl+Enter';
  const skip = button('Not done & next', 'quiet');
  skip.title = 'Leave this case open and go to the next one';
  into.replaceChildren(...caseScreen(item, {
    done: false,
    changes,
    box: caseBox(status.element, health, openMySource, doneRow(done, skip)),
    note,
    onNote,
    wrong,
    onWrong,
    scheduleConfirmed,
    onScheduleConfirmed: value => {
      scheduleConfirmed = value;
      onScheduleConfirmed?.(value);
      paintChanges();
      recordFinding();
    },
  }));
  paintChanges();
  function paintChanges() {
    const latest = noticed || found;
    if (person?.verified && latest) pageWorkFound = [found, noticed].some(pageHasWork);
    const rowLeft = plannedRow ? !found?.row || !latest?.row : Boolean(found?.neededRow || latest?.neededRow);
    const rowNoticed = Boolean(noticed?.rowChecked && (plannedRow ? noticed.row : !noticed.neededRow));
    const extraNoticed = change => Boolean(noticed && !noticed.unknown.includes(change.field)
      && !noticed.extra.some(other => other.field === change.field));
    const rowShown = plannedRow && !plannedRow.requiredExistingShift && latest?.shiftNow
      ? { ...plannedRow, requiredExistingShift: latest.shiftNow } : plannedRow || latest?.neededRow || found?.neededRow;
    const positions = latest?.positions || [];
    const place = index => (positions[index] ?? Number.MAX_SAFE_INTEGER);
    const inPageOrder = plannedChanges.map((change, index) => index).sort((one, two) => place(one) - place(two) || one - two);
    const lines = [
      rowLeft && markNoticed(rowLine(rowShown, !rowNoticed && latest?.rowDiffers), rowNoticed),
      ...inPageOrder.map(index => (found?.planned[index] && latest?.planned[index] ? null : markNoticed(changeLine(plannedChanges[index]), Boolean(noticed?.planned[index])))),
      ...[...(found?.extra || []), ...(latest?.extra || []).filter(change => !found?.extra.some(other => other.field === change.field))]
        .map(change => markNoticed(changeLine(change), extraNoticed(change))),
    ].filter(Boolean);
    const unknown = latest?.unknown || [];
    if (unknown.length) lines.push(...textLines(['Could not check: ' + unknown.join(', ') + '.'], 'attention').children);
    if (latest?.otherComment) lines.push(...textLines([OTHER_COMMENT], 'attention').children);
    const emailWrong = found?.managerEmailWrong;
    if (emailWrong) {
      lines.push(...textLines([`⚠ Resource Manager Email on the page is not the DP mapping's (${rules.resourceManagerEmail}) → check the right person was picked`], 'attention').children);
    }
    if (found?.blockedHeadcount === false && item.specialCase !== 'deactivation' && !completedDeactivation && !rules?.descriptionMonitoringOnly) {
      lines.unshift(...textLines(['✗ Cost Center Description on the page is not BLOCKED HEADCOUNT → not supported: deactivate instead of these changes'], 'attention').children);
    }
    const planned = Boolean(plannedRow || plannedChanges.length);
    if (!lines.length && (planned || deactivationIsDone())) lines.push(...textLines([deactivationIsDone() ? 'Nothing to do is left.' : 'All changes are on the page.'], 'good').children);
    if (!lines.length && noAction && !completedDeactivation && found && !item.pendingCostCenterDescription) lines.push(...textLines(['Nothing to change on the page.'], 'good').children);
    if (found?.blockedHeadcount === true) {
      lines.push(...textLines(['✓ Cost Center Description on the page says BLOCKED HEADCOUNT → an ordinary transfer'], 'good').children);
    }
    changesList.replaceChildren(...lines);
    showChanges(changes, changesList);
    into.querySelector('.comment-to-add')?.classList.toggle('comment-waiting', !latest?.commentOnPage);
    const checklist = into.querySelector('.deactivation-checklist');
    if (checklist) {
      checklist.hidden = deactivationIsDone();
      checklist.querySelector('input').disabled = !person?.verified;
    }
    const comment = into.querySelector('.comment-block');
    comment?.querySelector('.edit-cue')?.remove();
    if (comment && latest?.commentOnPage && page.edited) comment.append(element('span', 'edit-cue', editCue()));
  }
  function rowLine(row, differs) {
    if (row.departmentOnly) {
      const line = changeLine({ field: 'Date Sensitive row', display: 'Department: X-Term Professional/Client (check the newest row)' });
      if (differs) line.append(element('p', 'sub-line attention', `On the page: ${differs}`));
      return line;
    }
    const line = dateSensitiveLine(row, row === plannedRow ? dateNote : '');
    if (differs) line.append(element('p', 'sub-line attention', `On the page: ${differs}`));
    return line;
  }
  function markNoticed(line, onPage) {
    if (onPage) {
      line.classList.add('noticed');
      line.title = 'On the page. It comes off the list once saved.';
      if (page.edited) line.append(element('span', 'edit-cue', editCue()));
    }
    return line;
  }
  function editCue() { return `Edited, not saved: ${page.editedFields.join(', ')}`; }
  function linesLeft() {
    if (informationOnly || !comparable) return [];
    const latest = noticed || found;
    return [
      ...plannedChanges.filter((change, index) => !latest?.planned[index]).map(change => change.field),
      ...(latest?.extra || []).map(change => change.field),
      ...((plannedRow ? !latest?.row : latest?.neededRow) ? ['Date Sensitive row'] : []),
    ];
  }
  function deactivationIsDone() {
    return item.specialCase === 'deactivation' && scheduleConfirmed && person?.verified
      && found?.commentOnPage && !page.edited && !linesLeft().length && !found.unknown.length;
  }
  function paint() {
    if (!canCheck && !status.text) status.set(`${TOOL_NAME} can't check the profile for this case → see the lines at the top.`, 'warn');
    done.disabled = busy;
    done.textContent = busy ? 'Checking…' : 'Done & next';
  }
  const toneFor = message => ([MESSAGES.closed, MESSAGES.otherSite].includes(message) ? 'warn' : 'neutral');
  function pageChanged(message) {
    operation++;
    pageLoad++;
    busy = false;
    person = null;
    fields = null;
    status.set(message, toneFor(message));
    paint();
  }
  const page = watchProfilePage({ mySource, identity: { email: item.email, profileEmail: item.profileEmail || '', employeeId: item.employeeId || (item.specialCase === 'reactivation' ? item.rosterEmployeeId || '' : ''), rosterEmployeeId: item.rosterEmployeeId || '', deactivating: item.specialCase === 'deactivation', returning: item.specialCase === 'reactivation' }, onChanged: pageChanged, onEdited: () => pageEdited() });
  function rememberEmailMatch(person) {
    if (!person.verified || !person.email.address || person.email.form === 'exact') return;
    const text = emailMatchNote(person.email.form, person.email.address);
    if (item.notes.some(note => note.text === text)) return;
    item.notes.unshift({ text });
    into.querySelector('.case-identity').after(element('p', 'case-line attention', text));
  }
  async function oneAtATime(task, onError) {
    const current = ++operation;
    const isCurrent = () => current === operation;
    busy = true;
    paint();
    try {
      await task(isCurrent);
    } catch (error) {
      if (isCurrent()) onError(error);
    } finally {
      if (isCurrent()) {
        busy = false;
        paint();
      }
    }
  }
  function checkPage() {
    if (busy || stopped) return;
    pageLoad++;
    person = null;
    fields = null;
    status.set('Checking the MySource profile…', 'neutral');
    return oneAtATime(checkPerson, error => status.set(error.message, toneFor(error.message)));
  }
  async function checkPerson(isCurrent) {
    const result = await page.check({ personOnly: manual });
    if (!isCurrent()) return;
    person = result.person;
    rememberEmailMatch(person);
    fields = result.fields;
    openMySource.hidden = true;
    if (!person.verified) {
      status.set(`This isn't the right profile (${mismatchedPart(person)}) → open the correct one in MySource.`, 'bad');
      found = null;
      paintChanges();
      return;
    }
    const rightProfile = person.deactivatedById ? 'Right profile, deactivated (found by Employee ID).' : 'Right profile.';
    if (!manual && !fieldsFound(fields)) {
      const missing = (fields?.controls || []).filter(control => !control.found || (control.required && !control.expected));
      status.set(missing.length
        ? rightProfile + ' Not found: ' + missing.map(control => control.label.replace(' (system-derived)', '').replace('Page Save (operator only)', 'Save button')).join(', ') + '.'
        : person.deactivatedById ? rightProfile + ' The page could not be fully checked.' : 'Right profile, but the page could not be fully checked.', 'warn');
    } else {
      status.set(person.deactivated ? 'Right profile, now deactivated.'
        : person.returning ? `Deactivated profile · Done & next confirms it is ${name}'s.` : rightProfile, 'good');
    }
    const compared = await comparePage(isCurrent);
    if (compared && isCurrent()) {
      noticed = null;
      if (addsLines(compared.found)) settle(compared, pageLoad, 1);
      else showFound(compared);
    }
    await checkHealth(isCurrent);
  }
  async function checkHealth(isCurrent) {
    if (!pageHealth || pageHealth.checked()) return;
    try {
      const missing = await page.health();
      if (!isCurrent() || !Array.isArray(missing)) return;
      pageHealth.report(missing);
      health.textContent = missing.length ? pageHealthWarning(missing) : '';
      health.hidden = !missing.length;
    } catch {
    }
  }
  function settle(previous, load, attempt) {
    setTimeout(async () => {
      if (stopped || load !== pageLoad) return;
      if (busy) {
        settle(previous, load, attempt);
        return;
      }
      const isCurrent = () => load === pageLoad && !stopped && !busy;
      try {
        const again = await comparePage(isCurrent);
        if (!again || !isCurrent()) return;
        if (attempt >= 2 || sameFinding(again.found, previous.found)) {
          showFound(again);
          paint();
        } else {
          settle(again, load, attempt + 1);
        }
      } catch {
      }
    }, READ_AGAIN);
  }
  let noticeTimer = 0;
  function pageEdited() {
    if (stopped || noticeTimer) return;
    const token = operation;
    noticeTimer = setTimeout(async () => {
      noticeTimer = 0;
      const isCurrent = () => token === operation && !stopped && !busy;
      if (!isCurrent()) return;
      try {
        if (!person?.verified) { await checkPage(); return; }
        if (!comparable) return;
        const compared = await comparePage(isCurrent);
        if (compared && isCurrent()) {
          if (replanFrom(compared.found)) return;
          noticed = compared.found;
          paintChanges();
          paint();
        }
      } catch {
      }
    }, 700);
  }
  function showFound(compared) {
    found = compared.found;
    if (replanFrom(found)) return;
    paintChanges();
    recordFinding();
  }
  function recordFinding() {
    if (!found) return;
    onFinding([
      ...(item.specialCase === 'deactivation' ? [`Schedule change ${scheduleConfirmed ? 'confirmed by operator' : 'not confirmed'}`] : []),
      ...found.extra.map(change => `${change.field}: ${change.display || change.target}`),
      ...(found.neededRow ? ['Date Sensitive row needed'] : []),
      ...(found.blockedHeadcount === false ? ['Cost Center Description is not BLOCKED HEADCOUNT: deactivate instead'] : []),
      ...(found.blockedHeadcount === true ? ['Cost Center Description is BLOCKED HEADCOUNT'] : []),
      ...(found.managerEmailWrong ? ['Resource Manager Email is not the one in the DP mapping'] : []),
      ...(found.otherComment ? ['Comments 2, 3 or 4: another comment there, to check'] : []),
      ...(found.unknown.length ? ['Could not check: ' + found.unknown.join(', ')] : []),
    ].join(' | '));
  }
  function replanFrom(reading) {
    return Boolean(reading.description && person?.verified && onReplan?.(reading.description));
  }
  async function comparePage(isCurrent) {
    if (!comparable) return null;
    const planned = plannedChanges.map(({ field, target, check, anyOf, absentOf }) => ({ field, target, check, ...(anyOf ? { anyOf } : {}), ...(absentOf ? { absentOf } : {}) }));
    const extra = (rules?.fields || []).filter(rule => !plannedChanges.some(change => change.field === rule.field)
      && !(rules?.costCenterDescription && rule.field === 'Cost Center Description'));
    const rowRule = plannedRow || (rules?.dateSensitive ? { ...rules.dateSensitive, newestRow: true } : null);
    const descriptionRule = rules?.costCenterDescription || null;
    const emailRule = rules?.resourceManagerEmail || null;
    const asks = [...planned, ...extra, ...(rowRule ? [{ field: 'Date Sensitive row', target: '', dateSensitive: rowRule }] : []),
      ...(descriptionRule ? [{ field: 'Cost Center Description', target: descriptionRule, contains: true, giveText: true }] : []),
      ...(emailRule ? [{ field: 'Resource Manager Email', target: emailRule, whenFilled: true }] : [])];
    if (!asks.length) return null;
    const result = await page.readValues(asks);
    if (!isCurrent() || !Array.isArray(result?.values)) return null;
    const values = asks.map((ask, index) => {
      const value = result.values[index];
      return value && (value.label === ask.field || (ask.dateSensitive && value.label?.startsWith('Date Sensitive row')))
        ? value : { label: ask.field, available: false, matches: false };
    });
    const extraValues = values.slice(planned.length, planned.length + extra.length);
    const rowValue = rowRule ? values[planned.length + extra.length] : null;
    const descriptionValue = descriptionRule ? values[asks.findIndex(ask => ask.giveText)] : null;
    const emailValue = emailRule ? values[values.length - 1] : null;
    const onPage = value => Boolean(value?.available && value.matches);
    const managerOnPage = onPage(values.find(value => value.label === 'Resource Manager'));
    return {
      values,
      planned,
      rowValue,
      found: {
        unknown: values.filter((value, index) => !value.available && value !== emailValue && !asks[index].quiet).map(value => value.label),
        planned: values.slice(0, planned.length).map(onPage),
        otherComment: values.slice(0, planned.length).some(value => value?.otherText),
        positions: values.slice(0, planned.length).map(value => (Number.isFinite(value?.position) ? value.position : null)),
        extra: extra.filter((rule, index) => extraValues[index]?.available && !extraValues[index].matches),
        commentOnPage: extra.some((rule, index) => rule.field === 'Comment' && rule.contains && onPage(extraValues[index])),
        row: plannedRow ? onPage(rowValue) : false,
        neededRow: !plannedRow && rowValue?.available && !rowValue.matches ? rules.dateSensitive : null,
        blockedHeadcount: descriptionValue?.available && !rules.descriptionMonitoringOnly
          && !(item.pendingCostCenterDescription && !descriptionValue.text?.trim()) ? descriptionValue.matches : null,
        description: descriptionValue?.available ? descriptionValue.text || '' : '',
        managerEmailWrong: Boolean(managerOnPage && emailValue?.available && !emailValue.matches),
        rowChecked: Boolean(rowValue?.available),
        rowDiffers: rowValue?.available && !rowValue.matches ? rowValue.differs || '' : '',
        shiftNow: rowValue?.shiftNow || '',
      },
    };
  }
  async function refreshDone() {
    if (canCheck && !page.confirmed) await checkPage();
    let changedUnderneath = false;
    await oneAtATime(async isCurrent => {
      if (!canCheck || !page.confirmed) return;
      try {
        person = await page.confirmSamePerson();
        rememberEmailMatch(person);
        if (!manual) fields = await page.checkFields();
      } catch {
        person = null;
        changedUnderneath = true;
        return;
      }
      const compared = await comparePage(isCurrent);
      if (compared && isCurrent()) {
        if (replanFrom(compared.found)) return;
        noticed = compared.found;
        paintChanges();
      }
    }, () => { person = null; });
    if (changedUnderneath && !stopped) await checkPage();
    return doneWarnings();
  }
  let confirming = false;
  done.addEventListener('click', async () => {
    if (busy || confirming || stopped) return;
    confirming = true;
    try {
      let warnings = await refreshDone();
      while (!stopped) {
        const returning = item.specialCase === 'reactivation';
        if (!returning && (!warnings.reasons.length || noActionWithoutChanges())) {
          onDone(warnings.outcome);
          return;
        }
        const confirm = returning ? confirmReturn : confirmDoneAnyway;
        if (!(await confirm({ name: personName(item), ticket: item.ticketNumber, reasons: warnings.reasons })) || stopped) return;
        const current = await refreshDone();
        if (stopped) return;
        if (JSON.stringify(current) === JSON.stringify(warnings)) { onDone(current.outcome); return; }
        warnings = current;
      }
    } finally {
      confirming = false;
    }
  });
  function noActionWithoutChanges() {
    return noAction && Boolean(person?.verified) && !plannedChanges.length && !plannedRow
      && !item.notes.some(note => note.text?.startsWith('↩'))
      && !pageWorkFound && !page.edited && !rules?.costCenterDescription
      && !item.pendingCostCenterDescription && !completedDeactivation;
  }
  function pageHasWork(reading) {
    return Boolean(reading && (reading.extra.length || reading.neededRow
      || reading.otherComment || reading.managerEmailWrong || reading.blockedHeadcount === false));
  }
  function doneWarnings() {
    if (!canCheck) return { reasons: [`${TOOL_NAME} could not check the profile for this case.`], outcome: 'profile not seen' };
    if (person && !person.verified) return { reasons: [`MySource is not showing ${name}'s profile.`], outcome: 'profile not seen' };
    if (!person?.verified) return { reasons: [`${TOOL_NAME} has not checked ${name}'s profile yet.`], outcome: 'profile not seen' };
    const reasons = [];
    let outcome = '';
    if (item.specialCase === 'deactivation' && !scheduleConfirmed) {
      reasons.push('Schedule change not confirmed: remove Revenue and Non-Revenue hours, add the DNS, then tick the schedule step.');
      outcome = 'schedule not confirmed';
    }
    if (item.specialCase === 'deactivation' && !(noticed || found)?.commentOnPage) {
      reasons.push('Comment not yet read back in Comments 4: add the merged comment, save and reload the profile.');
      outcome = outcome || 'comment not checked';
    }
    if (page.edited) {
      reasons.push(`${editCue()}. Save and reload the profile, then check the saved values.`);
      outcome = 'edited, not saved';
    }
    const left = linesLeft();
    if (left.length) {
      reasons.push(`Not on the page yet: ${left.join(', ')}.`);
      outcome = outcome || 'changes left';
    }
    const unknown = informationOnly || !comparable ? [] : (noticed || found)?.unknown || [];
    if (unknown.length) {
      reasons.push(`${TOOL_NAME} could not check: ${unknown.join(', ')}. Check ${unknown.length > 1 ? 'them' : 'it'} in MySource yourself.`);
      outcome = outcome || 'not all checked';
    }
    if (!informationOnly && comparable && (noticed || found)?.otherComment) {
      reasons.push(OTHER_COMMENT.replace(/^⚠ /, ''));
      outcome = outcome || 'comment to check';
    }
    if ((noticed || found)?.managerEmailWrong) {
      reasons.push('Resource Manager Email on the page is not the DP mapping\'s → check the right person was picked.');
      outcome = outcome || 'manager email to check';
    }
    if (rules?.costCenterDescription && !(noticed || found)?.description?.trim()) {
      reasons.push('Cost Center Description not known yet → open the right profile; the page check reads it.');
      outcome = outcome || 'description not checked';
    }
    return { reasons, outcome };
  }
  skip.addEventListener('click', () => {
    if (!stopped) onSkip();
  });
  openMySource.addEventListener('click', () => {
    if (mySource.reopen()) openMySource.hidden = true;
  });
  const looking = lookForNewPages({
    mySource,
    idle: () => !(busy || stopped || !canCheck || page.confirmed),
    checkPage,
    showProblem: problem => {
      openMySource.hidden = problem !== MESSAGES.closed;
      if (status.text !== problem) status.set(problem, toneFor(problem));
      paint();
    },
  });
  paint();
  return function stop() {
    stopped = true;
    operation++;
    clearInterval(looking);
    clearTimeout(noticeTimer);
    page.stop();
  };
}
function liveChecks(item, pageDescription) {
  const isCmat = isClosingBusinessArea;
  const area = (item.used || []).find(value => value.field === 'Business Area');
  const cmat = area && [area.value, area.was].some(isCmat);
  const rules = pageDescription || item.checkCostCenterDescription || cmat
    ? { ...item.pageChecks, costCenterDescription: BLOCKED_HEADCOUNT,
      descriptionMonitoringOnly: Boolean(area?.value && !isCmat(area.value) && isCmat(area.was)) } : item.pageChecks || null;
  const completed = isCompletedDeactivation(item);
  if (item.specialCase !== 'deactivation' && !completed) return rules;
  const used = field => (item.used || []).find(value => value.field === field)?.value || '';
  const listed = new Set((item.changes || []).map(change => change.field));
  const fields = [...(rules?.fields || [])];
  if (completed) fields.push(
    { field: 'Email', target: '' },
    /^\d{8}1$/.test(item.employeeId || '') ? { field:'Employee ID', target:item.employeeId }
      : { field:'Employee ID', target:EMPLOYEE_ID_WITH_ONE_BY_HAND, check:'with-one' },
    { field: 'Profile Status', target: 'No' },
    { field: 'Resource Manager', target: 'Not Applicable' },
  );
  if (!listed.has('Termination Date') && used('Term Date')) fields.push({ field: 'Termination Date', target: used('Term Date'), check: 'termination-date', latest: item.effectiveMonday || '' });
  return {
    ...rules,
    fields,
    ...(!item.dateSensitiveRow ? { dateSensitive: { effectiveDate: '', department: X_TERM_DEPARTMENT, departmentOnly: true, newestRow: true } } : {}),
  };
}
function isCompletedDeactivation(item) {
  return item.deadEnd && (item.notes || []).some(note => note.text?.startsWith(DEACTIVATED_ALREADY));
}
function fieldsFound(fields) {
  return Boolean(fields && !fields.error && Array.isArray(fields.controls) && fields.controls.length
    && fields.controls.every(control => control.found && (!control.required || control.expected)));
}
function addsLines(found) {
  return found.extra.length > 0 || Boolean(found.neededRow) || found.unknown.length > 0 || found.managerEmailWrong;
}
function sameFinding(one, two) {
  return JSON.stringify(one) === JSON.stringify(two);
}
function mismatchedPart(person) {
  const email = person.email?.matches;
  const employeeId = !person.employeeId?.found || person.employeeId?.matches;
  if (!email && !employeeId) return 'Email and Employee ID don\'t match';
  return !email ? 'Email doesn\'t match' : 'Employee ID doesn\'t match';
}
function lookForNewPages({ mySource, idle, checkPage, showProblem }) {
  let lastPage = null;
  let seenAt = 0;
  let looks = 0;
  return setInterval(() => {
    if (!idle()) return;
    const page = mySource.loadedPage();
    if (!page) {
      const problem = mySource.problem();
      if (problem) {
        lastPage = null;
        showProblem(problem);
      }
      return;
    }
    if (page !== lastPage) {
      lastPage = page;
      seenAt = Date.now() - loadedFor(page);
      looks = 0;
    }
    const age = Date.now() - seenAt;
    if ((looks === 0 && age >= SETTLE_TIME) || (looks === 1 && age >= SECOND_LOOK)) {
      looks++;
      checkPage();
    }
  }, LOOK_EVERY);
}
function loadedFor(page) {
  try {
    const timing = page.defaultView.performance;
    const loadEnd = timing.getEntriesByType('navigation')[0]?.loadEventEnd;
    return loadEnd ? Math.max(0, timing.now() - loadEnd) : 0;
  } catch {
    return 0;
  }
}
__exports.openReview = openReview;
},
"mysource/profile-page.js": function (__require, __exports, document, window) {
'use strict';
const { MESSAGES } = __require("./mysource-window.js");
const { arrow, withoutCode } = __require("../screen/wording.js");
const editedPages = new WeakMap();
function dateSensitiveValue(row, expected) {
  const label = 'Date Sensitive row';
  if (row?.found === false && row.reason === 'row-not-found') {
    return { label: label + (expected?.newestRow ? ' (the table has no rows)' : ' (not added yet)'), available: true, matches: false, shiftNow: row.shiftNow || '' };
  }
  if (!row?.found) {
    const reason = row?.reason === 'more-pages' ? ' (show all rows of the table)'
      : row?.reason === 'date-unreadable' ? ' (a row date could not be read)'
        : row?.reason === 'count-unreadable' ? ' (could not tell whether every row is shown)'
          : row?.reason === 'conflicting-rows' ? ' (more than one conflicting row for this date)'
            : row?.reason === 'shift-unreadable' ? ' (the shift before this row could not be read)' : ' (table not found)';
    return { label: label + reason, available: false, matches: false };
  }
  const wanted = { Department: expected?.department, Level: expected?.level, Shift: expected?.requiredExistingShift };
  const differences = (row.differences || [])
    .map(field => `${field}: ${arrow(withoutCode(row.row[field.toLowerCase()]), withoutCode(wanted[field]))}`);
  return {
    label: differences.length ? `${label} (${differences.join(', ')})` : label,
    available: true,
    matches: differences.length === 0,
    differs: differences.join(', '),
    shiftNow: row.shiftNow || '',
  };
}
function watchProfilePage({ mySource, identity, onChanged = () => {}, onEdited = () => {} }) {
  let confirmed = null;
  let version = 0;
  let stopped = false;
  let stopWatching = () => {};
  function forget(message = MESSAGES.changed) {
    const had = Boolean(confirmed);
    confirmed = null;
    version++;
    stopWatching();
    if (had && !stopped) onChanged(message);
  }
  function stillCurrent(token) {
    if (stopped || token !== version) throw new Error(MESSAGES.changed);
  }
  function pageOf(win) {
    try {
      if (!win || win.closed || win.location.origin !== mySource.origin) return null;
      return win.document;
    } catch {
      return null;
    }
  }
  function addressOf(win) {
    try {
      return win.location.href;
    } catch {
      return null;
    }
  }
  async function read(reader, args, token, target = confirmed) {
    stillCurrent(token);
    if (!target) throw new Error(MESSAGES.changed);
    const doc = pageOf(target.win);
    if (!doc || (target.document && doc !== target.document) || (target.address && addressOf(target.win) !== target.address)) {
      throw new Error(MESSAGES.changed);
    }
    const run = mySource.readersFor(target.win)[reader];
    if (typeof run !== 'function') throw new Error(MESSAGES.changed);
    const result = structuredClone(run(...structuredClone(args)));
    await Promise.resolve();
    stillCurrent(token);
    if (pageOf(target.win) !== doc) throw new Error(MESSAGES.changed);
    return { document: doc, address: addressOf(target.win), result };
  }
  function watch(win, doc) {
    stopWatching();
    const onLeave = () => {
      if (confirmed?.win === win) forget();
    };
    const reread = () => {
      if (stopped || mySource.current() !== win || pageOf(win) !== doc) return;
      onEdited();
    };
    const onEdit = event => {
      if (stopped || mySource.current() !== win || pageOf(win) !== doc) return;
      const fields = mySource.readersFor(win).profileFieldControls().filter(entry => entry.controls.includes(event.target));
      if (!fields.length) return;
      if (confirmed?.document === doc) {
        const names = editedPages.get(doc) || new Set();
        fields.forEach(entry => names.add(entry.field));
        editedPages.set(doc, names);
      }
      reread();
    };
    const events = ['pagehide', 'popstate', 'hashchange'];
    const edits = ['input', 'change'];
    let observer = null;
    try {
      events.forEach(type => win.addEventListener(type, onLeave));
      edits.forEach(type => doc?.addEventListener(type, onEdit, true));
      const Observer = doc?.defaultView?.MutationObserver;
      if (Observer && doc.body) {
        observer = new Observer(reread);
        observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
      }
      stopWatching = () => {
        try {
          events.forEach(type => win.removeEventListener(type, onLeave));
          edits.forEach(type => doc?.removeEventListener(type, onEdit, true));
          observer?.disconnect();
        } catch {
        }
        stopWatching = () => {};
      };
    } catch {
      stopWatching = () => {};
    }
  }
  async function confirmSamePerson() {
    const token = version;
    const target = confirmed;
    try {
      if (!target?.document || mySource.current() !== target.win) throw new Error(MESSAGES.changed);
      stillCurrent(token);
      const entry = await read('readIdentity', [identity], token, target);
      if (!entry.result?.pageDetected || !entry.result.verified || mySource.current() !== target.win) throw new Error(MESSAGES.changed);
      return entry.result;
    } catch {
      if (token === version) forget();
      throw new Error(MESSAGES.changed);
    }
  }
  async function readConfirmed(reader, args = []) {
    const token = version;
    try {
      await confirmSamePerson();
      const entry = await read(reader, args, token);
      await confirmSamePerson();
      stillCurrent(token);
      return entry.result;
    } catch {
      if (token === version) forget();
      throw new Error(MESSAGES.changed);
    }
  }
  async function check({ personOnly = false } = {}) {
    confirmed = null;
    stopWatching();
    const token = ++version;
    try {
      const win = mySource.current();
      stillCurrent(token);
      confirmed = { win };
      const entry = await read('readIdentity', [identity], token);
      watch(win, entry.document);
      if (!entry.result?.pageDetected) {
        confirmed = null;
        const error = new Error(MESSAGES.notAProfile);
        error.awaitingIdentity = true;
        throw error;
      }
      if (!entry.result.verified) {
        confirmed = null;
        return { person: entry.result, fields: null };
      }
      confirmed = { win, document: entry.document, address: entry.address };
      const fields = personOnly ? null : await readConfirmed('readProfileControls');
      await confirmSamePerson();
      stillCurrent(token);
      return { person: entry.result, fields };
    } catch (error) {
      if (token === version) {
        confirmed = null;
        version++;
        if (!error.awaitingIdentity) stopWatching();
      }
      throw new Error(error.message === MESSAGES.changed ? MESSAGES.changed : error.forOperator ? error.message : MESSAGES.notAProfile);
    }
  }
  return {
    check,
    confirmSamePerson,
    checkFields: () => readConfirmed('readProfileControls'),
    async health() {
      const listed = await readConfirmed('listFields');
      const table = await readConfirmed('readDateSensitiveRow', [null]);
      return [
        ...(listed || []).filter(field => !field.found).map(field => field.label),
        ...(table?.found === false && table.reason === 'section-not-found' ? ['Date Sensitive table'] : []),
      ];
    },
    async readValues(asks) {
      const result = await readConfirmed('readValues', [asks]);
      const row = asks.find(ask => ask.dateSensitive);
      if (!row || !Array.isArray(result?.values)) return result;
      const found = await readConfirmed('readDateSensitiveRow', [row.dateSensitive]);
      return {
        ...result,
        values: result.values.map(value => (value.label === 'Date Sensitive row' ? dateSensitiveValue(found, row.dateSensitive) : value)),
      };
    },
    get confirmed() {
      return Boolean(confirmed?.document);
    },
    get editedFields() {
      const doc = confirmed?.document;
      if (!doc) return [];
      const names = new Set(editedPages.get(doc) || []);
      for (const entry of mySource.readersFor(confirmed.win).profileFieldControls()) {
        if (entry.controls.some(control => {
          if (control.disabled || ['button', 'submit', 'reset'].includes(control.type)) return false;
          if (control.tagName === 'SELECT') {
            const options = [...control.options];
            const explicit = options.map((option, index) => option.defaultSelected ? index : -1).filter(index => index >= 0);
            const initial = explicit.length ? explicit.at(-1) : control.size > 1 ? -1
              : options.findIndex(option => !option.disabled && !option.closest('optgroup[disabled]'));
            return options.some((option, index) => option.selected !== (control.multiple ? option.defaultSelected : index === initial));
          }
          if (['checkbox', 'radio'].includes(control.type)) return control.checked !== control.defaultChecked;
          return control.value !== control.defaultValue;
        })) names.add(entry.field);
      }
      return [...names];
    },
    get edited() { return this.editedFields.length > 0; },
    stop() {
      stopped = true;
      confirmed = null;
      version++;
      stopWatching();
    },
  };
}
__exports.watchProfilePage = watchProfilePage;
},
"auto/profile-fill.js": function (__require, __exports, document, window) {
'use strict';
const { dateChanges, dateBlocker, prepareDateFill, dateWidgetValue, calendarDate } = __require("./date-fill.js");
const { dropdownField } = __require("./dropdown-fill.js");
const COLUMNS = {
  Email: 'EMAIL', 'Employee ID': 'EMPID',
  Security: 'GROUP_ID', Authorization: 'AUTH_ID', 'Assign Period': 'ASSIGN_PERIOD',
  'Schedule Compliance': 'SCHEDULE_COMPLIANCE', 'Resource Manager': 'TALENTPROFESSIONAL',
  'Termination Date': 'ENDDATE', 'Profile Status': 'ACTIVE',
  'Resource Manager Email': 'TALENTPROFESSIONAL_EMAIL', Business: 'FSS', 'Business Area': 'HRSVCAREA',
  'Business Line': 'COMPETENCY', 'Cost Center': 'RC', 'Talent Group': 'SUBCOMPETENCY', 'Talent Sub Group': 'SUBCAPABILITY',
  'Position Title': 'Job_desc', 'Level Group': 'CLASS', 'Current Intern': 'IsIntern',
  'Comments 2': 'COMMENTS2', 'Comments 3': 'COMMENTS3', 'Comments 4': 'COMMENTS4',
  Practice: 'PRACTICE', Region: 'REGION', 'Job Family': 'JOB_FAMILY', 'Job Sub Family': 'JOB_SUB_FAMILY',
  'Talent Model': 'TALENT_MODEL', 'People Leader': 'PEOPLE_LEADER', 'Major/Minor': 'MAJOR_MINOR', 'Primary Industry': 'PRIMARY_INDUSTRY',
  'Cost Center Description': 'COST_CENTER_DESCRIPTION',
};
const WRITABLE = new Set(['Security', 'Authorization', 'Assign Period', 'Schedule Compliance',
  'Resource Manager', 'Termination Date', 'Profile Status']);
const clean = value => String(value ?? '').replace(/[*•:]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const textValue = value => String(value ?? '').replace(/^\s*\d+\s*[-–—]\s*/, '').replace(/[_–—-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
function readMatch(control, ask) {
  const readings = [control.value, ...(control.tagName === 'SELECT' ? [...control.selectedOptions].map(option => option.textContent.trim()) : [])];
  if (ask.check === 'eight-digits') return readings.some(value => /^\d{8}$/.test(value));
  if (ask.check === 'absent') return readings.every(value => !(ask.absentOf || []).some(word => textValue(value).includes(textValue(word))));
  if (ask.check) return false;
  return readings.some(value => ask.contains ? textValue(value).includes(textValue(ask.target))
    : ask.compare === 'level' ? /^\s*(L(?:PP|CEO|MD|L|\d+))(?=[_\s-]|$)/i.exec(value)?.[1].toUpperCase() === String(ask.target).toUpperCase()
      : ask.compare === 'code' ? Boolean(/^\s*\d+/.exec(ask.target)) && /^\s*\d+/.exec(value)?.[0].trim() === /^\s*\d+/.exec(ask.target)?.[0].trim()
        : textValue(value) === textValue(ask.target) || (ask.compare === 'text' && ask.cut && textValue(ask.target) !== '' && textValue(value).startsWith(textValue(ask.target))));
}
function fillBlocker(item) {
  if (item.pendingCostCenterDescription) return 'Pending: Cost Center Description is not known.';
  if (item.status === 'later') return 'Later: nothing is filled.';
  if (item.status !== 'ready' || (item.specialCase && item.specialCase !== 'product') || item.cannotPlan || item.deadEnd
    || item.checkCostCenterDescription || item.scheduleWork) {
    return 'By hand: only ordinary transfers without schedule work can be filled.';
  }
  const rowProblem = dateBlocker(item);
  if (rowProblem) return rowProblem;
  if (!item.changes?.length && !dateChanges(item).length && !(item.specialCase === 'product' && item.comment)) return 'By hand: no planned fields to fill.';
  if ((item.comment && item.specialCase !== 'product') || (item.changes || []).some(change => !(item.backFromProductRow && change.field === 'Comment' && change.check === 'absent' && change.anyOf?.join('|') === 'Comments 2|Comments 3|Comments 4') && (!WRITABLE.has(change.field)
    || typeof change.target !== 'string' || !change.target || change.check || change.anyOf || change.cut))) {
    return 'By hand: this plan needs a field or step that filling does not support.';
  }
  if (new Set((item.changes || []).map(change => change.field)).size !== (item.changes || []).length) return 'By hand: repeated planned field.';
  return '';
}
function field(doc, name) {
  const controls = [...doc.querySelectorAll('input, select, textarea')];
  const byColumn = controls.filter(control => control.getAttribute('data-column-name') === COLUMNS[name]);
  const labels = [...doc.querySelectorAll('label')].filter(label => clean(label.textContent) === clean(name)
    || (name === 'Termination Date' && clean(label.textContent) === 'term date'));
  const byLabel = [...new Set(labels.flatMap(label => label.htmlFor
    ? [...doc.querySelectorAll('[id]')].filter(node => node.id === label.htmlFor)
    : [...(label.closest('div, fieldset, section, td') || label.parentElement).querySelectorAll('input, select, textarea')]))];
  const found = [...new Set([...byColumn, ...byLabel])];
  if (found.length > 1) throw new Error(`By hand: ${name}: field missing or ambiguous.`);
  if (found.length !== 1 || !controls.includes(found[0])) throw new Error(`${name}: field missing or ambiguous.`);
  const control = found[0];
  const metadata = ['data-column-name', 'data-column'].map(key => control.getAttribute(key)).filter(Boolean);
  const linked = [...doc.querySelectorAll('label')].filter(label => label.htmlFor
    ? label.htmlFor === control.id : label.closest('div, fieldset, section, td')?.contains(control));
  if (metadata.some(value => value !== COLUMNS[name]) || linked.some(label => clean(label.textContent)
    && clean(label.textContent) !== clean(name) && !(name === 'Termination Date' && clean(label.textContent) === 'term date'))) {
    throw new Error(`By hand: ${name}: conflicting label and column metadata.`);
  }
  return control;
}
function visible(control, name) {
  if (control.type === 'hidden' || control.closest('[hidden], [inert]')) throw new Error(`${name}: hidden field.`);
  for (let node = control; node?.nodeType === 1; node = node.parentElement) {
    const style = control.ownerDocument.defaultView.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') throw new Error(`${name}: hidden field.`);
  }
}
function snapshot(form) {
  if (form.elements && [...form.elements].some(control => !form.contains(control))) throw new Error('By hand: editable field outside the profile form/container.');
  if ([...form.querySelectorAll('input,select,textarea,[name]')].some(control => control.form && control.form !== form)) throw new Error('By hand: field belongs to another form.');
  if (form.querySelector('[contenteditable]:not([contenteditable="false"])')) throw new Error('By hand: unsupported editable content in profile form.');
  return [...form.querySelectorAll('input, select, textarea, [name]')]
    .filter(control => control.hasAttribute('name') || !['button', 'submit', 'reset'].includes(control.type))
    .map(control => ({ control, key: [control.id, control.name, control.tagName, control.type,
      control.getAttribute('data-column-name'), control.getAttribute('data-column')],
    value: JSON.stringify([control.value ?? control.getAttribute('value'), control.checked ?? null, Boolean(control.disabled || control.matches(':disabled')),
      control.tagName === 'SELECT' ? [...control.selectedOptions].map(option => option.value) : null]) }));
}
function unchanged(form, before, planned, sameDocument) {
  const now = snapshot(form);
  if (now.length !== before.length) throw new Error('Unplanned field added or missing in profile form.');
  for (let index = 0; index < before.length; index++) {
    const old = before[index], current = now[index];
    const name = old.control.labels?.[0]?.textContent.trim() || old.control.id || old.control.name || `field ${index + 1}`;
    if (JSON.stringify(current.key) !== JSON.stringify(old.key) || (sameDocument && current.control !== old.control)) {
      throw new Error(`${name}: unplanned field structure changed.`);
    }
    if (!planned.has(old.control) && current.value !== old.value) throw new Error(`${name}: unplanned value changed.`);
  }
}
function editable(control, name, allowDate = false) {
  if (control.disabled || control.readOnly || control.matches(':disabled')
    || control.closest('[hidden], [inert], [aria-disabled="true"]')
    || control.getAttribute('role') === 'combobox' || control.hasAttribute('list')
    || control.classList.contains('tt-input') || control.classList.contains('select2-hidden-accessible')
    || control.ownerDocument.getElementById(`select2-${control.id}-container`)) throw new Error(`${name}: unsupported or disabled field.`);
  for (let node = control; node?.nodeType === 1; node = node.parentElement) {
    const style = control.ownerDocument.defaultView.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') throw new Error(`${name}: hidden field.`);
  }
  if (control.tagName === 'SELECT') {
    if (control.multiple) throw new Error(`${name}: multiple selection is unsupported.`);
  } else if (!(control.tagName === 'INPUT' && (control.type === 'text' || (allowDate && control.type === 'date'))) && control.tagName !== 'TEXTAREA') {
    throw new Error(`${name}: unsupported field type.`);
  }
}
function targetValue(control, name, target) {
  editable(control, name, name === 'Termination Date');
  if (name === 'Termination Date') {
    try { return dateWidgetValue(control, target); }
    catch (error) { throw new Error(`${name}: ${error.message}`); }
  }
  if (control.tagName !== 'SELECT') {
    if (control.maxLength >= 0 && target.length > control.maxLength) throw new Error(`${name}: target exceeds the field limit.`);
    return target;
  }
  const options = [...control.options].filter(option => option.textContent.trim() === target || option.value === target);
  if (options.length !== 1 || options[0].disabled || options[0].closest('optgroup[disabled]')
    || [...control.options].filter(option => option.value === options[0].value).length !== 1) {
    throw new Error(`${name}: no unique exact option for the plan.`);
  }
  return options[0].value;
}
function createProfileFill({ mySource, onState = () => {}, saveTimeoutMs = 10000 }) {
  let enabled = false;
  let state = 'off';
  let message = '';
  let preview = null;
  let caseName = '';
  let ownEdit = false;
  let ownSave = false;
  let ownButton = null;
  let ownWidget = null;
  let waiting = null;
  let proof = null;
  let wrote = false;
  const savedProfiles = new Set();
  let unwatch = () => {};
  let unguardRun = () => {};
  let runPage = null;
  let guardTimer = null;
  let canNavigate = false;
  function guardRun() {
    try {
      const win = mySource.observedPage?.()?.win || mySource.current();
      if (!win || win.closed || win.location.origin !== mySource.origin || !win.document) throw new Error();
      const doc = win.document;
      runPage = { win, doc, address: win.location.href };
      const click = event => {
        if (!event.isTrusted && ((ownSave && event.target === preview?.save) || event.target === ownButton)) return;
        stop('Click on the MySource page; run stopped.');
      };
      const key = () => stop('Key on the MySource page; run stopped.');
      const edit = event => { if (event !== ownEdit && !(ownWidget && ownWidget.controls.has(event.target) && !event.isTrusted)) stop('MySource field edited; run stopped.'); };
      const leave = event => {
        if (!(state === 'saving' && waiting) && !canNavigate) stop('MySource page navigation; run stopped.');
        else if (event.type === 'pagehide') unguardRun();
      };
      const navigate = () => { if (!canNavigate) stop('MySource page navigation; run stopped.'); };
      const events = [['click', click], ['keydown', key], ['keypress', key], ['keyup', key],
        ['input', edit], ['change', edit]];
      for (const [type, listener] of events) doc.addEventListener(type, listener, true);
      win.addEventListener('beforeunload', leave, true);
      win.addEventListener('pagehide', leave, true);
      win.addEventListener('popstate', navigate, true);
      win.addEventListener('hashchange', navigate, true);
      unguardRun = () => {
        for (const [type, listener] of events) doc.removeEventListener(type, listener, true);
        win.removeEventListener('beforeunload', leave, true);
        win.removeEventListener('pagehide', leave, true);
        win.removeEventListener('popstate', navigate, true);
        win.removeEventListener('hashchange', navigate, true);
        unguardRun = () => {};
      };
    } catch { stop('MySource unavailable when filling was enabled; run stopped.'); }
  }
  function assertWriteAllowed() {
    ready();
    if (!runPage || preview?.doc !== runPage.doc || preview?.win !== runPage.win
      || preview?.address !== runPage.address) throw new Error('MySource page changed; run stopped.');
  }
  function startGuard() {
    guardRun();
    globalThis.clearInterval(guardTimer);
    guardTimer = globalThis.setInterval(() => {
      if (!enabled || state === 'stopped') return;
      try {
        const win = mySource.observedPage?.()?.win || mySource.current();
        if (!runPage || win !== runPage.win || win.document !== runPage.doc || win.location.href !== runPage.address) {
          if (!canNavigate && state !== 'saving') { stop('MySource page changed; run stopped.'); return; }
          unguardRun(); guardRun();
        }
      } catch {   }
    }, 10);
  }
  function stop(reason = 'Operator stopped.') {
    if (!enabled) return;
    state = 'stopped';
    message = `${caseName || 'Fill run'}: ${reason}`;
    unwatch();
    unguardRun();
    globalThis.clearInterval(guardTimer);
    const pending = waiting;
    waiting = null;
    pending?.reject(new Error(message));
    onState();
  }
  function fail(reason) {
    stop(reason);
    throw new Error(message);
  }
  function ready() {
    if (!enabled) throw new Error('Filling is off.');
    if (state === 'stopped') throw new Error(`${message} Run stopped; turn filling off before starting another run.`);
  }
  function page() {
    let win;
    try {
      win = mySource.current();
      if (!win || win.closed || win.location.origin !== mySource.origin || !win.document.body
        || win.document.readyState === 'loading') throw new Error();
      return { win, doc: win.document, address: win.location.href };
    } catch {
      throw new Error('MySource page unavailable, changed, or session expired.');
    }
  }
  function identify(doc, identity) {
    const save = saveButton(doc);
    const form = save.form || save.closest('[data-profile-form]');
    if (!form) throw new Error('By hand: Save has no unique profile form/container.');
    const email = field(form, 'Email');
    const id = field(form, 'Employee ID');
    visible(email, 'Email'); visible(id, 'Employee ID');
    if ((email.form && email.form !== form) || (id.form && id.form !== form)) throw new Error('Identity belongs to another form.');
    if (!identity.email || email.value.trim().toLowerCase() !== identity.email.trim().toLowerCase()) throw new Error('Email does not match the plan.');
    if (!/^\d+$/.test(identity.employeeId) || id.value !== identity.employeeId) throw new Error('Employee ID does not exactly match the plan.');
    return save;
  }
  function saveButton(doc) {
    const saves = [...doc.querySelectorAll('button, input[type="button"], input[type="submit"]')]
      .filter(node => clean(node.textContent || node.value) === 'save');
    if (saves.length !== 1) throw new Error('Save button missing or ambiguous: unexpected profile page or expired session.');
    const save = saves[0];
    if (save.type !== 'button' || save.disabled || save.matches(':disabled')
      || save.closest('[hidden], [inert], [aria-disabled="true"]')) throw new Error('Save: unsupported, disabled or submitting button.');
    for (let node = save; node?.nodeType === 1; node = node.parentElement) {
      const style = save.ownerDocument.defaultView.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') throw new Error('Save: hidden button.');
    }
    return save;
  }
  function current() {
    ready();
    const seen = page();
    if (!preview || seen.win !== preview.win || seen.doc !== preview.doc || seen.address !== preview.address) throw new Error('MySource page changed after preview.');
    identify(seen.doc, preview.identity);
    return seen;
  }
  function checkFields() {
    assertWriteAllowed();
    const { doc } = current();
    if (saveButton(doc) !== preview.save) throw new Error('Save button changed after preview.');
    if ((preview.save.form || preview.save.closest('[data-profile-form]')) !== preview.form) throw new Error('Profile form changed.');
    unchanged(preview.form, preview.snapshot, new Set([...preview.entries.flatMap(entry => entry.widget ? [...entry.widget.controls] : [entry.control]),
      ...(preview.rowEditing ? preview.rows?.staging || [] : [])]), true);
    preview.rows?.check();
    for (const entry of preview.entries) {
      const control = field(preview.form, entry.field);
      if (entry.widget) { entry.widget.check(); continue; }
      if (control !== entry.control || targetValue(control, entry.field, entry.newValue) !== entry.target
        || control.value !== (entry.filled ? entry.target : entry.oldValue)) throw new Error(`${entry.field}: page changed after preview.`);
    }
  }
  function watch({ win, doc }) {
    const click = event => {
      if (!event.isTrusted && ((ownSave && event.target === preview.save) || event.target === ownButton)) return;
      stop('Click on the MySource page; run stopped.');
    };
    const edit = event => { if (event !== ownEdit && !(ownWidget && ownWidget.controls.has(event.target) && !event.isTrusted)) stop('MySource field edited; run stopped.'); };
    const key = () => stop('Key on the MySource page; run stopped.');
    const leave = () => {
      if (state === 'saving' && waiting && !waiting.departed) waiting.departed = true;
      else stop('MySource page changed; run stopped.');
    };
    const unexpected = () => stop('MySource page changed; run stopped.');
    const attach = next => {
      doc.removeEventListener('click', click, true);
      doc.removeEventListener('input', edit, true);
      doc.removeEventListener('change', edit, true);
      for (const type of ['keydown', 'keypress', 'keyup']) doc.removeEventListener(type, key, true);
      doc = next;
      doc.addEventListener('click', click, true);
      doc.addEventListener('input', edit, true);
      doc.addEventListener('change', edit, true);
      for (const type of ['keydown', 'keypress', 'keyup']) doc.addEventListener(type, key, true);
      win.addEventListener('pagehide', leave);
      win.addEventListener('popstate', unexpected);
      win.addEventListener('hashchange', unexpected);
    };
    attach(doc);
    const timer = globalThis.setInterval(() => {
      try {
        if (state !== 'saving') { checkFields(); return; }
        if (!waiting) return;
        if (Date.now() >= waiting.deadline) throw new Error('Save: confirmation timed out; saved fields were not verified. Check the page before restarting.');
        let savedPage;
        try {
          if (win.closed || win.location.origin !== mySource.origin) throw new Error();
          savedPage = { doc: win.document, address: win.location.href };
        } catch { throw new Error('Save: MySource unavailable or session expired.'); }
        const address = new URL(savedPage.address);
        const original = new URL(preview.address);
        if (address.pathname !== original.pathname || address.hash !== original.hash) throw new Error('Save: unexpected page or expired session.');
        if (savedPage.doc !== doc) {
          unguardRun();
          attach(savedPage.doc);
          guardRun();
        }
        if (doc.readyState === 'complete' && doc !== preview.doc) {
          if (mySource.current() !== win) throw new Error('Save: MySource window changed.');
          const savedButton = identify(doc, preview.identity);
          const savedForm = savedButton.form || savedButton.closest('[data-profile-form]');
          for (const entry of preview.entries) field(savedForm, entry.field);
          unchanged(savedForm, preview.snapshot, new Set(preview.entries.flatMap(entry => entry.widget ? [...entry.widget.controls] : [entry.control])), false);
          preview.rows?.check(savedForm);
          const signs = [...doc.querySelectorAll('#save-status')];
          const sign = signs.length === 1 ? signs[0] : null;
          const visible = sign && !sign.closest('[hidden], [inert]') && (() => {
            for (let node = sign; node?.nodeType === 1; node = node.parentElement) {
              const style = doc.defaultView.getComputedStyle(node);
              if (style.display === 'none' || style.visibility === 'hidden') return false;
            }
            return true;
          })();
          if (visible && /^Saved(?:\s*\(|[.!]?\s*$)/i.test(sign.textContent.trim())) {
            for (const entry of preview.entries) {
              const control = field(savedForm, entry.field);
              let matches;
              try {
                matches = entry.widget ? entry.widget.matches(savedForm) : entry.field === 'Termination Date'
                  ? calendarDate(control.value) === calendarDate(entry.newValue)
                  : control.value === targetValue(control, entry.field, entry.newValue);
              } catch (error) { throw new Error(`${entry.field}: ${error.message}`); }
              if (!matches) {
                throw new Error(`${entry.field}: saved value differs from the plan.`);
              }
            }
            const pending = waiting;
            waiting = null;
            state = 'verified';
            proof = Object.freeze({ kind: 'saved', email: preview.identity.email, employeeId: preview.identity.employeeId });
            canNavigate = true;
            message = `${caseName}: saved and verified. Opening the next ordinary case; By hand cases remain listed.`;
            unwatch();
            onState();
            pending.resolve();
            return;
          }
        }
      } catch (error) { stop(error.message); }
    }, 50);
    unwatch = () => {
      doc.removeEventListener('click', click, true);
      doc.removeEventListener('input', edit, true);
      doc.removeEventListener('change', edit, true);
      for (const type of ['keydown', 'keypress', 'keyup']) doc.removeEventListener(type, key, true);
      win.removeEventListener('pagehide', leave);
      win.removeEventListener('popstate', unexpected);
      win.removeEventListener('hashchange', unexpected);
      globalThis.clearInterval(timer);
      for (const entry of preview?.entries || []) entry.widget?.dispose();
      unwatch = () => {};
    };
  }
  function saveOnce() {
    checkFields();
    const save = preview.save;
    const nativeClick = Object.getOwnPropertyDescriptor(preview.doc.defaultView.HTMLElement.prototype, 'click')?.value;
    if (!nativeClick) throw new Error('Save: native click unavailable.');
    state = 'saving';
    message = `${caseName}: Save pressed once; waiting for the saved profile (up to ${saveTimeoutMs / 1000} seconds).`;
    const pending = new Promise((resolve, reject) => {
      waiting = { resolve, reject, deadline: Date.now() + saveTimeoutMs };
    });
    onState();
    ownSave = true;
    savedProfiles.add(preview.profileKey);
    try { checkFields(); wrote = true; nativeClick.call(save); }
    catch (error) { if (state !== 'stopped') stop(`Save: ${error.message || 'click failed'}; nothing retried.`); }
    finally { ownSave = false; }
    return pending;
  }
  return {
    get enabled() { return enabled; },
    get state() { return state; },
    get message() { return message; },
    get proof() { return proof; },
    setEnabled(value) {
      if (Boolean(value) === enabled) return;
      if (waiting) stop('Filling switched off; run stopped. Save may already have reached the page.');
      unwatch();
      unguardRun();
      globalThis.clearInterval(guardTimer);
      enabled = Boolean(value);
      if (enabled) savedProfiles.clear();
      state = enabled ? 'ready' : 'off';
      message = '';
      preview = null;
      proof = null;
      caseName = '';
      runPage = null;
      canNavigate = false;
      if (enabled) {
        startGuard();
      }
      onState();
    },
    preview(item) {
      ready();
      if (state !== 'ready') throw new Error('A preview is already open. Stop this run first.');
      caseName = item.ticketNumber || 'Unnamed case';
      proof = null; wrote = false;
      try {
        const blocker = fillBlocker(item);
        if (blocker) throw new Error(blocker);
        const seen = page();
        if (canNavigate || !runPage) { unguardRun(); guardRun(); }
        canNavigate = false;
        const identity = { email: item.profileEmail || item.email || '', employeeId: item.employeeId || '' };
        const profileKey = identity.employeeId;
        if (savedProfiles.has(profileKey)) throw new Error('Save: already pressed for this profile in this run; check it by hand.');
        const save = identify(seen.doc, identity);
        const form = save.form || save.closest('[data-profile-form]');
        const plans = (item.changes || []).filter(change => change.field !== 'Comment');
        const entries = plans.map(change => {
          const control = field(form, change.field);
          if (control.form && control.form !== form) throw new Error(`${change.field}: belongs to another form.`);
          const widget = dropdownField(form, control, change.field, change.target, COLUMNS[change.field]);
          const target = widget ? null : targetValue(control, change.field, change.target);
          const oldDisplay = widget ? widget.oldDisplay : control.tagName === 'SELECT' ? control.selectedOptions[0]?.textContent.trim() || '' : control.value;
          return { field: change.field, control, widget, oldValue: control.value, oldDisplay, newValue: change.target, target, filled: false };
        });
        const addComment = (name, target) => {
          const control = field(form, name);
          if (entries.some(entry=>entry.control===control)) throw new Error(`By hand: ${name}: repeated plan.`);
          const value=targetValue(control,name,target);
          entries.push({field:name,control,oldValue:control.value,oldDisplay:control.value,newValue:target,target:value,filled:false});
        };
        if (item.specialCase === 'product' && item.comment) {
          const old=field(form,'Comments 4').value;
          addComment('Comments 4', old.includes(item.comment) ? old : old + (old && !old.endsWith('\n') ? '\n' : '') + item.comment);
        }
        for (const removal of (item.changes || []).filter(change=>change.field==='Comment')) {
          if (!item.backFromProductRow || removal.check!=='absent' || !Array.isArray(removal.absentOf) || !removal.absentOf.length) throw new Error('By hand: unsupported comment removal.');
          for (const name of removal.anyOf) {
            let value=field(form,name).value;
            for (const text of removal.absentOf) {
              if (typeof text!=='string'||!text) throw new Error('By hand: missing exact comment text.');
              let at; while ((at=value.toLowerCase().indexOf(text.toLowerCase()))>=0) value=value.slice(0,at)+value.slice(at+text.length);
            }
            if(value!==field(form,name).value) addComment(name,value);
          }
        }
        if (item.backFromProductRow) {
          const comment = entries.find(entry => entry.field === 'Comments 4');
          const remaining = comment ? comment.newValue : field(form, 'Comments 4').value;
          if (remaining.trim()) throw new Error('By hand: Comments 4 has another note → read it and finish by hand');
        }
        const rows = prepareDateFill(form, item);
        for (const control of rows?.staging || []) editable(control, 'Date Sensitive row', true);
        for (const op of rows?.operations || []) {
          visible(op.button, 'Date Sensitive row');
          if (op.button.disabled || op.button.matches(':disabled') || op.button.closest('[aria-disabled="true"]')) throw new Error('By hand: Date Sensitive row button disabled.');
        }
        preview = { ...seen, identity, entries, save, form, rows, snapshot: snapshot(form), profileKey };
        state = 'preview';
        watch(seen);
        onState();
        return [...entries.map(({ field, oldDisplay, newValue }) => ({ field, oldValue: oldDisplay, newValue })), ...(rows?.image || [])];
      } catch (error) { return fail(error.message); }
    },
    apply() {
      ready();
      if (state !== 'preview') throw new Error('Preview the fields before filling.');
      try {
        checkFields();
        state = 'filling';
        const fillEntries = index => {
        for (; index < preview.entries.length; index++) {
          const entry = preview.entries[index];
          if (entry.widget) {
            ownWidget = entry.widget;
            return entry.widget.perform({ check:checkFields, timeoutMs:saveTimeoutMs,
              set(control, value) {
                checkFields();
                const view = preview.doc.defaultView;
                const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set;
                if (!setter) throw new Error(`${entry.field}: native name setter unavailable.`);
                wrote = true; setter.call(control, value);
                ownEdit = new view.Event('input', { bubbles:true });
                try { control.dispatchEvent(ownEdit); }
                finally { ownEdit = false; }
                checkFields();
              },
              click(control) {
                checkFields(); ownButton = control;
                try { preview.doc.defaultView.HTMLElement.prototype.click.call(control); }
                finally { ownButton = null; }
              },
            }).then(() => {
              ownWidget = null; entry.filled = true;
              return fillEntries(index + 1);
            }).catch(error => {
              ownWidget = null;
              if (state === 'stopped') throw error;
              return fail(error.message);
            });
          }
          checkFields();
          if (entry.control.value === entry.target) { entry.filled = true; continue; }
          const view = preview.doc.defaultView;
          const prototype = entry.control.tagName === 'SELECT' ? view.HTMLSelectElement.prototype
            : entry.control.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          if (!setter) throw new Error(`${entry.field}: native field setter missing.`);
          wrote = true; setter.call(entry.control, entry.target);
          entry.filled = true;
          for (const type of ['input', 'change']) {
            checkFields();
            ownEdit = new view.Event(type, { bubbles: true });
            try { entry.control.dispatchEvent(ownEdit); }
            finally { ownEdit = false; }
            checkFields();
          }
        }
        return finish();
        };
        const finish = () => {
        preview.rowEditing = true;
        preview.rows?.perform({ check: checkFields,
          set(control, value) {
            checkFields(); editable(control, 'Date Sensitive row', true);
            const view = preview.doc.defaultView;
            const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set;
            if (!setter) throw new Error('Date Sensitive row: native setter unavailable.');
            wrote = true; setter.call(control, value);
            for (const type of ['input', 'change']) {
              ownEdit = new view.Event(type, { bubbles: true });
              try { control.dispatchEvent(ownEdit); } finally { ownEdit = false; }
              checkFields();
            }
          },
          click(control) {
            checkFields(); visible(control, 'Date Sensitive row');
            if (!preview.form.contains(control) || control.disabled || control.matches(':disabled') || control.type !== 'button') throw new Error('Date Sensitive row: unavailable button.');
            wrote = true;
            ownButton = control;
            try { preview.doc.defaultView.HTMLElement.prototype.click.call(control); }
            finally { ownButton = null; }
          },
        });
        preview.rowEditing = false;
        checkFields();
        return saveOnce();
        };
        return fillEntries(0);
      } catch (error) { return fail(error.message); }
    },
    next() {
      ready();
      if (state !== 'verified') throw new Error('Saved fields have not been verified.');
      preview = null;
      state = 'ready';
      onState();
    },
    skipByHand() {
      if (!enabled || wrote || waiting || state !== 'stopped' || !/By hand:/i.test(message)) return false;
      state = 'ready'; preview = null; proof = null; canNavigate = true;
      startGuard(); onState(); return true;
    },
    async open(item) {
      ready();
      if (state !== 'ready') throw new Error('Finish the current profile first.');
      caseName = item.ticketNumber || 'Unnamed case'; proof = null; wrote = false;
      const identity = { email: item.profileEmail || item.email || '', employeeId: item.employeeId || '' };
      let seen;
      try {
        seen = page();
        const save = saveButton(seen.doc), form = save.form || save.closest('[data-profile-form]');
        if (!form) throw new Error('By hand: Save has no unique profile form/container.');
        for (const name of ['Email','Employee ID']) visible(field(form,name),name);
      } catch (error) { return fail(error.message); }
      try { identify(seen.doc, identity); return; } catch {   }
      const names = [item.rosterName, item.profileName, item.subjectPerson].filter(Boolean);
      for (const name of [...names]) if (name.includes(',')) names.push(name.split(',').reverse().map(part => part.trim()).join(' '));
      const links = [...seen.doc.querySelectorAll('a[href]')].filter(link => {
        const url = new URL(link.href, seen.address);
        const keyed = link.dataset.profileEmail?.toLowerCase() === identity.email.toLowerCase()
          && link.dataset.employeeId === identity.employeeId;
        return url.origin === mySource.origin && !link.hasAttribute('download') && (!link.target || link.target === '_self')
          && (keyed || names.some(name => clean(name) === clean(link.textContent)));
      });
      const destinations = new Set(links.map(link => link.href));
      if (destinations.size !== 1 || !links.length) return fail('By hand: Email/Employee ID: no unique profile navigation link available.');
      const link = links[0]; visible(link, 'Profile navigation');
      state = 'opening'; canNavigate = true; onState();
      ownButton = link;
      try { seen.doc.defaultView.HTMLElement.prototype.click.call(link); }
      catch { return fail('Email/Employee ID: profile navigation failed.'); }
      finally { ownButton = null; }
      const deadline = Date.now() + saveTimeoutMs;
      await new Promise((resolve, reject) => {
        const timer = globalThis.setInterval(() => {
          try {
            ready();
            if (Date.now() >= deadline) throw new Error('Email/Employee ID: profile navigation timed out.');
            let next;
            try { next = page(); } catch { return; }
            if (next.doc === seen.doc && next.address === seen.address) return;
            if (next.doc.readyState !== 'complete') return;
            identify(next.doc, identity);
            unguardRun(); guardRun(); state = 'ready'; onState();
            globalThis.clearInterval(timer); resolve();
          } catch (error) {
            globalThis.clearInterval(timer);
            if (enabled && state !== 'stopped') stop(error.message);
            reject(new Error(message || error.message));
          }
        }, 10);
      });
    },
    stop,
    destroy() { if (waiting) stop('Fill run closed; stopped.'); unwatch(); unguardRun(); globalThis.clearInterval(guardTimer); enabled = false; state = 'off'; preview = null; runPage = null; },
  };
}
__exports.fillBlocker = fillBlocker;
__exports.createProfileFill = createProfileFill;
},
"auto/date-fill.js": function (__require, __exports, document, window) {
'use strict';
const columns = ['startdate', 'department_name', 'level', 'shift'];
const ids = ['new-date', 'new-department', 'new-level', 'new-shift'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const normalized = row => [calendarDate(row[0]), ...row.slice(1)];
const sorted = rows => rows.map(row => JSON.stringify(normalized(row))).sort();
const error = reason => new Error(`By hand: Date Sensitive row: ${reason}`);
const nativeButton = button => ['BUTTON','INPUT'].includes(button?.tagName) && button.type === 'button';
function calendarDate(value) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value || '');
  if (!iso && !us) throw error('date is missing or unreadable.');
  const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(us[3]), Number(us[1]), Number(us[2])];
  const date = new Date(0); date.setUTCFullYear(year, month-1, day);
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth()+1 !== month || date.getUTCDate() !== day) throw error('date is invalid.');
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function dateFormat(control) {
  if (control.tagName === 'INPUT' && control.type === 'date') return 'iso';
  const stated = [control.getAttribute('placeholder'), control.getAttribute('pattern'),
    ...[...(control.labels || [])].map(label => label.textContent)].filter(Boolean).join(' ').toUpperCase();
  const pattern = (control.getAttribute('pattern') || '').replace(/^\^|\$$/g, '').replace(/\(\?:/g, '(').replace(/\\d/g, '[0-9]');
  const monthFirst = pattern === '(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])/[0-9]{4}';
  if (pattern && !monthFirst && pattern !== '[0-9]{2}/[0-9]{2}/[0-9]{4}') throw error('date widget pattern has an unproved or conflicting format.');
  if (control.tagName !== 'INPUT' || control.type !== 'text' || (!/\bMM\/DD\/YYYY\b/.test(stated) && !monthFirst)
    || /\b(?:DD\/MM\/YYYY|YYYY[-/]MM[-/]DD)\b/.test(stated)) throw error('date widget format is unproved or conflicting.');
  return 'us';
}
function dateWidgetValue(control, value) {
  const format = dateFormat(control), iso = calendarDate(value);
  if (format === 'iso') return iso;
  const [year, month, day] = iso.split('-');
  const text = `${month}/${day}/${year}`;
  if (control.maxLength >= 0 && text.length > control.maxLength) throw error('date exceeds the field limit.');
  return text;
}
function dateChanges(item) {
  return item.dateSensitiveRows || (item.dateSensitiveRow ? [item.dateSensitiveRow] : []);
}
function values(plan) {
  const day = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(plan.effectiveDate || '');
  const date = day && new Date(Number(day[3]), Number(day[1])-1, Number(day[2]));
  if (!day || date.getFullYear() !== Number(day[3]) || date.getMonth()+1 !== Number(day[1])
    || date.getDate() !== Number(day[2])) throw error('effective date is missing or invalid.');
  const result = [plan.effectiveDate, plan.department, plan.level, plan.requiredExistingShift ?? plan.shift];
  if (result.some(value => typeof value !== 'string' || !value.trim())) throw error('complete date, department, level and shift required.');
  if (!['add', 'remove'].includes(plan.action || 'add')) throw error('unsupported row action.');
  return result;
}
function dateBlocker(item) {
  try {
    const plans = dateChanges(item);
    if (!Array.isArray(plans)) throw error('row plan is not a list.');
    const dates = new Set();
    for (const plan of plans) {
      const row = values(plan);
      if (dates.has(row[0])) throw error('repeated planned date; handle it by hand.');
      dates.add(row[0]);
    }
    return '';
  } catch (failure) { return failure.message; }
}
function tableIn(form) {
  const tables = [...form.querySelectorAll('table#currentStaffForm')];
  if (tables.length !== 1) throw error('unique table not found.');
  return tables[0];
}
function rowsIn(form) {
  const table = tableIn(form);
  const rows = [...table.querySelectorAll('tbody tr')];
  const infos = [...form.querySelectorAll('#currentStaffForm_info')];
  const count = infos.length === 1 && /of\s+([\d,]+)\s+entries/i.exec(infos[0].textContent);
  if (!count || Number(count[1].replaceAll(',', '')) !== rows.length) throw error('all rows must be shown and counted.');
  return rows.map(row => columns.map(column => {
    const cells = [...row.querySelectorAll('td.column-'+column)];
    if (cells.length !== 1 || cells[0].querySelector('input,select,textarea')) throw error('unsupported row cells.');
    return cells[0].textContent.trim();
  }));
}
function prepareDateFill(form, item) {
  const plans = dateChanges(item);
  if (!plans.length && !form.querySelector('#currentStaffForm')) return null;
  let expected = rowsIn(form);
  const operations = [], staging = new Set();
  for (const plan of plans) {
    const wanted = values(plan), action = plan.action || 'add';
    const indices = expected.flatMap((row, index) => same(normalized(row), normalized(wanted)) ? [index] : []);
    if (action === 'add') {
      if (expected.some(row => calendarDate(row[0]) === calendarDate(wanted[0]))) throw error('a row already uses the planned date; handle it by hand.');
      const controls = ids.map((id, index) => {
        const found = [...form.querySelectorAll('[id]')].filter(node => node.id === id);
        if (found.length !== 1 || found[0].tagName !== 'INPUT' || (found[0].type !== 'text' && !(index === 0 && found[0].type === 'date'))) throw error('native row inputs unavailable.');
        staging.add(found[0]); return found[0];
      });
      dateWidgetValue(controls[0], wanted[0]);
      const buttons = [...form.querySelectorAll('[data-action="add-date-record"]')];
      if (buttons.length !== 1 || !nativeButton(buttons[0])) throw error('unique native Add button unavailable.');
      operations.push({ action, wanted, controls, button: buttons[0] });
    } else {
      if (indices.length !== 1) throw error('remove must match one complete existing dated row.');
      const tr = tableIn(form).querySelectorAll('tbody tr')[indices[0]];
      const buttons = [...tr.querySelectorAll('[data-action="remove-date-record"]')];
      if (buttons.length !== 1 || !nativeButton(buttons[0])) throw error('safe native Remove button unavailable.');
      operations.push({ action, wanted, controls: [], button: buttons[0] });
    }
  }
  const image = operations.map(op => ({ field: `Date Sensitive row (${op.action})`,
    oldValue: op.action === 'remove' ? op.wanted.join(' | ') : '(absent)',
    newValue: op.action === 'add' ? op.wanted.join(' | ') : '(removed)' }));
  return {
    staging, image, operations,
    check(target = form) {
      if (target === form) for (const op of operations) if (op.action === 'add') dateWidgetValue(op.controls[0], op.wanted[0]);
      if (!same(sorted(rowsIn(target)), sorted(expected))) throw error('rows or dates differ from the plan; another row may have changed.');
    },
    perform({ set, click, check }) {
      for (const op of operations) {
        check();
        const old = op.controls.map(control => control.value);
        op.controls.forEach((control, index) => set(control, index === 0 ? dateWidgetValue(control, op.wanted[index]) : op.wanted[index]));
        check();
        const next = op.action === 'add' ? [...expected, op.wanted] : expected.filter(row => !same(normalized(row), normalized(op.wanted)));
        click(op.button);
        expected = next;
        check();
        op.controls.forEach((control, index) => set(control, old[index]));
        check();
      }
    },
  };
}
function checkDateExpected(form, plan) {
  const rows = rowsIn(form);
  for (const row of rows) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row[0]);
    const date = match && new Date(Number(match[3]),Number(match[1])-1,Number(match[2]));
    if (!match || date.getFullYear() !== Number(match[3]) || date.getMonth()+1 !== Number(match[1])
      || date.getDate() !== Number(match[2])) throw error('No action row date is unreadable.');
  }
  const ordered = [...rows].sort((a, b) => new Date(b[0]) - new Date(a[0]));
  const date = plan.newestRow ? ordered[0]?.[0] : plan.effectiveDate;
  const matches = rows.filter(row => row[0] === date);
  if (matches.length !== 1) throw error('No action date must identify one row.');
  const found = matches[0];
  const wanted = [plan.department, plan.level, plan.requiredExistingShift];
  for (const [index,value] of wanted.entries()) {
    if (value && found[index+1] !== value) throw error(`${['Department','Level','Shift'][index]} differs from the No action plan.`);
  }
}
__exports.calendarDate = calendarDate;
__exports.dateWidgetValue = dateWidgetValue;
__exports.dateChanges = dateChanges;
__exports.dateBlocker = dateBlocker;
__exports.prepareDateFill = prepareDateFill;
__exports.checkDateExpected = checkDateExpected;
},
"auto/dropdown-fill.js": function (__require, __exports, document, window) {
'use strict';
const exact = value => String(value ?? '').trim();
const labelText = value => exact(value).replace(/[*?:]/g, '').replace(/\s+/g, ' ').toLowerCase();
const problem = (name, reason) => new Error(`By hand: ${name}: ${reason}`);
const OPTIONS = '[role="option"], .tt-suggestion, .select2-results__option';
const SETTLE_MS = 120;
const byId = (root, id) => [...root.querySelectorAll('[id]')].filter(node => node.id === id);
function nameBinding(form, code, name, column) {
  const wrapper = code.closest('[data-profile-widget], .twitter-typeahead, .select2-container');
  const drawn = code.id ? byId(form.ownerDocument, `select2-${code.id}-container`) : [];
  if (drawn.length > 1) throw problem(name, 'ambiguous drawn name.');
  const scope = wrapper || drawn[0]?.closest('.select2-container');
  const inputs = scope ? [...scope.querySelectorAll('input:not([type="hidden"])')] : [];
  if (inputs.length !== 1 || !form.contains(inputs[0]) || inputs[0] === code) throw problem(name, 'no unique bound name input.');
  const input = inputs[0], listId = input.getAttribute('aria-controls') || input.getAttribute('aria-owns');
  if (!code.id || !input.id || !listId || /\s/.test(listId) || input.disabled || input.readOnly || code.disabled
    || !['text','search'].includes(input.type) || !['INPUT','SELECT'].includes(code.tagName)) throw problem(name, 'unsupported suggestion binding.');
  if ([code,input].some(control => byId(form.ownerDocument, control.id).length !== 1)) throw problem(name, 'duplicate widget control ID.');
  const metadata = ['data-column-name','data-column'].map(key => input.getAttribute(key)).filter(value => value !== null);
  const labels = [...form.ownerDocument.querySelectorAll('label')].filter(label => label.control === input
    || (label.htmlFor && label.htmlFor === input.id));
  const words = labels.map(label => label.textContent);
  if (input.hasAttribute('aria-label')) words.push(input.getAttribute('aria-label'));
  if (input.hasAttribute('aria-labelledby')) {
    const ids = exact(input.getAttribute('aria-labelledby')).split(/\s+/);
    const nodes = ids.map(id => byId(form.ownerDocument, id));
    if (!ids[0] || nodes.some(found => found.length !== 1)) throw problem(name, 'ambiguous name label.');
    words.push(nodes.map(found => found[0].textContent).join(' '));
  }
  if ((!words.length && !metadata.length) || words.some(word => labelText(word) !== labelText(name))
    || metadata.some(value => value !== column)) throw problem(name, 'name input ownership is unproved or conflicts with another field.');
  if (input.hasAttribute('aria-controls') && input.hasAttribute('aria-owns')
    && input.getAttribute('aria-controls') !== input.getAttribute('aria-owns')) throw problem(name, 'conflicting suggestion lists.');
  return { input, listId };
}
function dropdownField(form, code, name, target, column) {
  if (code.type !== 'hidden' && code.getAttribute('role') !== 'combobox'
    && !code.classList.contains('select2-hidden-accessible') && !code.classList.contains('tt-input')) return null;
  const { input, listId } = nameBinding(form, code, name, column);
  const controls = new Set([code,input]);
  const initial = { name:input.value, code:code.value };
  let phase = 'before', chosenCode = '', chosen = null, observer = null, inspect = null;
  let stale = new Set(), seenExact = new Set(), listError = '', revision = 0;
  const visible = node => {
    if (node.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    for (let at=node;at?.nodeType===1;at=at.parentElement) {
      const style=node.ownerDocument.defaultView.getComputedStyle(at);
      if (style.display==='none'||style.visibility==='hidden') return false;
    }
    return true;
  };
  const optionCode = option => option.getAttribute('data-value') || option.getAttribute('data-id');
  const inList = node => {
    for (let at=node?.nodeType===1 ? node : node?.parentElement;at;at=at.parentElement) if (at.id===listId) return true;
    return false;
  };
  const remember = node => {
    if (node?.nodeType!==1) return;
    const options = [...(node.matches(OPTIONS) ? [node] : []), ...node.querySelectorAll(OPTIONS)];
    for (const option of options) if (!stale.has(option) && exact(option.textContent)===target) seenExact.add(option);
    if (seenExact.size>1) listError='second exact-name suggestion appeared; nothing more will be saved.';
  };
  const record = records => {
    for (const mutation of records) {
      const related = inList(mutation.target);
      if (related) { revision++; remember(mutation.target.nodeType===1 ? mutation.target : mutation.target.parentElement); }
      for (const node of [...mutation.addedNodes,...mutation.removedNodes]) {
        if (related) remember(node);
        else if (node.nodeType===1) for (const list of [node,...node.querySelectorAll('[id]')].filter(at=>at.id===listId)) { revision++;remember(list); }
      }
    }
  };
  const listState = () => {
    record(observer?.takeRecords() || []);
    const lists=byId(form.ownerDocument,listId);
    if(lists.length>1) throw problem(name,'suggestion list is ambiguous.');
    const list=lists[0], options=list ? [...list.querySelectorAll(OPTIONS)] : [];
    if (phase!=='before') {
      if (options.filter(option=>exact(option.textContent)===target).length>1) listError='multiple exact-name suggestions; nothing selected.';
      if (list) remember(list);
    }
    if (listError) throw problem(name,listError);
    return { list,options };
  };
  if (!visible(input)) throw problem(name, 'name input is hidden.');
  return {
    controls,input,code,oldDisplay:initial.name,
    dispose() { observer?.disconnect();observer=null; },
    check() {
      const bound=nameBinding(form,code,name,column);
      if (bound.input!==input || bound.listId!==listId || !form.contains(code) || !visible(input)
        || input.matches(':disabled') || code.matches(':disabled')) throw problem(name,'widget changed.');
      if (phase==='before' && (input.value!==initial.name||code.value!==initial.code)) throw problem(name,'widget changed before typing.');
      if (phase==='typing' && (input.value!==target||code.value!==initial.code)) throw problem(name,'unexpected name/code change while waiting.');
      if (phase!=='before') listState();
      if (phase==='picked' && (input.value!==target||code.value!==chosenCode
        || exact(chosen.textContent)!==target || optionCode(chosen)!==chosenCode)) throw problem(name,'selected name/code changed.');
    },
    matches(savedForm) {
      const codes=byId(savedForm,code.id), names=byId(savedForm,input.id);
      if (codes.length!==1 || names.length!==1) return false;
      const bound=nameBinding(savedForm,codes[0],name,column);
      return bound.input===names[0] && bound.listId===listId && names[0].value===target
        && codes[0].value===chosenCode && Boolean(chosenCode);
    },
    async perform({check,set,click,timeoutMs}) {
      check();
      stale=new Set(listState().options);
      seenExact=new Set();
      observer=new form.ownerDocument.defaultView.MutationObserver(records=>{ record(records);inspect?.(); });
      observer.observe(form.ownerDocument.body,{childList:true,subtree:true,attributes:true,characterData:true});
      const deadline=Date.now()+timeoutMs;
      phase='writing';set(input,target);phase='typing';check();
      await new Promise((resolve,reject)=>{
        let timer, previous=null, settledAt=0;
        const finish=error=>{clearInterval(timer);inspect=null;if(error)this.dispose();error?reject(error):resolve();};
        inspect=()=>{
          try {
            check();
            const {list,options}=listState();
            const signature=JSON.stringify([revision,list?.getAttribute('aria-busy'),options.map(option=>[
              option.textContent,optionCode(option),option.getAttribute('aria-disabled'),option.disabled,visible(option)])]);
            const same=previous && previous.list===list && previous.signature===signature
              && previous.options.length===options.length && options.every((option,index)=>option===previous.options[index]);
            if(!same) { previous={list,options,signature};settledAt=Date.now(); }
            if(Date.now()>=deadline) throw problem(name,'suggestions timed out before a fresh settled list; nothing selected.');
            if(list && visible(list) && list.getAttribute('aria-busy')!=='true' && options.length && same && Date.now()-settledAt>=SETTLE_MS) {
              if(options.some(option=>stale.has(option))) throw problem(name,'stale suggestions remain; nothing selected.');
              const matches=options.filter(option=>exact(option.textContent)===target);
              if(matches.length!==1) throw problem(name,`${matches.length} exact suggestions; nothing selected.`);
              const option=matches[0], expected=optionCode(option);
              if(!visible(option)||option.getAttribute('aria-disabled')==='true'||option.disabled) throw problem(name,'exact suggestion is unavailable.');
              if(!exact(expected)) throw problem(name,'suggestion has no explicit code.');
              chosen=option;chosenCode=expected;phase='picking';click(option);
              if(code.value!==expected || input.value!==target) throw problem(name,'suggestion did not set the exact name and hidden code.');
              phase='picked';check();finish();return;
            }
          } catch(error) { finish(error); }
        };
        timer=setInterval(()=>inspect?.(),20);inspect();
      });
    },
  };
}
__exports.dropdownField = dropdownField;
},
"auto/run.js": function (__require, __exports, document, window) {
'use strict';
const { createProfileFill, fillBlocker } = __require("./profile-fill.js");
const { reportRecord } = __require("./run-workbook.js");
const { endPoint } = __require("../screen/case-summary.js");
function createAutoRun({mySource,worklist,onChange=()=>{},beforeWrite=()=>new Promise(resolve=>window.requestAnimationFrame(resolve))}) {
  const records=new Map(),images=new Map();
  let running=false,paused=false,pauseRequested=false,resume=null,current=null,status='Off until Start.',identity='Not checked',epoch=0,active=null,total=[];
  const publish=()=>onChange();
  const record=(item,value)=>{records.set(item.key,value);worklist.reports.setResult(item.key,reportRecord(item,value));publish();};
  const fill=createProfileFill({mySource,onState:()=>{
    if(fill.state==='stopped' && current && records.get(current.key)?.state!=='done') {
      const value={state:/By hand:/i.test(fill.message)?'by-hand':'stopped',reason:fill.message};
      records.set(current.key,value);worklist.reports.setResult(current.key,reportRecord(current,value));
    }
    if(fill.state==='stopped') resume?.();
    publish();
  }});
  const pending=()=>worklist.getBatch().cases.filter(item=>endPoint(item)==='action' && !fillBlocker(item)
    && !worklist.getBatch().done.has(item.key) && !records.has(item.key));
  async function boundary(token) {
    if(pauseRequested && token===epoch) {
      paused=true;status='Paused before the next write. Press Continue to continue.';
      const waiting=new Promise(resolve=>{resume=resolve;});publish();
      await waiting;resume=null;paused=false;publish();
    }
    return token===epoch && fill.enabled && fill.state!=='stopped';
  }
  async function start() {
    if(paused) {pauseRequested=false;status='Running';resume?.();return;}
    if(running || !worklist.reports.signOff.trim() || !worklist.hasBatch())return;
    running=true;pauseRequested=false;current=null;status='Running';const token=++epoch;active=token;
    for(const [key,value] of records) if(value.state==='stopped') {
      records.delete(key);worklist.reports.setResult(key,{state:'not-run',reason:'Restarted by the operator.'});
    }
    const queued=pending();total=[...total,...queued.filter(item=>!total.some(old=>old.key===item.key))];
    fill.setEnabled(true);publish();
    try {
      for(const item of worklist.getBatch().cases) {
        if(token!==epoch || !fill.enabled || fill.state==='stopped')break;
        if(worklist.getBatch().done.has(item.key) || records.has(item.key))continue;
        if(endPoint(item)==='no-action') {record(item,{state:'not-run',reason:'No action: left for the operator to mark Done.'});continue;}
        if(endPoint(item)!=='action' || fillBlocker(item)) {record(item,{state:'by-hand',reason:fillBlocker(item)});continue;}
        if(!await boundary(token))break;
        current=item;identity='Checking Email and Employee ID';status='Opening profile';publish();
        try {
          await fill.open(item);
          if(token!==epoch || !fill.enabled)break;
          images.set(item.key,fill.preview(item));identity='\u2713 Email and Employee ID match';status='Before-image checked';publish();
          await beforeWrite();
          if(!await boundary(token))break;
          status='Filling';publish();
          await fill.apply();
          if(token!==epoch || !fill.enabled || fill.state!=='verified')break;
          const proof=fill.proof;
          if(proof?.kind!=='saved' || proof.employeeId!==item.employeeId || proof.email?.toLowerCase()!==(item.profileEmail || item.email || '').toLowerCase())throw new Error(`${item.ticketNumber}: Email/Employee ID: saved proof differs; run stopped.`);
          record(item,{state:'done',proof,what:(images.get(item.key)||[]).map(row=>`${row.field}: ${row.oldValue} \u2192 ${row.newValue}`).join('\n')});
          worklist.complete(item);status=`${item.ticketNumber}: saved and read back`;fill.next();
        } catch(error) {
          if(token!==epoch || !fill.enabled)break;
          record(item,{state:/By hand:/i.test(error.message)?'by-hand':'stopped',reason:error.message});
          if(!fill.skipByHand()) {status=error.message;break;}
        }
      }
      if(token===epoch && fill.state!=='stopped')status='Run finished. By hand cases remain visible.';
      else if(token===epoch)status=fill.message;
    } finally {
      if(active===token) {
        active=null;running=false;paused=false;pauseRequested=false;
        fill.setEnabled(false);publish();
      }
    }
  }
  return {
    start,
    pause(){if(!running || paused)return;pauseRequested=true;status='Pausing after this profile is safe.';publish();},
    stop(reason='Operator stopped.'){if(!running)return;status=reason;epoch++;fill.stop(reason);resume?.();publish();},
    reset(){if(running)fill.stop('Run reset; stopped.');epoch++;active=null;resume?.();fill.setEnabled(false);running=paused=pauseRequested=false;current=null;records.clear();images.clear();total=[];identity='Not checked';status='Off until Start.';publish();},
    destroy(){epoch++;active=null;resume?.();fill.destroy();},
    get state(){return {enabled:fill.enabled,running,paused,pauseRequested,current,records,images,total,queue:pending(),identity,
      status:fill.state==='stopped' && running ? fill.message : status,
      step:records.get(current?.key)?.state==='done'?'Saved and read back.':fill.state==='saving'?'Saving\u2026 then reading the profile back':fill.state==='filling'?'Filling':status};},
  };
}
__exports.createAutoRun = createAutoRun;
},
"auto/page.js": function (__require, __exports, document, window) {
'use strict';
const { element, button } = __require("../screen/case-view.js");
const { personName } = __require("../screen/case-summary.js");
const { createAutoRun } = __require("./run.js");
function attachAutoPage({mySource,worklist}) {
  const entry=document.getElementById('auto-mode'),main=document.querySelector('main');
  const page=element('section','auto-page');page.dataset.autoPage='';page.hidden=true;page.setAttribute('aria-label','Auto mode');
  const actions=element('div','auto-actions'),start=button('Start','primary'),stop=button('Stop','danger');
  actions.append(start,stop);
  const progressSection=element('section','case-section'),progressText=element('p','case-line'),bar=element('progress');bar.setAttribute('aria-label','Profiles done');
  progressSection.append(progressText,bar);
  const now=element('section','case-section'),person=element('p','auto-person'),before=element('div','auto-before');before.dataset.autoBefore='';
  now.append(person,before);
  const results=element('div','auto-results');results.dataset.autoResults='';results.setAttribute('role','log');
  page.append(actions,progressSection,now,results);main.append(page);
  let hidden=[],destroyed=false;
  const run=createAutoRun({mySource,worklist,onChange:paint});
  function paint(){
    if(destroyed)return;
    const state=run.state,done=state.total.filter(item=>state.records.get(item.key)?.state==='done').length;
    const total=state.total.length || (!state.running && !state.records.size ? state.queue.length : 0);
    page.dataset.fillEnabled=String(state.enabled);page.dataset.runState=state.paused?'paused':state.running?'running':'idle';
    start.textContent=state.paused?'Continue':state.running?'Pause':'Start';
    start.disabled=!worklist.hasBatch() || !worklist.reports.signOff.trim() || (state.running && state.pauseRequested && !state.paused);
    stop.disabled=!state.running;
    progressText.textContent=`${done} of ${total} done`;bar.max=total || 1;bar.value=done;
    person.textContent=state.current ? `${state.current.ticketNumber} \u00b7 ${personName(state.current) || state.current.email}` : '';
    before.replaceChildren(...(state.images.get(state.current?.key)||[]).map(row=>element('p','case-line',`${row.field}  ${row.oldValue || '(blank)'} \u2192 ${row.newValue || '(blank)'}`)));
    now.hidden=!state.current;
    const cases=worklist.getBatch().cases;
    results.replaceChildren(...[...state.records].filter(([,r])=>r.state!=='not-run').map(([key,r])=>{
      const item=cases.find(c=>c.key===key),ticket=item?.ticketNumber || key,success=r.state==='done';
      return element('p',`case-line ${success?'auto-done':'attention'}`,success ? `\u2713 ${ticket} Done` : `\u2717 ${ticket} By hand \u00b7 ${r.reason}`);
    }));
  }
  function close(){run.stop('Operator returned to the worklist; run stopped.');page.hidden=true;for(const [node,value] of hidden)node.hidden=value;hidden=[];worklist.showList();entry.hidden=!worklist.hasBatch();}
  const open=()=>{if(!page.hidden)return;worklist.showPage(close);hidden=[...main.children].filter(node=>node!==page).map(node=>[node,node.hidden]);for(const [node]of hidden)node.hidden=true;page.hidden=false;entry.hidden=true;paint();window.scrollTo(0,0);start.focus();};
  entry.addEventListener('click',open);
  start.addEventListener('click',()=>{if(run.state.running && !run.state.paused)run.pause();else run.start().catch(()=>run.stop());});
  stop.addEventListener('click',()=>run.stop());
  const reset=worklist.reports.onReset(()=>{run.reset();if(!page.hidden)close();});paint();
  return {destroy(){destroyed=true;reset();entry.removeEventListener('click',open);run.destroy();page.remove();}};
}
__exports.attachAutoPage = attachAutoPage;
},
"auto/run-workbook.js": function (__require, __exports, document, window) {
'use strict';
const { runMail: sharedMail, runSheets: sharedSheets, runWorkbook: sharedWorkbook } = __require("../files/run-workbook.js");
function reportRecord(item, record) {
  if (!record) return record;
  const proof=record.proof;
  const confirmed=record.state==='done' && ['saved','no-action'].includes(proof?.kind)
    && proof.employeeId===item.employeeId && typeof proof.email==='string'
    && proof.email.toLowerCase()===(item.profileEmail || item.email || '').toLowerCase();
  return {...record,confirmed,mailConfirmed:confirmed && proof.kind==='saved'};
}
function reportBatch(batch) { return {...batch,results:new Map(batch.cases.map(item=>[item.key,reportRecord(item,batch.results?.get(item.key))]))}; }
function runMail(item,record,context,signOff) { return sharedMail(item,reportRecord(item,record),context,signOff); }
function runSheets(batch) { return sharedSheets(reportBatch(batch)); }
function runWorkbook(batch) { return sharedWorkbook(reportBatch(batch)); }
__exports.reportRecord = reportRecord;
__exports.runMail = runMail;
__exports.runSheets = runSheets;
__exports.runWorkbook = runWorkbook;
},
"files/report-session.js": function (__require, __exports, document, window) {
'use strict';
const { downloadRunWorkbook } = __require("./run-workbook.js");
const { downloadBlob } = __require("./export.js");
function createReportSession({getBatch,signOffControl}) {
  const results=new Map(), listeners=new Set();
  let exported=false;
  const changed=()=>{exported=false;}; signOffControl.addEventListener('input',changed);
  return {
    results,
    setResult(key,value) {results.set(key,value);exported=false;},
    get signOff(){return signOffControl.value;},
    set signOff(value){signOffControl.value=value;exported=false;},
    download(once=false){if(once && (exported || !results.size))return;downloadRunWorkbook({...getBatch(),results,signOff:signOffControl.value},downloadBlob);exported=true;},
    onReset(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    reset(){for(const listener of listeners)listener();results.clear();exported=false;},
    destroy(){signOffControl.removeEventListener('input',changed);listeners.clear();results.clear();},
  };
}
__exports.createReportSession = createReportSession;
},
"screen/case-view.js": function (__require, __exports, document, window) {
'use strict';
const { caseChanges, caseTop, howDecided, personName, statusTag } = __require("./case-summary.js");
const { arrow, rowColumns, TOOL_NAME } = __require("./wording.js");
const { deactivationSchedule, WRONG_REASONS } = __require("../rules/mappings.js");
function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function button(label, kind) {
  const node = element('button', 'button ' + kind, label);
  node.type = 'button';
  return node;
}
function copyToClipboard(text) {
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.style.position = 'fixed';
  box.style.opacity = '0';
  const returnTo = document.activeElement;
  document.body.append(box);
  box.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  box.remove();
  if (returnTo && typeof returnTo.focus === 'function') returnTo.focus();
  if (copied) return Promise.resolve();
  return document.defaultView.navigator.clipboard.writeText(text);
}
function copyText(text, what) {
  const wrap = element('span', 'copy-text-wrap');
  const control = element('button', 'copy-text', text);
  control.type = 'button';
  control.title = 'Click to copy';
  control.setAttribute('aria-label', `${text} (click to copy the ${what})`);
  const note = element('span', 'copy-note');
  note.hidden = true;
  control.addEventListener('click', async () => {
    try {
      await copyToClipboard(text);
      note.textContent = 'Copied';
    } catch {
      note.textContent = 'Copy unavailable';
    }
    note.hidden = false;
    setTimeout(() => { note.hidden = true; }, 1500);
  });
  wrap.append(control, note);
  return wrap;
}
function caseSection(title, ...content) {
  const parts = content.filter(Boolean);
  if (!parts.length) return null;
  const section = element('section', 'case-section');
  if (title) section.append(element('h4', 'case-label', title));
  section.append(...parts);
  return section;
}
function textLines(texts, tone = '') {
  const shown = texts.filter(Boolean);
  if (!shown.length) return null;
  const wrap = element('div', 'case-lines');
  wrap.append(...shown.map(text => element('p', `case-line ${tone} ${signTone(text)}`.replace(/\s+/g, ' ').trim(), text)));
  return wrap;
}
function whatToDoLines(item, steps) {
  const lines = textLines(steps);
  if (item.status !== 'no-action' || !lines) return lines;
  for (const line of lines.children) {
    const text = line.textContent;
    if (!text.startsWith('Write "No Change" in the ticket\'s Resolution Notes.')) continue;
    line.replaceChildren('Write "', copyText('No Change', 'Resolution Notes'), text.slice('Write "No Change'.length));
  }
  return lines;
}
const SIGN_TONES = { '✗': 'sign-problem', '⚠': 'attention', '✓': 'sign-fine', '↩': 'sign-info', '⏳': 'sign-info' };
const signTone = text => SIGN_TONES[String(text).trim().charAt(0)] || '';
let openWindow = null;
function closeSmallWindow() {
  const open = openWindow;
  openWindow = null;
  open?.close();
}
function smallWindow(dialog, anchor, onClose = () => {}) {
  closeSmallWindow();
  dialog.classList.add('small-window');
  document.body.append(dialog);
  dialog.show();
  placeBeside(dialog, anchor);
  const outside = event => {
    if (!dialog.contains(event.target) && !anchor.contains(event.target)) closeSmallWindow();
  };
  const keys = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSmallWindow();
      anchor.focus?.();
    }
  };
  document.addEventListener('click', outside, true);
  document.addEventListener('keydown', keys, true);
  openWindow = {
    close() {
      document.removeEventListener('click', outside, true);
      document.removeEventListener('keydown', keys, true);
      dialog.remove();
      onClose();
    },
  };
  return openWindow;
}
const CASE_CONTENT = '.case-identity > *, .case-section .case-label, .case-section .case-line, .done-row, .note-fold > summary, .decided > summary, .tool-head > *';
function placeBeside(dialog, anchor) {
  const view = document.defaultView;
  const width = dialog.offsetWidth;
  const height = dialog.offsetHeight;
  const at = anchor.getBoundingClientRect();
  const clampX = x => Math.max(8, Math.min(x, view.innerWidth - width - 8));
  const clampY = y => Math.max(8, Math.min(y, view.innerHeight - height - 8));
  const spots = [
    { left: clampX(at.right - width), top: clampY(at.bottom + 4) },
    { left: clampX(at.left), top: clampY(at.bottom + 4) },
    { left: clampX(at.right - width), top: clampY(at.top - height - 4) },
    { left: clampX(at.left), top: clampY(at.top - height - 4) },
  ];
  const content = [...document.querySelectorAll(CASE_CONTENT)].filter(node => !node.closest('[hidden]') && !dialog.contains(node))
    .map(node => node.getBoundingClientRect()).filter(box => box.width && box.height);
  const overlap = (spot, box) => Math.max(0, Math.min(spot.left + width, box.right) - Math.max(spot.left, box.left))
    * Math.max(0, Math.min(spot.top + height, box.bottom) - Math.max(spot.top, box.top));
  const cost = spot => content.reduce((sum, box) => sum + overlap(spot, box), 0) + (overlap(spot, at) ? 1e9 : 0);
  const best = spots.reduce((pick, spot) => (cost(spot) < cost(pick) ? spot : pick));
  dialog.style.left = `${best.left}px`;
  dialog.style.top = `${best.top}px`;
}
const COPIED_FIELDS = new Set(['Email', 'Employee ID', 'Termination Date', 'Security', 'Authorization', 'Resource Manager']);
const copiable = (field, value) => COPIED_FIELDS.has(field) && Boolean(value) && (field !== 'Employee ID' || /^\d+$/.test(value));
function noteFlag(notes) {
  const flag = element('button', 'note-flag', '⚠');
  flag.type = 'button';
  flag.title = `${notes.join('\n')}\n(How ${TOOL_NAME} decided ↓)`;
  flag.setAttribute('aria-label', `A note about this line: ${notes.join(' ')}`);
  flag.addEventListener('click', () => {
    const decided = flag.closest('.case-card')?.querySelector('details.decided');
    if (!decided) return;
    decided.open = true;
    const note = [...decided.querySelectorAll('li')].find(item => item.textContent === notes[0]);
    (note || decided).scrollIntoView({ block: 'center' });
  });
  return flag;
}
function changeLine(change) {
  const { field, current, target } = change;
  const line = element('p', 'case-line change-line');
  line.append(element('strong', '', `${field}: `));
  if (copiable(field, target)) {
    if (current && current !== target) line.append(`${current} → `);
    line.append(copyText(target, field));
  } else if (change.display) {
    line.append(change.display);
  } else {
    line.append(current && current !== target ? arrow(current, target) : target || 'blank');
  }
  if (change.notes?.length) line.append(noteFlag(change.notes));
  return line;
}
function dateSensitiveLine(row, note = '') {
  const block = element('div', 'case-line date-sensitive');
  block.append(element('strong', '', 'Date Sensitive row'));
  for (const [label, value] of rowColumns(row)) {
    const line = element('p', 'sub-line');
    line.append(element('strong', '', `${label}: `), label === 'Effective date' && value ? copyText(value, 'effective date')
      : value || (label === 'Shift' ? 'same as the current row' : 'blank'));
    if (label === 'Effective date' && note) line.append(noteFlag([note]));
    block.append(line);
  }
  return block;
}
function changeLines({ changes, dateSensitive, dateNote: note = '' }) {
  return [dateSensitive && dateSensitiveLine(dateSensitive, note), ...changes.map(changeLine)].filter(Boolean);
}
function changesList(lines = []) {
  const list = element('div', 'case-lines');
  list.append(...lines);
  return list;
}
function changesSection(item, list) {
  const { title, informationOnly } = caseChanges(item);
  const section = element('section', `case-section ${informationOnly ? 'information-list' : 'planned-changes'}`);
  const flagged = textLines(caseTop(item).withChanges);
  flagged?.classList.add('flagged-lines');
  section.append(...[element('h4', 'case-label', title), flagged, list].filter(Boolean));
  showChanges(section, list);
  return section;
}
const showChanges = (section, list) => {
  section.hidden = !list.children.length && !section.querySelector('.flagged-lines');
};
function caseBox(...children) {
  const box = element('section', 'case-box');
  box.append(...children.filter(Boolean));
  return box;
}
function doneRow(...buttons) {
  const row = element('div', 'done-row');
  row.append(...buttons.filter(Boolean));
  return row;
}
function statusLine() {
  const line = element('p', 'status-line');
  line.setAttribute('role', 'status');
  line.hidden = true;
  return {
    element: line,
    get text() { return line.textContent; },
    set(text = '', tone = 'neutral') {
      line.textContent = text;
      line.className = 'status-line ' + tone;
      line.hidden = !text;
    },
  };
}
function sessionNote(value, onInput, wrong, onWrong) {
  const fold = element('details', 'note-fold');
  fold.open = Boolean(value || wrong);
  fold.append(element('summary', '', '+ Add a note'));
  const note = element('textarea', 'session-note');
  note.rows = 2;
  note.maxLength = 280;
  note.placeholder = 'A reminder for yourself. Included in the export.';
  note.setAttribute('aria-label', 'Session note');
  note.value = value || '';
  note.addEventListener('input', () => onInput(note.value));
  fold.append(note);
  if (onWrong) fold.append(wrongMark(wrong, onWrong));
  return fold;
}
const WRONG_TITLE = `${TOOL_NAME} was wrong`;
function wrongMark(value, onChange) {
  const label = element('label', `wrong-mark${value ? ' marked' : ''}`);
  label.append(element('span', '', WRONG_TITLE));
  const choose = element('select');
  choose.setAttribute('aria-label', WRONG_TITLE);
  choose.append(element('option', '', value ? 'Not wrong after all' : 'Choose why…'), ...WRONG_REASONS.map(reason => element('option', '', reason)));
  choose.options[0].value = '';
  choose.value = WRONG_REASONS.includes(value) ? value : '';
  choose.addEventListener('change', () => {
    onChange(choose.value);
    label.classList.toggle('marked', Boolean(choose.value));
    choose.options[0].textContent = choose.value ? 'Not wrong after all' : 'Choose why…';
  });
  label.append(choose);
  return label;
}
const DECIDED_TITLE = `How ${TOOL_NAME} decided`;
function howDecidedBox(item) {
  const parts = howDecided(item);
  if (!parts.length) return null;
  const box = element('details', 'decided');
  box.append(element('summary', '', DECIDED_TITLE));
  for (const [title, lines] of parts) {
    const part = element('section', 'decided-part');
    let heading = element('h5', '', title);
    part.append(heading);
    let list = element('ul');
    for (const line of lines) {
      if (line === 'Values used' || line === '(from MySource unless it says otherwise)') {
        if (list.childNodes.length) part.append(list);
        list = element('ul');
        if (line === 'Values used') {
          heading = element('h6', 'values-heading', line);
          part.append(heading);
        } else heading.append(' ', element('span', 'hint', line));
      } else {
        const entry = element('li', signTone(line));
        const dp = item.dp;
        if (title === 'How the DP was found' && dp?.status === 'matched'
          && line === `${dp.name}${dp.email ? ` (${dp.email})` : ''}`) {
          entry.append(copyText(dp.name, 'DP name'));
          if (dp.email) entry.append(' (', copyText(dp.email, 'DP email'), ')');
        } else if (title === 'How the DP was found' && dp?.status === 'fixed' && dp.name && line.includes(dp.name)) {
          const at = line.indexOf(dp.name);
          entry.append(line.slice(0, at), copyText(dp.name, 'DP name'), line.slice(at + dp.name.length));
        } else entry.textContent = line;
        list.append(entry);
      }
    }
    if (list.childNodes.length) part.append(list);
    box.append(part);
  }
  return box;
}
function caseScreen(item, { done, changes, box, note, onNote, wrong = '', onWrong = null, outcome = '', scheduleConfirmed = false, onScheduleConfirmed = null }) {
  const head = element('div', 'case-head');
  const number = element('span', 'ticket-number');
  number.append(item.ticketNumber ? copyText(item.ticketNumber, 'case number') : 'No number');
  const tag = statusTag(item, done, outcome);
  head.append(number, element('span', `badge ${tag.key}`, tag.label));
  const meta = element('p', 'case-meta');
  meta.append(item.email ? copyText(item.email, 'email') : 'No email');
  if (item.employeeId) meta.append(` · Employee ID ${item.employeeId}`);
  else if (item.rosterEmployeeId) meta.append(` · Employee ID ${item.rosterEmployeeId} (roster)`);
  const top = caseTop(item);
  const reasons = caseSection(top.label, whatToDoLines(item, top.lines));
  if (item.status === 'manual') reasons?.classList.add('manual-section');
  const comment = item.comment ? copyText(item.comment, 'comment') : null;
  comment?.classList.add('comment-block');
  const deactivating = item.specialCase === 'deactivation';
  let commentContent = comment;
  if (deactivating && comment) {
    const list = element('ul', 'deactivation-steps');
    const schedule = element('li', 'case-line schedule-step');
    const label = element('label');
    const tick = element('input');
    tick.type = 'checkbox';
    tick.checked = scheduleConfirmed;
    tick.disabled = !onScheduleConfirmed;
    tick.addEventListener('change', () => onScheduleConfirmed?.(tick.checked));
    label.append(tick, ` ${deactivationSchedule(item.effectiveMonday)}`);
    schedule.append(label);
    const commentStep = element('li', 'case-line deactivation-comment');
    commentStep.append('Add in Comments 4: ', comment);
    list.append(schedule, commentStep);
    commentContent = list;
  }
  const commentSection = caseSection(deactivating ? 'Deactivation checklist' : 'Comment to add', commentContent);
  if (!deactivating) commentSection?.querySelector('.case-label').append(' ', element('span', 'hint', '(in Comments 4)'));
  commentSection?.classList.add('comment-to-add', 'comment-waiting');
  if (deactivating) commentSection?.classList.add('deactivation-checklist');
  const identity = element('div', 'case-identity');
  const name = element('h3', 'case-name');
  const who = personName(item);
  name.append(who ? copyText(who, 'name') : 'Unnamed person');
  identity.append(head, name, meta);
  return [
    identity,
    reasons,
    caseSection('What to do', whatToDoLines(item, top.steps)),
    changes,
    commentSection,
    box,
    howDecidedBox(item),
    sessionNote(note, onNote, wrong, onWrong),
  ].filter(Boolean);
}
__exports.element = element;
__exports.button = button;
__exports.copyToClipboard = copyToClipboard;
__exports.textLines = textLines;
__exports.closeSmallWindow = closeSmallWindow;
__exports.smallWindow = smallWindow;
__exports.changeLine = changeLine;
__exports.dateSensitiveLine = dateSensitiveLine;
__exports.changeLines = changeLines;
__exports.changesList = changesList;
__exports.changesSection = changesSection;
__exports.showChanges = showChanges;
__exports.caseBox = caseBox;
__exports.doneRow = doneRow;
__exports.statusLine = statusLine;
__exports.WRONG_TITLE = WRONG_TITLE;
__exports.DECIDED_TITLE = DECIDED_TITLE;
__exports.caseScreen = caseScreen;
},
"screen/case-summary.js": function (__require, __exports, document, window) {
'use strict';
const { manualHeadings } = __require("../rules/rulebook.js");
const { DP_LINE_BREAK, RETURN_DP_FROM, withOutcome } = __require("../rules/checks.js");
const { regionKey, sameValue } = __require("../rules/prepare.js");
const { isConsultingServices } = __require("../rules/facts.js");
const { STEP_BREAK } = __require("./wording.js");
const { deactivationSchedule } = __require("../rules/mappings.js");
const CANNOT_PLAN_STEP = 'Follow the ✗ line above.';
const PROFILE_WORK = new Set(['product', 'deactivation', 'reactivation']);
function personName(item) {
  return item.rosterName || item.profileName || item.subjectPerson || '';
}
function opensReview(item) {
  if (item.deadEnd) return true;
  if (item.pendingCostCenterDescription && !item.deadEnd && !item.cannotPlan && item.status !== 'later') return true;
  if (item.status === 'ready' || item.status === 'no-action') return true;
  return item.status === 'manual' && !item.cannotPlan && !item.manualReasons.includes('not-updated')
    && (PROFILE_WORK.has(item.specialCase) || Boolean(item.employeeId));
}
const END_POINTS = { action: 'Action', deactivation: 'Deactivation', 'by-hand': 'By hand', later: 'Later', 'no-action': 'No action' };
function endPoint(item) {
  if (item.deadEnd) return 'by-hand';
  if (item.status === 'later') return 'later';
  if (item.status === 'no-action') return 'no-action';
  if (item.status === 'ready') return item.specialCase === 'deactivation' ? 'deactivation' : 'action';
  const reasons = item.cannotPlan ? [] : item.manualReasons || [];
  if (reasons.includes('not-updated')) return 'later';
  if (reasons.includes('reactivation')) return 'action';
  return 'by-hand';
}
const LATER_HEADINGS = ['Date to come', 'Waiting for MySource'];
const laterHeading = item => (item.status === 'later' ? LATER_HEADINGS[0] : LATER_HEADINGS[1]);
function endPointDetail(item) {
  if (item.deadEnd) return 'Dead end';
  const end = endPoint(item);
  if (end === 'later') return item.status === 'later' ? '' : LATER_HEADINGS[1];
  return item.status === 'manual' ? manualHeadings(item).join(' · ') : '';
}
const TAG_KEYS = { action: 'ready', deactivation: 'deactivation', 'by-hand': 'manual', later: 'later', 'no-action': 'no-action' };
function statusTag(item, done = false, outcome = '') {
  if (item.status === 'later') return { key: 'later', label: END_POINTS.later };
  if (done) return { key: 'done', label: 'Done' + (outcome ? ` (${outcome})` : '') };
  if (item.pendingCostCenterDescription) return { key: 'manual', label: 'Pending' };
  const end = endPoint(item);
  return { key: TAG_KEYS[end], label: END_POINTS[end] };
}
function manualReasons(item) {
  return manualHeadings(item);
}
function caseHeading(item) {
  const detail = endPointDetail(item);
  return detail ? `${END_POINTS[endPoint(item)]} · ${detail}` : '';
}
function noteText(note) {
  if (!note.field) return note.text;
  const mySource = note.notUpdated ? 'MySource still' : 'MySource';
  return `${note.field}: ${mySource} ${note.current || 'blank'} → ${note.source === 'roster' ? 'roster' : 'ticket'} ${note.target || 'blank'}${note.expected ? ` (${note.expected})` : ''}`;
}
function differences(item) {
  return item.notes.filter(note => note.field && !note.expected).map(noteText);
}
function nextStep(item) {
  if (item.deadEnd) {
    const why = item.notes.map(noteText).filter(Boolean).join(' · ') || item.whatToDo || 'No supported profile work';
    return `Dead end: ${why.replace(/^[✓\s]+/, '')} → nothing to do in MySource`;
  }
  if (item.specialCase === 'deactivation') return `${item.whatToDo} Confirm the schedule step: ${deactivationSchedule(item.effectiveMonday)} Add in Comments 4: ${item.comment}`;
  return item.cannotPlan ? CANNOT_PLAN_STEP : item.whatToDo;
}
function whatToDo(item) {
  if (item.pendingCostCenterDescription) return nextStep(item);
  if (item.specialCase === 'deactivation') return item.whatToDo;
  return item.status === 'ready' && item.specialCase !== 'deactivation' ? '' : nextStep(item);
}
function caseChanges(item) {
  if (item.pendingCostCenterDescription) return { title: 'Changes to make', informationOnly: false, changes: [], dateSensitive: null, dateNote: dateNote(item) };
  const manual = item.status === 'manual' && !item.deadEnd;
  const information = manual ? item.information || {} : null;
  const informationOnly = manual && !item.changesApply;
  return {
    title: informationOnly ? 'For information — do not apply' : 'Changes to make',
    informationOnly,
    changes: manual ? information.changes || [] : item.status === 'later' ? item.corrections : item.changes,
    dateSensitive: (manual ? information.dateSensitiveRow : item.dateSensitiveRow) || null,
    dateNote: dateNote(item),
  };
}
const onItsLine = note => note.answersTheMissingDate;
function attention(item) {
  const step = whatToDo(item);
  return [
    ...item.blockers,
    ...[...item.notes, ...item.planNotes].filter(note => !note.aside && !onItsLine(note) && !(note.field && !note.expected)).map(noteText),
  ].filter(line => line !== step);
}
const isWarning = line => /^\s*[⚠✗]/.test(line);
const warnings = item => attention(item).filter(isWarning);
const dateNote = item => (item.planNotes || []).find(note => note.answersTheMissingDate)?.text || '';
function stepLines(text) {
  const lines = String(text || '').split(STEP_BREAK).flatMap(part => part.split(/\s+(?=\d+\.\s)|\s+(?=⏳\s)/)).filter(Boolean);
  return lines.filter(line => /^\d+\.\s/.test(line)).length === 1 ? lines.map(line => line.replace(/^1\.\s+/, '')) : lines;
}
const BY_HAND_ONLY = line => /^Handle this case by hand\.?$/.test(line) || /→ handle this case by hand\.?$/.test(line);
function caseTop(item) {
  const steps = stepLines(whatToDo(item));
  if (item.status !== 'manual') {
    const flagged = [...warnings(item)];
    return steps.length ? { label: 'What to do', lines: [...flagged, ...steps], steps: [], tucked: [], withChanges: [] }
      : { label: '', lines: [], steps: [], tucked: [], withChanges: flagged };
  }
  const flagged = [...differences(item), ...warnings(item)];
  let label = endPointDetail(item);
  if (flagged.length) label = label.replace(/:.*$/, '');
  if (label === 'Profile not matched' && flagged.some(line => /^✗/.test(line))) label = '';
  const howTo = steps.filter(line => !BY_HAND_ONLY(line));
  if (!flagged.length) return { label, lines: howTo, steps: [], tucked: [], withChanges: [] };
  const pointsOn = flagged.filter(line => /^✗/.test(line)).every(line => line.includes('→'));
  return { label, lines: flagged, steps: pointsOn ? [] : howTo, tucked: pointsOn ? howTo : [], withChanges: [] };
}
const DP_STATES = {
  not_applicable: 'Not used',
  not_yet: 'Not looked up yet: MySource still shows the old values',
};
function dpExplanation(dp) {
  if (!dp) return '';
  if (DP_STATES[dp.status]) return DP_STATES[dp.status];
  return withOutcome(dp.status, dp.summary);
}
const PLAIN_WHY = {
  action: 'Action · the profile needs the changes at the top',
  deactivation: 'Deactivation · the steps at the top take the profile out of Consulting Services',
  'no-action': 'No action · MySource shows everything the ticket and the rules ask for',
};
const USED_ORDER = ['Business', 'Practice', 'Business Area', 'Business Line', 'Talent Group', 'Talent Sub Group', 'Cost Center', 'Cost Center Description',
  'Position Title', 'Level', 'New level', 'Level Group', 'Region', 'Hire Type', 'Department', 'Active'];
const usedRank = entry => (USED_ORDER.includes(entry.field) ? USED_ORDER.indexOf(entry.field) : USED_ORDER.length);
function howDecided(item) {
  const said = differences(item);
  const topSaysIt = item.status === 'manual' || (item.deadEnd && !item.notes.length);
  const plain = !caseHeading(item) && item.status !== 'later' && !item.deadEnd;
  const why = topSaysIt || (plain && !said.length) ? [] : [
    item.status === 'later' ? `${END_POINTS.later} · ${LATER_HEADINGS[0]} (${item.effectiveMonday || 'the effective date'})`
      : item.deadEnd ? `${END_POINTS['by-hand']} · Dead end: nothing to do in MySource` : PLAIN_WHY[endPoint(item)],
    ...said,
  ];
  const explained = dpExplanation(item.dp);
  const returnLookup = explained.startsWith(RETURN_DP_FROM);
  const matchLines = explained ? explained.slice(returnLookup ? RETURN_DP_FROM.length : 0).split(DP_LINE_BREAK) : [];
  const dp = item.dp?.status === 'matched' && item.dp.name
    ? [...(returnLookup ? [RETURN_DP_FROM.trim()] : []),
      ...matchLines.filter(line => line.match(/^[^\n]+ sheet, row \d+: the row that fits → (.*)\.$/u)?.[1] !== item.dp.name),
      `${item.dp.name}${item.dp.email ? ` (${item.dp.email})` : ''}`]
    : explained ? explained.split(DP_LINE_BREAK) : [];
  const written = (field, value) => (field === 'Business' && isConsultingServices(value) ? 'Consulting Services' : value);
  const entries = [...(item.used || [])];
  for (const [field, value] of Object.entries(item.dp?.trail?.key || {})) {
    if (!entries.some(entry => entry.field === field)) entries.push({ field, value, from: 'MySource' });
  }
  const used = entries.filter(entry => !(entry.field === 'Major/Minor' && (item.dp?.trail?.sheet === 'USI' || regionKey(item.used?.find(value => value.field === 'Region')?.value) === 'us-usi'))).sort((one, two) => usedRank(one) - usedRank(two))
    .map(({ field, value, from, was }) => `${field}: ${written(field, value) || 'blank'}${from && from !== 'MySource' ? ` (${from})` : ''}${was && !sameValue(field, was, value) ? ` (was ${written(field, was)})` : ''}`);
  const other = [
    ...[dateNote(item)].filter(Boolean),
    ...attention(item).filter(line => !isWarning(line)),
    ...[...item.notes, ...(item.planNotes || [])].filter(note => note.aside).map(noteText),
  ];
  return [
    ['What to do', caseTop(item).tucked],
    ['Why this case', why],
    [dp.length ? 'How the DP was found' : 'Values used', [...dp, ...(used.length ? [...(dp.length ? ['Values used'] : []), '(from MySource unless it says otherwise)', ...used] : [])]],
    ['Other notes', other],
  ].filter(([, lines]) => lines.length);
}
function allNotes(item) {
  const step = nextStep(item);
  return [
    ...item.notes.map(noteText),
    ...item.planNotes.filter(note => !note.aside).map(noteText),
    ...item.blockers,
  ].filter(line => line !== step);
}
__exports.personName = personName;
__exports.opensReview = opensReview;
__exports.END_POINTS = END_POINTS;
__exports.endPoint = endPoint;
__exports.LATER_HEADINGS = LATER_HEADINGS;
__exports.laterHeading = laterHeading;
__exports.endPointDetail = endPointDetail;
__exports.statusTag = statusTag;
__exports.manualReasons = manualReasons;
__exports.caseHeading = caseHeading;
__exports.differences = differences;
__exports.nextStep = nextStep;
__exports.whatToDo = whatToDo;
__exports.caseChanges = caseChanges;
__exports.attention = attention;
__exports.warnings = warnings;
__exports.dateNote = dateNote;
__exports.stepLines = stepLines;
__exports.caseTop = caseTop;
__exports.dpExplanation = dpExplanation;
__exports.howDecided = howDecided;
__exports.allNotes = allNotes;
},
"files/export.js": function (__require, __exports, document, window) {
'use strict';
const { csvCell } = __require("../common.js");
const { RULES_DATE } = __require("../rules/mappings.js");
const { oneLine } = __require("../rules/checks.js");
const { allNotes, caseChanges, dpExplanation, endPointDetail, laterHeading, nextStep, statusTag } = __require("../screen/case-summary.js");
const { rowColumns } = __require("../screen/wording.js");
const HEADERS = [
  'Ticket Number', 'Subject Person', 'Email', 'Kind of Change', 'Status', 'Why',
  'Changes to Make', 'Effective Monday', 'Ticket Came Through', 'Profile Values',
  'DP Name', 'DP Email', 'DP Mapping', 'Flags', 'Corrections', 'Date Sensitive Row',
  'Found on the Page', 'Next Step', 'Source File', 'Source Row', 'Session Note', 'Values Used',
  'Shuffle Was Wrong',
];
const usedCell = item => (item.used || []).map(({ field, value, from, was }) => `${field}: ${value} (${from}${was ? `; was ${was}` : ''})`).join(' | ');
function checkSummary(tally) {
  if (!tally.total) return 'Not required';
  return `${tally.pass}/${tally.total}${tally.missing.length ? `; ${tally.missing.join(' | ')}` : ''}`;
}
function changesCell(item) {
  const { changes, informationOnly } = caseChanges(item);
  const listed = item.status === 'ready' && !item.changes.length ? item.corrections : changes;
  const text = listed.map(change => `${change.field}: ${change.check === 'absent' ? change.display : change.target || 'blank'}`).join(' | ');
  return text && informationOnly ? `For information: ${text}` : text;
}
const dpMappingCell = dp => oneLine(dpExplanation(dp));
function dateSensitiveCell(item) {
  const { dateSensitive: row, informationOnly } = caseChanges(item);
  if (!row) return '';
  const text = rowColumns(row).map(([label, value]) => `${label} ${value}`).join(' · ');
  return informationOnly ? `For information: ${text}` : text;
}
function statusCell(item, { done, outcomes, skipped }) {
  if (!done.has(item.key) && skipped.has(item.key)) return 'Skipped';
  const { key, label } = statusTag(item, done.has(item.key), outcomes.get(item.key) || '');
  return key === 'later' ? `${label}: ${laterHeading(item)}` : label;
}
function worklistRows({ cases, done = new Set(), outcomes = new Map(), skipped = new Set(), notes = new Map(), findings = new Map(), wrong = new Map() }) {
  cases = cases.map(item => ({ corrections:[], changes:[], notes:[], planNotes:[], blockers:[], used:[], checks:{ticket:{total:0},profile:{total:0}}, dp:null, ...item }));
  const rows = cases.map(item => [
    item.ticketNumber,
    item.subjectPerson,
    item.email,
    item.scenario,
    statusCell(item, { done, outcomes, skipped }),
    endPointDetail(item),
    item.status === 'ready' ? 'Yes' : 'No',
    item.effectiveMonday || '',
    checkSummary(item.checks.ticket),
    checkSummary(item.checks.profile),
    item.dp?.name,
    item.dp?.email,
    dpMappingCell(item.dp),
    allNotes(item).join(' | '),
    changesCell(item),
    dateSensitiveCell(item),
    findings.get(item.key) || '',
    oneLine(nextStep(item)),
    item.sourceFile,
    item.sourceRow,
    notes.get(item.key) || '',
    usedCell(item),
    wrong.get(item.key) || '',
  ]);
  const metadata = [['Ruleset version', RULES_DATE.replaceAll('-', '.')], ['Export scope', 'worklist']];
  return [...metadata, [], HEADERS, ...rows];
}
function worklistCsv(batch) {
  return `\uFEFF${worklistRows(batch).map(row => row.map(csvCell).join(',')).join('\r\n')}`;
}
function downloadWorklistCsv(batch) {
  downloadCsv(worklistCsv(batch), `shuffle-${new Date().toISOString().slice(0, 10)}.csv`);
}
function downloadCsv(text, fileName) {
  downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), fileName);
}
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
__exports.worklistRows = worklistRows;
__exports.worklistCsv = worklistCsv;
__exports.downloadWorklistCsv = downloadWorklistCsv;
__exports.downloadCsv = downloadCsv;
__exports.downloadBlob = downloadBlob;
},
"files/run-workbook.js": function (__require, __exports, document, window) {
'use strict';
const { worklistRows } = __require("./export.js");
const { endPoint } = __require("../screen/case-summary.js");
const { DEACTIVATED_ALREADY } = __require("../rules/gates.js");
const { xlsxBytes } = __require("./xlsx-writer.js");
const person = item => item.rosterName || item.profileName || item.subjectPerson || '';
const mailEligible = (item, record) => record?.state === 'done'
  && (record.manual || record.mailConfirmed)
  && endPoint(item) !== 'no-action' && item.specialCase !== 'deactivation'
  && !(item.notes || []).some(note => note.text?.startsWith(DEACTIVATED_ALREADY));
function runMail(item, record, context = {}, signOff = '') {
  if (!mailEligible(item, record)) return null;
  const to = item.dp?.status === 'matched' ? item.dp.email || '' : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !signOff.trim() || !person(item) || !item.ticketNumber) return null;
  let body;
  if (context.newProfile) {
    if (!context.source || !context.destination) return null;
    body = `The profile has been created in ${context.destination}, following the transfer from ${context.source}. The ${context.source} profile will be deactivated after the transfer effective date.\n\nPlease let us know if anything changes.`;
  } else {
    if (!context.notificationText) return null;
    body = `${context.notificationText}\n\nThe changes are now reflected in MySource. Please let us know if you have any concerns.`;
  }
  return { to, subject: `${item.ticketNumber} Deployment RMIS Request - System Updates for ${person(item)}`,
    body: `Hi Deployment Professional,\n\n${body}\n\nBest regards,\n${signOff}` };
}
function ticketMailContext(ticket) {
  const description = String(ticket?.Description ?? '');
  const source = /^Operating Model:[ \t]*(.*)$/m.exec(description)?.[1].replace(/\r$/, '') || '';
  const destination = /^Future Operating Model:[ \t]*(.*)$/m.exec(description)?.[1].replace(/\r$/, '') || '';
  return { notificationText: description, source, destination,
    newProfile: Boolean(source && destination && source.replace(/^\d+\s*-\s*/, '').trim().toLowerCase() !== destination.replace(/^\d+\s*-\s*/, '').trim().toLowerCase()) };
}
function runSheets({ cases, results = new Map(), contexts = new Map(), signOff = '', done = null, outcomes = new Map(), ...worklist }) {
  const marks = done || new Set(cases.filter(item => { const record=results.get(item.key); return record?.state==='done' && (record.manual || record.confirmed); }).map(item=>item.key));
  const summary = [['Ticket','Person','Result','Mail recipient','Mail details']];
  const mails = [['Ticket','To','Subject','Mail']];
  const batch = [['Ticket','Person','Email','Result','What was done','Resolution notes','Reason']];
  const attention = [['Ticket','Person','Result','Reason']];
  for (const item of cases) {
    const record = done?.has(item.key) ? { ...results.get(item.key), state:'done', manual:true, outcome:outcomes.get(item.key) || '' } : (done && results.get(item.key)?.state==='done' ? {state:'not-run',reason:'Reopened; not Done.'} : results.get(item.key)) || { state: 'not-run', reason: item.manualReasons?.join('; ') || 'Not run' };
    const proved = record.state === 'done' && record.confirmed;
    const result = record.state === 'done' ? record.manual ? `Done${record.outcome ? ` (${record.outcome})` : ''}` : proved ? 'Done' : 'Unproved Done' : record.state === 'by-hand' ? 'By hand' : record.state;
    const mail = runMail(item, record, contexts.get(item.key), signOff);
    const missing = mailEligible(item, record) && !mail
      ? 'Mail not made: check Deployment Professional Resource Manager email, ticket notification, source/destination and sign-off.' : '';
    const reason = [record.reason, missing].filter(Boolean).join('; ');
    summary.push([item.ticketNumber,person(item),result,mail?.to || '',mail?.body || missing]);
    if (mailEligible(item, record)) mails.push([item.ticketNumber,mail?.to || '',mail?.subject || '',mail?.body || '']);
    batch.push([item.ticketNumber,person(item),item.email,result,record.what || '',
      record.state === 'done' && endPoint(item) === 'no-action' ? 'No Change' : record.resolution || '',reason]);
    if ((!proved && !record.manual) || reason || record.outcome) attention.push([item.ticketNumber,person(item),result,reason || record.outcome || 'No proved outcome']);
  }
  return [{ name:'Summary',rows:summary }, { name:'Mails',rows:mails }, { name:'Batch',rows:batch }, { name:'Needs attention',rows:attention }, { name:'Worklist',rows:worklistRows({cases,done:marks,outcomes,...worklist}) }];
}
const runWorkbook = batch => xlsxBytes(runSheets(batch));
function downloadRunWorkbook(batch, download) {
  download(new Blob([runWorkbook(batch)], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `shuffle-run-${new Date().toISOString().replace(/[:.]/g,'-')}.xlsx`);
}
__exports.runMail = runMail;
__exports.ticketMailContext = ticketMailContext;
__exports.runSheets = runSheets;
__exports.runWorkbook = runWorkbook;
__exports.downloadRunWorkbook = downloadRunWorkbook;
},
"screen/confirm.js": function (__require, __exports, document, window) {
'use strict';
const { closeSmallWindow, element, smallWindow } = __require("./case-view.js");
let asking = false;
function choice(label, className, data = '') {
  const node = element('button', className, label);
  node.type = 'button';
  if (data) node.setAttribute(`data-${data}`, '');
  return node;
}
function ask(dialog, { stay, go, anchor = null }) {
  asking = true;
  const previousFocus = document.activeElement;
  return new Promise(resolve => {
    let answered = false;
    const finish = answer => {
      if (answered) return;
      answered = true;
      asking = false;
      if (!anchor) {
        dialog.remove();
        previousFocus?.focus();
      }
      resolve(answer);
    };
    if (anchor) {
      smallWindow(dialog, anchor, () => finish(false));
      stay.addEventListener('click', () => closeSmallWindow(), { once: true });
      go.addEventListener('click', () => {
        finish(true);
        closeSmallWindow();
      }, { once: true });
    } else {
      document.body.append(dialog);
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        finish(false);
      }, { once: true });
      stay.addEventListener('click', () => finish(false), { once: true });
      go.addEventListener('click', () => finish(true), { once: true });
      dialog.showModal();
    }
    stay.focus();
  });
}
function confirmDiscard({ title = 'Discard this batch?', exportCsv, anchor = null } = {}) {
  if (asking) return Promise.resolve(false);
  const dialog = element('dialog', 'discard-dialog');
  dialog.setAttribute('aria-labelledby', 'discard-title');
  const keep = choice('Keep working', 'button', 'keep');
  keep.setAttribute('autofocus', '');
  const exportButton = choice('Download workbook', 'button secondary', 'export');
  exportButton.hidden = !exportCsv;
  const discard = choice('Discard', 'button danger', 'discard');
  const actions = element('div', 'actions');
  actions.append(keep, exportButton, discard);
  const heading = element('h2', '', title);
  heading.id = 'discard-title';
  const status = element('p', 'notice');
  status.setAttribute('data-status', '');
  status.setAttribute('role', 'status');
  dialog.append(
    heading,
    element('p', '', 'Unfinished cases and session progress may be lost.'),
    element('p', 'notice', 'The export includes case results, review status and notes.'),
    actions,
    status,
  );
  exportButton.addEventListener('click', () => {
    try {
      exportCsv();
      status.textContent = 'Download requested. Check the file before choosing Discard.';
    } catch {
      status.textContent = 'Export failed. Keep working and try again.';
    }
  });
  return ask(dialog, { stay: keep, go: discard, anchor });
}
function confirmClose({download}) {
  if(asking)return Promise.resolve('cancel');
  asking=true;
  const dialog=element('dialog','discard-dialog'),heading=element('h2','','Close Shuffle?');heading.id='close-title';dialog.setAttribute('aria-labelledby',heading.id);
  const actions=element('div','dialog-choices'),save=choice('Download workbook','button secondary','export'),reset=choice('Start over','button danger','reset'),close=choice('Close Shuffle','button danger','discard'),cancel=choice('Cancel','button','keep');
  const status=element('p','notice');status.dataset.status='';status.setAttribute('role','status');
  actions.append(save,reset,close,cancel);dialog.append(heading,element('p','','This batch will be lost unless you download the workbook.'),actions,status);
  const previous=document.activeElement;
  return new Promise(resolve=>{
    const finish=value=>{asking=false;dialog.remove();previous?.focus();resolve(value);};
    save.addEventListener('click',()=>{try{download();status.textContent='Download requested. Check the workbook before closing.';}catch{status.textContent='Download failed. Cancel and try again.';}});
    reset.addEventListener('click',()=>finish('start-over'));close.addEventListener('click',()=>finish('close'));cancel.addEventListener('click',()=>finish('cancel'));
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish('cancel');});document.body.append(dialog);dialog.showModal();cancel.focus();
  });
}
function askAboutCase({ id, title, name, ticket, lines, safe, go }) {
  if (asking) return Promise.resolve(false);
  const dialog = element('dialog', 'discard-dialog');
  dialog.setAttribute('aria-labelledby', id);
  const stay = choice(safe, 'button', 'not-yet');
  stay.setAttribute('autofocus', '');
  const confirm = choice(go, 'button primary', 'confirm');
  const actions = element('div', 'dialog-choices');
  actions.append(stay, confirm);
  const heading = element('h2', '', title);
  heading.id = id;
  const who = element('p', 'deactivation-who');
  who.append(element('strong', '', name || 'Unnamed person'), ` · ${ticket || 'No ticket number'}`);
  dialog.append(heading, who, ...lines.map(([text, className]) => element('p', className || '', text)), actions);
  return ask(dialog, { stay, go: confirm });
}
function confirmReturn({ name, ticket, reasons = [] }) {
  return askAboutCase({
    id: 'return-title',
    title: 'Mark this return done?',
    name,
    ticket,
    lines: [
      ['Confirm that the profile open in MySource is this person\'s old profile, and that you reactivated it and pressed Save.'],
      ...reasons.map(reason => [reason, 'notice']),
    ],
    safe: 'Not yet',
    go: 'Mark it done',
  });
}
function confirmDoneAnyway({ name, ticket, reasons }) {
  return askAboutCase({
    id: 'done-anyway-title',
    title: 'Mark done anyway?',
    name,
    ticket,
    lines: [
      ...reasons.map(reason => [reason]),
      ['The export records that it was marked done anyway.', 'notice'],
    ],
    safe: 'Keep working',
    go: 'Mark done anyway',
  });
}
__exports.confirmDiscard = confirmDiscard;
__exports.confirmClose = confirmClose;
__exports.confirmReturn = confirmReturn;
__exports.confirmDoneAnyway = confirmDoneAnyway;
},
"rules/rulebook.js": function (__require, __exports, document, window) {
'use strict';
const { withoutPlaceholders } = __require("./prepare.js");
const { manualHeadings, manualOrder } = __require("./facts.js");
const { matchRoster, rosterByEmail } = __require("./collate.js");
const { fieldWithoutRule, rosterById, screenCase, sortTickets, takenIn } = __require("./gates.js");
const { addDpAssignments, checkCase, levelGroupsIn, pageChecksFor, planFor } = __require("./checks.js");
const { NO_DATE_FOUND } = __require("../screen/wording.js");
function classify(row, facts) {
  const screened = screenCase(row, facts);
  if (screened.end) return screened.end;
  const taken = takenIn(facts, screened.context);
  return checkCase(facts, screened.context, taken);
}
const EMPTY_MAPPING = { fileName: '', sheets: { US: [], USI: [] }, headers: {}, rowCount: 0 };
function checkTickets({ tickets, profiles, dpMapping, roster, asOfDate = new Date(), pageDescriptions = null }) {
  const exported = profiles.map(withoutPlaceholders);
  const byEmail = rosterByEmail(roster || []);
  const decide = pageDescriptions ? (row, facts) => classify(row, { ...facts, pageDescription: pageDescriptions.get(row.Number) || '' }) : classify;
  const items = addDpAssignments(sortTickets(tickets, exported, asOfDate, byEmail, decide, pageDescriptions), dpMapping || EMPTY_MAPPING);
  return worklistItems(items, asOfDate, levelGroupsIn(profiles), { byEmail, byId: rosterById(byEmail) });
}
function rosterIdentity(person, item) {
  if (!person) return {};
  return {
    ...(person.name ? { rosterName: person.name } : {}),
    ...(!item.employeeId && person.employeeId ? { rosterEmployeeId: person.employeeId } : {}),
  };
}
function worklistItems(items, asOfDate, levelGroups, people = {}) {
  const onRoster = item => matchRoster(people.byEmail, item.email, { Empid: item.employeeId });
  const numbers = new Map();
  for (const item of items) numbers.set(item.ticketNumber, (numbers.get(item.ticketNumber) || 0) + 1);
  return items.map((item, index) => {
    const plan = planFor(item, asOfDate);
    const status = item.sorted === 'later' ? 'later'
      : item.sorted === 'manual' || plan.blockers.length || plan.blockedBy?.length ? 'manual'
        : plan.changes.length || plan.dateSensitiveRow ? 'ready'
          : 'no-action';
    return {
      key: item.ticketNumber && numbers.get(item.ticketNumber) === 1 ? item.ticketNumber : `${item.ticketNumber}::${item.sourceRow}`,
      ticketNumber: item.ticketNumber,
      subjectPerson: item.subjectPerson,
      profileName: item.profileName,
      ...rosterIdentity(onRoster(item), item),
      email: item.email,
      ...(item.profileEmail ? { profileEmail: item.profileEmail } : {}),
      employeeId: item.employeeId,
      status,
      cannotPlan: status === 'manual' && item.sorted !== 'manual',
      manualReasons: item.manualReasons || [],
      specialCase: item.specialCase || '',
      ...(item.pendingCostCenterDescription ? { pendingCostCenterDescription: true } : {}),
      ...(item.watchCostCenterDescription ? { checkCostCenterDescription: true } : {}),
      deadEnd: Boolean(item.deadEnd),
      scenario: item.scenario,
      whatToDo: `${item.pendingCostCenterDescription ? 'Cost Center Description not known yet - open the right profile; the page check reads it.' : status === 'ready' && !item.specialCase ? 'Make the changes listed.'
        : item.whatToDo}${alsoCloseStep(item)}`,
      ...(item.alsoClose ? { alsoClose: item.alsoClose } : {}),
      ...(item.closedWith ? { closedWith: item.closedWith } : {}),
      comment: item.comment || '',
      notes: (plan.planNotes.some(note => note.answersTheMissingDate) ? item.notes.filter(note => !note.aboutTheMissingDate) : item.notes)
        .map(note => (status === 'no-action' && !item.deadEnd && note.text === NO_DATE_FOUND ? { text: 'No effective date on the ticket: not needed, as nothing changes', aside: true } : note)),
      corrections: item.corrections,
      ...plan,
      pageChecks: pageChecksFor(item, asOfDate, levelGroups),
      checks: item.checks,
      dp: item.dp,
      used: item.used || [],
      effectiveMonday: item.effectiveMonday,
      ticketEffectiveDate: item.ticketEffectiveDate,
      sourceFile: item.sourceFile,
      sourceRow: item.sourceRow,
    };
  });
}
function alsoCloseStep(item) {
  if (!item.alsoClose?.length) return '';
  const tickets = item.alsoClose.map(({ number, date }) => `${number} (effective ${date})`).join(', ');
  return ` Also close ${tickets} with this one: ${item.alsoClose.length === 1 ? 'an older ticket' : 'older tickets'} for them.`;
}
__exports.fieldWithoutRule = fieldWithoutRule;
__exports.manualHeadings = manualHeadings;
__exports.manualOrder = manualOrder;
__exports.checkTickets = checkTickets;
},
"rules/facts.js": function (__require, __exports, document, window) {
'use strict';
const { descriptionToText, normalizeText, withoutLeadingCode } = __require("../rules.js");
const { AUDIT_ASSURANCE_AREAS, CANNOT_PLAN_GROUP, CONSULTING_DEPARTMENT, CONSULTING_SERVICES_BUSINESS, CONSULTING_SHIFT, DATE_SENSITIVE_LEVEL_OPTIONS, DP_MAPPING_KEY, DP_MAPPING_QUALIFIERS, MANUAL_GROUPS, MANUAL_REASONS, mySourceName, PRODUCT_DEPARTMENT, PRODUCT_DEPARTMENT_CODE, UNSUPPORTED_BUSINESSES } = __require("./mappings.js");
const { compareTicketText, emailKey } = __require("./prepare.js");
const { CLOSING_BUSINESS_AREA } = __require("./mappings.js");
const { plainTicketNote, ticketSaysNoDate, TWO_WAYS, UNUSED_TICKET_LINE } = __require("../screen/wording.js");
const MAPPING_COLUMNS = [...DP_MAPPING_KEY, ...DP_MAPPING_QUALIFIERS].filter(field => field !== 'Level1');
const rosterEmployeeId = roster => (roster?.employeeId && roster.employeeId.length >= 6 ? roster.employeeId : '');
const rosterFlag = (field, ticketValue, rosterValue) => ({ text: `${field}: ticket "${ticketValue}" · roster "${rosterValue}" → the roster's is used`, aside: true });
function ticketNoteList(texts) {
  const shown = texts.filter(Boolean);
  const unused = shown.filter(text => text.startsWith(UNUSED_TICKET_LINE)).map(text => text.slice(UNUSED_TICKET_LINE.length));
  return [
    ...shown.filter(text => !text.startsWith(UNUSED_TICKET_LINE)).map(text => ({ text })),
    ...(unused.length ? [{ text: `Ticket lines not used: ${unused.join(', ')}`, aside: true }] : []),
  ];
}
function baseRecord(row, ticket, profile = null) {
  const unreadableDate = unreadableStatedDate(row.Description, ticket.transferEffectiveDate);
  return {
    ticketNumber: row.Number || '',
    subjectPerson: row['Subject person'] || '',
    profileName: profile?.Professional || '',
    email: ticket.email || '',
    employeeId: profile?.Empid || '',
    currentResourceManager: profile?.['Resource Manager'] || '',
    currentLevel: profile?.Level || '',
    currentTermDate: profile?.['Term Date'] || '',
    region: profile?.Region || '',
    mappingValues: profile ? { ...Object.fromEntries(MAPPING_COLUMNS.map(field => [field, profile[field] || ''])), 'Office Location': profile.Location || '' } : null,
    hireType: profile?.['Hire Type'] || '',
    positionTitle: profile?.['Position Title'] || '',
    ticketEffectiveDate: ticket.transferEffectiveDate || '',
    effectiveMonday: ticket.phase3EffectiveDate || '',
    sourceFile: row.__file || '',
    sourceRow: row.__row || '',
    ticketNotes: ticket.warnings.map(warning => (unreadableDate && ticketSaysNoDate(warning) ? '' : plainTicketNote(warning))),
    noDateStated: !unreadableDate && ticket.warnings.some(ticketSaysNoDate),
    twoWaysDate: ticket.warnings.some(warning => TWO_WAYS.test(warning)),
    unreadableDate,
  };
}
function returnMappingValues({ fields, profile }, roster = null) {
  const ticketSays = Object.fromEntries(Object.values(fields).filter(field => field.to).map(field => [field.column, withoutLeadingCode(field.to).trim()]));
  const value = column => (column === 'Major/Minor' ? trimmed(profile?.[column])
    : trimmed(roster?.values[column]) || ticketSays[column] || trimmed(profile?.[column]));
  return {
    ...Object.fromEntries(MAPPING_COLUMNS.map(column => [column, value(column)])),
    'Office Location': trimmed(roster?.location) || trimmed(profile?.Location),
  };
}
function unreadableStatedDate(description, statedDate) {
  if (statedDate) return '';
  const match = /transfer\s+effective\b[^\S\n]*([^\n]*?)[^\S\n]*(?:\bhas\s+been\s+processed\b|$)/im.exec(descriptionToText(description));
  const written = match ? match[1].replace(/[\s:.,;]+$/, '').trim() : '';
  return /[a-z0-9]/i.test(written) ? written : '';
}
const KIND = { level: 'Level change', move: 'Move', none: 'No change', deactivation: 'Deactivation', manual: 'Manual' };
const NO_CHECKS = { ticket: { total: 0, pass: 0, missing: [] }, profile: { total: 0, pass: 0, missing: [] } };
function manualRecord(base, reason, note, whatToDo) {
  const { ticketNotes, noDateStated, ...record } = base;
  return {
    ...record,
    scenario: KIND.manual,
    sorted: 'manual',
    manualReasons: [reason],
    corrections: [],
    notes: [{ text: note }, ...ticketNoteList(ticketNotes)],
    whatToDo: whatToDo || 'Handle this case by hand.',
    checks: NO_CHECKS,
  };
}
function manualHeadings(item) {
  if (item.deadEnd) return ['Dead end'];
  const byGroup = new Map();
  for (const code of item.manualReasons || []) {
    const reason = MANUAL_REASONS[code] || { group: code };
    if (!byGroup.has(reason.group)) byGroup.set(reason.group, []);
    if (reason.detail) byGroup.get(reason.group).push(reason.detail);
  }
  if (!byGroup.size) return [`${CANNOT_PLAN_GROUP}: ${cannotPlanDetail(item)}`];
  return [...byGroup].map(([group, details]) => (details.length ? `${group}: ${details.join(', ')}` : group));
}
const CANNOT_PLAN_DETAIL = { date: 'Effective date not usable', level: 'No Date Sensitive Level option', row: 'Date Sensitive row not worked out' };
function cannotPlanDetail(item) {
  return CANNOT_PLAN_DETAIL[(item.blockedBy || [])[0]] || 'Plan not possible';
}
function manualOrder(item) {
  if (item.deadEnd) return MANUAL_GROUPS.length;
  const codes = item.manualReasons || [];
  const groups = codes.length ? codes.map(code => MANUAL_REASONS[code]?.group) : [CANNOT_PLAN_GROUP];
  return Math.min(...groups.map(group => {
    const index = MANUAL_GROUPS.indexOf(group);
    return index < 0 ? MANUAL_GROUPS.length : index;
  }));
}
function correction(field, current, target) {
  return { field, current: String(current ?? ''), target: String(target ?? '') };
}
function groupsByEmail(items, getEmail) {
  const groups = new Map();
  items.forEach(item => {
    const key = emailKey(getEmail(item));
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}
const filled = value => Boolean(normalizeText(value));
const trimmed = value => String(value ?? '').trim();
const shown = (field, value) => (field === 'Cost Center' ? trimmed(value) : withoutLeadingCode(value).trim() || trimmed(value));
const isProductSubGroup = value => /^product(\s|$)/.test(normalizeText(value));
const isArea = (value, area) => filled(value) && compareTicketText(value, area);
const isClosingBusinessArea = value => isArea(value, CLOSING_BUSINESS_AREA)
  || normalizeText(value).replace(/\s+and\s+/g, ' & ') === 'client & market accel'
  || normalizeText(value).replace(/\s*&\s*|\s+and\s+/g, ' & ')
  .includes(normalizeText(CLOSING_BUSINESS_AREA).replace(/\s*&\s*/g, ' & '));
const inProductDepartment = profile => new RegExp(`^\\s*${PRODUCT_DEPARTMENT_CODE}\\b`).test(String(profile.Department ?? ''))
  || normalizeText(profile.Department).includes(normalizeText(withoutLeadingCode(PRODUCT_DEPARTMENT)));
const moving = (name, before, after) => {
  const field = mySourceName(name);
  const [from, to] = [before, after].map(value => withoutLeadingCode(value).trim() || trimmed(value));
  return !filled(from) ? `${field} → ${to}` : normalizeText(from) === normalizeText(to) ? `${field}: ${to}` : `${field}: ${from} → ${to}`;
};
const businessName = value => normalizeText(withoutLeadingCode(value)).trim();
const isConsultingServices = value => businessName(value) === CONSULTING_SERVICES_BUSINESS;
const namesConsulting = value => /\bconsulting\b/.test(businessName(value));
const auditAssuranceArea = value => AUDIT_ASSURANCE_AREAS.some(name => new RegExp(`\\b${name}\\b`).test(businessName(value)));
const unsupportedBusiness = value => UNSUPPORTED_BUSINESSES.find(name => new RegExp(`\\b${normalizeText(name)}\\b`).test(normalizeText(value))) || '';
const isInactive = profile => normalizeText(profile.Active) === 'no';
function inXTermDepartment(profile) {
  const department = normalizeText(profile.Department);
  return /\b999\b/.test(department) || department.includes('x term professional');
}
const idWithOne = profile => /^\d{8}1$/.test(trimmed(profile.Empid));
const EMPLOYEE_ID_BY_HAND = 'set by hand (8 digits)';
const EMPLOYEE_ID_WITH_ONE_BY_HAND = 'set by hand (8 digits + 1)';
function isDeactivatedProfile(profile) {
  return isInactive(profile) || inXTermDepartment(profile);
}
const inConsultingDepartment = profile => /^\s*110\b/.test(String(profile.Department ?? ''))
  || normalizeText(profile.Department).includes(normalizeText(withoutLeadingCode(CONSULTING_DEPARTMENT)));
const NOT_UPDATED_STEP = '⏳ MySource doesn\'t show the ticket\'s new values yet → nothing more today; it comes in again in a later import.';
const ROSTER_NOT_UPDATED_STEP = '⏳ MySource doesn\'t show the roster\'s values yet → nothing more today; it comes in again in a later import.';
const waitUntil = monday => `⏳ Nothing to do until ${monday}`;
function deadEnd(base, why, step = 'Nothing to do.') {
  const { ticketNotes, noDateStated, ...record } = base;
  return {
    ...record,
    scenario: KIND.none,
    sorted: 'no-change',
    manualReasons: [],
    corrections: [],
    expectedValues: {},
    notes: why ? [{ text: why }] : [],
    whatToDo: step,
    checks: NO_CHECKS,
    dpNotUsed: true,
    deadEnd: true,
  };
}
const NOT_MATCHED = new Set(['no-email', 'duplicate-ticket', 'no-profile', 'duplicate-profile', 'roster-conflict']);
function notMatched(item) {
  return (item.manualReasons || []).some(code => NOT_MATCHED.has(code));
}
function dateSensitiveTarget(item, level, effectiveDate) {
  const option = DATE_SENSITIVE_LEVEL_OPTIONS[level];
  return option && effectiveDate ? {
    effectiveDate, department: item.dateSensitiveDepartment || CONSULTING_DEPARTMENT,
    level: option, requiredExistingShift: CONSULTING_SHIFT,
  } : null;
}
__exports.MAPPING_COLUMNS = MAPPING_COLUMNS;
__exports.rosterEmployeeId = rosterEmployeeId;
__exports.rosterFlag = rosterFlag;
__exports.ticketNoteList = ticketNoteList;
__exports.baseRecord = baseRecord;
__exports.returnMappingValues = returnMappingValues;
__exports.unreadableStatedDate = unreadableStatedDate;
__exports.KIND = KIND;
__exports.NO_CHECKS = NO_CHECKS;
__exports.manualRecord = manualRecord;
__exports.manualHeadings = manualHeadings;
__exports.CANNOT_PLAN_DETAIL = CANNOT_PLAN_DETAIL;
__exports.cannotPlanDetail = cannotPlanDetail;
__exports.manualOrder = manualOrder;
__exports.correction = correction;
__exports.groupsByEmail = groupsByEmail;
__exports.filled = filled;
__exports.trimmed = trimmed;
__exports.shown = shown;
__exports.isProductSubGroup = isProductSubGroup;
__exports.isArea = isArea;
__exports.isClosingBusinessArea = isClosingBusinessArea;
__exports.inProductDepartment = inProductDepartment;
__exports.moving = moving;
__exports.businessName = businessName;
__exports.isConsultingServices = isConsultingServices;
__exports.namesConsulting = namesConsulting;
__exports.auditAssuranceArea = auditAssuranceArea;
__exports.unsupportedBusiness = unsupportedBusiness;
__exports.isInactive = isInactive;
__exports.inXTermDepartment = inXTermDepartment;
__exports.idWithOne = idWithOne;
__exports.EMPLOYEE_ID_BY_HAND = EMPLOYEE_ID_BY_HAND;
__exports.EMPLOYEE_ID_WITH_ONE_BY_HAND = EMPLOYEE_ID_WITH_ONE_BY_HAND;
__exports.isDeactivatedProfile = isDeactivatedProfile;
__exports.inConsultingDepartment = inConsultingDepartment;
__exports.NOT_UPDATED_STEP = NOT_UPDATED_STEP;
__exports.ROSTER_NOT_UPDATED_STEP = ROSTER_NOT_UPDATED_STEP;
__exports.waitUntil = waitUntil;
__exports.deadEnd = deadEnd;
__exports.NOT_MATCHED = NOT_MATCHED;
__exports.notMatched = notMatched;
__exports.dateSensitiveTarget = dateSensitiveTarget;
},
"rules/collate.js": function (__require, __exports, document, window) {
'use strict';
const { extractLevelCode, normalizeText, parseTicketDescription, profileKind, withoutLeadingCode } = __require("../rules.js");
const { mySourceName, ROSTER_COLUMNS, ROSTER_EMAIL, ROSTER_EMPLOYEE_ID, ROSTER_LOCATION, ROSTER_NAME, ROSTER_SHOULD_SHOW, TICKET_FIELD_CHECKS } = __require("./mappings.js");
const { dayAndMonth, emailCandidates, emailIndex, emailKeys, exactEmployeeId, findByEmail, fullYear, isPlaceholder, readDay, TICKET_CUT_LENGTH, usDate, usDateOf } = __require("./prepare.js");
const { filled, shown, trimmed } = __require("./facts.js");
const { TWO_WAYS } = __require("../screen/wording.js");
function rosterByEmail(rows) {
  const byEmail = new Map();
  byEmail.byId = new Map();
  const groups = new Set();
  const byKey = new Map();
  const columns = [...Object.keys(ROSTER_COLUMNS), ROSTER_NAME];
  const mappedColumns = Object.entries(ROSTER_COLUMNS);
  for (const row of rows) {
    const id = exactEmployeeId(row[ROSTER_EMPLOYEE_ID]);
    const keys = [...emailCandidates(row[ROSTER_EMAIL]).map(key => `email:${key}`), ...(id.length >= 6 ? [`id:${id}`] : [])];
    const linked = new Set(keys.map(key => byKey.get(key)).filter(Boolean));
    const group = { rows: [row], keys: new Set(keys) };
    for (const other of linked) {
      group.rows.push(...other.rows);
      for (const key of other.keys) group.keys.add(key);
      groups.delete(other);
    }
    groups.add(group);
    for (const key of group.keys) byKey.set(key, group);
  }
  for (const group of groups) {
    const row = group.rows[0];
    const keys = [...group.keys].filter(key => key.startsWith('email:')).map(key => key.slice(6));
    const read = (record, column) => column === ROSTER_EMAIL ? [...emailKeys(record[column])].sort().join(';') : trimmed(record[column]);
    const conflicts = group.rows.length === 1 ? [] : [...new Set(columns.filter(column => group.rows.some(other => read(other, column) !== read(row, column)))
      .map(column => ROSTER_COLUMNS[column] || (column === ROSTER_EMPLOYEE_ID ? 'Employee ID' : column)))].sort();
    const invalidIdentity = [
      ...(group.rows.some(record => emailCandidates(record[ROSTER_EMAIL]).length > 1) ? ['Email ID'] : []),
      ...(group.rows.some(record => trimmed(record[ROSTER_EMPLOYEE_ID]) && !exactEmployeeId(record[ROSTER_EMPLOYEE_ID])) ? ['Employee ID'] : []),
    ];
    for (const field of invalidIdentity) if (!conflicts.includes(field)) conflicts.push(field);
    const values = {};
    for (const [column, field] of mappedColumns) {
      const value = row[column];
      if (field && column !== ROSTER_EMAIL && value != null && value !== '' && !isPlaceholder(field, value)) values[field] = trimmed(value);
    }
    const major = majorMinor(values['Major/Minor']);
    if (major) values['Major/Minor'] = major;
    else delete values['Major/Minor'];
    const person = conflicts.length ? { values: {}, level: '', employeeId: '', location: '', name: '', conflicts, ...(invalidIdentity.length ? { invalidIdentity } : {}) } : {
      values,
      level: extractLevelCode(values.Level || ''),
      employeeId: exactEmployeeId(row[ROSTER_EMPLOYEE_ID]),
      location: isPlaceholder('', row[ROSTER_LOCATION]) ? '' : trimmed(row[ROSTER_LOCATION]),
      name: lastFirst(row[ROSTER_NAME]),
    };
    for (const key of keys) byEmail.set(key, person);
    for (const key of group.keys) if (key.startsWith('id:')) byEmail.byId.set(key.slice(3), person);
  }
  byEmail.emailIndex = emailIndex(byEmail, entry => entry[0]);
  return byEmail;
}
const employeeIdOf = profile => exactEmployeeId(profile?.Empid).replace(/^(\d{8})1$/, '$1');
function matchRoster(roster, email, profile = null) {
  const found = roster ? findByEmail(email, roster.emailIndex) : { match: null, unclear: false };
  if (found.unclear) return { values: {}, level: '', employeeId: '', location: '', name: '', conflicts: ['Email ID'] };
  return found.match?.[1] || roster?.byId?.get(employeeIdOf(profile)) || null;
}
const rosterConflictNote = person => person.invalidIdentity?.length
  ? `⚠ The roster's ${person.invalidIdentity.join(' and ')} is unclear: use one email and one complete Employee ID, without spaces inside it → handle this case by hand`
  : `⚠ The roster has two rows for this person that disagree: ${person.conflicts.join(', ')} → handle this case by hand`;
const majorMinor = value => (normalizeText(value) === 'unknown focus' ? '' : trimmed(value));
function lastFirst(name) {
  const text = trimmed(name).replace(/\s+/g, ' ');
  if (!text || text.includes(',')) return text.replace(/\s*,\s*/, ', ');
  const words = text.split(' ');
  return words.length < 2 ? text : `${words.at(-1)}, ${words.slice(0, -1).join(' ')}`;
}
function collate(ticket, exported, roster = null) {
  const profile = exported && roster ? filledFromRoster(exported, roster) : exported;
  const fields = {};
  for (const [field, { report }] of Object.entries(TICKET_FIELD_CHECKS)) {
    const future = trimmed(ticket.future[field]);
    const current = trimmed(ticket.current[field]);
    const mySource = trimmed(profile?.[report]);
    const fromRoster = trimmed(roster?.values[report]);
    const to = future || current || mySource;
    const now = current || mySource;
    const going = fromRoster || future;
    const toFrom = future ? 'ticket (future)' : current ? 'ticket' : mySource ? 'MySource' : '';
    fields[field] = {
      column: report, future, current, mySource,
      to,
      toFrom,
      now,
      nowFrom: current ? 'ticket' : mySource ? 'MySource' : '',
      moving: filled(future) && normalizeText(future) !== normalizeText(current),
      going,
      goes: filled(going) && !(filled(now) && TICKET_FIELD_CHECKS[field].compare(going, now)),
      roster: fromRoster,
      should: fromRoster || to,
      shouldFrom: fromRoster ? 'roster' : toFrom,
    };
  }
  return {
    ticket, fields, roster, mySourceShows: exported, inExport: Boolean(profile),
    profile: profile || profileFromTicket(ticket, fields),
  };
}
function filledFromRoster(exported, roster) {
  const fills = {};
  for (const field of ROSTER_SHOULD_SHOW) {
    if (!filled(exported[field]) && filled(roster.values[field])) fills[field] = roster.values[field];
  }
  const location = roster.location || trimmed(exported.Location);
  const region = filled(exported.Region) ? '' : rosterRegion(roster);
  if (region) fills.Region = region;
  return { ...exported, ...fills, Location: location, __fromRoster: Object.keys(fills) };
}
function rosterRegion(roster) {
  const region = trimmed(roster?.values.Region);
  if (region) return region;
  const usi = normalizeText(roster?.values['USI Indicator']);
  return ['yes', 'y'].includes(usi) ? 'US - USI' : ['no', 'n'].includes(usi) ? 'US - US' : '';
}
function kindOf(profile, roster) {
  const indicator = normalizeText(roster?.values['GPS Indicator']);
  if (!indicator) return profileKind(profile);
  if (['gps', 'gps india', 'gps - india'].includes(indicator)) return 'gps';
  return indicator === 'commercial' ? profileKind({ ...profile, Practice: '' }) : 'unknown';
}
const MYSOURCE_ONLY = ['Practice', 'Region', 'Level', 'Hire Type', 'Department', 'Active', 'Security', 'Authorization', 'Schedule Compliance', 'Assign Period', 'Term Date', 'Resource Manager'];
function usedFrom({ fields, profile, inExport }) {
  const shared = Object.entries(fields).filter(([, field]) => field.should)
    .map(([name, field]) => ({ field: mySourceName(name), value: shown(name, field.should), from: field.shouldFrom, ...((field.moving || (name === 'Business Area' && field.goes)) && field.now ? { was: shown(name, field.now) } : {}) }));
  const fromRoster = new Set(profile.__fromRoster || []);
  const mySource = inExport
    ? MYSOURCE_ONLY.filter(column => filled(profile[column])).map(column => ({ field: column, value: trimmed(profile[column]), from: fromRoster.has(column) ? 'roster' : 'MySource' }))
    : profile.Level ? [{ field: 'Level', value: profile.Level, from: 'ticket' }] : [];
  return [...shared, ...mySource];
}
function profileFromTicket(ticket, fields) {
  const profile = Object.fromEntries(Object.entries(fields)
    .map(([name, field]) => [field.column, name === 'Cost Center' ? field.should : withoutLeadingCode(field.should).trim()]));
  return {
    ...profile,
    Email: ticket.email || '',
    Level: extractLevelCode(fields.Title.current || fields.Title.to),
    Active: 'Yes',
  };
}
const YEAR_FIRST = /(transfer\s+effective\s+)(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?![\d/-])/i;
function readTicket(description, opened = '') {
  const match = YEAR_FIRST.exec(String(description ?? ''));
  if (!match) return readingNearOpened(parseTicketDescription(description), opened);
  const [year, month, day] = match.slice(2).map(Number);
  const written = usDate(year, month, day);
  const parsed = parseTicketDescription(String(description).replace(YEAR_FIRST, `$1${written}`));
  const sunday = new Date(Date.UTC(year, month - 1, day));
  const isSunday = sunday.getUTCFullYear() === year && sunday.getUTCMonth() === month - 1 && sunday.getUTCDate() === day && sunday.getUTCDay() === 0;
  sunday.setUTCDate(sunday.getUTCDate() + 1);
  const warnings = parsed.warnings.filter(warning => !/transfer-effective date/i.test(warning));
  if (!isSunday) warnings.unshift('The ticket transfer-effective date must be a valid Sunday before a Date Sensitive row can be staged.');
  return {
    ...parsed,
    warnings,
    transferEffectiveDate: written,
    phase3EffectiveDate: isSunday ? usDateOf(sunday, true) : '',
  };
}
const NEAR_OPENED_DAYS = 42;
function readingNearOpened(parsed, opened) {
  const warning = parsed.warnings.find(text => TWO_WAYS.test(text));
  const day = readDay(opened);
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(parsed.transferEffectiveDate || '');
  if (!warning || !day || !match) return parsed;
  const [first, second, year] = match.slice(1).map(Number);
  const openedOn = Date.UTC(fullYear(day), day.month - 1, day.date);
  const readings = [[first, second], [second, first]].map(([month, date]) => ({ month, date, time: Date.UTC(year, month - 1, date) }));
  const near = readings.filter(reading => Math.abs(reading.time - openedOn) <= NEAR_OPENED_DAYS * 86_400_000);
  if (near.length !== 1) return parsed;
  const [{ month, date, time }] = near;
  return {
    ...parsed,
    warnings: parsed.warnings.map(text => (text === warning
      ? `⚠ Effective date "${parsed.transferEffectiveDate}" read as ${dayAndMonth(date, month)} ${year}, the reading near the ticket's Opened date (${usDate(fullYear(day), day.month, day.date)}) → check`
      : text)),
    phase3EffectiveDate: usDateOf(new Date(time + 86_400_000), true),
  };
}
function pageTicketValues(fields) {
  return Object.entries(fields).filter(([name, field]) => name !== 'Title' && filled(field.should)).map(([name, field]) => ({
    field: mySourceName(name),
    target: shown(name, field.should),
    compare: name === 'Cost Center' ? 'code' : 'text',
    ...(name !== 'Cost Center' && field.should.length >= TICKET_CUT_LENGTH - 2 ? { cut: true } : {}),
    ...(field.shouldFrom.startsWith('ticket') ? {} : { quiet: true }),
  }));
}
__exports.rosterByEmail = rosterByEmail;
__exports.employeeIdOf = employeeIdOf;
__exports.matchRoster = matchRoster;
__exports.rosterConflictNote = rosterConflictNote;
__exports.majorMinor = majorMinor;
__exports.lastFirst = lastFirst;
__exports.collate = collate;
__exports.filledFromRoster = filledFromRoster;
__exports.rosterRegion = rosterRegion;
__exports.kindOf = kindOf;
__exports.MYSOURCE_ONLY = MYSOURCE_ONLY;
__exports.usedFrom = usedFrom;
__exports.profileFromTicket = profileFromTicket;
__exports.YEAR_FIRST = YEAR_FIRST;
__exports.readTicket = readTicket;
__exports.pageTicketValues = pageTicketValues;
},
"rules/gates.js": function (__require, __exports, document, window) {
'use strict';
const { containsAuditOrTax, extractLevelCode, isAwaitingEffectiveDate, meaningfulFutureFields, normalizeText, profileKind, withoutLeadingCode } = __require("../rules.js");
const { BLOCKED_HEADCOUNT, CLOSING_BUSINESS_AREA, UNSUPPORTED_BUSINESS_AREAS, DATE_SENSITIVE_LEVEL_OPTIONS, deactivationComment, deactivationSteps, GPS_NATIONAL_OFFICE, IGNORED_TICKET_FIELDS, mySourceName, NO_RESOURCE_MANAGER, OPEN_TERMINATION_DATE, PROFILE_NOT_FOUND_STEPS, reactivationSteps, ROSTER_SHOULD_SHOW, TICKET_FIELD_CHECKS } = __require("./mappings.js");
const { emailCandidates, emailIndex, emailKey, exactEmployeeId, findByEmail, onOrBefore, plainEmail, readDay, sameDay, sameValue } = __require("./prepare.js");
const { STEP_BREAK, ticketSaysNoDate } = __require("../screen/wording.js");
const { levelMatches } = __require("./dp-mapping.js");
const { auditAssuranceArea, baseRecord, correction, ticketNoteList, dateSensitiveTarget, deadEnd, filled, groupsByEmail, idWithOne, inProductDepartment, inXTermDepartment, isArea, isClosingBusinessArea, isConsultingServices, isDeactivatedProfile, isInactive, isProductSubGroup, KIND, manualRecord, moving, namesConsulting, NO_CHECKS, returnMappingValues, rosterEmployeeId, rosterFlag, shown, trimmed, unsupportedBusiness, waitUntil } = __require("./facts.js");
const { collate, employeeIdOf, kindOf, matchRoster, readTicket, rosterConflictNote, rosterRegion, usedFrom } = __require("./collate.js");
const rowValues = row => JSON.stringify(Object.entries(row).filter(([column]) => !column.startsWith('__')).sort(([one], [two]) => (one < two ? -1 : one > two ? 1 : 0)));
const onceEach = rows => {
  const seen = new Map();
  for (const row of rows) if (!seen.has(rowValues(row))) seen.set(rowValues(row), row);
  return [...seen.values()];
};
function sortTickets(serviceNowRows, mySourceRows, asOfDate, roster, decide, pageDescriptions = null) {
  const tickets = serviceNowRows.map(row => ({ row, parsed: readTicket(row.Description, row.Opened) }));
  const allGroups = groupsByEmail(tickets, item => plainEmail(item.parsed.email));
  const profileGroups = groupsByEmail(mySourceRows, row => row.Email);
  const profileIndex = emailIndex(profileGroups, entry => entry[0]);
  const { latest, older } = latestTickets(allGroups, asOfDate);
  return tickets.map(item => {
    const { row, parsed } = item;
    const key = emailKey(parsed.email);
    const profileMatch = findByEmail(key, profileIndex);
    const profiles = onceEach(profileMatch.match?.[1] || []);
    const inRoster = key ? matchRoster(roster, key, profiles.length === 1 ? profiles[0] : null) : null;
    if (older.has(item)) return olderTicket(baseRecord(row, parsed), older.get(item));
    const ticketGroups = latest.has(item) ? new Map([...allGroups, [plainEmail(key), [item]]]) : allGroups;
    const byId = !profiles.length && !profileMatch.unclear && !inRoster?.conflicts ? deactivatedById(mySourceRows, inRoster) : null;
    const matchedProfiles = byId ? [byId] : profiles;
    const worked = sortTicket(row, parsed, key, { ticketGroups, profiles: matchedProfiles, profileUnclear: profileMatch.unclear, asOfDate, inRoster, decide, pageDescription: pageDescriptions?.get(row.Number) || '' });
    const note = byId ? FOUND_BY_ID_NOTE : profiles.length === 1 && profileMatch.form !== 'exact'
      ? emailMatchNote(profileMatch.form, profiles[0].Email) : '';
    const withEmail = profiles.length === 1 && emailKey(profiles[0].Email) !== key
      ? { ...worked, profileEmail: profiles[0].Email } : worked;
    const found = note ? { ...withEmail, notes: [{ text: note }, ...(worked.notes || [])] } : withEmail;
    const result = latest.get(item)?.length ? { ...found, alsoClose: latest.get(item) } : found;
    if (!key || inRoster?.conflicts || matchedProfiles.length || profileMatch.unclear || result.sorted === 'later') return result;
    return { ...result, notes: [...(result.notes || []), { text: rosterSays(inRoster) }] };
  });
}
const FOUND_BY_ID_NOTE = '⚠ Found by Employee ID, not email (a deactivated profile) → check it\'s theirs';
const MATCHED_DATED_EMAIL_NOTE = '⚠ Matched by email with a date in front';
const MATCHED_PLAIN_EMAIL_NOTE = '⚠ Matched by email without the ticket\'s date';
const UNCLEAR_DATED_EMAIL_NOTE = '✗ Several profiles carry this address with different dates → find the right one by hand';
const emailMatchNote = (form, email) => `${form === 'dated' ? MATCHED_DATED_EMAIL_NOTE : MATCHED_PLAIN_EMAIL_NOTE} (${emailKey(email)}) → check it's theirs`;
function deactivatedById(mySourceRows, inRoster) {
  const id = exactEmployeeId(inRoster?.employeeId);
  if (!id) return null;
  const found = onceEach(mySourceRows.filter(profile => {
    const pageId = exactEmployeeId(profile.Empid);
    return !filled(profile.Email) && (pageId === id || pageId === `${id}1`);
  }));
  return found.length === 1 ? found[0] : null;
}
function latestTickets(groups, asOfDate) {
  const latest = new Map();
  const older = new Map();
  const effective = item => ({ number: item.row.Number || '', date: item.parsed.transferEffectiveDate || '' });
  for (const group of groups.values()) {
    const current = group.filter(item => !isAwaitingEffectiveDate(item.parsed.phase3EffectiveDate, asOfDate));
    if (current.length === 1 && group.length > 1) {
      latest.set(current[0], []);
      continue;
    }
    if (current.length < 2 || current.some(item => !item.parsed.phase3EffectiveDate)) continue;
    const newest = current.reduce((best, item) => (onOrBefore(best.parsed.phase3EffectiveDate, item.parsed.phase3EffectiveDate) ? item : best));
    const rest = current.filter(item => item !== newest);
    if (rest.some(item => sameDay(item.parsed.phase3EffectiveDate, newest.parsed.phase3EffectiveDate))) continue;
    latest.set(newest, rest.map(effective));
    for (const item of rest) older.set(item, effective(newest));
  }
  return { latest, older };
}
function olderTicket(base, later) {
  const ended = deadEnd(base, `✓ An older ticket for this person (effective ${base.ticketEffectiveDate}) → the later one, ${later.number} (effective ${later.date}), is worked`);
  return { ...ended, whatToDo: `Close this ticket with ${later.number}: that later ticket is the one worked.`, closedWith: later.number };
}
function rosterSays(inRoster) {
  if (!inRoster) return 'Roster: not in the roster either';
  const shownFields = ['Business', 'Business Area', 'Business Line', 'Talent Group', 'Talent Sub Group', 'Level'];
  const said = shownFields.filter(field => inRoster.values[field]).map(field => `${field} ${inRoster.values[field]}`);
  return `Roster: ${said.length ? said.join(' · ') : 'found, nothing filled in'}`;
}
function sortTicket(row, parsed, key, { ticketGroups, profiles, profileUnclear = false, asOfDate, inRoster, decide, pageDescription = '' }) {
  const base = baseRecord(row, parsed);
  if (emailCandidates(parsed.email).length > 1) return manualRecord(base, 'no-email', '✗ More than one email on the ticket → email is unclear; handle this case by hand');
  if (inRoster?.conflicts) return manualRecord(base, 'roster-conflict', rosterConflictNote(inRoster));
  const found = profiles;
  const tickets = ticketGroups.get(plainEmail(key)) || [];
  const single = found.length === 1 && tickets.length === 1 ? found[0] : null;
  const dated = collate(parsed, single, single ? inRoster : null);
  const later = laterCase(baseRecord(row, parsed, single), dated, asOfDate, profileUnclear);
  if (later) return { ...later, used: usedFrom(dated) };
  if (profileUnclear) return manualRecord(base, 'duplicate-profile', UNCLEAR_DATED_EMAIL_NOTE);
  if (!key) return manualRecord(base, 'no-email', '✗ No email on the ticket');
  if (tickets.length > 1) return manualRecord(base, 'duplicate-ticket', '✗ More than one ticket has this email → handle both tickets together, by hand');
  const matches = found;
  if (!matches.length) {
    const facts = { ...collate(parsed, null, inRoster), pageDescription };
    const unsupported = unsupportedMove(facts);
    if (!facts.inExport && unsupported.deactivate && /\btax\b/.test(normalizeText(facts.fields['Operating Model'].going))) {
      return { ...manualRecord(base, 'no-profile', `✗ Not found by email · ${unsupported.deactivate} → not confirmed deactivated`, PROFILE_NOT_FOUND_STEPS), used: usedFrom(facts) };
    }
    const ended = deadEndWhy(facts, unsupported);
    if (ended) return { ...deadEnd(base, ended), used: usedFrom(facts) };
    const first = businessWording(base, facts) || businessDeadEnd(base, businessMove(facts));
    if (first) return { ...first, used: usedFrom(facts) };
    const business = facts.fields['Operating Model'];
    const intoConsulting = isConsultingServices(business.going)
      && (isConsultingServices(business.future) || (filled(business.now) && !isConsultingServices(business.now)));
    if (intoConsulting) {
      if (kindOf(facts.profile, inRoster) === 'unknown') return { ...manualRecord(base, 'gps-indicator-unknown', unknownIndicator(inRoster)), used: usedFrom(facts) };
      const found = returnFoundLive({ ...base, region: rosterRegion(inRoster), rosterEmployeeId: rosterEmployeeId(inRoster), rosterLevel: inRoster?.level || '', ...(unsupported.pendingCostCenterDescription ? { pendingCostCenterDescription: true } : {}), ...(unsupported.checkCostCenterDescription ? { checkCostCenterDescription: true, watchCostCenterDescription: true } : {}) }, parsed, kindOf(facts.profile, inRoster), returnMappingValues(facts, inRoster));
      const fromTax = [business.now, facts.fields['Business Area'].now].some(value => /\btax\b/.test(normalizeText(value)));
      return { ...found, ...(fromTax ? { whatToDo: `${FROM_TAX_NOTE}${STEP_BREAK}${found.whatToDo}` } : {}), used: usedFrom(facts) };
    }
    return { ...manualRecord(base, 'no-profile', '✗ Profile not on MySource', PROFILE_NOT_FOUND_STEPS), used: usedFrom(facts) };
  }
  if (matches.length > 1) return manualRecord(base, 'duplicate-profile', '✗ More than one MySource profile has this email');
  const facts = collate(parsed, matches[0], inRoster);
  const result = decide(row, facts);
  const level = result.newLevelFrom ? [{ field: 'New level', value: result.newLevel, from: result.newLevelFrom }] : [];
  return { ...result, used: [...usedFrom(facts), ...level] };
}
function rosterById(byEmail) {
  return byEmail.byId;
}
const unknownIndicator = roster => `✗ GPS Indicator (roster) "${trimmed(roster?.values['GPS Indicator'])}" is not GPS, GPS India or Commercial → the grade table's column is unclear`;
const FROM_TAX_NOTE = '⚠ Coming from Tax → check their profile in the Tax MySource is deactivated before creating one here';
function returnFoundLive(base, ticket, kind = 'cs', mappingValues = null) {
  const manual = manualRecord(base, 'reactivation', '', reactivationSteps(base.effectiveMonday, false));
  const record = {
    ...manual,
    notes: manual.notes.filter(note => note.text),
    specialCase: 'reactivation',
    foundLive: true,
    ...(base.rosterEmployeeId ? { rosterEmployeeId: base.rosterEmployeeId } : {}),
    returnRow: true,
    newLevel: base.rosterLevel || extractLevelCode(ticket.future.Title || ticket.current.Title || ''),
    ticketTitle: ticket.future.Title || ticket.current.Title || '',
    kind: kind === 'conflict' ? 'cs' : kind,
    mappingValues,
    productToo: [ticket.current['Talent Sub Group'], ticket.future['Talent Sub Group'], mappingValues?.['Talent Sub Group']].some(isProductSubGroup),
  };
  const futureLevel = extractLevelCode(ticket.future.Title || '');
  const levelFlag = futureLevel && base.rosterLevel && futureLevel !== base.rosterLevel ? [rosterFlag('Level', futureLevel, base.rosterLevel)] : [];
  return { ...record, notes: [...record.notes, ...levelFlag, ...returnRowNote(record).map(text => ({ text }))] };
}
function returnRowNote(record) {
  return record.returnRow && !dateSensitiveTarget({}, record.newLevel, record.effectiveMonday)
    ? ['⚠ The 110 row can\'t be worked out (no effective date or level on the ticket) → add it by hand'] : [];
}
const AUDIT_CASE = 'Nothing to do: this is an Audit & Assurance case, not Consulting.';
const TAX_CASE = 'Nothing to do: this is a Tax case, not Consulting.';
function leavingConsultingBusiness(fields) {
  const { now: from, going: to, future } = fields['Operating Model'];
  const area = fields['Business Area'];
  const wrongFutureWording = namesConsulting(future) && !isConsultingServices(future);
  return isConsultingServices(from) && filled(to) && !isConsultingServices(to) && !wrongFutureWording
    && !/\b(audit|assurance)\b/.test(normalizeText(to))
    && !(area.goes && auditAssuranceArea(area.going));
}
function businessMove({ fields, profile, roster: matchedRoster, pageDescription }) {
  const from = fields['Operating Model'].now;
  const to = fields['Operating Model'].going;
  const destination = normalizeText(to);
  const intoConsulting = isConsultingServices(to);
  const area = fields['Business Area'];
  const fromAuditOrTax = containsAuditOrTax(from) || /\bassurance\b/.test(normalizeText(from)) || auditAssuranceArea(area.now);
  const intoAuditArea = area.goes && auditAssuranceArea(area.going);
  const intoAudit = /\b(audit|assurance)\b/.test(destination) || intoAuditArea;
  const returnsFromBusiness = intoConsulting && (fromAuditOrTax || Boolean(unsupportedBusiness(from)));
  const leaving = leavingUnsupportedArea(fields, profile, { roster: matchedRoster, pageDescription });
  const move = {
    returning: returnsFromBusiness || Boolean(leaving),
    from: returnsFromBusiness ? withoutLeadingCode(from).trim() || trimmed(from) : leaving,
  };
  if (unsupportedBusiness(to) || leavingConsultingBusiness(fields)) return move;
  if (destination && !/\bconsulting\b/.test(destination) && !intoAudit) {
    const byRoster = filled(fields['Operating Model'].roster) ? ' (roster)' : '';
    const said = fields['Operating Model'].goes ? `${moving('Operating Model', from, `"${to}"`)}${byRoster}`
      : `Business "${withoutLeadingCode(to).trim() || to}"${byRoster}`;
    return { ...move, unknown: `✓ Not a business Shuffle covers → nothing to do · ${said}` };
  }
  if (intoAudit) {
    return { ...move, auditOrTax: AUDIT_CASE };
  }
  if (fromAuditOrTax && !intoConsulting) {
    const tax = /\btax\b/.test(normalizeText(from)) && !auditAssuranceArea(area.now);
    return { ...move, auditOrTax: tax ? TAX_CASE : AUDIT_CASE };
  }
  const { roster, current, mySource } = fields['Operating Model'];
  const where = [filled(roster) ? roster : current, mySource].filter(filled);
  if (!filled(to) && where.length && !where.some(namesConsulting)) {
    const shown = withoutLeadingCode(where[0]).trim() || trimmed(where[0]);
    return { ...move, unknown: `✓ Not a business Shuffle covers → nothing to do · Business "${shown}" (${filled(roster) ? 'roster' : filled(current) ? 'ticket' : 'MySource'})` };
  }
  return move;
}
const areaKey = value => normalizeText(withoutLeadingCode(value)).replace(/\s*&\s*|\s+and\s+/g, ' & ').trim();
const unsupportedAreaName = value => UNSUPPORTED_BUSINESS_AREAS.find(name => filled(value) && areaKey(value) === areaKey(name)) || '';
function unsupportedArea({ fields, profile }) {
  const area = fields['Business Area'];
  const into = area.goes && unsupportedAreaName(area.going);
  if (into) return `${moving('Business Area', area.now, area.going)} (not supported)`;
  const there = !area.goes && unsupportedAreaName(area.going || profile['Business Area']);
  return there ? `Business Area: ${there} (no change, not supported)` : '';
}
function leavingUnsupportedArea(fields, profile, { roster, pageDescription = '' } = {}) {
  const area = fields['Business Area'];
  const left = unsupportedAreaName(area.now);
  if (area.goes && left && !unsupportedAreaName(area.going)) return left;
  const currentDescription = filled(pageDescription)
    ? pageDescription : fields['Cost Center'].current;
  if (area.goes && isClosingBusinessArea(area.now) && !isClosingBusinessArea(area.going)
    && !normalizeText(currentDescription).includes(normalizeText(BLOCKED_HEADCOUNT))) return CLOSING_BUSINESS_AREA;
  const line = fields['Business Line'];
  const office = value => normalizeText(value).includes(normalizeText(GPS_NATIONAL_OFFICE.businessLine));
  const gps = new RegExp(`\\b${normalizeText(GPS_NATIONAL_OFFICE.practice)}\\b`);
  const inGps = gps.test(normalizeText(profile?.Practice)) || gps.test(normalizeText(line.now));
  return line.goes && inGps && office(line.now) && !office(line.going) ? 'GPS National Office' : '';
}
function productMove({ fields, profile }) {
  const toProduct = isProductSubGroup(fields['Talent Sub Group'].should);
  const fromProduct = isProductSubGroup(fields['Talent Sub Group'].now) || inProductDepartment(profile);
  return { toProduct, backToConsulting: fromProduct && !toProduct };
}
const rosterNumberWithoutDescription = roster => Boolean(roster
  && (filled(roster.values['Cost Center']) || /^\d+$/.test(trimmed(roster.values['Cost Center Description'])))
  && !withoutLeadingCode(trimmed(roster.values['Cost Center Description'])).trim());
function closingArea({ fields, profile, roster, pageDescription = '' }) {
  const area = fields['Business Area'];
  const into = area.goes && isClosingBusinessArea(area.going);
  const staying = !area.goes && isClosingBusinessArea(area.going || profile['Business Area'])
    && (!filled(area.current) || isClosingBusinessArea(area.current));
  const leaving = area.goes && isClosingBusinessArea(area.now) && !isClosingBusinessArea(area.going);
  const rosterNumberOnly = rosterNumberWithoutDescription(roster);
  const page = trimmed(pageDescription);
  if (!into && !staying) {
    if (leaving && rosterNumberOnly && !withoutLeadingCode(fields['Cost Center'].current).trim()) {
      return page ? { checkCostCenterDescription: true } : {
        pendingCostCenterDescription: true,
        checkCostCenterDescription: true,
      };
    }
    return {};
  }
  const ticketCostCenter = into ? fields['Cost Center'].going : fields['Cost Center'].going || fields['Cost Center'].current;
  const fromRoster = rosterNumberOnly ? '' : trimmed(roster?.values['Cost Center Description']);
  const costCenter = fromRoster || ticketCostCenter;
  const fromPage = page;
  const description = fromPage || fromRoster || withoutLeadingCode(ticketCostCenter).trim();
  const where = into ? `Business Area → ${CLOSING_BUSINESS_AREA}` : `Business Area: ${CLOSING_BUSINESS_AREA} (no change)`;
  if (!filled(description)) {
    return { where: `${where} (only ${BLOCKED_HEADCOUNT} is supported there)`, checkPage: `${where} · no Cost Center description on the ticket${roster ? ' or the roster' : ''} → ⚠ the page check reads it: not ${BLOCKED_HEADCOUNT} → deactivate instead`, ...(rosterNumberOnly ? { pendingCostCenterDescription: true, checkCostCenterDescription: true } : {}) };
  }
  const readOnPage = fromPage ? { checkCostCenterDescription: true } : {};
  if (normalizeText(description).includes(normalizeText(BLOCKED_HEADCOUNT))) return { blockedHeadcount: true, ...readOnPage };
  return { deactivate: `${where} · ${fromPage ? 'Cost Center Description on the page' : `Cost Center ${costCenter}${fromRoster ? ' (roster)' : ''}`} (only ${BLOCKED_HEADCOUNT} is supported there)`, ...readOnPage };
}
function gpsNationalOffice({ fields, profile, inExport }) {
  const words = value => normalizeText(value);
  const gps = value => new RegExp(`\\b${words(GPS_NATIONAL_OFFICE.practice)}\\b`).test(words(value));
  if (!gps(profile.Practice) && (inExport || !gps(fields['Business Line'].should))) return '';
  const office = value => words(value).includes(words(GPS_NATIONAL_OFFICE.businessLine));
  const { current, going: future, goes } = fields['Business Line'];
  const why = value => (gps(value) ? 'not supported' : 'GPS National Office, not supported');
  if (goes) {
    return office(future) ? `${moving('Business Line', current || profile['Business Line'], future)} (${why(future)})` : '';
  }
  const there = office(profile['Business Line']) && (!filled(current) || office(current));
  return there ? `Business Line: ${profile['Business Line']} (no change, ${why(profile['Business Line'])})` : '';
}
function unsupportedMove(facts) {
  const { going: to, now: from, roster } = facts.fields['Operating Model'];
  const business = unsupportedBusiness(to);
  if (business || leavingConsultingBusiness(facts.fields)) {
    const source = !business && filled(roster) ? ' (roster)' : '';
    return { deactivate: `${moving('Business', from, to)}${source} (not supported)` };
  }
  const office = gpsNationalOffice(facts);
  if (office) return { deactivate: office, area: true };
  const area = unsupportedArea(facts);
  if (area) return { deactivate: area, area: true };
  const closing = closingArea(facts);
  if (closing.deactivate) return { ...closing, area: true };
  return closing.checkPage || closing.checkCostCenterDescription ? { ...closing, area: true } : closing;
}
function kindOfChange({ fields, profile, ticket }) {
  const level = extractLevelCode(fields.Title.future || fields.Title.current);
  if (level && level !== extractLevelCode(profile.Level)) return KIND.level;
  return meaningfulFutureFields(ticket).some(([field]) => !IGNORED_TICKET_FIELDS.has(field)) ? KIND.move : KIND.none;
}
function laterCase(base, facts, asOfDate, unclearProfile = false) {
  const scenario = kindOfChange(facts);
  if (!isAwaitingEffectiveDate(base.effectiveMonday, asOfDate) || (scenario === KIND.none && !unclearProfile)) return null;
  const { ticketNotes, noDateStated, ...record } = base;
  return {
    ...record,
    scenario,
    sorted: 'later',
    manualReasons: [],
    corrections: [],
    notes: [],
    comment: '',
    whatToDo: waitUntil(base.effectiveMonday),
    checks: NO_CHECKS,
  };
}
function businessWording(base, { fields, inExport }) {
  const { current, future, mySource } = fields['Operating Model'];
  const sides = [['on the ticket', future], ['on the ticket', current], ['in MySource', inExport ? mySource : '']];
  const wrong = sides.find(([, value]) => namesConsulting(value) && !isConsultingServices(value));
  if (!wrong) return null;
  return deadEnd(base, `✓ Not a business Shuffle covers → nothing to do · Business "${withoutLeadingCode(wrong[1]).trim()}" ${wrong[0]}`);
}
function businessDeadEnd(base, move) {
  if (move.auditOrTax) return deadEnd(base, '', move.auditOrTax);
  return move.unknown ? deadEnd(base, move.unknown) : null;
}
const LEVEL_WORDS = Object.keys(DATE_SENSITIVE_LEVEL_OPTIONS).map(code => code.slice(1)).join('|');
const levelPrefix = new RegExp(`^\\s*L\\s*(?:[_-]\\s*)?(?:${LEVEL_WORDS})(?![A-Za-z0-9])\\s*(?:[_-]\\s*)?`, 'i');
function titleNote(ticketTitle, positionTitle, profile, levelMatches) {
  const words = String(ticketTitle).replace(levelPrefix, '').trim();
  const group = ['Talent Sub Group', 'Talent Group'].find(field => isShortFormOf(words, withoutLeadingCode(profile[field])));
  if (group) {
    return `Position Title: the ticket shows the ${group} in short ("${words}") instead of the job title — a known glitch${levelMatches ? ' · level matches ✓' : ''}`;
  }
  return `⚠ Position Title: MySource "${positionTitle || ''}" · ticket "${ticketTitle}"`;
}
function isShortFormOf(short, long) {
  const words = value => normalizeText(value).split(/[^\p{L}\d]+/u).filter(word => word && word !== 'and');
  const shortWords = words(short);
  const longWords = words(long);
  if (!shortWords.length || shortWords.length > longWords.length) return false;
  const within = (part, whole) => {
    let at = 0;
    for (const letter of whole) if (letter === part[at]) at++;
    return at === part.length;
  };
  let next = 0;
  for (const word of shortWords) {
    while (next < longWords.length && !(longWords[next][0] === word[0] && within(word, longWords[next]))) next++;
    if (next === longWords.length) return false;
    next++;
  }
  return true;
}
const NO_RULE = ' changes on the ticket, but Shuffle has no rule for it.';
const fieldWithoutRule = note => note?.noRule || '';
function deadEndWhy({ inExport }, unsupported) {
  const why = unsupported.deactivate || unsupported.where;
  return !inExport && why && !unsupported.pendingCostCenterDescription ? `✓ Deactivated already (not found by email) · ${why}` : '';
}
const DEACTIVATED_ALREADY = '✓ Deactivated already';
function deactivationCase(base, profile, deactivated, why) {
  const { ticketNotes, noDateStated, ...record } = base;
  const termDate = profile['Term Date'];
  const leftByThen = Boolean(readDay(termDate)) && !sameDay(termDate, OPEN_TERMINATION_DATE)
    && (!base.effectiveMonday || onOrBefore(termDate, base.effectiveMonday));
  const done = !deactivated ? (idWithOne(profile) ? ['Employee ID'] : []) : [
    ...(!filled(profile.Email) ? ['Email'] : []),
    ...(idWithOne(profile) ? ['Employee ID'] : []),
    ...(isInactive(profile) ? ['Profile Status'] : []),
    ...(normalizeText(profile['Resource Manager']) === normalizeText(NO_RESOURCE_MANAGER) ? ['Resource Manager'] : []),
    ...(leftByThen ? ['Termination Date'] : []),
    ...(inXTermDepartment(profile) ? ['Date Sensitive row'] : []),
  ];
  const left = ['Email', 'Employee ID', 'Profile Status', 'Resource Manager', 'Termination Date', 'Date Sensitive row']
    .filter(step => !done.includes(step));
  if (!left.length) return deadEnd(base, `${DEACTIVATED_ALREADY} · ${why}`);
  const deactivation = {
    ...record,
    scenario: KIND.deactivation,
    sorted: 'to-correct',
    manualReasons: [],
    corrections: [],
    notes: [
      deactivated ? { text: `Deactivated in MySource, not fully finished · ${why}`, aside: true } : { text: `${why} → deactivate` },
      ...ticketNoteList(ticketNotes),
    ],
    whatToDo: deactivationSteps(base.effectiveMonday, deactivated),
    checks: NO_CHECKS,
    comment: deactivationComment(base.ticketNumber),
    specialCase: 'deactivation',
    stepsDone: done,
    currentStatus: isInactive(profile) ? 'No' : 'Yes',
    dpNotUsed: true,
  };
  return deactivation;
}
function screenCase(row, facts) {
  const { ticket, profile } = facts;
  const move = businessMove(facts);
  const unsupported = unsupportedMove(facts);
  const base = {
    ...baseRecord(row, ticket, profile),
    ...(unsupported.pendingCostCenterDescription ? { pendingCostCenterDescription: true } : {}),
    ...(unsupported.checkCostCenterDescription ? { checkCostCenterDescription: true, watchCostCenterDescription: true } : {}),
  };
  const ended = deadEndWhy(facts, unsupported);
  if (ended) return { end: deadEnd(base, ended) };
  const wording = businessWording(base, facts);
  if (wording) return { end: wording };
  const deactivated = isDeactivatedProfile(profile);
  const broughtBack = deactivated && !unsupported.deactivate && (!unsupported.where || unsupported.pendingCostCenterDescription)
    && (isConsultingServices(facts.fields['Operating Model'].going) || move.returning);
  if (unsupported.deactivate || (deactivated && !broughtBack)) {
    return { end: deactivationCase(base, profile, deactivated, unsupported.deactivate || unsupported.where || 'the ticket does not bring them back to Consulting Services') };
  }
  const businessEnded = businessDeadEnd(base, move);
  if (businessEnded) return { end: businessEnded };
  const product = productMove(facts);
  const kind = kindOf(profile, facts.roster);
  if (kind === 'unknown') return { end: manualRecord(base, 'gps-indicator-unknown', unknownIndicator(facts.roster)) };
  const fromPractice = profileKind(profile);
  const kindNote = kind !== fromPractice
    ? `GPS Indicator (roster) "${trimmed(facts.roster.values['GPS Indicator'])}" → the grade table's ${kind === 'gps' ? 'GPS' : kind === 'ma' ? 'M&A' : 'Consulting Services'} column (MySource's Practice "${trimmed(profile.Practice)}")` : '';
  if (kind === 'conflict') return { end: manualRecord(base, 'business-unclear', '✗ GPS (Practice) and M&A (Business Line) both → the grade table is unclear') };
  const firstPartOfReturn = isInactive(profile) || idWithOne(profile);
  const ticketTitle = facts.fields.Title.future || facts.fields.Title.current;
  const ticketLevel = extractLevelCode(ticketTitle);
  const rosterLevel = facts.roster?.level || '';
  const newLevel = rosterLevel || ticketLevel;
  if (!newLevel && !firstPartOfReturn) {
    return { end: manualRecord(base, 'level-unreadable', filled(ticketTitle) ? `✗ No level in the ticket's Position Title ("${ticketTitle}")` : '✗ No Position Title on the ticket → the new level is unknown') };
  }
  return { context: { base, move, unsupported, product, kind, kindNote, firstPartOfReturn, ticketLevel, rosterLevel, newLevel } };
}
function takenIn(facts, { base, newLevel, ticketLevel, rosterLevel }) {
  const { ticket, profile } = facts;
  const changed = new Map(meaningfulFutureFields(ticket));
  const levelChanges = Boolean(newLevel) && newLevel !== extractLevelCode(profile.Level);
  const scenario = levelChanges ? KIND.level : changed.size ? KIND.move : KIND.none;
  const notes = ticketNoteList(base.ticketNotes.filter((text, index) => text && !(base.noDateStated && ticketSaysNoDate(ticket.warnings[index]))));
  const noDateNote = base.noDateStated
    ? base.ticketNotes.filter((text, index) => text && ticketSaysNoDate(ticket.warnings[index])).map(text => ({ text, aboutTheMissingDate: true }))
    : [];
  const corrections = levelChanges ? [correction('Level', profile.Level, newLevel)] : [];
  const differences = [];
  const ticketChecked = [];
  const ticketDiffers = [];
  let withoutRule = false;
  const futureLevel = extractLevelCode(facts.fields.Title.future);
  if (futureLevel && rosterLevel && futureLevel !== rosterLevel) notes.push(rosterFlag('Level', futureLevel, rosterLevel));
  const titleLevel = extractLevelCode(profile['Position Title']);
  if (titleLevel && newLevel && titleLevel !== newLevel) {
    ticketChecked.push('Level in Position Title');
    ticketDiffers.push('Level in Position Title');
    differences.push({ field: 'Level in Position Title', current: titleLevel, target: newLevel, notUpdated: true });
  }
  const fields = [...changed.keys(), ...Object.keys(ticket.current).filter(field => !changed.has(field))];
  for (const field of fields) {
    if (field === 'Email ID' || IGNORED_TICKET_FIELDS.has(field)) continue;
    const check = TICKET_FIELD_CHECKS[field];
    if (!check) {
      if (changed.has(field) && filled(changed.get(field))) {
        withoutRule = true;
        notes.push({ text: `${field}${NO_RULE}`, noRule: field });
      }
      continue;
    }
    const gathered = facts.fields[field];
    const target = gathered.moving ? gathered.future : gathered.current;
    if (!filled(target)) continue;
    if (field !== 'Title' && filled(gathered.roster)) {
      if (gathered.moving && !check.compare(target, gathered.roster)) notes.push(rosterFlag(mySourceName(field), shown(field, target), gathered.roster));
      continue;
    }
    ticketChecked.push(mySourceName(field));
    const current = gathered.mySource;
    const same = (ticketValue, mySourceValue) => check.compare(ticketValue, mySourceValue);
    if (field === 'Title' && !same(target, current)) {
      if (filled(gathered.roster)) {
        if (gathered.moving) notes.push({ text: `✓ Position Title: the roster's "${gathered.roster}" is used (the ticket says "${target}")` });
        continue;
      }
      const none = facts.roster ? ' · the roster has no Position Title for them → check' : '';
      notes.push({ text: `${titleNote(target, current, profile, !titleLevel || titleLevel === newLevel)}${none}` });
      continue;
    }
    if (same(target, current)) continue;
    ticketDiffers.push(mySourceName(field));
    const stillOld = gathered.moving && filled(gathered.current) && same(gathered.current, current);
    const difference = { field: mySourceName(field), current: shown(field, current), target: shown(field, target) };
    differences.push(stillOld ? { ...difference, notUpdated: true } : difference);
  }
  for (const field of facts.roster ? ROSTER_SHOULD_SHOW : []) {
    const theirs = facts.roster.values[field];
    const mine = trimmed(facts.mySourceShows?.[field]);
    if (!filled(theirs) || !filled(mine)) continue;
    if (field === 'Business' && !isConsultingServices(mine) && !isConsultingServices(theirs)) continue;
    if (!ticketChecked.includes(field)) ticketChecked.push(field);
    if (sameValue(field, mine, theirs)) continue;
    if (!ticketDiffers.includes(field)) ticketDiffers.push(field);
    differences.push({ field, current: mine, target: theirs, notUpdated: true, source: 'roster' });
  }
  return { levelChanges, scenario, notes, noDateNote, corrections, differences, ticketChecked, ticketDiffers, withoutRule };
}
__exports.employeeIdOf = employeeIdOf;
__exports.sortTickets = sortTickets;
__exports.FOUND_BY_ID_NOTE = FOUND_BY_ID_NOTE;
__exports.MATCHED_DATED_EMAIL_NOTE = MATCHED_DATED_EMAIL_NOTE;
__exports.MATCHED_PLAIN_EMAIL_NOTE = MATCHED_PLAIN_EMAIL_NOTE;
__exports.UNCLEAR_DATED_EMAIL_NOTE = UNCLEAR_DATED_EMAIL_NOTE;
__exports.emailMatchNote = emailMatchNote;
__exports.deactivatedById = deactivatedById;
__exports.latestTickets = latestTickets;
__exports.olderTicket = olderTicket;
__exports.rosterSays = rosterSays;
__exports.sortTicket = sortTicket;
__exports.rosterById = rosterById;
__exports.returnFoundLive = returnFoundLive;
__exports.returnRowNote = returnRowNote;
__exports.businessMove = businessMove;
__exports.unsupportedAreaName = unsupportedAreaName;
__exports.unsupportedArea = unsupportedArea;
__exports.leavingUnsupportedArea = leavingUnsupportedArea;
__exports.productMove = productMove;
__exports.closingArea = closingArea;
__exports.gpsNationalOffice = gpsNationalOffice;
__exports.unsupportedMove = unsupportedMove;
__exports.kindOfChange = kindOfChange;
__exports.laterCase = laterCase;
__exports.businessWording = businessWording;
__exports.businessDeadEnd = businessDeadEnd;
__exports.LEVEL_WORDS = LEVEL_WORDS;
__exports.levelPrefix = levelPrefix;
__exports.titleNote = titleNote;
__exports.isShortFormOf = isShortFormOf;
__exports.NO_RULE = NO_RULE;
__exports.fieldWithoutRule = fieldWithoutRule;
__exports.deadEndWhy = deadEndWhy;
__exports.DEACTIVATED_ALREADY = DEACTIVATED_ALREADY;
__exports.deactivationCase = deactivationCase;
__exports.screenCase = screenCase;
__exports.takenIn = takenIn;
},
"rules/checks.js": function (__require, __exports, document, window) {
'use strict';
const { compareText, extractLevelCode, normalizeText } = __require("../rules.js");
const { ASSIGN_PERIOD, BLOCKED_HEADCOUNT, BLOCKED_HEADCOUNT_RESOURCE_MANAGER, SITUATION_CHECKS, DEACTIVATION_COMMENT_WORDS, REMOVE_DEACTIVATION_AND_PRODUCT_COMMENT, REMOVE_DEACTIVATION_COMMENT, REMOVE_PRODUCT_COMMENT, situationOf, DATE_SENSITIVE_LEVEL_OPTIONS, DP_MAPPING_SHEETS, GRADES, INFORMATION_ONLY_REASONS, INTERN, NO_RESOURCE_MANAGER, OLD_PRODUCT_COMMENT, OPEN_TERMINATION_DATE, PRODUCT_COMMENT, PRODUCT_DEPARTMENT, PROFILE_VALUES, reactivationSteps, SCHEDULE_NO_LEVELS, X_TERM_DEPARTMENT } = __require("./mappings.js");
const { sameDay, TICKET_CUT_LENGTH, usDateOf } = __require("./prepare.js");
const { findResourceManager } = __require("./dp-mapping.js");
const { correction, dateSensitiveTarget, EMPLOYEE_ID_BY_HAND, isProductSubGroup, EMPLOYEE_ID_WITH_ONE_BY_HAND, filled, idWithOne, inConsultingDepartment, inProductDepartment, isDeactivatedProfile, isInactive, KIND, NOT_UPDATED_STEP, notMatched, returnMappingValues, ROSTER_NOT_UPDATED_STEP, rosterEmployeeId, trimmed, waitUntil } = __require("./facts.js");
const { pageTicketValues } = __require("./collate.js");
const { returnRowNote } = __require("./gates.js");
function shouldShowFor(level, kind, intern) {
  const grade = GRADES[level]?.[kind];
  return {
    Security: grade?.[0],
    Authorization: grade?.[1],
    'Schedule Compliance': intern || SCHEDULE_NO_LEVELS.has(level) ? 'No' : 'Yes',
    'Assign Period': ASSIGN_PERIOD,
    'Termination Date': OPEN_TERMINATION_DATE,
  };
}
const isIntern = (...values) => values.some(value => INTERN.test(normalizeText(value)));
function checkCase(facts, { base, move, unsupported, product, kind, kindNote = '', firstPartOfReturn, newLevel, rosterLevel }, taken) {
  const { profile } = facts;
  const { levelChanges, scenario, notes, noDateNote, corrections, differences, ticketChecked, ticketDiffers, withoutRule } = taken;
  if (kindNote) notes.push({ text: kindNote });
  const grade = GRADES[newLevel];
  if (!grade && newLevel) notes.push({ text: `✗ ${newLevel} is not in the grade table → Security and Authorization unknown` });
  const shouldShow = shouldShowFor(newLevel, kind, isIntern(profile['Hire Type'], profile['Position Title']));
  const expectedValues = {};
  const profileWrong = [];
  for (const { field, column } of PROFILE_VALUES) {
    const target = shouldShow[field];
    if (!target || !SITUATION_CHECKS.ordinary.includes(field)) continue;
    expectedValues[field] = target;
    const shows = field === 'Termination Date' ? sameDay(profile[column], target) : compareText(profile[column], target);
    if (!shows) {
      corrections.push(correction(field, profile[column], target));
      profileWrong.push(field);
    }
  }
  let profileChecked = Object.keys(expectedValues).length;
  profileChecked += 1;
  const rosterId = rosterEmployeeId(facts.roster);
  if (!trimmed(profile.Empid)) {
    corrections.push(rosterId ? { field: 'Employee ID', current: '', target: rosterId } : { field: 'Employee ID', current: '', target: EMPLOYEE_ID_BY_HAND, check: 'eight-digits' });
    profileWrong.push('Employee ID');
  } else if (rosterId && trimmed(profile.Empid).replace(/1$/, '') !== rosterId && trimmed(profile.Empid) !== rosterId) {
    notes.push({ text: `⚠ Employee ID: MySource ${trimmed(profile.Empid)} · roster ${rosterId} → get SME help to flag the profile (the ticket still closes as usual)` });
  }
  const productRow = product.backToConsulting && !inConsultingDepartment(profile);
  if (product.backToConsulting) {
    notes.push({ text: `↩ Back from Product (a return) → ${productRow ? 'Date Sensitive row to 110 - Consulting Services' : 'in 110 - Consulting Services ✓'} · Resource Manager from the DP mapping` });
  }
  const returning = !firstPartOfReturn && (move.returning || isDeactivatedProfile(profile));
  const returnRow = returning && !inConsultingDepartment(profile);
  const returnWaiting = returning && !product.toProduct && differences.length > 0;
  if (returning && !product.toProduct) {
    const from = move.from ? ` from ${move.from}` : '';
    notes.push({ text: returnWaiting
      ? `↩ A return${from} · active in MySource ✓ → waiting for it to take in the ticket`
      : `↩ A return${from} · active in MySource ✓${returnRow ? ' → Date Sensitive row to 110 - Consulting Services' : ''}` });
  }
  const needsDateSensitiveRow = productRow || returnRow;
  profileChecked += 1;
  if (levelChanges || needsDateSensitiveRow) profileWrong.push('Date Sensitive row');
  const checks = {
    ticket: { total: ticketChecked.length, pass: ticketChecked.length - ticketDiffers.length, missing: ticketDiffers },
    profile: { total: profileChecked, pass: profileChecked - profileWrong.length, missing: profileWrong },
  };
  const unresolved = withoutRule || (!grade && Boolean(newLevel));
  notes.push(...differences);
  const behind = differences.length > 0;
  if (unresolved || behind || corrections.length > 0) notes.push(...noDateNote);
  const sorted = behind || unresolved ? 'manual'
    : corrections.length ? 'to-correct'
      : scenario === KIND.none ? 'no-change' : 'aligned';
  const whatToDo = behind ? (differences.some(difference => difference.source === 'roster') ? ROSTER_NOT_UPDATED_STEP : NOT_UPDATED_STEP)
      : unresolved ? 'Sort out the lines above → then make the changes below.'
          : corrections.length ? 'Make the changes listed.'
            : scenario === KIND.none ? 'Write "No Change" in the ticket\'s Resolution Notes.'
              : 'Nothing to do.';
  const manualReasons = sorted !== 'manual' ? [] : behind ? ['not-updated'] : ['no-grade'];
  const { ticketNotes, noDateStated, ...record } = base;
  const result = {
    ...record,
    expectedValues,
    scenario,
    sorted,
    ticketAgreesWithProfile: !behind,
    manualReasons,
    kind,
    newLevel,
    newLevelFrom: newLevel ? (rosterLevel ? 'roster' : 'ticket') : '',
    needsDateSensitiveRow,
    backFromProductRow: productRow,
    returnWaiting,
    pageTicketValues: pageTicketValues(facts.fields),
    ticketCostCenter: facts.fields['Cost Center'].to,
    rosterCostCenterDescription: trimmed(facts.roster?.values['Cost Center Description']),
    rosterLevelGroup: trimmed(facts.roster?.values['Level Group']),
    corrections,
    notes,
    whatToDo,
    checks,
  };
  return applySpecialCase(result, facts, product, unsupported, move);
}
function specialManual(result, reason, notes, whatToDo, extra = {}) {
  return {
    ...result,
    scenario: KIND.manual,
    sorted: 'manual',
    manualReasons: [reason],
    corrections: [],
    notes: [...result.notes.filter(entry => !entry.field), ...[].concat(notes).map(text => ({ text }))],
    whatToDo,
    informationCorrections: result.corrections,
    ...extra,
  };
}
function applySpecialCase(result, facts, product, unsupported, move) {
  const { profile } = facts;
  if (isInactive(profile) || idWithOne(profile)) {
    const notes = [isInactive(profile)
      ? `↩ Deactivated in MySource → back into Consulting Services${move.from ? ` (from ${move.from})` : ''}`
      : '↩ Employee ID still has the deactivation\'s 1 → MySource can\'t take HXM\'s data until it is taken off'];
    const record = {
      ...result,
      specialCase: 'reactivation',
      mappingValues: returnMappingValues(facts, facts.roster),
      currentTermDate: trimmed(profile['Term Date']),
      emailBlank: !filled(profile.Email),
      inactive: isInactive(profile),
      returnRow: !inConsultingDepartment(profile),
      productToo: [profile['Talent Sub Group'], result.mappingValues?.['Talent Sub Group'], facts.roster?.values['Talent Sub Group']].some(isProductSubGroup),
    };
    return specialManual(record, 'reactivation', [...notes, ...returnRowNote(record)], reactivationSteps(result.effectiveMonday));
  }
  if (unsupported.blockedHeadcount) result = { ...result, blockedHeadcount: true };
  if (unsupported.checkPage) {
    result = { ...result, notes: [...result.notes, { text: unsupported.checkPage }], checkCostCenterDescription: true };
  }
  if (product.toProduct) {
    const checks = result.checks.profile.missing.includes('Date Sensitive row') || inProductDepartment(profile) ? result.checks : {
      ...result.checks,
      profile: { ...result.checks.profile, pass: result.checks.profile.pass - 1, missing: [...result.checks.profile.missing, 'Date Sensitive row'] },
    };
    const blocked = result.sorted === 'manual' ? result.manualReasons.filter(code => code === 'not-updated') : [];
    const checked = SITUATION_CHECKS.product;
    const kept = result.corrections.filter(change => checked.includes(change.field));
    const termination = kept.filter(change => change.field === 'Termination Date');
    const employeeId = kept.filter(change => change.field === 'Employee ID');
    const levelValues = kept.filter(change => ['Security', 'Authorization', 'Schedule Compliance', 'Assign Period'].includes(change.field));
    const productRow = !inProductDepartment(profile) || result.corrections.some(change => change.field === 'Level');
    return {
      ...result,
      corrections: kept,
      sorted: blocked.length ? 'manual' : 'to-correct',
      manualReasons: blocked,
      needsDateSensitiveRow: productRow,
      dateSensitiveDepartment: PRODUCT_DEPARTMENT,
      checks,
      resourceManagerMustBe: NO_RESOURCE_MANAGER,
      expectedValues: Object.fromEntries(Object.entries(result.expectedValues || {}).filter(([field]) => checked.includes(field))),
      whatToDo: blocked.length ? result.whatToDo
        : `Add the Date Sensitive row below · Resource Manager → "${NO_RESOURCE_MANAGER}" · add the approved comment.${termination.length ? ' · Termination Date → 12/31/9999, as on any active profile.' : ''}${employeeId.length ? ' · Employee ID: set it by hand (8 digits).' : ''}${levelValues.length ? ` · ${levelValues.map(change => change.field).join(', ')}: as the level says (below).` : ''} Change nothing else.`,
      comment: PRODUCT_COMMENT,
      specialCase: 'product',
      noResourceManager: true,
    };
  }
  return result;
}
function addDpAssignments(results, mapping) {
  return results.map(item => {
    const unlooked = extra => ({ ...item, ...extra });
    if (notMatched(item)) return unlooked({ dp: NOT_USED });
    if (item.noResourceManager || item.dpNotUsed) {
      return unlooked({ dp: NOT_USED, checks: item.noResourceManager ? withResourceManagerCheck(item, NO_RESOURCE_MANAGER) : item.checks });
    }
    if (item.sorted === 'later' || (item.manualReasons || []).includes('not-updated')) return unlooked({ dp: { ...NOT_USED, status: 'not_yet' } });
    if (item.blockedHeadcount) {
      const name = BLOCKED_HEADCOUNT_RESOURCE_MANAGER;
      const dp = { name, email: '', status: 'fixed', trail: null, summary: `CMAT, BLOCKED HEADCOUNT: the Resource Manager is always ${name}.` };
      return { ...item, dp, checks: withResourceManagerCheck(item, name) };
    }
    const level = item.newLevel || extractLevelCode(item.currentLevel);
    const found = findResourceManager(mapping, { region: item.region, values: item.mappingValues || {}, level });
    const name = found.status === 'matched' ? found.name : NO_RESOURCE_MANAGER;
    const from = item.specialCase === 'reactivation' ? RETURN_DP_FROM : '';
    const conflict = found.status === 'matched' && found.trail?.emailConflict;
    const emailNote = conflict ? `${DP_LINE_BREAK}${found.name} has different emails on these rows (${conflict.join(', ')}): no email is checked.` : '';
    const dp = { name, email: found.email, status: found.status, trail: found.trail, summary: `${from}${mappingSummary(found, item)}${emailNote}` };
    const notes = conflict ? [...(item.notes || []), { text: `⚠ ${found.name} has different emails on the DP mapping → no email is checked` }] : item.notes;
    return { ...item, ...(conflict ? { notes } : {}), dp, checks: withResourceManagerCheck(item, dp.name) };
  });
}
const NOT_USED = { name: '', email: '', status: 'not_applicable', trail: null, summary: '' };
const RETURN_DP_FROM = 'A return: looked up with where they are going (the roster\'s values, else the ticket\'s), not the old ones MySource still shows. ';
const listed = values => values.join(', ');
function mappingSummary(found, item) {
  const trail = found.trail || {};
  const rows = numbers => `row${numbers.length === 1 ? '' : 's'} ${listed(numbers)}`;
  if (found.status === 'no-sheet') {
    const regions = Object.entries(DP_MAPPING_SHEETS).map(([region, sheet]) => `${region} → ${sheet}`);
    return trail.region
      ? `Region "${trail.region}" has no sheet in the DP mapping (${listed(regions)}).`
      : 'The MySource export gives no Region, so the DP mapping\'s sheet is not known.';
  }
  const sheet = `${trail.sheet} sheet${String(trail.sheet).includes(' and ') ? 's' : ''}`;
  if (found.status === 'no-row') return [`${sheet}: no row fits → ${NO_RESOURCE_MANAGER}.`, ...nearestLines(trail.nearest)].join(DP_LINE_BREAK);
  const start = `${sheet}: ${rows(trail.rows)} fit${trail.rows.length === 1 ? 's' : ''} (${listed(trail.managers.map(name => name || 'blank'))})`;
  const by = trail.fieldsUsed.map(field => (field === 'Level1' ? `Level1 (${item.newLevel})` : field));
  const order = by.length ? `; named first in the training's order: ${listed(by)}, leaving ${rows(trail.decidingRows)}` : '';
  if (found.status === 'matched' && trail.unnamedRows?.length) {
    return `${start}${order}; ${rows(trail.unnamedRows)} ${trail.unnamedRows.length === 1 ? 'names' : 'name'} no one, so ${rows(trail.decidingRows)} → ${found.name}.`;
  }
  if (found.status === 'matched') {
    if (by.length) return `${start}${order} → ${found.name}.`;
    const open = trail.open?.length ? ` (${listed(trail.open)} blank or All on the row${trail.decidingRows.length === 1 ? '' : 's'})` : '';
    return `${sheet}, ${rows(trail.rows)}: ${trail.rows.length === 1 ? 'the row that fits' : 'the rows that fit'} → ${found.name}${open}.`;
  }
  if (found.status === 'blank') {
    return `${start}${order}, ${trail.said ? `whose Resource Manager cell says "${trail.said}", not a name` : 'with no Resource Manager'}.`;
  }
  return by.length
    ? `${start}${order.replace(/, leaving .*$/, '')}; the rows left still give different DPs (${listed(trail.managersLeft)}).`
    : `${start}; nothing in the training's order tells them apart.`;
}
const withOutcome = (status, summary) => {
  if (['matched', 'fixed', 'no-row'].includes(status)) return summary;
  const [first, ...rest] = summary.split(DP_LINE_BREAK);
  return [`${first.replace(/\.$/, '')} → ${NO_RESOURCE_MANAGER}.`, ...rest].join(DP_LINE_BREAK);
};
const DP_LINE_BREAK = '\n';
const oneLine = text => String(text ?? '').split(DP_LINE_BREAK).join(' · ');
function nearestLines(nearest) {
  if (!nearest) return [];
  if (!nearest.misses.length) return nearest.team ? [] : ['No row has their Practice, Talent Group and Talent Sub Group.'];
  return [`Didn't match: ${nearest.misses.map(({ field, mine }) => `${field} (theirs is ${mine || 'blank'})`).join(', ')}`];
}
function withResourceManagerCheck(item, target) {
  const profile = item.checks?.profile;
  if (!profile?.total || !target) return item.checks;
  const matches = normalizeText(target) === normalizeText(item.currentResourceManager);
  return {
    ...item.checks,
    profile: { total: profile.total + 1, pass: profile.pass + (matches ? 1 : 0), missing: matches ? profile.missing : [...profile.missing, 'Resource Manager'] },
  };
}
const PLANNED_FIELDS = new Set([...PROFILE_VALUES.map(value => value.field), 'Employee ID']);
function planFor(item, asOfDate) {
  if (item.sorted === 'later') {
    return {
      changes: [],
      dateSensitiveRow: null,
      blockers: [],
      planNotes: [{ text: waitUntil(item.effectiveMonday) }],
      information: null,
      changesApply: false,
    };
  }
  if (item.deadEnd) return { changes: [], dateSensitiveRow: null, blockers: [], planNotes: [], information: null, changesApply: false };
  const unreadableDate = item.unreadableDate
    ? `✗ Effective date "${item.unreadableDate}" can't be read → confirm the date and handle this case by hand`
    : '';
  if ((item.manualReasons || []).includes('not-updated') || notMatched(item)) {
    return {
      changes: [], dateSensitiveRow: null, blockers: unreadableDate ? [unreadableDate] : [], planNotes: [],
      information: { changes: [], dateSensitiveRow: null }, changesApply: false,
    };
  }
  const planNotes = [];
  const blockers = [];
  const { changes, dateSensitiveRow } = item.specialCase === 'deactivation' ? deactivationChecklist(item) : changesFor(item, planNotes, asOfDate);
  const blockedBy = [];
  if (unreadableDate) {
    blockers.push(unreadableDate);
    blockedBy.push('date');
  }
  const rowNeeded = !['deactivation', 'reactivation'].includes(item.specialCase)
    && (item.corrections.some(change => change.field === 'Level') || item.needsDateSensitiveRow);
  if (rowNeeded && !dateSensitiveRow) {
    if (!item.twoWaysDate) blockers.push('✗ The Date Sensitive row could not be worked out → add it by hand');
    blockedBy.push(item.twoWaysDate ? 'date' : planNotes.find(note => note.blocks)?.blocks || 'row');
  }
  const manual = item.sorted === 'manual' || blockers.length > 0 || blockedBy.length > 0;
  return {
    changes: manual ? [] : changes,
    dateSensitiveRow: manual ? null : dateSensitiveRow,
    blockers,
    blockedBy,
    planNotes,
    information: manual ? informationFor(item, asOfDate, { changes, dateSensitiveRow }) : null,
    changesApply: manual && !(item.manualReasons || []).some(code => INFORMATION_ONLY_REASONS.has(code)),
  };
}
function plannedFieldChanges(item) {
  return item.corrections.filter(change => PLANNED_FIELDS.has(change.field))
    .map(({ field, current, target, check }) => ({ field, current, target, ...(check ? { check } : {}) }));
}
function resourceManagerTarget(item) {
  return item.dpNotUsed ? '' : item.resourceManagerMustBe || item.dp.name || '';
}
const commentRemoval = (display, words) => ({
  field: 'Comment', current: '', target: '', display, check: 'absent', anyOf: ['Comments 2', 'Comments 3', 'Comments 4'], absentOf: words,
});
function changesFor(item, notes, asOfDate) {
  const changes = plannedFieldChanges(item);
  const manager = resourceManagerChange(item, notes);
  if (manager) changes.push(manager);
  if (item.backFromProductRow) changes.push(commentRemoval(REMOVE_PRODUCT_COMMENT, [OLD_PRODUCT_COMMENT, PRODUCT_COMMENT]));
  return { changes, dateSensitiveRow: newDateSensitiveRow(item, notes, asOfDate) };
}
function resourceManagerChange(item, planNotes) {
  const target = resourceManagerTarget(item);
  if (item.dpNotUsed) return null;
  if (item.resourceManagerMustBe) {
    if (normalizeText(target) === normalizeText(item.currentResourceManager)) return null;
    return { field: 'Resource Manager', current: item.currentResourceManager || '', target };
  }
  if (!target || normalizeText(target) === normalizeText(item.currentResourceManager)) return null;
  return { field: 'Resource Manager', current: item.currentResourceManager || '', target, source: item.dp.summary };
}
function newDateSensitiveRow(item, planNotes, asOfDate) {
  const level = item.corrections.find(change => change.field === 'Level');
  const targetLevel = level ? level.target : item.needsDateSensitiveRow ? item.newLevel : null;
  if (!targetLevel) return null;
  const levelOption = DATE_SENSITIVE_LEVEL_OPTIONS[targetLevel];
  if (!levelOption) {
    planNotes.push({ text: `✗ No Date Sensitive Level option for ${targetLevel} → add the row by hand`, blocks: 'level' });
    return null;
  }
  const effectiveDate = item.effectiveMonday || dateOfThisWeeksMonday(item, planNotes, asOfDate);
  if (!effectiveDate) return null;
  return dateSensitiveTarget(item, targetLevel, effectiveDate);
}
function dateOfThisWeeksMonday(item, planNotes, asOfDate) {
  if (item.unreadableDate || item.twoWaysDate) return '';
  if (item.ticketEffectiveDate || !item.ticketAgreesWithProfile) {
    planNotes.push({ text: '✗ The effective date could not be worked out from the ticket → check the ticket, then add the Date Sensitive row by hand', blocks: 'date' });
    return '';
  }
  const monday = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate() - asOfDate.getDay() + 1);
  const date = usDateOf(monday);
  planNotes.push({
    text: `⚠ No effective date, and the profile already shows the change → the row starts this week's Monday, ${date}: check it against the ticket`,
    answersTheMissingDate: true,
  });
  return date;
}
function informationFor(item, asOfDate, ordinaryPlan) {
  const source = { ...item, corrections: item.informationCorrections || item.corrections || [] };
  if (item.specialCase === 'deactivation') return deactivationChecklist(item);
  if (item.specialCase === 'reactivation') return returnChecklist(item);
  if (!item.informationCorrections) return ordinaryPlan;
  return changesFor(source, [], asOfDate);
}
function deactivationChecklist(item) {
  const monday = item.effectiveMonday;
  const levelOption = DATE_SENSITIVE_LEVEL_OPTIONS[extractLevelCode(item.currentLevel)];
  const done = new Set(item.stepsDone || []);
  return {
    changes: [
      { field: 'Email', current: item.email, target: '' },
      item.employeeId ? { field: 'Employee ID', current: item.employeeId, target: `${item.employeeId}1` }
        : { field: 'Employee ID', current: '', target: EMPLOYEE_ID_WITH_ONE_BY_HAND, check: 'with-one' },
      { field: 'Profile Status', current: item.currentStatus || 'Yes', target: 'No' },
      { field: 'Resource Manager', current: item.currentResourceManager || '', target: NO_RESOURCE_MANAGER },
      ...(monday ? [{ field: 'Termination Date', current: item.currentTermDate || '', target: monday }] : []),
    ].filter(change => !done.has(change.field) && SITUATION_CHECKS.deactivation.includes(change.field)),
    dateSensitiveRow: monday && levelOption && !done.has('Date Sensitive row')
      ? { effectiveDate: monday, department: X_TERM_DEPARTMENT, level: levelOption, requiredExistingShift: '' }
      : null,
  };
}
const LEVEL_FIELDS = ['Security', 'Authorization', 'Schedule Compliance', 'Assign Period'];
function returnLevelValues(item) {
  if (!item.foundLive) return (item.informationCorrections || []).filter(change => LEVEL_FIELDS.includes(change.field));
  const shouldShow = shouldShowFor(item.newLevel, item.kind || 'cs', isIntern(item.hireType, item.positionTitle, item.ticketTitle));
  return LEVEL_FIELDS.filter(field => shouldShow[field]).map(field => ({ field, current: '', target: shouldShow[field] }));
}
function returnChecklist(item) {
  const id = String(item.employeeId || '');
  const known = /^\d{8}$/.test(item.rosterEmployeeId || '') ? item.rosterEmployeeId : '';
  const idChange = (item.foundLive || !id) && known ? { field: 'Employee ID', current: '', target: known }
    : item.foundLive || !id ? { field: 'Employee ID', current: '', target: '8 digits, without the 1 added', check: 'eight-digits' }
    : /^\d{8}1$/.test(id) ? { field: 'Employee ID', current: id, target: id.slice(0, -1) } : null;
  return {
    changes: [
      ...(item.foundLive || item.emailBlank ? [{ field: 'Email', current: '', target: item.email }] : []),
      ...(idChange ? [idChange] : []),
      ...(item.inactive === false ? [] : [{ field: 'Profile Status', current: 'No', target: 'Yes' }]),
      ...(item.foundLive || !sameDay(item.currentTermDate, OPEN_TERMINATION_DATE)
        ? [{ field: 'Termination Date', current: item.currentTermDate || '', target: OPEN_TERMINATION_DATE }] : []),
      ...returnLevelValues(item),
      ...[resourceManagerChange(item, [])].filter(Boolean),
      commentRemoval(item.productToo ? REMOVE_DEACTIVATION_AND_PRODUCT_COMMENT : REMOVE_DEACTIVATION_COMMENT, [DEACTIVATION_COMMENT_WORDS, OLD_PRODUCT_COMMENT, PRODUCT_COMMENT]),
    ].filter(change => SITUATION_CHECKS.reactivation.includes(change.field)),
    dateSensitiveRow: item.returnRow ? dateSensitiveTarget({}, item.newLevel, item.effectiveMonday) : null,
  };
}
function pageChecksFor(item, asOfDate, levelGroups = {}) {
  if ((item.manualReasons || []).includes('roster-conflict')) return null;
  if (item.deadEnd || item.sorted === 'later') return null;
  if (item.pendingCostCenterDescription) return { fields: [], dateSensitive: null, costCenterDescription: BLOCKED_HEADCOUNT };
  if (item.specialCase === 'deactivation') {
    const stillDone = { 'Profile Status': 'No', 'Resource Manager': NO_RESOURCE_MANAGER };
    return {
      fields: [
        ...(item.stepsDone || []).filter(step => stillDone[step]).map(field => ({ field, target: stillDone[field], quiet: true })),
        ...commentCheck(item.comment),
      ],
      dateSensitive: null,
      ...(item.checkCostCenterDescription ? { costCenterDescription: BLOCKED_HEADCOUNT } : {}),
    };
  }
  if (item.specialCase === 'reactivation') {
    const listed = new Set(returnChecklist(item).changes.map(change => change.field));
    const undone = [['Profile Status', 'Yes'], ['Termination Date', OPEN_TERMINATION_DATE]].filter(([field]) => !listed.has(field));
    const checks = { fields: item.foundLive ? [] : undone.map(([field, target]) => ({ field, target, quiet: true })), dateSensitive: null };
    if (resourceManagerTarget(item) && item.dp?.status === 'matched' && item.dp.email) checks.resourceManagerEmail = item.dp.email;
    if (item.checkCostCenterDescription) checks.costCenterDescription = BLOCKED_HEADCOUNT;
    return checks;
  }
  if ((item.manualReasons || []).includes('not-updated')) {
    return item.returnWaiting ? {
      fields: [
        { field: 'Profile Status', target: 'Yes', quiet: true },
        { field: 'Employee ID', target: '8 digits, without the 1 added', check: 'eight-digits', quiet: true },
        { field: 'Termination Date', target: OPEN_TERMINATION_DATE, quiet: true },
      ],
      dateSensitive: null,
    } : null;
  }
  const fields = Object.entries(item.expectedValues || {}).map(([field, target]) => ({ field, target }));
  const manager = resourceManagerTarget(item);
  if (manager) fields.push({ field: 'Resource Manager', target: manager });
  fields.push({ field: 'Profile Status', target: 'Yes', quiet: true });
  if (item.email && SITUATION_CHECKS[situationOf(item)].includes('Email')) fields.push({ field: 'Email', target: item.email, quiet: true });
  fields.push(...(item.pageTicketValues || []));
  fields.push(...everythingElse(item, levelGroups));
  const dateSensitive = dateSensitiveTarget(item, item.newLevel, item.effectiveMonday || 'not stated in the ticket');
  const checks = { fields, dateSensitive };
  if (item.checkCostCenterDescription) checks.costCenterDescription = BLOCKED_HEADCOUNT;
  if (manager && item.dp?.status === 'matched' && item.dp.email) checks.resourceManagerEmail = item.dp.email;
  return checks;
}
const EXPORT_ON_THE_PAGE = ['Practice', 'Job Family', 'Job Sub Family', 'Talent Model', 'People Leader', 'Major/Minor', 'Primary Industry'];
function everythingElse(item, levelGroups) {
  const level = item.newLevel;
  const values = item.mappingValues || {};
  return [
    ...(level ? [{ field: 'Position Title', target: level, compare: 'level', display: `with ${level}`, quiet: true }] : []),
    ...(level && (item.rosterLevelGroup || levelGroups[level]) ? [{ field: 'Level Group', target: item.rosterLevelGroup || levelGroups[level], compare: 'text', quiet: true }] : []),
    ...(isIntern(item.hireType, item.positionTitle) ? [{ field: 'Current Intern', target: 'Yes', quiet: true }] : []),
    ...commentCheck(item.comment),
    ...costCenterDescriptionCheck(item),
    ...(filled(item.region) ? [{ field: 'Region', target: trimmed(item.region), compare: 'text', quiet: true }] : []),
    ...EXPORT_ON_THE_PAGE.filter(field => filled(values[field])).map(field => ({ field, target: trimmed(values[field]), compare: 'text', quiet: true })),
  ];
}
function costCenterDescriptionCheck(item) {
  const fromRoster = trimmed(item.rosterCostCenterDescription);
  if (fromRoster && !item.checkCostCenterDescription) return [{ field: 'Cost Center Description', target: fromRoster, compare: 'text', quiet: true }];
  const written = trimmed(item.ticketCostCenter);
  const description = /^\d+\s*[-‐-―−]\s*(.+)$/.exec(written)?.[1]?.trim() || '';
  if (!description || item.checkCostCenterDescription) return [];
  return [{ field: 'Cost Center Description', target: description, compare: 'text', quiet: true, ...(written.length >= TICKET_CUT_LENGTH - 2 ? { cut: true } : {}) }];
}
const commentCheck = comment => (comment
  ? [{ field: 'Comment', target: comment, contains: true, anyOf: ['Comments 4'], display: 'in Comments 4 (Comment to add)', quiet: true }] : []);
function levelGroupsIn(profiles) {
  const groups = new Map();
  for (const profile of profiles) {
    const level = extractLevelCode(profile.Level);
    const group = trimmed(profile['Level Group']);
    if (!level) continue;
    if (!groups.has(level)) groups.set(level, new Map());
    groups.get(level).set(normalizeText(group), group);
  }
  return Object.fromEntries([...groups].filter(([, found]) => found.size === 1 && [...found.values()][0])
    .map(([level, found]) => [level, [...found.values()][0]]));
}
__exports.shouldShowFor = shouldShowFor;
__exports.isIntern = isIntern;
__exports.checkCase = checkCase;
__exports.specialManual = specialManual;
__exports.applySpecialCase = applySpecialCase;
__exports.addDpAssignments = addDpAssignments;
__exports.NOT_USED = NOT_USED;
__exports.RETURN_DP_FROM = RETURN_DP_FROM;
__exports.listed = listed;
__exports.mappingSummary = mappingSummary;
__exports.withOutcome = withOutcome;
__exports.DP_LINE_BREAK = DP_LINE_BREAK;
__exports.oneLine = oneLine;
__exports.withResourceManagerCheck = withResourceManagerCheck;
__exports.PLANNED_FIELDS = PLANNED_FIELDS;
__exports.planFor = planFor;
__exports.plannedFieldChanges = plannedFieldChanges;
__exports.resourceManagerTarget = resourceManagerTarget;
__exports.commentRemoval = commentRemoval;
__exports.changesFor = changesFor;
__exports.resourceManagerChange = resourceManagerChange;
__exports.newDateSensitiveRow = newDateSensitiveRow;
__exports.dateOfThisWeeksMonday = dateOfThisWeeksMonday;
__exports.informationFor = informationFor;
__exports.deactivationChecklist = deactivationChecklist;
__exports.returnLevelValues = returnLevelValues;
__exports.returnChecklist = returnChecklist;
__exports.pageChecksFor = pageChecksFor;
__exports.EXPORT_ON_THE_PAGE = EXPORT_ON_THE_PAGE;
__exports.everythingElse = everythingElse;
__exports.costCenterDescriptionCheck = costCenterDescriptionCheck;
__exports.commentCheck = commentCheck;
__exports.levelGroupsIn = levelGroupsIn;
},
"rules/prepare.js": function (__require, __exports, document, window) {
'use strict';
const { compareStrippedCode, decodeEntities, extractLevelCode, normalizeText, withoutLeadingCode } = __require("../rules.js");
const { cleanEmail, emailDate, plainEmail, emailIndex, findByEmail: familyFindByEmail } = __require("../family/email.js");
const headerKey = value => String(value ?? '').replace(/^﻿/, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const valueKey = value => String(value ?? '').replace(/[-‐-―−]+/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const regionKey = value => String(value ?? '').replace(/\s+/g, '').toLocaleLowerCase();
const INVISIBLE = /[\s\p{Cf}]+/gu;
function decodeFully(value) {
  let text = String(value ?? '');
  for (let round = 0; round < 3; round++) {
    const next = decodeEntities(text);
    if (next === text) break;
    text = next;
  }
  return text;
}
const emailText = value => decodeFully(value).replace(INVISIBLE, '').toLocaleLowerCase();
const ADDRESS = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/;
const emailKey = cleanEmail;
function datedPrefix(value) {
  const date = emailDate(value);
  return date ? date + '_' : '';
}
function findByEmail(given, index, getEmail) {
  const { match, form, unclear } = familyFindByEmail(given, index, getEmail);
  return { match, form, unclear };
}
const ADDRESSES = new RegExp(ADDRESS.source, 'g');
const emailCandidates = value => {
  const separate = decodeFully(value).replace(/\p{Cf}/gu, '').toLocaleLowerCase().match(ADDRESSES);
  if (separate?.length > 1) return separate;
  const text = emailText(value);
  const found = text.match(ADDRESSES);
  return found || (text ? [text] : []);
};
const emailKeys = value => {
  const candidates = emailCandidates(value);
  return candidates.length === 1 ? candidates : [];
};
const exactEmployeeId = value => {
  const text = String(value ?? '').trim();
  if (text.includes('@')) return '';
  const runs = text.match(/\d+/g) || [];
  return runs.length === 1 ? runs[0] : '';
};
const sameDashes = value => String(value ?? '').replace(/[‐-―−]/g, '-');
const leadingNumber = value => (String(value ?? '').match(/\d+/) || [''])[0];
const TICKET_CUT_LENGTH = 32;
function compareTicketText(ticketValue, reportValue) {
  if (compareStrippedCode(sameDashes(ticketValue), sameDashes(reportValue))) return true;
  const cut = normalizeText(withoutLeadingCode(sameDashes(ticketValue)));
  return String(ticketValue ?? '').trim().length >= TICKET_CUT_LENGTH - 2 && cut !== ''
    && normalizeText(sameDashes(reportValue)).startsWith(cut);
}
const LEVEL_IN_FRONT = /^\s*L\s*(?:[_-]\s*)?(?:CEO|PP|MD|70|65|60|55|50|45|40|35|30|25|20|15|10|5|L)(?![A-Za-z0-9])\s*(?:[_-]\s*)?/i;
function sameValue(field, mine, theirs) {
  const costCenter = value => leadingNumber(value).replace(/^0+(?=\d)/, '');
  if (field === 'Cost Center') return Boolean(costCenter(mine)) && costCenter(mine) === costCenter(theirs);
  if (field === 'Level') return Boolean(extractLevelCode(mine)) && extractLevelCode(mine) === extractLevelCode(theirs);
  if (field === 'Position Title') {
    const words = value => normalizeText(String(value).replace(LEVEL_IN_FRONT, ''));
    const [one, two] = [words(mine), words(theirs)].sort((a, b) => a.length - b.length);
    if (one === two || (one.length >= 12 && two.startsWith(one))) return true;
  }
  return compareTicketText(mine, theirs) || compareTicketText(theirs, mine);
}
function readDay(text) {
  const match = /(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/.exec(String(text ?? ''));
  if (!match) return null;
  const [first, second, third] = match.slice(1).map(Number);
  const [year, month, date] = first > 31 ? [first, second, third] : [third, first, second];
  const short = match[first > 31 ? 1 : 3].length <= 2;
  const full = short ? 2000 + year : year;
  const leap = full % 4 === 0 && (full % 100 !== 0 || full % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || date < 1 || date > days[month - 1]) return null;
  return { year, short, month, date };
}
const fullYear = day => (day.short ? 2000 + day.year : day.year);
const usDate = (year, month, date) => `${String(month).padStart(2, '0')}/${String(date).padStart(2, '0')}/${year}`;
const usDateOf = (when, utc = false) => (utc ? usDate(when.getUTCFullYear(), when.getUTCMonth() + 1, when.getUTCDate())
  : usDate(when.getFullYear(), when.getMonth() + 1, when.getDate()));
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayAndMonth = (date, month) => (MONTH_NAMES[month - 1] ? `${date} ${MONTH_NAMES[month - 1]}` : '');
function sameDay(value, target) {
  const one = readDay(value);
  const two = readDay(target);
  if (!one || !two || one.month !== two.month || one.date !== two.date) return false;
  return one.short || two.short ? one.year % 100 === two.year % 100 : one.year === two.year;
}
function onOrBefore(value, target) {
  const [one, two] = [readDay(value), readDay(target)];
  if (!one || !two) return false;
  const number = day => fullYear(day) * 10000 + day.month * 100 + day.date;
  return number(one) <= number(two);
}
const PLACEHOLDERS = { '': ['Not Assigned', 'Unknown'], 'Primary Industry': ['N/A'], 'Hire Type': ['ZUnclassified'] };
const isPlaceholder = (field, value) => [...PLACEHOLDERS[''], ...(PLACEHOLDERS[field] || [])]
  .some(word => normalizeText(word) === normalizeText(value));
function withoutPlaceholders(row) {
  const out = { ...row };
  for (const [field, value] of Object.entries(row)) if (!field.startsWith('__') && isPlaceholder(field, value)) out[field] = '';
  return out;
}
function formOf(field, value) {
  const text = String(value ?? '').trim();
  if (!text || isPlaceholder(field, text)) return '';
  if (field === 'Cost Center') return leadingNumber(text) || valueKey(text);
  if (field === 'Level') return extractLevelCode(text) || valueKey(text);
  if (/date$/i.test(field)) {
    const day = readDay(text);
    return day ? `${day.month}/${day.date}/${day.short ? 2000 + day.year : day.year}` : valueKey(text);
  }
  if (field === 'Position Title') {
    const level = LEVEL_IN_FRONT.exec(text);
    return level ? `${extractLevelCode(level[0]).toLocaleLowerCase()} ${valueKey(text.slice(level[0].length))}` : valueKey(text);
  }
  if (field === 'Region') return regionKey(text);
  if (field === 'Major/Minor') return text.split('/').map(valueKey).filter(Boolean).join('/');
  return valueKey(withoutLeadingCode(sameDashes(text)).replace(/_/g, ' '));
}
__exports.plainEmail = plainEmail;
__exports.emailIndex = emailIndex;
__exports.headerKey = headerKey;
__exports.valueKey = valueKey;
__exports.regionKey = regionKey;
__exports.decodeFully = decodeFully;
__exports.emailKey = emailKey;
__exports.datedPrefix = datedPrefix;
__exports.findByEmail = findByEmail;
__exports.emailCandidates = emailCandidates;
__exports.emailKeys = emailKeys;
__exports.exactEmployeeId = exactEmployeeId;
__exports.sameDashes = sameDashes;
__exports.leadingNumber = leadingNumber;
__exports.TICKET_CUT_LENGTH = TICKET_CUT_LENGTH;
__exports.compareTicketText = compareTicketText;
__exports.sameValue = sameValue;
__exports.readDay = readDay;
__exports.fullYear = fullYear;
__exports.usDate = usDate;
__exports.usDateOf = usDateOf;
__exports.dayAndMonth = dayAndMonth;
__exports.sameDay = sameDay;
__exports.onOrBefore = onOrBefore;
__exports.PLACEHOLDERS = PLACEHOLDERS;
__exports.isPlaceholder = isPlaceholder;
__exports.withoutPlaceholders = withoutPlaceholders;
__exports.formOf = formOf;
},
"rules/mappings.js": function (__require, __exports, document, window) {
'use strict';
const { compareCode, compareTitle } = __require("../rules.js");
const { compareTicketText, usDate } = __require("./prepare.js");
const GRADES = {
  LPP:  { cs: ['CS_PM', 'CS_PPMD'], gps: ['GPS_PM', 'CS_PPMD'], ma: ['MA_PM', 'CS_PPMD'] },
  LCEO: { cs: ['CS_PM', 'CS_PPMD'], gps: ['GPS_PM', 'CS_PPMD'], ma: ['MA_PM', 'CS_PPMD'] },
  LMD:  { cs: ['CS_PM', 'CS_PPMD'], gps: ['GPS_PM', 'CS_PPMD'], ma: ['MA_PM', 'CS_PPMD'] },
  LL:   { cs: ['CS_PM', 'CS_PPMD'], gps: ['GPS_PM', 'CS_PPMD'], ma: ['MA_PM', 'CS_PPMD'] },
  L70:  { cs: ['CS_PM', 'CS_PM'], gps: ['GPS_PM', 'CS_PM'], ma: ['MA_PM', 'CS_PM'] },
  L60:  { cs: ['CS_PM', 'CS_PM'], gps: ['GPS_PM', 'CS_PM'], ma: ['MA_PM', 'CS_PM'] },
  L65:  { cs: ['CS_PM', 'CS_PM'], gps: ['GPS_PM', 'CS_PM'], ma: ['MA_PM', 'CS_PM'] },
  L55:  { cs: ['CS_PM', 'CS_PM'], gps: ['GPS_PM', 'CS_PM'], ma: ['MA_PM', 'CS_PM'] },
  L50:  { cs: ['CS_PM', 'CS_PM'], gps: ['GPS_PM', 'CS_PM'], ma: ['MA_PM', 'CS_PM'] },
  L45:  { cs: ['CS_PM', 'CS_PM'], gps: ['GPS_PM', 'CS_PM'], ma: ['MA_PM', 'CS_PM'] },
  L40:  { cs: ['CS_PM', 'CS_PM'], gps: ['GPS_PM', 'CS_PM'], ma: ['MA_PM', 'CS_PM'] },
  L35:  { cs: ['CS_Prof', 'CS_Prof'], gps: ['GPS_Prof', 'CS_Prof'], ma: ['MA_Prof', 'CS_Prof'] },
  L30:  { cs: ['CS_Prof', 'CS_Prof'], gps: ['GPS_Prof', 'CS_Prof'], ma: ['MA_Prof', 'CS_Prof'] },
  L25:  { cs: ['CS_Prof', 'CS_Prof'], gps: ['GPS_Prof', 'CS_Prof'], ma: ['MA_Prof', 'CS_Prof'] },
  L20:  { cs: ['CS_Prof', 'CS_Prof'], gps: ['GPS_Prof', 'CS_Prof'], ma: ['MA_Prof', 'CS_Prof'] },
  L5:   { cs: ['CS_Prof', 'CS_Prof'], gps: ['GPS_Prof', 'CS_Prof'], ma: ['MA_Prof', 'CS_Prof'] },
  L15:  { cs: ['CS_PM', 'CS_PM'], gps: ['GPS_PM', 'CS_PM'], ma: ['MA_PM', 'CS_PM'] },
  L10:  { cs: ['CS_Prof', 'CS_Prof'], gps: ['GPS_Prof', 'CS_Prof'], ma: ['MA_Prof', 'CS_Prof'] },
};
const SCHEDULE_NO_LEVELS = new Set(['LPP', 'LCEO', 'LMD', 'LL', 'L70']);
const INTERN = /\binterns?\b/;
const DATE_SENSITIVE_LEVEL_OPTIONS = {
  LPP: '110 - LPP', LCEO: '115 - LCEO', LMD: '120 - LMD', LL: '125 - LL',
  L70: '130 - L70', L60: '135 - L60', L65: '140 - L65', L55: '150 - L55',
  L50: '160 - L50', L45: '170 - L45', L40: '180 - L40', L35: '190 - L35',
  L30: '200 - L30', L25: '210 - L25', L20: '220 - L20', L5: '230 - L5',
  L15: '235 - L15', L10: '236 - L10',
};
const TICKET_FIELD_CHECKS = {
  'Cost Center': { report: 'Cost Center', compare: compareCode },
  'Business Area': { report: 'Business Area', compare: compareTicketText },
  'Business Line': { report: 'Business Line', compare: compareTicketText },
  'Talent Group': { report: 'Talent Group', compare: compareTicketText },
  'Title': { report: 'Position Title', compare: compareTitle },
  'Talent Sub Group': { report: 'Talent Sub Group', compare: compareTicketText },
  'Operating Model': { report: 'Business', compare: compareTicketText },
};
const MYSOURCE_NAMES = { 'Operating Model': 'Business', 'Title': 'Position Title' };
const mySourceName = field => MYSOURCE_NAMES[field] || field;
const CONSULTING_SERVICES_BUSINESS = 'consulting services';
const AUDIT_ASSURANCE_AREAS = ['audit', 'assurance'];
const IGNORED_TICKET_FIELDS = new Set([
  'Primary Market Offering', 'Secondary Market Offering', 'Focus Area', 'Entity',
  'Sub Business Line',
]);
const COLUMNS_NOT_USED = ['Travel', 'Rev User', 'Independence'];
const RULES_DATE = '2026-10-06';
const ASSIGN_PERIOD = 'Time';
const OPEN_TERMINATION_DATE = '12/31/9999';
const PROFILE_VALUES = [
  { field: 'Security', column: 'Security' },
  { field: 'Authorization', column: 'Authorization' },
  { field: 'Schedule Compliance', column: 'Schedule Compliance' },
  { field: 'Assign Period', column: 'Assign Period' },
  { field: 'Termination Date', column: 'Term Date' },
];
const STANDARD_CHECKS = [
  'Date Sensitive row', 'Security', 'Authorization', 'Schedule Compliance', 'Assign Period',
  'Termination Date', 'Profile Status', 'Employee ID', 'Email', 'Resource Manager', 'Comment',
];
const LEVEL_VALUES = ['Security', 'Authorization', 'Schedule Compliance', 'Assign Period'];
const SITUATION_CHECKS = {
  ordinary: ['Date Sensitive row', ...LEVEL_VALUES, 'Termination Date', 'Profile Status', 'Employee ID', 'Email', 'Resource Manager', 'Comment'],
  product: ['Date Sensitive row', ...LEVEL_VALUES, 'Termination Date', 'Profile Status', 'Employee ID', 'Email', 'Resource Manager', 'Comment'],
  deactivation: ['Date Sensitive row', 'Termination Date', 'Profile Status', 'Employee ID', 'Email', 'Resource Manager', 'Comment'],
  reactivation: ['Date Sensitive row', ...LEVEL_VALUES, 'Termination Date', 'Profile Status', 'Employee ID', 'Email', 'Resource Manager', 'Comment'],
};
const DEACTIVATION_COMMENT_WORDS = 'we have cleared the schedules and deactivated the profile';
const REMOVE_DEACTIVATION_COMMENT = 'remove the deactivation comment';
const REMOVE_DEACTIVATION_AND_PRODUCT_COMMENT = 'remove the deactivation comment (check for a Product comment too, and remove it)';
const REMOVE_PRODUCT_COMMENT = 'remove the Product comment';
const OTHER_COMMENT = '⚠ Comments 2, 3 or 4 has a comment Shuffle doesn\'t recognise → read it, and remove it if it is a deactivation or Product comment';
const situationOf = item => (SITUATION_CHECKS[item.specialCase] ? item.specialCase : 'ordinary');
const CONSULTING_DEPARTMENT = '110 - Consulting Services';
const CONSULTING_SHIFT = '500 - Consulting Services';
const PRODUCT_DEPARTMENT = '400 - Other Non Deployment';
const NO_RESOURCE_MANAGER = 'Not Applicable';
const PRODUCT_DEPARTMENT_CODE = '400';
const CLOSING_BUSINESS_AREA = 'Client & Market Acceleration Team';
const BLOCKED_HEADCOUNT = 'BLOCKED HEADCOUNT';
const BLOCKED_HEADCOUNT_RESOURCE_MANAGER = 'Headcount, Blocked';
const UNSUPPORTED_BUSINESSES = ['Tax', 'Enterprise Solutions'];
const GPS_NATIONAL_OFFICE = { practice: 'GPS', businessLine: 'National Office' };
const UNSUPPORTED_BUSINESS_AREAS = ['Products & Platforms'];
const DP_MAPPING_SHEET_NAMES = ['US', 'USI'];
const DP_MAPPING_SHEETS = { 'US - US': 'US', 'US - East': 'US', 'US - USI': 'USI' };
const DP_MAPPING_KEY = ['Practice', 'Talent Group', 'Talent Sub Group'];
const DP_MAPPING_QUALIFIERS = [
  'Business Area', 'Business Line', 'Level1', 'Job Family', 'Job Sub Family',
  'Talent Model', 'People Leader', 'Major/Minor', 'Primary Industry',
];
const DP_MAPPING_MATCHED = [
  'Practice', 'Talent Model', 'Business Area', 'Business Line', 'Talent Group', 'Talent Sub Group',
  'Job Family', 'Job Sub Family', 'Level1', 'Office Location', 'Major/Minor', 'Primary Industry',
];
const DP_MAPPING_ORDER = {
  US: ['Practice', 'Talent Model', 'Business Area', 'Business Line', 'Talent Group', 'Talent Sub Group', 'Job Family', 'Job Sub Family', 'Level1', 'Office Location'],
  USI: ['Practice', 'Business Area', 'Business Line', 'Talent Group', 'Talent Sub Group', 'Office Location', 'Level1', 'Talent Model', 'Job Family', 'Job Sub Family'],
};
const USI_OFFICE_CODES = {
  HYD: 'Hyderabad', BLR: 'Bengaluru', BEN: 'Bengaluru', GGN: 'Gurgaon', GUR: 'Gurgaon',
  MUM: 'Mumbai', PUNE: 'Pune', PUN: 'Pune', CHN: 'Chennai', CHE: 'Chennai', KOL: 'Kolkata',
};
const ALL_OFFICES = ['All USI Location', 'All'];
const PRACTICE_NAMES = {
  'Commercial USI Offshore': 'Comm USI Offshore/Onsite',
  'Commercial USI Onsite': 'Comm USI Offshore/Onsite',
};
const ROSTER_EMAIL = 'Email ID';
const ROSTER_COLUMNS = {
  'Email ID': 'Email',
  'Practice Employee': 'Practice',
  'Current Business': 'Business',
  'Current Business Area': 'Business Area',
  'Current Business Line': 'Business Line',
  'Talent Group (Employee)': 'Talent Group',
  'Talent Sub Group (Employee)': 'Talent Sub Group',
  'Job Family Desc': 'Job Family',
  'Job Sub Family Desc': 'Job Sub Family',
  'Talent Model': 'Talent Model',
  'Primary Industry': 'Primary Industry',
  Focus: 'Major/Minor',
  'Cost Center Code': 'Cost Center',
  'Current Cost Center': 'Cost Center Description',
  'Hire Type': 'Hire Type',
  'Job Level Common Desc': 'Level Group',
  'Job Level Desc': 'Level',
  'Job Sub Level Desc': null,
  Position: 'Position Title',
  'Location City': null,
  'Current Cost Center Region': 'Region',
  'Current USI Indicator': 'USI Indicator',
  'Current GPS Indicator': 'GPS Indicator',
  'Personid Combined': null,
};
const ROSTER_SHOULD_SHOW = [
  'Practice', 'Business', 'Business Area', 'Business Line', 'Talent Group', 'Talent Sub Group',
  'Job Family', 'Job Sub Family', 'Talent Model', 'Primary Industry', 'Cost Center', 'Hire Type', 'Position Title',
];
const ROSTER_EMPLOYEE_ID = 'Personid Combined';
const ROSTER_LOCATION = 'Location City';
const ROSTER_NAME = 'Full Name';
const MANUAL_GROUPS = [
  'Reactivate, then wait', 'MySource not updated yet',
  'Profile not matched', 'Not covered by the rules',
];
const MANUAL_REASONS = {
  'roster-conflict': { group: 'Profile not matched', detail: 'Roster rows disagree' },
  'reactivation': { group: 'Reactivate, then wait' },
  'not-updated': { group: 'MySource not updated yet' },
  'no-email': { group: 'Profile not matched', detail: 'No email on the ticket' },
  'duplicate-ticket': { group: 'Profile not matched', detail: 'More than one ticket' },
  'no-profile': { group: 'Profile not matched', detail: 'No profile found' },
  'duplicate-profile': { group: 'Profile not matched', detail: 'More than one profile' },
  'business-unclear': { group: 'Not covered by the rules', detail: 'GPS and M&A both' },
  'gps-indicator-unknown': { group: 'Not covered by the rules', detail: 'GPS Indicator not recognised' },
  'level-unreadable': { group: 'Not covered by the rules', detail: 'Level not readable' },
  'no-grade': { group: 'Not covered by the rules', detail: 'Level not in the grade table' },
};
const CANNOT_PLAN_GROUP = 'Not covered by the rules';
const INFORMATION_ONLY_REASONS = new Set();
const WRONG_REASONS = ['Wrong DP', 'Wrong change', 'Missing change', 'Should not wait', 'Should have waited', 'Wrong end point', 'Other'];
function pageHealthWarning(missing) {
  const named = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0];
  return `⚠ MySource page changed (${named} missing) → ⚙ → Help → Copy check.`;
}
const OLD_PRODUCT_COMMENT = "Product Professionals will be placed in 'Department = 400 – Other Non "
  + "Deployment' and no Resource Manager aligned. Please do not change profile attributes.";
const PRODUCT_COMMENT = '*DSS*-Product Professionals will be placed in “Department = 400 – Other Non '
  + 'Deployment” and no Resource Manager aligned. Please do not change profile attributes';
const theMonday = monday => monday || 'the Monday after the effective date';
function lastWorkingDayOfMay(monday) {
  const [month, , year] = String(monday || '').split('/').map(Number);
  if (!month || !year) return '';
  const endYear = month <= 5 ? year : year + 1;
  const day = new Date(endYear, 4, 31);
  while (day.getDay() === 0 || day.getDay() === 6) day.setDate(day.getDate() - 1);
  return usDate(endYear, 5, day.getDate());
}
const dnsUntil = monday => (lastWorkingDayOfMay(monday) ? `until ${lastWorkingDayOfMay(monday)} (the last working day of May)` : 'until the last working day of May');
const deactivationSteps = (monday, finishing = false) => `${finishing ? 'Finish the deactivation' : 'Deactivate'} → make the changes below${monday ? '' : ` (the effective line and Termination Date on ${theMonday(monday)})`}.`;
const deactivationSchedule = monday => `Remove all Revenue and Non-Revenue hours from Schedule + add a DNS ${dnsUntil(monday)}.`;
const X_TERM_DEPARTMENT = '999 - X-Term Professional/Client';
const deactivationComment = ticketNumber => `*DSS*-As per the notification, we have cleared the schedules and deactivated the profile${ticketNumber ? ` - ${ticketNumber}` : ''}`;
const reactivationSteps = (monday, found = true) => `Reactivate${found ? '' : ' · find the old profile in MySource by name (none? → create the profile)'} → make the changes below so HXM's data can flow. ⏳ Nothing more today: once MySource shows the ticket (about a day), it comes in again in a later import, and anything it still doesn't show is an Action case then. Keep the ServiceNow ticket open until then.`;
const PROFILE_NOT_FOUND_STEPS ='Deactivated this profile in an earlier batch? → nothing to do. Otherwise: check the ticket\'s email → find the profile in MySource by name and handle this case by hand. No profile at all? → create the profile. ⏳ Nothing more today: once MySource shows it with HXM\'s data (about a day), it comes in again in a later import, and the rest is an Action case then. Keep the ServiceNow ticket open until then.';
__exports.GRADES = GRADES;
__exports.SCHEDULE_NO_LEVELS = SCHEDULE_NO_LEVELS;
__exports.INTERN = INTERN;
__exports.DATE_SENSITIVE_LEVEL_OPTIONS = DATE_SENSITIVE_LEVEL_OPTIONS;
__exports.TICKET_FIELD_CHECKS = TICKET_FIELD_CHECKS;
__exports.mySourceName = mySourceName;
__exports.CONSULTING_SERVICES_BUSINESS = CONSULTING_SERVICES_BUSINESS;
__exports.AUDIT_ASSURANCE_AREAS = AUDIT_ASSURANCE_AREAS;
__exports.IGNORED_TICKET_FIELDS = IGNORED_TICKET_FIELDS;
__exports.COLUMNS_NOT_USED = COLUMNS_NOT_USED;
__exports.RULES_DATE = RULES_DATE;
__exports.ASSIGN_PERIOD = ASSIGN_PERIOD;
__exports.OPEN_TERMINATION_DATE = OPEN_TERMINATION_DATE;
__exports.PROFILE_VALUES = PROFILE_VALUES;
__exports.STANDARD_CHECKS = STANDARD_CHECKS;
__exports.SITUATION_CHECKS = SITUATION_CHECKS;
__exports.DEACTIVATION_COMMENT_WORDS = DEACTIVATION_COMMENT_WORDS;
__exports.REMOVE_DEACTIVATION_COMMENT = REMOVE_DEACTIVATION_COMMENT;
__exports.REMOVE_DEACTIVATION_AND_PRODUCT_COMMENT = REMOVE_DEACTIVATION_AND_PRODUCT_COMMENT;
__exports.REMOVE_PRODUCT_COMMENT = REMOVE_PRODUCT_COMMENT;
__exports.OTHER_COMMENT = OTHER_COMMENT;
__exports.situationOf = situationOf;
__exports.CONSULTING_DEPARTMENT = CONSULTING_DEPARTMENT;
__exports.CONSULTING_SHIFT = CONSULTING_SHIFT;
__exports.PRODUCT_DEPARTMENT = PRODUCT_DEPARTMENT;
__exports.NO_RESOURCE_MANAGER = NO_RESOURCE_MANAGER;
__exports.PRODUCT_DEPARTMENT_CODE = PRODUCT_DEPARTMENT_CODE;
__exports.CLOSING_BUSINESS_AREA = CLOSING_BUSINESS_AREA;
__exports.BLOCKED_HEADCOUNT = BLOCKED_HEADCOUNT;
__exports.BLOCKED_HEADCOUNT_RESOURCE_MANAGER = BLOCKED_HEADCOUNT_RESOURCE_MANAGER;
__exports.UNSUPPORTED_BUSINESSES = UNSUPPORTED_BUSINESSES;
__exports.GPS_NATIONAL_OFFICE = GPS_NATIONAL_OFFICE;
__exports.UNSUPPORTED_BUSINESS_AREAS = UNSUPPORTED_BUSINESS_AREAS;
__exports.DP_MAPPING_SHEET_NAMES = DP_MAPPING_SHEET_NAMES;
__exports.DP_MAPPING_SHEETS = DP_MAPPING_SHEETS;
__exports.DP_MAPPING_KEY = DP_MAPPING_KEY;
__exports.DP_MAPPING_QUALIFIERS = DP_MAPPING_QUALIFIERS;
__exports.DP_MAPPING_MATCHED = DP_MAPPING_MATCHED;
__exports.DP_MAPPING_ORDER = DP_MAPPING_ORDER;
__exports.USI_OFFICE_CODES = USI_OFFICE_CODES;
__exports.ALL_OFFICES = ALL_OFFICES;
__exports.PRACTICE_NAMES = PRACTICE_NAMES;
__exports.ROSTER_EMAIL = ROSTER_EMAIL;
__exports.ROSTER_COLUMNS = ROSTER_COLUMNS;
__exports.ROSTER_SHOULD_SHOW = ROSTER_SHOULD_SHOW;
__exports.ROSTER_EMPLOYEE_ID = ROSTER_EMPLOYEE_ID;
__exports.ROSTER_LOCATION = ROSTER_LOCATION;
__exports.ROSTER_NAME = ROSTER_NAME;
__exports.MANUAL_GROUPS = MANUAL_GROUPS;
__exports.MANUAL_REASONS = MANUAL_REASONS;
__exports.CANNOT_PLAN_GROUP = CANNOT_PLAN_GROUP;
__exports.INFORMATION_ONLY_REASONS = INFORMATION_ONLY_REASONS;
__exports.WRONG_REASONS = WRONG_REASONS;
__exports.pageHealthWarning = pageHealthWarning;
__exports.OLD_PRODUCT_COMMENT = OLD_PRODUCT_COMMENT;
__exports.PRODUCT_COMMENT = PRODUCT_COMMENT;
__exports.deactivationSteps = deactivationSteps;
__exports.deactivationSchedule = deactivationSchedule;
__exports.X_TERM_DEPARTMENT = X_TERM_DEPARTMENT;
__exports.deactivationComment = deactivationComment;
__exports.reactivationSteps = reactivationSteps;
__exports.PROFILE_NOT_FOUND_STEPS = PROFILE_NOT_FOUND_STEPS;
},
"screen/wording.js": function (__require, __exports, document, window) {
'use strict';
const { dayAndMonth } = __require("../rules/prepare.js");
const TOOL_NAME = 'Shuffle';
const STEP_BREAK = '\n';
function arrow(from, to) {
  return `${from || 'blank'} → ${to || 'blank'}`;
}
function withoutCode(value) {
  return String(value || '').replace(/^\s*\d+\s*[-–]\s*/, '');
}
function rowColumns(row) {
  return [
    ['Effective date', row.effectiveDate], ['Department', withoutCode(row.department)],
    ['Level', withoutCode(row.level)], ['Shift', withoutCode(row.requiredExistingShift)],
  ];
}
const UNUSED_TICKET_LINE = 'Ticket line not used: ';
const NO_DATE_FOUND = '✗ No effective date found in the ticket';
const TWO_WAYS = /^The ticket transfer-effective date "(.+)" is ambiguous \(month\/day order unclear\) and could not be resolved automatically\.$/;
function twoWaysNote(date) {
  const [first, second] = String(date).split(/[/-]/).map(Number);
  const [monthFirst, dayFirst] = [dayAndMonth(second, first), dayAndMonth(first, second)];
  const readings = monthFirst && dayFirst ? `could be ${monthFirst} or ${dayFirst}` : 'reads two ways';
  return `✗ Effective date "${date}" ${readings} → check the ticket, then add the Date Sensitive row by hand`;
}
const TICKET_READER_NOTES = [
  [/^Unrecognized description field: (.+)$/, `${UNUSED_TICKET_LINE}$1`],
  [/^No transfer-effective date is stated in this ticket\..*$/,
    '⚠ No effective date on the ticket · most fields still old? The date may not have come → check with a new MySource export'],
  [/^The transfer-effective date could not be read from the ticket Description\.$/, NO_DATE_FOUND],
  [TWO_WAYS, (match, date) => twoWaysNote(date)],
  [/^The ticket transfer-effective date must be a valid Sunday before a Date Sensitive row can be staged\.$/,
    '✗ The effective date must be a Sunday to plan a Date Sensitive row'],
];
function plainTicketNote(text) {
  const value = String(text ?? '');
  for (const [pattern, replacement] of TICKET_READER_NOTES) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }
  return value;
}
function ticketSaysNoDate(text) {
  return String(text ?? '').startsWith('No transfer-effective date is stated');
}
function unreadTicketLine(text) {
  return /^Unrecognized description field: (.+)$/.exec(String(text ?? ''))?.[1] || '';
}
function unusableDateReason(text) {
  const value = String(text ?? '');
  if (/^The ticket transfer-effective date ".+" is ambiguous/.test(value)) return 'reads two ways';
  if (value.startsWith('The ticket transfer-effective date must be a valid Sunday')) return 'not a Sunday';
  return '';
}
__exports.TOOL_NAME = TOOL_NAME;
__exports.STEP_BREAK = STEP_BREAK;
__exports.arrow = arrow;
__exports.withoutCode = withoutCode;
__exports.rowColumns = rowColumns;
__exports.UNUSED_TICKET_LINE = UNUSED_TICKET_LINE;
__exports.NO_DATE_FOUND = NO_DATE_FOUND;
__exports.TWO_WAYS = TWO_WAYS;
__exports.plainTicketNote = plainTicketNote;
__exports.ticketSaysNoDate = ticketSaysNoDate;
__exports.unreadTicketLine = unreadTicketLine;
__exports.unusableDateReason = unusableDateReason;
},
"rules/dp-mapping.js": function (__require, __exports, document, window) {
'use strict';
const { InputFileError } = __require("../input-error.js");
const { readWorkbook, ReaderUnreadableError } = __require("../family/reader/index.js");
const { ALL_OFFICES, DP_MAPPING_KEY, DP_MAPPING_MATCHED, DP_MAPPING_ORDER, DP_MAPPING_QUALIFIERS, DP_MAPPING_SHEETS, DP_MAPPING_SHEET_NAMES, PRACTICE_NAMES, USI_OFFICE_CODES } = __require("./mappings.js");
const { headerKey, regionKey, valueKey } = __require("./prepare.js");
const RESOURCE_MANAGER = 'Resource Manager';
const RESOURCE_MANAGER_EMAIL = 'Resource Manager Email';
const REQUIRED = [...DP_MAPPING_KEY, RESOURCE_MANAGER];
const OFFICE_LOCATION = 'Office Location';
const COLUMNS = [...DP_MAPPING_KEY, ...DP_MAPPING_QUALIFIERS, OFFICE_LOCATION, RESOURCE_MANAGER, RESOURCE_MANAGER_EMAIL];
async function readDpMapping(file, label = 'The DP mapping') {
  if (!/\.xlsx$/i.test(file.name || '')) {
    throw new InputFileError(`${label} must be the XLSX workbook with the US and USI sheets.`);
  }
  let workbook;
  try {
    workbook = await readWorkbook(await file.arrayBuffer());
  } catch {
    throw new InputFileError(`${label} could not be read. Save it again as XLSX.`);
  }
  const found = new Map(workbook.sheetNames.map(name => [String(name).trim().toLocaleUpperCase(), name]));
  const missing = DP_MAPPING_SHEET_NAMES.filter(sheet => !found.has(sheet));
  if (missing.length) {
    throw new InputFileError(`${label} has no ${missing.join(' or ')} sheet.`, [`Sheets found: ${workbook.sheetNames.join(', ') || 'none'}.`]);
  }
  const sheets = {};
  const headers = {};
  for (const sheet of DP_MAPPING_SHEET_NAMES) {
    let matrix;
    try {
      matrix = workbook.rows(found.get(sheet));
    } catch (error) {
      if (!(error instanceof ReaderUnreadableError)) throw error;
      throw new InputFileError(
        `${label} couldn't be read: its sheet "${error.sheetName}" is damaged.`,
        ['Open it in Excel, save it again as XLSX, and add it again.'],
      );
    }
    sheets[sheet] = sheetRecords(matrix, sheet, label);
    const headerRow = matrix.find(row => row.some(value => String(value ?? '').trim())) || [];
    headers[sheet] = headerRow.map(value => String(value ?? '').replace(/^﻿/, '').trim()).filter(Boolean);
  }
  return { fileName: file.name, sheets, headers, rowCount: Object.values(sheets).reduce((sum, rows) => sum + rows.length, 0) };
}
function sheetRecords(matrix, sheet, label) {
  const headerIndex = matrix.findIndex(row => row.some(value => String(value ?? '').trim()));
  if (headerIndex < 0) return [];
  const indexes = new Map();
  matrix[headerIndex].forEach((header, index) => {
    const key = headerKey(header);
    const column = COLUMNS.find(name => name.toLocaleLowerCase() === key);
    if (!column) return;
    if (indexes.has(column)) throw new InputFileError(`${label}'s ${sheet} sheet has two columns named “${column}”.`);
    indexes.set(column, index);
  });
  const absent = REQUIRED.filter(column => !indexes.has(column));
  if (absent.length) throw new InputFileError(`${label}'s ${sheet} sheet is missing columns.`, [`Missing: ${absent.join(', ')}`]);
  return matrix.slice(headerIndex + 1)
    .map((values, offset) => {
      const record = { __row: values.sourceRow || headerIndex + offset + 2, __sheet: sheet };
      for (const column of COLUMNS) record[column] = indexes.has(column) ? String(values[indexes.get(column)] ?? '').trim() : '';
      return record;
    })
    .filter(record => COLUMNS.some(column => record[column] !== ''));
}
function levelMatches(cell, level) {
  const code = String(level ?? '').replace(/\s+/g, '').toUpperCase();
  const text = String(cell ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, '').toUpperCase();
  if (!text || text === 'ALL') return true;
  if (!code) return false;
  const number = /^L(\d+)$/.exec(code)?.[1];
  return text.split(',').some(part => {
    const range = /^L(\d+)S(?:-L(\d+)S)?$/.exec(part);
    if (range) {
      if (number === undefined) return false;
      const from = Number(range[1]);
      const to = Number(range[2] ?? range[1]);
      return Number(number) >= from && Number(number) <= to + 9;
    }
    return part === code;
  });
}
const NOT_A_NAME = new Set(['na', 'n a', 'n/a', 'tbd', 'tbc', 'none', 'null', 'nil', 'not applicable', 'not available', 'pending', 'unknown', 'not assigned', 'unassigned', 'no dp', 'blank', 'to be decided', 'to be confirmed']);
function looksLikeAName(value) {
  return managerCellKind(value) === 'name';
}
function managerCellKind(value) {
  const text = valueKey(value);
  if (!text) return 'blank';
  if (NOT_A_NAME.has(text)) return 'placeholder';
  if (/\d/.test(text)) return 'number';
  const words = text.split(/[\s,]+/).map(word => word.replace(/[.'’()]/g, '')).filter(Boolean);
  return words.length >= 2 && words.every(word => /^\p{L}+$/u.test(word)) && words.some(word => word.length >= 2) ? 'name' : 'one word';
}
const managerKey = row => valueKey(row[RESOURCE_MANAGER]);
const distinctManagers = rows => [...new Set(rows.map(managerKey))];
const managerNames = rows => {
  const byKey = new Map();
  for (const row of rows) if (!byKey.has(managerKey(row))) byKey.set(managerKey(row), String(row[RESOURCE_MANAGER]).replace(/\s+/g, ' ').trim());
  return [...byKey.values()];
};
const cellText = (field, row) => {
  const text = String(row[field] ?? '').replace(/\*/g, ' ');
  return field === 'Level1' ? text.replace(/\([^)]*\)/g, ' ') : text;
};
const ALL_OFFICE_KEYS = new Set(['', 'all', ...ALL_OFFICES.map(valueKey)]);
function officeCities(cell) {
  const text = String(cell ?? '').replace(/\*/g, ' ');
  if (ALL_OFFICE_KEYS.has(valueKey(text)) || /\bregions?\b/i.test(text)) return null;
  const cities = text.split(/[,;/]+/).map(part => part.trim()).filter(Boolean)
    .map(part => valueKey(USI_OFFICE_CODES[part.replace(/\s+/g, '').toUpperCase()] || part));
  return cities.some(city => ALL_OFFICE_KEYS.has(city)) ? null : new Set(cities);
}
const majorParts = value => new Set(String(value ?? '').replace(/\*/g, ' ').split('/').map(valueKey).filter(Boolean));
const decidingMajor = parts => [...parts].some(part => part === 'industry' || part.includes('offering portfolio'));
const sameParts = (one, two) => [...one].join('/') === [...two].join('/');
function coversAll(field, row) {
  if (field === 'Office Location') return officeCities(row[field]) === null;
  if (field === 'Major/Minor' && (row.__sheet === 'USI' || !decidingMajor(majorParts(row[field])))) return true;
  const key = valueKey(cellText(field, row));
  return key === '' || key === 'all';
}
function fieldMatches(field, row, person) {
  if (field === 'Level1') return levelMatches(row.Level1, person.level);
  if (coversAll(field, row)) return true;
  const mine = person.values[field];
  if (!valueKey(mine)) return field === 'Talent Model';
  if (field === 'Office Location') return officeCities(row[field]).has(valueKey(mine));
  if (field === 'Major/Minor') {
    return sameParts(majorParts(row[field]), majorParts(mine));
  }
  const cell = valueKey(cellText(field, row));
  return cell === valueKey(String(mine).replace(/\*/g, ' ')) || (field === 'Practice' && cell === practiceInMapping(mine));
}
function practiceInMapping(practice) {
  const key = valueKey(String(practice ?? '').replace(/\*/g, ' '));
  const found = Object.entries(PRACTICE_NAMES).find(([name]) => valueKey(name) === key);
  return found ? valueKey(found[1].replace(/\*/g, ' ')) : '';
}
const rowIsForTeam = (row, values) => DP_MAPPING_KEY.every(field => fieldMatches(field, row, { values }));
function findResourceManager(mapping, person) {
  const { left, ...answer } = lookUp(mapping, person);
  return answer;
}
const sheetFor = region => Object.entries(DP_MAPPING_SHEETS).find(([name]) => regionKey(name) === regionKey(region))?.[1] || '';
function candidateRows(mapping, person) {
  const sheets = [sheetFor(person.region)].filter(Boolean);
  const fitting = sheets.flatMap(sheet => mapping.sheets[sheet] || [])
    .filter(row => DP_MAPPING_MATCHED.every(field => fieldMatches(field, row, person)));
  return { sheets, fitting };
}
function nearestRows(sheets, mapping, person) {
  const rows = sheets.flatMap(sheet => mapping.sheets[sheet] || []);
  const team = rows.filter(row => rowIsForTeam(row, person.values));
  const scored = (team.length ? team : rows).map(row => ({ missed: DP_MAPPING_MATCHED.filter(field => !fieldMatches(field, row, person)) }));
  const fewest = Math.min(...scored.map(entry => entry.missed.length));
  if (!scored.length || (!team.length && fewest > 2)) return { team: team.length > 0, misses: [] };
  const fields = [...new Set(scored.filter(entry => entry.missed.length === fewest).flatMap(entry => entry.missed))];
  return { team: team.length > 0, misses: fields.map(field => ({ field, mine: String(field === 'Level1' ? person.level || '' : person.values[field] || '').replace(/\s+/g, ' ').trim() })) };
}
function lookUp(mapping, person) {
  const { sheets, fitting } = candidateRows(mapping, person);
  if (!sheets.length) return { status: 'no-sheet', name: '', email: '', trail: { region: person.region || '' } };
  const rowNumbers = rows => rows.map(row => row.__row);
  const trail = {
    sheet: sheets.join(' and '),
    key: Object.fromEntries(DP_MAPPING_KEY.map(field => [field, person.values[field] || ''])),
    rows: rowNumbers(fitting),
    managers: managerNames(fitting),
    fieldsUsed: [],
    decidingRows: [],
    managersLeft: [],
  };
  if (!fitting.length) return { status: 'no-row', name: '', email: '', trail: { ...trail, nearest: nearestRows(sheets, mapping, person) } };
  let left = fitting;
  const used = [];
  for (const field of DP_MAPPING_ORDER[sheets[0]] || []) {
    if (distinctManagers(left).length <= 1) break;
    if (field === 'Talent Model' && !valueKey(person.values[field])) continue;
    const named = left.filter(row => !coversAll(field, row));
    if (named.length && named.length < left.length) {
      left = named;
      used.push(field);
    }
  }
  const openOn = rows => DP_MAPPING_KEY.filter(field => rows.every(row => coversAll(field, row)));
  const decided = (decidingRows, extra = {}) => {
    const name = managerNames(decidingRows)[0];
    const byKey = new Map();
    for (const row of decidingRows) {
      const written = String(row[RESOURCE_MANAGER_EMAIL] ?? '').replace(/\s+/g, '');
      if (written && !byKey.has(written.toLowerCase())) byKey.set(written.toLowerCase(), written);
    }
    const emails = [...byKey.values()];
    const email = emails.length === 1 ? emails[0] : '';
    const open = openOn(decidingRows);
    const result = { ...trail, fieldsUsed: used, decidingRows: rowNumbers(decidingRows), managersLeft: [name], ...(open.length ? { open } : {}), ...(emails.length > 1 ? { emailConflict: emails.sort() } : {}), ...extra };
    if (looksLikeAName(name)) return { status: 'matched', name, email, trail: result };
    return { status: 'blank', name: '', email: '', trail: { ...result, said: name } };
  };
  if (distinctManagers(left).length === 1) return decided(left);
  const named = left.filter(row => looksLikeAName(row[RESOURCE_MANAGER]));
  if (named.length && distinctManagers(named).length === 1) {
    return decided(named, { unnamedRows: rowNumbers(left.filter(row => !named.includes(row))) });
  }
  return {
    status: 'several', name: '', email: '', left,
    trail: { ...trail, fieldsUsed: used, managersLeft: managerNames(left), ...(left.length < fitting.length ? { namedRows: rowNumbers(left) } : {}) },
  };
}
const HIERARCHY = [['Talent Sub Group', 'Talent Group'], ['Talent Group', 'Business Line'], ['Business Line', 'Business Area']];
const MOST_PARENTS = 3;
function hierarchyFindings(mapping, values) {
  const rows = DP_MAPPING_SHEET_NAMES.flatMap(sheet => mapping.sheets[sheet] || []);
  const notes = [];
  for (const [child, parent] of HIERARCHY) {
    const mine = valueKey(values[child]);
    const theirs = valueKey(values[parent]);
    if (!mine || !theirs || mine === 'all') continue;
    const parents = new Map();
    let anyParent = false;
    for (const row of rows) {
      if (valueKey(row[child]) !== mine) continue;
      const key = valueKey(row[parent]);
      if (!key || key === 'all') anyParent = true;
      else parents.set(key, String(row[parent]).replace(/\s+/g, ' ').trim());
    }
    if (anyParent || !parents.size || parents.size > MOST_PARENTS || parents.has(theirs)) continue;
    const under = [...parents.values()].join(' or ');
    const [value, not] = [String(values[child]).trim(), String(values[parent]).trim()];
    notes.push({ child, value, under, not });
  }
  return notes;
}
__exports.OFFICE_LOCATION = OFFICE_LOCATION;
__exports.readDpMapping = readDpMapping;
__exports.levelMatches = levelMatches;
__exports.managerCellKind = managerCellKind;
__exports.practiceInMapping = practiceInMapping;
__exports.rowIsForTeam = rowIsForTeam;
__exports.findResourceManager = findResourceManager;
__exports.sheetFor = sheetFor;
__exports.hierarchyFindings = hierarchyFindings;
},
"files/roster.js": function (__require, __exports, document, window) {
'use strict';
const { InputFileError } = __require("../input-error.js");
const { readWorkbook } = __require("../family/reader/index.js");
const { LIMITS } = __require("../family/reader/limits.js");
const { ROSTER_COLUMNS, ROSTER_EMAIL, ROSTER_EMPLOYEE_ID } = __require("../rules/mappings.js");
const { decodeFully, emailCandidates, emailKey, exactEmployeeId, headerKey, plainEmail } = __require("../rules/prepare.js");
const ROSTER_MAX_BYTES = 1024 * 1024 * 1024;
const HEADER_SEARCH_ROWS = 50;
const rosterEmailKey = emailKey;
const EMAIL = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[A-Za-z]{2,}/g;
function rosterPeople(...rowSets) {
  const people = new Set();
  for (const rows of rowSets) {
    for (const row of rows || []) {
      for (const value of Object.values(row || {})) {
        for (const found of decodeFully(value).match(EMAIL) || []) people.add(rosterEmailKey(found));
      }
    }
  }
  return people;
}
function rosterCollector({ people = null, ids = null, extra = [], moreIds = null } = {}) {
  const candidateEmails = people ? new Set([...people].map(plainEmail)) : null;
  const known = Object.keys(ROSTER_COLUMNS);
  const columns = [...known, ...extra];
  let seen = 0;
  let headers = null;
  let indexes = null;
  let kept = null;
  let emailIndex = -1;
  let idIndex = -1;
  const rows = [];
  let totalRows = 0;
  return {
    wanted: () => kept,
    header: () => headers,
    row(values) {
      if (!headers) {
        seen += 1;
        if (!values.some(value => headerKey(value) === headerKey(ROSTER_EMAIL))) return seen < HEADER_SEARCH_ROWS;
        headers = values.map(value => String(value ?? '').replace(/^﻿/, '').trim());
        indexes = new Map();
        headers.forEach((header, index) => {
          const column = columns.find(name => headerKey(name) === headerKey(header));
          if (column && !indexes.has(column)) indexes.set(column, index);
        });
        emailIndex = indexes.get(ROSTER_EMAIL);
        idIndex = indexes.has(ROSTER_EMPLOYEE_ID) ? indexes.get(ROSTER_EMPLOYEE_ID) : -1;
        kept = new Set(indexes.values());
        return true;
      }
      if (!values.some(value => String(value ?? '').trim() !== '')) return true;
      totalRows += 1;
      const id = idIndex >= 0 ? exactEmployeeId(values[idIndex]) : '';
      const first = (candidateEmails && emailCandidates(values[emailIndex]).some(key => candidateEmails.has(plainEmail(key)))) || Boolean(ids && id && ids.has(id));
      const wanted = moreIds ? !first && moreIds.has(id) : first;
      if (wanted) rows.push(Object.fromEntries(columns.map(column => [column, indexes.has(column) ? String(values[indexes.get(column)] ?? '').trim() : ''])));
      return true;
    },
    result(fileName) {
      if (!headers) return null;
      return {
        fileName,
        rows,
        totalRows,
        people: people ? people.size : null,
        found: known.filter(column => indexes.has(column)),
        missing: known.filter(column => !indexes.has(column)),
        otherColumns: headers.filter(header => header && !columns.some(column => headerKey(column) === headerKey(header))).length,
      };
    },
  };
}
async function* textPieces(file) {
  const decoder = new TextDecoder('utf-8');
  if (typeof file.stream === 'function') {
    const reader = file.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    const rest = decoder.decode();
    if (rest) yield rest;
    return;
  }
  yield decoder.decode(new Uint8Array(await file.arrayBuffer()));
}
const SEPARATOR_SAMPLE = 64 * 1024;
function separatorOf(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char in counts) counts[char] += 1;
  }
  const [most, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count ? most : ',';
}
async function readCsvRows(file, collector) {
  let separator = null;
  let field = '';
  let values = [];
  let column = 0;
  let quoted = false;
  let quoteInQuotes = false;
  let fieldStarted = false;
  let wanted = null;
  let going = true;
  const endField = () => {
    values[column] = field;
    field = '';
    fieldStarted = false;
    column += 1;
  };
  const endRow = () => {
    endField();
    if (values.length > 1 || values[0] !== '') going = collector.row(values);
    wanted = collector.wanted();
    values = [];
    column = 0;
  };
  let sample = '';
  async function* sampled() {
    for await (const piece of textPieces(file)) {
      if (separator !== null) {
        yield piece;
        continue;
      }
      sample += piece;
      if (sample.length >= SEPARATOR_SAMPLE) {
        separator = separatorOf(sample.slice(0, SEPARATOR_SAMPLE));
        yield sample;
      }
    }
    if (separator === null) {
      separator = separatorOf(sample.slice(0, SEPARATOR_SAMPLE));
      yield sample;
    }
  }
  for await (const piece of sampled()) {
    let lineEnd = -1;
    let nextQuote = -1;
    for (let index = 0; index < piece.length && going; index++) {
      const char = piece[index];
      if (quoted) {
        if (quoteInQuotes) {
          quoteInQuotes = false;
          if (char === '"') {
            if (!wanted || wanted.has(column)) field += '"';
            continue;
          }
          quoted = false;
          if (char !== separator && char !== '\r' && char !== '\n') throw new Error('Damaged quoted CSV cell');
        } else if (char === '"') {
          quoteInQuotes = true;
          continue;
        } else if (!wanted || wanted.has(column)) {
          field += char;
          continue;
        } else {
          const close = piece.indexOf('"', index);
          index = (close < 0 ? piece.length : close) - 1;
          continue;
        }
      }
      if (char === '"' && !fieldStarted) {
        quoted = true;
        fieldStarted = true;
      } else if (char === '"') throw new Error('Damaged quoted CSV cell');
      else if (char === separator) endField();
      else if (char === '\n') endRow();
      else if (wanted && !wanted.has(column)) {
        fieldStarted = true;
        if (lineEnd < index) {
          lineEnd = piece.indexOf('\n', index);
          if (lineEnd < 0) lineEnd = piece.length;
        }
        const next = piece.indexOf(separator, index);
        if (nextQuote < index) {
          nextQuote = piece.indexOf('"', index);
          if (nextQuote < 0) nextQuote = piece.length;
        }
        index = Math.min(next < 0 ? piece.length : next, nextQuote, lineEnd) - 1;
      } else if (char !== '\r') {
        fieldStarted = true;
        field += char;
      }
    }
    if (!going) break;
  }
  if (quoted && !quoteInQuotes) throw new Error('Unfinished quoted CSV cell');
  if (going && (column > 0 || field !== '')) endRow();
}
function idsToReadAgain(result, ids) {
  const more = new Set();
  for (const row of result.rows) {
    const id = exactEmployeeId(row[ROSTER_EMPLOYEE_ID]);
    if (id.length >= 6 && !ids?.has(id)) more.add(id);
  }
  return more;
}
const withRows = (result, again) => (again ? { ...result, rows: [...result.rows, ...again.rows] } : result);
async function readRoster(file, label = 'The roster', { people = null, ids = null, extra = [] } = {}) {
  const name = file.name || '';
  if (!/\.(csv|xlsx)$/i.test(name)) throw new InputFileError(`${label} must be a CSV or XLSX file.`);
  const options = { people, ids, extra };
  const collector = rosterCollector(options);
  if (/\.csv$/i.test(name)) {
    if (file.size > ROSTER_MAX_BYTES) throw new InputFileError(`${label} is larger than 1 GB, too large to read.`);
    try {
      await readCsvRows(file, collector);
      const first = collector.result(name);
      const moreIds = first ? idsToReadAgain(first, ids) : new Set();
      if (moreIds.size) {
        const again = rosterCollector({ ...options, moreIds });
        await readCsvRows(file, again);
        return withRows(first, again.result(name));
      }
    } catch {
      throw new InputFileError(`${label} could not be read. Export it again as CSV.`);
    }
  } else {
    if (file.size > LIMITS.maxInputBytes) {
      throw new InputFileError(`${label} is too large to read as XLSX (over ${LIMITS.maxInputBytes / 1024 / 1024} MB).`, ['Export it as CSV instead: a roster CSV is read up to 1 GB.']);
    }
    let workbook;
    try {
      workbook = await readWorkbook(await file.arrayBuffer());
      for (const sheet of workbook.sheetNames) {
        const one = rosterCollector(options);
        for (const values of workbook.rows(sheet)) if (!one.row(values)) break;
        if (!one.header()) continue;
        const first = one.result(name);
        const moreIds = idsToReadAgain(first, ids);
        if (!moreIds.size) return first;
        const again = rosterCollector({ ...options, moreIds });
        for (const values of workbook.rows(sheet)) if (!again.row(values)) break;
        return withRows(first, again.result(name));
      }
    } catch (error) {
      if (error instanceof InputFileError) throw error;
      throw new InputFileError(`${label} could not be read as XLSX${error?.name === 'ReaderLimitError' ? ': it has too many cells' : ''}.`, ['Export it as CSV instead: a roster CSV is read up to 1 GB.']);
    }
  }
  const result = collector.result(name);
  if (result) return result;
  throw new InputFileError(`${label} has no ${ROSTER_EMAIL} column.`, ['It should be the Roster Standard List Report, as exported.']);
}
__exports.ROSTER_MAX_BYTES = ROSTER_MAX_BYTES;
__exports.rosterPeople = rosterPeople;
__exports.readRoster = readRoster;
},
"files/xlsx-writer.js": function (__require, __exports, document, window) {
'use strict';
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
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
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
const xml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r/g, '&#13;');
const column = index => (index < 26 ? '' : column(Math.floor(index / 26) - 1)) + String.fromCharCode(65 + (index % 26));
function sheetXml(rows) {
  const body = rows.map((cells, row) => `<row r="${row + 1}">${cells.map((cell, index) => (String(cell ?? '') === '' ? ''
    : `<c r="${column(index)}${row + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}
function xlsxBytes(sheets) {
  const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PACKAGE_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_RELS}"><Relationship Id="rId1" Type="${RELS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${MAIN}" xmlns:r="${RELS}"><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_RELS}">${sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="${RELS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${RELS}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`],
    ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet.rows)]),
  ];
  return zip(files);
}
__exports.xlsxBytes = xlsxBytes;
},
"files/file-check.js": function (__require, __exports, document, window) {
'use strict';
const { extractLevelCode, normalizeText, parseTicketDescription, profileKind, withoutLeadingCode } = __require("../rules.js");
const { CLOSING_BUSINESS_AREA, COLUMNS_NOT_USED, DATE_SENSITIVE_LEVEL_OPTIONS, DP_MAPPING_KEY, DP_MAPPING_QUALIFIERS, DP_MAPPING_SHEET_NAMES, GRADES, INTERN, MANUAL_REASONS, ROSTER_COLUMNS, ROSTER_EMAIL, ROSTER_EMPLOYEE_ID, ROSTER_SHOULD_SHOW, RULES_DATE, SCHEDULE_NO_LEVELS, TICKET_FIELD_CHECKS, mySourceName } = __require("../rules/mappings.js");
const { compareTicketText, emailIndex, findByEmail, formOf, sameValue, valueKey } = __require("../rules/prepare.js");
const { matchRoster, rosterByEmail } = __require("../rules/collate.js");
const { OFFICE_LOCATION, hierarchyFindings, managerCellKind, practiceInMapping, rowIsForTeam, sheetFor } = __require("../rules/dp-mapping.js");
const { fieldWithoutRule } = __require("../rules/rulebook.js");
const { END_POINTS, endPoint } = __require("../screen/case-summary.js");
const { unreadTicketLine, unusableDateReason } = __require("../screen/wording.js");
function fileCheck({ version, service, profile, dp, roster = null, cases = [], session = {}, page = null, asOfDate = new Date() }) {
  const tickets = (service?.rows || []).map(row => parseTicketDescription(row.Description));
  const profiles = profile?.rows || [];
  const profileIndex = emailIndex(profiles, row => row.Email);
  return [
    'SHUFFLE FILE CHECK',
    `Shuffle ${version} · rules ${RULES_DATE} · built ${day(asOfDate)} from the four files`,
    'Counts, column names, value shapes and work values only: no names, emails, IDs or ticket numbers.',
    '',
    ...ticketPart(service, tickets),
    '',
    ...profilePart(profile),
    '',
    ...joinPart(tickets, profileIndex),
    '',
    ...mappingPart(dp, profiles),
    '',
    ...batchPart(cases, dp),
    '',
    ...sessionPart(cases, session),
    '',
    ...pagePart(page),
    '',
    ...filesPart({ profile, dp, roster, tickets, profileIndex }),
    '',
    ...formsPart({ profile, dp, roster, tickets }),
  ].join('\n');
}
const day = date => [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(part => String(part).padStart(2, '0')).join('-');
function tally(values, { blank = '(blank)', limit = 20 } = {}) {
  const counts = new Map();
  for (const value of values) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim() || blank;
    counts.set(text, (counts.get(text) || 0) + 1);
  }
  const sorted = [...counts].sort((one, two) => two[1] - one[1] || one[0].localeCompare(two[0]));
  const shown = sorted.slice(0, limit).map(([text, times]) => `${text} ${times}`);
  if (sorted.length > limit) shown.push(`and ${sorted.length - limit} more`);
  return shown.join(', ') || 'none';
}
const count = (items, test) => items.filter(test).length;
const plural = (number, word) => `${number} ${word}${number === 1 ? '' : 's'}`;
const filled = value => String(value ?? '').trim() !== '';
const isClosingArea = value => filled(value) && compareTicketText(value, CLOSING_BUSINESS_AREA);
const hasCode = value => /^\s*\d+\s*-\s*\S/.test(String(value ?? ''));
const lastFirst = value => /^[^,\d]+,\s*[^,\d]+$/.test(String(value ?? '').trim());
const shape = value => String(value ?? '').trim().replace(/\d/g, '9').replace(/\p{L}/gu, 'a') || '(blank)';
const wordsKey = value => normalizeText(value).split(/[\s,]+/).filter(Boolean).sort().join(' ');
const levelOf = value => extractLevelCode(value) || 'none';
const PERSON_COLUMNS = new Set(['People Leader']);
function titleForm(title) {
  const start = /^\s*L\s*(?:CEO|PP|MD|L|\d+)(\s*[_\-–]\s*|\s+)/i.exec(String(title ?? ''));
  if (start) return `"L99${start[1].includes('_') ? '_' : start[1].trim() ? ' - ' : ' '}…"`;
  return extractLevelCode(title) ? 'level further in' : filled(title) ? 'no level' : '(no Title)';
}
function ticketPart(service, tickets) {
  const lines = new Map();
  for (const ticket of tickets) {
    for (const [side, values] of [['current', ticket.current], ['future', ticket.future]]) {
      for (const field of Object.keys(values)) {
        const entry = lines.get(field) || { current: 0, future: 0 };
        entry[side] += 1;
        lines.set(field, entry);
      }
    }
  }
  const unread = tickets.flatMap(ticket => ticket.warnings.map(unreadTicketLine).filter(Boolean));
  const labels = new Map();
  for (const label of unread) labels.set(label, (labels.get(label) || 0) + 1);
  const named = [...labels].filter(([label, times]) => times > 1 && label.length <= 40 && !/[\d@]/.test(label));
  const others = unread.length - named.reduce((sum, [, times]) => sum + times, 0);
  const usable = count(tickets, ticket => ticket.phase3EffectiveDate);
  const unusable = tickets.filter(ticket => ticket.transferEffectiveDate && !ticket.phase3EffectiveDate)
    .map(ticket => ticket.warnings.map(unusableDateReason).find(Boolean) || shape(ticket.transferEffectiveDate));
  const future = field => tickets.map(ticket => ticket.future[field]).filter(filled);
  const costCenters = tickets.flatMap(ticket => [ticket.current['Cost Center'], ticket.future['Cost Center']]).filter(filled);
  return [
    `1. SERVICENOW EXPORT: ${plural(tickets.length, 'row')}`,
    `- Other columns: ${otherColumns(service)}`,
    `- Ticket lines (current / future): ${[...lines].map(([field, seen]) => `${field} ${seen.current}/${seen.future}`).join(', ') || 'none'}`,
    `- Lines Shuffle does not read: ${named.length ? named.map(([label, times]) => `"${label}" ${times}`).join(', ') : 'none named'}${others ? `; ${others} other${others === 1 ? '' : 's'}, each on one ticket` : ''}`,
    `- Effective date: readable ${usable}, written but not usable ${unusable.length}${unusable.length ? ` (${tally(unusable)})` : ''}, not stated ${tickets.length - usable - unusable.length}`,
    `- Title, how the level is written: ${tally(tickets.map(ticket => titleForm(ticket.future.Title || ticket.current.Title)))}`,
    `- Operating Model, current: ${tally(tickets.map(ticket => ticket.current['Operating Model']).filter(filled))}`,
    `- Operating Model, future: ${tally(future('Operating Model'))}`,
    ...['Business Area', 'Business Line', 'Talent Group', 'Talent Sub Group'].map(field => `- ${field}, future: ${tally(future(field))}`),
    `- Cost Center written as: ${tally(costCenters.map(value => (/^\s*\d+\s*-\s*\S/.test(value) ? 'number - description' : /^\s*\d+\s*$/.test(value) ? 'number only' : 'other')))}`,
    '  Where: reading tickets core/rules.js (parseTicketDescription); comparing mappings.js TICKET_FIELD_CHECKS and gates.js takenIn; businesses gates.js businessMove.',
  ];
}
function otherColumns(file) {
  const unknown = file?.unknownHeaders || [];
  const expected = unknown.filter(header => COLUMNS_NOT_USED.includes(header));
  const other = unknown.filter(header => !COLUMNS_NOT_USED.includes(header));
  return [other.length ? `not recognised: ${other.join(', ')}` : 'none unrecognised', expected.length ? `known and not used: ${expected.join(', ')}` : ''].filter(Boolean).join('; ');
}
function regionWord(region) {
  const sheet = sheetFor(region);
  return sheet ? `${sheet} sheet` : 'NO SHEET';
}
const isActive = row => normalizeText(row.Active) !== 'no';
const intern = row => [row['Hire Type'], row['Position Title']].some(value => INTERN.test(normalizeText(value)));
function tableFit(rows) {
  let checked = 0;
  const differ = [];
  for (const row of rows.filter(isActive)) {
    const level = extractLevelCode(row.Level);
    const kind = profileKind(row);
    const grade = GRADES[level]?.[kind];
    if (!grade) continue;
    checked++;
    const schedule = intern(row) || SCHEDULE_NO_LEVELS.has(level) ? 'No' : 'Yes';
    for (const [field, wanted] of [['Security', grade[0]], ['Authorization', grade[1]], ['Schedule Compliance', schedule]]) {
      if (normalizeText(row[field]) !== normalizeText(wanted)) differ.push(`${level} ${kind} ${field} ${String(row[field] ?? '').trim() || '(blank)'} (table: ${wanted})`);
    }
  }
  return { checked, differ };
}
function profilePart(profile) {
  const rows = profile?.rows || [];
  const regions = new Map();
  for (const row of rows) {
    const region = String(row.Region ?? '').trim() || '(blank)';
    regions.set(region, (regions.get(region) || 0) + 1);
  }
  const managers = rows.map(row => String(row['Resource Manager'] ?? '').trim());
  const named = managers.filter(value => value && value !== '-1' && valueKey(value) !== 'not applicable');
  const fit = tableFit(rows);
  const values = field => tally(rows.map(row => row[field]));
  const titled = rows.filter(row => filled(row['Position Title']) && filled(row.Level));
  const titleOnly = titled.filter(row => extractLevelCode(row['Position Title']) && extractLevelCode(row['Position Title']) !== extractLevelCode(row.Level));
  return [
    `2. MYSOURCE EXPORT: ${plural(rows.length, 'row')}`,
    `- Other columns: ${otherColumns(profile)}`,
    `- Region: ${[...regions].sort((one, two) => two[1] - one[1]).map(([region, times]) => `${region} ${times} (${region === '(blank)' ? 'NO SHEET' : regionWord(region)})`).join(', ') || 'none'}`,
    ...['Business', 'Active', 'Department', 'Level', 'Level Group', 'Hire Type', 'Practice', 'Business Area', 'Business Line'].map(field => `- ${field}: ${values(field)}`),
    `- How the values Shuffle checks are written: ${['Security', 'Authorization', 'Schedule Compliance', 'Assign Period'].map(field => `${field}: ${values(field)}`).join('; ')}; Term Date ${tally(rows.map(row => shape(row['Term Date'])))}`,
    `- Level Group by level: ${levelGroups(rows)}`,
    `- Level in the Position Title against Level: same ${count(titled, row => extractLevelCode(row['Position Title']) === extractLevelCode(row.Level))}, different ${titleOnly.length}${titleOnly.length ? ` (title / Level: ${tally(titleOnly.map(row => `${levelOf(row['Position Title'])} / ${levelOf(row.Level)}`))})` : ''}, title without a level ${count(titled, row => !extractLevelCode(row['Position Title']))}`,
    `- Grade table and Schedule Compliance levels against ${plural(fit.checked, 'active profile')}: ${fit.differ.length ? `differ ${tally(fit.differ, { limit: 15 })}` : 'all match'}`,
    `- Blank: ${['Region', ...DP_MAPPING_KEY, 'Position Title', 'Level'].map(field => `${field} ${count(rows, row => !filled(row[field]))}`).join(', ')}`,
    `- ${DP_MAPPING_KEY.join(', ')} starting with a code ("12 - …"): ${count(rows, row => DP_MAPPING_KEY.some(field => hasCode(row[field])))}`,
    `- Resource Manager: "Last, First" ${count(named, lastFirst)}, written another way ${named.length - count(named, lastFirst)}, "-1" ${count(managers, value => value === '-1')}, Not Applicable ${count(managers, value => valueKey(value) === 'not applicable')}, blank ${count(managers, value => !value)}`,
    '  Where: columns core/common.js MY_SOURCE_HEADERS; Regions mappings.js DP_MAPPING_SHEETS; grades and Schedule Compliance mappings.js GRADES and SCHEDULE_NO_LEVELS.',
  ];
}
function joinPart(tickets, profileIndex) {
  const byEmail = email => findByEmail(email, profileIndex).match;
  const matched = tickets.map(ticket => [ticket, byEmail(ticket.email)]).filter(([, row]) => row);
  const out = [`3. TICKETS AGAINST THE MYSOURCE EXPORT: ${matched.length} of ${plural(tickets.length, 'ticket')} matched to one profile by email`];
  const loose = value => normalizeText(withoutLeadingCode(value)).replace(/\s+/g, '');
  for (const [field, check] of Object.entries(TICKET_FIELD_CHECKS)) {
    let same = 0;
    let nearly = 0;
    const differ = [];
    for (const [ticket, row] of matched) {
      const value = ticket.future[field] || ticket.current[field];
      if (!filled(value)) continue;
      if (check.compare(value, row[check.report])) same++;
      else if (loose(value) === loose(row[check.report])) nearly++;
      else differ.push(field === 'Title' ? `(titles differ, level ${levelOf(value)} / ${levelOf(row[check.report])})` : `"${String(value).trim()}" ≠ "${String(row[check.report] ?? '').trim()}"`);
    }
    if (same + nearly + differ.length) {
      out.push(`- ${field} (export ${check.report}): same ${same}, same but for case, spaces or a code ${nearly}, different ${differ.length}${differ.length ? `: ${tally(differ, { limit: 8 })}` : ''}`);
    }
  }
  const closing = [];
  for (const ticket of tickets) {
    const row = byEmail(ticket.email);
    const moving = filled(ticket.future['Business Area']) && normalizeText(ticket.future['Business Area']) !== normalizeText(ticket.current['Business Area']);
    const into = moving && isClosingArea(ticket.future['Business Area']);
    const staying = !moving && (isClosingArea(ticket.current['Business Area']) || isClosingArea(row?.['Business Area']));
    if (!into && !staying) continue;
    const costCenter = String((into ? ticket.future['Cost Center'] : ticket.future['Cost Center'] || ticket.current['Cost Center']) || '').trim();
    const description = withoutLeadingCode(costCenter).trim();
    closing.push(`${into ? 'moving in' : 'there already'}: ${!costCenter ? '(no Cost Center)' : description ? `"${description}"` : '(number only)'}`);
  }
  out.push(`- Cost Center with the ${CLOSING_BUSINESS_AREA}: ${closing.length ? tally(closing) : 'none'}`);
  out.push('  Where: how each field is compared mappings.js TICKET_FIELD_CHECKS (compare functions in core/rules.js); what a difference does gates.js takenIn; the Client & Market Acceleration Team gates.js closingArea.');
  return out;
}
const LEVEL_CODES = new Set(Object.keys(DATE_SENSITIVE_LEVEL_OPTIONS));
function levelForm(cell) {
  const text = String(cell ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, '').toUpperCase();
  if (!text) return 'blank';
  if (text === 'ALL') return 'All';
  const parts = text.split(',');
  const kinds = parts.map(part => (/^L\d+S-L\d+S$/.test(part) ? 'range' : /^L\d+S$/.test(part) ? 'group' : LEVEL_CODES.has(part) ? 'level' : 'unknown'));
  if (kinds.includes('unknown')) return 'unknown';
  if (parts.length > 1) return 'list';
  return kinds[0];
}
const LEVEL_WORDS = { All: 'All', level: 'one level', list: 'a list', group: 'a group ("L30s")', range: 'a range ("L60s-L70s")', blank: 'blank' };
const MANAGER_WORDS = { name: 'a name', blank: 'blank', placeholder: 'NA, TBD or the like', number: 'with a number', 'one word': 'one word' };
function practiceNamesLine(people, rows) {
  const onSheet = new Set(rows.map(row => valueKey(row.Practice)));
  const used = new Map();
  for (const person of people) {
    const practice = String(person.Practice ?? '').trim();
    const other = practiceInMapping(practice);
    if (!other || onSheet.has(valueKey(practice)) || !onSheet.has(other)) continue;
    used.set(practice, (used.get(practice) || 0) + 1);
  }
  return used.size ? [`  Practice names used (the Practice names table): ${[...used].map(([practice, number]) => `"${practice}" ${number}`).join(', ')}`] : [];
}
function mappingPart(dp, profiles) {
  if (!dp) return ['4. DP MAPPING: not added'];
  const out = [`4. DP MAPPING: ${plural(dp.rowCount, 'row')}`];
  for (const sheet of DP_MAPPING_SHEET_NAMES) {
    const rows = dp.sheets[sheet] || [];
    const kinds = rows.map(row => managerCellKind(row['Resource Manager']));
    const names = rows.filter((row, index) => kinds[index] === 'name').map(row => row['Resource Manager']);
    const forms = rows.map(row => levelForm(row.Level1));
    const notes = rows.flatMap(row => String(row.Level1 ?? '').match(/\([^)]*\)/g) || []);
    const unknown = rows.filter((row, index) => forms[index] === 'unknown').map(row => row.Level1);
    const keyOf = row => DP_MAPPING_KEY.map(field => valueKey(row[field])).join(' | ');
    const combos = new Map();
    rows.forEach((row, index) => {
      const managers = combos.get(keyOf(row)) || new Set();
      managers.add(kinds[index] === 'name' ? valueKey(row['Resource Manager']) : '');
      combos.set(keyOf(row), managers);
    });
    const people = profiles.filter(row => regionWord(row.Region) === `${sheet} sheet`);
    const columns = [...DP_MAPPING_KEY, ...DP_MAPPING_QUALIFIERS.filter(field => field !== 'Level1')].map(field => {
      const onSheet = new Set(rows.map(row => valueKey(row[field])));
      const used = rows.some(row => filled(row[field]));
      const missing = [...new Map(people.map(row => [valueKey(row[field]), String(row[field] ?? '').trim()])).values()]
        .filter(value => used && value && !onSheet.has(valueKey(value)) && !(field === 'Practice' && onSheet.has(practiceInMapping(value))));
      const list = missing.slice(0, 6).map(value => `"${value}"`).join(', ') + (missing.length > 6 ? ` and ${missing.length - 6} more` : '');
      const all = onSheet.has('all') ? ', "All" on some rows' : '';
      if (PERSON_COLUMNS.has(field)) return `${field}: filled on ${count(rows, row => filled(row[field]))}${all}${missing.length ? `, ${plural(missing.length, 'export value')} not on the sheet` : ''}`;
      return `${field}: filled on ${count(rows, row => filled(row[field]))}${all}${missing.length ? `, export values not on the sheet: ${list}` : ''}`;
    });
    out.push(
      `- ${sheet} sheet: ${plural(rows.length, 'row')}. Headers as written: ${(dp.headers?.[sheet] || []).join(', ') || 'none'}`,
      `  Resource Manager: ${Object.entries(MANAGER_WORDS).map(([kind, words]) => `${words} ${count(kinds, value => value === kind)}`).join(', ')}; of the names, "Last, First" ${count(names, lastFirst)}`,
      `  Resource Manager Email blank: ${count(rows, row => !row['Resource Manager Email'])}`,
      `  Level1: ${Object.entries(LEVEL_WORDS).map(([form, words]) => `${words} ${count(forms, value => value === form)}`).join(', ')}; not understood: ${unknown.length ? tally(unknown) : 'none'}; notes in brackets: ${notes.length ? tally(notes) : 'none'}`,
      `  ${DP_MAPPING_KEY.join(', ')} starting with a code ("12 - …"): ${count(rows, row => DP_MAPPING_KEY.some(field => hasCode(row[field])))}`,
      `  ${DP_MAPPING_KEY.join(' + ')}: ${plural(combos.size, 'combination')}, ${count([...combos.values()], managers => managers.size > 1)} with more than one Resource Manager`,
      `  The export's profiles for this sheet: ${people.length}, with a row for their team: ${count(people, person => rows.some(row => rowIsForTeam(row, person)))}`,
      `  Columns the lookup uses: ${columns.join('; ')}`,
      ...practiceNamesLine(people, rows),
    );
  }
  const exportNames = profiles.map(row => row['Resource Manager']).filter(value => managerCellKind(value) === 'name');
  const asWritten = new Set(exportNames.map(valueKey));
  const anyOrder = new Set(exportNames.map(wordsKey));
  const mappingNames = new Map();
  for (const sheet of DP_MAPPING_SHEET_NAMES) {
    for (const row of dp.sheets[sheet] || []) {
      if (managerCellKind(row['Resource Manager']) === 'name') mappingNames.set(valueKey(row['Resource Manager']), row['Resource Manager']);
    }
  }
  const names = [...mappingNames.values()];
  const turned = names.filter(name => !asWritten.has(valueKey(name)) && anyOrder.has(wordsKey(name)));
  out.push(`- Resource Manager names in the mapping: ${names.length}; written the same in the export ${count(names, name => asWritten.has(valueKey(name)))}, only with the words in another order ${turned.length}, not in the export ${names.length - count(names, name => asWritten.has(valueKey(name))) - turned.length}`);
  const findings = profiles.flatMap(row => hierarchyFindings(dp, row));
  out.push(`- The hierarchy (Business Area → Business Line → Talent Group → Talent Sub Group) against the export: ${findings.length
    ? `${plural(findings.length, 'profile value')} placed elsewhere: ${tally(findings.map(finding => `${finding.child} "${finding.value}" under "${finding.under}", not "${finding.not}"`), { limit: 10 })}`
    : 'every profile fits'}`);
  out.push('  Where: reading and the lookup console/dp-mapping.js; sheets, Regions and fields mappings.js (DP_MAPPING_*); the rule checks.js addDpAssignments.');
  return out;
}
function levelGroups(rows) {
  const byLevel = new Map();
  for (const row of rows) {
    const level = extractLevelCode(row.Level);
    if (!level) continue;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(String(row['Level Group'] ?? '').trim() || '(blank)');
  }
  return [...byLevel].map(([level, groups]) => `${level} → ${tally(groups)}`).join('; ') || 'none';
}
const DP_WORDS = {
  fixed: 'CMAT BLOCKED HEADCOUNT (fixed manager)',
  matched: 'found', 'no-row': 'no row fits (Not Applicable)', several: 'several DPs left', blank: 'row with no name', 'no-sheet': 'no sheet for the Region',
  not_yet: 'waiting for MySource', return: 'return found by name, no Talent groups on the ticket',
  'no-ticket-values': 'no profile, no Talent groups on the ticket', not_applicable: 'not used',
};
const sheetRows = (dp, trail) => String(trail.sheet || '').split(' and ').flatMap(sheet => dp?.sheets?.[sheet] || []);
function similar(value, candidates) {
  const plain = text => normalizeText(withoutLeadingCode(text)).replace(/\band\b|&/g, '').replace(/[^\p{L}\d]+/gu, '');
  const wanted = plain(value);
  if (!wanted) return [];
  const byKey = new Map();
  for (const candidate of candidates) {
    const other = plain(candidate);
    if (other && (other === wanted || other.includes(wanted) || wanted.includes(other)) && !byKey.has(valueKey(candidate))) byKey.set(valueKey(candidate), candidate);
  }
  return [...byKey.values()].slice(0, 3);
}
function rowsDiffer(dp, trail) {
  const inPlay = trail.namedRows || trail.rows;
  const rows = sheetRows(dp, trail).filter(row => inPlay.includes(row.__row) || inPlay.includes(`${row.__sheet} ${row.__row}`));
  const parts = DP_MAPPING_QUALIFIERS.flatMap(field => {
    const values = [...new Map(rows.map(row => [valueKey(row[field]), String(row[field] ?? '').trim() || '(blank)'])).values()];
    if (values.length < 2) return [];
    return [PERSON_COLUMNS.has(field) ? `${field} differs` : `${field} ${values.map(value => (value === '(blank)' ? value : `"${value}"`)).join(' / ')}`];
  });
  return parts.length ? `rows differ in ${parts.join(', ')}` : 'rows differ only in the Resource Manager';
}
function batchPart(cases, dp) {
  const statuses = ['ready', 'manual', 'no-action', 'later'].map(status => `${status} ${count(cases, item => item.status === status)}`);
  const reasons = cases.flatMap(item => (item.manualReasons.length ? item.manualReasons : item.status === 'manual' ? ['(plan could not be made)'] : []))
    .map(code => (MANUAL_REASONS[code] ? `${code} (${MANUAL_REASONS[code].group})` : code));
  const changes = cases.flatMap(item => [...(item.changes || []).map(change => change.field), ...(item.dateSensitiveRow ? ['Date Sensitive row'] : [])]);
  const found = cases.map(item => item.dp || {});
  const decided = found.filter(entry => entry.status === 'matched').flatMap(entry => [
    ...(entry.trail?.fieldsUsed?.length ? entry.trail.fieldsUsed.map(field => `the training's order: ${field}`)
      : entry.trail?.unnamedRows?.length ? ['one named row beside rows that name no one'] : ['one DP among the rows that fit']),
  ]);
  const sources = new Map();
  for (const { field, from } of cases.flatMap(item => item.used || []).filter(entry => TICKET_FIELD_CHECKS[entry.field])) {
    sources.set(field, [...(sources.get(field) || []), from]);
  }
  const noRow = found.filter(entry => entry.status === 'no-row').map(entry => {
    const rows = sheetRows(dp, entry.trail);
    const parts = Object.keys(entry.trail.key || {}).map(field => {
      const value = entry.trail.key?.[field] || '';
      if (!value) return `${field} (blank)`;
      const values = [...new Set(rows.map(row => String(row[field] ?? '').trim()).filter(Boolean))];
      if (values.some(other => valueKey(other) === valueKey(value))) return `${field} "${value}"`;
      const like = similar(value, values);
      return `${field} "${value}" NOT ON THE SHEET${like.length ? ` (it has ${like.map(other => `"${other}"`).join(', ')})` : ''}`;
    });
    return `${entry.trail.sheet}: ${parts.join(' / ')}`;
  });
  const several = found.filter(entry => entry.status === 'several')
    .map(entry => `${entry.trail.sheet}: ${Object.values(entry.trail.key || {}).map(value => value || '(blank)').join(' / ')} (${entry.trail.rows.length} rows${entry.trail.namedRows ? `, ${entry.trail.namedRows.length} left by the training's order` : ''}, ${entry.trail.managers.length} DPs${entry.trail.fieldsUsed?.length ? `; the training's order used: ${entry.trail.fieldsUsed.join(', ')}` : '; nothing in the training\'s order tells them apart'}; ${rowsDiffer(dp, entry.trail)})`);
  const noSheet = found.filter(entry => entry.status === 'no-sheet').map(entry => entry.trail?.region || '(blank)');
  const noRule = cases.flatMap(item => (item.notes || []).map(fieldWithoutRule).filter(Boolean));
  return [
    `5. THE BATCH: ${plural(cases.length, 'case')}`,
    `- Status: ${statuses.join(', ')}`,
    `- Why manual: ${reasons.length ? tally(reasons) : 'none'}`,
    `- Special cases: ${tally(cases.map(item => item.specialCase).filter(Boolean))}`,
    `- Changes planned, by field: ${changes.length ? tally(changes) : 'none'}`,
    `- Ticket fields changing with no rule: ${noRule.length ? tally(noRule) : 'none'}`,
    `- DP mapping: ${Object.entries(DP_WORDS).map(([status, words]) => [words, count(found, entry => entry.status === status)]).filter(([, times]) => times).map(([words, times]) => `${words} ${times}`).join(', ') || 'none'}`,
    `- Found by: ${decided.length ? tally(decided) : 'none'}`,
    `- Where the values used came from (ticket (future) / ticket / MySource / roster): ${sources.size ? [...sources].map(([field, from]) => `${field} ${tally(from)}`).join('; ') : 'none'}`,
    `- No row fits (sheet: ${DP_MAPPING_KEY.join(' / ')}): ${noRow.length ? tally(noRow, { limit: 12 }) : 'none'}`,
    `- Several DPs left: ${several.length ? tally(several, { limit: 12 }) : 'none'}`,
    `- No sheet for Region: ${noSheet.length ? tally(noSheet) : 'none'}`,
    '  Where: the stages in order rulebook.js (top of the file) and gates.js; manual reasons mappings.js MANUAL_REASONS; the plan checks.js planFor.',
  ];
}
function sessionPart(cases, { done = new Set(), outcomes = new Map(), skipped = new Set(), findings = new Map(), wrong = new Map(), pageHealth = null } = {}) {
  const byKey = new Map(cases.map(item => [item.key, item]));
  const marked = [...wrong].filter(([key, reason]) => byKey.has(key) && reason);
  const wrongLines = marked.length ? [
    `- Marked "Shuffle was wrong": ${tally(marked.map(([, reason]) => reason))}`,
    `  by end point: ${tally(marked.map(([key, reason]) => `${END_POINTS[endPoint(byKey.get(key))]} · ${reason}`))}`,
  ] : ['- Marked "Shuffle was wrong": none'];
  const health = !pageHealth ? 'no profile checked yet' : pageHealth.length ? `not found: ${pageHealth.join(', ')}` : 'every field found';
  const keys = new Set(cases.map(item => item.key));
  const found = [...findings].filter(([key]) => keys.has(key)).flatMap(([, text]) => String(text).split(' | ')).flatMap(entry => {
    const unread = /^Could not check: (.+)$/.exec(entry);
    if (unread) return unread[1].split(', ').map(field => `could not check ${field}`);
    return [entry.includes(':') && !entry.startsWith('Cost Center Description') ? entry.slice(0, entry.indexOf(':')) : entry];
  }).filter(Boolean);
  return [
    `6. THIS SESSION: done ${count([...done], key => keys.has(key))}, not done yet ${count([...skipped], key => keys.has(key) && !done.has(key))}`,
    `- Marked done anyway: ${tally([...outcomes].filter(([key]) => keys.has(key)).map(([, outcome]) => outcome))}`,
    `- The page check found: ${found.length ? tally(found) : 'nothing yet'}`,
    ...wrongLines,
    `- Page health (the first profile opened): ${health}`,
    '  Where: the page check console/review.js and console/page-readers/; field names on the page page-readers/fields.js (FIELD_COLUMNS).',
  ];
}
function pagePart(page) {
  if (!page) return ['7. THE MYSOURCE PAGE: no profile open in the MySource window. Open one and copy again to add its field names.'];
  return [
    '7. THE MYSOURCE PAGE OPEN NOW (field names, no values)',
    ...page,
    '  Where: finding fields console/page-readers/fields.js (FIELD_COLUMNS); the page check console/review.js.',
  ];
}
const DESCRIBED = ['Practice', 'Business Area', 'Business Line', 'Talent Group', 'Talent Sub Group', 'Level1', OFFICE_LOCATION, 'Job Family', 'Job Sub Family', 'Talent Model', 'Major/Minor', 'Primary Industry'];
const OUTLINE = ['Practice', 'Business Area', 'Business Line', 'Talent Group', 'Talent Sub Group'];
const MOST_OUTLINE_LINES = 400;
function loadedFilesCheck({ version, service = null, profile = null, dp = null, roster = null, asOfDate = new Date() }) {
  const tickets = (service?.rows || []).map(row => parseTicketDescription(row.Description));
  return [
    'SHUFFLE FILE CHECK — THE FILES AS LOADED',
    `Shuffle ${version} · rules ${RULES_DATE} · built ${day(asOfDate)}`,
    'Work values, counts and column names only: no names, emails, IDs, ticket numbers or Resource Managers.',
    '',
    ...filesPart({ profile, dp, roster, tickets }),
    '',
    ...formsPart({ profile, dp, roster, tickets }),
  ].join('\n');
}
function filesPart({ profile, dp, roster, tickets = [], profileIndex = emailIndex(profile?.rows || [], row => row.Email) }) {
  const people = profile?.rows || [];
  const out = ['8. THE FILES AS LOADED (for the DP rules)'];
  if (!profile && !dp && !roster) return [...out, '- No file loaded yet.'];
  out.push(profile
    ? `- MySource export, ${plural(people.length, 'row')}: ${['Region', 'Location', 'Talent Model', 'Major/Minor', 'Primary Industry', 'Job Family', 'Job Sub Family'].map(field => `${field}: ${tally(people.map(row => row[field]), { limit: 30 })}`).join('; ')}`
    : '- MySource export: not loaded');
  out.push(...rosterLines(roster, people, tickets, profileIndex));
  if (!dp) out.push('- DP mapping: not loaded');
  for (const sheet of dp ? DP_MAPPING_SHEET_NAMES : []) {
    const rows = dp.sheets[sheet] || [];
    out.push(`- DP mapping, ${sheet} sheet, ${plural(rows.length, 'row')} (a blank is All):`);
    for (const field of DESCRIBED) out.push(`  ${field}: ${tally(rows.map(row => row[field]), { limit: 40 })}`);
    out.push(`  People Leader: filled on ${count(rows, row => filled(row['People Leader']))} (not shown)`);
    out.push(`  Resource Manager: ${Object.entries(MANAGER_WORDS).map(([kind, words]) => `${words} ${count(rows, row => managerCellKind(row['Resource Manager']) === kind)}`).join(', ')} (names not shown)`);
    out.push(`  How ${OUTLINE.join(' → ')} line up (rows):`, ...outline(rows));
  }
  out.push('  Where: the roster console/roster.js and mappings.js ROSTER_COLUMNS; the DP mapping console/dp-mapping.js; the rules still to build OPEN-RULES.md section 4.');
  return out;
}
const FORM_FIELDS = [
  'Region', 'Business', 'Business Area', 'Business Line', 'Practice', 'Talent Group', 'Talent Sub Group', 'Job Family', 'Job Sub Family',
  'Talent Model', 'Major/Minor', 'Primary Industry', 'Cost Center', 'Level', 'Level Group', 'Hire Type', 'Location', 'Department', 'Position Title',
  'Security', 'Authorization', 'Schedule Compliance', 'Assign Period',
];
const MOST_FORM_VALUES = 4;
function formsPart({ profile, dp, roster, tickets = [] }) {
  const out = ['9. HOW VALUES ARE WRITTEN (read as one value; for tidying the files)'];
  const seen = new Map(FORM_FIELDS.map(field => [field, new Map()]));
  const blanks = new Map();
  const add = (source, field, value) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text || !seen.has(field)) return;
    const form = formOf(field, text);
    if (!form) {
      blanks.set(`${source} "${text}"`, (blanks.get(`${source} "${text}"`) || 0) + 1);
      return;
    }
    const spellings = seen.get(field).get(form) || new Map();
    if (!spellings.has(text)) spellings.set(text, new Set());
    spellings.get(text).add(source);
    seen.get(field).set(form, spellings);
  };
  for (const row of profile?.rows || []) for (const field of FORM_FIELDS) add('MySource', field, row[field]);
  for (const ticket of tickets) {
    for (const [field, { report }] of Object.entries(TICKET_FIELD_CHECKS)) {
      for (const side of [ticket.current, ticket.future]) add('ticket', report, side?.[field]);
    }
  }
  for (const sheet of dp ? DP_MAPPING_SHEET_NAMES : []) {
    for (const row of dp.sheets[sheet] || []) for (const field of [...DP_MAPPING_KEY, ...DP_MAPPING_QUALIFIERS]) add('DP mapping', field, row[field]);
  }
  for (const row of roster?.rows || []) {
    for (const [column, field] of Object.entries(ROSTER_COLUMNS)) if (field) add('roster', field, row[column]);
    add('roster', 'Location', row['Location City']);
  }
  let any = false;
  for (const [field, forms] of seen) {
    const several = [...forms.values()].filter(spellings => spellings.size > 1);
    if (!several.length) continue;
    any = true;
    const shown = several.slice(0, MOST_FORM_VALUES).map(spellings => [...spellings]
      .map(([text, sources]) => `"${text}" (${[...sources].join(', ')})`).join(' / '));
    out.push(`- ${field}: ${plural(several.length, 'value')} written more than one way: ${shown.join('; ')}${several.length > MOST_FORM_VALUES ? `; and ${several.length - MOST_FORM_VALUES} more` : ''}`);
  }
  if (!any) out.push('- Every value is written one way.');
  out.push(`- Read as blank (placeholders): ${blanks.size ? [...blanks].map(([what, times]) => `${what} ${times}`).join(', ') : 'none'}`);
  out.push('  Where: how a value is read console/prepare.js (formOf, PLACEHOLDERS).');
  return out;
}
function outline(rows) {
  const lines = [];
  const walk = (group, depth) => {
    if (depth === OUTLINE.length) return;
    const byValue = new Map();
    for (const row of group) {
      const value = String(row[OUTLINE[depth]] ?? '').replace(/\s+/g, ' ').trim() || '(blank)';
      byValue.set(value, [...(byValue.get(value) || []), row]);
    }
    for (const [value, under] of [...byValue].sort((one, two) => one[0].localeCompare(two[0]))) {
      lines.push(`${'  '.repeat(depth + 2)}${value} (${under.length})`);
      walk(under, depth + 1);
    }
  };
  walk(rows, 0);
  return lines.length > MOST_OUTLINE_LINES ? [...lines.slice(0, MOST_OUTLINE_LINES), `    and ${lines.length - MOST_OUTLINE_LINES} more lines`] : lines;
}
function rosterLines(roster, people, tickets, profileIndex) {
  if (!roster) return ['- Roster: not loaded'];
  const rows = roster.rows;
  const readFor = roster.people === null
    ? 'none read: add the MySource export (or the tickets) to read it for their people'
    : `read for the people in the MySource export and the tickets: ${plural(rows.length, 'row')}`;
  const out = [
    `- Roster, ${plural(roster.totalRows, 'row')} in the file; ${readFor}; columns read: ${roster.found.length} of ${Object.keys(ROSTER_COLUMNS).length}${roster.missing.length ? `, missing: ${roster.missing.join(', ')}` : ''}; other columns in the file, not read: ${roster.otherColumns}`,
  ];
  for (const column of ['Job Level Common Desc', 'Job Level Desc', 'Job Sub Level Desc', 'Position', 'Location City', 'Current Cost Center Region', 'Current USI Indicator', 'Current GPS Indicator', 'Talent Model']) {
    out.push(`  ${column}: ${tally(rows.map(row => row[column]), { limit: 30 })}`);
  }
  const rosterIndex = rosterByEmail(rows);
  const pairs = people.map(person => [matchRoster(rosterIndex, person.Email, person), person]);
  const matched = pairs.filter(([row]) => row && !row.conflicts);
  const byEmail = count(matched, ([row, person]) => findByEmail(person.Email, rosterIndex.emailIndex).match?.[1] === row);
  const paired = new Set(pairs.map(([row]) => row).filter(Boolean));
  const unpaired = count(rows, row => !paired.has(matchRoster(rosterIndex, row[ROSTER_EMAIL], { Empid: row[ROSTER_EMPLOYEE_ID] })));
  out.push(`  Matched to the MySource export by email: ${byEmail} of ${plural(people.length, 'MySource profile')}; roster rows read with no MySource profile (from the tickets) ${unpaired}`);
  out.push(`  Roster joins by Employee ID: ${matched.length - byEmail}; conflicting roster matches: ${count(pairs, ([row]) => row?.conflicts)}`);
  out.push(...rosterTicketLines(rosterIndex, profileIndex, tickets));
  if (!matched.length) return out;
  const differing = new Map(matched.map(([, person]) => [person, { real: 0, form: 0 }]));
  const holds = (field, mine, theirs) => ROSTER_SHOULD_SHOW.includes(field)
    && (field !== 'Business' || [mine, theirs].some(value => valueKey(value) === 'consulting services'));
  for (const [column, field] of Object.entries(ROSTER_COLUMNS)) {
    if (!field || ['Cost Center Description', 'USI Indicator', 'GPS Indicator'].includes(field) || column === ROSTER_EMAIL || roster.missing.includes(column)) continue;
    const seen = { same: 0, near: 0, mine: 0, theirs: 0, different: [] };
    for (const [row, person] of matched) {
      const read = value => (formOf(field, value) ? String(value ?? '').trim() : '');
      const mine = read(person[field]);
      const theirs = read(row.values[field]);
      if (!mine && !theirs) seen.same++;
      else if (!mine) seen.mine++;
      else if (!theirs) seen.theirs++;
      else if (valueKey(mine) === valueKey(theirs)) seen.same++;
      else if (sameValue(field, mine, theirs)) {
        seen.near++;
        differing.get(person).form++;
      } else {
        seen.different.push(`"${mine}" / "${theirs}"`);
        if (holds(field, mine, theirs)) differing.get(person).real++;
      }
    }
    out.push(`  ${column} ↔ MySource ${field}: same ${seen.same}, the same but for a code, a level's words or a cut ${seen.near}, different ${seen.different.length}${seen.different.length ? ` (MySource / roster: ${tally(seen.different, { limit: 6 })})` : ''}, MySource blank ${seen.mine}, roster blank ${seen.theirs}`);
  }
  const counts = [...differing.values()];
  const byHowMany = tally(counts.filter(one => one.real).map(one => (one.real >= 3 ? '3 or more fields' : plural(one.real, 'field'))));
  out.push(`  People whose MySource differs from the roster (each would be Waiting for MySource under the roster's rule): ${count(counts, one => one.real)} of ${matched.length}${count(counts, one => one.real) ? ` (${byHowMany})` : ''}; only in form (a code, a level's words or a cut) ${count(counts, one => !one.real && one.form)}; none ${count(counts, one => !one.real && !one.form)}`);
  return out;
}
function rosterTicketLines(rosterIndex, profileIndex, tickets) {
  if (!tickets.length) return ['  Tickets: not loaded, so not compared with the roster'];
  const inMySource = email => findByEmail(email, profileIndex);
  const joined = tickets.map(ticket => {
    const profile = inMySource(ticket.email).match;
    return [ticket, matchRoster(rosterIndex, ticket.email, profile)];
  });
  const found = joined.map(([ticket, row]) => [ticket, row?.conflicts ? null : row]);
  const byEmail = count(found, ([ticket, row]) => row && findByEmail(ticket.email, rosterIndex.emailIndex).match?.[1] === row);
  const out = [`  Tickets found in the roster by email: ${byEmail} of ${plural(tickets.length, 'ticket')}`,
    `  Tickets found by Employee ID: ${count(found, ([, row]) => row) - byEmail}; conflicting roster matches: ${count(joined, ([, row]) => row?.conflicts)}`];
  const rosterColumn = field => (field === 'Cost Center' ? 'Cost Center Code'
    : Object.keys(ROSTER_COLUMNS).find(column => ROSTER_COLUMNS[column] === TICKET_FIELD_CHECKS[field].report));
  for (const field of Object.keys(TICKET_FIELD_CHECKS)) {
    const column = rosterColumn(field);
    const seen = { same: 0, theirs: 0, different: [] };
    for (const [ticket, row] of found) {
      const target = filled(ticket.future[field]) ? ticket.future[field] : ticket.current[field];
      if (!row || !filled(target)) continue;
      const theirs = String(row.values[ROSTER_COLUMNS[column]] ?? '').trim();
      if (!theirs) seen.theirs++;
      else if (TICKET_FIELD_CHECKS[field].compare(target, theirs)) seen.same++;
      else seen.different.push(`"${withoutLeadingCode(target).trim() || target}" / "${theirs}"`);
    }
    if (!seen.same && !seen.theirs && !seen.different.length) continue;
    out.push(`  Ticket ${mySourceName(field)} ↔ roster ${column}: same ${seen.same}, different ${seen.different.length}${seen.different.length ? ` (ticket / roster: ${tally(seen.different, { limit: 6 })})` : ''}, roster blank ${seen.theirs}`);
  }
  const noProfile = found.filter(([ticket]) => {
    const profile = inMySource(ticket.email);
    return filled(ticket.email) && !profile.match && !profile.unclear;
  });
  const missed = count(joined, ([ticket, row]) => filled(ticket.email) && !row);
  if (missed) out.push(`  Tickets not found in the roster by email or Employee ID: ${missed}`);
  out.push(`  Tickets with no MySource profile: ${noProfile.length}; in the roster ${count(noProfile, ([, row]) => row)}${count(noProfile, ([, row]) => row) ? ` (roster Current Business: ${tally(noProfile.filter(([, row]) => row).map(([, row]) => row.values.Business))})` : ''}`);
  return out;
}
__exports.fileCheck = fileCheck;
__exports.loadedFilesCheck = loadedFilesCheck;
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
async function readWorkbook(input) {
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
        const workbook = await readXlsx(bytes);
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
function stripLeadingSlash(path) {
  return String(path).replace(/^\//, '');
}
async function readPart(entries, path) {
  const entry = entries.get(normalizeZipPath(path));
  if (!entry) return null;
  return bytesToBinaryString(await entry.read());
}
function hasPart(entries, path) {
  return entries.has(normalizeZipPath(path));
}
function checkXmlPart(xml, rootName) {
  if (typeof xml !== 'string') throw new Error('File part is missing.');
  const text = xml.replace(/^\xEF\xBB\xBF/, '');
  const tags = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?([A-Za-z_][\w:.-]*)(?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>/g;
  const stack = [];
  let rootSeen = false;
  let end = 0;
  let match;
  while ((match = tags.exec(text))) {
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
function parseWorkbook(xml) {
  checkXmlPart(xml, 'workbook');
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
function parseSharedStrings(xml) {
  const strings = [];
  const sst = matchElement(xml, 'sst');
  if (!sst) return strings;
  const items = sst[1].replace(/<(?:\w+:)?(?:si|sstItem)>/g, '').split(/<\/(?:\w+:)?(?:si|sstItem)>/);
  for (const item of items) strings.push(parseStringItem(item.trim()));
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
function parseSheetData(data, sheet, used, strings, styles, date1904) {
  const cellSplit = /<(?:\w+:)?c[ />]/;
  const referencePattern = /r=["']([^"']*)["']/;
  const arrayRefPattern = /ref=["']([^"']*)["']/;
  const chunks = data.split(/<\/(?:\w+:)?row>/);
  const sharedFormulas = [];
  const arrayFormulas = [];
  let rowNumber = 0;
  let column = 0;
  let cellCount = 0;
  for (let chunkIndex = 0; chunkIndex !== chunks.length; ++chunkIndex) {
    let chunk = chunks[chunkIndex].trim();
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
function parseWorksheet(xml, strings, styles, date1904) {
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
  if (sheetData) parseSheetData(sheetData[1], sheet, used, strings, styles, date1904);
  if (!sheet.range && used.e.c >= used.s.c && used.e.r >= used.s.r) sheet.range = used;
  return sheet;
}
async function readXlsx(bytes) {
  const entries = readZip(bytes);
  if (!hasPart(entries, '[Content_Types].xml')) throw new Error('Unsupported ZIP file.');
  const types = parseContentTypes(await readPart(entries, '[Content_Types].xml'));
  if (types.workbooks.length === 0 && hasPart(entries, 'xl/workbook.xml')) types.workbooks.push('xl/workbook.xml');
  if (types.workbooks.length === 0 || types.workbooks[0].slice(-3) === 'bin') {
    throw new Error('Binary or missing workbooks are not supported.');
  }
  let strings = [];
  if (types.strs.length) {
    try {
      const xml = await readPart(entries, stripLeadingSlash(types.strs[0]));
      checkXmlPart(xml, 'sst');
      strings = parseSharedStrings(xml);
    } catch (error) {
      if (error instanceof ReaderLimitError) throw error;
      throw new ReaderUnreadableError("Couldn't read the text in this file.");
    }
  }
  let styles = parseStyles(null);
  if (types.styles.length) styles = parseStyles(await readPart(entries, stripLeadingSlash(types.styles[0])));
  const workbookPath = stripLeadingSlash(types.workbooks[0]);
  const workbookXml = await readPart(entries, workbookPath);
  if (!workbookXml) throw new Error('Could not find the workbook.');
  const workbook = parseWorkbook(workbookXml);
  if (workbook.sheets.length > LIMITS.maxSheets) throw new ReaderLimitError('Workbook has too many sheets.');
  const slash = types.workbooks[0].lastIndexOf('/');
  let relsPath = (types.workbooks[0].slice(0, slash + 1) + '_rels/' + types.workbooks[0].slice(slash + 1) + '.rels').replace(/^\//, '');
  if (!hasPart(entries, relsPath)) relsPath = 'xl/_rels/workbook.xml.rels';
  const relationships = parseRelationships(await readPart(entries, relsPath));
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
      const xml = await readPart(entries, path);
      checkXmlPart(xml, 'worksheet');
      sheets.set(index, parseWorksheet(xml, strings, styles, workbook.date1904));
    } catch (error) {
      if (error instanceof ReaderLimitError) throw error;
      sheets.set(index, new ReaderUnreadableError(`Couldn't read the sheet "${name}" in this file.`, name));
    }
  }
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
function __transfersCreateModuleSystem(env) {
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
    const factory = __transfersModules[id];
    if (!factory) throw new Error('Transfers module not found: ' + id);
    const exports = {};
    cache.set(id, exports);
    factory(specifier => load(resolveSpecifier(id, specifier)), exports, env.document, env.window);
    return exports;
  }
  return load;
}
function __transfersPageReaders(document, CSS) {
'use strict';
const { emailKey, findByEmail } = __transfersEmailHelpers;
const FIELD_COLUMNS = {
  'email': 'EMAIL',
  'employee id': 'EMPID',
  'security': 'GROUP_ID',
  'authorization': 'AUTH_ID',
  'assign period': 'ASSIGN_PERIOD',
  'schedule compliance': 'SCHEDULE_COMPLIANCE',
  'resource manager': 'TALENTPROFESSIONAL',
  'resource manager email': 'TALENTPROFESSIONAL_EMAIL',
  'cost center description': 'COST_CENTER_DESCRIPTION',
  'termination date': 'ENDDATE',
  'profile status': 'ACTIVE',
  'business': 'FSS',
  'business area': 'HRSVCAREA',
  'business line': 'COMPETENCY',
  'cost center': 'RC',
  'talent group': 'SUBCOMPETENCY',
  'talent sub group': 'SUBCAPABILITY',
  'position title': 'Job_desc',
  'level group': 'CLASS',
  'current intern': 'IsIntern',
  'comments 2': 'COMMENTS2',
  'comments 3': 'COMMENTS3',
  'comments 4': 'COMMENTS4',
  'practice': 'PRACTICE',
  'region': 'REGION',
  'job family': 'JOB_FAMILY',
  'job sub family': 'JOB_SUB_FAMILY',
  'talent model': 'TALENT_MODEL',
  'people leader': 'PEOPLE_LEADER',
  'major/minor': 'MAJOR_MINOR',
  'primary industry': 'PRIMARY_INDUSTRY',
};
const FIELD_LABELS = {
  'termination date': ['termination date', 'term date', 'term end date'],
};
function cleanLabel(value) {
  return String(value ?? '').replace(/[*•:]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}
function fieldByColumn(name) {
  return name
    ? document.querySelector(`input[data-column-name="${name}"], textarea[data-column-name="${name}"], select[data-column-name="${name}"]`)
    : null;
}
function fieldByLabel(wanted) {
  const words = FIELD_LABELS[wanted] || [wanted];
  const label = [...document.querySelectorAll('label')].find(node => words.includes(cleanLabel(node.textContent)));
  if (!label) return null;
  if (label.htmlFor) return document.getElementById(label.htmlFor);
  return (label.closest('div, fieldset, section, td') || label.parentElement)?.querySelector('input, textarea, select') || null;
}
function mySourceField(label) {
  const wanted = cleanLabel(label);
  const byColumn = fieldByColumn(FIELD_COLUMNS[wanted]);
  const control = byColumn || fieldByLabel(wanted);
  if (!control) return { control: null, byColumn: false, readings: [] };
  const found = [];
  if (control.tagName === 'SELECT') {
    for (const option of [...control.options].filter(option => option.selected)) found.push(option.textContent, option.value);
  } else if (control.type !== 'hidden') {
    found.push(control.value);
  } else {
    const drawn = control.id && document.getElementById(`select2-${control.id}-container`);
    if (drawn) found.push(drawn.textContent);
    if (!drawn) {
      const names = [...(control.parentElement?.querySelectorAll('input.tt-input:not([type="hidden"])') || [])]
        .filter(other => !other.hasAttribute('data-column-name'));
      if (names.length === 1) found.push(names[0].value);
    }
  }
  return {
    control,
    byColumn: Boolean(byColumn),
    readable: found.some(value => value != null),
    readings: found.filter(reading => reading != null && String(reading).replace(/×/g, '').trim() !== ''),
  };
}
function profileFieldControls() {
  return Object.entries(FIELD_COLUMNS).map(([label, column]) => {
    const { control } = mySourceField(label);
    const controls = new Set([...document.querySelectorAll('input,select,textarea')]
      .filter(node => node.getAttribute('data-column-name') === column));
    if (control) controls.add(control);
    for (const code of [...controls]) {
      const drawn = code.id && document.getElementById(`select2-${code.id}-container`);
      const names = drawn
        ? [...(drawn.closest('.select2-container')?.querySelectorAll('input:not([type="hidden"])') || [])]
        : code.type === 'hidden' ? [...(code.parentElement?.querySelectorAll('input.tt-input:not([type="hidden"])') || [])]
          .filter(node => !node.hasAttribute('data-column-name')) : [];
      if (names.length === 1) controls.add(names[0]);
    }
    return { field: label.replace(/\b\w/g, letter => letter.toUpperCase()).replace(/\bId\b/g, 'ID'), controls: [...controls] };
  });
}
function readProfileControls() {
  const controls = ['Assign Period', 'Security', 'Authorization', 'Schedule Compliance', 'Resource Manager', 'Resource Manager Email']
    .map(label => {
      const { control } = mySourceField(label);
      const derived = label === 'Resource Manager Email';
      return {
        label: derived ? label + ' (system-derived)' : label,
        found: Boolean(control), required: true,
        expected: Boolean(control && (!derived || control.disabled)),
        type: control?.tagName.toLowerCase() || 'not found',
      };
    });
  const save = document.querySelector('[data-action="save"], [data-action="save-staff"]')
    || [...document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')]
      .find(node => cleanLabel(node.textContent || node.value) === 'save');
  const add = document.querySelector('[data-action="add-date-record"]');
  for (const [label, control] of [['Date Sensitive Add', add], ['Page Save (operator only)', save]]) {
    controls.push({ label, found: Boolean(control), required: true, expected: Boolean(control), type: control?.tagName.toLowerCase() || 'not found' });
  }
  return { controls };
}
function looksLikeAProfilePage(emailControl) {
  return Boolean(emailControl)
    && (Boolean(document.querySelector('[data-action="save"], [data-action="save-staff"]')) || document.querySelectorAll('label').length > 4);
}
function readIdentity(identity) {
  const compact = value => String(value ?? '').replace(/\s+/g, '').toLocaleLowerCase();
  const exactId = value => (/^\d+$/.test(String(value ?? '').trim()) ? String(value ?? '').trim() : '');
  const valueOf = control => (control ? control.value : null);
  const emailControl = mySourceField('Email').control;
  const employeeIdControl = mySourceField('Employee ID').control;
  const actualEmail = valueOf(emailControl);
  const actualEmployeeId = valueOf(employeeIdControl);
  const emailMatch = findByEmail(identity.email, actualEmail === null ? [] : [actualEmail], value => value);
  const exportMatches = Boolean(identity.profileEmail) && actualEmail !== null
    && emailKey(actualEmail) === emailKey(identity.profileEmail);
  const email = {
    found: actualEmail !== null,
    matches: Boolean(emailMatch.match) || exportMatches,
    form: emailMatch.form,
    address: emailMatch.match && emailMatch.form !== 'exact' ? emailKey(actualEmail) : '',
  };
  const comparableId = value => email.matches ? exactId(value).replace(/^0+(?=.)/, '') : exactId(value);
  const employeeId = {
    expected: Boolean(identity.employeeId),
    found: actualEmployeeId !== null,
    matches: !identity.employeeId || (Boolean(exactId(identity.employeeId)) && actualEmployeeId !== null && comparableId(actualEmployeeId) === comparableId(identity.employeeId)),
  };
  const blank = value => value === null || compact(value) === '';
  const idWithOne = exactId(identity.employeeId) ? exactId(identity.employeeId) + '1' : '';
  const otherEmail = !blank(actualEmail) && !email.matches;
  const otherEmployeeId = Boolean(identity.employeeId) && !blank(actualEmployeeId) && !employeeId.matches
    && exactId(actualEmployeeId) !== idWithOne
    && !(/^\d{8}1$/.test(exactId(identity.employeeId)) && exactId(actualEmployeeId) === exactId(identity.employeeId).slice(0, -1));
  const deactivatingSelf = Boolean(identity.deactivating) && Boolean(exactId(identity.employeeId)) && blank(actualEmail)
    && (employeeId.matches || exactId(actualEmployeeId) === idWithOne);
  const idWithoutOne = /^\d{8}1$/.test(exactId(identity.employeeId)) ? exactId(identity.employeeId).slice(0, -1) : '';
  const idOrOne = employeeId.matches || (Boolean(identity.deactivating) && Boolean(idWithOne) && !blank(actualEmployeeId) && exactId(actualEmployeeId) === idWithOne)
    || (Boolean(idWithoutOne) && exactId(actualEmployeeId) === idWithoutOne);
  const digits = exactId(actualEmployeeId);
  const returnId = idWithoutOne || exactId(identity.employeeId);
  const returningById = Boolean(identity.returning) && Boolean(returnId)
    && (digits === returnId || digits === `${returnId}1`);
  const returningSelf = returningById || (Boolean(identity.returning) && !otherEmail && email.matches);
  const caseId = exactId(identity.employeeId);
  const rosterId = exactId(identity.rosterEmployeeId);
  const baseId = idWithoutOne || caseId || rosterId;
  const deactivatedById = !identity.deactivating && !identity.returning && email.found && blank(actualEmail)
    && Boolean(baseId) && employeeId.found
    && [baseId, `${baseId}1`].includes(exactId(actualEmployeeId));
  return {
    pageDetected: looksLikeAProfilePage(emailControl),
    returning: returningSelf && !email.matches,
    email,
    employeeId,
    verified: (email.matches && (!employeeId.found || idOrOne || Boolean(identity.returning))) || deactivatingSelf || returningSelf || deactivatedById,
    deactivated: deactivatingSelf,
    deactivatedById,
    otherPerson: !returningById && (otherEmail || (otherEmployeeId && !deactivatedById)),
    emailCleared: email.found && blank(actualEmail),
  };
}
function readValues(asks) {
  const SAME = { y: 'yes', n: 'no' };
  const normalized = value => {
    const text = String(value ?? '').replace(/×/g, '').replace(/[_\-‐-―−]+/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    return SAME[text] || text;
  };
  const withoutCode = value => String(value ?? '').replace(/^\s*\d+\s*[\-‐-―−]\s*/, '');
  const sameTicketText = (reading, ask) => {
    const page = normalized(withoutCode(reading));
    const ticket = normalized(withoutCode(ask.target));
    return page === ticket || (Boolean(ask.cut) && ticket !== '' && page.startsWith(ticket));
  };
  const number = value => (/^\s*(\d+)/.exec(String(value ?? ''))?.[1] || '').replace(/^0+(?=\d)/, '');
  const levelIn = value => {
    const found = /^\s*L\s*[_-]?\s*(PP|CEO|MD|L|\d+)(?![A-Za-z0-9])/i.exec(String(value ?? ''));
    return found ? `L${found[1].toUpperCase()}` : '';
  };
  const day = text => {
    const found = /(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/.exec(String(text ?? ''));
    if (!found) return null;
    const [first, second, third] = found.slice(1).map(Number);
    const [year, month, date] = first > 31 ? [first, second, third] : [third, first, second];
    return { year, short: found[first > 31 ? 1 : 3].length <= 2, month, date };
  };
  const sameDay = (one, two) => Boolean(one && two) && one.month === two.month && one.date === two.date
    && (one.short || two.short ? one.year % 100 === two.year % 100 : one.year === two.year);
  const matches = (reading, target) => {
    if (day(target)) return sameDay(day(reading), day(target));
    const wanted = normalized(target);
    return normalized(reading) === wanted || String(reading).split(/\s+[-–]\s+/).some(part => normalized(part) === wanted);
  };
  const values = asks.map(ask => {
    if (ask.field === 'Date Sensitive row') return { label: ask.field, available: false, matches: false };
    const found = (ask.anyOf || [ask.field]).map(name => mySourceField(name));
    const control = found.find(field => field.control)?.control || null;
    const readings = found.flatMap(field => field.readings);
    const readable = ask.check === 'absent' ? found.every(field => field.control && field.readable) : found.some(field => field.readable);
    if (!control || !readable || (ask.whenFilled && !readings.length)) return { label: ask.field, available: false, matches: false };
    if (ask.check === 'eight-digits') return { label: ask.field, available: true, matches: readings.some(reading => /^\d{8}$/.test(String(reading).trim())) };
    if (ask.check === 'with-one') return { label: ask.field, available: true, matches: readings.some(reading => /^\d{8}1$/.test(String(reading).trim())) };
    if (ask.check === 'termination-date') {
      const dateNumber = text => {
        const value = day(text);
        if (!value) return null;
        const year = value.short ? 2000 + value.year : value.year;
        const actual = new Date(Date.UTC(year, value.month - 1, value.date));
        return actual.getUTCFullYear() === year && actual.getUTCMonth() === value.month - 1 && actual.getUTCDate() === value.date
          ? year * 10000 + value.month * 100 + value.date : null;
      };
      const latest = ask.latest ? dateNumber(ask.latest) : null;
      return { label: ask.field, available: true, matches: readings.some(reading => {
        const date = dateNumber(reading);
        return date !== null && date !== 99991231 && (!ask.latest || (latest !== null && date <= latest));
      }) };
    }
    if (ask.check === 'absent') {
      const known = readings.some(reading => (ask.absentOf || []).some(text => normalized(reading).includes(normalized(text))));
      return { label: ask.field, available: true, matches: !known, ...(!known && readings.length ? { otherText: true } : {}) };
    }
    return {
      label: ask.field,
      available: true,
      ...(ask.giveText ? { text: readings.map(reading => String(reading).replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ') } : {}),
      matches: ask.contains
        ? readings.some(reading => normalized(reading).includes(normalized(ask.target)))
        : ask.compare === 'code' ? readings.some(reading => number(reading) !== '' && number(reading) === number(ask.target))
          : ask.compare === 'level' ? readings.some(reading => levelIn(reading) === String(ask.target).toUpperCase())
          : ask.compare === 'text' ? readings.some(reading => sameTicketText(reading, ask))
            : readings.length ? readings.some(reading => matches(reading, ask.target)) : normalized(ask.target) === '',
    };
  });
  let order = null;
  const positionOf = ask => {
    const control = (ask.anyOf || [ask.field]).map(name => mySourceField(name).control).find(Boolean);
    if (!control) return null;
    if (!order) {
      order = new Map();
      let index = 0;
      for (const node of document.getElementsByTagName('*')) order.set(node, index++);
    }
    return order.has(control) ? order.get(control) : null;
  };
  return {
    pageDetected: looksLikeAProfilePage(mySourceField('Email').control),
    values: values.map((value, index) => (asks[index].field === 'Date Sensitive row' ? value : { ...value, position: positionOf(asks[index]) })),
  };
}
function listFields() {
  return ['Security', 'Authorization', 'Assign Period', 'Schedule Compliance', 'Resource Manager', 'Termination Date', 'Cost Center Description',
    'Profile Status', 'Business', 'Business Area', 'Business Line', 'Cost Center', 'Talent Group', 'Talent Sub Group',
    'Position Title', 'Level Group', 'Current Intern', 'Comments 2', 'Comments 3', 'Comments 4', 'Practice', 'Region', 'Job Family', 'Job Sub Family',
    'Talent Model', 'People Leader', 'Major/Minor', 'Primary Industry'].map(label => {
    const { control, byColumn, readings } = mySourceField(label);
    return { label, found: Boolean(control), byColumn, readable: readings.length > 0 };
  });
}
function readDateSensitiveRow(expected) {
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const parts = value => {
    const text = clean(value).replace(/\s*[-–]\s+|\s+[-–]\s*/g, ' - ').toLocaleLowerCase();
    const split = text.indexOf(' - ');
    return split < 0 ? { full: text } : { full: text, code: text.slice(0, split), name: text.slice(split + 3) };
  };
  const same = (left, right) => {
    const one = parts(left);
    const two = parts(right);
    if (one.full === two.full) return true;
    if (Boolean(one.code) === Boolean(two.code)) return false;
    const coded = one.code ? one : two;
    const plain = one.code ? two : one;
    return plain.full === coded.code || plain.full === coded.name;
  };
  const dateValue = value => {
    let [month, day, year] = clean(value).split(/[/.-]/).map(Number);
    if (month > 31) [year, month, day] = [month, day, year];
    if (!month || !day || !year) return NaN;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return NaN;
    return date.getTime();
  };
  const sameDate = (left, right) => !Number.isNaN(dateValue(left)) && dateValue(left) === dateValue(right);
  const findTable = () => {
    const cell = document.querySelector('table td.column-startdate');
    if (cell) return cell.closest('table');
    const byId = document.getElementById('currentStaffForm');
    if (byId?.tagName === 'TABLE') return byId;
    const heading = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, div, span, legend')]
      .find(node => clean(node.textContent).toLocaleLowerCase() === 'date sensitive information');
    for (let node = heading; node && node !== document.body; node = node.parentElement) {
      const table = node.querySelector('table');
      if (table) return table;
    }
    return null;
  };
  const table = findTable();
  if (!table) return { found: false, reason: 'section-not-found', rows: [], columns: [] };
  const columns = [...table.querySelectorAll('thead th')].map(th => clean(th.textContent)).filter(Boolean);
  const cellText = (row, column) => clean(row.querySelector('td.column-' + column)?.textContent);
  const rows = [...table.querySelectorAll('tbody tr')]
    .map(row => ({
      effectiveDate: cellText(row, 'startdate'),
      department: cellText(row, 'department_name'),
      level: cellText(row, 'level'),
      shift: cellText(row, 'shift'),
    }))
    .filter(row => row.effectiveDate || row.department || row.level || row.shift);
  const plannedTime = expected && !expected.newestRow ? dateValue(expected.effectiveDate) : Infinity;
  const shiftNow = rows.filter(row => dateValue(row.effectiveDate) < plannedTime)
    .sort((one, two) => dateValue(two.effectiveDate) - dateValue(one.effectiveDate))[0]?.shift || '';
  const describedBy = (table.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  const totals = describedBy
    .map(id => clean(document.getElementById(id)?.textContent).match(/of\s+([\d,]+)\s+entries/i))
    .filter(Boolean);
  const countUnknown = describedBy.length > 0 && !totals.length;
  const entries = totals.length ? Number(totals[0][1].replace(/,/g, '')) : rows.length;
  const morePages = entries > rows.length;
  const conflicting = candidates => candidates.some(row => !same(row.department, candidates[0].department)
    || !same(row.level, candidates[0].level) || !same(row.shift, candidates[0].shift));
  if (!expected) return { found: true, listed: true, rows, entries, morePages, columns };
  let match;
  if (expected.newestRow) {
    if (morePages) return { found: false, reason: 'more-pages', rows, entries, columns };
    if (countUnknown) return { found: false, reason: 'count-unreadable', rows, entries, columns };
    if (rows.some(row => Number.isNaN(dateValue(row.effectiveDate)))) return { found: false, reason: 'date-unreadable', rows, entries, columns };
    const dated = rows.map((row, index) => ({ row, index, time: dateValue(row.effectiveDate) }));
    const latest = Math.max(...dated.map(entry => entry.time));
    const newestRows = dated.filter(entry => entry.time === latest).map(entry => entry.row);
    if (conflicting(newestRows)) return { found: false, reason: 'conflicting-rows', rows, entries, columns };
    match = newestRows[0] || rows[0];
  } else {
    const sameDay = rows.filter(row => sameDate(row.effectiveDate, expected.effectiveDate));
    if (conflicting(sameDay)) return { found: false, reason: 'conflicting-rows', rows, entries, columns };
    match = sameDay[0];
  }
  if (!match) {
    const hidden = morePages ? 'more-pages' : countUnknown ? 'count-unreadable'
      : rows.some(row => Number.isNaN(dateValue(row.effectiveDate))) ? 'date-unreadable' : 'row-not-found';
    return { found: false, reason: expected.newestRow ? 'row-not-found' : hidden, rows, entries, columns, shiftNow };
  }
  let requiredShift = expected.requiredExistingShift;
  if (requiredShift === '') {
    const prior = rows.filter(row => dateValue(row.effectiveDate) < plannedTime);
    const priorTime = Math.max(...prior.map(row => dateValue(row.effectiveDate)));
    const baseline = prior.filter(row => dateValue(row.effectiveDate) === priorTime);
    const unread = morePages ? 'more-pages' : countUnknown ? 'count-unreadable'
      : rows.some(row => Number.isNaN(dateValue(row.effectiveDate))) ? 'date-unreadable'
        : !shiftNow || conflicting(baseline) ? 'shift-unreadable' : '';
    if (unread) return { found: false, reason: unread, rows, entries, columns };
    requiredShift = shiftNow;
  }
  const differences = [];
  if (!same(match.department, expected.department)) differences.push('Department');
  if (!expected.departmentOnly && !same(match.level, expected.level)) differences.push('Level');
  const shiftDiffers = requiredShift && !same(match.shift, requiredShift);
  if (shiftDiffers) differences.push('Shift');
  return {
    found: true,
    matches: differences.length === 0,
    differences,
    shiftDiffers: Boolean(shiftDiffers),
    row: match,
    rows,
    entries,
    columns,
    shiftNow,
  };
}
return { readIdentity, readProfileControls, readValues, listFields, readDateSensitiveRow, profileFieldControls };
}
const __transfersScreens = [["header",{"class":"tool-head"},[["button",{"class":"button quiet header-back","id":"header-back","type":"button","hidden":""},["← Worklist"]],["span",{"class":"case-steps","id":"case-steps","hidden":""},[["button",{"class":"button quiet header-step","id":"case-previous","type":"button","title":"Previous case (Alt+↑)","aria-label":"Previous case"},["↑"]],["span",{"class":"case-position","id":"case-position"},[]],["button",{"class":"button quiet header-step","id":"case-next","type":"button","title":"Next case (Alt+↓)","aria-label":"Next case"},["↓"]]]],["strong",{},["Shuffle"]],["span",{"class":"header-space"},[]],["button",{"class":"button secondary header-action","id":"auto-mode","type":"button","hidden":""},["Auto"]],["button",{"class":"button secondary header-action","id":"download","type":"button","title":"Download workbook","aria-label":"Download workbook","hidden":""},["⬇"]],["button",{"class":"button quiet close-transfers","id":"close","type":"button","title":"Close Shuffle","aria-label":"Close Shuffle"},["✕"]]]],["main",{},[["section",{"class":"intake","id":"intake","aria-labelledby":"intake-title"},[["h2",{"id":"intake-title"},["Add the four files"]],["div",{"class":"drop-grid"},[["button",{"class":"drop-card","id":"service-drop","type":"button"},[["span",{"class":"file-copy"},[["span",{"class":"file-sign","aria-hidden":"true"},["○"]],["span",{"class":"file-name"},[["strong",{},["ServiceNow export"]],["span",{"class":"file-separator"},[" · "]],["span",{"class":"file-state","id":"service-state"},[]]]]]],["span",{"class":"file-control"},["Choose file"]]]],["input",{"type":"file","id":"service-file","accept":".csv,.xlsx","hidden":""},[]],["button",{"class":"drop-card","id":"profile-drop","type":"button"},[["span",{"class":"file-copy"},[["span",{"class":"file-sign","aria-hidden":"true"},["○"]],["span",{"class":"file-name"},[["strong",{},["MySource export"]],["span",{"class":"file-separator"},[" · "]],["span",{"class":"file-state","id":"profile-state"},[]]]]]],["span",{"class":"file-control"},["Choose file"]]]],["input",{"type":"file","id":"profile-file","accept":".csv,.xlsx","hidden":""},[]],["button",{"class":"drop-card","id":"dp-drop","type":"button"},[["span",{"class":"file-copy"},[["span",{"class":"file-sign","aria-hidden":"true"},["○"]],["span",{"class":"file-name"},[["strong",{},["DP mapping"]],["span",{"class":"file-separator"},[" · "]],["span",{"class":"file-state","id":"dp-state"},[]]]]]],["span",{"class":"file-control"},["Choose file"]]]],["input",{"type":"file","id":"dp-file","accept":".xlsx","hidden":""},[]],["button",{"class":"drop-card","id":"roster-drop","type":"button"},[["span",{"class":"file-copy"},[["span",{"class":"file-sign","aria-hidden":"true"},["○"]],["span",{"class":"file-name"},[["strong",{},["Roster"]],["span",{"class":"file-separator"},[" · "]],["span",{"class":"file-state","id":"roster-state"},[]]]]]],["span",{"class":"file-control"},["Choose file"]]]],["input",{"type":"file","id":"roster-file","accept":".csv,.xlsx","hidden":""},[]]]],["label",{"class":"mail-signoff"},["Your name (mail sign-off)",["input",{"id":"run-signoff","type":"text","autocomplete":"off"},[]]]],["div",{"class":"run-row"},[["button",{"class":"button primary","id":"run","type":"button","disabled":""},["Build worklist"]],["p",{"class":"notice","id":"run-status","role":"status"},[]]]],["div",{"class":"loading-help"},[["button",{"class":"button quiet","id":"file-check","type":"button"},["Copy check"]],["span",{"id":"self-check"},[]]]],["pre",{"class":"field-names","id":"file-check-output","hidden":""},[]]]],["div",{"class":"error-panel","id":"error-panel","role":"alert","hidden":""},[["strong",{"id":"error-title"},[]],["ul",{"id":"error-details"},[]]]],["section",{"id":"results","aria-label":"Worklist","hidden":""},[["section",{"class":"queue","id":"queue","aria-label":"Cases"},[["div",{"class":"summary-grid","id":"summary-grid"},[["label",{"class":"summary-card","data-filter":"action"},[["input",{"class":"selection-input","type":"radio","name":"queue-filter","value":"action"},[]],["span",{},["Action"]],["strong",{"id":"count-action"},["0"]]]],["label",{"class":"summary-card","data-filter":"deactivation"},[["input",{"class":"selection-input","type":"radio","name":"queue-filter","value":"deactivation"},[]],["span",{},["Deactivation"]],["strong",{"id":"count-deactivation"},["0"]]]],["label",{"class":"summary-card","data-filter":"by-hand"},[["input",{"class":"selection-input","type":"radio","name":"queue-filter","value":"by-hand"},[]],["span",{},["By hand"]],["strong",{"id":"count-by-hand"},["0"]]]],["label",{"class":"summary-card","data-filter":"later"},[["input",{"class":"selection-input","type":"radio","name":"queue-filter","value":"later"},[]],["span",{},["Later"]],["strong",{"id":"count-later"},["0"]]]],["label",{"class":"summary-card","data-filter":"no-action"},[["input",{"class":"selection-input","type":"radio","name":"queue-filter","value":"no-action"},[]],["span",{},["No action"]],["strong",{"id":"count-no-action"},["0"]]]],["label",{"class":"summary-card","data-filter":"done"},[["input",{"class":"selection-input","type":"radio","name":"queue-filter","value":"done"},[]],["span",{},["Done"]],["strong",{"id":"count-done"},["0"]]]]]],["p",{"class":"batch-warning","id":"batch-warning","role":"status","hidden":""},[]],["label",{"class":"search-box"},[["span",{"class":"sr-only"},["Search cases"]],["input",{"id":"search","type":"search","placeholder":"Search cases"},[]]]],["div",{"class":"filter-row","id":"filter-row","hidden":""},[["span",{"id":"filter-label"},[]]]],["div",{"id":"worklist-cases"},[]],["p",{"id":"empty-filter","hidden":""},[]]]],["section",{"class":"case-pane","id":"case-pane","aria-label":"Selected case","hidden":""},[["div",{"id":"case-preview"},[]],["div",{"id":"profile-review","hidden":""},[["article",{"class":"case-card","id":"detail"},[]]]]]],["p",{"class":"sr-only","id":"review-progress","role":"status","aria-live":"polite"},[]]]]]]];
const __transfersStyles = [":root {\n  color-scheme: dark;\n  --bg: #151515;\n  --surface: #1c1c1c;\n  --surface-2: #1e1e1e;\n  --surface-3: #242424;\n  --border: #3a3a3a;\n  --border-strong: #4b4b4b;\n  --text: #eeeeee;\n  --muted: #a8a8a8;\n  --faint: #969696;\n  --sage: #a9c77d;\n  --sage-ink: #151515;\n  --blue: #86b8c8;\n  --amber: #c9aa68;\n  --coral: #c97972;\n  --shadow: 0 12px 36px rgba(0, 0, 0, .5);\n  --radius: 10px;\n  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n}\n* { box-sizing: border-box; }\n[hidden] { display: none !important; }\nbody { margin: 0; min-width: 300px; background: var(--bg); color: var(--text); }\nbutton, input { font: inherit; }\nbutton { color: inherit; }\n",":root {\n  --border: #303030;\n  --border-strong: #3a3a3a;\n  --selected-text: #c6d9a8;\n  font-size: 13px;\n  line-height: 1.5;\n}\nbody {\n  min-width: 280px;\n}\nbutton,\ninput,\ntextarea,\nselect {\n  font: inherit;\n}\nbutton,\nsummary {\n  cursor: pointer;\n}\nbutton:focus-visible,\nsummary:focus-visible,\ninput:focus-visible,\ntextarea:focus-visible,\na:focus-visible,\n.summary-card:focus-within,\n.queue-row:focus-within {\n  outline: 2px solid var(--selected-text);\n  outline-offset: 3px;\n}\nbutton:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n.button {\n  border: 0;\n  border-radius: 8px;\n  padding: 8px 10px;\n  background: var(--border-strong);\n  color: var(--text);\n  font-size: 13px;\n  font-weight: 700;\n  line-height: 1.4;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 7px;\n  min-height: 36px;\n  transition:\n    transform 120ms,\n    filter 120ms,\n    box-shadow 120ms;\n}\n.button:hover:not(:disabled),\n.drop-card:hover:not(:disabled) {\n  filter: brightness(1.1);\n  transform: translateY(-1px);\n  box-shadow: 0 3px 8px rgb(0 0 0 / 0.2);\n}\n.button:active:not(:disabled),\n.drop-card:active:not(:disabled) {\n  transform: scale(0.985);\n  filter: brightness(0.95);\n}\n.button.primary {\n  background: var(--sage);\n  color: var(--bg);\n}\n.button.secondary {\n  background: var(--blue);\n  color: var(--bg);\n}\n.button.warn {\n  background: var(--amber);\n  color: var(--bg);\n}\n.button.danger {\n  background: var(--coral);\n  color: var(--bg);\n  width: 100%;\n}\n.button-row,\n.actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  align-items: center;\n}\n.button-row > .button,\n.actions > .button {\n  flex: 1 1 calc(50% - 4px);\n  min-width: 0;\n  padding: 8px 6px;\n}\n.actions > .primary {\n  flex-basis: 100%;\n  order: -1;\n}\n.actions > .danger {\n  flex-basis: 100%;\n  order: 2;\n}\n.tool-head {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  min-height: 48px;\n  padding: 8px 14px;\n  background: var(--surface);\n  border-bottom: 1px solid var(--border);\n}\n.tool-head strong {\n  font-size: 14px;\n  font-weight: 700;\n}\n.tool-head > span {\n  margin-left: auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--muted);\n  font-size: 12px;\n}\n.tool-menu {\n  margin-left: auto;\n  position: relative;\n  flex-shrink: 0;\n}\n.tool-head > span + .tool-menu {\n  margin-left: 0;\n}\n.tool-menu > summary {\n  list-style: none;\n  padding: 7px 10px;\n  border-radius: 8px;\n  background: var(--border-strong);\n  color: var(--text);\n  font-size: 12px;\n  font-weight: 700;\n}\n.tool-menu > summary::-webkit-details-marker {\n  display: none;\n}\n.menu-body {\n  position: absolute;\n  top: calc(100% + 8px);\n  right: 0;\n  z-index: 20;\n  width: min(310px, calc(100vw - 28px));\n  max-height: calc(100vh - 80px);\n  overflow-y: auto;\n  padding: 12px;\n  border: 1px solid var(--border-strong);\n  border-radius: 10px;\n  background: var(--surface);\n  box-shadow: var(--shadow);\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.menu-body hr {\n  width: 100%;\n  border: 0;\n  border-top: 1px solid var(--border);\n  margin: 0;\n}\n.menu-body details[open] {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\nh1,\nh2,\nh3,\nh4,\np {\n  margin: 0;\n}\nh2 {\n  font-size: 18px;\n  line-height: 1.3;\n  font-weight: 600;\n}\nh3 {\n  font-size: 20px;\n  font-weight: 600;\n}\nh4 {\n  font-size: 13px;\n  font-weight: 600;\n}\np {\n  color: var(--muted);\n}\nsmall,\n.notice,\n.session-warning {\n  color: var(--muted);\n  font-size: 12px;\n  line-height: 1.5;\n}\ndetails > summary {\n  font-size: 12px;\n  color: var(--muted);\n  padding: 5px 0;\n}\n.session-warning {\n  padding: 12px 0;\n  border-top: 1px solid var(--border);\n}\n.error,\n.error-panel {\n  color: var(--coral);\n  border-left: 2px solid var(--coral);\n  padding: 8px 10px;\n  overflow-wrap: anywhere;\n}\n.error-panel ul {\n  margin: 4px 0 0;\n  padding-left: 18px;\n}\n#diagnostic-log {\n  max-height: 190px;\n  overflow: auto;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  font:\n    11px/1.5 ui-monospace,\n    Consolas,\n    monospace;\n  color: var(--muted);\n}\ntextarea {\n  width: 100%;\n  min-height: 70px;\n  resize: vertical;\n  background: var(--surface);\n  border: 1px solid var(--border-strong);\n  border-radius: 8px;\n  color: var(--text);\n  padding: 8px 10px;\n}\n.session-note {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.discard-dialog {\n  max-width: min(390px, calc(100vw - 24px));\n  margin: auto;\n  border: 1px solid var(--border-strong);\n  border-radius: 12px;\n  padding: 20px;\n  background: var(--bg);\n  color: var(--text);\n}\n.discard-dialog[open] {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n.discard-dialog::backdrop {\n  background: rgb(0 0 0 / 0.6);\n}\n.sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  overflow: hidden;\n  clip-path: inset(50%);\n  white-space: nowrap;\n}\n.selection-input {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  opacity: 0;\n}\n@media (pointer: coarse) {\n  button,\n  summary,\n  .summary-card,\n  .queue-row {\n    min-height: 44px;\n  }\n  input,\n  textarea,\n  select {\n    font-size: 16px;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    scroll-behavior: auto !important;\n    transition: none !important;\n    transform: none !important;\n  }\n}\n",":root {\n  --head: #1b1b1b;\n  --border-soft: #242424;\n  --lavender: #a58ecc;\n}\nhtml {\n  scrollbar-width: none;\n}\nhtml::-webkit-scrollbar {\n  display: none;\n}\nbutton:focus-visible,\nsummary:focus-visible,\ninput:focus-visible,\ntextarea:focus-visible,\na:focus-visible {\n  outline-offset: 2px;\n}\nmain {\n  max-width: 1120px;\n  margin: auto;\n  padding: 12px;\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n}\n.tool-head {\n  position: sticky;\n  top: 0;\n  z-index: 10;\n  min-height: 36px;\n  gap: 8px;\n  padding: 3px 6px 3px 12px;\n  background: var(--head);\n  border-bottom-color: var(--border-soft);\n}\n.tool-head > .close-transfers,\n.tool-head > .header-back {\n  min-height: 0;\n  padding: 3px 10px;\n  font-size: 13px;\n  line-height: 1.25;\n}\n.case-steps {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  font-size: 12px;\n  color: var(--muted);\n}\n.case-steps[hidden] {\n  display: none;\n}\n.tool-head .header-step {\n  min-height: 0;\n  padding: 3px 8px;\n  font-size: 13px;\n  line-height: 1.25;\n}\n.queue-row .row-number {\n  color: var(--muted);\n  font-variant-numeric: tabular-nums;\n  margin-right: 6px;\n}\n.tool-head:has(> .header-back:not([hidden])) > strong {\n  display: none;\n}\n.header-space { flex: 1; }\n.tool-head > .header-action { width: auto; min-height: 0; padding: 3px 10px; font-size: 13px; line-height: 1.25; }\n.mail-signoff { display: flex; flex-direction: column; gap: 7px; margin-top: 20px; color: var(--muted); font-size: 12px; }\n.mail-signoff input { width: 100%; padding: 9px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); color: var(--text); box-sizing: border-box; }\n.loading-help { display: flex; align-items: center; gap: 12px; margin-top: 36px; color: var(--muted); font-size: 10px; }\n.loading-help .button { width: auto; min-height: 0; padding: 3px 0; font-size: 11px; background: transparent; color: var(--muted); }\n.optional {\n  font-weight: 400;\n  opacity: 0.8;\n}\n#file-check {\n  align-self: flex-start;\n}\n.field-names {\n  max-height: 180px;\n  overflow: auto;\n  margin: 0;\n  padding: 8px;\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  background: var(--bg);\n  white-space: pre-wrap;\n  font: 11px/1.5 ui-monospace, Consolas, monospace;\n}\n.intake {\n  width: 100%;\n  max-width: 600px;\n  margin: auto;\n  display: flex;\n  flex-direction: column;\n  gap: 18px;\n  scroll-margin-top: 64px;\n}\n.drop-grid {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.drop-card {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 14px;\n  width: 100%;\n  padding: 8px 10px;\n  background: var(--surface);\n  color: var(--muted);\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  text-align: left;\n  cursor: pointer;\n  transition:\n    transform 120ms,\n    filter 120ms;\n}\n.drop-card.loaded {\n  color: var(--text);\n}\n.file-copy {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  flex: 1;\n  min-width: 0;\n}\n.file-sign {\n  flex-shrink: 0;\n}\n.loaded .file-sign {\n  color: var(--sage);\n}\n.file-name {\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n.file-separator {\n  display: none;\n}\n.loaded .file-separator {\n  display: inline;\n}\n.drop-card .file-state {\n  font-size: inherit;\n  max-width: none;\n  overflow: visible;\n  white-space: normal;\n}\n.file-control {\n  flex-shrink: 0;\n  padding: 3px 8px;\n  border: 1px solid var(--blue);\n  border-radius: 6px;\n  color: var(--blue);\n  font-size: 12px;\n}\n.drop-card.dragging {\n  outline: 2px solid var(--selected-text);\n  outline-offset: 3px;\n}\n.file-state {\n  font-size: 12px;\n  max-width: 44%;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.run-row {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.run-row .primary {\n  width: 100%;\n}\n#results {\n  display: flex;\n  flex-direction: column;\n  gap: 18px;\n  scroll-margin-top: 64px;\n}\n.queue {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.summary-grid {\n  display: flex;\n  gap: 2px;\n  flex-wrap: wrap;\n}\n.summary-card {\n  position: relative;\n  border: 0;\n  border-radius: 6px;\n  color: var(--muted);\n  padding: 6px 5px;\n  cursor: pointer;\n  font-size: 12px;\n  display: flex;\n  align-items: center;\n  gap: 5px;\n}\n.summary-card strong {\n  font-weight: 600;\n}\n.summary-card.active {\n  color: var(--selected-text);\n}\n.summary-card:hover {\n  background: var(--surface-3);\n}\n.summary-card:focus-within,\n.queue-row:focus-within {\n  outline: none;\n}\n.summary-card:has(:focus-visible),\n.queue-row:has(:focus-visible) {\n  outline: 2px solid var(--selected-text);\n  outline-offset: -2px;\n}\n.batch-warning {\n  margin: 4px 0 0;\n  font-size: 12px;\n  color: var(--amber);\n}\n.search-box input {\n  width: 100%;\n  border: 1px solid var(--border-strong);\n  background: var(--surface);\n  color: var(--text);\n  border-radius: 8px;\n  padding: 9px 10px;\n}\n.filter-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  font-size: 12px;\n  color: var(--muted);\n}\n.queue-row {\n  position: relative;\n  display: flex;\n  align-items: baseline;\n  gap: 10px;\n  width: 100%;\n  padding: 8px 10px;\n  border-bottom: 1px solid var(--border-soft);\n  background: transparent;\n  color: var(--text);\n  cursor: pointer;\n  border-radius: 6px;\n}\n.queue-row:hover {\n  background: var(--surface-3);\n}\n.row-top {\n  display: flex;\n  flex: none;\n  justify-content: space-between;\n  gap: 8px;\n}\n.row-top > div {\n  text-align: right;\n}\n.queue-row .person {\n  display: block;\n  font-size: 13px;\n}\n.status-note {\n  display: block;\n  font-size: 11px;\n  color: var(--muted);\n  line-height: 1.4;\n}\n.list-heading {\n  margin: 8px 0 0;\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.03em;\n  color: var(--blue);\n}\n.case-pane {\n  min-width: 0;\n}\n.case-card {\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n}\n.case-head {\n  display: flex;\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 12px;\n}\n.ticket-number {\n  font-size: 12px;\n  color: var(--muted);\n}\n.badge {\n  font-size: 11px;\n  color: var(--muted);\n}\n.badge.ready,\n.badge.deactivation {\n  color: var(--sage);\n}\n.badge.done {\n  color: var(--lavender);\n}\n.badge.manual {\n  color: var(--amber);\n}\n.badge.later {\n  color: var(--blue);\n}\n.case-identity {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.case-name {\n  margin: 0;\n  font-size: 20px;\n  font-weight: 600;\n}\n.case-meta {\n  margin: 0;\n  font-size: 12px;\n  color: var(--muted);\n  overflow-wrap: anywhere;\n}\n.case-section {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.case-label {\n  display: block;\n  margin: 0 0 2px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--text);\n}\n.manual-section > .case-label {\n  color: var(--amber);\n}\n.case-lines {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.case-line {\n  margin: 0;\n  font-size: 13px;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n.case-line strong {\n  font-weight: 600;\n}\n.case-line.attention {\n  color: var(--amber);\n}\n.case-line.sign-problem {\n  color: var(--coral);\n}\n.case-line.sign-fine {\n  color: var(--sage);\n}\n.case-line.sign-info {\n  color: var(--blue);\n}\n.case-line.good {\n  color: var(--sage);\n}\n.case-line.noticed,\n.case-line.noticed strong,\n.case-line.noticed .sub-line {\n  color: var(--sage);\n}\n.edit-cue {\n  margin-left: 8px;\n  font-size: 0.9em;\n  font-weight: 600;\n}\n.deactivation-steps {\n  padding-left: 20px;\n}\n.schedule-step label {\n  cursor: pointer;\n}\n.information-list .case-line {\n  color: var(--muted);\n}\n.date-sensitive > strong {\n  color: var(--muted);\n}\n.date-sensitive .sub-line {\n  margin: 0;\n  padding-left: 12px;\n}\n.date-sensitive .sub-line.attention {\n  color: var(--amber);\n}\n.copy-text {\n  padding: 0;\n  border: 0;\n  background: none;\n  font: inherit;\n  color: inherit;\n  text-align: left;\n  cursor: copy;\n  text-decoration: underline dotted var(--faint);\n  text-underline-offset: 3px;\n}\n.copy-text:hover {\n  color: var(--text);\n  text-decoration-color: var(--text);\n}\n.copy-note {\n  margin-left: 6px;\n  font-size: 11px;\n  color: var(--sage);\n}\n.comment-block {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 4px;\n}\n.comment-block > .copy-text {\n  padding-left: 12px;\n  border-left: 2px solid var(--border-strong);\n  font-size: 13px;\n  line-height: 1.5;\n  color: var(--muted);\n  text-decoration: none;\n}\n.comment-block > .copy-text:hover {\n  border-left-color: var(--text);\n}\n.comment-block > .copy-note {\n  margin-left: 14px;\n}\n.comment-waiting,\n.comment-waiting .case-label {\n  color: var(--muted);\n}\n.case-section + .comment-to-add {\n  margin-top: -8px;\n}\n.discard-dialog [autofocus]:focus {\n  outline: 2px solid var(--selected-text);\n  outline-offset: 2px;\n}\n.dialog-choices {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n.dialog-choices > .button {\n  width: 100%;\n}\n.case-box {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n.case-box > .status-line:first-child {\n  font-weight: 600;\n}\n.case-box > .button {\n  width: 100%;\n}\n.done-row {\n  display: flex;\n  gap: 8px;\n}\n.done-row > .button {\n  min-width: 0;\n  padding: 8px 6px;\n}\n.done-row > .button.primary {\n  flex: 2;\n}\n.done-row > .button.quiet {\n  flex: 1;\n}\n.status-line {\n  margin: 0;\n  font-size: 13px;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n.status-line.good {\n  color: var(--sage);\n}\n.status-line.warn {\n  color: var(--amber);\n}\n.status-line.bad {\n  color: var(--coral);\n}\n.status-line.neutral {\n  color: var(--muted);\n}\n.note-fold {\n  border-top: 1px solid var(--border-soft);\n  padding-top: 10px;\n  font-size: 12px;\n}\n.note-fold > summary {\n  width: max-content;\n  list-style: none;\n  color: var(--muted);\n  cursor: pointer;\n}\n.note-fold > summary::-webkit-details-marker {\n  display: none;\n}\n.note-fold[open] > summary {\n  margin-bottom: 8px;\n}\n.note-fold textarea {\n  width: 100%;\n}\n.decided {\n  font-size: 12px;\n  color: var(--muted);\n}\n.decided summary {\n  cursor: pointer;\n}\n.decided h5 {\n  margin: 8px 0 2px;\n  font-size: 11px;\n  font-weight: 600;\n  color: var(--text);\n}\n.decided ul {\n  margin: 0;\n  padding-left: 18px;\n}\n.decided .values-heading { margin: 8px 0 2px; font-size: 11px; font-weight: 600; }\n.decided .hint, .comment-to-add .hint { font-size: 11px; font-weight: 400; color: var(--muted); }\n.decided li.sign-problem { color: var(--coral); }\n.decided li.sign-fine { color: var(--sage); }\n.decided li.sign-info { color: var(--blue); }\n.decided li.attention { color: var(--amber); }\n.note-flag {\n  margin-left: 6px;\n  padding: 0 2px;\n  border: 0;\n  background: none;\n  color: var(--amber);\n  font: inherit;\n  cursor: pointer;\n}\ndialog.small-window {\n  position: fixed;\n  inset: auto;\n  z-index: 30;\n  width: 230px;\n  max-width: calc(100vw - 16px);\n  max-height: 60vh;\n  margin: 0;\n  padding: 10px;\n  overflow: hidden auto;\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  background: var(--bg);\n  color: var(--text);\n  border: 1px solid var(--border-strong);\n  border-radius: 12px;\n  box-shadow: var(--shadow);\n  outline: none;\n  font-size: 12px;\n}\n.small-window h2 {\n  margin: 0;\n  font-size: 14px;\n}\n.small-window p {\n  margin: 0;\n  line-height: 1.4;\n}\n.small-window p.notice {\n  color: var(--muted);\n  font-size: 11px;\n}\n.small-window .actions {\n  gap: 6px;\n}\n.small-window .button {\n  min-width: 0;\n  min-height: 0;\n  margin: 0;\n  padding: 6px 8px;\n  font-size: 12px;\n  border-radius: 8px;\n}\n.small-window .actions > .button {\n  flex: 1 1 calc(50% - 3px);\n}\n.small-window .actions > .danger {\n  flex-basis: 100%;\n}\n.wrong-mark {\n  margin-top: 10px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  color: var(--muted);\n}\n.wrong-mark select {\n  background: var(--surface);\n  color: var(--text);\n  border: 1px solid var(--border-strong);\n  border-radius: 6px;\n  padding: 4px 6px;\n  font-size: 12px;\n}\n.wrong-mark.marked,\n.wrong-mark.marked select {\n  color: var(--amber);\n}\n.health-line {\n  margin: 0;\n  font-size: 12px;\n  color: var(--amber);\n}\n",".auto-page { width: 100%; box-sizing: border-box; max-width: 680px; margin: 0 auto; padding-bottom: 24px; }\n.auto-actions { display: flex; gap: 8px; margin-bottom: 16px; }\n.auto-actions > .button { width: auto; flex: 0 0 auto; }\n.auto-actions > .primary { flex: 1; }\n.auto-page > .case-section, .auto-results { margin-top: 24px; }\n.auto-page progress { width: 100%; height: 8px; accent-color: var(--lavender); border: 0; border-radius: 8px; overflow: hidden; }\n.auto-page progress::-webkit-progress-bar { background: var(--border); }\n.auto-page progress::-webkit-progress-value { background: var(--lavender); }\n.auto-person { font-weight: 600; margin: 8px 0; }\n.auto-before { margin: 12px 0; }\n.auto-done { color: var(--lavender); }\n.auto-page .case-line { overflow-wrap: anywhere; }\n"];
const __transfersEmailHelpers = __transfersCreateModuleSystem({ document, window })('rules/prepare.js');
__transfersCreateModuleSystem({ document, window })('run/start.js').start({
  version: "0.7.0-console.61",
  styles: __transfersStyles,
  screens: __transfersScreens,
  pageReaders: __transfersPageReaders,
  createModuleSystem: __transfersCreateModuleSystem,
});
})();
