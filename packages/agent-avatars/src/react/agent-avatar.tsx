import {
  memo,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
  type Ref,
} from "react";

import { hashSeed } from "../config/generate.ts";
import type { AmbientLevel, Mood, World } from "../config/presets.ts";
import { type AvatarConfig, type Palette } from "../config/resolve.ts";
import { AvatarController, type ControllerInput, type Environment } from "../motion/controller.ts";
import { VIEW_BOX } from "../motion/frame.ts";
import { useAvatarModel, useControllerSync, type AgentAvatarHandle } from "../render/hooks.ts";
import { gradients, LAYERS } from "../render/paint.ts";
import { acquirePageSignals, pageSignals } from "../runtime/page-signals.ts";
import { avatarStride, subscribeFrames, type FrameTask } from "../runtime/ticker.ts";
import { observeVisibility } from "../runtime/visibility.ts";
import { collectNodes, FrameWriter } from "./frame-writer.ts";
import { readLook, type LookOptions, type LookTarget } from "./look.ts";

export interface AgentAvatarProps extends Partial<AvatarConfig> {
  mood?: Mood;
  /** `floor` stands it on a surface with a shadow; `space` floats it in 3D. */
  world?: World;
  /** Unprompted actions: `lively` spins and flies, `subtle` only winks and glances, `off` none. */
  ambient?: AmbientLevel;
  /** Width and height in px. */
  size?: number;
  /** `false` holds a still pose. Reduced motion does the same. */
  animated?: boolean;
  /** Hovering gets its attention, a poke squashes it, and stroking makes it happy. */
  interactive?: boolean;
  /** While waiting, ms of page inactivity before it gets drowsy. 0 never sleeps. */
  sleepAfter?: number;
  /** Ms it stays drowsy before it falls asleep. */
  drowsyFor?: number;
  /** Follow the pointer within this many px (`true` is 240). */
  followPointer?: boolean | number;
  /** Look at whatever has keyboard focus until the pointer moves. */
  followFocus?: boolean;
  /** Look at an element or viewport point. Wins over the pointer and focus. */
  lookAt?: LookTarget | null;
  /** Chatter as if talking, for example while a reply streams in. */
  speaking?: boolean;
  /** Speech loudness from 0 to 1, for example from text-to-speech audio. */
  level?: number;
  /** A thin edge for dark backgrounds: `true` or any CSS colour. */
  outline?: boolean | string;
  /** Accessible name. Without it the avatar is decorative. */
  label?: string;
  /** Desynchronises blinks and glances. Defaults to a per-instance id. */
  seed?: string | number;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<AgentAvatarHandle>;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

let reducedMotionQuery: MediaQueryList | null = null;
const reducedMotionList = () => (reducedMotionQuery ??= window.matchMedia(REDUCED_MOTION));

function subscribeReducedMotion(onChange: () => void) {
  const query = reducedMotionList();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const prefersReducedMotion = () => reducedMotionList().matches;

interface LiveOptions extends LookOptions {
  input: ControllerInput;
  palette: Palette;
  outline: string | null;
  live: boolean;
  size: number;
  seed: string | number;
}

function localPoint(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
  };
}

const DEFAULT_OUTLINE = "var(--agent-avatar-outline, rgba(255, 255, 255, 0.32))";

function AgentAvatarView(props: AgentAvatarProps) {
  const {
    size = 32,
    interactive = false,
    followPointer = false,
    followFocus = false,
    lookAt = null,
    outline = false,
    label,
    seed,
    className,
    style,
    ref,
  } = props;
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );
  const model = useAvatarModel(props, reducedMotion);
  const { palette, input, id, live } = model;
  const outlineColor = outline === true ? DEFAULT_OUTLINE : outline || null;

  const svgRef = useRef<SVGSVGElement>(null);
  const controllerRef = useRef<AvatarController | null>(null);
  const refreshRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef<LiveOptions | null>(null);

  useLayoutEffect(() => {
    optionsRef.current = {
      input,
      palette,
      outline: outlineColor,
      live,
      size,
      seed: seed ?? id,
      lookAt,
      followPointer,
      followFocus,
    };
  });

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const initial = optionsRef.current;
    if (!svg || !initial) return;
    const options = () => optionsRef.current ?? initial;
    const controller = new AvatarController(
      hashSeed(initial.seed),
      initial.input,
      performance.now(),
    );
    controllerRef.current = controller;
    const writer = new FrameWriter(collectNodes(svg), `url(#${id}-eye)`);
    const env: Environment = { lastActivity: performance.now(), look: null };
    const releaseSignals = acquirePageSignals();

