var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_genai = require("@google/genai");
var import_vite = require("vite");
var app = (0, import_express.default)();
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
app.use(import_express.default.json({ limit: "20mb" }));
app.post("/api/extract-invoice", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 in request body" });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY environment variable is not configured. Please create a .env file with GEMINI_API_KEY=your_key."
      });
    }
    const ai = new import_genai.GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const prompt = `You are an expert invoice optical character recognition (OCR) system for a retail bakery and grocery store.
Analyze the provided supplier invoice image or document and extract all line item products.

For each product item, extract:
- productName: string (clean, concise name of the item)
- quantity: number (total units purchased/received, default 0 if unreadable)
- mrp: number (Maximum Retail Price per unit if printed on invoice, default 0)
- purchasePrice: number (Cost price / rate per unit paid to supplier if listed, default 0)
- expiryDate: string in YYYY-MM-DD format if present on invoice, or null if not specified

CRITICAL INSTRUCTIONS:
Return ONLY a raw JSON object matching this exact schema:
{
  "items": [
    {
      "productName": "string",
      "quantity": number,
      "mrp": number,
      "purchasePrice": number,
      "expiryDate": "YYYY-MM-DD" | null
    }
  ]
}

Do NOT wrap the JSON in markdown code fences (\`\`\`json). Do NOT add conversational prose or explanations before or after the JSON.
If no products can be identified, return { "items": [] }.`;
    const modelName = "gemini-3.6-flash";
    let responseText = "";
    let lastError = null;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType
                  }
                },
                {
                  text: prompt
                }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json"
          }
        });
        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (err) {
        console.warn(`Attempt ${attempt}/${maxRetries} with ${modelName} failed: ${err.message}`);
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
      }
    }
    if (!responseText) {
      throw lastError || new Error("Gemini AI model failed to respond after retries.");
    }
    const cleanText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error("Failed to parse Gemini OCR response:", cleanText);
      return res.status(422).json({
        error: "Failed to parse structured JSON from OCR model response",
        rawText: cleanText
      });
    }
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const sanitizedItems = items.map((item) => ({
      productName: String(item.productName || item.name || "").trim(),
      quantity: Math.max(0, Number(item.quantity) || 0),
      mrp: Math.max(0, Number(item.mrp) || 0),
      purchasePrice: Math.max(0, Number(item.purchasePrice || item.rate || item.cost) || 0),
      expiryDate: item.expiryDate && typeof item.expiryDate === "string" && item.expiryDate.match(/^\d{4}-\d{2}-\d{2}$/) ? item.expiryDate : null
    })).filter((i) => i.productName.length > 0);
    return res.json({
      success: true,
      items: sanitizedItems
    });
  } catch (err) {
    console.error("Error in /api/extract-invoice:", err);
    return res.status(500).json({
      error: err.message || "An unexpected error occurred during invoice extraction"
    });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
