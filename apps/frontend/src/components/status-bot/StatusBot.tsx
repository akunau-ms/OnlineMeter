import * as React from "react";
import type { MonitorStatus } from "shared-types";
import { BotEngine, type BotFrame } from "./engine/engine";
import { RAYON, DEMI_VIEWBOX } from "./engine/repere";
import { NOTIF_BLUE } from "./engine/decor";
import type { StateId } from "./engine/states";
import { EXPRESSION_BY_ID, type BotExpression } from "./engine/expressions";

/** The engine's own "confused" rest-face expression (asymmetric, tilted
 * eyes) — reused as-is, per Constitution Component & UI Standards. */
const CONFUSED_EXPRESSION: BotExpression | null = EXPRESSION_BY_ID.get("confus") ?? null;

export interface StatusBotProps {
  status: MonitorStatus;
  /** true when the monitor is paused — takes visual priority over `status`. */
  paused?: boolean;
  size?: number;
  /** CSS color for the body/eye ink, e.g. "hsl(var(--success))". */
  ink?: string;
  /** CSS color shown through the eye holes — should match the surrounding background. */
  paper?: string;
  className?: string;
}

function stateFor(status: MonitorStatus, paused: boolean, small: boolean): StateId {
  if (paused) return "sleep";
  switch (status) {
    case "up":
      return "idle";
    case "down":
      // Below the small-size threshold, hold the bot's normal round "idle"
      // face (same state as "up") with the "confused" expression swapped in
      // below, instead of the animated traveling "!", which reads as
      // illegible/broken at that size (specs/019). This still runs through
      // the same live engine loop as every other state — breathing,
      // blinking, eye drift — just with a different expression, exactly
      // like "up" only alarmed-looking instead of calm.
      return small ? "idle" : "alert";
    case "pending":
    default:
      return "thinking";
  }
}

/** Only "down" at small size gets the confused expression; everything else
 * keeps the engine's normal rest expression (`null` = default/"neutre"). */
function expressionFor(status: MonitorStatus, paused: boolean, small: boolean): BotExpression | null {
  if (!paused && status === "down" && small) return CONFUSED_EXPRESSION;
  return null;
}

export function inkFor(status: MonitorStatus, paused: boolean): string {
  if (paused) return "hsl(var(--muted-foreground))";
  switch (status) {
    case "up":
      return "hsl(var(--success))";
    case "down":
      return "hsl(var(--destructive))";
    case "pending":
    default:
      return "hsl(var(--muted-foreground))";
  }
}

/**
 * Below this size, the "down" status holds the bot's normal round "idle"
 * face with a confused expression instead of playing the animated
 * traveling "!" — illegible as a moving glyph at small sizes. Every other
 * state, and "down" at larger sizes, is unaffected.
 */
const SMALL_SIZE_THRESHOLD = 56;

/**
 * React port of bloub's status indicator (see ./engine/NOTICE.md). The
 * engine itself (./engine/*) is bloub's unmodified, framework-agnostic core
 * — this component is only the rendering + state-mapping layer, per the
 * project constitution's Component & UI Standards.
 */
export function StatusBot({
  status,
  paused = false,
  size = 40,
  ink,
  paper = "hsl(var(--background))",
  className,
}: StatusBotProps) {
  const engineRef = React.useRef<BotEngine | null>(null);
  const clockRef = React.useRef(0);
  const startRef = React.useRef<number | null>(null);
  const [frame, setFrame] = React.useState<BotFrame | null>(null);
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");

  const resolvedInk = ink ?? inkFor(status, paused);
  const small = size < SMALL_SIZE_THRESHOLD;

  if (!engineRef.current) {
    engineRef.current = new BotEngine(
      RAYON,
      stateFor(status, paused, small),
      null,
      expressionFor(status, paused, small),
    );
  }

  React.useEffect(() => {
    let raf = 0;
    const tick = (perfNow: number) => {
      if (startRef.current === null) startRef.current = perfNow;
      clockRef.current = (perfNow - startRef.current) / 1000;
      setFrame(engineRef.current!.sample(clockRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  React.useEffect(() => {
    engineRef.current?.setState(stateFor(status, paused, small), clockRef.current);
  }, [status, paused, small]);

  React.useEffect(() => {
    engineRef.current?.setExpression(expressionFor(status, paused, small), clockRef.current);
  }, [status, paused, small]);

  const VB = DEMI_VIEWBOX;
  const maskId = `status-bot-mask-${uid}`;

  if (!frame) {
    return (
      <div
        role="img"
        aria-label={paused ? "paused" : status}
        className={className}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role="img"
      aria-label={paused ? "paused" : status}
      className={className}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
          ))}
          {frame.notch ? (
            <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />
          ) : null}
        </mask>
      </defs>

      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={resolvedInk} />
        </g>
      </g>

      {frame.notif ? (
        <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />
      ) : null}
    </svg>
  );
}
