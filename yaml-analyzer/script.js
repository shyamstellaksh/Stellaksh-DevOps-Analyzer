function validateYAML() {
    const input = document.getElementById("yamlInput").value;
    const output = document.getElementById("output");

    try {
        jsyaml.load(input);
        output.textContent = "✅ YAML is valid!";
        output.style.color = "#0f0";
    } catch (error) {
        output.textContent = "❌ YAML Error:\n\n" + error.message;
        output.style.color = "#ff4d4d";
    }
}