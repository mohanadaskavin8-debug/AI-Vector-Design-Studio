export type DocObject = {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  groupId?: string;
  traceRole?: string;
  pointsLength?: number;
  nodeCount?: number;
  closed?: boolean;
  text?: string;
};

export type VectorCopilotRequest = {
  prompt: string;
  document: {
    artboard: { width: number; height: number; fill: string };
    objects: DocObject[];
  };
  selection: string[];
};

export type VectorCopilotOperation =
  | { op: "select" | "delete" | "group" | "ungroup"; ids: string[] }
  | { op: "update"; ids: string[]; patch: Record<string, string | number> }
  | { op: "duplicate"; ids: string[]; offsetX?: number; offsetY?: number }
  | { op: "insert"; objects: Record<string, unknown>[] }
  | { op: "align"; ids: string[]; alignment: "left" | "center" | "right" | "top" | "middle" | "bottom" }
  | { op: "distribute"; ids: string[]; axis: "x" | "y" };

export type VectorCopilotPlan = {
  version: 1;
  explanation: string;
  warnings: string[];
  operations: VectorCopilotOperation[];
  destructive: boolean;
};

type Validation<T> = { value: T; error?: never } | { value?: never; error: string };

const objectKeys = new Set([
  "id", "type", "name", "x", "y", "width", "height", "rotation", "fill", "stroke",
  "strokeWidth", "opacity", "visible", "locked", "groupId", "traceRole", "pointsLength",
  "nodeCount", "closed", "text",
]);
const patchKeys = new Set(["x", "y", "width", "height", "rotation", "fill", "stroke", "strokeWidth", "opacity", "name"]);
const insertKeys = new Set(["type", "name", "x", "y", "width", "height", "rotation", "fill", "stroke", "strokeWidth", "opacity", "rx", "points", "closed"]);
const insertTypes = new Set(["rect", "ellipse", "polygon", "star", "line", "path"]);
const operationKeys: Record<string, Set<string>> = {
  select: new Set(["op", "ids"]),
  update: new Set(["op", "ids", "patch"]),
  delete: new Set(["op", "ids"]),
  duplicate: new Set(["op", "ids", "offsetX", "offsetY"]),
  insert: new Set(["op", "objects"]),
  group: new Set(["op", "ids"]),
  ungroup: new Set(["op", "ids"]),
  align: new Set(["op", "ids", "alignment"]),
  distribute: new Set(["op", "ids", "axis"]),
};
const colorPattern = /^(?:none|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8})$/;
const pathPattern = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.eE+\-]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, keys: Set<string>) =>
  Object.keys(value).every(key => keys.has(key));
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const string = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value.length >= min && value.length <= max;
const color = (value: unknown): value is string =>
  typeof value === "string" && colorPattern.test(value);
const id = (value: unknown): value is string => string(value, 1, 64);

/** Validate the bounded document summary accepted by the copilot endpoint. */
export function validateVectorCopilotRequest(input: unknown): Validation<VectorCopilotRequest> {
  if (!isRecord(input) || !hasOnly(input, new Set(["prompt", "document", "selection"]))) {
    return { error: "Request must contain only prompt, document, and selection." };
  }
  if (typeof input.prompt !== "string" || input.prompt.trim().length < 3 || input.prompt.trim().length > 1000) {
    return { error: "Prompt must be between 3 and 1000 characters." };
  }
  if (!isRecord(input.document) || !hasOnly(input.document, new Set(["artboard", "objects"]))
    || !isRecord(input.document.artboard)
    || !hasOnly(input.document.artboard, new Set(["width", "height", "fill"]))
    || !finite(input.document.artboard.width, 0.1, 10_000)
    || !finite(input.document.artboard.height, 0.1, 10_000)
    || !color(input.document.artboard.fill)) {
    return { error: "Document artboard is malformed; dimensions and a safe hex or none fill are required." };
  }
  if (!Array.isArray(input.document.objects) || input.document.objects.length > 400) {
    return { error: "Document objects must be an array containing at most 400 summaries." };
  }
  if (!Array.isArray(input.selection) || input.selection.length > 400) {
    return { error: "Selection must be an array containing at most 400 object IDs." };
  }

  const seen = new Set<string>();
  const objects: DocObject[] = [];
  for (const candidate of input.document.objects) {
    if (!isRecord(candidate) || !hasOnly(candidate, objectKeys)
      || !id(candidate.id) || seen.has(candidate.id)
      || !string(candidate.type, 1, 40) || !string(candidate.name, 0, 160)
      || !finite(candidate.x, -10_000, 10_000) || !finite(candidate.y, -10_000, 10_000)
      || !finite(candidate.width, 0.1, 10_000) || !finite(candidate.height, 0.1, 10_000)
      || !finite(candidate.rotation, -3600, 3600)
      || !color(candidate.fill) || !color(candidate.stroke)
      || !finite(candidate.strokeWidth, 0, 100) || !finite(candidate.opacity, 0, 1)
      || typeof candidate.visible !== "boolean" || typeof candidate.locked !== "boolean"
      || (candidate.groupId !== undefined && !id(candidate.groupId))
      || (candidate.traceRole !== undefined && !string(candidate.traceRole, 1, 64))
      || (candidate.pointsLength !== undefined && (!Number.isInteger(candidate.pointsLength) || !finite(candidate.pointsLength, 0, 100_000)))
      || (candidate.nodeCount !== undefined && (!Number.isInteger(candidate.nodeCount) || !finite(candidate.nodeCount, 0, 100_000)))
      || (candidate.closed !== undefined && typeof candidate.closed !== "boolean")
      || (candidate.text !== undefined && !string(candidate.text, 0, 80))) {
      return { error: "Document contains a malformed or unsafe object summary." };
    }
    seen.add(candidate.id);
    objects.push(candidate as DocObject);
  }
  if (!input.selection.every(candidate => id(candidate) && seen.has(candidate))) {
    return { error: "Selection contains an invalid or unknown object ID." };
  }
  return {
    value: {
      prompt: input.prompt.trim(),
      document: {
        artboard: input.document.artboard as VectorCopilotRequest["document"]["artboard"],
        objects,
      },
      selection: [...input.selection] as string[],
    },
  };
}

