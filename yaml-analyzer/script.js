function analyzeYAML() {
    const input = document.getElementById("inputYAML").value;
    const output = document.getElementById("output");
    const suggestions = document.getElementById("suggestions");

    output.textContent = "";
    suggestions.textContent = "";

    try {
        const parsed = jsyaml.load(input);  // js-yaml now loaded correctly
        output.style.borderLeftColor = "#238636"; 
        output.textContent = "✓ YAML is valid";

        let tips = getSuggestions(parsed);
        suggestions.innerHTML = "<strong>Suggestions:</strong>\n" + tips;

    } catch (err) {
        output.style.borderLeftColor = "#d73a49";
        output.textContent = "❌ YAML Error:\n\n" + err.message;
    }
}

// Suggest improvements
function getSuggestions(obj) {
    let tips = "";

    if (obj.kind && (obj.kind.toLowerCase() === "pod" || obj.kind === "Deployment")) {
        if (obj.spec?.containers) {
            obj.spec.containers.forEach(c => {
                if (c.image && c.image.includes(":latest")) {
                    tips += "- Avoid using `latest` tag in production.\n";
                }
                if (c.resources === undefined) {
                    tips += "- Add CPU/Memory resource limits for container `" + c.name + "`.\n";
                }
            });
        }
    }

    return tips || "No suggestions — looks good!";
}

function clearFields() {
    document.getElementById("inputYAML").value = "";
    document.getElementById("output").textContent = "";
    document.getElementById("suggestions").textContent = "";
}

function autoFixYAML() {
    alert("Auto-Fix will be added soon!");
}