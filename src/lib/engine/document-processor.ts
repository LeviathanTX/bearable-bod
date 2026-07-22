import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export interface ProcessedDocument {
  text: string;
  chunks: string[];
  metadata: { pages?: number; sheets?: string[]; slides?: number };
}

export async function processDocument(buffer: Buffer, fileType: string): Promise<ProcessedDocument> {
  let text = '';
  const metadata: ProcessedDocument['metadata'] = {};

  switch (fileType) {
    case 'application/pdf':
      const pdfResult = await extractPdfText(buffer);
      text = pdfResult.text;
      metadata.pages = pdfResult.pages;
      break;

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      text = await extractWordText(buffer);
      break;

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      const xlResult = extractExcelText(buffer);
      text = xlResult.text;
      metadata.sheets = xlResult.sheets;
      break;

    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      const pptResult = await extractPptxText(buffer);
      text = pptResult.text;
      metadata.slides = pptResult.slides;
      break;

    default:
      text = buffer.toString('utf8');
  }

  const chunks = chunkText(text);
  return { text, chunks, metadata };
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = doc.numPages;
  const textParts: string[] = [];

  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ');
    textParts.push(pageText);
  }

  return { text: textParts.join('\n\n'), pages };
}

async function extractWordText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extractExcelText(buffer: Buffer): { text: string; sheets: string[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets = workbook.SheetNames;
  const textParts: string[] = [];

  for (const name of sheets) {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    textParts.push(`[Sheet: ${name}]\n${csv}`);
  }

  return { text: textParts.join('\n\n'), sheets };
}

async function extractPptxText(buffer: Buffer): Promise<{ text: string; slides: number }> {
  const zip = new JSZip();
  const content = await zip.loadAsync(buffer);
  const slideFiles = Object.keys(content.files)
    .filter((f) => f.match(/ppt\/slides\/slide\d+\.xml/))
    .sort();

  const textParts: string[] = [];
  for (const file of slideFiles) {
    const xml = await content.files[file].async('text');
    const texts = xml.match(/<a:t>(.*?)<\/a:t>/g) || [];
    const slideText = texts.map((t) => t.replace(/<\/?a:t>/g, '')).join(' ');
    textParts.push(slideText);
  }

  return { text: textParts.join('\n\n'), slides: slideFiles.length };
}

function chunkText(text: string, maxTokens: number = 512): string[] {
  const approxCharsPerToken = 4;
  const maxChars = maxTokens * approxCharsPerToken;
  const chunks: string[] = [];

  const paragraphs = text.split(/\n\n+/);
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += para + '\n\n';
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}
