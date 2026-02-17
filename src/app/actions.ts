'use server'

import { extractFinancialData } from "@/lib/gemini";
import { ExtractionResultSchema } from "@/lib/schema";

export async function processFinancialStatement(images: string[]) {
    try {
        if (!images || images.length === 0) {
            return { success: false, error: "No images provided." };
        }

        // Limit: Process max 5 pages to avoid payload/timeout issues on free tier
        const limitedImages = images.slice(0, 5);

        console.log(`Processing ${limitedImages.length} images with Gemini Vision...`);

        const data = await extractFinancialData(limitedImages);

        // Validate with Zod
        const validation = ExtractionResultSchema.safeParse(data);

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
