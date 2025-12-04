// script.js - YAML Analyzer (client-side)
// Requires: js-yaml loaded before this script (we used CDN in index.html)

/* Utility: safe JSON stringify with fallback */
function safeStringify(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch (e) { return String(obj); }
}

document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('yaml-input');
  const btn = document.getElementById('analyze-btn');
  const clearBtn = document.getElementById('clear-btn');
  const out = document.getElementById('yaml-output');

  if (!ta || !btn || !out) {
    console.error('YAML Analyzer: required DOM nodes missing');
    return;
  }

  // Default placeholder example (keeps UI friendly)
  if (!ta.value.trim()) {
    ta.value = `# Example: Kubernetes Pod
apiVersion: v1
kind: Pod
metadata:
  name: test-pod
spec:
  containers:
    - name: nginx
      image: nginx:1.24
`;
  }

  function showMessage(html) {
    out.innerHTML = html;
  }

  function showError(message) {
    showMessage(`<div style="color:#ff7b7b;font-weight:700">YAML Error: ${message}</div>`);
  }

  btn.addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) {
      showMessage('<span style="color:#f1c40f">Please paste YAML into the editor above.</span>');
      return;
    }

    // Ensure jsyaml is present
    if (typeof jsyaml === 'undefined') {
      showError("js-yaml library not found. Make sure the CDN script is included before script.js");
      return;
    }

    try {
      // Support multi-document YAML too
      let docs = [];
      // jsyaml.loadAll will parse multiple docs separated by '---'
      if (typeof jsyaml.loadAll === 'function') {
        jsyaml.loadAll(text, (doc) => { docs.push(doc); });
      } else {
        docs.push(jsyaml.load(text));
      }

      // If only one doc, show object, else show array
      const toShow = (docs.length === 1) ? docs[0] : docs;
      const pretty = safeStringify(toShow);
      showMessage(`<pre style="white-space:pre-wrap;color:#bfe6c6;background:#041016;padding:12px;border-radius:6px;overflow:auto">${pretty}</pre>`);
    } catch (err) {
      // Show parse error with message
      showError(err && err.message ? err.message : String(err));
    }
  });

  clearBtn.addEventListener('click', () => {
    ta.value = '';
    out.innerHTML = '';
    ta.focus();
  });
});