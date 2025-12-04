// script.js - YAML Analyzer + simple suggestion/fix engine
// Assumes jsyaml is available globally (we include js-yaml CDN in index.html)

// --- utility helpers
function el(id){ return document.getElementById(id); }
function setResult(text, cls){
  const r = el('result');
  r.className = 'result' + (cls ? ' ' + cls : '');
  r.textContent = text;
  r.classList.remove('hidden');
}
function clearResult(){ el('result').classList.add('hidden'); el('result').textContent=''; }
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// --- Text normalization auto-fix: tabs to 2 spaces, CRLF -> LF, remove trailing spaces
function normalizeWhitespace(yamlText){
  let before = yamlText;
  let text = yamlText.replace(/\t/g, "  ").replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
  return { fixed: text, changed: text !== before };
}

// --- Try to fix common list dash problems (naive)
function tryFixListDashes(yamlText){
  const lines = yamlText.split("\n");
  let changed = false;
  for(let i = 1; i < lines.length; i++){
    const prev = lines[i-1].trim();
    const cur = lines[i];
    // if previous is a mapping key (ends with ':') and current line looks like a list item missing '-' (indented and has 'key:')
    if(prev.endsWith(":") && /^\s{2,}[^-]\S+:\s*/.test(cur)){
      const indentMatch = cur.match(/^(\s+)/);
      const indent = indentMatch ? indentMatch[1] : "";
      lines[i] = indent + "- " + cur.trim();
      changed = true;
    }
  }
  return { fixed: lines.join("\n"), changed };
}

// --- Helper: find approximate line number for a key or value (naive)
function findLineForKey(text, key){
  const lines = text.split("\n");
  for(let i=0;i<lines.length;i++){
    if(lines[i].includes(key + ':')) return i+1;
  }
  return null;
}
function findLineForValue(text, val){
  if(!val) return null;
  const lines = text.split("\n");
  for(let i=0;i<lines.length;i++){
    if(lines[i].includes(String(val))) return i+1;
  }
  return null;
}

// --- Generate semantic advisory suggestions from parsed YAML objects
function generateSemanticSuggestions(parsedDocs, rawText){
  const suggestions = [];
  if(!parsedDocs) return suggestions;
  const docs = Array.isArray(parsedDocs) ? parsedDocs : [parsedDocs];

  docs.forEach((doc, idx) => {
    if(!doc || typeof doc !== 'object') return;

    // K8s-like suggestions when kind exists
    if(doc.kind){
      // metadata.name missing?
      if(!doc.metadata || !doc.metadata.name){
        suggestions.push({
          id: `add-name-${idx}`,
          severity: 'advisory',
          title: `Add metadata.name for ${doc.kind}`,
          description: `Kubernetes objects normally have metadata.name. Add an identifier for this resource.`,
          line: findLineForKey(rawText, 'metadata') || 1,
          suggestionText: `metadata:\n  name: my-${(doc.kind || 'resource').toLowerCase()}`
        });
      }

      // container image without tag inside common pod template paths
      const containersPaths = [
        (doc.spec && doc.spec.template && doc.spec.template.spec && doc.spec.template.spec.containers) || null,
        (doc.spec && doc.containers) || null,
        (doc.containers) || null
      ];
      containersPaths.forEach(contList => {
        if(Array.isArray(contList)){
          contList.forEach((c, ci) => {
            if(c && c.image && String(c.image).indexOf(':') === -1){
              suggestions.push({
                id: `image-tag-${idx}-${ci}`,
                severity: 'advisory',
                title: `Pin image tag for container '${c.name || ci}'`,
                description: `Images without tags default to 'latest' which is non-deterministic. Pin a stable tag or digest.`,
                line: findLineForValue(rawText, c.image) || 1,
                suggestionText: `image: ${c.image}:1.0.0`
              });
            }
            if(c && !c.resources){
              suggestions.push({
                id: `resources-${idx}-${ci}`,
                severity: 'advisory',
                title: `Add resource requests/limits for container '${c.name || ci}'`,
                description: `Add resource requests/limits to help scheduler decisions and avoid noisy-neighbor issues.`,
                line: findLineForValue(rawText, c.name || c.image) || 1,
                suggestionText:
`resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"`
              });
            }
          });
        }
      });

      // pod securityContext suggestion
      let podSpec = doc.spec && doc.spec.template && doc.spec.template.spec ? doc.spec.template.spec : null;
      if(podSpec && !podSpec.securityContext){
        suggestions.push({
          id: `runasnonroot-${idx}`,
          severity: 'advisory',
          title: `Add pod securityContext.runAsNonRoot`,
          description: `Ensure containers do not run as root; add securityContext to the pod spec.`,
          line: findLineForKey(rawText, 'spec') || 1,
          suggestionText:
`securityContext:
  runAsNonRoot: true`
        });
      }
    } // if doc.kind
  });

  return suggestions;
}