    const render = (now: number, still: boolean) => {
      const o = options();
      env.lastActivity = pageSignals().lastActivity;
      const frame = still ? controller.still(now, env) : controller.frame(now, env);
      writer.write(frame, o.palette, o.outline);
    };

    const task: FrameTask = {
      phase: hashSeed(initial.seed) % 2,
      every: (running) => avatarStride(options().size, running),
      read: () => {
        env.look = readLook(svg, options());
      },
      write: (now) => render(now, false),
    };

    let visible = true;
    let unsubscribe: (() => void) | null = null;
    const refresh = () => {
      const running = visible && options().live;
      if (running && !unsubscribe) unsubscribe = subscribeFrames(task);
      if (!running && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (!options().live) render(performance.now(), true);
    };
    refreshRef.current = refresh;

    render(performance.now(), true);
    const unobserve = observeVisibility(svg, (isVisible) => {
      visible = isVisible;
      refresh();
    });
    refresh();

    return () => {
      unobserve();
      unsubscribe?.();
      releaseSignals();
      controllerRef.current = null;
      refreshRef.current = null;
    };
  }, [id]);

  useControllerSync(ref, controllerRef, refreshRef, model);
  useLayoutEffect(() => {
    refreshRef.current?.();
  }, [palette, outlineColor]);
  const pointerHandlers = interactive
    ? {
        onPointerMove: (event: PointerEvent<HTMLSpanElement>) =>
          controllerRef.current?.setHover(localPoint(event), performance.now()),
        onPointerLeave: () => controllerRef.current?.setHover(null, performance.now()),
        onPointerDown: (event: PointerEvent<HTMLSpanElement>) => {
          const point = localPoint(event);
          controllerRef.current?.poke(point.x, point.y, performance.now());
        },
      }
    : {};

  return (
    <span
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
        contain: "layout style",
        cursor: interactive ? "pointer" : undefined,
        touchAction: interactive ? "manipulation" : undefined,
        userSelect: "none",
        ...style,
      }}
      {...pointerHandlers}
    >
      <svg
        ref={svgRef}
        viewBox={VIEW_BOX}
        width={size}
        height={size}
        style={{ display: "block", overflow: "visible", width: size, height: size }}
      >
        <defs>
          {gradients(palette).map((gradient) => {
            const stops = gradient.stops.map((stop) => (
              <stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
                stopOpacity={stop.opacity}
              />
            ));
            const gradientId = `${id}-${gradient.name}`;
            return gradient.kind === "linear" ? (
              <linearGradient
                key={gradient.name}
                id={gradientId}
                x1={gradient.x1}
                y1={gradient.y1}
                x2={gradient.x2}
                y2={gradient.y2}
              >
                {stops}
              </linearGradient>
            ) : (
              <radialGradient key={gradient.name} id={gradientId}>
                {stops}
              </radialGradient>
            );
          })}
          <clipPath id={`${id}-clip`}>
            <path data-part="clip" />
          </clipPath>
        </defs>
        <ellipse data-part="shadow" fill={`url(#${id}-shadow)`} />
        <g data-part="group">
          <path data-part="body" fill={`url(#${id}-fill)`} />
          <g clipPath={`url(#${id}-clip)`}>
            <circle data-part="light" r={LAYERS.lightRadius} fill={`url(#${id}-light)`} />
            <ellipse
              data-part="bounce"
              rx={LAYERS.bounce.rx}
              ry={LAYERS.bounce.ry}
              fill={`url(#${id}-bounce)`}
            />
            <ellipse
              data-part="spec"
              rx={LAYERS.spec.rx}
              ry={LAYERS.spec.ry}
              fill={`url(#${id}-spec)`}
            />
          </g>
          <path
            data-part="outline"
            fill="none"
            strokeWidth={LAYERS.outlineWidth}
            vectorEffect="non-scaling-stroke"
          />
          {[0, 1].map((i) => (
            <ellipse key={`cheek-${i}`} data-part="cheek" fill={`url(#${id}-blush)`} opacity={0} />
          ))}
          {[0, 1].map((i) => (
            <g key={`eye-${i}`}>
              <path
                data-part="eye-shadow"
                transform={`translate(0 ${LAYERS.eyeShadowOffset})`}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path data-part="eye" strokeLinecap="round" strokeLinejoin="round" />
              <circle data-part="glint" fill="#fff" />
            </g>
          ))}
        </g>
        {[0, 1, 2].map((i) => (
          <path
            key={`particle-${i}`}
            data-part="particle"
            opacity={0}
            strokeWidth={LAYERS.particleStrokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </span>
  );
}

export const AgentAvatar = memo(AgentAvatarView);
