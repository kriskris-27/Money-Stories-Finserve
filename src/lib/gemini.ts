import { GoogleGenerativeAI } from "@google/generative-ai";
import { ExtractionResultSchema } from "@/lib/schema";

// Initialize lazily to avoid crash if key is missing at build time
const getGenAI = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set in environment variables");
    return new GoogleGenerativeAI(key);
};

export async function extractFinancialData(base64Images: string[]) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set");
    }

    const model = getGenAI().getGenerativeModel({
        model: process.env.GEMINI_MODEL || "gemini-1.5-flash-latest",
        // Set response to JSON mode for structured output
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
  You are an expert financial analyst. Your job is to extract the 'Income Statement' or 'Statement of Profit and Loss' from these images.
  
  **Instructions:**
  1. Identify the table headers to find all Fiscal Years (e.g., FY25, FY24, 2024, 2023).
  2. For every years column found, extract the value for each line item row.
  3. Structure the output strictly according to this JSON schema:
     - records: Array of objects with { category: string, subCategory: string, lineItem: string, year: string, value: number, unit: string, confidence: "High" | "Medium" | "Low" }
     - yearsDetected: Array of strings finding all unique years (e.g., ["FY25", "FY24"])
  
  **Rules:**
  - If a value is missing or '-', represent it as null or omit.
  - Normalize numbers: If the header says "in Crores" and value is "5.5", keep it as 5.5 but set unit="Crores".
  - If the image is blurry, set confidence="Low".
  - Do NOT hallucinate data. If you can't read it, skip it.
  - Group items logically under 'Revenue', 'Expenses', 'Profit', etc.
  `;

    // Prepare image parts for the API
    const imageParts = base64Images.map((base64) => ({
        inlineData: {
            data: base64,
            mimeType: "image/jpeg",
        },
    }));

    try {
        // Helper for retry logic
        const MAX_RETRIES = 3;
        let lastError;

        const promptConfig = [prompt, ...imageParts];

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`Sending prompt to Gemini (Attempt ${attempt}/${MAX_RETRIES})...`);
                const result = await model.generateContent(promptConfig);
                const response = await result.response;
                const text = response.text();

                // Parse JSON to validate against our Zod schema
                console.log("----------------------------------------");
                console.log("Gemini Raw Response:", text);
                console.log("----------------------------------------");

                const json = JSON.parse(text);
                return json; // Success!

            } catch (error: any) {
                console.warn(`Gemini API Error (Attempt ${attempt}):`, error.message);
                lastError = error;
                // Simple exponential backoff: 1s, 2s, 4s...
                if (attempt < MAX_RETRIES) {
                    const delay = 1000 * Math.pow(2, attempt - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError || new Error("Failed to extract data from Gemini after retries.");
    } catch (error) {
        console.error("Gemini API Error (Final):", error);
        throw new Error("Failed to extract data from Gemini.");
    }
}
