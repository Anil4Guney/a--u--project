<template>
  <div class="app-container p-6">
    <h1 class="text-2xl font-bold mb-4">Figma To HTML Converter</h1>

    <div class="flex gap-2 mb-4">
      <InputText
        v-model="fileKey"
        placeholder="Enter Figma File Key"
        class="input"
      />
      <Button
        label="Convert"
        icon="pi pi-code"
        severity="success"
        @click="convertFigma"
      />
    </div>

    <div v-if="response" class="mt-6">
      <h2 class="text-xl font-semibold mb-2">Generated HTML:</h2>
      <pre class="code-block">{{ response }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";

const fileKey = ref("");
const response = ref("");

async function convertFigma() {
  if (!fileKey.value.trim()) {
    alert("Please enter a valid Figma File Key!");
    return;
  }

  try {
    const res = await fetch("http://localhost:5050/mcp/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "convertFigmaToHTML",
        args: { fileKey: fileKey.value.trim() },
      }),
    });

    const data = await res.json();
    if (data.result?.html) {
      response.value = data.result.html;
    } else {
      response.value = JSON.stringify(data, null, 2);
    }
  } catch (err) {
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
.code-block {
  background: #f9f9f9;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #ccc;
  font-family: "Fira Code", monospace;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
