'use client';
// Triggering rebuild after file restoration

import { useState } from 'react';
import { convertPdfToImages, extractTextWithCoordinates } from '@/lib/pdf-processor';
import { processFinancialStatement } from '@/app/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, Upload, Loader2, AlertTriangle, Key } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import * as XLSX from 'xlsx';

export default function App() {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [userKey, setUserKey] = useState('');
    const [pdfFile, setPdfFile] = useState<File | null>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setPdfFile(file);

        // Optional: Validation for API Key if env is missing (for reviewer)
        // For now we assume env is set or we proceed.

        setLoading(true);
        setProgress(10);
        setStatus('Reading PDF pages...');
        setError(null);
        setData(null);

        try {
            // 1. Convert PDF to Images & Extract Text Layout
            const imagesPromise = convertPdfToImages(file);
            const textDataPromise = extractTextWithCoordinates(file);

            const [images, textData] = await Promise.all([imagesPromise, textDataPromise]);

            setProgress(40);
            setStatus(`Analyzing ${images.length} pages via Hybrid Engine...`);

            // 2. Send to Server Action
            // Note: In real app, we might pass userKey if we wanted BYO-Key support
            const result = await processFinancialStatement(images, textData);

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

    const handleReset = () => {
        setData(null);
        setPdfFile(null);
        setStatus('');
        setProgress(0);
        setError(null);
        setLoading(false);
    };

    const handleDownloadExcel = () => {
        if (!data || !data.records) return;

        const { headers, rows } = getPivotedData();

        // Flatten for Excel
        const excelData = rows.map((r: any) => {
            const flat: any = {
                Particulars: r.lineItem,
                Category: r.category,
                SubCategory: r.subCategory || '',
                Unit: r.unit || '',
                Confidence: r.confidence
            };

            // Add years at the end
            headers.forEach((h: any) => flat[h] = r[h]);


            return flat;
        });

        const wb = XLSX.utils.book_new();

        // 1. Summary Sheet (Metadata)
        const summaryData = [
            { Key: "File Name", Value: pdfFile?.name || "Unknown" },
            { Key: "Extraction Date", Value: new Date().toLocaleDateString() },
            { Key: "AI Model", Value: "Gemini 1.5 Flash (Vision)" },
            { Key: "Confidence Score", Value: "Based on AI Analysis" }
        ];
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

        // 2. Data Sheet
        const wsData = XLSX.utils.json_to_sheet(excelData);
        XLSX.utils.book_append_sheet(wb, wsData, "Financials");

        XLSX.writeFile(wb, "Extracted_Financials.xlsx");
    };

    // Helper to pivot data for display
    // Helper to pivot data for display
    const getPivotedData = () => {
        if (!data || !data.records) return { headers: [], rows: [] };

        // 1. Get all unique years (sorted descending)
        const years = Array.from(new Set(data.records.map((r: any) => r.year))).sort().reverse();

        // 2. Group records by key (Category + SubCategory + LineItem) to merge years into one row
        const grouped = new Map();

        data.records.forEach((r: any) => {
            const key = `${r.category}-${r.subCategory}-${r.lineItem}`;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    category: r.category,
                    subCategory: r.subCategory,
                    lineItem: r.lineItem,
                    confidence: r.confidence,
                    unit: r.unit,
                    // Initialize years with '-'
                    ...Object.fromEntries(years.map((y: any) => [y, '-']))
                });
            }
            // Update the specific year value
            const entry = grouped.get(key);
            entry[r.year] = r.value;
            // conservative confidence (if any value is low, row is low - optional logic, keeping simple for now)
            if (r.confidence === 'Low') entry.confidence = 'Low';
        });

        const rows = Array.from(grouped.values());

        return { headers: years, rows };
    };

    const { headers, rows } = getPivotedData();

    return (
        <div className="container mx-auto p-8 max-w-5xl space-y-8">
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-slate-900">Financial Statement Extractor</h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    Upload any Annual Report (scanned or digital). We use Computer Vision to extract the tables into Excel.
                </p>
            </div>

            <Card className="border-2 border-dashed hover:border-primary/50 transition-colors">
                <CardContent className="p-12 flex flex-col items-center justify-center relative bg-slate-50/50 hover:bg-slate-50">
                    <input
                        type="file"
                        accept="application/pdf"
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        onChange={handleUpload}
                        disabled={loading}
                    />
                    <div className="flex flex-col items-center space-y-4 text-center pointer-events-none">
                        <div className={`p-4 rounded-full ${loading ? 'bg-blue-100' : 'bg-slate-100'}`}>
                            {loading ? <Loader2 className="h-10 w-10 animate-spin text-blue-600" /> : <Upload className="h-10 w-10 text-slate-600" />}
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-semibold text-xl text-slate-900">
                                {loading ? 'Analyzing Document...' : 'Upload Financial PDF'}
                            </h3>
                            <p className="text-sm text-slate-500">
                                Drag & drop or click to browse (Max 5 pages processed for demo)
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {status && (
                <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium text-slate-600">
                        <span>{status}</span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </div>
            )}

            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <div className="flex-1">
                        <AlertTitle>Extraction Failed</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleReset} className="ml-4 bg-white text-destructive hover:bg-destructive/10 border-destructive/20">
                        Try Again
                    </Button>
                </Alert>
            )}

            {data && (
                <Card className="shadow-lg border-slate-200">
                    <CardHeader className="flex flex-row items-center justify-between bg-slate-50/50 border-b">
                        <div className="space-y-1">
                            <CardTitle>Extracted Financials</CardTitle>
                            <p className="text-sm text-muted-foreground">found {yearsDetected()} data points</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleReset} className="gap-2 shadow-sm">
                                <Upload className="h-4 w-4" /> New Document
                            </Button>
                            <Button onClick={handleDownloadExcel} className="gap-2 shadow-sm">
                                <Download className="h-4 w-4" /> Export Excel
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="rounded-b-md">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="w-[350px]">Particulars</TableHead>
                                        {headers.map((year: any) => (
                                            <TableHead key={year} className="text-right font-bold text-slate-700">{year}</TableHead>
                                        ))}
                                        <TableHead className="w-[100px] text-right">Confidence</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((row: any, i: number) => (
                                        <TableRow key={i} className="hover:bg-slate-50/50">
                                            <TableCell className="font-medium align-top">
                                                <div className="flex flex-col gap-0.5">
                                                    {row.category && (
                                                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                                                            {row.category} {row.subCategory ? `› ${row.subCategory}` : ''}
                                                        </span>
                                                    )}
                                                    <span className="text-sm text-slate-800">{row.lineItem}</span>
                                                </div>
                                            </TableCell>
                                            {headers.map((year: any) => (
                                                <TableCell key={year} className="text-right font-mono text-slate-600">
                                                    {(row[year] !== '-' && row[year] !== null && row[year] !== undefined) ?
                                                        row[year].toLocaleString() :
                                                        '-'}
                                                </TableCell>
                                            ))}
                                            <TableCell className="text-right align-top">
                                                <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.confidence === 'High' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20' :
                                                    row.confidence === 'Medium' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20' :
                                                        'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'
                                                    }`}>
                                                    {row.confidence}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );

    function yearsDetected() {
        return data?.yearsDetected?.join(', ') || 'N/A';
    }
}
