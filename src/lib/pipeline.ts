
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
    TableDetectionSchema,
    TableStructureSchema,
    TableClassificationSchema,
    CleanExtractionSchema
} from "./schema";
import { normalizeRecords } from "./normalization";

// Initialize Gemini
const getGenAI = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    return new GoogleGenerativeAI(key);
};

// Helper for LLM calls with retry
async function callGemini(model: any, prompt: string, imageParts: any[], schema: any, stageName: string) {
    const MAX_RETRIES = 2;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[${stageName}] Attempt ${attempt}...`);
            const result = await model.generateContent([prompt, ...imageParts]);
            const response = await result.response;
            let text = response.text();

            // Clean markdown
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            // Parse & Validate
            const json = JSON.parse(text);
            const parsed = schema.safeParse(json);

            if (!parsed.success) {
                console.warn(`[${stageName}] Schema Validation Failed:`, parsed.error);
                throw new Error(`Invalid JSON structure for ${stageName}`);
            }

            return parsed.data;
        } catch (error: any) {
            console.warn(`[${stageName}] Error (Attempt ${attempt}):`, error.message);
            if (attempt === MAX_RETRIES) throw error;
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
}

// --- PROMPTS ---

const DETECT_PROMPT = `
You are a strict document classifier.
Check if the image contains a financial statement table (Income Statement / P&L).

A valid table MUST have:
- Column headers (Year/Quarter)
- Row labels (Revenue/Expenses)
- Numeric values

Return JSON:
{
  "hasTable": boolean,
  "tableType": "income_statement" | "balance_sheet" | "other" | "unknown",
  "confidence": "high" | "medium" | "low"
}
`;

const EXTRACT_PROMPT = `
You are a data extraction engine.
Extract the table structure precisely.

CRITICAL RULES:
- Extract strict Rows and Columns.
- values array length MUST match columns length.
- Preserve exact text for values (e.g. "1,234", "(50)").
- Do NOT infer missing numbers.

Return JSON:
{
  "columns": [{ "index": number, "label": string }],
  "rows": [{ "index": number, "lineItem": string, "values": string[] }]
}
`;

const CLASSIFY_PROMPT = `
You are a financial analyst.
Classify the structure provided in the image context.

1. Columns: Identify if they are Years (FY24), Quarters (Q1), or specific dates. Normalize year to "YYYY".
2. Rows: Categorize into Revenue, Expenses, Profit, or Other.

Return JSON:
{
  "columns": [{ "index": number, "type": "year" | "quarter", "year": "YYYY" }],
  "rows": [{ "index": number, "category": "Revenue" | "Expenses" | "Profit" | "Other" }]
}
`;

// --- MAIN PIPELINE ---

export async function runExtractionPipeline(base64Images: string[]) {
    const model = getGenAI().getGenerativeModel({
        model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
        generationConfig: { temperature: 0 }
    });

    const imageParts = base64Images.map(b64 => ({
        inlineData: { data: b64, mimeType: "image/jpeg" }
    }));

    // STEP 1: DETECT
    const detection = await callGemini(model, DETECT_PROMPT, imageParts, TableDetectionSchema, "DETECTION");

    if (!detection.hasTable || detection.confidence === "low") {
        console.log("Pipeline stopped: No table detected.");
        return { records: [], yearsDetected: [], notes: "No financial table detected." };
    }

    // STEP 2: EXTRACT STRUCTURE
    const structure = await callGemini(model, EXTRACT_PROMPT, imageParts, TableStructureSchema, "EXTRACTION");

    // Basic Validation: Check dimensions
    if (structure.rows.some((r: any) => r.values.length !== structure.columns.length)) {
        console.warn("Structure Mismatch: Row values count != Column count. Attempting best effort merge.");
    }

    // STEP 3: CLASSIFY SEMANTICS
    const classification = await callGemini(model, CLASSIFY_PROMPT, imageParts, TableClassificationSchema, "CLASSIFICATION");

    // STEP 4: DETERMINISTIC MERGE
    // We merge the exact Strings from Step 2 with the Semantic Tags from Step 3
    const rawRecords = [];

    for (const row of structure.rows) {
        // Find semantic tag for this row
        const rowClass = classification.rows.find((r: any) => r.index === row.index);
        const category = rowClass?.category || "Other";

        row.values.forEach((value: string, colIndex: number) => {
            // Find semantic tag for this column
            const colClass = classification.columns.find((c: any) => c.index === colIndex);

            // We only care about Year columns for now
            if (colClass && colClass.type === "year" && colClass.year) {
                rawRecords.push({
                    category: category,
                    lineItem: row.lineItem,
                    year: colClass.year, // The normalized year from valid classification
                    value: value,        // The exact string from extraction
                    sourceSnippet: `${row.lineItem}: ${value}`, // Evidence
                    confidence: "High"
                });
            }
        });
    }

    // Step 5: Normalize & Final Clean
    // reusing our robust normalization logic
    const normalized = normalizeRecords({ records: rawRecords });

    // Final Safe Parse
    const final = CleanExtractionSchema.parse(normalized);

    return final;
}