function safeIds(
  candidate: unknown,
  known: Map<string, DocObject>,
  warnings: string[],
  operation: string,
  scope: Set<string> | null,
): string[] | null {
  if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > 400 || !candidate.every(id)) {
    warnings.push(`${operation}: invalid IDs caused the operation to be dropped.`);
    return null;
  }
  const unique = [...new Set(candidate)];
  const filtered = unique.filter(objectId => known.has(objectId)
    && !known.get(objectId)!.locked
    && (!scope || scope.has(objectId)));
  const unknown = unique.filter(objectId => !known.has(objectId));
  const locked = unique.filter(objectId => known.get(objectId)?.locked);
  const outOfScope = scope
    ? unique.filter(objectId => known.has(objectId) && !known.get(objectId)!.locked && !scope.has(objectId))
    : [];
  if (unknown.length) warnings.push(`${operation}: unknown object IDs were removed.`);
  if (locked.length) warnings.push(`${operation}: locked objects were skipped.`);
  if (outOfScope.length) warnings.push(`${operation}: objects outside the current selection were skipped.`);
  if (!filtered.length) {
    warnings.push(`${operation}: no valid unlocked objects remain.`);
    return null;
  }
  return filtered;
}

function safePatch(candidate: unknown): Record<string, string | number> | null {
  if (!isRecord(candidate) || !hasOnly(candidate, patchKeys) || Object.keys(candidate).length === 0) return null;
  const patch: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(candidate)) {
    const valid = key === "fill" || key === "stroke" ? color(value)
      : key === "name" ? string(value, 0, 60)
      : key === "x" || key === "y" ? finite(value, -10_000, 10_000)
      : key === "width" || key === "height" ? finite(value, 0.1, 10_000)
      : key === "rotation" ? finite(value, -3600, 3600)
      : key === "strokeWidth" ? finite(value, 0, 100)
      : finite(value, 0, 1);
    if (!valid) return null;
    patch[key] = value as string | number;
  }
  return patch;
}

function safeNewObject(candidate: unknown): Record<string, unknown> | null {
  if (!isRecord(candidate) || !hasOnly(candidate, insertKeys)
    || typeof candidate.type !== "string" || !insertTypes.has(candidate.type)
    || !string(candidate.name, 0, 60)
    || !finite(candidate.x, -10_000, 10_000) || !finite(candidate.y, -10_000, 10_000)
    || !finite(candidate.width, 0.1, 10_000) || !finite(candidate.height, 0.1, 10_000)
    || (candidate.rotation !== undefined && !finite(candidate.rotation, -3600, 3600))
    || (candidate.fill !== undefined && !color(candidate.fill))
    || (candidate.stroke !== undefined && !color(candidate.stroke))
    || (candidate.strokeWidth !== undefined && !finite(candidate.strokeWidth, 0, 100))
    || (candidate.opacity !== undefined && !finite(candidate.opacity, 0, 1))
    || (candidate.rx !== undefined && !finite(candidate.rx, 0, 10_000))
    || (candidate.closed !== undefined && typeof candidate.closed !== "boolean")
    || (candidate.points !== undefined && (typeof candidate.points !== "string"
      || candidate.points.length > 4000 || !pathPattern.test(candidate.points)))) return null;
  if ((candidate.points !== undefined || candidate.closed !== undefined)
    && candidate.type !== "path" && candidate.type !== "polygon") return null;
  return { ...candidate };
}

