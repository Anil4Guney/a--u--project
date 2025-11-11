import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const FIGMA_API_KEY = process.env.FIGMA_API_KEY;
if (!FIGMA_API_KEY) throw new Error(" FIGMA_API_KEY .env içinde tanımlı değil!");

// --- CSS Stillerini depolamak için ---
let cssStore = {};

export default {
  name: "convertFigmaToHTML",
  description: "Figma'yı Auto-Layout'u CSS sınıflarına dönüştürerek işler.",
  
  async run({ fileKey, nodeId }) {
    const key = fileKey || process.env.FIGMA_FILE_KEY;
    if (!key) throw new Error(" FIGMA_FILE_KEY belirtilmedi!");

    // --- 1. CSS Store'u her çalıştırmada sıfırla ---
    cssStore = {};

    // --- 2. FIGMA'DAN ANA YAPIYI ÇEK ---
    const rootNode = await getFigmaNode(key, nodeId);
    
    // --- 3. YAPIYI GEZEREK HTML OLUŞTUR ve CSS'i DOLDUR ---
    const isRootNodeAutoLayout = rootNode.layoutMode === 'HORIZONTAL' || rootNode.layoutMode === 'VERTICAL';
    
    let childrenHtml = "";
    if (rootNode.children) {
      rootNode.children.forEach(node => {
        childrenHtml += traverse(
          node, 
          isRootNodeAutoLayout, 
          isRootNodeAutoLayout ? rootNode.layoutMode : null, // parentLayoutMode
          rootNode.absoluteBoundingBox, 
          isRootNodeAutoLayout ? rootNode.absoluteBoundingBox : null // autoLayoutParentBox
        ); 
      });
    }

    // --- 4. KÖK (ROOT) ELEMENTİN STİLLERİNİ VE SINIFINI AYARLA ---
    const rootClassName = `node-${rootNode.id.replace(/:/g, '-')}`;
    const rootStyles = getRootStyles(rootNode, isRootNodeAutoLayout);
    // Kök stilleri de cssStore'a ekle
    cssStore[`.${rootClassName}`] = Object.entries(rootStyles)
                                        .map(([key, value]) => `${key}: ${value};`)
                                        .join(' ');

    // --- 5. CSS Store'u tek bir string'e dönüştür ---
    let cssString = "";
    for (const [className, styles] of Object.entries(cssStore)) {
      cssString += `${className} {\n  ${styles}\n}\n`;
    }

    // --- 6. HTML ve CSS'i döndür ---
    const finalHtml = `<div class="${rootClassName}">\n${childrenHtml}\n</div>`;
    
    return { html: finalHtml, css: cssString }; 
  },
};

// --- YARDIMCI FONKSİYONLAR ---

async function getFigmaNode(key, nodeId) {
  let figmaApiUrl = `https://api.figma.com/v1/files/${key}`;
  let processedNodeId = null;
  if (nodeId) {
      processedNodeId = decodeURIComponent(nodeId.trim());
      if (processedNodeId.includes('-') && !processedNodeId.includes(':')) {
          console.log(`[figmaToHtml] Node ID formatı '-' -> ':' olarak düzeltiliyor.`);
          processedNodeId = processedNodeId.replace(/-/g, ':'); // Tüm tireleri değiştir
      } else if (processedNodeId.includes('.') && !processedNodeId.includes(':')) {
           console.log(`[figmaToHtml] Node ID formatı '.' -> ':' olarak düzeltiliyor.`);
           processedNodeId = processedNodeId.replace(/\./g, ':'); // Tüm noktaları değiştir
      }
  }
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
      throw new Error(`Node ID '${processedNodeId}' Figma yanıtında bulunamadı.`);
    }
    return data.nodes[processedNodeId].document;
  } else {
    const page = data.document.children?.[0];
    if (!page) throw new Error("Figma belgesinde sayfa bulunamadı.");
    return page;
  }
}

