import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const FIGMA_API_KEY = process.env.FIGMA_API_KEY;
if (!FIGMA_API_KEY) throw new Error(" FIGMA_API_KEY .env içinde tanımlı değil!");

export default {
  name: "convertFigmaToHTML",
  description: "Figma'yı Auto-Layout ve ikon yollarını anlayarak HTML'e dönüştürür.",
  
  async run({ fileKey, nodeId }) {
    const key = fileKey || process.env.FIGMA_FILE_KEY;
    if (!key) throw new Error(" FIGMA_FILE_KEY belirtilmedi!");

    // --- 1. FIGMA'DAN ANA YAPIYI ÇEK ---
    const rootNode = await getFigmaNode(key, nodeId);
    
    // --- 2. YAPIYI GEZEREK HTML OLUŞTUR ---
    const isRootNodeAutoLayout = rootNode.layoutMode === 'HORIZONTAL' || rootNode.layoutMode === 'VERTICAL';
    
    let childrenHtml = "";
    if (rootNode.children) {
      rootNode.children.forEach(node => {
        childrenHtml += traverse(node, isRootNodeAutoLayout); 
      });
    }

    // --- 3. KÖK (ROOT) ELEMENTİN STİLLERİNİ AYARLA ---
    const rootStyles = getRootStyles(rootNode, isRootNodeAutoLayout);
    const rootStyleString = Object.entries(rootStyles)
                                .map(([key, value]) => `${key}: ${value};`)
                                .join(' ');

    let finalHtml = `<div class="figma-root" style="${rootStyleString}">\n${childrenHtml}\n</div>`;
    
    return { html: finalHtml, css: null }; 
  },
};

// --- YARDIMCI FONKSİYONLAR ---

async function getFigmaNode(key, nodeId) {
  let figmaApiUrl = `https://api.figma.com/v1/files/${key}`;
  
  // --- GÜNCELLENDİ: Node ID'yi işleme ve '-' formatını ':' formatına çevirme ---
  let processedNodeId = null;
  if (nodeId) {
      processedNodeId = decodeURIComponent(nodeId.trim());
      // Kullanıcı '-' (örn: 101-1171) girdiyse, bunu ':' (101:1171) formatına çevir
      if (processedNodeId.includes('-') && !processedNodeId.includes(':')) {
          console.log(`[figmaToHtml] Node ID formatı '-' -> ':' olarak düzeltiliyor.`);
          processedNodeId = processedNodeId.replace('-', ':');
      }
  }
  // --- Güncelleme Sonu ---

  if (processedNodeId) {
    figmaApiUrl += `/nodes?ids=${processedNodeId}`;
    console.log(`[figmaToHtml] Spesifik node için istek atılıyor: ${processedNodeId}`);
  } else {
    console.log(`[figmaToHtml] Tam dosya için istek atılıyor: ${key}`);
  }

  const res = await fetch(figmaApiUrl, { headers: { "X-Figma-Token": FIGMA_API_KEY } });
  if (!res.ok) throw new Error(`Figma API hatası (files/nodes): ${res.statusText}`);
  const data = await res.json();

  if (processedNodeId) {
    if (!data.nodes || !data.nodes[processedNodeId]) {
      // API'nin 'bulunamadı' hatası vermesi durumunda
      throw new Error(`Node ID '${processedNodeId}' Figma yanıtında bulunamadı.`);
    }
    return data.nodes[processedNodeId].document;
  } else {
    const page = data.document.children?.[0];
    if (!page) throw new Error("Figma belgesinde sayfa bulunamadı.");
    return page;
  }
}

function getRootStyles(rootNode, isRootNodeAutoLayout) {
  const styles = {};
  styles['position'] = 'relative';
  styles['overflow'] = 'hidden';
  
  if (rootNode.fills && rootNode.fills[0] && rootNode.fills[0].type === 'SOLID') {
    styles['background'] = rgba(rootNode.fills[0].color);
  } else if (rootNode.backgroundColor) {
     styles['background'] = rgba(rootNode.backgroundColor);
  } else {
     styles['background'] = "rgba(255, 255, 255, 1)";
  }

  if(rootNode.absoluteBoundingBox) {
      styles['width'] = `${rootNode.absoluteBoundingBox.width}px`;
      styles['height'] = `${rootNode.absoluteBoundingBox.height}px`;
      styles['margin'] = '20px auto'; 
  }

  if (isRootNodeAutoLayout) {
      styles['display'] = 'flex';
      styles['flex-direction'] = rootNode.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
      if (rootNode.itemSpacing) styles['gap'] = `${rootNode.itemSpacing}px`;
      styles['padding'] = `${rootNode.paddingTop || 0}px ${rootNode.paddingRight || 0}px ${rootNode.paddingBottom || 0}px ${rootNode.paddingLeft || 0}px`;
      styles['justify-content'] = mapAlign(rootNode.primaryAxisAlignItems);
      styles['align-items'] = mapAlign(rootNode.counterAxisAlignItems);
  }
  return styles;
}

