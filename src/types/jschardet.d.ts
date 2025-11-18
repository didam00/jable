declare module 'jschardet' {
  export interface JsChardetResult {
    encoding?: string;
    confidence?: number;
  }

  export function detect(
    input: string | Uint8Array | ArrayBuffer
  ): JsChardetResult;
}

