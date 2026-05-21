const csv = document.body.textContent;
document.body.textContent = '';

const DEFAULTS = {
    light: { fg: '#1a1a1a', bg: '#ffffff', border: '#bdbdbd' },
    dark:  { fg: '#e6e6e6', bg: '#1e1e1e', border: '#4a4a4a' },
    fontSize: 12,
    stripes: true,
    alignNumbers: true,
};

const settingsPromise = loadSettings();
const parsed = parse(csv, guessDelimiter(csv));

settingsPromise.then(settings => {
    applySettings(settings);
    insertTable(parsed, settings);
});

function loadSettings() {
    if (typeof browser === 'undefined' || !browser.storage) {
        return Promise.resolve(DEFAULTS);
    }
    return browser.storage.local.get('settings').then(({ settings }) => ({
        ...DEFAULTS,
        ...(settings || {}),
    }));
}

function applySettings(s) {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const palette = dark ? s.dark : s.light;
    const root = document.documentElement.style;
    root.setProperty('--cb-fg', palette.fg);
    root.setProperty('--cb-bg', palette.bg);
    root.setProperty('--cb-border', palette.border);
    root.setProperty('--cb-font-size', s.fontSize + 'px');
    document.body.classList.toggle('cb-no-stripes', !s.stripes);
}

function guessDelimiter(text) {
    const end = text.indexOf('\n');
    const limit = end === -1 ? text.length : end;
    let commas = 0, semis = 0, tabs = 0;
    for (let i = 0; i < limit; i += 1) {
        const c = text.charCodeAt(i);
        if (c === 44) commas++;
        else if (c === 59) semis++;
        else if (c === 9) tabs++;
    }
    if (tabs >= commas && tabs >= semis) return '\t';
    if (semis >= commas) return ';';
    return ',';
}

// Parses CSV in one pass. Also records, per column, whether every non-empty
// value is a numeric literal — exposed on result.numericCols (Uint8Array).
function parse(s, delimiter) {
    const DELIM = delimiter.charCodeAt(0);
    const QUOTE = 34;  // "
    const CR = 13, LF = 10;

    const rows = [];
    let row = [];

    // Per-column numeric tracking, grown as columns are first seen.
    // numHas[c] = saw at least one non-empty value; numAll[c] = all so far numeric.
    let numHas = new Uint8Array(0);
    let numAll = new Uint8Array(0);

    const len = s.length;
    let i = 0;
    let isHeader = true;
    let colIdx = 0;

    while (i < len) {
        // Parse one field starting at i.
        let field;
        let wasQuoted = false;
        const c0 = s.charCodeAt(i);

        if (c0 === QUOTE) {
            // Quoted field. Scan for closing quote, handling "" escapes.
            wasQuoted = true;
            i += 1;
            let start = i;
            let parts = null;     // built only if we hit an escaped quote
            while (i < len) {
                const ch = s.charCodeAt(i);
                if (ch === QUOTE) {
                    if (i + 1 < len && s.charCodeAt(i + 1) === QUOTE) {
                        // escaped "" — collect segment, skip one quote
                        if (parts === null) parts = [];
                        parts.push(s.substring(start, i + 1));
                        i += 2;
                        start = i;
                    } else {
                        break;
                    }
                } else {
                    i += 1;
                }
            }
            field = parts === null ? s.substring(start, i) : (parts.join('') + s.substring(start, i));
            if (i < len) i += 1; // consume closing quote
        } else {
            // Unquoted field. Scan to delim / CR / LF.
            const start = i;
            while (i < len) {
                const ch = s.charCodeAt(i);
                if (ch === DELIM || ch === LF || ch === CR) break;
                i += 1;
            }
            field = s.substring(start, i);
            // skipinitialspace — only trim leading whitespace, matches old behavior cheaply
            if (field.length > 0 && field.charCodeAt(0) === 32) field = field.replace(/^ +/, '');
        }

        // Numeric tracking. Only unquoted, non-empty fields count as "values".
        if (!isHeader) {
            if (colIdx >= numHas.length) {
                const grown = colIdx + 1;
                const newHas = new Uint8Array(grown);
                const newAll = new Uint8Array(grown);
                newHas.set(numHas);
                newAll.set(numAll);
                // newly grown columns: all-numeric defaults to 1 (true) until proven otherwise
                for (let k = numHas.length; k < grown; k += 1) newAll[k] = 1;
                numHas = newHas;
                numAll = newAll;
            }
            if (!wasQuoted && field.length > 0) {
                numHas[colIdx] = 1;
                if (numAll[colIdx] === 1 && !isNumericLiteral(field)) {
                    numAll[colIdx] = 0;
                }
            }
        }

        row.push(field);
        colIdx += 1;

        if (i >= len) break;
        const sep = s.charCodeAt(i);
        if (sep === DELIM) {
            i += 1;
        } else {
            // End of row (CR, LF, or CRLF).
            if (sep === CR && i + 1 < len && s.charCodeAt(i + 1) === LF) i += 2;
            else i += 1;
            rows.push(row);
            row = [];
            isHeader = false;
            colIdx = 0;
        }
    }

    // Trailing field/row (file with no terminating newline).
    if (row.length > 0) rows.push(row);

    const numericCols = new Uint8Array(numHas.length);
    for (let c = 0; c < numHas.length; c += 1) {
        numericCols[c] = numHas[c] === 1 && numAll[c] === 1 ? 1 : 0;
    }
    rows.numericCols = numericCols;
    return rows;
}

