// script.js — YAML analyzer (client-side). Requires js-yaml loaded first (we load it via CDN).
(function () {
  const txt = document.getElementById('yaml-input');
  const result = document.getElementById('result');
  const suggestions = document.getElementById('suggestions');
  const analyzeBtn = document.getElementById('analyze');
  const clearBtn = document.getElementById('clear');
  const autofixBtn = document.getElementById('autofix');
  const loadGood = document.getElementById('load-good');
  const loadBad = document.getElementById('load-bad');

  if (typeof jsyaml === 'undefined') {
    result.textContent = 'Error: js-yaml library not loaded. Please ensure CDN is reachable.';
    return;
  }

  function showOk(parsed) {
    result.style.color = '#8BE28B';
    result.textContent = '✅ YAML OK — parsed successfully.\n\nPreview (first document):\n' + JSON.stringify(parsed, null, 2);
    suggestions.innerHTML = '<strong>No problems found.</strong>';
  }

  function showError(err) {
    result.style.color = '#ff8b6b';
    let message = '❌ YAML Error: ' + (err && err.message ? err.message : String(err));
    // If js-yaml includes mark info, show line/column
    if (err && err.mark) {
      message += `\n\nLine: ${err.mark.line + 1}, Column: ${err.mark.column + 1}`;
    }
    result.textContent = message;

    // basic suggestions heuristics
    const m = (err && err.message || '').toLowerCase();
    const suggs = [];
    if (m.includes('bad indentation')) {
      suggs.push('Fix indentation: YAML uses spaces (not tabs). Use consistent 2 spaces per level. Replace tabs with two spaces.');
    }
    if (m.includes('unexpected')) {
      suggs.push('Check for unexpected characters (colons, dashes). Ensure list items use "-" and mappings have "key: value".');
    }
    if (m.includes('end of the stream')) {
      suggs.push('Possibly an incomplete document. Ensure there are no unclosed structures (brackets/quoted strings).');
    }
    if (m.includes('cannot read')) {
      suggs.push('There might be a non-UTF character or control character; try retyping the offending line.');
    }
    if (suggs.length === 0) {
      suggs.push('Review the error message above for location and context. Try the safe Auto-Fix which replaces tabs and trims trailing spaces.');
    }
    suggestions.innerHTML = '<ul><li>' + suggs.join('</li><li>') + '</li></ul>';
  }

  analyzeBtn.addEventListener('click', function () {
    const text = txt.value;
    if (!text.trim()) {
      result.style.color = '#a7b0b8';
      result.textContent = 'Paste YAML then click Analyze.';
      suggestions.textContent = 'Ready — paste YAML and click Analyze.';
      return;
    }
    try {
      // parse all docs; return array if multiple
      const docs = [];
      jsyaml.loadAll(text, function (doc) { docs.push(doc); });
      if (docs.length === 0) {
        result.style.color = '#ff8b6b';
        result.textContent = '❌ YAML Error: empty document or parsing failed.';
        suggestions.textContent = 'Try simpler YAML or a single small snippet.';
        return;
      }
      // show first doc preview
      showOk(docs[0]);
    } catch (err) {
      showError(err);
    }
  });

  clearBtn.addEventListener('click', function () {
    txt.value = '';
    result.style.color = '#a7b0b8';
    result.textContent = 'Ready — paste YAML and click Analyze.';
    suggestions.textContent = 'No suggestions yet.';
  });

  autofixBtn.addEventListener('click', function () {
    const original = txt.value || '';
    if (!original.trim()) {
      suggestions.textContent = 'Nothing to auto-fix. Paste YAML first.';
      return;
    }

    // Safe autofix steps:
    // 1) Replace tabs with two spaces
    // 2) Trim trailing spaces on each line
    // 3) Remove BOM if present
    let fixed = original.replace(/\uFEFF/g, '');
    fixed = fixed.replace(/\t/g, '  ');
    fixed = fixed.split('\n').map(l => l.replace(/\s+$/,'')).join('\n');

    // Try parse; if it works, update textarea and show message
    try {
      const docs = [];
      jsyaml.loadAll(fixed, function (d) { docs.push(d); } );
      if (docs.length > 0) {
        txt.value = fixed;
        suggestions.innerHTML = '<strong>Auto-fix applied:</strong> tabs → 2 spaces; trimmed trailing spaces. Re-run Analyze to confirm.';
        showOk(docs[0]);
        return;
      }
    } catch (err) {
      // show error and suggested fix
      suggestions.innerHTML = '<strong>Auto-fix attempt failed.</strong> Applied simple fixes (tabs→spaces, trimmed). Further suggestion: ' +
        'inspect indentation at the reported line/column.';
      showError(err);
      return;
    }

    suggestions.textContent = 'Auto-fix attempted but parsing still fails. See Result for details.';
  });

  // quick sample YAMLs
  loadGood.addEventListener('click', function () {
    const sample = [
`apiVersion: v1
kind: Pod
metadata:
  name: goodpod
  labels:
    app: demo
spec:
  containers:
    - name: myapp
      image: nginx:latest`
    ].join('\n');
    txt.value = sample;
    result.textContent = 'Loaded valid sample. Click Analyze.';
    suggestions.textContent = 'Tip: Click Analyze to parse.';
  });

  loadBad.addEventListener('click', function () {
    const bad = [
`apiVersion: v1
kind Pod
metadata:
 name: badpod    # wrong indent
   labels:
     app: test
spec:
 containers:
  - name: myapp
    image: nginx:latest`
    ].join('\n');
    txt.value = bad;
    result.textContent = 'Loaded broken sample. Click Analyze to see the error and suggestions.';
    suggestions.textContent = 'Tip: Try Auto-Fix (safe) to fix tabs/trailing spaces.';
  });

})();