// --- YENİDEN YAZILMIŞ getRootStyles FONKSİYONU ---
function getRootStyles(rootNode, isRootNodeAutoLayout) {
  const styles = {};
  styles['position'] = 'relative';
  styles['overflow'] = 'hidden';
  styles['margin'] = 'auto'; // Konteynırı her zaman ortala

  if (rootNode.fills && rootNode.fills[0] && rootNode.fills[0].type === 'SOLID') {
    styles['background'] = rgba(rootNode.fills[0].color);
  } else if (rootNode.backgroundColor) {
     styles['background'] = rgba(rootNode.backgroundColor);
  } else {
     styles['background'] = "rgba(255, 255, 255, 1)";
  }
  
  if (isRootNodeAutoLayout) {
      // --- Auto-Layout Kök Öğesi (Finance Projesi gibi) ---
      styles['display'] = 'flex';
      styles['flex-direction'] = rootNode.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
      if (rootNode.itemSpacing) styles['gap'] = `${rootNode.itemSpacing}px`;
      styles['padding'] = `${rootNode.paddingTop || 0}px ${rootNode.paddingRight || 0}px ${rootNode.paddingBottom || 0}px ${rootNode.paddingLeft || 0}px`;
      styles['justify-content'] = mapAlign(rootNode.primaryAxisAlignItems);
      styles['align-items'] = mapAlign(rootNode.counterAxisAlignItems);

      // --- DÜZELTİLMİŞ GENİŞLİK MANTIĞI ---
      if (rootNode.layoutSizingHorizontal === 'HUG') {
        styles['width'] = 'auto'; // İçeriğe göre sar
      } else if (rootNode.layoutSizingHorizontal === 'FIXED') {
        styles['width'] = `${rootNode.absoluteBoundingBox.width}px`; // Sabit
      } else { // 'FILL'
        styles['width'] = '100%'; // Ebeveyni doldur (veya %100 ol)
      }

      // --- DÜZELTİLMİŞ YÜKSEKLİK MANTIĞI ---
      if (rootNode.layoutSizingVertical === 'HUG') {
          styles['height'] = 'auto'; // İçeriğe göre sar
      } else if (rootNode.layoutSizingVertical === 'FIXED') {
           styles['height'] = `${rootNode.absoluteBoundingBox.height}px`; // Sabit
      } else { // 'FILL'
          // Kök öğe 'FILL' ise, genellikle tüm ekranı kaplamasını isteriz
          styles['min-height'] = '100vh'; 
      }

  } else if (rootNode.absoluteBoundingBox) {
      // --- Auto-Layout DEĞİLSE (ByNoGame Projesi gibi) ---
      // Sabit boyutları uygula
      styles['width'] = `${rootNode.absoluteBoundingBox.width}px`;
      styles['height'] = `${rootNode.absoluteBoundingBox.height}px`;
  }
  
  return styles;
}
// --- getRootStyles FONKSİYONU SONU ---


