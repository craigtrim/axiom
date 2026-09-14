import { Draw, type Point, type Rect } from "./scene";
type VertexMode = "shape" | "text";
const vertexSource = `#version 300 es
in vec2 a_position;
in vec4 a_color;
in vec2 a_uv;
uniform vec2 u_resolution;
out vec4 v_color;
out vec2 v_uv;
void main(){gl_Position=vec4(a_position/u_resolution*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);v_color=a_color;v_uv=a_uv;}
`;
const fragmentSource = `#version 300 es
precision mediump float;
in vec4 v_color;
in vec2 v_uv;
uniform sampler2D u_atlas;
uniform bool u_text;
out vec4 outputColor;
void main(){if(!u_text&&v_uv.y>0.5&&mod(v_uv.x,7.)>4.)discard;outputColor=u_text?texture(u_atlas,v_uv)*v_color:v_color;}
`;
/** Batches screen-space triangles and a shared text atlas. SVG uses Draw directly. */
export class GpuDraw extends Draw {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private values = new Float32Array(262144);
  private used = 0;
  private atlasResets = 0;
  private atlasUploads = 0;
  private bufferCapacity = 0;
  private mode: VertexMode = "shape";
  private colors = new Map<string, number[]>();
  private atlas: HTMLCanvasElement;
  private atlasContext: CanvasRenderingContext2D;
  private texture: WebGLTexture;
  private atlasDirty = true;
  private atlasX = 1;
  private atlasY = 1;
  private rowHeight = 0;
  private atlasSize = 2048;
  private glyphs = new Map<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      textWidth: number;
      scale: number;
    }
  >();
  private resolution: WebGLUniformLocation | null;
  private textUniform: WebGLUniformLocation | null;
  private vao: WebGLVertexArrayObject;
  constructor(gl: WebGL2RenderingContext, width: number, height: number) {
    const atlas = document.createElement("canvas");
    atlas.width = atlas.height = 2048;
    const ctx = atlas.getContext("2d")!;
    super(null, width, height, ctx);
    this.gl = gl;
    this.atlas = atlas;
    this.atlasContext = ctx;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(s) ?? "Graph shader failed.");
      return s;
    };
    const vertex = shader(gl.VERTEX_SHADER, vertexSource),
      fragment = shader(gl.FRAGMENT_SHADER, fragmentSource),
      program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program) ?? "Graph renderer failed.");
    this.program = program;
    gl.useProgram(program);
    this.buffer = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const attribute = (name: string, size: number, offset: number) => {
      const id = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(id);
      gl.vertexAttribPointer(id, size, gl.FLOAT, false, 32, offset);
    };
    attribute("a_position", 2, 0);
    attribute("a_color", 4, 8);
    attribute("a_uv", 2, 24);
    this.resolution = gl.getUniformLocation(program, "u_resolution");
    this.textUniform = gl.getUniformLocation(program, "u_text");
    this.texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.atlasSize,
      this.atlasSize,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.uniform1i(gl.getUniformLocation(program, "u_atlas"), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  beginFrame() {
    const gl = this.gl;
    this.used = 0;
    this.mode = "shape";
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.resolution, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  endFrame() {
    this.flush();
    const d = (this.gl.canvas as HTMLCanvasElement).dataset;
    d.atlasResets = String(this.atlasResets);
    d.atlasUploads = String(this.atlasUploads);
    d.gpuCapacity = String(this.bufferCapacity);
    d.glyphs = String(this.glyphs.size);
  }
  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.buffer);
    gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    this.glyphs.clear();
  }
  override beginBatch() {}
  override endBatch() {}
  private flush() {
    if (!this.used) return;
    const gl = this.gl;
    if (this.mode === "text" && this.atlasDirty) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.atlas,
      );
      this.atlasDirty = false;
      this.atlasUploads++;
    }
    gl.uniform1i(this.textUniform, this.mode === "text" ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (this.bufferCapacity < this.values.byteLength) {
      this.bufferCapacity = this.values.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, this.bufferCapacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.values.subarray(0, this.used));
    gl.drawArrays(gl.TRIANGLES, 0, this.used / 8);
    this.used = 0;
  }
  private switch(mode: VertexMode) {
    if (mode !== this.mode) {
      this.flush();
      this.mode = mode;
    }
  }
  private color(value: string) {
    let c = this.colors.get(value);
    if (!c) {
      if (value.startsWith("#")) {
        const h = value.slice(1);
        c = [
          parseInt(h.slice(0, 2), 16) / 255,
          parseInt(h.slice(2, 4), 16) / 255,
          parseInt(h.slice(4, 6), 16) / 255,
          h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
        ];
      } else {
        const n = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
        c = [n[0] / 255, n[1] / 255, n[2] / 255, n[3] ?? 1];
      }
      this.colors.set(value, c);
    }
    return c;
  }
  private vertex(x: number, y: number, c: number[], u = 0, v = 0) {
    if (this.used % 24 === 0 && this.used >= 524280) this.flush();
    if (this.used + 8 > this.values.length) {
      const next = new Float32Array(this.values.length * 2);
      next.set(this.values);
      this.values = next;
    }
    const i = this.used;
    this.values[i] = x;
    this.values[i + 1] = y;
    this.values[i + 2] = c[0];
    this.values[i + 3] = c[1];
    this.values[i + 4] = c[2];
    this.values[i + 5] = c[3];
    this.values[i + 6] = u;
    this.values[i + 7] = v;
    this.used += 8;
  }
  private triangle(a: Point, b: Point, c: Point, color: number[]) {
    this.vertex(a.x, a.y, color);
    this.vertex(b.x, b.y, color);
    this.vertex(c.x, c.y, color);
  }
  private polygon(points: Point[], color: number[]) {
    for (let i = 1; i + 1 < points.length; i++)
      this.triangle(points[0], points[i], points[i + 1], color);
  }
  private segment(
    a: Point,
    b: Point,
    color: number[],
    stroke: number,
    phase?: number,
  ) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy);
    if (!length) return;
    const x = ((dy / length) * stroke) / 2,
      y = ((-dx / length) * stroke) / 2,
      u = phase ?? 0,
      v = phase === undefined ? 0 : 1,
      end = phase === undefined ? 0 : u + length;
    this.vertex(a.x + x, a.y + y, color, u, v);
    this.vertex(a.x - x, a.y - y, color, u, v);
    this.vertex(b.x + x, b.y + y, color, end, v);
    this.vertex(a.x - x, a.y - y, color, u, v);
    this.vertex(b.x - x, b.y - y, color, end, v);
    this.vertex(b.x + x, b.y + y, color, end, v);
  }
  override rect(r: Rect, color: string, radius = 0, stroke = 0) {
    this.switch("shape");
    const c = this.color(color),
      points: Point[] = [];
    radius = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
    if (radius < 0.5)
      points.push(
        { x: r.x, y: r.y },
        { x: r.x + r.width, y: r.y },
        { x: r.x + r.width, y: r.y + r.height },
        { x: r.x, y: r.y + r.height },
      );
    else {
      const centers = [
        [r.x + r.width - radius, r.y + radius],
        [r.x + r.width - radius, r.y + r.height - radius],
        [r.x + radius, r.y + r.height - radius],
        [r.x + radius, r.y + radius],
      ];
      centers.forEach(([x, y], corner) => {
        for (let j = 0; j <= 4; j++) {
          const a = -Math.PI / 2 + (corner * Math.PI) / 2 + (j * Math.PI) / 8;
          points.push({
            x: x + Math.cos(a) * radius,
            y: y + Math.sin(a) * radius,
          });
        }
      });
    }
    if (stroke)
      for (let i = 0; i < points.length; i++)
        this.segment(points[i], points[(i + 1) % points.length], c, stroke);
    else this.polygon(points, c);
  }
  override circle(p: Point, r: number, color: string, stroke = 0) {
    this.switch("shape");
    if (r <= 0) return;
    const c = this.color(color),
      count = Math.max(8, Math.min(96, Math.ceil(r * 2))),
      points: Point[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count;
      points.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r });
    }
    if (stroke)
      for (let i = 0; i < count; i++)
        this.segment(points[i], points[(i + 1) % count], c, stroke);
    else this.polygon(points, c);
  }
  override path(
    points: Point[],
    color: string,
    stroke = 1,
    fill = false,
    dashed = false,
    control?: Point,
  ) {
    if (!points.length) return;
    this.switch("shape");
    const c = this.color(color);
    if (control) {
      const a = points[0],
        b = points[1];
      points = Array.from({ length: 13 }, (_, i) => {
        const t = i / 12,
          u = 1 - t;
        return {
          x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
          y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
        };
      });
    }
    if (fill) {
      this.polygon(points, c);
      return;
    }
    let phase = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (!dashed) {
        this.segment(a, b, c, stroke);
        continue;
      }
      this.segment(a, b, c, stroke, phase);
      phase = (phase + Math.hypot(b.x - a.x, b.y - a.y)) % 7;
    }
  }
  override text(
    text: string,
    p: Point,
    color: string,
    size = 12,
    bold = false,
    centred = false,
    halo?: string,
  ) {
    this.switch("text");
    const scale = Math.max(
        1,
        Math.min(
          2,
          (this.gl.canvas as HTMLCanvasElement).ownerDocument.defaultView
            ?.devicePixelRatio ?? 1,
        ),
      ),
      key = [text, color, size, bold, halo, scale].join("|");
    let glyph = this.glyphs.get(key);
    if (!glyph) {
      const textWidth = this.measure(text, size, bold),
        width = Math.ceil((textWidth + 10) * scale),
        height = Math.ceil((size * 1.6 + 10) * scale);
      if (this.atlasX + width >= this.atlasSize) {
        this.atlasX = 1;
        this.atlasY += this.rowHeight + 1;
        this.rowHeight = 0;
      }
      if (this.atlasY + height >= this.atlasSize) {
        this.flush();
        this.atlasContext.clearRect(0, 0, this.atlasSize, this.atlasSize);
        this.atlasResets++;
        this.glyphs.clear();
        this.atlasX = this.atlasY = 1;
        this.rowHeight = 0;
      }
      const ctx = this.atlasContext;
      ctx.save();
      ctx.translate(this.atlasX, this.atlasY);
      ctx.scale(scale, scale);
      ctx.font = (bold ? "600 " : "400 ") + size + 'px "Segoe UI", sans-serif';
      ctx.textBaseline = "top";
      ctx.fillStyle = color;
      if (halo) {
        ctx.strokeStyle = halo;
        ctx.lineWidth = 3.5;
        ctx.lineJoin = "round";
        ctx.strokeText(text, 5, 5);
      }
      ctx.fillText(text, 5, 5);
      ctx.restore();
      glyph = {
        x: this.atlasX,
        y: this.atlasY,
        width,
        height,
        textWidth,
        scale,
      };
      this.atlasX += width + 1;
      this.rowHeight = Math.max(this.rowHeight, height);
      this.atlasDirty = true;
      this.glyphs.set(key, glyph);
    }
    const x = p.x - (centred ? glyph.textWidth / 2 : 0) - 5,
      y = p.y - 5,
      w = glyph.width / scale,
      h = glyph.height / scale,
      u = glyph.x / this.atlasSize,
      v = glyph.y / this.atlasSize,
      uw = glyph.width / this.atlasSize,
      vh = glyph.height / this.atlasSize,
      c = [1, 1, 1, 1];
    this.vertex(x, y, c, u, v);
    this.vertex(x + w, y, c, u + uw, v);
    this.vertex(x, y + h, c, u, v + vh);
    this.vertex(x + w, y, c, u + uw, v);
    this.vertex(x + w, y + h, c, u + uw, v + vh);
    this.vertex(x, y + h, c, u, v + vh);
  }
}
