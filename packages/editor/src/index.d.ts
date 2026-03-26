import { SvelteComponentTyped } from "svelte";

export default class MarkdownEditor extends SvelteComponentTyped<{
  content?: string;
  sessionId?: string;
  onChange: (sessionId: string, value: string, cursor: number) => void;
}> {}
