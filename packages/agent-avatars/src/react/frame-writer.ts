import type { Palette } from "../config/resolve.ts";
import type { EyeFrame, Frame, ParticleFrame } from "../motion/frame.ts";
import { LAYERS, PARTICLES } from "../render/paint.ts";

interface EyeNodes {
  shadow: SVGPathElement;
  eye: SVGPathElement;
  glint: SVGCircleElement;
}

interface AvatarNodes {
  group: SVGGElement;
  body: SVGPathElement;
  clip: SVGPathElement;
  outline: SVGPathElement;
  light: SVGCircleElement;
  spec: SVGEllipseElement;
  bounce: SVGEllipseElement;
  shadow: SVGEllipseElement;
  eyes: EyeNodes[];
  cheeks: SVGEllipseElement[];
  particles: SVGPathElement[];
}

type ElementType<T extends Element> = abstract new () => T;

function all<T extends Element>(svg: SVGSVGElement, part: string, type: ElementType<T>): T[] {
  return Array.from(svg.querySelectorAll(`[data-part="${part}"]`)).filter(
    (el): el is T => el instanceof type,
  );
}

function one<T extends Element>(svg: SVGSVGElement, part: string, type: ElementType<T>): T {
  const el = all(svg, part, type).at(0);
  if (!el) throw new Error(`Agent avatar markup is missing "${part}".`);
  return el;
}

export function collectNodes(svg: SVGSVGElement): AvatarNodes {
  const eyeShadows = all(svg, "eye-shadow", SVGPathElement);
  const glints = all(svg, "glint", SVGCircleElement);
  return {
    group: one(svg, "group", SVGGElement),
    body: one(svg, "body", SVGPathElement),
    clip: one(svg, "clip", SVGPathElement),
    outline: one(svg, "outline", SVGPathElement),
    light: one(svg, "light", SVGCircleElement),
    spec: one(svg, "spec", SVGEllipseElement),
    bounce: one(svg, "bounce", SVGEllipseElement),
    shadow: one(svg, "shadow", SVGEllipseElement),
    eyes: all(svg, "eye", SVGPathElement).flatMap((eye, i) => {
      const shadow = eyeShadows.at(i);
      const glint = glints.at(i);
      return shadow && glint ? [{ eye, shadow, glint }] : [];
    }),
    cheeks: all(svg, "cheek", SVGEllipseElement),
    particles: all(svg, "particle", SVGPathElement),
  };
}

/** Writes frames straight to the SVG, skipping attributes that did not change. */
export class FrameWriter {
  private readonly nodes: AvatarNodes;
  private readonly eyeFill: string;
  private readonly cache = new Map<Element, Record<string, string>>();

  /** `eyeFill` paints filled eyes, such as `url(#id-eye)`. */
  constructor(nodes: AvatarNodes, eyeFill: string) {
    this.nodes = nodes;
    this.eyeFill = eyeFill;
  }

  private set(el: Element, attrs: Record<string, string | number>) {
    let seen = this.cache.get(el);
    if (!seen) {
      seen = {};
      this.cache.set(el, seen);
    }
    for (const name in attrs) {
      const value = String(attrs[name]);
      if (seen[name] !== value) {
        seen[name] = value;
        el.setAttribute(name, value);
      }
    }
  }

  /** `outline` is a CSS colour, or `null` for none. */
  write(frame: Frame, palette: Palette, outline: string | null): void {
    const n = this.nodes;
    this.set(n.group, { transform: frame.transform });
    this.set(n.body, { d: frame.body });
    this.set(n.clip, { d: frame.body });
    this.set(n.outline, { d: outline ? frame.body : "" });
    n.outline.style.stroke = outline ?? "none";
    this.set(n.light, { cx: frame.light.x, cy: frame.light.y });
    this.set(n.spec, {
      transform: `translate(${frame.spec.x} ${frame.spec.y}) rotate(${LAYERS.spec.rotate})`,
    });
    this.set(n.bounce, { cx: frame.bounce.x, cy: frame.bounce.y });
    const s = frame.shadow;
    this.set(n.shadow, { cx: s.cx, cy: s.cy, rx: s.rx, ry: s.ry, opacity: s.opacity });

    n.eyes.forEach((nodes, i) => {
      const eye = frame.eyes.at(i);
      if (eye) this.writeEye(nodes, eye, palette);
    });
    n.cheeks.forEach((node, i) => {
      const cheek = frame.cheeks.at(i);
      if (cheek)
        this.set(node, {
          cx: cheek.x,
          cy: cheek.y,
          rx: cheek.rx,
          ry: cheek.ry,
          opacity: cheek.opacity,
        });
    });
    n.particles.forEach((node, i) => {
      const particle = frame.particles.at(i);
      if (particle) this.writeParticle(node, particle);
      else this.set(node, { opacity: 0 });
    });
  }

  private writeEye(nodes: EyeNodes, eye: EyeFrame, palette: Palette) {
    const paint = eye.stroked
      ? { fill: "none", stroke: palette.eye, "stroke-width": eye.strokeWidth }
      : { fill: this.eyeFill, stroke: "none", "stroke-width": 0 };
    this.set(nodes.eye, { d: eye.d, opacity: eye.opacity, ...paint });
    this.set(nodes.shadow, {
      d: eye.d,
      opacity: eye.opacity * LAYERS.eyeShadowOpacity,
      fill: eye.stroked ? "none" : "#000",
      stroke: eye.stroked ? "#000" : "none",
      "stroke-width": eye.strokeWidth,
    });
    const g = eye.glint;
    this.set(nodes.glint, { cx: g.x, cy: g.y, r: g.r, opacity: g.opacity * eye.opacity });
  }

  private writeParticle(node: SVGPathElement, particle: ParticleFrame) {
    const style = PARTICLES[particle.kind];
    this.set(node, {
      d: style.d,
      fill: style.stroked ? "none" : style.color,
      stroke: style.stroked ? style.color : "none",
      opacity: particle.opacity,
      transform: `translate(${particle.x.toFixed(2)} ${particle.y.toFixed(2)}) rotate(${particle.rotate.toFixed(1)}) scale(${particle.scale.toFixed(2)})`,
    });
  }
}