// --- Present suggestions in UI
function presentSuggestions(suggestions){
  const container = el('suggestions');
  container.innerHTML = '';
  if(!suggestions || suggestions.length === 0){
    container.innerHTML = '<div class="small">No suggestions found.</div>';
    return;
  }

  suggestions.forEach(s => {
    const wrap = document.createElement('div');
    wrap.className = 'suggestion';
    const title = document.createElement('h4');
    title.textContent = s.title + (s.severity ? ` (${s.severity})` : '');
    const desc = document.createElement('p');
    desc.textContent = s.description || '';
    const preview = document.createElement('pre');
    preview.className = 'suggest-preview';
    preview.innerHTML = escapeHtml(s.suggestionText || '');
    wrap.appendChild(title);
    wrap.appendChild(desc);
    wrap.appendChild(preview);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn';
    applyBtn.textContent = 'Apply';
    applyBtn.onclick = () => applySuggestionToTextarea(s);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = () => {
      navigator.clipboard && navigator.clipboard.writeText(s.suggestionText || '');
      alert('Suggestion copied to clipboard');
    };

    actions.appendChild(applyBtn);
    actions.appendChild(copyBtn);
    wrap.appendChild(actions);

    container.appendChild(wrap);
  });
}

// --- Apply suggestion: naive insertion near suggested line number (user confirmation)
function applySuggestionToTextarea(suggestion){
  if(!suggestion || !suggestion.suggestionText) return;
  if(!confirm('Apply suggestion?\n\n' + suggestion.title + '\n\nPreview:\n' + suggestion.suggestionText)) return;

  const ta = el('yaml-input');
  const raw = ta.value;
  const lines = raw.split('\n');

  // If a line number provided, insert after that line (0-based index insert position)
  let insertIndex = (suggestion.line ? suggestion.line : lines.length) ;
  if(insertIndex < 0) insertIndex = 0;

  // If suggestionText is a block, we ensure proper indentation when inserting
  const block = suggestion.suggestionText.split('\n');

  // Insert lines (basic)
  lines.splice(insertIndex, 0, ...block);

  ta.value = lines.join('\n');
  // re-run analyze automatically
  analyze();
}

// --- Try a set of automatic safe fixes (whitespace & minor list dash repair)
function tryAutoFixes(raw){
  let text = raw;
  const fixes = [];

  const n1 = normalizeWhitespace(text);
  if(n1.changed){ fixes.push('Normalized whitespace (tabs → 2 spaces, CRLF → LF, trimmed trailing spaces)'); text = n1.fixed; }

  const n2 = tryFixListDashes(text);
  if(n2.changed){ fixes.push('Fixed simple list dash problems (added missing "-")'); text = n2.fixed; }

  return { fixedText: text, fixes };
}

// --- Main analyze flow:
function analyze(){
  clearResult();
  el('suggestions').innerHTML = '';

  const raw = el('yaml-input').value || '';
  if(!raw.trim()){
    setResult('Paste YAML and click Analyze.', 'ok');
    return;
  }

  // 1) try parse using js-yaml
  try {
    // loadAll supports multi-doc YAML (--- separators)
    const docs = [];
    jsyaml.loadAll(raw, d => docs.push(d));

    setResult('YAML parsed successfully. ' + docs.length + ' doc(s) found.', 'ok');

    // 2) generate semantic suggestions
    const semSuggestions = generateSemanticSuggestions(docs, raw);
    presentSuggestions(semSuggestions);

  } catch (err) {
    // Parse error — show error and present safe auto-fix options
    const message = (err && err.message) ? err.message : String(err);
    setResult('YAML Error: ' + message, 'error');

    // produce auto-fix attempts
    const fixes = [];

    // normalize whitespace
    const norm = normalizeWhitespace(raw);
    if(norm.changed) fixes.push({title:'Normalize whitespace', desc:'Convert tabs → 2 spaces, CRLF→LF, trim trailing spaces', text: norm.fixed});

    // list dashes
    const dashes = tryFixListDashes(raw);
    if(dashes.changed) fixes.push({title:'Fix list dashes', desc:'Attempt to add missing "-" for list children', text: dashes.fixed});

    // Render fixes as suggestions
    if(fixes.length){
      const mapped = fixes.map((f, i) => ({
        id: 'autofix-' + i,
        severity: 'auto-fix',
        title: f.title,
        description: f.desc,
        suggestionText: f.text
      }));
      presentSuggestions(mapped);
    } else {
      el('suggestions').innerHTML = '<div class="small">No automatic fixes available. Please inspect error message above.</div>';
    }
  }
}

// --- wire controls
document.addEventListener('DOMContentLoaded', () => {
  el('analyze-btn').addEventListener('click', analyze);
  el('clear-btn').addEventListener('click', () => {
    el('yaml-input').value = '';
    clearResult();
    el('suggestions').innerHTML = '';
  });
  el('auto-fix-btn').addEventListener('click', () => {
    const raw = el('yaml-input').value || '';
    const res = tryAutoFixes(raw);
    if(!res.fixes.length){
      alert('No safe auto-fixes detected.');
      return;
    }
    if(confirm('Apply safe fixes?\n\n' + res.fixes.join('\n'))){
      el('yaml-input').value = res.fixedText;
      analyze();
    }
  });

  // initial UI state
  clearResult();
  el('suggestions').innerHTML = '<div class="small">Ready — paste YAML and click Analyze.</div>';
});