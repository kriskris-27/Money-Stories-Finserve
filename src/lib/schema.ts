import { z } from "zod";

// 1. Raw Schema (LLM Output - Loose)
export const RawRecordSchema = z.object({
    category: z.string().optional(),
    subCategory: z.string().nullable().optional(),
    lineItem: z.string(),
    year: z.string(),   // allow anything initially
    value: z.any(),     // allow string/number
    unit: z.string().nullable().optional(),
    confidence: z.string().optional(),
    sourceSnippet: z.string().optional(),
});

export const RawExtractionSchema = z.object({
    records: z.array(RawRecordSchema),
    yearsDetected: z.array(z.string()).optional(),
    notes: z.string().optional(),
});

// 2. Clean Schema (DB Ready - Strict)
export const CleanRecordSchema = z.object({
    category: z.string(),
    subCategory: z.string().nullable(),
    lineItem: z.string(),
    year: z.string().regex(/^\d{4}$/),  // ONLY normalized year (YYYY)
    value: z.number().nullable(),
    unit: z.string().nullable(),
    confidence: z.enum(["High", "Medium", "Low"]),
    sourceSnippet: z.string(),
});

export const CleanExtractionSchema = z.object({
    records: z.array(CleanRecordSchema),
    yearsDetected: z.array(z.string()),
    notes: z.string().optional(),
});

export type RawRecord = z.infer<typeof RawRecordSchema>;
export type RawExtraction = z.infer<typeof RawExtractionSchema>;
export type CleanRecord = z.infer<typeof CleanRecordSchema>;
export type CleanExtraction = z.infer<typeof CleanExtractionSchema>;

// --- 3. Multi-Stage Pipeline Schemas ---

// Stage 1: Detection (Gatekeeper)
export const TableDetectionSchema = z.object({
    hasTable: z.boolean(),
    tableType: z.enum(["income_statement", "balance_sheet", "cash_flow", "other", "unknown"]),
    confidence: z.enum(["high", "medium", "low"])
});

// Stage 2: Structure (Raw Matrix)
export const TableStructureSchema = z.object({
    columns: z.array(z.object({
        index: z.number(),
        label: z.string().optional(),
        date: z.string().optional()
    })),
    rows: z.array(z.object({
        index: z.number(),
        lineItem: z.string(),
        values: z.array(z.string()) // Exact strings from image
    })),
    notes: z.string().optional()
});

// Stage 3: Classification (Semantics)
export const TableClassificationSchema = z.object({
    columns: z.array(z.object({
        index: z.number(),
        type: z.enum(["quarter", "nine_months", "year", "unknown"]),
        year: z.string().optional() // Normalized YYYY
    })),
    rows: z.array(z.object({
        index: z.number(),
        category: z.enum(["Revenue", "Expenses", "Profit", "Other"]),
        normalizedName: z.string().optional()
    }))
});
