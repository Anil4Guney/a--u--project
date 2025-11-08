import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.MCP_PORT || 5050;
const tools = {};

async function loadTools() {
  const toolsDir = path.resolve("./tools");
  if (!fs.existsSync(toolsDir)) {
    console.warn(" tools dizini bulunamadı:", toolsDir);
    return;
  }

  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith(".js"));
  for (const f of files) {
    const modulePath = path.join(toolsDir, f);
    try {
      const moduleUrl = pathToFileURL(modulePath).href;
      const imported = await import(moduleUrl);

      if (imported.default && imported.default.name && typeof imported.default.run === "function") {
        tools[imported.default.name] = imported.default;
        console.log(` Loaded tool: ${imported.default.name}`);
        continue;
      }

      if (imported.tool && imported.tool.name && typeof imported.tool.run === "function") {
        tools[imported.tool.name] = imported.tool;
        console.log(` Loaded tool: ${imported.tool.name}`);
        continue;
      }

      if (imported.name && typeof imported.execute === "function") {
        tools[imported.name] = { name: imported.name, run: imported.execute, description: imported.description ?? "" };
        console.log(` Loaded tool (execute): ${imported.name}`);
        continue;
      }

      console.warn(` Skipped ${f}: no valid export (default/tool/execute) found.`);
    } catch (err) {
      console.error(` Failed to load tool ${f}:`, err.message);
    }
  }
}

app.post("/mcp/run", async (req, res) => {
  const { tool: toolName, args } = req.body ?? {};
  try {
    if (!toolName) return res.status(400).json({ error: "Tool name required" });

    const selected = tools[toolName];
    if (!selected) return res.status(400).json({ error: `Unknown tool: ${toolName}` });

    const result = await selected.run(args ?? {});
    return res.json({ result });
  } catch (err) {
    console.error(" MCP Tool Error:", err);
    return res.status(500).json({ error: err.message ?? String(err) });
  }
});

(async () => {
  await loadTools();
  app.listen(PORT, () => {
    console.log(` MCP + Figma Server running at http://localhost:${PORT}`);
  });
})();
