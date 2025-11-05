import fetch from "node-fetch";

export default {
  name: "convertFigmaToPrimeVue",
  description: "Convert Figma file (texts + images) into PrimeVue code",
  async run({ fileKey }) {
    const apiKey = process.env.FIGMA_API_KEY;
    if (!apiKey) throw new Error("FIGMA_API_KEY not found");

    if (!fileKey) throw new Error("No fileKey provided");

    // Figma dosyasını al
    const fileRes = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
      headers: { "X-Figma-Token": apiKey },
    });

    if (!fileRes.ok) {
      const text = await fileRes.text();
      throw new Error(`Figma API error (${fileRes.status}): ${text}`);
    }

    const figmaData = await fileRes.json();

    //  Görsellerin ID’lerini al
    const imageNodeIds = [];
    const textNodes = [];

    function traverse(node) {
      if (node.type === "TEXT") textNodes.push(node);
      if (node.fills?.some(f => f.type === "IMAGE")) imageNodeIds.push(node.id);
      if (node.children) node.children.forEach(traverse);
    }
    traverse(figmaData.document);

    //  Görsel URL’lerini al
    let imageUrls = {};
    if (imageNodeIds.length > 0) {
      const imgRes = await fetch(
        `https://api.figma.com/v1/images/${fileKey}?ids=${imageNodeIds.join(",")}`,
        { headers: { "X-Figma-Token": apiKey } }
      );
      const imgJson = await imgRes.json();
      imageUrls = imgJson.images || {};
    }

    //  HTML + PrimeVue kodunu oluştur
    const htmlParts = [];

    htmlParts.push(`<template>`);
    htmlParts.push(`<div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">`);
    htmlParts.push(`<Card class="shadow-lg max-w-2xl w-full">`);
    htmlParts.push(`<template #title><h2 class="text-2xl font-bold">${figmaData.name}</h2></template>`);
    htmlParts.push(`<template #content>`);

    // Yazı layer'ları
    textNodes.forEach(t => {
      const text = t.characters ? t.characters.replace(/\n/g, "<br/>") : "";
      htmlParts.push(`<p>${text}</p>`);
    });

    // Görsel layer'ları
    Object.entries(imageUrls).forEach(([id, url]) => {
      htmlParts.push(`<img src="${url}" alt="Figma Image ${id}" class="my-2 rounded" />`);
    });

    htmlParts.push(`</template>`);
    htmlParts.push(`</Card>`);
    htmlParts.push(`</div>`);
    htmlParts.push(`</template>`);
    htmlParts.push(``);
    htmlParts.push(`<script setup>`);
    htmlParts.push(`import Card from "primevue/card";`);
    htmlParts.push(`</script>`);
    htmlParts.push(``);
    htmlParts.push(`<style scoped>`);
    htmlParts.push(`/* Auto-generated from Figma file: ${fileKey} */`);
    htmlParts.push(`</style>`);

    const primevue_code = htmlParts.join("\n");

    return { primevue_code };
  },
};
