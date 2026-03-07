<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { EditorState } from "@codemirror/state";
  import type { Range } from "@codemirror/state";
  import {
    Decoration,
    EditorView,
    ViewPlugin,
    WidgetType,
    keymap,
  } from "@codemirror/view";
  import type { DecorationSet, ViewUpdate } from "@codemirror/view";
  import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
  import { markdown } from "@codemirror/lang-markdown";
  import { tags } from "@lezer/highlight";

  export let content = "";
  export let onChange: (value: string, cursor: number) => void;

  let host: HTMLDivElement;
  let editorView: EditorView | null = null;
  let pendingChangeTimeout: ReturnType<typeof setTimeout> | null = null;

  const mdHighlight = HighlightStyle.define([
    { tag: tags.heading, class: "md-mark" },
    { tag: tags.strong, class: "md-strong" },
    { tag: tags.emphasis, class: "md-em" },
    { tag: tags.strikethrough, class: "md-strike" },
    { tag: tags.monospace, class: "md-code" },
    { tag: tags.link, class: "md-link" },
    { tag: tags.url, class: "md-url" },
  ]);

  class CheckboxWidget extends WidgetType {
    checked: boolean;
    from: number;

    constructor(checked: boolean, from: number) {
      super();
      this.checked = checked;
      this.from = from;
    }

    toDOM(view: EditorView): HTMLElement {
      const el = document.createElement("input");
      el.type = "checkbox";
      el.checked = this.checked;
      el.className = "cm-checkbox";
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        view.dispatch({
          changes: {
            from: this.from,
            to: this.from + 3,
            insert: this.checked ? "[ ]" : "[x]",
          },
        });
      });
      return el;
    }

    eq(other: CheckboxWidget): boolean {
      return other.checked === this.checked && other.from === this.from;
    }

    ignoreEvent(): boolean {
      return true;
    }
  }

  const mdPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) {
          this.decorations = this.build(u.view);
        }
      }

      build(view: EditorView): DecorationSet {
        const decs: Range<Decoration>[] = [];
        for (let ln = 1; ln <= view.state.doc.lines; ln++) {
          const line = view.state.doc.line(ln);

          const hm = line.text.match(/^(#{1,6}) /);
          if (hm) {
            decs.push(
              Decoration.line({ class: `md-h${hm[1].length}` }).range(line.from)
            );
          }

          const cm = line.text.match(/^(\s*[-*+] )\[([ xX])\]/);
          if (cm) {
            const from = line.from + cm[1].length;
            decs.push(
              Decoration.replace({
                widget: new CheckboxWidget(cm[2].toLowerCase() === "x", from),
              }).range(from, from + 3)
            );
          }
        }
        return Decoration.set(decs);
      }
    },
    { decorations: (v) => v.decorations }
  );

  const queueChange = (value: string, cursor: number) => {
    if (pendingChangeTimeout) {
      clearTimeout(pendingChangeTimeout);
    }

    pendingChangeTimeout = setTimeout(() => {
      pendingChangeTimeout = null;
      onChange(value, cursor);
    }, 300);
  };

  const createEditor = () => {
    editorView = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          markdown(),
          syntaxHighlighting(mdHighlight),
          mdPlugin,
          EditorView.theme(
            {
              ".cm-cursor": {
                borderLeftColor: "#e2e8f0",
                borderLeftWidth: "2px",
              },
            },
            { dark: true }
          ),
          keymap.of([]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged && !update.selectionSet) return;
            queueChange(update.state.doc.toString(), update.state.selection.main.head);
          }),
        ],
      }),
      parent: host,
    });
  };

  onMount(() => {
    createEditor();
  });

  $: if (editorView && content !== editorView.state.doc.toString()) {
    const sel = editorView.state.selection.main.head;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: content },
      selection: { anchor: Math.min(sel, content.length) },
    });
  }

  onDestroy(() => {
    if (pendingChangeTimeout) {
      clearTimeout(pendingChangeTimeout);
    }
    editorView?.destroy();
  });
</script>

<div class="editor-host" bind:this={host}></div>

<style>
  .editor-host {
    height: 100%;
  }

  :global(.cm-editor) {
    height: 100%;
    font-family: "Fira Code", Consolas, monospace;
    font-size: 14px;
    color: #e2e8f0;
  }

  :global(.cm-scroller) {
    padding: 16px;
    line-height: 1.6;
  }

  :global(.cm-line.md-h1) {
    font-size: 1.8em;
    font-weight: 700;
    line-height: 1.4;
  }

  :global(.cm-line.md-h2) {
    font-size: 1.5em;
    font-weight: 700;
    line-height: 1.4;
  }

  :global(.cm-line.md-h3) {
    font-size: 1.3em;
    font-weight: 700;
    line-height: 1.4;
  }

  :global(.cm-line.md-h4) {
    font-size: 1.1em;
    font-weight: 700;
  }

  :global(.cm-line.md-h5) {
    font-size: 1em;
    font-weight: 700;
  }

  :global(.cm-line.md-h6) {
    font-size: 1em;
    font-weight: 600;
    color: #94a3b8;
  }

  :global(.md-mark) {
    color: #475569;
  }

  :global(.md-strong) {
    font-weight: 700;
  }

  :global(.md-em) {
    font-style: italic;
  }

  :global(.md-strike) {
    text-decoration: line-through;
    color: #94a3b8;
  }

  :global(.md-code) {
    font-family: "Fira Code", Consolas, monospace;
    color: #f472b6;
    background: #1e293b;
    border-radius: 3px;
    padding: 0 3px;
  }

  :global(.md-link) {
    color: #7dd3fc;
    text-decoration: underline;
  }

  :global(.md-url) {
    color: #64748b;
  }

  :global(.cm-checkbox) {
    cursor: pointer;
    width: 14px;
    height: 14px;
    vertical-align: middle;
    margin-right: 3px;
    accent-color: #0284c7;
  }
</style>
