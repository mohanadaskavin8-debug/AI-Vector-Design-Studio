import { describe, expect, it } from "vitest";
import {
  validateVectorCopilotPlan,
  validateVectorCopilotRequest,
  type VectorCopilotRequest,
} from "./vectorCopilotPlan";

const unlocked = {
  id: "shape-1",
  type: "rect",
  name: "Rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  rotation: 0,
  fill: "#fff",
  stroke: "none",
  strokeWidth: 0,
  opacity: 1,
  visible: true,
  locked: false,
};
const locked = { ...unlocked, id: "locked-1", name: "Locked", locked: true };
const request: VectorCopilotRequest = {
  prompt: "Move the rectangle right",
  document: {
    artboard: { width: 800, height: 600, fill: "#ffffff" },
    objects: [unlocked, locked],
  },
  selection: ["shape-1"],
};

const plan = (operations: unknown[]) => ({
  version: 1,
  explanation: "A safe plan.",
  warnings: [],
  operations,
});

describe("vector copilot request validator", () => {
  it("accepts a bounded document summary", () => {
    expect(validateVectorCopilotRequest(request).value).toEqual(request);
  });

  it("rejects bad colors, URL colors, and non-finite numbers", () => {
    const badColor = {
      ...request,
      document: { ...request.document, artboard: { ...request.document.artboard, fill: "red" } },
    };
    const urlColor = {
      ...request,
      document: { ...request.document, artboard: { ...request.document.artboard, fill: "url(javascript:alert(1))" } },
    };
    const infinite = {
      ...request,
      document: {
        ...request.document,
        objects: [{ ...unlocked, x: Number.POSITIVE_INFINITY }],
      },
    };
    expect(validateVectorCopilotRequest(badColor).error).toMatch(/artboard/i);
    expect(validateVectorCopilotRequest(urlColor).error).toMatch(/artboard/i);
    expect(validateVectorCopilotRequest(infinite).error).toMatch(/object/i);
  });
});

describe("vector copilot plan validator", () => {
  it("accepts the v1 operation contract", () => {
    const result = validateVectorCopilotPlan(
      plan([{ op: "update", ids: ["shape-1"], patch: { x: 40, fill: "#112233aa" } }]),
      request.document,
      request.prompt,
    );
    expect(result.value?.operations).toEqual([
      { op: "update", ids: ["shape-1"], patch: { x: 40, fill: "#112233aa" } },
    ]);
    expect(result.value?.destructive).toBe(false);
  });

  it("rejects unknown operations and unknown fields", () => {
    expect(validateVectorCopilotPlan(
      plan([{ op: "paint", ids: ["shape-1"] }]),
      request.document,
      request.prompt,
    ).error).toMatch(/no safe/i);
    expect(validateVectorCopilotPlan(
      plan([{ op: "update", ids: ["shape-1"], patch: { x: 1 }, imageSrc: "bad" }]),
      request.document,
      request.prompt,
    ).error).toMatch(/no safe/i);
  });

  it("rejects unsafe colors and non-finite operation numbers", () => {
    for (const value of ["red", "url(https://bad.example/x)"]) {
      expect(validateVectorCopilotPlan(
        plan([{ op: "update", ids: ["shape-1"], patch: { fill: value } }]),
        request.document,
        request.prompt,
      ).error).toMatch(/no safe/i);
    }
    expect(validateVectorCopilotPlan(
      plan([{ op: "duplicate", ids: ["shape-1"], offsetX: Number.NaN }]),
      request.document,
      request.prompt,
    ).error).toMatch(/no safe/i);
  });

  it("rejects oversized plans", () => {
    const operations = Array.from({ length: 41 }, () => ({ op: "select", ids: ["shape-1"] }));
    expect(validateVectorCopilotPlan(plan(operations), request.document, request.prompt).error)
      .toMatch(/contract/i);
  });

  it("filters locked and unknown IDs while preserving safe references", () => {
    const result = validateVectorCopilotPlan(
      plan([{ op: "update", ids: ["shape-1", "locked-1", "missing"], patch: { y: 42 } }]),
      request.document,
      request.prompt,
    );
    expect(result.value?.operations).toEqual([
      { op: "update", ids: ["shape-1"], patch: { y: 42 } },
    ]);
    expect(result.value?.warnings.join(" ")).toMatch(/locked/i);
    expect(result.value?.warnings.join(" ")).toMatch(/unknown/i);
  });

  it("enforces the safe path-data charset", () => {
    const object = {
      type: "path",
      name: "Curve",
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      points: "M 0 0 L 20 20 Z",
      closed: true,
    };
    expect(validateVectorCopilotPlan(
      plan([{ op: "insert", objects: [object] }]),
      request.document,
      request.prompt,
    ).value?.operations).toHaveLength(1);
    expect(validateVectorCopilotPlan(
      plan([{ op: "insert", objects: [{ ...object, points: "M0 0<script>" }] }]),
      request.document,
      request.prompt,
    ).error).toMatch(/no safe/i);
  });

  it("restricts operations to the selection when one is provided", () => {
    const second = { ...unlocked, id: "shape-2", name: "Second" };
    const doc = {
      artboard: request.document.artboard,
      objects: [unlocked, second],
    };
    const result = validateVectorCopilotPlan(
      plan([{ op: "update", ids: ["shape-1", "shape-2"], patch: { fill: "#ff0000" } }]),
      doc,
      request.prompt,
      ["shape-1"],
    );
    expect(result.value?.operations).toEqual([
      { op: "update", ids: ["shape-1"], patch: { fill: "#ff0000" } },
    ]);
    expect(result.value?.warnings.join(" ")).toMatch(/outside the current selection/i);

    const dropped = validateVectorCopilotPlan(
      plan([{ op: "update", ids: ["shape-2"], patch: { fill: "#ff0000" } }]),
      doc,
      request.prompt,
      ["shape-1"],
    );
    expect(dropped.error).toMatch(/no safe/i);

    const unscoped = validateVectorCopilotPlan(
      plan([{ op: "update", ids: ["shape-2"], patch: { fill: "#ff0000" } }]),
      doc,
      request.prompt,
      [],
    );
    expect(unscoped.value?.operations).toHaveLength(1);
  });

  it("gates deletion on explicit intent and derives destructive", () => {
    expect(validateVectorCopilotPlan(
      plan([{ op: "delete", ids: ["shape-1"] }]),
      request.document,
      "Make this look cleaner",
    ).error).toMatch(/no safe/i);
    const result = validateVectorCopilotPlan(
      plan([{ op: "delete", ids: ["shape-1"] }]),
      request.document,
      "Delete the rectangle",
    );
    expect(result.value?.destructive).toBe(true);
  });
});