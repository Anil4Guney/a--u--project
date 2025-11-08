import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

export default {
  name: "convertFigmaToHTML",
  description: "Figma'yı Auto-Layout'u anlayarak HTML'e dönüştürür.",
  async run({ fileKey }) {
    const key = fileKey || process.env.FIGMA_FILE_KEY;
    const apiKey = process.env.FIGMA_API_KEY;

    if (!apiKey) throw new Error(" FIGMA_API_KEY .env içinde tanımlı değil!");
    if (!key) throw new Error(" FIGMA_FILE_KEY belirtilmedi!");

    const res = await fetch(`https://api.figma.com/v1/files/${key}`, {
      headers: { "X-Figma-Token": apiKey },
    });
    if (!res.ok) throw new Error(` Figma API hatası: ${res.statusText}`);

    const data = await res.json();
    const page = data.document.children?.[0];
    if (!page) throw new Error("Figma belgesinde sayfa bulunamadı.");

    const pageBackground = rgba(page.backgroundColor);
    
    let childrenHtml = "";
    if (page.children) {
      page.children.forEach(node => {
        childrenHtml += traverse(node, false); 
      });
    }

    const finalHtml = `<div class="figma-root" style="position: relative; min-height: 100vh; overflow: hidden; background: ${pageBackground};">\n${childrenHtml}\n</div>`;
    
    return { html: finalHtml, css: null }; 
  },
};

function traverse(node, isParentAutoLayout) {
  if (node.visible === false || !node.absoluteBoundingBox) {
    return "";
  }

  const styles = {};
  let tag = 'div';
  let content = '';
  let attributes = '';
  let hasChildren = node.children && node.children.length > 0;
  
  const box = node.absoluteBoundingBox;


  const isThisNodeAutoLayout = node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL';
  
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

  // 2. Düzen (Auto-Layout)
  if (isThisNodeAutoLayout) {
    styles['display'] = 'flex';
    styles['flex-direction'] = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
    if (node.itemSpacing) styles['gap'] = `${node.itemSpacing}px`;
    styles['padding'] = `${node.paddingTop || 0}px ${node.paddingRight || 0}px ${node.paddingBottom || 0}px ${node.paddingLeft || 0}px`;
    styles['justify-content'] = mapAlign(node.primaryAxisAlignItems);
    styles['align-items'] = mapAlign(node.counterAxisAlignItems);
  }

  if (node.fills && node.fills[0] && node.fills[0].type === 'SOLID') {
    if (node.type !== 'TEXT') { 
      styles['background-color'] = rgba(node.fills[0].color);
    }
  }
  if (node.strokes && node.strokes[0] && node.strokes[0].type === 'SOLID') {
     styles['border'] = `${node.strokeWeight || 1}px solid ${rgba(node.strokes[0].color)}`;
  }
  if (node.cornerRadius) styles['border-radius'] = `${node.cornerRadius}px`;
  
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
  else if (isImageNode(node)) {
    tag = 'img';
    hasChildren = false; 
    const safeName = node.name.replace(/"/g, "'");
    const fileName = node.name.toLowerCase()
                        .replace(/[^a-z0-9\s-]/g, '') 
                        .replace(/\s+/g, '-') 
                        .replace(/^-|-$/g, ''); 
    attributes = ` src="./images/${fileName || 'figma-export'}.png" alt="${safeName}" data-figma-name="${node.name}" `;
  } 

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

function isImageNode(node) {
    if (node.fills?.some(f => f.type === "IMAGE")) return true;
    return node.type === "VECTOR" || 
           node.type === "GROUP" || 
           node.type === "COMPONENT" || 
           node.type === "INSTANCE";
}