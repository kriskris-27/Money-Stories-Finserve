# Financial Statement Extractor (AI Research Tool)

This project is an **AI-powered Research Tool** designed to extract structured financials (Income Statements) from unstructured PDF documents, including scanned files.

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

### Why Next.js Server Actions?
We use Server Actions to securely handle the API key and AI processing on the backend, keeping the client lightweight and type-safe.

## License
MIT
