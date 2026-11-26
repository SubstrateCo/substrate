import { execFile } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface MotionFrame {
  path: string;
  elapsed: number;
}

/** Encode only frames received from the real Chromium page; never generate substitute footage. */
export async function encodeMotion(
  frames: MotionFrame[],
  directory: string,
  output: string,
  duration: number,
) {
  if (duration < 1 || duration > 5) throw new Error("Review clips must be 1–5 seconds.");
  if (frames.length < 2) throw new Error("No changing browser footage was recorded.");
  for (const frame of frames) {
    if (!(await stat(frame.path)).size) throw new Error("A captured browser frame is empty.");
  }
  const lines = frames.flatMap((frame, index) => {
    const end = frames[index + 1]?.elapsed ?? duration;
    const seconds = Math.max(1 / 60, end - frame.elapsed);
    const path = frame.path.replaceAll("\\", "/").replaceAll("'", "'\\''");
    return [`file '${path}'`, `duration ${seconds.toFixed(6)}`];
  });
  const last = frames.at(-1)!.path.replaceAll("\\", "/").replaceAll("'", "'\\''");
  lines.push(`file '${last}'`);
  const manifest = join(directory, "frames.ffconcat");
  await writeFile(manifest, `${lines.join("\n")}\n`);
  const input = ["-y", "-f", "concat", "-safe", "0", "-i", manifest, "-t", String(duration)];
  const mp4 = `${output}.mp4`;
  const gif = `${output}.gif`;
  await exec("ffmpeg", [
    ...input,
    "-vf",
    "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  await exec("ffmpeg", [
    ...input,
    "-filter_complex",
    "fps=15,split[a][b];[a]palettegen[p];[b][p]paletteuse",
    "-loop",
    "0",
    gif,
  ]);
  return { mp4, gif };
}
