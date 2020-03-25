const csv = document.body.textContent;
document.body.textContent = '';

const firstLine = csv.split("\n", 1)[0];
const delimiter = guessDelimiter(firstLine);

//console.log("Delimiter recognized:", delimiter);
insertTable(parse(csv, {delimiter}));
//console.log('CSV converted to table');

function guessDelimiter(row) {
    const delimiters = {',': 0, ';': 0, "\t": 0};
    for (let i = 0; i < row.length; i += 1) {
        const c = row.charAt(i);
        if (c === ',' || c === ';' || c === "\t") {
            delimiters[c]++;
        }
    }

    return Object.keys(delimiters).reduce((a, b) => delimiters[a] > delimiters[b] ? a : b);
}

function insertTable(rows) {
    const tbl = document.createElement("table");
    tbl.style.fontSize = '12px';
    tbl.style.fontFamily = 'sans-serif';
    tbl.style.borderCollapse = 'collapse';
    tbl.style.borderWidth = '1px';

    tbl.appendChild(document.createElement("tbody"));

    rows.forEach(row => {
        const domRow = tbl.insertRow(-1);
        row.forEach(cell => {
            domRow.insertCell(-1).textContent = cell;
        })
    });

    document.body.appendChild(tbl);
}

function parse (s, dialect) {
    // When line terminator is not provided then we try to guess it
    // and normalize it across the file.
    s = normalizeLineTerminator(s, dialect);

    // Get rid of any trailing \n
    const options = normalizeDialectOptions(dialect);
    s = chomp(s, options.lineterminator);

    let cur = "", // The character we are currently processing.
        inQuote = false,
        fieldQuoted = false,
        field = "", // Buffer for building up the current field
        row = [],
        out = [],
        processField;

    processField = function(field) {
        if (fieldQuoted !== true) {
            // If field is empty set to null
            if (field === "") {
                field = null;
                // If the field was not quoted and we are trimming fields, trim it
            } else if (options.skipinitialspace === true) {
                field = field.trim();
            }

            // Convert unquoted numbers to their appropriate types
            if (/^\d+$/.test(field)) {
                field = parseInt(field, 10);
            } else if (/^\d*\.\d+$|^\d+\.\d*$/.test(field)) {
                field = parseFloat(field);
            }
        }
        return field;
    };

    for (let i = 0; i < s.length; i += 1) {
        cur = s.charAt(i);

        // If we are at a EOF or EOR
        if (
            inQuote === false &&
            (cur === options.delimiter || cur === options.lineterminator)
        ) {
            field = processField(field);
            // Add the current field to the current row
            row.push(field);
            // If this is EOR append row to output and flush row
            if (cur === options.lineterminator) {
                out.push(row);
                row = [];
            }
            // Flush the field buffer
            field = "";
            fieldQuoted = false;
        } else {
            // If it's not a quotechar, add it to the field buffer
            if (cur !== options.quotechar) {
                field += cur;
            } else {
                if (!inQuote) {
                    // We are not in a quote, start a quote
                    inQuote = true;
                    fieldQuoted = true;
                } else {
                    // Next char is quotechar, this is an escaped quotechar
                    if (s.charAt(i + 1) === options.quotechar) {
                        field += options.quotechar;
                        // Skip the next char
                        i += 1;
                    } else {
                        // It's not escaping, so end quote
                        inQuote = false;
                    }
                }
            }
        }
    }

    // Add the last field
    field = processField(field);
    row.push(field);
    out.push(row);

    // Expose the ability to discard initial rows
    if (options.skipinitialrows) out = out.slice(options.skipinitialrows);

    return out;
}

function normalizeLineTerminator(csvString, dialect) {
    dialect = dialect || {};

    // Try to guess line terminator if it's not provided.
    if (!dialect.lineterminator) {
        return csvString.replace(/(\r\n|\n|\r)/gm, "\n");
    }
    // if not return the string untouched.
    return csvString;
}

function normalizeDialectOptions(options) {
    // note lower case compared to CSV DDF
    let out = {
        delimiter: ",",
        doublequote: true,
        lineterminator: "\n",
        quotechar: '"',
        skipinitialspace: true,
        skipinitialrows: 0
    };

    for (let key in options) {
        if (key === "trim") {
            out["skipinitialspace"] = options.trim;
        } else if (options.hasOwnProperty(key)) {
            out[key.toLowerCase()] = options[key];
        }
    }
    return out;
}



function chomp(s, lineTerminator) {
    if (s.charAt(s.length - lineTerminator.length) !== lineTerminator) {
        // Does not end with \n, just return string
        return s;
    } else {
        // Remove the \n
        return s.substring(0, s.length - lineTerminator.length);
    }
}