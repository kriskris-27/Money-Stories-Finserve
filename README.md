# Financial Statement Extractor (AI Research Tool)

This project is an **AI-powered Research Tool** designed to extract structured financials (Income Statements) from unstructured PDF documents, including scanned files.

## System Design & Architecture
### 1. Privacy First (In-Memory Processing)
- **Zero-Persistence:** Files are processed entirely in RAM and never written to disk or S3.
- **Ephemeral:** Once the session ends, the data is gone. Perfect for sensitive financial documents.

### 2. Reliability Patterns
- **Retry with Backoff:** The Gemini client implements exponential backoff (1s -> 2s -> 4s) to handle API rate limits gracefully.
- **Circuit Breaking:** The UI prevents re-submission while processing to avoid thundering herd issues.
- **Type Safety:** Strict Zod validation ensures no "garbage" JSON ever reaches the UI layer.

### 3. Known Limitations (The "Real World" Gaps)
*Features required for a commercial V1:*
1.  **Async Queue (BullMQ/Redis):** Currently synchronous. For large files (50+ pages), we need background processing to prevent HTTP timeouts.
2.  **Auth & Rate Limiting:** No user accounts. We rely on basic client-side limits.
3.  **PDF Pre-processing:** No auto-rotation or "deskewing" for bad scans.
4.  **Database Layer:** Extracted data is not saved. Reloading the page loses the analysis.

built with **Next.js 16**, **Tailwind CSS**, **Gemini 1.5 Flash (Vision)**, and **PDF.js**.

## Features

-   **Multimodal Extraction**: Handles both digital and **scanned PDFs** by converting pages to images and using Computer Vision.
-   **Structured Output**: Extracts data into a strict schema (Particulars | FY25 | FY24...) using Zod validation.
-   **Matrix View**: Pivots the extracted data into a clean, multi-year comparison table.
-   **Excel Export**: One-click download of the analyzed data.
-   **Confidence Scoring**: Highlights low-confidence extractions for analyst review.

## Getting Started

1.  **Clone the repository**:
    ```bash
    git clone <repo-url>
    cd money
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    # If using legacy peer deps (optional):
    npm install --legacy-peer-deps
    ```

3.  **Set up Environment Variables**:
    Create a `.env.local` file in the root directory:
    ```env
    GEMINI_API_KEY=your_google_gemini_api_key
    ```
    *Get a free key from [Google AI Studio](https://aistudio.google.com/app/apikey)*.

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000).

## Technical Architecture (Assessment Notes)

### Why Gemini Vision?
Instead of traditional OCR + Regex (which fails on complex layouts), we use **Gemini 1.5 Flash**. By inputting the PDF page as an *image*, the model "sees" the table structure (columns, indentation) just like a human analyst, ensuring high accuracy even for scanned documents.

### Reliability Strategy
-   **Zod Schema**: We enforce a strict JSON structure. If the AI hallucinates a string where a number should be, the validation layer catches it.
-   **Client-Side Processing**: PDF rendering happens in the browser (`pdfjs-dist`), reducing server load and avoiding complex server-side image dependencies.
-   **Confidence Scores**: Every extracted row includes a confidence level ("High", "Medium", "Low") to guide manual review.

## Deployment

### Vercel (Recommended)
1.  Push your code to GitHub.
2.  Import the project in Vercel.
3.  Add the Environment Variables (`GEMINI_API_KEY`, `UPSTASH_REDIS_REST_URL`, etc.).
4.  Click **Deploy**.

## Security & Privacy
-   **In-Memory Processing:** Files are processed in RAM and never saved to disk.
-   **Rate Limiting:** IP-based limiting prevents abuse.
-   **Zod Validation:** Strict schema enforcement prevents data corruption.

## License
MIT
