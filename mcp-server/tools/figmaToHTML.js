import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

export default {
  name: "convertFigmaToHTML",
  description: "Convert Figma design file to plain HTML + CSS",
  async run({ fileKey }) {
    const key = fileKey || process.env.FIGMA_FILE_KEY;
    const apiKey = process.env.FIGMA_API_KEY;

    if (!apiKey) throw new Error("❌ FIGMA_API_KEY .env içinde tanımlı değil!");
    if (!key) throw new Error("❌ FIGMA_FILE_KEY belirtilmedi!");

    console.log(" Figma verisi çekiliyor...");

    const res = await fetch(`https://api.figma.com/v1/files/${key}`, {
      headers: { "X-Figma-Token": apiKey },
    });

    if (!res.ok) {
      throw new Error(` Figma API hatası: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(" Figma dosyası alındı:", data.name);

    let html = `<div class="figma-root">\n`;
    let css = `.figma-root { position: relative; min-height: 100vh; background: #f9f9f9; overflow: hidden; }\n`;

    function rgba(c) {
      if (!c) return "transparent";
      const { r, g, b, a } = c;
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a ?? 1})`;
    }

    function traverse(node) {
      const box = node.absoluteBoundingBox;
      if (!box) return;

      if (node.type === "RECTANGLE") {
        html += `<div style="position:absolute; left:${box.x}px; top:${box.y}px; width:${box.width}px; height:${box.height}px; background:${rgba(node.fills?.[0]?.color)};"></div>\n`;
      }

      if (node.type === "TEXT") {
        const text = node.characters?.replace(/\n/g, "<br/>") || "";
        html += `<p style="position:absolute; left:${box.x}px; top:${box.y}px; font-size:${node.style?.fontSize || 16}px; color:${rgba(node.fills?.[0]?.color)};">${text}</p>\n`;
      }

      if (node.fills?.some(f => f.type === "IMAGE")) {
        html += `<img src="#" alt="Figma Image" style="position:absolute; left:${box.x}px; top:${box.y}px; width:${box.width}px; height:${box.height}px;">\n`;
      }

      if (node.children) node.children.forEach(traverse);
    }

    traverse(data.document);
    html += `</div>`;

    const outputPath = "output/figmaToHTML.html";
    fs.writeFileSync(outputPath, html);
    console.log(` Dönüştürme tamamlandı! ➜ ${outputPath}`);

    return { html, css };
  },
};
