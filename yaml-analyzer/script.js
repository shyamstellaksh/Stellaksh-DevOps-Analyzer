// yaml-analyzer/script.js
// Minimal client-side YAML analyzer using js-yaml (loaded from CDN).
// - Analyze YAML and show parse errors
// - Provide simple suggestions (indentation, tabs, stray "kind Pod" errors, inline comments)
// - Try a safe auto-fix: convert tabs -> two spaces and remove trailing inline comments (heuristic)

// DOM refs
const yamlInput = document.getElementById('yamlInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const autofixBtn = document.getElementById('autofixBtn');
const resultBox = document.getElementById('result');
const suggestionsBox = document.getElementById('suggestions');

function showResult(html){
  resultBox.innerText = '';
  resultBox.innerHTML = html;
}

function showSuggestions(text){
  suggestionsBox.innerText = '';
  suggestionsBox.innerText = text;
}

function analyzeYAML(){
  const content = yamlInput.value.trim();
  if(!content){
    showResult('Paste YAML above and click Analyze.');
    showSuggestions('Ready — paste YAML and click Analyze.');
    return;
  }

  // Try parse using jsyaml
  try {
    // jsyaml may expose loadAll or load; attempt loadAll then fallback to load
    if (typeof jsyaml === 'undefined') {
      showResult('Error: js-yaml library not loaded. Check network or script include.');
      showSuggestions('Make sure you have the js-yaml script included (cdn.jsdelivr.net/npm/js-yaml).');
      return;
    }
    // parse all documents (multi-doc YAML)
    let docs = [];
    if (typeof jsyaml.loadAll === 'function') {
      jsyaml.loadAll(content, (d) => docs.push(d));
    } else {
      docs = [ jsyaml.load(content) ];
    }

    showResult('✔ YAML parsed successfully. Documents: ' + docs.length);
    showSuggestions('No errors found. You can now use other tools in the suite.');
  } catch (err) {
    // err.message contains the parse info
    const em = err && err.message ? err.message : String(err);
    showResult(`<span style="color:#ff9b9b">✖ YAML Error:</span>\n\n${escapeHtml(em)}`);
    // Simple heuristics for suggestions
    const s = generateSuggestions(em, content);
    showSuggestions(s);
  }
}

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function generateSuggestions(errorMsg, yamlText){
  let suggestions = [];

  const lower = errorMsg.toLowerCase();
  if(lower.includes('bad indentation') || lower.includes('end of the stream') || lower.includes('unknown')){
    suggestions.push('Check indentation: YAML is indentation-sensitive. Use **2 spaces** per level (do not use tabs).');
  }
  if(lower.includes('found character that cannot start any token') || lower.includes('cannot read a block mapping entry')){
    suggestions.push('There may be a stray character or wrong mapping. Look for lines with `:` and ensure key/value spacing is correct (e.g. `key: value`).');
  }
  if(lower.includes('can\'t find variable: jsyaml')){
    suggestions.push('The js-yaml library is missing from the page. Ensure the script tag for js-yaml is included. (The analyzer includes it by default.)');
  }
  // Detect common user mistakes in the text
  if(yamlText.indexOf('\t') !== -1){
    suggestions.push('Your YAML contains TAB characters — replace them with spaces (2 spaces per indent level).');
  }
  // quick pattern checks
  if(/\bkind\s+Pod\b/.test(yamlText) && !/\bkind:\s*Pod\b/.test(yamlText)){
    suggestions.push('It looks like a `kind` line is missing a colon. Use `kind: Pod` (add `:` after key).');
  }
  // inline comment problems (some tools choke on inline comments inside scalars)
  if(/#/.test(yamlText) && /:\s*[^#\n]+#/.test(yamlText)){
    suggestions.push('You have inline comments after values. Try moving comments to their own line or remove them for parsing.');
  }

  if(suggestions.length === 0){
    suggestions.push('Parsing failed. The error message above shows the parse point — check the indicated line/column in your YAML. Common fixes: consistent 2-space indentation, remove tabs, ensure `key: value` format.');
  } else {
    suggestions.unshift('Suggested fixes (based on the error):');
  }
  return suggestions.join('\n\n');
}

// Safe auto-fix attempt: replace tabs with 2 spaces and remove simple trailing inline comments
function tryAutoFix(){
  const content = yamlInput.value;
  if(!content) { showSuggestions('Nothing to fix. Paste YAML first.'); return; }

  // Heuristic transforms
  let fixed = content.replace(/\t/g, '  '); // tabs -> 2 spaces
  // Remove inline comments like "value  # comment" -> "value"
  fixed = fixed.split('\n').map(line => {
    // preserve full-line comment lines (starting with optional spaces + #)
    if(/^\s*#/.test(line)) return line;
    // remove trailing comment after a value
    return line.replace(/(^.*?[^'"])\s+#.*$/,'$1');
  }).join('\n');

  // Try to parse fixed version
  try {
    if (typeof jsyaml === 'undefined') {
      showResult('Error: js-yaml library not loaded. Auto-fix cannot run.');
      return;
    }
    let docs = [];
    if (typeof jsyaml.loadAll === 'function') {
      jsyaml.loadAll(fixed, (d) => docs.push(d));
    } else {
      docs = [ jsyaml.load(fixed) ];
    }
    // success
    yamlInput.value = fixed;
    showResult('✔ Auto-fix applied — YAML now parses. Documents: ' + docs.length);
    showSuggestions('Auto-fix changes performed:\n- tabs → 2 spaces\n- removed simple trailing inline comments\nCheck the file to ensure semantic correctness.');
  } catch (err) {
    const em = err && err.message ? err.message : String(err);
    showResult(`<span style="color:#ff9b9b">✖ Auto-fix failed — parse still errors</span>\n\n${escapeHtml(em)}`);
    showSuggestions('Auto-fix tried simple heuristics but could not produce a valid YAML. Please inspect the error location and fix manually (check indentation and missing colons).');
  }
}

// UI wiring
analyzeBtn.addEventListener('click', analyzeYAML);
clearBtn.addEventListener('click', () => {
  yamlInput.value = '';
  showResult('Editor cleared.');
  showSuggestions('Ready — paste YAML and click Analyze.');
});
autofixBtn.addEventListener('click', tryAutoFix);

// small helpers: sample clicks (optional)
document.getElementById('sampleGood')?.addEventListener('click', (e)=>{
  yamlInput.value = e.target.textContent;
});
document.getElementById('sampleBad')?.addEventListener('click', (e)=>{
  yamlInput.value = e.target.textContent;
});