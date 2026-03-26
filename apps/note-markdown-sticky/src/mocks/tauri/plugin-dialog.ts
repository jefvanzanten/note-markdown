export const open = async () => {
  const path = window.prompt("Open mock markdown bestand", "sticky.md");
  return path && path.trim().length > 0 ? path : null;
};

export const save = async (options?: { defaultPath?: string }) => {
  const path = window.prompt("Sla mock markdown bestand op als", options?.defaultPath ?? "sticky.md");
  return path && path.trim().length > 0 ? path : null;
};
