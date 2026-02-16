import { Injectable } from '@angular/core';

export class ConfigTooLargeError extends Error {
  constructor(size: number, limit: number) {
    super(`Config too large to share (${size} chars, limit: ${limit})`);
    this.name = 'ConfigTooLargeError';
  }
}

export class ConfigDecodeError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message);
    this.name = 'ConfigDecodeError';
  }
}

@Injectable({
  providedIn: 'root'
})
export class ConfigUrlService {
  private readonly MAX_URL_LENGTH = 8000;
  private readonly WARN_URL_LENGTH = 2000;

  /**
   * Encode YAML string to URL-safe Base64
   */
  encodeConfig(yamlString: string): string {
    try {
      // Handle UTF-8 properly: string -> UTF-8 bytes -> Base64
      const utf8Bytes = new TextEncoder().encode(yamlString);
      const base64 = btoa(String.fromCharCode(...utf8Bytes));

      // Make URL-safe: + -> -, / -> _, remove padding =
      return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    } catch (error) {
      throw new ConfigDecodeError('Failed to encode config', error);
    }
  }

  /**
   * Decode URL-safe Base64 back to YAML string
   */
  decodeConfig(encoded: string): string {
    try {
      // Restore standard Base64: - -> +, _ -> /
      let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');

      // Add padding back if needed
      while (base64.length % 4) {
        base64 += '=';
      }

      // Decode: Base64 -> UTF-8 bytes -> string
      const binaryString = atob(base64);
      const utf8Bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
      return new TextDecoder().decode(utf8Bytes);
    } catch (error) {
      throw new ConfigDecodeError('Invalid encoded config format', error);
    }
  }

  /**
   * Generate full shareable URL with current origin
   */
  generateShareableUrl(yamlString: string): string {
    const encoded = this.encodeConfig(yamlString);
    const url = `${window.location.origin}${window.location.pathname}?config=${encoded}`;

    if (url.length > this.MAX_URL_LENGTH) {
      throw new ConfigTooLargeError(url.length, this.MAX_URL_LENGTH);
    }

    if (url.length > this.WARN_URL_LENGTH) {
      console.warn(`Generated URL is ${url.length} characters (recommended: <${this.WARN_URL_LENGTH})`);
    }

    return url;
  }

  /**
   * Validate encoded config format
   */
  isValidEncodedConfig(encoded: string): boolean {
    try {
      this.decodeConfig(encoded);
      return true;
    } catch {
      return false;
    }
  }
}
