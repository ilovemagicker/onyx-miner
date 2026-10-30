"use client";

import { useEffect, useMemo, useState } from "react";

const IDLE_FRAMES = [
  "/sprites/miner/idle-01.png",
  "/sprites/miner/idle-02.png",
  "/sprites/miner/idle-03.png",
  "/sprites/miner/idle-04.png",
] as const;

const SWING_FRAMES = [
  "/sprites/miner/swing-01.png",
  "/sprites/miner/swing-02.png",
  "/sprites/miner/swing-03.png",
  "/sprites/miner/swing-04.png",
  "/sprites/miner/swing-05.png",
  "/sprites/miner/swing-06.png",
  "/sprites/miner/swing-07.png",
  "/sprites/miner/swing-08.png",
] as const;

/** Idle ~7 fps (headlamp blink); swing ~10 fps (pickaxe loop). */
const IDLE_MS = Math.round(1000 / 7);
const SWING_MS = Math.round(1000 / 10);

type Props = {
  /** True while Start is active (demo hashing or pool session). */
  mining: boolean;
  label: string;
  statusLabel: string;
};

export function MinerCharacter({ mining, label, statusLabel }: Props) {
  const frames = useMemo(
    () => (mining ? SWING_FRAMES : IDLE_FRAMES),
    [mining]
  );
  const intervalMs = mining ? SWING_MS : IDLE_MS;
  const [frame, setFrame] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setFrame(0);
  }, [mining]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    // Warm the browser cache so frame swaps stay crisp.
    for (const src of [...IDLE_FRAMES, ...SWING_FRAMES]) {
      const img = new window.Image();
      img.src = src;
    }
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [frames, intervalMs, reduceMotion]);

  const src = frames[reduceMotion ? 0 : frame % frames.length];

  return (
    <div
      className={`miner-character pixel-panel ${mining ? "mining-glow" : ""}`}
      role="img"
      aria-label={`${label}: ${statusLabel}`}
    >
      <div className="miner-character__stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={256}
          height={256}
          draggable={false}
          className="miner-character__sprite"
        />
      </div>
      <div className="miner-character__caption">
        <span
          className={`status-lamp status-lamp--${mining ? "mining" : "idle"}`}
          aria-hidden
        />
        <span className="pixel-label !text-[9px] !normal-case tracking-wide text-zinc-300">
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
