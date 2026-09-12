/** Pan/zoom map canvas — image + pins move together. */

import { clamp } from "@/lib/fleetMapGeo";

export interface FleetMapPinPoint {
  left: number;
  top: number;
}

export class FleetMapViewport {
  stage: HTMLElement | null;
  viewport: HTMLElement | null;
  transform: HTMLElement | null;
  canvas: HTMLElement | null;
  terrainClip: HTMLElement | null;
  img: HTMLImageElement | null;
  scale = 1;
  panX = 0;
  panY = 0;
  minScale = 0.2;
  maxScale = 8;
  private _drag: { x: number; y: number; panX: number; panY: number } | null = null;
  private _wheelBound: ((ev: WheelEvent) => void) | null = null;
  private _pinPoints: FleetMapPinPoint[] = [];
  private _onLayout: ResizeObserver | null = null;
  private _pointerDown: ((ev: PointerEvent) => void) | null = null;
  private _pointerMove: ((ev: PointerEvent) => void) | null = null;
  private _pointerUp: ((ev: PointerEvent) => void) | null = null;
  fitScale = 1;
  onViewChange: ((info: { scale: number; fitScale: number; namesUnlocked: boolean }) => void) | null = null;
  private _userView = false;
  private _panMoved = false;

  constructor(stageEl: HTMLElement | null) {
    this.stage = stageEl;
    this.viewport = (stageEl?.querySelector(".farm-fleet-map-viewport") as HTMLElement) || null;
    this.transform = (stageEl?.querySelector(".farm-fleet-map-transform") as HTMLElement) || null;
    this.canvas = (stageEl?.querySelector(".farm-fleet-map-canvas") as HTMLElement) || null;
    this.terrainClip = (stageEl?.querySelector("#fleet-map-terrain-clip") as HTMLElement) || null;
    this.img = (stageEl?.querySelector("#fleet-map-overview-img") as HTMLImageElement) || null;
  }

  destroy() {
    if (this._wheelBound && this.viewport) {
      this.viewport.removeEventListener("wheel", this._wheelBound);
    }
    if (this._pointerDown && this.viewport) {
      this.viewport.removeEventListener("pointerdown", this._pointerDown, true);
    }
    this._unbindWindowPan();
    this._wheelBound = null;
    this._pointerDown = null;
    this._pointerMove = null;
    this._pointerUp = null;
    this._drag = null;
    if (this._onLayout) {
      this._onLayout.disconnect();
    }
    this._onLayout = null;
  }

