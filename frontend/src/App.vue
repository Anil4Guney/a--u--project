<template>
  <div class="app-container p-6">
    <h1 class="text-2xl font-bold mb-4">Figma To HTML Converter</h1>

    <div class="chat-box flex gap-2 mt-4">
      <InputText
        v-model="userInput"
        placeholder="Enter Figma File Key"
        class="input"
      />
      <Button
        label="Convert Figma → HTML"
        icon="pi pi-code"
        severity="success"
        @click="convertFigma"
      />
    </div>

    <div v-if="response" class="mt-6">
      <h2 class="text-xl font-semibold mb-2">Generated HTML:</h2>
      <pre class="bg-gray-100 p-4 rounded text-sm border border-gray-300 overflow-x-auto">
{{ response }}
      </pre>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";

const userInput = ref("");
const response = ref("");

async function convertFigma() {
  if (!userInput.value.trim()) {
    alert("Please enter a valid Figma File Key!");
    return;
  }

  try {
    const res = await fetch("http://localhost:5050/mcp/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "convertFigmaToHTML",
        args: { fileKey: userInput.value.trim() },
      }),
    });

    const data = await res.json();
    if (data.result?.html) {
      response.value = data.result.html;
    } else {
      response.value = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    console.error("Figma conversion error:", err);
    response.value = "Error: " + err.message;
  }
}
</script>

<style scoped>
.app-container {
  max-width: 900px;
  margin: 0 auto;
}
.input {
  width: 420px;
}
pre {
  font-family: "Fira Code", monospace;
  background: #f7f7f7;
  border-radius: 8px;
  padding: 12px;
  white-space: pre-wrap;
  color: #111;
}
</style>