// Matches integer or decimal: 123, -1.5, .5, 5., +12. No exponents.
function isNumericLiteral(s) {
    const len = s.length;
    if (len === 0) return false;
    let i = 0;
    const c0 = s.charCodeAt(0);
    if (c0 === 43 || c0 === 45) { // + -
        if (len === 1) return false;
        i = 1;
    }
    let sawDigit = false;
    let sawDot = false;
    for (; i < len; i += 1) {
        const c = s.charCodeAt(i);
        if (c >= 48 && c <= 57) {
            sawDigit = true;
        } else if (c === 46 && !sawDot) {
            sawDot = true;
        } else {
            return false;
        }
    }
    return sawDigit;
}

let sortState = { col: -1, dir: 'none' };
let tableData = null;      // 2D array, header at [0], same shape as parse() output
let numericCols = null;    // Uint8Array, 1 = right-align column
let rowOrder = null;       // Int32Array index into tableData[1..], current display order
const collator = new Intl.Collator(undefined, { numeric: false, sensitivity: 'variant' });

function insertTable(rows, settings) {
    tableData = rows;
    numericCols = settings.alignNumbers
        ? rows.numericCols || new Uint8Array(rows[0].length)
        : new Uint8Array(rows[0].length);

    const colCount = rows[0].length;
    const dataRowCount = rows.length - 1;
    rowOrder = new Int32Array(dataRowCount);
    for (let i = 0; i < dataRowCount; i += 1) rowOrder[i] = i + 1;

    const tbl = document.createElement('table');

    // Header (small — safe to build via DOM API).
    const thead = tbl.createTHead();
    const headerRow = thead.insertRow(-1);
    for (let c = 0; c < colCount; c += 1) {
        const th = document.createElement('th');
        th.textContent = rows[0][c];
        if (numericCols[c]) th.classList.add('cb-num');
        const col = c;
        th.addEventListener('click', () => sortTable(tbl, col));
        headerRow.appendChild(th);
    }

    // Body — innerHTML in one shot for speed at 1M rows.
    const tbody = document.createElement('tbody');
    tbl.appendChild(tbody);
    tbody.innerHTML = buildTbodyHTML(rows, rowOrder, colCount);

    injectNumericColumnStyles(numericCols);
    document.body.appendChild(tbl);
}

function buildTbodyHTML(rows, order, colCount) {
    const out = new Array(order.length);
    for (let r = 0; r < order.length; r += 1) {
        const row = rows[order[r]];
        let s = '<tr>';
        for (let c = 0; c < colCount; c += 1) {
            const v = row[c];
            if (v === '' || v === null || v === undefined) {
                s += '<td></td>';
            } else {
                s += '<td>' + escapeHTML(v) + '</td>';
            }
        }
        s += '</tr>';
        out[r] = s;
    }
    return out.join('');
}

function injectNumericColumnStyles(numCols) {
    const selectors = [];
    for (let c = 0; c < numCols.length; c += 1) {
        if (numCols[c]) selectors.push('tbody td:nth-child(' + (c + 1) + ')');
    }
    if (selectors.length === 0) return;
    const style = document.createElement('style');
    style.textContent = selectors.join(', ') + ' { text-align: right; }';
    document.head.appendChild(style);
}

// Minimal HTML escape — only what matters inside <td> text content.
function escapeHTML(s) {
    // Fast path: scan for any char needing escaping.
    for (let i = 0; i < s.length; i += 1) {
        const c = s.charCodeAt(i);
        if (c === 38 || c === 60 || c === 62) {
            return s.replace(/[&<>]/g, ch => ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;');
        }
    }
    return s;
}

function nextDir(prev) {
    if (prev === 'none') return 'asc';
    if (prev === 'asc')  return 'desc';
    return 'none';
}

function sortTable(tbl, col) {
    const dir = sortState.col === col ? nextDir(sortState.dir) : 'asc';
    sortState = { col, dir };

    const colCount = tableData[0].length;
    const dataRowCount = tableData.length - 1;

    if (dir === 'none') {
        for (let i = 0; i < dataRowCount; i += 1) rowOrder[i] = i + 1;
    } else {
        const asc = dir === 'asc';
        const data = tableData;
        const isNumeric = numericCols[col] === 1;

        // Sort a plain Array (Int32Array.sort with comparator is slower in some engines).
        const arr = new Array(dataRowCount);
        for (let i = 0; i < dataRowCount; i += 1) arr[i] = rowOrder[i];

        let cmp;
        if (isNumeric) {
            cmp = (a, b) => {
                const va = data[a][col], vb = data[b][col];
                const na = va === '' || va === null ? NaN : +va;
                const nb = vb === '' || vb === null ? NaN : +vb;
                if (isNaN(na) && isNaN(nb)) return 0;
                if (isNaN(na)) return 1;
                if (isNaN(nb)) return -1;
                return asc ? na - nb : nb - na;
            };
        } else {
            const collCompare = collator.compare;
            cmp = (a, b) => {
                const va = data[a][col] || '';
                const vb = data[b][col] || '';
                const c = collCompare(va, vb);
                return asc ? c : -c;
            };
        }
        arr.sort(cmp);
        for (let i = 0; i < dataRowCount; i += 1) rowOrder[i] = arr[i];
    }

    // Rebuild tbody in one shot.
    const tbody = tbl.tBodies[0];
    tbody.innerHTML = buildTbodyHTML(tableData, rowOrder, colCount);

    // Update sort indicators.
    const ths = tbl.tHead.rows[0].cells;
    for (let i = 0; i < ths.length; i += 1) {
        ths[i].dataset.sort = (i === col && dir !== 'none') ? dir : '';
    }
}
