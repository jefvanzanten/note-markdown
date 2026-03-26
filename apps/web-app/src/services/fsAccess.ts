export type FileEntry = {
  name: string;
  path: string;
  handle?: FileSystemFileHandle;
  file?: File;
  cachedContent?: string;
};

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

const isMarkdown = (name: string): boolean =>
  MARKDOWN_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

const stemName = (name: string): string => {
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(0, lastDot) : name;
};

async function collectFiles(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string,
  results: FileEntry[]
): Promise<void> {
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === "file" && isMarkdown(name)) {
      results.push({
        name: stemName(name),
        path: prefix ? `${prefix}/${name}` : name,
        handle: handle as FileSystemFileHandle
      });
    } else if (handle.kind === "directory") {
      await collectFiles(
        handle as FileSystemDirectoryHandle,
        prefix ? `${prefix}/${name}` : name,
        results
      );
    }
  }
}

export const scanWorkspace = async (
  dirHandle: FileSystemDirectoryHandle
): Promise<FileEntry[]> => {
  const results: FileEntry[] = [];
  await collectFiles(dirHandle, "", results);
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
};

/** Build FileEntry list from a plain <input webkitdirectory> FileList. */
export const buildFallbackEntries = (fileList: FileList): { entries: FileEntry[]; rootName: string } => {
  const entries: FileEntry[] = [];
  let rootName = "workspace";

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!isMarkdown(file.name)) continue;
    const relPath = file.webkitRelativePath || file.name;
    if (i === 0 && relPath.includes("/")) {
      rootName = relPath.split("/")[0];
    }
    entries.push({ name: stemName(file.name), path: relPath, file });
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { entries, rootName };
};

export const readFileEntry = async (entry: FileEntry): Promise<string> => {
  if (entry.handle) {
    const file = await entry.handle.getFile();
    return file.text();
  }
  if (entry.file) {
    return entry.file.text();
  }
  if (entry.cachedContent !== undefined) {
    return entry.cachedContent;
  }
  throw new Error("No file source available");
};

export const writeFile = async (
  fileHandle: FileSystemFileHandle,
  content: string
): Promise<void> => {
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
};

export const downloadFile = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
