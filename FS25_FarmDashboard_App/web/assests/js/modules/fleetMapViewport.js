// FS25 FarmDashboard | fleetMapViewport.js — pan/zoom map canvas (image + pins move together)

import { clamp } from "./fleetMapGeo.js";

export class FleetMapViewport {
  constructor(stageEl) {
    this.stage = stageEl;
    this.viewport = stageEl?.querySelector(".farm-fleet-map-viewport") || null;
    this.transform = stageEl?.querySelector(".farm-fleet-map-transform") || null;
    this.canvas = stageEl?.querySelector(".farm-fleet-map-canvas") || null;
    this.terrainClip = stageEl?.querySelector("#fleet-map-terrain-clip") || null;
    this.img = stageEl?.querySelector("#fleet-map-overview-img") || null;
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.minScale = 0.2;
    this.maxScale = 8;
    this._drag = null;
    this._wheelBound = null;
    this._pinPoints = [];
    this._onLayout = null;
  }

  destroy() {
    if (this._wheelBound && this.viewport) {
      this.viewport.removeEventListener("wheel", this._wheelBound);
    }
    this._wheelBound = null;
    this._drag = null;
    if (this._onLayout && this.viewport) {
      this._onLayout.disconnect();
    }
    this._onLayout = null;
  }

  bind() {
    if (!this.viewport || !this.transform) return;
    this.destroy();

    this._wheelBound = (ev) => this.onWheel(ev);
    this.viewport.addEventListener("wheel", this._wheelBound, { passive: false });

    this.viewport.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest(".farm-fleet-map-pin")) return;
      this._drag = {
        x: ev.clientX,
        y: ev.clientY,
        panX: this.panX,
        panY: this.panY,
      };
      this.viewport.setPointerCapture(ev.pointerId);
      this.viewport.classList.add("farm-fleet-map-viewport--dragging");
    });

    this.viewport.addEventListener("pointermove", (ev) => {
      if (!this._drag) return;
      this.panX = this._drag.panX + (ev.clientX - this._drag.x);
      this.panY = this._drag.panY + (ev.clientY - this._drag.y);
      this.applyTransform();
    });

    const endDrag = (ev) => {
      if (!this._drag) return;
      this._drag = null;
      this.viewport.classList.remove("farm-fleet-map-viewport--dragging");
      try {
        this.viewport.releasePointerCapture(ev.pointerId);
      } catch (_) {
        /* ignore */
      }
    };
    this.viewport.addEventListener("pointerup", endDrag);
    this.viewport.addEventListener("pointercancel", endDrag);

    this._onLayout = new ResizeObserver(() => {
      if (this.img?.naturalWidth > 0) this.fitWholeImage();
    });
    this._onLayout.observe(this.viewport);
  }

  setPinPoints(points) {
    this._pinPoints = Array.isArray(points) ? points : [];
  }

  getCanvasSize() {
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
  }

  viewportSize() {
    const r = this.viewport?.getBoundingClientRect();
    return { w: r?.width || 0, h: r?.height || 0 };
  }

  fitWholeImage() {
    const { w: iw, h: ih } = this.getCanvasSize();
    const { w: vw, h: vh } = this.viewportSize();
    if (!iw || !ih || !vw || !vh) return;
    this.scale = Math.min(vw / iw, vh / ih) * 0.96;
    this.panX = (vw - iw * this.scale) / 2;
    this.panY = (vh - ih * this.scale) / 2;
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
    this.panX = (vw - boxW * this.scale) / 2 - minX * this.scale;
    this.panY = (vh - boxH * this.scale) / 2 - minY * this.scale;
    this.applyTransform();
  }

  zoomBy(factor) {
    const { w: vw, h: vh } = this.viewportSize();
    const cx = vw / 2;
    const cy = vh / 2;
    this.zoomAt(cx, cy, factor);
  }

  zoomAt(clientX, clientY, factor) {
    const rect = this.viewport.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const worldX = (mx - this.panX) / this.scale;
    const worldY = (my - this.panY) / this.scale;
    const next = clamp(this.scale * factor, this.minScale, this.maxScale);
    this.panX = mx - worldX * next;
    this.panY = my - worldY * next;
    this.scale = next;
    this.applyTransform();
  }

  onWheel(ev) {
    ev.preventDefault();
    const factor = ev.deltaY > 0 ? 0.9 : 1.1;
    this.zoomAt(ev.clientX, ev.clientY, factor);
  }
}
