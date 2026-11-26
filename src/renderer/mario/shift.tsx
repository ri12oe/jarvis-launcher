import { createContext, useContext, type ReactNode } from "react";
import { shift, type CanvasFit } from "../../shared/mario";

const SpareRoom = createContext<Pick<CanvasFit, "extraX" | "extraY">>({
  extraX: 0,
  extraY: 0,
});

export const SpareRoomProvider = SpareRoom.Provider;

function useOffset(fx: number, fy: number): string | undefined {
  const { x, y } = shift(useContext(SpareRoom), fx, fy);
  return x === 0 && y === 0
    ? undefined
    : `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
}

/** HTML panel group anchored at (fx, fy) of the spare room. */
export function Shift({
  fx,
  fy,
  children,
}: {
  fx: number;
  fy: number;
  children: ReactNode;
}) {
  return (
    <div className="shift" style={{ transform: useOffset(fx, fy) }}>
      {children}
    </div>
  );
}

/** SVG panel group anchored at (fx, fy) of the spare room. */
export function G({
  fx,
  fy,
  children,
}: {
  fx: number;
  fy: number;
  children: ReactNode;
}) {
  return <g style={{ transform: useOffset(fx, fy) }}>{children}</g>;
}

export function useSpareRoom() {
  return useContext(SpareRoom);
}
