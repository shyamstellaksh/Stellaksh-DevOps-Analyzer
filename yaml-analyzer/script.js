function analyze() {
    const input = document.getElementById("input").value;
    try {
        jsyaml.load(input);
        document.getElementById("output").textContent = "✔ YAML is valid!";
    } catch (err) {
        document.getElementById("output").textContent = "❌ Error: " + err.message;
    }
}