'use client';

import { useState } from 'react';
import { convertPdfToImages } from '@/lib/pdf-processor';
import { processFinancialStatement } from '@/app/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, Upload, Loader2, FileText, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import * as XLSX from 'xlsx';

export default function App() {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setProgress(10);
        setStatus('Reading PDF pages...');
        setError(null);
        setData(null);

        try {
            // 1. Convert PDF to Images
            const images = await convertPdfToImages(file);
            setProgress(40);
            setStatus(`Analyzing ${images.length} pages via Gemini Vision...`);

            // 2. Send to Server Action
            const result = await processFinancialStatement(images);

            if (result.success) {
                setProgress(100);
                setStatus('Analysis Complete!');
                setData(result.data);
            } else {
                throw new Error(result.error);
            }

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to process document.");
            setStatus('Error occurred.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadExcel = () => {
        if (!data || !data.records) return;

        // Transform logic: Pivot the data
        // Category | SubCat | Item | FY25 | FY24 | FY23...

        // 1. Found all unique years
        const uniqueYears = Array.from(new Set(data.records.flatMap((r: any) => r.values.map((v: any) => v.year)))).sort().reverse();

        // 2. Build rows
        const excelRows = data.records.map((r: any) => {
            const row: any = {
                Category: r.category,
                SubCategory: r.subCategory || '',
                Particulars: r.lineItem,
                Unit: r.unit || '',
                Confidence: r.confidence
            };

            uniqueYears.forEach((year: any) => {
                const valObj = r.values.find((v: any) => v.year === year);
                row[year] = valObj ? valObj.value : '';
            });

            return row;
        });

        const ws = XLSX.utils.json_to_sheet(excelRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financials");
        XLSX.writeFile(wb, "Extracted_Financials.xlsx");
    };

    return (
        <div className="container mx-auto p-8 max-w-4xl space-y-8">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Financial Statement Extractor (Vision)</h1>
                <p className="text-muted-foreground">Upload any Annual Report (PDF) - Scanned or Digital</p>
            </div>

            <Card>
                <CardContent className="p-10 flex flex-col items-center justify-center border-2 border-dashed rounded-lg hover:bg-slate-50 transition-colors cursor-pointer relative">
                    <input
                        type="file"
                        accept="application/pdf"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleUpload}
                        disabled={loading}
                    />
                    <div className="flex flex-col items-center space-y-4 text-center">
                        <div className="p-4 bg-primary/10 rounded-full">
                            {loading ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-semibold text-lg">{loading ? 'Processing...' : 'Upload Financial Statement'}</h3>
                            <p className="text-sm text-muted-foreground">Drag & drop or click to browse</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {status && (
                <Card>
                    <CardContent className="p-6 space-y-4">
                        <div className="flex justify-between text-sm">
                            <span>{status}</span>
                            <span>{progress}%</span>
                        </div>
                        <Progress value={progress} />
                    </CardContent>
                </Card>
            )}

            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {data && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Extracted Data</CardTitle>
                        <Button onClick={handleDownloadExcel} className="gap-2">
                            <Download className="h-4 w-4" /> Export Excel
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border p-4 bg-slate-50 font-mono text-xs overflow-auto max-h-[500px]">
                            <pre>{JSON.stringify(data, null, 2)}</pre>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
