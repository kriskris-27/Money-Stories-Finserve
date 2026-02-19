
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
    TableDetectionSchema,
    TableClassificationSchema,
    CleanExtractionSchema,
    RawRecord
} from "./schema";
import { normalizeRecords } from "./normalization";
import { layoutEngine, GridRow } from "./layout-engine";

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

// --- MAIN PIPELINE ---

export async function runExtractionPipeline(base64Images: string[], textData: any[]) {
    const model = getGenAI().getGenerativeModel({
        model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
        generationConfig: { temperature: 0 }
    });

    const imageParts = base64Images.map(b64 => ({
        inlineData: { data: b64, mimeType: "image/jpeg" }
    }));

    // STEP 1: DETECT (Vision is best for "Is there a table?")
    const detection = await callGemini(model, DETECT_PROMPT, imageParts, TableDetectionSchema, "DETECTION");

    if (!detection.hasTable || detection.confidence === "low") {
        console.log("Pipeline stopped: No table detected.");
        return { records: [], yearsDetected: [], notes: "No financial table detected." };
    }

    // STEP 2: EXTRACT STRUCTURE (DETERMINISTIC LAYOUT ENGINE)
    console.log("Building Deterministic Grid from Text Layout...");

    // CRITICAL FIX: Filter textData to only the first page (Page 1) to avoid massive context
    // In future this should be smarter
    const page1Text = textData.filter(t => t.page === 1);

    if (page1Text.length === 0) {
        console.warn("No text found on Page 1. Layout engine might fail.");
    }

    // layoutEngine.buildGrid returns rows with cells assigned to 'colIndex'
    const { rows: gridRows, headers: gridColumns } = layoutEngine.buildGrid(page1Text);

    // Create a DENSE visual representation for the LLM
    // We map every row to an array of size [totalColumns], filling empty spots.
    const totalColumns = gridColumns.length;

    const gridRepresentation = gridRows.map((r, i) => {
        // Create dense row
        const denseRow = new Array(totalColumns).fill("");
        r.cells.forEach(cell => {
            if (cell.colIndex !== undefined && cell.colIndex >= 0 && cell.colIndex < totalColumns) {
                denseRow[cell.colIndex] = cell.text;
            }
        });
        return `Row ${i}: | ${denseRow.join(" | ")} |`;
    }).join("\n");

    const GRID_CONTEXT_PROMPT = `
    Here is the EXACT TEXT STRUCTURE extracted from the document coordinates:
    (Empty cells are shown as empty space between pipes)
    ${gridRepresentation}
    
    Based on this structure (and the visual context from images):
    `;

    // STEP 3: CLASSIFY SEMANTICS (Using the Grid Context + Vision)
    // We update the prompt to reference the grid indices
    const CLASSIFY_WITH_GRID_PROMPT = `
    You are a financial analyst.
    I have extracted the text structure into rows (indexed 0 to N).
    
    ${GRID_CONTEXT_PROMPT}

    YOUR JOB:
    1. Identify which Columns (by index 0 to ${totalColumns - 1}) are Years.
    2. Identify which Rows (by index 0..N) are "Revenue", "Expenses", "Profit".

    Return JSON:
    {
      "columns": [{ "index": number, "type": "year" | "quarter", "year": "YYYY" }],
      "rows": [{ "index": number, "category": "Revenue" | "Expenses" | "Profit" | "Other" }]
    }
    `;

    const classification = await callGemini(model, CLASSIFY_WITH_GRID_PROMPT, imageParts, TableClassificationSchema, "CLASSIFICATION");

    // STEP 4: DETERMINISTIC MERGE
    const rawRecords: RawRecord[] = [];

    for (const classRow of classification.rows) {
        const gridRow = gridRows[classRow.index];
        if (!gridRow) continue;

        // Get the Line Item Name (usually the first cell that is text)
        // Heuristic: First cell is label.
        const lineItem = gridRow.cells[0]?.text || "Unknown";

        // Iterate over the CLASSIFIED columns to find values in this row
        classification.columns.forEach((classCol: any) => {
            if (classCol.type === "year" && classCol.year) {
                // Find the cell in this row that matches the column index
                const cell = gridRow.cells.find(c => c.colIndex === classCol.index);
                const value = cell ? cell.text : null; // If no cell at this index, value is null/missing

                if (value) {
                    rawRecords.push({
                        category: classRow.category,
                        lineItem: lineItem,
                        year: classCol.year,
                        value: value, // EXACT text from PDF
                        sourceSnippet: `${lineItem}: ${value}`,
                        confidence: "High",
                        subCategory: null,
                        unit: null
                    });
                }
            }
        });
    }

    // Step 5: Normalize & Final Clean
    const normalized = normalizeRecords({ records: rawRecords });
    const final = CleanExtractionSchema.parse(normalized);

    return final;
}
