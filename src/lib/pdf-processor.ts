
// Use dynamic import to avoid SSR issues with canvas dependency

export interface TextItem {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
}

/**
 * Converts a PDF file into an array of Base64-encoded JPEG images.
 */
export async function convertPdfToImages(file: File): Promise<string[]> {
    const pdfjsLib = await import('pdfjs-dist');
    // @ts-ignore
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const images: string[] = [];
    const totalPages = Math.min(pdf.numPages, 5);

    for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (!context) continue;
        await page.render({ canvasContext: context, viewport }).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    }
    return images;
}

/**
 * Extracts text items with coordinates for layout analysis.
 */
export async function extractTextWithCoordinates(file: File): Promise<TextItem[]> {
    const pdfjsLib = await import('pdfjs-dist');
    // @ts-ignore
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = Math.min(pdf.numPages, 5);

    const allItems: TextItem[] = [];

    for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        textContent.items.forEach((item: any) => {
            if (item.str.trim().length > 0) {
                allItems.push({
                    str: item.str,
                    x: item.transform[4],
                    y: item.transform[5],
                    width: item.width,
                    height: item.height,
                    page: i
                });
            }
        });
    }

    return allItems;
}
