import { memo, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { View, type GestureResponderEvent } from "react-native";

import { hashSeed } from "../config/generate.ts";
import type { Palette } from "../config/resolve.ts";
import { AvatarController, type ControllerInput, type Environment } from "../motion/controller.ts";
import { VIEW_BOX, type EyeFrame, type Frame, type ParticleFrame } from "../motion/frame.ts";
import { compose, rotation, scaling, translation, type Matrix } from "../motion/matrix.ts";
import { useAvatarModel, useControllerSync } from "../render/hooks.ts";
import { gradients, LAYERS, PARTICLES } from "../render/paint.ts";
import { avatarStride, subscribeFrames, type FrameTask } from "../runtime/ticker.ts";
import { appSignals, noteActivity, reduceMotion, subscribeAppSignals } from "./app-signals.ts";
import { DEFAULT_OUTLINE, useMarkColor, type NativeAgentAvatarProps } from "./props.ts";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

/**
 * Drawing on React Native
 *
 * Frames reach the SVG through React state, not `setNativeProps`. react-native-svg's
 * `setNativeProps` skips most of its prop processing: it converts brushes, and transforms only on
 * `G`, so every other value must already be in the native prop format. Values set that way also
 * sit outside React, which can write its own props over them on a later commit. React updates go
 * through react-native-svg's normal prop handling and are always consistent. This choice is not
 * measured on a device yet; profile a long list of avatars before you change it.
 *
 * To keep that cheap:
 * - Every avatar shares one frame loop (`subscribeFrames`). All avatars that are due set their
 *   frame in the same animation frame, so React renders and commits them together.
 * - Each frame re-renders only the moving layers (about 20 elements). The wrapper, the `Svg` and
 *   the gradients do not re-render.
 * - Avatars of 32 px or less, and crowds of small ones, draw at 30 fps, as on the web.
 * - Drawing stops while the app is in the background, or when the avatar is still.
 */

interface FrameStore {
  get: () => Frame | null;
  set: (frame: Frame) => void;
  subscribe: (listener: () => void) => () => void;
}

function createFrameStore(): FrameStore {
  let frame: Frame | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => frame,
    set: (next) => {
      frame = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

interface LiveOptions {
  input: ControllerInput;
  live: boolean;
  size: number;
  seed: string | number;
}

const EYE_SHADOW: Matrix = translation(0, LAYERS.eyeShadowOffset);
const ROUND = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

const url = (id: string, name: string) => `url(#${id}-${name})`;

const AvatarGradients = memo(function AvatarGradients({
  id,
  palette,
}: {
  id: string;
  palette: Palette;
}) {
  return (
    <Defs>
      {gradients(palette).map((gradient) => {
        const stops = gradient.stops.map((stop) => (
          <Stop
            key={stop.offset}
            offset={stop.offset}
            stopColor={stop.color}
            stopOpacity={stop.opacity}
          />
        ));
        const gradientId = `${id}-${gradient.name}`;
        return gradient.kind === "linear" ? (
          <LinearGradient
            key={gradient.name}
            id={gradientId}
            x1={gradient.x1}
            y1={gradient.y1}
            x2={gradient.x2}
            y2={gradient.y2}
          >
            {stops}
          </LinearGradient>
        ) : (
          <RadialGradient key={gradient.name} id={gradientId}>
            {stops}
          </RadialGradient>
        );
      })}
    </Defs>
  );
});

function Eye({ eye, id, palette }: { eye: EyeFrame; id: string; palette: Palette }) {
  const glint = eye.glint;
  return (
    <>
      <Path
        d={eye.d}
        transform={EYE_SHADOW}
        opacity={eye.opacity * LAYERS.eyeShadowOpacity}
        fill={eye.stroked ? "none" : "#000"}
        stroke={eye.stroked ? "#000" : "none"}
        strokeWidth={eye.strokeWidth}
        {...ROUND}
      />
      <Path
        d={eye.d}
        opacity={eye.opacity}
        fill={eye.stroked ? "none" : url(id, "eye")}
        stroke={eye.stroked ? palette.eye : "none"}
        strokeWidth={eye.strokeWidth}
        {...ROUND}
      />
      <Circle
        cx={glint.x}
        cy={glint.y}
        r={glint.r}
        opacity={glint.opacity * eye.opacity}
        fill="#fff"
      />
    </>
  );
}

function Particle({ particle }: { particle: ParticleFrame | undefined }) {
  if (!particle) return <Path d="" opacity={0} />;
  const style = PARTICLES[particle.kind];
  return (
    <Path
      d={style.d}
      opacity={particle.opacity}
      fill={style.stroked ? "none" : style.color}
      stroke={style.stroked ? style.color : "none"}
      strokeWidth={LAYERS.particleStrokeWidth}
      transform={compose(
        translation(particle.x, particle.y),
        rotation(particle.rotate),
        scaling(particle.scale),
      )}
      {...ROUND}
    />
  );
}

interface LayersProps {
  store: FrameStore;
  id: string;
  palette: Palette;
  outline: string | null;
}

/** The moving layers. Only this re-renders on each frame. */
function Layers({ store, id, palette, outline }: LayersProps) {
  const frame = useSyncExternalStore(store.subscribe, store.get, store.get);
  if (!frame) return null;
  const { shadow, spec } = frame;
  return (
    <>
      <Defs>
        <ClipPath id={`${id}-clip`}>
          <Path d={frame.body} />
        </ClipPath>
      </Defs>
      <Ellipse
        cx={shadow.cx}
        cy={shadow.cy}
        rx={shadow.rx}
        ry={shadow.ry}
        opacity={shadow.opacity}
        fill={url(id, "shadow")}
      />
      <G transform={frame.matrix}>
        <Path d={frame.body} fill={url(id, "fill")} />
        <G clipPath={url(id, "clip")}>
          <Circle
            cx={frame.light.x}
            cy={frame.light.y}
            r={LAYERS.lightRadius}
            fill={url(id, "light")}
          />
          <Ellipse
            cx={frame.bounce.x}
            cy={frame.bounce.y}
            rx={LAYERS.bounce.rx}
            ry={LAYERS.bounce.ry}
            fill={url(id, "bounce")}
          />
          <Ellipse
            rx={LAYERS.spec.rx}
            ry={LAYERS.spec.ry}
            transform={compose(translation(spec.x, spec.y), rotation(LAYERS.spec.rotate))}
            fill={url(id, "spec")}
          />
        </G>
        {outline ? (
          <Path
            d={frame.body}
            fill="none"
            stroke={outline}
            strokeWidth={LAYERS.outlineWidth}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {[0, 1].map((i) => {
          const cheek = frame.cheeks.at(i);
          return cheek ? (
            <Ellipse
              key={`cheek-${i}`}
              cx={cheek.x}
              cy={cheek.y}
              rx={cheek.rx}
              ry={cheek.ry}
              opacity={cheek.opacity}
              fill={url(id, "blush")}
            />
          ) : null;
        })}
        <Eye eye={frame.eyes[0]} id={id} palette={palette} />
        <Eye eye={frame.eyes[1]} id={id} palette={palette} />
      </G>
      {[0, 1, 2].map((i) => (
        <Particle key={`particle-${i}`} particle={frame.particles.at(i)} />
      ))}
    </>
  );
}

function AgentAvatarView(props: NativeAgentAvatarProps) {
  const {
    size = 32,
    interactive = false,
    outline = false,
    markColor,
    label,
    seed,
    style,
    ref,
  } = props;
  const reducedMotion = useSyncExternalStore(subscribeAppSignals, reduceMotion, reduceMotion);
  const model = useAvatarModel(props, reducedMotion);
  const { palette, input, id, live } = model;
  const outlineColor = outline === true ? DEFAULT_OUTLINE : outline || null;
  const ink = useMarkColor(markColor);

  const [store] = useState(createFrameStore);
  const controllerRef = useRef<AvatarController | null>(null);
  const refreshRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef<LiveOptions | null>(null);

  useLayoutEffect(() => {
    optionsRef.current = { input, live, size, seed: seed ?? id };
  });

  useLayoutEffect(() => {
    const initial = optionsRef.current;
    if (!initial) return;
    const options = () => optionsRef.current ?? initial;
    const seedNumber = hashSeed(initial.seed);
    const controller = new AvatarController(seedNumber, initial.input, performance.now());
    controllerRef.current = controller;
    const env: Environment = { lastActivity: performance.now(), look: null };

    const render = (still: boolean) => {
      const now = performance.now();
      env.lastActivity = appSignals().lastActivity;
      store.set(still ? controller.still(now, env) : controller.frame(now, env));
    };

    const task: FrameTask = {
      phase: seedNumber % 2,
      every: (running) => avatarStride(options().size, running),
      write: () => render(false),
    };

    let unsubscribe: (() => void) | null = null;
    const refresh = () => {
      const running = appSignals().foreground && options().live;
      if (running && !unsubscribe) unsubscribe = subscribeFrames(task);
      if (!running && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (!options().live) render(true);
    };
    refreshRef.current = refresh;

    render(true);
    const unsubscribeSignals = subscribeAppSignals(refresh);
    refresh();

    return () => {
      unsubscribeSignals();
      unsubscribe?.();
      controllerRef.current = null;
      refreshRef.current = null;
    };
  }, [id, store]);

  useControllerSync(ref, controllerRef, refreshRef, model);
  const point = (event: GestureResponderEvent) => ({
    x: (event.nativeEvent.locationX / size) * 2 - 1,
    y: (event.nativeEvent.locationY / size) * 2 - 1,
  });
  const release = () => controllerRef.current?.setHover(null, performance.now());
  const touchHandlers = interactive
    ? {
        onStartShouldSetResponder: () => true,
        // A scroll view that starts scrolling takes the touch over.
        onResponderTerminationRequest: () => true,
        onResponderGrant: (event: GestureResponderEvent) => {
          noteActivity();
          const at = point(event);
          const now = performance.now();
          controllerRef.current?.setHover(at, now);
          controllerRef.current?.poke(at.x, at.y, now);
        },
        onResponderMove: (event: GestureResponderEvent) =>
          controllerRef.current?.setHover(point(event), performance.now()),
        onResponderRelease: release,
        onResponderTerminate: release,
      }
    : {};

  return (
    <View
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      accessible={Boolean(label)}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
      style={[{ width: size, height: size, flexShrink: 0, overflow: "visible" }, style]}
      {...touchHandlers}
    >
      <Svg
        width={size}
        height={size}
        viewBox={VIEW_BOX}
        color={ink}
        pointerEvents="none"
        style={{ overflow: "visible" }}
      >
        <AvatarGradients id={id} palette={palette} />
        <Layers store={store} id={id} palette={palette} outline={outlineColor} />
      </Svg>
    </View>
  );
}

/** Memoised: a parent re-render (for example a streaming chat) skips unchanged avatars. */
export const AgentAvatar = memo(AgentAvatarView);
