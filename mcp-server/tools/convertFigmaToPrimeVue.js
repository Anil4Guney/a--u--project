// mcp-server/tools/convertFigmaToPrimeVue.js
import fetch from "node-fetch";

/**
 * Tool: convertFigmaToPrimeVue
 * - Reads a Figma file via API
 * - Extracts TEXT nodes, IMAGE fills and simple SOLID fills
 * - Generates a readable PrimeVue single-file-component (template + script + style)
 *
 * Exports both `tool` (named) and default to be compatible with various loaders.
 */

export const tool = {
  name: "convertFigmaToPrimeVue",
  description: "Fetch a Figma file and convert text/images/solid-fills into a PrimeVue component.",
  parameters: {
    type: "object",
    properties: {
      fileKey: { type: "string", description: "Figma file key (from URL)" },
    },
  },

  async run(args = {}) {
    const FIGMA_API_KEY = process.env.FIGMA_API_KEY;
    const FILE_KEY = args.fileKey || process.env.FIGMA_FILE_KEY;

    if (!FIGMA_API_KEY) {
      return { error: "Missing FIGMA_API_KEY in .env" };
    }
    if (!FILE_KEY) {
      return { error: "Missing fileKey (pass args.fileKey or set FIGMA_FILE_KEY)" };
    }

    try {
      // 1) Get the Figma file JSON
      const fileRes = await fetch(`https://api.figma.com/v1/files/${FILE_KEY}`, {
        headers: { "X-Figma-Token": FIGMA_API_KEY },
      });

      if (!fileRes.ok) {
        const txt = await fileRes.text();
        return { error: `Figma API error (${fileRes.status}): ${txt}` };
      }

      const figmaData = await fileRes.json();

      // Collect nodes: text nodes, nodes with image fills, nodes with solid fills
      const textNodes = []; // { id, characters, style }
      const imageNodeIds = new Set(); // node ids that have image fills
      const coloredNodes = []; // nodes with SOLID fills { id, color }

      // recursive traversal
      function traverse(node) {
        if (!node || typeof node !== "object") return;
        const type = node.type;

        if (type === "TEXT") {
          textNodes.push({
            id: node.id,
            characters: node.characters ?? "",
            style: node.style ?? {},
            absoluteBoundingBox: node.absoluteBoundingBox ?? null,
          });
        }

        // check fills for images and solids
        if (Array.isArray(node.fills)) {
          for (const f of node.fills) {
            if (!f) continue;
            if (f.type === "IMAGE") {
              imageNodeIds.add(node.id);
            } else if (f.type === "SOLID" && typeof f.color === "object") {
              // capture color
              coloredNodes.push({
                id: node.id,
                color: f.color,
              });
              // we break to avoid duplicating if multiple fills; keep first solid
              break;
            }
          }
        }

        if (Array.isArray(node.children)) {
          for (const c of node.children) traverse(c);
        }
      }

      traverse(figmaData.document);

      // 2) If there are image nodes, call Figma Images API to get URLs
      let imageUrls = {};
      if (imageNodeIds.size > 0) {
        const idsParam = Array.from(imageNodeIds).join(",");
        // default format png (can use svg/jpg by adding &format=svg)
        const imagesRes = await fetch(
          `https://api.figma.com/v1/images/${FILE_KEY}?ids=${encodeURIComponent(idsParam)}&format=png`,
          { headers: { "X-Figma-Token": FIGMA_API_KEY } }
        );
        if (imagesRes.ok) {
          const imagesJson = await imagesRes.json();
          imageUrls = imagesJson.images || {};
        } else {
          // Not fatal — we'll continue without images
          console.warn("Warning: Figma images API returned", imagesRes.status);
        }
      }

      // Helper: convert figma color {r,g,b,a} to css rgba string
      function colorToRgba(c) {
        if (!c) return null;
        const r = Math.round((c.r ?? 0) * 255);
        const g = Math.round((c.g ?? 0) * 255);
        const b = Math.round((c.b ?? 0) * 255);
        const a = typeof c.a === "number" ? c.a : 1;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      }

      // Helper: simple mapping from font size to Tailwind text class
      function fontSizeToClass(size) {
        if (!size) return "text-base";
        if (size >= 48) return "text-3xl";
        if (size >= 30) return "text-2xl";
        if (size >= 20) return "text-xl";
        if (size >= 16) return "text-lg";
        return "text-base";
      }

      // Build template parts (array join to avoid backtick nesting issues)
      const tpl = [];
      tpl.push(`<template>`);
      tpl.push(`  <div class="auto-generated min-h-screen p-6 bg-gray-50">`);
      tpl.push(`    <div class="container mx-auto">`);
      tpl.push(`      <div class="grid">`);
      tpl.push(`        <div class="flex flex-wrap gap-4">`);
      tpl.push(`          <div class="w-full mb-4">`);
      tpl.push(`            <h1 class="text-2xl font-bold">Figma: ${escapeHtml(figmaData.name || "Untitled")}</h1>`);
      tpl.push(`          </div>`);

      // 3) Add text nodes (in source order). We attempt to preserve line breaks.
      // If there are many nodes, we produce a card for each (simple layout).
      for (const t of textNodes) {
        const raw = t.characters ?? "";
        const safe = escapeHtml(raw);
        // derive basic font-size class if possible
        const size = t.style?.fontSize ?? null;
        const fw = t.style?.fontWeight ?? null;
        const sizeClass = fontSizeToClass(size);
        const weightClass = fw && fw >= 700 ? "font-semibold" : "";
        tpl.push(`          <div class="w-full md:w-1/2 lg:w-1/3">`);
        tpl.push(`            <div class="p-4 border rounded bg-white shadow-sm">`);
        // preserve newlines as <br/>
        const inner = safe.replace(/\n/g, "<br/>");
        tpl.push(`              <p class="${sizeClass} ${weightClass} leading-relaxed">${inner}</p>`);
        tpl.push(`            </div>`);
        tpl.push(`          </div>`);
      }

      // 4) Add image nodes (if any)
      for (const [id, url] of Object.entries(imageUrls)) {
        if (!url) continue;
        tpl.push(`          <div class="w-full md:w-1/2 lg:w-1/3">`);
        tpl.push(`            <div class="p-2">`);
        tpl.push(`              <img src="${url}" alt="figma-image-${id}" class="w-full h-auto rounded shadow-sm" />`);
        tpl.push(`            </div>`);
        tpl.push(`          </div>`);
      }

      // 5) Add colored nodes summary (optional): show swatches for coloredNodes
      if (coloredNodes.length > 0) {
        tpl.push(`          <div class="w-full mb-2">`);
        tpl.push(`            <h3 class="text-lg font-medium">Color swatches found in file</h3>`);
        tpl.push(`          </div>`);
        for (const cnode of coloredNodes.slice(0, 24)) {
          const rgba = colorToRgba(cnode.color) || "transparent";
          tpl.push(`          <div class="w-24">`);
          tpl.push(`            <div class="h-12 w-24 rounded border" style="background: ${rgba};"></div>`);
          tpl.push(`          </div>`);
        }
      }

      tpl.push(`        </div>`); // flex
      tpl.push(`      </div>`); // grid
      tpl.push(`    </div>`); // container
      tpl.push(`  </div>`); // auto-generated
      tpl.push(`</template>`);
      tpl.push("");
      tpl.push("<script setup>");
      tpl.push("// Auto-generated PrimeVue-friendly template (stateless).");
      tpl.push("</script>");
      tpl.push("");
      tpl.push("<style scoped>");
      tpl.push(`/* Auto-generated from Figma file: ${FILE_KEY} */`);
      tpl.push(".auto-generated { background-color: #f9fafb; }");
      tpl.push("</style>");

      const primevue_code = tpl.join("\n");

      return { primevue_code };
    } catch (err) {
      console.error("convertFigmaToPrimeVue error:", err);
      return { error: err.message ?? String(err) };
    }
  },
};

// export default for compatibility
export default tool;

/* ---------- Utility: minimal HTML-escape ---------- */
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
