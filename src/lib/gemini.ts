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
        model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
        generationConfig: {
            temperature: 0, // Deterministic output
        }
    });

    const prompt = `
You are a strict financial data extraction engine.

Your ONLY job is to extract financial data that is EXPLICITLY visible in the provided images.

-------------------------
CRITICAL RULES (HARD CONSTRAINTS)
-------------------------

1. DO NOT GUESS OR INFER ANY VALUES.
2. DO NOT GENERATE SAMPLE OR TYPICAL FINANCIAL DATA.
3. IF NO INCOME STATEMENT TABLE IS PRESENT, RETURN EMPTY RESULT.
4. EVERY VALUE MUST HAVE VERIFIABLE EVIDENCE FROM THE IMAGE.
5. IF YOU CANNOT SEE THE EXACT NUMBER, DO NOT INCLUDE IT.
6. NEVER FILL MISSING DATA.
7. NEVER "COMPLETE" A STATEMENT.

-------------------------
VALID EXTRACTION CONDITIONS
-------------------------

Only extract data IF:
- A clear table exists
- Rows like "Revenue", "Expenses", "Profit", "EPS" are visible
- Numerical columns are clearly readable

If these are NOT present → RETURN EMPTY OUTPUT.

-------------------------
OUTPUT FORMAT (STRICT JSON)
-------------------------

If data is found:

{
  "records": [
    {
      "category": "Revenue | Expenses | Profit | Other",
      "subCategory": string | null,
      "lineItem": string,
      "year": string,
      "value": number,
      "unit": string,
      "confidence": "High" | "Medium" | "Low",
      "sourceSnippet": string
    }
  ],
  "yearsDetected": string[],
  "notes": "Extracted from visible table"
}

-------------------------
IF NO DATA FOUND (IMPORTANT)
-------------------------

If the images DO NOT contain an income statement table:

Return EXACTLY:

{
  "records": [],
  "yearsDetected": [],
  "notes": "No income statement or financial table found in the document"
}

-------------------------
EVIDENCE REQUIREMENT
-------------------------

For EVERY record:
- Include "sourceSnippet" containing the EXACT text seen in the image
- If you cannot provide sourceSnippet → DO NOT include that record

-------------------------
FINAL CHECK BEFORE RESPONSE
-------------------------

Ask yourself:
"Did I actually SEE these numbers in the image?"

If NOT → return empty result.
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
                let text = response.text();

                // Clean markdown code blocks if present (since we removed JSON mode)
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();

                console.log("----------------------------------------");
                console.log("Gemini Raw Response:", text);
                console.log("----------------------------------------");

                const json = JSON.parse(text);

                // HARD VALIDATION LAYER

                // 1. Evidence Check
                if (json.records?.length > 0 && json.records.some((r: any) => !r.sourceSnippet)) {
                    console.warn("Hallucination check failed: Record missing sourceSnippet");
                    // We could throw here, or filter out bad records. For now, strict reject.
                    throw new Error("Hallucination detected: AI failed to provide evidence for extracted data.");
                }

                // 2. Keyword Check (Basic sanity)
                const hasKeywords = json.records?.some((r: any) =>
                    /revenue|expense|profit|income|cost|tax|result|loss/i.test(r.lineItem || "") ||
                    /revenue|expense|profit|income|cost|tax|result|loss/i.test(r.category || "")
                );

                if (json.records?.length > 0 && !hasKeywords) {
                    console.warn("Hallucination check failed: No financial keywords found in records");
                    throw new Error("Invalid extraction: Data detected but lacks financial context (Revenue/Profit/Cost).");
                }

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
