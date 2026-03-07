import { SvelteComponentTyped } from "svelte";

export default class MarkdownEditor extends SvelteComponentTyped<{
  content?: string;
  onChange: (value: string, cursor: number) => void;
}> {}
