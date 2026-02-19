'use server'

import { runExtractionPipeline } from "@/lib/pipeline";
import { CleanExtractionSchema } from "@/lib/schema";

/**
 * Server Action to process financial document images using Gemini Vision.
 * 
 * Features:
 * 1. Validates input (max 5 images).
 * 2. Calls Google Gemini 1.5 Flash with a structured prompt.
 * 3. Enforces strict Zod schema validation on the output.
 * 
 * @param images - Array of base64 image strings.
 * @param textData - Array of text items with coordinates.
 * @returns ValidationResult - Success flag, data object, or error message.
 */
export async function processFinancialStatement(images: string[], textData: any[]) {
    try {
        if (!images || images.length === 0) {
            return { success: false, error: "No images provided." };
        }

        // Limit: Process max 5 pages to avoid payload/timeout issues on free tier
        const limitedImages = images.slice(0, 5);

        console.log(`Processing ${limitedImages.length} images with Gemini Vision...`);

        const data = await runExtractionPipeline(limitedImages, textData);

        // Validate with Zod
        const validation = CleanExtractionSchema.safeParse(data);

        if (!validation.success) {
            console.error("Zod Validation Error:", validation.error);
            return {
                success: false,
                error: "AI returned invalid structure.",
                raw: data // Return raw for debugging if needed
            };
        }

        return { success: true, data: validation.data };

    } catch (error: any) {
        console.error("Server Action Error:", error);
        return { success: false, error: error.message || "Unknown server error." };
    }
}
