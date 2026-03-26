export interface FileSystemAdapter {
  createDirAll(path: string): Promise<void>;
  readToString(path: string): Promise<string>;
  writeString(path: string, content: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  sessionRoot(appName: string): string;
}
