
import { TextItem } from "./pdf-processor";

// Types for our Grid
export interface GridRow {
    y: number;
    cells: GridCell[];
}

export interface GridCell {
    x: number;
    text: string;
    colIndex?: number; // assigned later
}

/**
 * The Layout Engine: Converts raw text items into a structured Table Matrix
 * Deterministic. No AI.
 */
export class LayoutEngine {

    // Thresholds
    private ROW_TOLERANCE_Y = 5; // Pixels
    private COLUMN_TOLERANCE_X = 20;
    private MATCH_TOLERANCE = 30; // lenient matching

    /**
     * Main entry point: Build a grid from text items
     */
    buildGrid(items: TextItem[]): { rows: GridRow[], headers: any[] } {
        // 1. Group by Y (Rows)
        const rows = this.groupByRows(items);

        // 2. Sort rows by Y.
        // PDF coordinates: (0,0) is usually bottom-left. So higher Y = top of page.
        // We want top-down, so we sort DESCENDING.
        rows.sort((a, b) => b.y - a.y);

        // 3. Detect Global Columns (X-clusters)
        const globalColumns = this.detectColumns(rows);

        // 4. Align cells to global columns
        this.alignCellsToColumns(rows, globalColumns);

        return { rows, headers: globalColumns };
    }

    private groupByRows(items: TextItem[]): GridRow[] {
        const rows: GridRow[] = [];

        items.forEach(item => {
            // Find a row that is "close enough" in Y
            let matchedRow = rows.find(r => Math.abs(r.y - item.y) < this.ROW_TOLERANCE_Y);

            if (matchedRow) {
                matchedRow.cells.push({ x: item.x, text: item.str });
            } else {
                rows.push({
                    y: item.y,
                    cells: [{ x: item.x, text: item.str }]
                });
            }
        });

        return rows;
    }

    private detectColumns(rows: GridRow[]): number[] {
        // Collect all X coordinates
        const allX: number[] = [];
        rows.forEach(r => r.cells.forEach(c => allX.push(c.x)));
        allX.sort((a, b) => a - b);

        const columns: number[] = [];

        if (allX.length > 0) {
            let currentClusterStart = allX[0];
            let currentClusterSum = allX[0];
            let currentClusterCount = 1;

            for (let i = 1; i < allX.length; i++) {
                if (allX[i] - allX[i - 1] > this.COLUMN_TOLERANCE_X) {
                    // End of cluster
                    columns.push(currentClusterSum / currentClusterCount);
                    // Start new
                    currentClusterStart = allX[i];
                    currentClusterSum = allX[i];
                    currentClusterCount = 1;
                } else {
                    currentClusterSum += allX[i];
                    currentClusterCount++;
                }
            }
            columns.push(currentClusterSum / currentClusterCount); // Last cluster
        }
        return columns;
    }

    private alignCellsToColumns(rows: GridRow[], columns: number[]) {
        rows.forEach(row => {
            // Sort cells by x first
            row.cells.sort((a, b) => a.x - b.x);

            // Map each cell to the closest column
            row.cells.forEach(cell => {
                let bestColIndex = -1;
                let minDiff = Infinity;

                columns.forEach((colX, index) => {
                    const diff = Math.abs(cell.x - colX);
                    if (diff < minDiff && diff < this.MATCH_TOLERANCE) {
                        minDiff = diff;
                        bestColIndex = index;
                    }
                });

                if (bestColIndex !== -1) {
                    cell.colIndex = bestColIndex;
                }
            });
        });
    }
}

export const layoutEngine = new LayoutEngine();
