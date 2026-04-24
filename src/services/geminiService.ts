import { GoogleGenAI, Type } from "@google/genai";
import { QuoteItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeQuoteDocument(fileData: string, mimeType: string): Promise<{ supplierName: string, items: Partial<QuoteItem>[], totalAmount: number }> {
  try {
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
    console.error("Error analyzing quote:", error);
    throw new Error("Failed to analyze quote document. Please ensure it is a clear image or PDF.");
  }
}
