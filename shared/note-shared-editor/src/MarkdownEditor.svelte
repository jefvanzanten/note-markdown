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
  import { history, historyKeymap, undo, redo } from "@codemirror/commands";

  export let content = "";
  export let sessionId: string = "";
  export let onChange: (sessionId: string, value: string, cursor: number) => void;

  let host: HTMLDivElement;
  let editorView: EditorView | null = null;
  let pendingChangeTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentSessionId: string = "";

  const editorStates = new Map<string, EditorState>();

  const mdHighlight = HighlightStyle.define([
    { tag: tags.heading, class: "md-mark" },
    { tag: tags.strong, class: "md-strong" },
    { tag: tags.emphasis, class: "md-em" },
    { tag: tags.strikethrough, class: "md-strike" },
    { tag: tags.monospace, class: "md-code" },
    { tag: tags.link, class: "md-link" },
    { tag: tags.url, class: "md-url" },
  ]);

  const checklistPattern = /^(\s*)([-*+] )\[([ xX])\]/;
  const editorSidePaddingPx = 16;

  type ParsedChecklistLine = {
    indent: string;
    bullet: string;
    checked: boolean;
    text: string;
  };

  type ChecklistItem = {
    lineNumber: number;
    lineFrom: number;
    handleFrom: number;
    checkboxFrom: number;
    checked: boolean;
    groupId: number;
  };

  type TaskDragState = {
    sourceLineFrom: number;
    sourceGroupId: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
    targetLineFrom: number | null;
    placeAfter: boolean;
  };

  let taskDragState: TaskDragState | null = null;
  let removeTaskDragListeners: (() => void) | null = null;
  let taskDragGhostEl: HTMLDivElement | null = null;
  let taskDropIndicatorEl: HTMLDivElement | null = null;

  const parseChecklistLine = (lineText: string): ParsedChecklistLine | null => {
    const match = lineText.match(checklistPattern);
    if (!match) {
      return null;
    }

    return {
      indent: match[1],
      bullet: match[2],
      checked: match[3].toLowerCase() === "x",
      text: lineText.slice(match[0].length),
    };
  };

  const collectChecklistItems = (state: EditorState): ChecklistItem[] => {
    const items: ChecklistItem[] = [];
    let groupId = -1;
    let previousWasChecklist = false;

    for (let ln = 1; ln <= state.doc.lines; ln++) {
      const line = state.doc.line(ln);
      const parsed = parseChecklistLine(line.text);

      if (!parsed) {
        previousWasChecklist = false;
        continue;
      }

      if (!previousWasChecklist) {
        groupId += 1;
      }
      previousWasChecklist = true;

      const handleFrom = line.from + parsed.indent.length;
      const checkboxFrom = handleFrom + parsed.bullet.length;

      items.push({
        lineNumber: ln,
        lineFrom: line.from,
        handleFrom,
        checkboxFrom,
        checked: parsed.checked,
        groupId,
      });
    }

    return items;
  };

  const findChecklistItem = (state: EditorState, lineFrom: number) =>
    collectChecklistItems(state).find((item) => item.lineFrom === lineFrom) ?? null;

  const collectDocLines = (state: EditorState) => {
    const lines: string[] = [];
    for (let ln = 1; ln <= state.doc.lines; ln++) {
      lines.push(state.doc.line(ln).text);
    }
    return lines;
  };

  const lineStartAtIndex = (lines: string[], index: number) => {
    let pos = 0;
    for (let i = 0; i < index; i++) {
      pos += lines[i].length + 1;
    }
    return pos;
  };

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

  const moveTaskLine = (
    view: EditorView,
    sourceLineFrom: number,
    targetLineFrom: number,
    placeAfter: boolean
  ) => {
    const checklistItems = collectChecklistItems(view.state);
    const sourceItem = checklistItems.find((item) => item.lineFrom === sourceLineFrom);

    if (!sourceItem) {
      return;
    }

    const sourceLineNumber = sourceItem.lineNumber;
    const targetLineNumber = view.state.doc.lineAt(targetLineFrom).number;

    if (sourceLineNumber === targetLineNumber) {
      return;
    }

    const lines = collectDocLines(view.state);
    const [movedLine] = lines.splice(sourceLineNumber - 1, 1);
    if (movedLine === undefined) {
      return;
    }

    let insertIndex = targetLineNumber - 1;
    if (sourceLineNumber < targetLineNumber) {
      insertIndex -= 1;
    }
    if (placeAfter) {
      insertIndex += 1;
    }

    insertIndex = Math.max(0, Math.min(insertIndex, lines.length));

    lines.splice(insertIndex, 0, movedLine);
    const nextDoc = lines.join("\n");

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: nextDoc },
      selection: { anchor: lineStartAtIndex(lines, insertIndex) },
      scrollIntoView: true,
    });
    view.focus();
  };

  const clearTaskDragListeners = () => {
    if (!removeTaskDragListeners) {
      return;
    }

    removeTaskDragListeners();
    removeTaskDragListeners = null;
  };

  const removeTaskDragGhost = () => {
    if (!taskDragGhostEl) {
      return;
    }

    taskDragGhostEl.remove();
    taskDragGhostEl = null;
  };

  const removeTaskDropIndicator = () => {
    if (!taskDropIndicatorEl) {
      return;
    }

    taskDropIndicatorEl.remove();
    taskDropIndicatorEl = null;
  };

  const updateTaskDragGhostPosition = (x: number, y: number) => {
    if (!taskDragGhostEl) {
      return;
    }

    taskDragGhostEl.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 12)}px)`;
  };

  const showTaskDragGhost = (view: EditorView, sourceLineFrom: number) => {
    removeTaskDragGhost();

    const line = view.state.doc.lineAt(sourceLineFrom);
    const parsed = parseChecklistLine(line.text);
    if (!parsed) {
      return;
    }

    const ghost = document.createElement("div");
    ghost.className = "cm-task-drag-ghost";

    const bullet = document.createElement("span");
    bullet.className = "cm-task-drag-bullet";
    bullet.textContent = parsed.bullet.trim();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "cm-checkbox";
    checkbox.checked = parsed.checked;
    checkbox.disabled = true;

    const text = document.createElement("span");
    text.className = "cm-task-drag-text";
    text.textContent = parsed.text || " ";

    ghost.append(bullet, checkbox, text);
    document.body.append(ghost);
    taskDragGhostEl = ghost;
  };

  const showTaskDropIndicator = (view: EditorView, targetLineFrom: number, placeAfter: boolean) => {
    if (!taskDropIndicatorEl) {
      const indicator = document.createElement("div");
      indicator.className = "cm-task-drop-indicator";
      document.body.append(indicator);
      taskDropIndicatorEl = indicator;
    }

    const line = view.state.doc.lineAt(targetLineFrom);
    const block = view.lineBlockAt(line.from);
    const y = view.documentTop + (placeAfter ? block.bottom : block.top);
    const scrollerRect = view.scrollDOM.getBoundingClientRect();
    const left = Math.round(scrollerRect.left + editorSidePaddingPx);
    const width = Math.max(36, Math.round(scrollerRect.width - editorSidePaddingPx * 2));

    taskDropIndicatorEl.style.transform = `translate(${left}px, ${Math.round(y - 1)}px)`;
    taskDropIndicatorEl.style.width = `${width}px`;
    taskDropIndicatorEl.style.display = "block";
  };

  const hideTaskDropIndicator = () => {
    if (taskDropIndicatorEl) {
      taskDropIndicatorEl.style.display = "none";
    }
  };

  const stopTaskDrag = () => {
    taskDragState = null;
    clearTaskDragListeners();
    removeTaskDragGhost();
    removeTaskDropIndicator();
    document.body.classList.remove("cm-task-reordering");
  };

  const taskDropTargetAtCoords = (
    view: EditorView,
    x: number,
    y: number,
    _sourceGroupId: number
  ) => {
    const pos = view.posAtCoords({ x, y }, false);
    if (pos === null) {
      return null;
    }

    const line = view.state.doc.lineAt(pos);
    const placeAfter = y > lineCenterY(view, line.from);
    return { targetLineFrom: line.from, placeAfter };
  };

  const startTaskDrag = (view: EditorView, event: PointerEvent, sourceLineFrom: number) => {
    if (event.button !== 0) {
      return;
    }

    const sourceItem = findChecklistItem(view.state, sourceLineFrom);
    if (!sourceItem) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    stopTaskDrag();
    taskDragState = {
      sourceLineFrom,
      sourceGroupId: sourceItem.groupId,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
      targetLineFrom: null,
      placeAfter: false,
    };

    document.body.classList.add("cm-task-reordering");
    showTaskDragGhost(view, sourceLineFrom);
    updateTaskDragGhostPosition(event.clientX, event.clientY);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!taskDragState) {
        return;
      }

      updateTaskDragGhostPosition(moveEvent.clientX, moveEvent.clientY);

      const movedX = Math.abs(moveEvent.clientX - taskDragState.startX);
      const movedY = Math.abs(moveEvent.clientY - taskDragState.startY);
      if (!taskDragState.hasMoved && (movedX > 3 || movedY > 3)) {
        taskDragState.hasMoved = true;
      }

      const target = taskDropTargetAtCoords(
        view,
        moveEvent.clientX,
        moveEvent.clientY,
        taskDragState.sourceGroupId
      );

      if (!target) {
        taskDragState.targetLineFrom = null;
        hideTaskDropIndicator();
        return;
      }

      taskDragState.targetLineFrom = target.targetLineFrom;
      taskDragState.placeAfter = target.placeAfter;
      showTaskDropIndicator(view, target.targetLineFrom, target.placeAfter);
    };

    const onPointerEnd = (endEvent: PointerEvent) => {
      if (endEvent.type === "pointerup") {
        endEvent.preventDefault();
      }

      const drag = taskDragState;
      stopTaskDrag();

      if (!drag || !drag.hasMoved || drag.targetLineFrom === null) {
        view.focus();
        return;
      }

      moveTaskLine(view, drag.sourceLineFrom, drag.targetLineFrom, drag.placeAfter);
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);

    removeTaskDragListeners = () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
    };
  };

  class DragHandleWidget extends WidgetType {
    lineFrom: number;

    constructor(lineFrom: number) {
      super();
      this.lineFrom = lineFrom;
    }

    toDOM(view: EditorView): HTMLElement {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "cm-task-handle";
      handle.tabIndex = -1;
      handle.title = "Sleep om checklist-item te verplaatsen";
      handle.setAttribute("aria-label", "Sleep om checklist-item te verplaatsen");
      handle.addEventListener("pointerdown", (event) => {
        startTaskDrag(view, event, this.lineFrom);
      });
      return handle;
    }

    eq(other: DragHandleWidget): boolean {
      return other.lineFrom === this.lineFrom;
    }

    ignoreEvent(): boolean {
      return true;
    }
  }

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
        const checklistByLine = new Map(
          collectChecklistItems(view.state).map((item) => [item.lineFrom, item])
        );
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

          const checklistItem = checklistByLine.get(line.from);
          if (checklistItem) {
            decs.push(
              Decoration.widget({
                widget: new DragHandleWidget(checklistItem.lineFrom),
                side: -1,
              }).range(checklistItem.handleFrom)
            );
            decs.push(
              Decoration.replace({
                widget: new CheckboxWidget(
                  checklistItem.checked,
                  checklistItem.checkboxFrom
                ),
              }).range(checklistItem.checkboxFrom, checklistItem.checkboxFrom + 3)
            );
          }
        }
        return Decoration.set(decs);
      }
    },
    { decorations: (v) => v.decorations }
  );

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

    const capturedSessionId = sessionId;

    pendingChangeTimeout = setTimeout(() => {
      pendingChangeTimeout = null;
      onChange(capturedSessionId, value, cursor);
    }, 300);
  };

  const createEditor = () => {
    editorView = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          history(),
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
          keymap.of([
            { key: "Mod-z", run: () => undo(editorView!) },
            { key: "Mod-y", run: () => redo(editorView!) },
            { key: "Shift-Mod-z", run: () => redo(editorView!) },
          ]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged && !update.selectionSet) return;
            queueChange(update.state.doc.toString(), update.state.selection.main.head);
          }),
        ],
      }),
      parent: host,
    });
    currentSessionId = sessionId;
  };

  onMount(() => {
    createEditor();
  });

  $: if (currentSessionId !== "" && currentSessionId !== sessionId) {
    if (pendingChangeTimeout) {
      clearTimeout(pendingChangeTimeout);
      pendingChangeTimeout = null;
    }
    currentSessionId = sessionId;
  }

  $: if (editorView && content !== editorView.state.doc.toString()) {
    const sel = editorView.state.selection.main.head;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: content },
      selection: { anchor: Math.min(sel, content.length) },
      annotations: EditorState.addToHistory.of(false),
    });
  }

  onDestroy(() => {
    if (pendingChangeTimeout) {
      clearTimeout(pendingChangeTimeout);
    }
    stopTaskDrag();
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

  :global(body.cm-task-reordering) {
    cursor: grabbing;
  }

  :global(.cm-task-drag-ghost) {
    position: fixed;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 1000;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: min(72vw, 680px);
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid rgba(56, 189, 248, 0.4);
    background: rgba(15, 23, 42, 0.94);
    color: #e2e8f0;
    box-shadow: 0 10px 24px rgba(2, 6, 23, 0.45);
    opacity: 0.95;
    font-family: "Fira Code", Consolas, monospace;
    font-size: 14px;
    line-height: 1.35;
    white-space: nowrap;
  }

  :global(.cm-task-drag-bullet) {
    color: #94a3b8;
    font-weight: 700;
    flex: 0 0 auto;
  }

  :global(.cm-task-drag-text) {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  :global(.cm-task-drag-ghost .cm-checkbox) {
    margin: 0;
    pointer-events: none;
    opacity: 1;
  }

  :global(.cm-task-drop-indicator) {
    position: fixed;
    top: 0;
    left: 0;
    height: 2px;
    border-radius: 999px;
    pointer-events: none;
    z-index: 999;
    background: #38bdf8;
    box-shadow: 0 0 0 1px rgba(14, 165, 233, 0.25);
  }

  :global(.cm-task-handle) {
    width: 12px;
    height: 14px;
    border: 0;
    padding: 0;
    margin-right: 4px;
    background: transparent;
    color: #64748b;
    cursor: grab;
    display: inline-block;
    vertical-align: middle;
    position: relative;
  }

  :global(.cm-task-handle::before) {
    content: "";
    position: absolute;
    left: 1px;
    top: 2px;
    width: 2px;
    height: 2px;
    border-radius: 999px;
    background: currentcolor;
    box-shadow:
      0 4px 0 currentcolor,
      0 8px 0 currentcolor,
      4px 0 0 currentcolor,
      4px 4px 0 currentcolor,
      4px 8px 0 currentcolor;
  }

  :global(.cm-task-handle:hover) {
    color: #94a3b8;
  }

  :global(.cm-task-handle:active) {
    cursor: grabbing;
  }

  :global(.cm-checkbox) {
    cursor: pointer;
    width: 14px;
    height: 14px;
    vertical-align: middle;
    margin-right: 0;
    accent-color: #0284c7;
  }
</style>
