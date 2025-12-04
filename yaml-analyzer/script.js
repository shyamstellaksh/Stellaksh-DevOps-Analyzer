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
    if (!resultBox) return;
    resultBox.textContent = text;
    resultBox.style.color = isError ? '#ffb5b5' : '#cde6d5';
    if(isError) resultBox.style.borderColor = 'rgba(255,80,80,0.1)';
    else resultBox.style.borderColor = 'rgba(0,0,0,0.05)';
  }

  // Helper: suggestions list
  function showSuggestions(list){
    if(!suggestions) return;
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
    if (!editor) { console.warn('Analyze: editor not found'); return; }
    const text = editor.value.trim();
    if(!text){ showResult('No YAML provided. Paste a snippet and click Analyze.', true); showSuggestions([]); return;}
    try {
      // jsyaml is provided by CDN: window.jsyaml
      if (typeof jsyaml === 'undefined') {
        showResult('Parser missing: js-yaml not loaded. Check console.', true);
        showSuggestions(['Ensure js-yaml is loaded from CDN before this script.']);
        return;
      }
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

      if(sug.length===0) sug.push('Check indentation, ensure there are no tabs, and confirm your key-value lines use "key: value" format.');

      showSuggestions(sug);
    }
  }

  // Auto-fix (safe): normalize tabs -> 2 spaces, remove trailing whitespace, normalize line endings
  function tryAutoFix(){
    if (!editor || !resultBox) { console.warn('Autofix: required elements missing'); return; }
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
    if (!editor) return;
    editor.value = '';
    showResult('Ready — paste YAML and click Analyze.', false);
    showSuggestions([]);
  }

  // Load example
  function loadExampleYaml(){
    if (!editor || !exampleYaml) return;
    editor.value = exampleYaml.textContent.trim();
    showResult('Example loaded. Click Analyze to validate.', false);
    showSuggestions([]);
  }

  // Events (bind only if elements exist)
  if (analyzeBtn) analyzeBtn.addEventListener('click', analyze);
  if (clearBtn) clearBtn.addEventListener('click', clearEditor);
  if (autofixBtn) autofixBtn.addEventListener('click', tryAutoFix);
  if (loadExample) loadExample.addEventListener('click', loadExampleYaml);

  // keyboard shortcut: ctrl/cmd + Enter to analyze
  if (editor) {
    editor.addEventListener('keydown', function(e){
      if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){ e.preventDefault(); analyze(); }
    });
  }

  // initial
  clearEditor();

  // Expose a debug method so you can run autofix from console if needed
  window.stellakshAutoFix = tryAutoFix;
  window.stellakshAnalyze = analyze;

})(); // end main IIFE


/* ---------------------------
   DEBUG / Diagnostic Auto-Fix (conservative)
   This block is a small helper used only for debugging. It exposes a
   function window.stellakshAutoFixAdvanced() to run a more heuristic auto-fix
   and returns the transformed YAML (does not auto-commit unless called).
   --------------------------- */
(function(){
  function heuristicFix(original){
    if (!original) return original || '';
    let fixed = original.replace(/\t/g, '  ');
    fixed = fixed.replace(/\r\n/g, '\n');
    fixed = fixed.replace(/\u00A0/g, ' ');
    fixed = fixed.split('\n').map(l => l.replace(/[ \t]+$/,'')).join('\n');

    fixed = fixed.split('\n').map((line) => {
      const pre = line.split('#')[0];
      if (/:/.test(pre)) return line;
      const m = line.match(/^(\s*)([A-Za-z0-9_@.\-]+)\s+([^#\n]+)$/);
      if (!m) return line;
      const indent = m[1] || '';
      const key = m[2] || '';
      const val = (m[3] || '').trim();
      if (/^\-/.test(key)) return line;
      if (val.includes(':')) return line;
      if (val.length > 120) return line;
      return `${indent}${key}: ${val}`;
    }).join('\n');

    fixed = fixed.split('\n').map(line => line.replace(/^ {3,}/, match => '  ' + match.slice(2))).join('\n');
    return fixed;
  }

  // main exposed function for diagnostics (call in console)
  window.stellakshAutoFixAdvanced = function(commit){
    const ed = document.getElementById('editor');
    const out = document.getElementById('resultBox');
    if (!ed) { console.warn('editor not found'); return null; }
    const original = ed.value || '';
    const fixed = heuristicFix(original);
    if (commit) ed.value = fixed;
    if (out) out.textContent = commit ? 'Applied advanced heuristics (commit).' : 'Preview: run stellakshAutoFixAdvanced(true) to apply.';
    return fixed;
  };
})();