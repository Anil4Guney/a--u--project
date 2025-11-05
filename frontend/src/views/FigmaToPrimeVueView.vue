<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'

const figmaUrl = ref('')
const result = ref('')

function extractFileKey(url) {
  if (!url) return null;
  try {
    const m1 = url.match(/\/file\/([^\/\?\#]+)/);
    if (m1) return m1[1];
    const m2 = url.match(/\/design\/([^\/\?\#]+)/);
    if (m2) return m2[1];
    return null;
  } catch (e) { return null; }
}

async function convertFigma() {
  result.value = ''
  const key = extractFileKey(figmaUrl.value.trim());
  if (!key) {
    result.value = 'Invalid Figma URL — could not extract file key. Example URL: https://www.figma.com/file/<FILE_KEY>/...';
    return;
  }

  try {
    const res = await fetch('http://localhost:5050/mcp/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'convertFigmaToPrimeVue', args: { fileKey: key } })
    });
    const data = await res.json();
    result.value = data.result?.primevue_code || JSON.stringify(data, null, 2);
  } catch (err) {
    result.value = 'Error: ' + (err.message || err);
  }
}
</script>
