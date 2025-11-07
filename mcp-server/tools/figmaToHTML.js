import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

export default {
  name: "convertFigmaToHTML",
  description: "Convert Figma design (TEXT, RECTANGLE, IMAGE) into pure HTML + CSS layout.",
  async run({ fileKey }) {
    const key = fileKey || process.env.FIGMA_FILE_KEY;
    const apiKey = process.env.FIGMA_API_KEY;

    if (!apiKey) throw new Error(" FIGMA_API_KEY .env içinde tanımlı değil!");
    if (!key) throw new Error("FIGMA_FILE_KEY belirtilmedi!");

    console.log(" Figma verisi çekiliyor...");

    const res = await fetch(`https://api.figma.com/v1/files/${key}`, {
      headers: { "X-Figma-Token": apiKey },
    });

    if (!res.ok) {
      throw new Error(` Figma API hatası: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    console.log(" Figma dosyası alındı:", data.name);

    // === Yardımcı fonksiyonlar ===
    const rgba = (color) => {
      if (!color) return "transparent";
      const r = Math.round(color.r * 255);
      const g = Math.round(color.g * 255);
      const b = Math.round(color.b * 255);
      const a = color.a ?? 1;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    };

    let html = `<div class="figma-root">\n`;
    let css = `.figma-root { position: relative; min-height: 100vh; background: #f9f9f9; overflow: hidden; }\n`;

    // === Figma Layer'larını dolaş ===
    function traverse(node) {
      const box = node.absoluteBoundingBox;
      if (!box) return;

      const baseStyle = `
        position:absolute;
        left:${box.x}px;
        top:${box.y}px;
        width:${box.width}px;
        height:${box.height}px;
      `.replace(/\s+/g, " ");

      if (node.type === "RECTANGLE") {
        const fill = node.fills?.[0];
        const bg = fill?.type === "SOLID" ? rgba(fill.color) : "transparent";
        html += `<div style="${baseStyle} background:${bg};"></div>\n`;
      }

      if (node.type === "TEXT") {
        const text = node.characters?.replace(/\n/g, "<br/>") || "";
        const fill = node.fills?.[0];
        const color = fill?.type === "SOLID" ? rgba(fill.color) : "#000";
        const fontSize = node.style?.fontSize || 16;
        const fontWeight = node.style?.fontWeight || 400;
        html += `<p style="${baseStyle} font-size:${fontSize}px; font-weight:${fontWeight}; color:${color};">${text}</p>\n`;
      }

      if (node.fills?.some(f => f.type === "IMAGE")) {
        html += `<img src="#" alt="Figma Image" style="${baseStyle} object-fit:cover;">\n`;
      }

      if (node.children) node.children.forEach(traverse);
    }

    traverse(data.document);
    html += `</div>`;

    // === Dosyaya yaz ===
    if (!fs.existsSync("output")) fs.mkdirSync("output");
    const htmlPath = "output/figmaToHTML.html";
    const cssPath = "output/figmaToHTML.css";
    fs.writeFileSync(htmlPath, html, "utf-8");
    fs.writeFileSync(cssPath, css, "utf-8");

    console.log(`✨ Dönüştürme tamamlandı!\n ${htmlPath}\n ${cssPath}`);

    return { html, css };
  },
};
