type CloseRequestEvent = {
  preventDefault: () => void;
};

type CloseHandler = (event: CloseRequestEvent) => void | Promise<void>;

let closeHandlers: CloseHandler[] = [];

export const getCurrentWindow = () => ({
  label: new URLSearchParams(window.location.search).get("tabId") ?? "sticky-main",
  async setTitle(title: string) {
    document.title = title || "sticky";
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
