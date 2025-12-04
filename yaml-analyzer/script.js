// script.js - YAML Analyzer logic (client-side only)
// Requires jsyaml loaded on the page (we load it from unpkg in the HTML)

(function(){
  const editor = document.getElementById('editor');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const clearBtn = document.getElementById('clearBtn');
  const autofixBtn = document.getElementById('autofixBtn');
  const resultBox = document.getElementById('resultBox');
  const suggestions = document.getElementById('suggestions');
  const loadExample = document.getElementById('loadExample');
  const exampleYaml = document.getElementById('exampleYaml');

  // Helper: show result
  function showResult(text, isError){
    resultBox.textContent = text;
    resultBox.style.color = isError ? '#ffb5b5' : '#cde6d5';
    if(isError) resultBox.style.borderColor = 'rgba(255,80,80,0.1)';
    else resultBox.style.borderColor = 'rgba(0,0,0,0.05)';
  }

  // Helper: suggestions list
  function showSuggestions(list){
    if(!list || list.length===0){
      suggestions.innerHTML = '';
      return;
    }
    suggestions.innerHTML = '<strong>Suggestions & fixes</strong><ul style="margin-top:8px;">'
      + list.map(s => `<li>${escapeHtml(s)}</li>`).join('') + '</ul>';
  }

  // basic html escape
  function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  // Analyze YAML (safe: parse with js-yaml)
  function analyze(){
    const text = editor.value.trim();
    if(!text){ showResult('No YAML provided. Paste a snippet and click Analyze.', true); showSuggestions([]); return;}
    try {
      // jsyaml is provided by CDN: window.jsyaml
      const doc = jsyaml.loadAll(text); // parse possibly multi-doc
      showResult('✅ Valid YAML — parsed ' + doc.length + ' document(s).', false);

      // Provide lightweight checks & suggestions:
      const s = [];
      // check for tabs (common cause)
      if(/\t/.test(text)) s.push('Found tab characters — replace tabs with 2 spaces for YAML consistency.');
      // quick check for typical Kubernetes "kind" missing colon
      if(/^\s*kind\s+[A-Za-z]/m.test(text)) s.push('Possible missing colon on a "kind" or other mapping (e.g. "kind: Pod"). Ensure "key: value" format.');
      // check for trailing colon lines
      if(/:\s*$/.test(text)) s.push('Found a line ending with ":" — check that the value or nested block is present on following lines.');
      // show safe hints
      if(s.length===0) s.push('No obvious quick issues found. For semantic checks (K8s rules, deprecated fields), use targeted validators (coming soon).');

      showSuggestions(s);
    } catch (err) {
      // jsyaml throws SyntaxError with mark info; build friendly message
      const raw = String(err && err.message ? err.message : err);
      let friendly = 'YAML Error: ' + raw;
      // try to extract line/column if present
      // js-yaml may embed "at line X, column Y"
      const m = raw.match(/at line (\d+), column (\d+)/);
      if(m){
        friendly += ` (line ${m[1]}, column ${m[2]})`;
      }
      showResult(friendly, true);

      // Provide suggestions based on error message heuristics
      const sug = [];
      if(/indentation|indent/i.test(raw)) sug.push('Bad indentation — use 2 spaces per indentation level. Avoid mixing tabs and spaces.');
      if(/expected <block|unexpected end of the document/i.test(raw)) sug.push('Document truncated or missing content after a mapping — check for incomplete lines or missing values.');
      if(/Can't find variable/i.test(raw) || /jsyaml/i.test(raw)) sug.push('Parser dependency issue (js-yaml). Ensure the page includes the js-yaml library. (This page loads it from CDN.)');
      if(/unknown/i.test(raw) && /directive/i.test(raw)) sug.push('Check for illegal characters or control characters in the file (invisible chars).');

      // default fallback
      if(sug.length===0) sug.push('Check indentation, ensure there are no tabs, and confirm your key-value lines use "key: value" format.');

      showSuggestions(sug);
    }
  }

  // Auto-fix (safe): normalize tabs -> 2 spaces, remove trailing whitespace, normalize line endings
  function tryAutoFix(){
    let text = editor.value;
    if(!text) return;
    // replace tabs with 2 spaces (safe)
    text = text.replace(/\t/g, '  ');
    // trim trailing spaces
    text = text.split(/\r?\n/).map(l => l.replace(/\s+$/,'')).join('\n');
    // replace CRLF with LF
    text = text.replace(/\r\n/g, '\n');
    // remove extraneous leading BOM
    text = text.replace(/^\uFEFF/,'');
    editor.value = text;
    showResult('Auto-fix applied: tabs -> 2 spaces, trimmed trailing whitespace. Re-run Analyze for parsing.', false);
    showSuggestions([]);
  }

  // Clear
  function clearEditor(){
    editor.value = '';
    showResult('Ready — paste YAML and click Analyze.', false);
    showSuggestions([]);
  }

  // Load example
  function loadExampleYaml(){
    editor.value = exampleYaml.textContent.trim();
    showResult('Example loaded. Click Analyze to validate.', false);
    showSuggestions([]);
  }

  // Events
  analyzeBtn.addEventListener('click', analyze);
  clearBtn.addEventListener('click', clearEditor);
  autofixBtn.addEventListener('click', tryAutoFix);
  loadExample.addEventListener('click', loadExampleYaml);

  // keyboard shortcut: ctrl/cmd + Enter to analyze
  editor.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){ e.preventDefault(); analyze(); }
  });

  // initial
  clearEditor();
})();

