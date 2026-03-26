export class WebviewWindow {
  static async getByLabel(_label: string) {
    return null;
  }

  constructor(label: string, options: { url: string; width: number; height: number }) {
    const features = `popup=yes,width=${options.width},height=${options.height}`;
    window.open(options.url, label, features);
  }
}
