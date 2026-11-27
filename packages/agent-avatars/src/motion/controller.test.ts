import { AvatarController, type ControllerInput, type Environment } from "./controller.ts";
import { describe, expect, test } from "bun:test";

const INPUT: ControllerInput = {
  mood: "waiting",
  body: "circle",
  eyes: "round",
  world: "floor",
  ambient: "lively",
  sleepAfter: 1000,
  drowsyFor: 500,
  speaking: false,
  level: null,
};

const env = (lastActivity: number): Environment => ({ lastActivity, look: null });

describe("sleep", () => {
  test("gets drowsy after the idle time, then falls asleep", () => {
    const avatar = new AvatarController(1, INPUT, 0);
    avatar.frame(900, env(0));
    expect(avatar.currentMood).toBe("waiting");
    avatar.frame(1100, env(0));
    expect(avatar.currentMood).toBe("drowsy");
    avatar.frame(1600, env(0));
    expect(avatar.currentMood).toBe("asleep");
  });

  test("page activity wakes it", () => {
    const avatar = new AvatarController(1, INPUT, 0);
    avatar.frame(1600, env(0));
    avatar.frame(1700, env(1650));
    expect(avatar.currentMood).toBe("waiting");
  });

  test("only sleeps while waiting", () => {
    const avatar = new AvatarController(1, { ...INPUT, mood: "working" }, 0);
    avatar.frame(5000, env(0));
    expect(avatar.currentMood).toBe("working");
  });

  test("never sleeps when sleepAfter is 0", () => {
    const avatar = new AvatarController(1, { ...INPUT, sleepAfter: 0 }, 0);
    avatar.frame(60_000, env(0));
    expect(avatar.currentMood).toBe("waiting");
  });
});

describe("pokes", () => {
  test("one poke cheers it up for a moment, then it goes back to its mood", () => {
    const avatar = new AvatarController(1, { ...INPUT, sleepAfter: 0 }, 0);
    avatar.poke(0.2, -0.3, 100);
    avatar.frame(700, env(0));
    expect(avatar.currentMood).toBe("happy");
    avatar.frame(2000, env(0));
    expect(avatar.currentMood).toBe("waiting");
  });

  test("rapid pokes make it dizzy", () => {
    const avatar = new AvatarController(1, { ...INPUT, sleepAfter: 0 }, 0);
    for (const time of [100, 300, 500, 700]) avatar.poke(0, 0, time);
    avatar.frame(800, env(0));
    expect(avatar.currentMood).toBe("dizzy");
  });
});

describe("stroking", () => {
  test("a quick back-and-forth over it makes it happy", () => {
    const avatar = new AvatarController(1, { ...INPUT, sleepAfter: 0 }, 0);
    [-0.5, 0.5, -0.5, 0.5, -0.5].forEach((x, i) => avatar.setHover({ x, y: 0 }, i * 100));
    avatar.frame(500, env(0));
    expect(avatar.currentMood).toBe("happy");
  });
});

describe("frames", () => {
  test("turning the head fully around hides the eyes", () => {
    const avatar = new AvatarController(1, { ...INPUT, sleepAfter: 0 }, 0);
    avatar.play("spin", 0);
    const halfway = avatar.frame(640, env(0));
    const facing = new AvatarController(1, { ...INPUT, sleepAfter: 0 }, 0).still(0, env(0));
    expect(Math.max(...halfway.eyes.map((eye) => eye.opacity))).toBeLessThan(0.2);
    expect(Math.min(...facing.eyes.map((eye) => eye.opacity))).toBe(1);
  });
});

const awake: ControllerInput = { ...INPUT, sleepAfter: 0 };
const eyesVisible = (frame: { eyes: { opacity: number }[] }) =>
  Math.max(...frame.eyes.map((eye) => eye.opacity));
const scaleOf = (frame: { transform: string }) =>
  Number(/scale\(([-\d.]+)/.exec(frame.transform)?.[1]);

describe("transitions", () => {
  test("a body change morphs the outline only while the face is turned away", () => {
    const avatar = new AvatarController(1, awake, 0);
    const before = avatar.frame(16, env(0)).body;
    avatar.update({ ...awake, body: "hexagon" }, 100);
    let morphing = 0;
    let morphedInView = 0;
    for (let now = 116; now < 1400; now += 16) {
      const frame = avatar.frame(now, env(0));
      if (frame.body === before) continue;
      morphing++;
      if (eyesVisible(frame) > 0.2) morphedInView++;
      if (frame.body === avatar.frame(now + 16, env(0)).body) break;
    }
    expect(morphing).toBeGreaterThan(5);
    expect(morphedInView).toBe(0);
  });

  test("a new mood plays a motion into it", () => {
    const avatar = new AvatarController(1, awake, 0);
    avatar.frame(16, env(0));
    avatar.update({ ...awake, mood: "happy" }, 100);
    const lowest = Math.min(
      ...Array.from({ length: 40 }, (_, i) => eyesVisible(avatar.frame(116 + i * 16, env(0)))),
    );
    // The spin into "happy" turns the face out of sight for a moment.
    expect(lowest).toBeLessThan(0.2);
  });
});

describe("space", () => {
  test("floats around with no shadow, while the floor version casts one", () => {
    const floating = new AvatarController(1, { ...awake, world: "space" }, 0);
    const early = floating.frame(1000, env(0));
    const later = floating.frame(3000, env(0));
    expect(later.transform).not.toBe(early.transform);
    expect(later.shadow.opacity).toBe(0);
    expect(new AvatarController(1, awake, 0).frame(1000, env(0)).shadow.opacity).toBeGreaterThan(0);
  });

  test("a swoop comes up close, then pulls back into the distance", () => {
    const avatar = new AvatarController(1, { ...awake, world: "space" }, 0);
    avatar.frame(0, env(0));
    avatar.play("swoop", 0);
    const close = scaleOf(avatar.frame(720, env(0)));
    const far = scaleOf(avatar.frame(1584, env(0)));
    expect(close).toBeGreaterThan(1.25);
    expect(far).toBeLessThan(0.9);
  });
});

describe("ambient", () => {
  // While searching, the only ambient action is a spin, which turns the face out of sight.
  const hidesFaceWhileSearching = (ambient: ControllerInput["ambient"]) => {
    const avatar = new AvatarController(3, { ...awake, mood: "searching", ambient }, 0);
    for (let now = 0; now < 30_000; now += 16) {
      if (eyesVisible(avatar.frame(now, env(now))) < 0.2) return true;
    }
    return false;
  };

  test("lively avatars spin on their own", () => {
    expect(hidesFaceWhileSearching("lively")).toBe(true);
  });

  test("subtle and off avatars never spin unprompted", () => {
    expect(hidesFaceWhileSearching("subtle")).toBe(false);
    expect(hidesFaceWhileSearching("off")).toBe(false);
  });
});

describe("still frames", () => {
  test("a body change shows the new body at once", () => {
    const avatar = new AvatarController(1, awake, 0);
    const circle = avatar.still(0, env(0)).body;
    avatar.update({ ...awake, body: "hexagon" }, 10);
    const hexagon = new AvatarController(1, { ...awake, body: "hexagon" }, 0).still(0, env(0)).body;
    expect(avatar.still(20, env(0)).body).toBe(hexagon);
    expect(hexagon).not.toBe(circle);
  });
});
