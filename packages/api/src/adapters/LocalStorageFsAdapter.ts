import type { FileSystemAdapter } from "@note/core";

export class LocalStorageFsAdapter implements FileSystemAdapter {
  private readonly storagePrefix: string;

  constructor(storagePrefix = "note-fs") {
    this.storagePrefix = storagePrefix;
  }

  private key(path: string): string {
    return `${this.storagePrefix}:${path}`;
  }

  async createDirAll(_path: string): Promise<void> {
    // no-op: localStorage has no directory concept
  }

  async readToString(path: string): Promise<string> {
    const value = localStorage.getItem(this.key(path));
    if (value === null) {
      throw new Error(`File not found: ${path}`);
    }
    return value;
  }

  async writeString(path: string, content: string): Promise<void> {
    localStorage.setItem(this.key(path), content);
  }

  async removeFile(path: string): Promise<void> {
    localStorage.removeItem(this.key(path));
  }

  async exists(path: string): Promise<boolean> {
    return localStorage.getItem(this.key(path)) !== null;
  }

  sessionRoot(appName: string): string {
    return appName;
  }
}