function traverse(node, isParentAutoLayout, parentLayoutMode, parentBox, autoLayoutParentBox = null) { 
  if (node.visible === false || !node.absoluteBoundingBox) return "";

  const styles = {};
  let tag = 'div';
  let content = '';
  let attributes = '';
  let hasChildren = node.children && node.children.length > 0;
  
  const box = node.absoluteBoundingBox;
  const isThisNodeAutoLayout = node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL';
  
  const className = `node-${node.id.replace(/:/g, '-')}`;
  attributes = `class="${className}"`; 

  if (isParentAutoLayout) {
    
    // --- Auto-Layout içindeki mutlak konumlandırma ---
    if (node.layoutPositioning === 'ABSOLUTE') {
      styles['position'] = 'absolute';
      
      // Koordinatlar en yakın Auto-Layout ebeveynine (autoLayoutParentBox) göre olmalıdır.
      // DÜZELTME: refBox her zaman 'parentBox' olmalıdır.
      const refBox = parentBox; 
      
      styles['left'] = `${box.x - (refBox ? refBox.x : 0)}px`;
      styles['top'] = `${box.y - (refBox ? refBox.y : 0)}px`;
      styles['width'] = `${box.width}px`;
      styles['height'] = `${box.height}px`;
    } else {
      // --- Normal Auto-Layout akışı ---
      styles['position'] = 'relative'; 
      if (node.layoutSizingHorizontal === 'FILL') {
        styles['flex-grow'] = '1';
        styles['width'] = 'auto'; 
      } else if (node.layoutSizingHorizontal === 'HUG') {
        styles['width'] = 'auto'; 
      } else { // FIXED
        styles['width'] = `${box.width}px`;
      }
      
      if (node.layoutSizingVertical === 'FILL') {
        if (node.layoutAlign !== 'STRETCH') {
           styles['align-self'] = 'stretch';
        }
        styles['height'] = 'auto'; 
      } else if (node.layoutSizingVertical === 'HUG') {
        styles['height'] = 'auto'; 
      } else { // FIXED
        styles['height'] = `${box.height}px`;
      }
      
      if (node.layoutAlign === 'STRETCH') {
        styles['align-self'] = 'stretch';
        if (isParentAutoLayout && parentLayoutMode === 'HORIZONTAL') {
            delete styles['height']; 
        } else if (isParentAutoLayout && parentLayoutMode === 'VERTICAL') {
            delete styles['width']; 
        }
      } else if (node.layoutAlign === 'CENTER') {
        styles['align-self'] = 'center';
      } else if (node.layoutAlign === 'MIN') {
        styles['align-self'] = 'flex-start';
      } else if (node.layoutAlign === 'MAX') {
        styles['align-self'] = 'flex-end';
      }
    }
    
  } else {
    // Ebeveyn (parent) Auto-Layout DEĞİLSE (ByNoGame gibi)
    styles['position'] = 'absolute';
    styles['left'] = `${box.x - (parentBox ? parentBox.x : 0)}px`;
    styles['top'] = `${box.y - (parentBox ? parentBox.y : 0)}px`;
    styles['width'] = `${box.width}px`;
    styles['height'] = `${box.height}px`;
  }
  
  if (isThisNodeAutoLayout) {
    styles['display'] = 'flex';
    styles['flex-direction'] = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
    if (node.itemSpacing) styles['gap'] = `${node.itemSpacing}px`;
    styles['padding'] = `${node.paddingTop || 0}px ${node.paddingRight || 0}px ${node.paddingBottom || 0}px ${node.paddingLeft || 0}px`; 
    styles['justify-content'] = mapAlign(node.primaryAxisAlignItems);
    styles['align-items'] = mapAlign(node.counterAxisAlignItems);
    
    // DÜZELTME: 'HUG' (Sarma) ise, flex-grow'u engelle
    if(node.layoutSizingHorizontal === 'HUG') {
        styles['width'] = 'auto';
        styles['flex-grow'] = '0';
    }
    if(node.layoutSizingVertical === 'HUG') {
       styles['height'] = 'auto';
       styles['flex-grow'] = '0';
    }
  }
  if (node.fills && node.fills[0] && node.fills[0].type === 'SOLID') {
    if (node.type !== 'TEXT') styles['background-color'] = rgba(node.fills[0].color);
  }
  if (node.strokes && node.strokes[0] && node.strokes[0].type === 'SOLID') {
     styles['border'] = `${node.strokeWeight || 1}px solid ${rgba(node.strokes[0].color)}`;
  }
  if (node.cornerRadius) styles['border-radius'] = `${node.cornerRadius}px`;
  if (node.opacity) styles['opacity'] = node.opacity;
  
  if (node.type === 'TEXT') {
    tag = 'p';
    hasChildren = false; 
    content = node.characters?.replace(/\n/g, "<br/>") || "";
    if (node.style) {
        styles['font-family'] = `"${node.style.fontFamily}"`;
        styles['font-size'] = `${node.style.fontSize}px`;
        styles['font-weight'] = node.style.fontWeight;
        styles['line-height'] = `${node.style.lineHeightPx}px`;
        styles['letter-spacing'] = `${node.style.letterSpacing}px`;
        styles['text-align'] = node.style.textAlignHorizontal?.toLowerCase();
        if (node.fills && node.fills[0] && node.fills[0].type === 'SOLID') {
             styles['color'] = rgba(node.fills[0].color);
        }
    }
    if (isParentAutoLayout && node.layoutSizingHorizontal !== 'FIXED') {
        delete styles['width'];
    }
    if (isParentAutoLayout && node.layoutSizingVertical !== 'FIXED') {
         delete styles['height'];
    }
  } 
  else if (node.fills?.some(f => f.type === "IMAGE")) {
    tag = 'img';
    hasChildren = false;
    const safeName = node.name.replace(/"/g, "'");
    const fileName = sanitizeNameForPath(node.name);
    attributes += ` src="./images/${fileName}.png" alt="${safeName}" data-figma-name="${node.name}" `;
    delete styles['background-color'];
    if(isParentAutoLayout && node.layoutSizingHorizontal === 'FILL') styles['width'] = '100%';
    if(isParentAutoLayout && node.layoutSizingVertical === 'FILL') styles['height'] = '100%';
  }
  else if (isIconNode(node)) {
    tag = 'img';
    hasChildren = false;
    const safeName = node.name.replace(/"/g, "'");
    const fileName = sanitizeNameForPath(node.name); 
    attributes += ` src="./icons/${fileName}.svg" alt="${safeName}" `; 
    delete styles['background-color'];
  } 

  cssStore[`.${className}`] = Object.entries(styles)
                                  .map(([key, value]) => `${key}: ${value};`)
                                  .join(' ');

  let html = `<${tag} ${attributes}>`;

  if (hasChildren) {
    const newAutoLayoutParentBox = isThisNodeAutoLayout ? box : autoLayoutParentBox;
    node.children.forEach(child => {
        html += traverse(
          child, 
          isThisNodeAutoLayout, 
          isThisNodeAutoLayout ? node.layoutMode : null, // parentLayoutMode
          box, 
          newAutoLayoutParentBox
        ); 
    });
  } else if (tag === 'p') {
    html += content;
  }

  const voidElements = new Set(['img', 'br', 'hr', 'input']);
  if (!voidElements.has(tag)) {
    html += `</${tag}>`;
  }

  return html;
}

// ... (isIconNode, sanitizeNameForPath, rgba, mapAlign fonksiyonları değişmedi) ...

function isIconNode(node) {
    if (node.type === 'VECTOR') return true;
    if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
        if(node.absoluteBoundingBox) {
            const {width, height} = node.absoluteBoundingBox;
            if (width < 80 && height < 80) return true;
        }
        if (node.name.toLowerCase().includes('icon')) return true;
    }
    return false;
}
function sanitizeNameForPath(name) {
  if (!name) return 'placeholder';
  return name.toLowerCase().replace(/^(icon|image|img)\//, '').replace(/[^a-z0-9\s\/-]/g, '').replace(/[\s\/]+/g, '-').replace(/^-+|-+$/g, '');
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