const DEFAULTS = {
    light: { fg: '#1a1a1a', bg: '#ffffff', border: '#bdbdbd' },
    dark:  { fg: '#e6e6e6', bg: '#1e1e1e', border: '#4a4a4a' },
    fontSize: 12,
    stripes: true,
    alignNumbers: true,
};

const fields = {
    'light-fg':     ['light', 'fg'],
    'light-bg':     ['light', 'bg'],
    'light-border': ['light', 'border'],
    'dark-fg':      ['dark',  'fg'],
    'dark-bg':      ['dark',  'bg'],
    'dark-border':  ['dark',  'border'],
};

function applyToForm(settings) {
    Object.entries(fields).forEach(([id, [theme, key]]) => {
        document.getElementById(id).value = settings[theme][key];
    });
    document.getElementById('font-size').value = String(settings.fontSize);
    document.getElementById('stripes').checked = settings.stripes;
    document.getElementById('align-numbers').checked = settings.alignNumbers;
}

function readForm() {
    const out = { light: {}, dark: {} };
    Object.entries(fields).forEach(([id, [theme, key]]) => {
        out[theme][key] = document.getElementById(id).value;
    });
    out.fontSize = parseInt(document.getElementById('font-size').value, 10);
    out.stripes = document.getElementById('stripes').checked;
    out.alignNumbers = document.getElementById('align-numbers').checked;
    return out;
}

function flashStatus(text) {
    const el = document.getElementById('status');
    el.textContent = text;
    setTimeout(() => { el.textContent = ''; }, 1500);
}

browser.storage.local.get('settings').then(({ settings }) => {
    applyToForm({ ...DEFAULTS, ...(settings || {}) });
});

document.getElementById('save').addEventListener('click', () => {
    browser.storage.local.set({ settings: readForm() }).then(() => flashStatus('Saved'));
});

document.getElementById('reset').addEventListener('click', () => {
    applyToForm(DEFAULTS);
    browser.storage.local.set({ settings: DEFAULTS }).then(() => flashStatus('Reset'));
});
