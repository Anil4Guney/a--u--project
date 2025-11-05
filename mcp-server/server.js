// server.js içinde
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.MCP_PORT || 5050;

//  Tüm tool dosyalarını otomatik yükle
const tools = {};
const toolsPath = path.join(process.cwd(), "tools");
for (const file of fs.readdirSync(toolsPath)) {
  const toolModule = await import(`./tools/${file}`);
  const tool = toolModule.default;
  tools[tool.name] = tool;
  console.log(`🔹 Loaded tool: ${tool.name}`);
}

app.post("/mcp/run", async (req, res) => {
  const { tool, args } = req.body;
  try {
    if (!tools[tool]) return res.status(400).json({ error: `Unknown tool: ${tool}` });
    const result = await tools[tool].run(args || {});
    res.json({ result });
  } catch (error) {
    console.error("MCP Tool Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(` MCP + Figma Server running at http://localhost:${PORT}`);
});
