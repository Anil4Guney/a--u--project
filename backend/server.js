import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const apiKey = process.env.GEMINI_API_KEY;
console.log(">>> GEMINI_API_KEY present?:", !!apiKey);
if (!apiKey) {
  console.error("GEMINI_API_KEY bulunamadı. .env dosyasını kontrol et!");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

app.get("/", (req, res) => res.send("Gemini API backend çalışıyor!"));

app.post("/api/ask", async (req, res) => {
  try {
    const { prompt } = req.body;
    console.log("Frontend'den gelen prompt:", prompt ?? "");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt ?? "");
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
  console.log(`Gemini Server running on http://localhost:${port}`)
);