/* ---------------------------
   Auto-Fix (safe) - REPLACEMENT BLOCK
   Paste this block INSTEAD of the previous appended auto-fix IIFE.
   --------------------------- */
(function () {
  // Use the real element IDs used by the main script
  const inputEl = document.getElementById('editor');       // main textarea
  const outputEl = document.getElementById('resultBox');   // result display box
  const autoFixBtn = document.getElementById('autofixBtn'); // autofix button

  if (!autoFixBtn) {
    // No autofix button on page — nothing to do.
    return;
  }
  if (!inputEl) {
    console.warn('AutoFix: editor element (#editor) not found.');
  }

  // Single, reliable click handler that updates the editor reliably.
  autoFixBtn.addEventListener('click', function (e) {
    e && e.preventDefault();

    const original = inputEl ? (inputEl.value || '') : '';
    if (!original.trim()) {
      if (outputEl) {
        outputEl.textContent = 'Paste YAML first';
        outputEl.style.color = '#ffb5b5';
      }
      return;
    }

    // STEP 1 - safe normalizations
    let fixed = original.replace(/\t/g, '  ');    // tabs -> 2 spaces
    fixed = fixed.replace(/\r\n/g, '\n');         // CRLF -> LF
    fixed = fixed.replace(/\u00A0/g, ' ');        // NBSP -> normal space
    fixed = fixed.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n'); // trim trailing spaces

    // STEP 2 - very conservative missing-colon fixes
    fixed = fixed.split('\n').map((line) => {
      // ignore lines that already contain a colon before comment
      const pre = line.split('#')[0];
      if (/:/.test(pre)) return line;

      // pattern: indent + key + single-space + value (no colon)
      const m = line.match(/^(\s*)([A-Za-z0-9_@.\-]+)\s+([^#\n]+)$/);
      if (!m) return line;

      const indent = m[1] || '';
      const key = m[2] || '';
      const val = (m[3] || '').trim();

      // safety checks - do not transform list items or long lines
      if (/^\-/.test(key)) return line;
      if (val.includes(':')) return line;
      if (val.length > 120) return line;

      // conservative transformation
      return `${indent}${key}: ${val}`;
    }).join('\n');

    // STEP 3 - mild indentation reduction heuristics (prevent overaggressive changes)
    fixed = fixed.split('\n').map(line => {
      return line.replace(/^ {3,}/, match => '  ' + match.slice(2)); // reduce 3+ leading spaces by 1
    }).join('\n');

    // STEP 4 - optionally validate parse using js-yaml if available
    let parsedOk = false;
    try {
      if (typeof jsyaml !== 'undefined' && jsyaml.loadAll) {
        jsyaml.loadAll(fixed); // will throw if still invalid
        parsedOk = true;
      }
    } catch (err) {
      parsedOk = false;
    }

    // WRITE BACK to editor (this was the missing step previously)
    if (inputEl) inputEl.value = fixed;

    // SHOW FEEDBACK
    if (outputEl) {
      if (parsedOk) {
        outputEl.textContent = 'Auto-fix applied — YAML parses successfully now. Re-run Analyze to verify rules.';
        outputEl.style.color = '#cde6d5';
      } else {
        outputEl.textContent = 'Auto-fix applied (heuristic). The YAML may still have issues — click Analyze to see remaining errors.';
        outputEl.style.color = '#d1e4ff';
      }
    } else {
      console.log('Auto-fix applied. parsedOk=', parsedOk);
    }
  });
})();