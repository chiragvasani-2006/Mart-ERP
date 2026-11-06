import 'dotenv/config';
import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "20mb" }));

// API endpoint for OCR Invoice extraction using Gemini 3.6 Flash
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

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Remove data URL prefix if present (e.g. data:image/jpeg;base64,...)
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
                    mimeType: mimeType,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
          },
        });

        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (err: any) {
        console.warn(`Attempt ${attempt}/${maxRetries} with ${modelName} failed: ${err.message}`);
        lastError = err;
        if (attempt < maxRetries) {
          // Wait 1 second before retrying on temporary high demand spikes (503 / 429)
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    if (!responseText) {
      throw lastError || new Error("Gemini AI model failed to respond after retries.");
    }

    // Clean string response of any potential markdown wrapping
    const cleanText = responseText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error("Failed to parse Gemini OCR response:", cleanText);
      return res.status(422).json({
        error: "Failed to parse structured JSON from OCR model response",
        rawText: cleanText,
      });
    }

    // Server-side validation & normalization of items array
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const sanitizedItems = items.map((item: any) => ({
      productName: String(item.productName || item.name || "").trim(),
      quantity: Math.max(0, Number(item.quantity) || 0),
      mrp: Math.max(0, Number(item.mrp) || 0),
      purchasePrice: Math.max(0, Number(item.purchasePrice || item.rate || item.cost) || 0),
      expiryDate: item.expiryDate && typeof item.expiryDate === "string" && item.expiryDate.match(/^\d{4}-\d{2}-\d{2}$/)
        ? item.expiryDate
        : null,
    })).filter((i: any) => i.productName.length > 0);

    return res.json({
      success: true,
      items: sanitizedItems,
    });
  } catch (err: any) {
    console.error("Error in /api/extract-invoice:", err);
    return res.status(500).json({
      error: err.message || "An unexpected error occurred during invoice extraction",
    });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