function traverse(node, isParentAutoLayout) { 
  if (node.visible === false || !node.absoluteBoundingBox) return "";

  const styles = {};
  let tag = 'div';
  let content = '';
  let attributes = '';
  let hasChildren = node.children && node.children.length > 0;
  
  const box = node.absoluteBoundingBox;
  const isThisNodeAutoLayout = node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL';
  
  // --- Stil Mantığı (Mutlak vs Auto-Layout) ---
  if (isParentAutoLayout) {
    if (node.layoutGrow === 1) styles['flex-grow'] = 1;
    if (node.layoutAlign === 'STRETCH') styles['align-self'] = 'stretch';
    else {
        styles['width'] = `${box.width}px`;
        styles['height'] = `${box.height}px`;
    }
  } else {
    styles['position'] = 'absolute';
    styles['left'] = `${box.x}px`;
    styles['top'] = `${box.y}px`;
    styles['width'] = `${box.width}px`;
    styles['height'] = `${box.height}px`;
  }

  // --- Auto-Layout Özellikleri ---
  if (isThisNodeAutoLayout) {
    styles['display'] = 'flex';
    styles['flex-direction'] = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
    if (node.itemSpacing) styles['gap'] = `${node.itemSpacing}px`;
    // --- HATA DÜZELTMESİ: 'rootNode' -> 'node' olarak değiştirildi ---
    styles['padding'] = `${node.paddingTop || 0}px ${node.paddingRight || 0}px ${node.paddingBottom || 0}px ${node.paddingLeft || 0}px`;
    // --- Düzeltme Sonu ---
    styles['justify-content'] = mapAlign(node.primaryAxisAlignItems);
    styles['align-items'] = mapAlign(node.counterAxisAlignItems);
    if(!isParentAutoLayout) {
        delete styles['position']; delete styles['left']; delete styles['top'];
    }
  }
  
  // --- Genel Stiller ---
  if (node.fills && node.fills[0] && node.fills[0].type === 'SOLID') {
    if (node.type !== 'TEXT') styles['background-color'] = rgba(node.fills[0].color);
  }
  if (node.strokes && node.strokes[0] && node.strokes[0].type === 'SOLID') {
     styles['border'] = `${node.strokeWeight || 1}px solid ${rgba(node.strokes[0].color)}`;
  }
  if (node.cornerRadius) styles['border-radius'] = `${node.cornerRadius}px`;
  
  // --- Element Tipine Göre İşleme (TEXT, VECTOR, IMAGE) ---
  if (node.type === 'TEXT') {
    tag = 'p';
    hasChildren = false; 
    content = node.characters?.replace(/\n/g, "<br/>") || "";
    if (node.style) {
        styles['font-size'] = `${node.style.fontSize}px`;
        styles['font-weight'] = node.style.fontWeight;
        if (node.fills && node.fills[0] && node.fills[0].type === 'SOLID') {
             styles['color'] = rgba(node.fills[0].color);
        }
    }
  } 
  else if (node.fills?.some(f => f.type === "IMAGE")) {
    tag = 'img';
    hasChildren = false;
    const safeName = node.name.replace(/"/g, "'");
    const fileName = sanitizeNameForPath(node.name);
    attributes = ` src="./images/${fileName}.png" alt="${safeName}" data-figma-name="${node.name}" `;
    delete styles['background-color'];
  }
  else if (isIconNode(node)) {
    tag = 'img';
    hasChildren = false;
    const safeName = node.name.replace(/"/g, "'");
    const fileName = sanitizeNameForPath(node.name); 
    attributes = ` src="./icons/${fileName}.svg" alt="${safeName}" `; 
    delete styles['background-color'];
  } 

  // --- HTML Oluşturma ---
  const styleString = Object.entries(styles)
                        .map(([key, value]) => `${key}: ${value};`)
                        .join(' ');

  let html = `<${tag} ${attributes} style="${styleString}">`;

  if (hasChildren) {
    node.children.forEach(child => {
        html += traverse(child, isThisNodeAutoLayout); 
    });
  } else if (tag === 'p') {
    html += content;
  }

  html += `</${tag}>`;
  return html;
}

function isIconNode(node) {
  if (node.type === 'VECTOR') return true;
  
  if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
     if(node.absoluteBoundingBox) {
        const {width, height} = node.absoluteBoundingBox;
        if (width < 80 && height < 80) return true;
     }
  }
  return false;
}

function sanitizeNameForPath(name) {
  if (!name) return 'icon-placeholder';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s\/-]/g, '') 
    .replace(/[\s\/]+/g, '-')       
    .replace(/^-+|-+$/g, '');
}

function rgba(c) {
  if (!c) return "transparent";
  const { r, g, b, a } = c;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a ?? 1})`;
}

function mapAlign(align) {
  switch (align) {
    case 'MIN': return 'flex-start';
    case 'MAX': return 'flex-end';
    case 'CENTER': return 'center';
    case 'SPACE_BETWEEN': return 'space-between';
    default: return 'flex-start'; 
  }
}