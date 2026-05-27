import { Parser } from 'json2csv';
import { parse } from 'csv-parse/sync';

export function csvToJson<T>(csvContent: string): T[] {
  try {
    return parse(csvContent, {
      columns: (headers: string[]) => headers.map(header => header.replace(/^\uFEFF/, '').trim()),
      skip_empty_lines: true,
      trim: true,
    }) as T[];
  } catch (error) {
    throw new Error(`CSV parsing error: ${error}`);
  }
}

export function jsonToCsv<T>(data: T[], filename?: string): string {
  try {
    const parser = new Parser();
    return parser.parse(data);
  } catch (error) {
    throw new Error(`CSV generation error: ${error}`);
  }
}

export function generateCsvFile<T>(data: T[], filename: string): Buffer {
  const csv = jsonToCsv(data);
  return Buffer.from(csv, 'utf-8');
}
