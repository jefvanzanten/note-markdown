<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { EditorSelection, EditorState } from "@codemirror/state";
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
        if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged) {
          this.decorations = this.build(u.view);
        }
      }

      build(view: EditorView): DecorationSet {
        const decs: Range<Decoration>[] = [];
        const activeLine = view.hasFocus
          ? view.state.doc.lineAt(view.state.selection.main.head).number
          : -1;

        for (let ln = 1; ln <= view.state.doc.lines; ln++) {
          const line = view.state.doc.line(ln);

          const hm = line.text.match(/^(#{1,6}) /);
          if (hm) {
            decs.push(
              Decoration.line({ class: `md-h${hm[1].length}` }).range(line.from)
            );

            if (ln !== activeLine) {
              decs.push(
                Decoration.replace({}).range(line.from, line.from + hm[0].length)
              );
            }
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

  const lineCenterY = (view: EditorView, pos: number) => {
    const block = view.lineBlockAt(pos);
    return view.documentTop + block.top + block.height / 2;
  };

  const textVerticalBounds = (view: EditorView) => {
    const first = view.lineBlockAt(0);
    const last = view.lineBlockAt(view.state.doc.length);
    const top = view.documentTop + first.top;
    const bottom = view.documentTop + last.bottom;
    return { top, bottom };
  };

  const edgeAwarePos = (view: EditorView, x: number, y: number) => {
    const { top, bottom } = textVerticalBounds(view);

    if (y < top) {
      return view.posAndSideAtCoords({ x, y: lineCenterY(view, 0) }, false);
    }

    if (y > bottom) {
      return view.posAndSideAtCoords({ x, y: lineCenterY(view, view.state.doc.length) }, false);
    }

    return view.posAndSideAtCoords({ x, y }, false);
  };

  const removeRangeAround = (selection: EditorSelection, pos: number) => {
    for (let i = 0; i < selection.ranges.length; i++) {
      const range = selection.ranges[i];
      if (range.from <= pos && range.to >= pos) {
        return EditorSelection.create(
          selection.ranges.slice(0, i).concat(selection.ranges.slice(i + 1)),
          selection.mainIndex === i
            ? 0
            : selection.mainIndex - (selection.mainIndex > i ? 1 : 0)
        );
      }
    }

    return null;
  };

  const edgeWhitespaceSelection = EditorView.mouseSelectionStyle.of((view, event) => {
    if (event.button !== 0 || event.detail !== 1) return null;

    const { top, bottom } = textVerticalBounds(view);
    if (event.clientY >= top && event.clientY <= bottom) return null;

    let start = edgeAwarePos(view, event.clientX, event.clientY);
    let startSelection = view.state.selection;

    return {
      update(update) {
        if (update.docChanged) {
          start = { ...start, pos: update.changes.mapPos(start.pos) };
          startSelection = startSelection.map(update.changes);
        }
      },
      get(curEvent, extend, multiple) {
        const current = edgeAwarePos(view, curEvent.clientX, curEvent.clientY);
        let range = EditorSelection.cursor(current.pos, current.assoc);

        if (start.pos !== current.pos && !extend) {
          range = EditorSelection.range(start.pos, current.pos);
        }

        if (extend) {
          return startSelection.replaceRange(
            startSelection.main.extend(range.from, range.to)
          );
        }

        if (multiple && startSelection.ranges.length > 1) {
          const removed = removeRangeAround(startSelection, current.pos);
          if (removed) return removed;
        }

        if (multiple) {
          return startSelection.addRange(range);
        }

        return EditorSelection.create([range]);
      },
    };
  });

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
          edgeWhitespaceSelection,
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

  :global(.cm-content) {
    padding: 16px 0;
  }

  :global(.cm-line) {
    padding: 0 16px;
  }

  :global(.cm-scroller) {
    padding: 0;
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
    color: currentcolor;
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
