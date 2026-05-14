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
          text: "Extract the supplier name, line items (name, quantity, unit, unit price, and total price), and the grand total from this quote document. Return the data in a structured JSON format.\n\n" +
                "IMPORTANT: Normalize the supplier name. Use common/standard names (e.g., if it says 'Forney Fence Supply' or 'Forney Fence Co', just return 'Forney Fence').",
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

export async function analyzeReceiptDocument(fileData: string, mimeType: string): Promise<{ merchantName: string, date: string, amount: number, category: string, description: string }> {
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
          text: "You are an expert financial analyst. Analyze this receipt or invoice with high precision. \n" +
                "Extract the following:\n" +
                "1. Merchant/Supplier Name.\n" +
                "2. The exact Date of the transaction (use ISO format YYYY-MM-DD).\n" +
                "3. The Grand Total Amount (as a number).\n" +
                "4. Categorize the expense as 'Material', 'Labor', or 'Other' based on the line items.\n" +
                "5. Provide a concise but detailed description summarizing the items purchased.\n\n" +
                "Return the data in a structured JSON format.",
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchantName: { type: Type.STRING },
            date: { type: Type.STRING, description: "ISO 8601 format if possible" },
            amount: { type: Type.NUMBER },
            category: { 
              type: Type.STRING, 
              enum: ["Material", "Labor", "Other"],
              description: "Categorize as Material, Labor, or Other based on the items"
            },
            description: { type: Type.STRING },
          },
          required: ["merchantName", "amount", "category", "description"],
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    if (error instanceof Error && error.message === "GEMINI_API_KEY_MISSING") {
      throw error;
    }
    console.error("Error analyzing receipt:", error);
    throw new Error("Failed to analyze receipt. Please ensure it is a clear image or PDF.");
  }
}

export async function analyzeBlueprintDocument(fileData: string, mimeType: string): Promise<{ 
  runs: { 
    name: string; 
    linearFeet: number; 
    description?: string;
    gates?: { type: 'Single' | 'Double'; width: number; description: string; positionPercent: number }[];
    isStartOfNewSection?: boolean;
    orientation?: 'North' | 'South' | 'East' | 'West' | 'Northeast' | 'Northwest' | 'Southeast' | 'Southwest';
    startPoint?: { x: number; y: number };
    endPoint?: { x: number; y: number };
  }[] 
}> {
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
          text: "You are an expert fence estimator. Analyze this satellite blueprint or hand-drawn diagram.\n" +
                "1. Identify all fence runs (marked in red lines) and their labeled measurements (e.g. 206'-0\").\n" +
                "2. Identify all gates (marked in green). IMPORTANT: If a green gate line is overlaying or positioned within a red fence run line, do NOT create a separate run for it. Instead, include it as a 'gate' property within that fence run.\n" +
                "3. COORDINATE MAPPING: For every fence line (red line), identify its start point and end point coordinates on a normalized scale of 0 to 1000 (where 0,0 is Top-Left and 1000,1000 is Bottom-Right of the image).\n" +
                "4. SEQUENCING: Return the runs in a logical clockwise order. Ensure that if two runs are connected at a corner, the 'endPoint' of the first run matches the 'startPoint' of the second run.\n" +
                "5. DISCONTINUITY: Set 'isStartOfNewSection' to true ONLY if there is a significant physical gap between the current run's startPoint and the previous run's endPoint.\n" +
                "6. MEASUREMENTS: Convert all measurements to decimal feet (e.g. 206'-6\" = 206.5). Accuracy is paramount.\n" +
                "7. LABELS: Use text labels in the image (e.g. 'North Perimeter', '131-0\"') to identify the name and length of each run.\n\n" +
                "Return the data as a list of runs in a structured JSON format.",
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            runs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "e.g. North Perimeter, Front Driveway Section" },
                  linearFeet: { type: Type.NUMBER, description: "Total length of the red line section in feet" },
                  description: { type: Type.STRING, description: "Additional details from callouts" },
                  orientation: { 
                    type: Type.STRING, 
                    enum: ["North", "South", "East", "West", "Northeast", "Northwest", "Southeast", "Southwest"] 
                  },
                  isStartOfNewSection: { type: Type.BOOLEAN, description: "True if this run starts a new non-contiguous fence segment" },
                  startPoint: {
                    type: Type.OBJECT,
                    properties: {
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER }
                    }
                  },
                  endPoint: {
                    type: Type.OBJECT,
                    properties: {
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER }
                    }
                  },
                  gates: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        type: { type: Type.STRING, enum: ["Single", "Double"] },
                        width: { type: Type.NUMBER },
                        positionPercent: { type: Type.NUMBER, description: "Position along the run from start to end (0.0 to 1.0)" },
                        description: { type: Type.STRING }
                      },
                      required: ["type", "width", "positionPercent"]
                    }
                  }
                },
                required: ["name", "linearFeet"],
              },
            },
          },
          required: ["runs"],
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    if (error instanceof Error && error.message === "GEMINI_API_KEY_MISSING") {
      throw error;
    }
    console.error("Error analyzing blueprint:", error);
    throw new Error("Failed to analyze diagram. Please ensure it is a clear image or PDF with legible measurements.");
  }
}
