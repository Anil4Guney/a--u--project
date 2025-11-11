<template>
  <div class="app-container p-6">
    <h1 class="text-2xl font-bold mb-4">Figma To AI-HTML Converter</h1>

    <!-- Input Alanları -->
    <div class="chat-box flex flex-wrap gap-2 mt-4">
      <InputText
        v-model="userInput"
        placeholder="Enter Figma File Key"
        class="input-key"
        @keyup.enter="convertFigma"
      />
      <InputText
        v-model="nodeId"
        placeholder="Enter Node ID (Optional)"
        class="input-node"
        @keyup.enter="convertFigma"
      />
      <Button
        label="Convert Figma -> AI HTML"
        severity="success"
        @click="convertFigma"
        :loading="isLoading"
        class="convert-button"
      />
    </div>

    <!-- Durum Mesajları -->
    <div v-if="isLoading" class="mt-6 p-4 bg-blue-100 border border-blue-300 rounded text-blue-700">
      <p><strong>İşlem Başladı...</strong></p>
      <p>Figma verisi çekiliyor ve Gemini AI tarafından iyileştiriliyor. Bu işlem 30 saniye kadar sürebilir, lütfen bekleyin.</p>
    </div>
    <div v-if="error" class="mt-6 p-4 bg-red-100 border border-red-300 rounded text-red-700">
      <p><strong>Hata Oluştu:</strong> {{ error }}</p>
    </div>

    <!-- Sonuçlar: Önizleme ve Kod -->
    <div v-if="response && !isLoading" class="mt-6">
      
      <!-- Canlı Önizleme Başlığı ve Yeni Sekme Butonu -->
      <div class="flex justify-between items-center mb-2">
        <h2 class="text-xl font-semibold">Live Preview:</h2>
        <Button
          label="Open Preview in New Tab"
          severity="info"
          @click="openPreviewInNewTab"
          class="p-button-sm"
        />
      </div>

      <!-- Canlı Önizleme iframe -->
      <iframe
        :srcdoc="response"
        class="preview-frame"
        title="Figma Preview"
      ></iframe>

      <!-- Kod Gösterme Alanı -->
      <div class="code-section mt-4">
        <Button
          :label="showCode ? 'Hide Generated Code' : 'Show Generated Code'"
          severity="secondary"
          @click="showCode = !showCode"
          class="w-full"
        />
        
        <!-- YENİ: HTML ve CSS için TabView -->
        <TabView v-if="showCode" class="mt-2">
          <TabPanel header="HTML">
            <pre class="code-display">
{{ htmlContent }}
            </pre>
          </TabPanel>
          <TabPanel header="CSS">
            <pre class="code-display">
{{ cssContent }}
            </pre>
          </TabPanel>
        </TabView>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
// YENİ: TabView bileşenlerini import et
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';

const userInput = ref("");
const nodeId = ref(""); 
const response = ref("");
const isLoading = ref(false);
const error = ref(null);
const showCode = ref(false); 

// YENİ: Ayrıştırılmış HTML ve CSS için referanslar
const htmlContent = ref("");
const cssContent = ref("");

async function convertFigma() {
  if (!userInput.value.trim() || isLoading.value) {
    return;
  }

  isLoading.value = true;
  error.value = null;
  response.value = "";
  htmlContent.value = ""; // Temizle
  cssContent.value = ""; // Temizle
  showCode.value = false; 

  try {
    const res = await fetch("http://localhost:5000/api/convert-figma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileKey: userInput.value.trim(),
        nodeId: nodeId.value.trim() || null, 
      }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Bilinmeyen bir sunucu hatası oluştu.");
    }

    const data = await res.json();
    
    if (data.optimizedHtml) {
      response.value = data.optimizedHtml; // iframe'in kullanması için tam yanıtı sakla
      // YENİ: HTML'i ayrıştır ve referansları doldur
      parseHtmlAndSetContent(data.optimizedHtml);
    } else {
      throw new Error("Sunucudan beklenen optimizedHtml verisi gelmedi.");
    }

  } catch (err) {
    console.error("Figma conversion error:", err);
    error.value = err.message; 
    response.value = ""; 
  } finally {
    isLoading.value = false;
  }
}

// YENİ FONKSİYON: HTML'i ayrıştırıp CSS ve HTML içeriğini ayıran fonksiyon
function parseHtmlAndSetContent(htmlString) {
  try {
    // 1. CSS içeriğini <style>...</style> etiketleri arasından al
    const cssRegex = /<style>([\s\S]*?)<\/style>/i;
    const cssMatch = htmlString.match(cssRegex);
    cssContent.value = cssMatch ? cssMatch[1].trim() : "/* CSS bulunamadı */";

    // 2. HTML içeriğini <body>...</body> etiketleri arasından al
    const htmlRegex = /<body>([\s\S]*?)<\/body>/i;
    const htmlMatch = htmlString.match(htmlRegex);
    
    if (htmlMatch) {
      htmlContent.value = htmlMatch[1].trim();
    } else {
      // Body etiketi bulunamazsa (AI'ın tam bir HTML döndürmemesi ihtimaline karşı)
      // <div class="figma-root"...> etiketini bulmayı dene
      const rootRegex = /(<div class="figma-root"[^>]*>[\s\S]*<\/div>)/i;
      const rootMatch = htmlString.match(rootRegex);
      htmlContent.value = rootMatch ? rootMatch[1].trim() : "<!-- HTML içeriği bulunamadı -->";
    }

  } catch (e) {
    console.error("HTML ayrıştırma hatası:", e);
    htmlContent.value = "HTML ayrıştırılırken bir hata oluştu.";
    cssContent.value = "CSS ayrıştırılırken bir hata oluştu.";
  }
}

// YENİ FONKSİYON: Önizlemeyi yeni sekmede açar
function openPreviewInNewTab() {
  if (!response.value) return;

  try {
    const blob = new Blob([response.value], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } catch (e) {
    console.error("Yeni sekme açılırken hata oluştu:", e);
    error.value = "Önizleme yeni sekmede açılamadı. Lütfen konsolu kontrol edin.";
  }
}

</script>

<style scoped>
.app-container {
  max-width: 900px;
  margin: 0 auto;
}

.chat-box {
  display: flex;
  flex-wrap: wrap; 
  gap: 8px; 
}

.input-key {
  flex: 2 1 300px; 
  min-width: 200px;
}
.input-node {
  flex: 1 1 150px; 
  min-width: 150px;
}
.convert-button {
  flex: 1 1 auto; 
}

.preview-frame {
  width: 100%;
  height: 500px; 
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: #ffffff; 
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

/* YENİ: <pre> etiketleri için ortak stil */
.code-display {
  font-family: "Fira Code", monospace;
  background: #f7f7ff;
  border-radius: 8px;
  padding: 12px;
  white-space: pre-wrap; 
  color: #111;
  word-break: break-all; 
  max-height: 400px; /* Kod kutularına maksimum yükseklik */
  overflow-y: auto; /* Gerekirse kaydırma çubuğu çıkar */
}
</style>