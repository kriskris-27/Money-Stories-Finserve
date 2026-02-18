// Use dynamic import to avoid SSR issues with canvas dependency
export async function convertPdfToImages(file: File): Promise<string[]> {
    const pdfjsLib = await import('pdfjs-dist');

    // Use CDN worker for maximum portability in Next.js
    // @ts-ignore - workerSrc property exists on GlobalWorkerOptions
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    const arrayBuffer = await file.arrayBuffer();

    let pdf;
    try {
        pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch (error: any) {
        if (error.name === 'PasswordException') {
            throw new Error("This PDF is password protected. Please unlock it and try again.");
        }
        throw new Error("Failed to load PDF. The file might be corrupted.");
    }

    const images: string[] = [];
    const totalPages = Math.min(pdf.numPages, 5); // Limit to first 5 pages for MVP

    for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // High resolution for OCR

        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (!context) continue;

        const renderContext: any = {
            canvasContext: context,
            viewport: viewport,
        };

        await page.render(renderContext).promise;

        // Convert to JPEG base64 (0.8 quality handles text well but smaller size)
        const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        images.push(base64);
    }

    return images;
}
