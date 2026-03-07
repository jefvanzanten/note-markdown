type CloseRequestEvent = {
  preventDefault: () => void;
};

type CloseHandler = (event: CloseRequestEvent) => void | Promise<void>;

type WindowSize = {
  width?: number;
  height?: number;
  Logical?: {
    width: number;
    height: number;
  };
};

let closeHandlers: CloseHandler[] = [];

export const getCurrentWindow = () => ({
  label: new URLSearchParams(window.location.search).get("tabId") ?? "sticky-main",
  async setTitle(title: string) {
    document.title = title || "sticky";
  },
  async setSize(size: WindowSize) {
    const next = size.Logical ?? {
      width: size.width ?? window.innerWidth,
      height: size.height ?? window.innerHeight
    };

    window.resizeTo(Math.round(next.width), Math.round(next.height));
  },
  async onCloseRequested(handler: CloseHandler) {
    closeHandlers.push(handler);
    return () => {
      closeHandlers = closeHandlers.filter((entry) => entry !== handler);
    };
  },
  async destroy() {
    window.close();
  }
});

window.addEventListener("beforeunload", () => {
  const event: CloseRequestEvent = { preventDefault: () => undefined };
  for (const handler of closeHandlers) {
    void handler(event);
  }
});
