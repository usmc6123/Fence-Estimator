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
      model: "gemini-1.5-flash",
      contents: [
        {
          inlineData: {
            data: fileData,
            mimeType: mimeType,
          },
        },
        {
          text: "You are an expert fence estimator. Analyze this satellite diagram or blueprint with extreme precision.\n\n" +
                "VISUAL KEYS:\n" +
                "- RED LINES: These represent the physical fence runs. Identify every segment.\n" +
                "- PINK TEXT & PINK ARROWS: These are length measurements (e.g., 226'-0\", 131'-0\"). Match each pink measurement to the red line it describes.\n" +
                "- GREEN LINES/ARROWS: These represent gates (e.g., '4' gate', '10ft Gate').\n\n" +
                "RULES:\n" +
                "1. Extract each red line segment as a 'run'.\n" +
                "2. Convert measurements to decimal feet (e.g., 226'-0\" = 226, 131'-6\" = 131.5).\n" +
                "3. If multiple segments are connected at corners, list them in sequence (e.g., clockwise).\n" +
                "4. If a gate is located on a fence run, include it in the 'gates' array for that run. Estimate 'positionPercent' (0.0 to 1.0) along the run.\n" +
                "5. Assign a name to each run based on its location (e.g., 'North Perimeter', 'East Interior').\n" +
                "6. Determine compass orientation if possible.\n\n" +
                "Return the results in valid JSON format.",
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
                  name: { type: Type.STRING },
                  linearFeet: { type: Type.NUMBER },
                  description: { type: Type.STRING },
                  orientation: { 
                    type: Type.STRING, 
                    enum: ["North", "South", "East", "West", "Northeast", "Northwest", "Southeast", "Southwest"] 
                  },
                  isStartOfNewSection: { type: Type.BOOLEAN },
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
                        positionPercent: { type: Type.NUMBER },
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

    if (!response.text) {
      throw new Error("No response text from AI");
    }

    return JSON.parse(response.text);
  } catch (error) {
    if (error instanceof Error && error.message === "GEMINI_API_KEY_MISSING") {
      throw error;
    }
    console.error("Error analyzing blueprint:", error);
    // Include the actual error message in the console for the user/me to see in the logs if they could
    throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please ensure the image is clear.`);
  }
}
