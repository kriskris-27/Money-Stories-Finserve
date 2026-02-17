import { z } from "zod";

// --- 1. The Atomic Unit: A Single Financial Record ---
// This represents one cell in the Excel sheet, but with context.
export const FinancialRecordSchema = z.object({
    category: z.string().describe("Top-level grouping, e.g., 'Revenue', 'Expenses', 'Assets'"),
    subCategory: z.string().optional().describe("Second-level grouping if exists, e.g., 'Cost of Materials'"),
    lineItem: z.string().describe("The specific row label, e.g., 'Power and Fuel'"),
    year: z.string().regex(/^(FY\s?\d{2,4}|\d{4})$/i).describe("Fiscal Year, e.g., 'FY24', '2024'"),
    value: z.number().describe("The numerical value. Normalize to base units if possible, or keep as displayed."),
    unit: z.string().optional().describe("Currency or unit, e.g., 'INR', 'USD', 'Crores'"),
    confidence: z.enum(["High", "Medium", "Low"]).describe("Confidence in the extraction of this specific value"),
    sourceSnippet: z.string().optional().describe("The text snippet or context where this number was found")
});

// --- 2. The API Response Structure ---
// The AI returns an array of these records.
export const ExtractionResultSchema = z.object({
    records: z.array(FinancialRecordSchema),
    currencyDetected: z.string().optional(),
    yearsDetected: z.array(z.string()),
    notes: z.string().optional()
});

export type FinancialRecord = z.infer<typeof FinancialRecordSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
