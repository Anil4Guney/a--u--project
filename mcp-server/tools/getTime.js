// mcp-server/tools/getTime.js
export default {
  name: "getTime",
  description: "Return current server time (for tests).",
  async run() {
    return { time: new Date().toISOString() };
  },
};
