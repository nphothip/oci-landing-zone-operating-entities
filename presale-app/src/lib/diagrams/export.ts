// Client-side download helpers (SVG serialize, PNG via canvas, blob save).

export function downloadBlob(data: Blob, filename: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function svgElementToString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSvg(svg: SVGSVGElement, filename: string): void {
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n${svgElementToString(svg)}`;
  downloadBlob(new Blob([text], { type: "image/svg+xml" }), filename);
}

/** Rasterize an SVG element to PNG bytes (for embedding, e.g. Word export). */
export async function svgToPngBytes(svg: SVGSVGElement, scale = 2): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const text = svgElementToString(svg);
  const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG rasterize failed"));
      img.src = url;
    });
    const w = Number(svg.getAttribute("width") || svg.viewBox.baseVal.width || img.width);
    const h = Number(svg.getAttribute("height") || svg.viewBox.baseVal.height || img.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("PNG encode failed");
    return { bytes: new Uint8Array(await png.arrayBuffer()), width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  const text = svgElementToString(svg);
  const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG rasterize failed"));
      img.src = url;
    });
    const w = Number(svg.getAttribute("width") || svg.viewBox.baseVal.width || img.width);
    const h = Number(svg.getAttribute("height") || svg.viewBox.baseVal.height || img.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (png) downloadBlob(png, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
