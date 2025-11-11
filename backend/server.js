import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios"; 
import prettier from "prettier"; 

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY bulunamadı. .env dosyasını kontrol et!");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const MCP_SERVER_URL = "http://localhost:5050/mcp/run";

app.get("/", (req, res) => res.send("Gemini API backend çalışıyor!"));

app.post("/api/convert-figma", async (req, res) => {
  try {
    const { fileKey, nodeId } = req.body; 
    if (!fileKey) {
      return res.status(400).json({ error: "fileKey gereklidir." });
    }

    console.log(`[Backend] MCP-Server'a istek atılıyor (fileKey: ${fileKey}, nodeId: ${nodeId || 'yok'})`);
    
    const mcpResponse = await axios.post(MCP_SERVER_URL, {
      tool: "convertFigmaToHTML",
      args: { fileKey: fileKey, nodeId: nodeId }, 
    });

    const rawHtml = mcpResponse.data.result?.html;
    if (!rawHtml) {
      return res.status(500).json({
        error: "MCP-Server'dan ham HTML alınamadı.",
        details: mcpResponse.data,
      });
    }
    console.log(`[Backend] Ham HTML alındı (Uzunluk: ${rawHtml.length})`);

    // --- GÜNCELLENMİŞ AI PROMPT'U ---
    const prompt = `
      Aşağıda bir Figma dönüştürücüsünden gelen, 'inline styles' (style="...") ve 'base64' ile gömülmüş SVG ikonları içeren bir HTML kodu var.
      Görevin bu kodu optimize etmek ve temizlemektir.
      
      TALİMATLAR:
      1.  Bir <head> etiketi oluştur (veya mevcutsa onu kullan). İçine bir <meta charset="UTF-8">, <meta name="viewport" content="width=device-width, initial-scale=1.0"> ve bir <title> ekle.
      2.  <head> içine bir <style> etiketi ekle.
      3.  HTML body'sindeki TÜM 'inline style' özelliklerini (style="...") analiz et.
      4.  Tekrar eden veya mantıksal olarak gruplanabilen (örn. .sidebar, .button, .list-item) stiller için ANLAMLI CSS SINIFLARI (class) oluştur.
      5.  Tüm stilleri bu sınıflara taşıyarak <style> etiketinin içine yaz.
      6.  Body içindeki HTML elemanlarından 'style="..."' özelliklerini kaldır ve yerlerine 'class="..."' özelliklerini ekle.
      7.  HTML'in yapısını (<div>, <p> vb.) ve gömülü <img src="data:image/svg+xml;base64,..."> etiketlerini KORU. Onları değiştirme veya kaldırma.
      8.  'figma-root' div'ine 'box-sizing: border-box;' ve genel olarak '*' seçicisine 'box-sizing: inherit;' eklemek iyi bir praktiktir.
      9.  Yalnızca ve yalnızca bu talimatlara göre temizlenmiş, tam ve çalışır HTML kodunu yanıt olarak döndür. Ekstra açıklama veya markdown (\`\`\`html) kullanma.

      İşlenecek Ham HTML Kod:
      ${rawHtml}
    `;

    console.log("[Backend] Gemini'a iyileştirme için gönderiliyor...");
    const result = await geminiModel.generateContent(prompt);
    const reply = result.response.text();

    let cleanReply = reply.replace(/^```html\n?/i, "").replace(/```$/i, "");

    const formattedReply = await prettier.format(cleanReply, {
      parser: "html",
      printWidth: 100,
    });

    res.json({ optimizedHtml: formattedReply }); 

  } catch (error) {
    console.error("Dönüştürme hatası:", error.response?.data || error.message);
    res.status(500).json({
      error: "Ana dönüştürme hatası.",
      details: error.response?.data || error.message,
    });
  }
});


app.post("/api/ask", async (req, res) => {
  try {
    const { prompt } = req.body;
    console.log("Frontend'den gelen prompt:", prompt ?? "");
    const result = await geminiModel.generateContent(prompt ?? "");
    const reply = result.response.text();
    res.json({ reply });
  } catch (error) {
    console.error("Gemini hata:", error);
    res.status(500).json({
      reply: "Sunucu hatası — Gemini yanıt vermedi.",
      error: error.message || String(error),
    });
  }
});

app.listen(port, () =>
  console.log(` Gemini Orkestratör Server http://localhost:${port} adresinde çalışıyor`)
);