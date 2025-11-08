import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios"; 

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
    const { fileKey } = req.body;
    if (!fileKey) {
      return res.status(400).json({ error: "fileKey gereklidir." });
    }

    console.log(`[Backend] MCP-Server'a istek atılıyor (fileKey: ${fileKey})`);
    const mcpResponse = await axios.post(MCP_SERVER_URL, {
      tool: "convertFigmaToHTML",
      args: { fileKey: fileKey },
    });

    const rawHtml = mcpResponse.data.result?.html;
    if (!rawHtml) {
      return res.status(500).json({
        error: "MCP-Server'dan ham HTML alınamadı.",
        details: mcpResponse.data,
      });
    }
    console.log(`[Backend] Ham HTML alındı (Uzunluk: ${rawHtml.length})`);

    const prompt = `
      Aşağıda bir Figma tasarımından 'Akıllı Ayrıştırıcı' ile dönüştürülmüş ham bir HTML kodu var.
      Bu kod zaten 'display: flex' (Auto-Layout için) ve 'position: absolute' (sayfanın ana bölümleri için) karışımı içeriyor.
      Görevin:
      1. Bu koddaki 'position: absolute', 'left', 'top', 'right', 'bottom' gibi TÜM MUTLAK KONUMLANDIRMA stillerini KALDIR.
      2. Bu elemanları (ana konteynerleri), normal bir web sayfasında olduğu gibi (örn. 'display: block' veya 'display: flex; flex-direction: column;') mantıklı bir şekilde alt alta akmasını sağla.
      3. Kodun içinde 'display: flex' ile tanımlanmış (Auto-Layout'tan gelen) iç yapıları KORU.
      4. Stilleri <head> içindeki <style> etiketlerine taşı.
      5. Nihai HTML çıktısında ASLA 'position: absolute' bulunmamalıdır. Çıktı duyarlı (responsive) olmalıdır.
      6. Yalnızca ve yalnızca bu talimatlara göre temizlenmiş, tam ve çalışır HTML kodunu yanıt olarak döndür. Ekstra açıklama veya markdown (\`\`\`html) kullanma.

      İşlenecek Ham HTML Kod:
      ${rawHtml}
    `;

    console.log("[Backend] Gemini'a iyileştirme için gönderiliyor...");
    const result = await geminiModel.generateContent(prompt);
    const reply = result.response.text();


    res.json({ optimizedHtml: reply });

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