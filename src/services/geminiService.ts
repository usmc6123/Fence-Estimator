import { GoogleGenAI, Type } from "@google/genai";
import { QuoteItem } from "../types";

// Lazy initialization of GoogleGenAI to prevent crash if apiKey is missing at load time
let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAI) {
    // In Vite, process.env.GEMINI_API_KEY is replaced by define during build
    // or provided by the environment in some cases.
    const apiKey = process.env.GEMINI_API_KEY;

    // Final check for key validity - handle missing, empty, or placeholder keys
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'YOUR_GEMINI_API_KEY' || apiKey === 'undefined') {
      console.warn("Gemini API Key is missing or using a placeholder.");
      throw new Error("GEMINI_API_KEY_MISSING");
    }
    
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

export async function generateAIScope(prompt: string): Promise<string> {
  const ai = getGenAI();
  // Using gemini-3-flash-preview as the default stable model
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });
  
  return response.text || "Failed to generate scope.";
}

export async function analyzeQuoteDocument(fileData: string, mimeType: string): Promise<{ supplierName: string, items: Partial<QuoteItem>[], totalAmount: number }> {
  try {
    const ai = getGenAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            data: fileData,
            mimeType: mimeType,
          },
        },
        {
          text: "Extract the supplier name, line items (name, quantity, unit, unit price, and total price), and the grand total from this quote document. Return the data in a structured JSON format.",
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            supplierName: { type: Type.STRING },
            totalAmount: { type: Type.NUMBER },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  materialName: { type: Type.STRING },
                  qty: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  unitPrice: { type: Type.NUMBER },
                  totalPrice: { type: Type.NUMBER },
                },
                required: ["materialName", "qty", "unitPrice"],
              },
            },
          },
          required: ["supplierName", "items", "totalAmount"],
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    if (error instanceof Error && error.message === "GEMINI_API_KEY_MISSING") {
      throw error;
    }
    console.error("Error analyzing quote:", error);
    throw new Error("Failed to analyze quote document. Please ensure it is a clear image or PDF.");
  }
}
