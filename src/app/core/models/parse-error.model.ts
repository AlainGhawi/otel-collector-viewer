export interface ParseError {
  message: string;
  line?: number;
  fullError?: string; // we'll use this in step 2
}