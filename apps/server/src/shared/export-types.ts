export type ExportFormat = "csv" | "json";
export type ExportValue = string | number | boolean | Date | null | string[];
export type ExportRecord = Record<string, ExportValue | undefined>;
