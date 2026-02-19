import { GoogleGenerativeAI } from "@google/generative-ai";
// Import schemas and normalization
import { RawExtractionSchema, CleanExtractionSchema } from "./schema";
import { normalizeRecords } from "./normalization";

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
        model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
        generationConfig: {
            temperature: 0, // Deterministic output
        }
    });

    const prompt = `
You are a financial data extraction engine.

STRICT RULES:
- Extract ONLY data that is clearly visible in the image.
- DO NOT guess or infer.
- If no table exists → return empty records.

Each record MUST include:
- lineItem
- year (as seen in image)
- value (as seen)
- sourceSnippet (exact text)

If no data is found:

{
  "records": [],
  "yearsDetected": [],
  "notes": "No financial table found"
}
`;

    // Prepare image parts for the API
    const imageParts = base64Images.map((base64) => ({
        inlineData: {
            data: base64,
            mimeType: "image/jpeg",
        },
    }));

    try {
        const promptConfig = [prompt, ...imageParts];

        console.log("Sending prompt to Gemini...");
        const result = await model.generateContent(promptConfig);
        const response = await result.response;
        let text = response.text();

        // Clean markdown code blocks if present
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        console.log("----------------------------------------");
        console.log("Gemini Raw Response:", text);
        console.log("----------------------------------------");

        const raw = JSON.parse(text);

        // Step 1: Validate raw (loose)
        const rawParsed = RawExtractionSchema.safeParse(raw);
        if (!rawParsed.success) {
            console.error("Raw Validation Error:", rawParsed.error);
            throw new Error("Raw extraction failed: Output did not match basic structure.");
        }

        // Step 2: Normalize
        const normalized = normalizeRecords(rawParsed.data);

        // Step 3: Validate clean (strict)
        const cleanParsed = CleanExtractionSchema.safeParse(normalized);

        if (!cleanParsed.success) {
            console.error("Clean Validation Error:", cleanParsed.error);
            throw new Error("Clean validation failed: Normalized data does not meet strict schema.");
        }

        return cleanParsed.data;

    } catch (error: any) {
        console.error("Gemini API Error:", error);
        throw new Error(`Failed to extract data: ${error.message}`);
    }
}