  bind() {
    if (!this.viewport || !this.transform) return;
    this.destroy();

    this._wheelBound = (ev) => this.onWheel(ev);
    this.viewport.addEventListener("wheel", this._wheelBound, { passive: false });

    this._pointerDown = (ev) => {
      if (ev.button !== 0) return;
      const hit = ev.target as Element | null;
      // Pins stay clickable. Field overlays cover most of the map — still allow pan.
      if (hit?.closest?.(".farm-fleet-map-pin, .farm-fleet-map-place")) return;
      this._panMoved = false;
      this._drag = {
        x: ev.clientX,
        y: ev.clientY,
        panX: this.panX,
        panY: this.panY,
      };
      this.viewport!.classList.add("farm-fleet-map-viewport--dragging");
      try {
        this.viewport!.setPointerCapture(ev.pointerId);
      } catch {
        /* SVG targets can refuse capture — window listeners still pan. */
      }
      window.addEventListener("pointermove", this._pointerMove!, { passive: false });
      window.addEventListener("pointerup", this._pointerUp!);
      window.addEventListener("pointercancel", this._pointerUp!);
    };
    this._pointerMove = (ev) => {
      if (!this._drag) return;
      ev.preventDefault();
      const dx = ev.clientX - this._drag.x;
      const dy = ev.clientY - this._drag.y;
      if (Math.hypot(dx, dy) > 4) {
        this._panMoved = true;
        this._userView = true;
      }
      this.panX = this._drag.panX + dx;
      this.panY = this._drag.panY + dy;
      this.applyTransform();
    };
    this._pointerUp = (ev) => {
      if (!this._drag) return;
      this._drag = null;
      this.viewport!.classList.remove("farm-fleet-map-viewport--dragging");
      this._unbindWindowPan();
      try {
        this.viewport!.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    };

    this.viewport.addEventListener("pointerdown", this._pointerDown, true);

    this._onLayout = new ResizeObserver(() => {
      this.syncCanvasSize();
      if (!this._userView && this.img && this.img.naturalWidth > 0) this.fitWholeImage();
    });
    this._onLayout.observe(this.viewport);
  }

  setPinPoints(points: FleetMapPinPoint[] | null | undefined) {
    this._pinPoints = Array.isArray(points) ? points : [];
  }

  getCanvasSize(): { w: number; h: number } {
    const w =
      Number(this.terrainClip?.clientWidth) ||
      Number(this.canvas?.clientWidth) ||
      Number(this.img?.naturalWidth) ||
      0;
    const h =
      Number(this.terrainClip?.clientHeight) ||
      Number(this.canvas?.clientHeight) ||
      Number(this.img?.naturalHeight) ||
      0;
    return { w, h };
  }

  syncCanvasSize() {
    if (!this.canvas) return;
    const { w, h } = this.getCanvasSize();
    if (!w || !h) return;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  applyTransform() {
    if (!this.transform) return;
    this.transform.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    this.onViewChange?.({
      scale: this.scale,
      fitScale: this.fitScale,
      namesUnlocked: this.namesUnlocked(),
    });
  }

  namesUnlocked(): boolean {
    const fit = this.fitScale > 0 ? this.fitScale : this.scale;
    return this.scale >= Math.max(fit * 1.85, 0.85);
  }

  /** True if the last pointer gesture panned the map (so overlay clicks should be ignored). */
  consumePan(): boolean {
    const moved = this._panMoved;
    this._panMoved = false;
    return moved;
  }

  hasUserView(): boolean {
    return this._userView;
  }

  private _unbindWindowPan() {
    if (this._pointerMove) {
      window.removeEventListener("pointermove", this._pointerMove);
    }
    if (this._pointerUp) {
      window.removeEventListener("pointerup", this._pointerUp);
      window.removeEventListener("pointercancel", this._pointerUp);
    }
  }

  viewportSize(): { w: number; h: number } {
    const r = this.viewport?.getBoundingClientRect();
    return { w: r?.width || 0, h: r?.height || 0 };
  }

  fitWholeImage() {
    const { w: iw, h: ih } = this.getCanvasSize();
    const { w: vw, h: vh } = this.viewportSize();
    if (!iw || !ih || !vw || !vh) return;
    this._userView = false;
    this.scale = Math.min(vw / iw, vh / ih) * 0.96;
    this.panX = (vw - iw * this.scale) / 2;
    this.panY = (vh - ih * this.scale) / 2;
    this.fitScale = this.scale;
    this.applyTransform();
  }

  fitToPins(padding = 0.15) {
    const { w: iw, h: ih } = this.getCanvasSize();
    const { w: vw, h: vh } = this.viewportSize();
    if (!iw || !ih || !vw || !vh) return this.fitWholeImage();
    if (!this._pinPoints.length) return this.fitWholeImage();

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this._pinPoints) {
      const px = (Number(p.left) / 100) * iw;
      const py = (Number(p.top) / 100) * ih;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    if (!Number.isFinite(minX)) return this.fitWholeImage();

    const padX = Math.max(40, (maxX - minX) * padding);
    const padY = Math.max(40, (maxY - minY) * padding);
    minX = Math.max(0, minX - padX);
    minY = Math.max(0, minY - padY);
    maxX = Math.min(iw, maxX + padX);
    maxY = Math.min(ih, maxY + padY);

    const boxW = Math.max(80, maxX - minX);
    const boxH = Math.max(80, maxY - minY);
    this.scale = clamp(Math.min(vw / boxW, vh / boxH) * 0.92, this.minScale, this.maxScale);
    this._userView = true;
    this.panX = (vw - boxW * this.scale) / 2 - minX * this.scale;
    this.panY = (vh - boxH * this.scale) / 2 - minY * this.scale;
    this.applyTransform();
  }

  zoomBy(factor: number) {
    const { w: vw, h: vh } = this.viewportSize();
    const cx = vw / 2;
    const cy = vh / 2;
    this.zoomAt(cx, cy, factor);
  }

  zoomAt(clientX: number, clientY: number, factor: number) {
    if (!this.viewport) return;
    const rect = this.viewport.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const worldX = (mx - this.panX) / this.scale;
    const worldY = (my - this.panY) / this.scale;
    const next = clamp(this.scale * factor, this.minScale, this.maxScale);
    this.panX = mx - worldX * next;
    this.panY = my - worldY * next;
    this.scale = next;
    this._userView = true;
    this.applyTransform();
  }

  fitToPoint(leftPct: number, topPct: number, zoomScale = 2.5) {
    const { w: iw, h: ih } = this.getCanvasSize();
    const { w: vw, h: vh } = this.viewportSize();
    if (!iw || !ih || !vw || !vh) return;
    const px = (Number(leftPct) / 100) * iw;
    const py = (Number(topPct) / 100) * ih;
    this.scale = clamp(zoomScale, this.minScale, this.maxScale);
    this.panX = vw / 2 - px * this.scale;
    this.panY = vh / 2 - py * this.scale;
    this._userView = true;
    this.applyTransform();
  }

  onWheel(ev: WheelEvent) {
    ev.preventDefault();
    const factor = ev.deltaY > 0 ? 0.9 : 1.1;
    this.zoomAt(ev.clientX, ev.clientY, factor);
  }
}