const explicitDelete = (prompt: string) =>
  /\b(delete|remove|erase|discard|get rid of)\b/i.test(prompt);

/**
 * Treat a decoded provider plan as hostile input, filtering document references
 * and returning an error when no operation can be applied safely.
 */
export function validateVectorCopilotPlan(
  input: unknown,
  document: VectorCopilotRequest["document"],
  prompt: string,
  selection: string[] = [],
): Validation<VectorCopilotPlan> {
  const scope = selection.length ? new Set(selection) : null;
  if (!isRecord(input) || !hasOnly(input, new Set(["version", "explanation", "warnings", "operations"]))
    || input.version !== 1 || !string(input.explanation, 0, 600)
    || !Array.isArray(input.warnings) || input.warnings.length > 10
    || !input.warnings.every(warning => string(warning, 0, 300))
    || !Array.isArray(input.operations) || input.operations.length > 40) {
    return { error: "The AI provider returned a plan that did not match the secure operation contract. Your document was not changed." };
  }

  const known = new Map(document.objects.map(object => [object.id, object]));
  const warnings = [...input.warnings] as string[];
  const operations: VectorCopilotOperation[] = [];
  let inserted = 0;
  for (const candidate of input.operations) {
    if (!isRecord(candidate) || typeof candidate.op !== "string" || !operationKeys[candidate.op]
      || !hasOnly(candidate, operationKeys[candidate.op])) {
      warnings.push("An unknown or malformed operation was dropped.");
      continue;
    }
    const op = candidate.op;
    if (op === "insert") {
      if (!Array.isArray(candidate.objects) || candidate.objects.length < 1
        || inserted + candidate.objects.length > 60) {
        warnings.push("insert: the inserted-object limit was exceeded.");
        continue;
      }
      const objects = candidate.objects.map(safeNewObject);
      if (objects.some(object => object === null)) {
        warnings.push("insert: an object contained unsafe or unsupported fields, so the operation was dropped.");
        continue;
      }
      inserted += objects.length;
      operations.push({ op, objects: objects as Record<string, unknown>[] });
      continue;
    }

    const ids = safeIds(candidate.ids, known, warnings, op, scope);
    if (!ids) continue;
    if (op === "select" || op === "group" || op === "ungroup") {
      operations.push({ op, ids });
    } else if (op === "delete") {
      if (!explicitDelete(prompt)) {
        warnings.push("delete: deletion was dropped because the prompt did not clearly request removal.");
      } else {
        operations.push({ op, ids });
      }
    } else if (op === "update") {
      const patch = safePatch(candidate.patch);
      if (patch) operations.push({ op, ids, patch });
      else warnings.push("update: an unsafe or unsupported patch caused the operation to be dropped.");
    } else if (op === "duplicate") {
      if ((candidate.offsetX === undefined || finite(candidate.offsetX, -10_000, 10_000))
        && (candidate.offsetY === undefined || finite(candidate.offsetY, -10_000, 10_000))) {
        operations.push({
          op,
          ids,
          ...(candidate.offsetX === undefined ? {} : { offsetX: candidate.offsetX }),
          ...(candidate.offsetY === undefined ? {} : { offsetY: candidate.offsetY }),
        });
      } else warnings.push("duplicate: invalid offsets caused the operation to be dropped.");
    } else if (op === "align") {
      if (typeof candidate.alignment === "string"
        && ["left", "center", "right", "top", "middle", "bottom"].includes(candidate.alignment)) {
        operations.push({ op, ids, alignment: candidate.alignment as "left" | "center" | "right" | "top" | "middle" | "bottom" });
      } else warnings.push("align: invalid alignment caused the operation to be dropped.");
    } else if (op === "distribute") {
      if (candidate.axis === "x" || candidate.axis === "y") operations.push({ op, ids, axis: candidate.axis });
      else warnings.push("distribute: invalid axis caused the operation to be dropped.");
    }
  }
  if (!operations.length) {
    return { error: "The AI provider returned no safe, valid operations. Your document was not changed." };
  }
  return {
    value: {
      version: 1,
      explanation: input.explanation,
      warnings: warnings.slice(0, 10),
      operations,
      destructive: operations.some(operation => operation.op === "delete"),
    },
  };
}

/** Parse JSON without ever trusting provider output. */
export function parseAndValidateVectorCopilotPlan(
  raw: string,
  document: VectorCopilotRequest["document"],
  prompt: string,
  selection: string[] = [],
): Validation<VectorCopilotPlan> {
  if (raw.length > 200_000) {
    return { error: "The AI provider returned an oversized plan. Your document was not changed." };
  }
  try {
    return validateVectorCopilotPlan(JSON.parse(raw), document, prompt, selection);
  } catch {
    return { error: "The AI provider returned invalid JSON. Your document was not changed." };
  }
}