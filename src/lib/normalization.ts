
import { RawRecordSchema, CleanExtractionSchema } from "./schema";
import { z } from "zod";

// Normalize YEAR: "FY25" -> "2025", "31/12/2024" -> "2024"
function normalizeYear(input: string): string | null {
    if (!input) return null;

    // 31/12/2025 → 2025
    const dateMatch = input.match(/\b(20\d{2})\b/);
    if (dateMatch) return dateMatch[1];

    // FY25 → 2025
    const fyMatch = input.match(/FY\s?(\d{2,4})/i);
    if (fyMatch) {
        let year = fyMatch[1];
        if (year.length === 2) year = "20" + year;
        return year;
    }

    return null;
}

// Normalize VALUE: "$1,234.00" -> 1234.00, "(500)" -> -500
function normalizeNumber(val: any): number | null {
    if (val === null || val === undefined) return null;

    if (typeof val === "number") return val;

    if (typeof val === "string") {
        const cleaned = val
            .replace(/,/g, "")
            .replace(/\((.*?)\)/, "-$1")
            .trim();

        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    return null;
}

// Normalize CATEGORY: "Total Revenue" -> "Revenue"
function normalizeCategory(lineItem: string): string {
    const item = lineItem.toLowerCase();

    if (item.includes("revenue") || item.includes("income"))
        return "Revenue";

    if (
        item.includes("expense") ||
        item.includes("cost") ||
        item.includes("depreciation")
    )
        return "Expenses";

    if (item.includes("profit") || item.includes("loss"))
        return "Profit";

    return "Other";
}

// Main Normalization Function
export function normalizeRecords(raw: any) {
    const cleanRecords = [];

    // Safety check for raw records array
    const records = Array.isArray(raw.records) ? raw.records : [];

    for (const r of records) {
        const year = normalizeYear(r.year);
        const value = normalizeNumber(r.value);

        if (!year) continue; // drop invalid year
        if (value === null) continue; // drop invalid value logic
        if (!r.sourceSnippet) continue; // enforce evidence

        cleanRecords.push({
            category: r.category || normalizeCategory(r.lineItem),
            subCategory: r.subCategory || null,
            lineItem: r.lineItem,
            year,
            value,
            unit: r.unit || "Crores", // Default unit if missing
            confidence: ["High", "Medium", "Low"].includes(r.confidence || "")
                ? r.confidence
                : "Medium",
            sourceSnippet: r.sourceSnippet,
        });
    }

    // Deduplicate years
    const uniqueYears = Array.from(new Set(cleanRecords.map(r => r.year))).sort();

    return {
        records: cleanRecords,
        yearsDetected: uniqueYears,
        notes: raw.notes || "",
    };
}
