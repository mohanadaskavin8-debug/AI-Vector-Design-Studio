import type { VectorObject } from './types';

export const EMBROIDERY_PX_PER_MM = 96 / 25.4;
export const MAX_REGION_COMMANDS = 20_000;
export const MAX_PLAN_COMMANDS = 35_000;

export type StitchType = 'fill' | 'satin' | 'running';
export type UnderlayType = 'none' | 'center-run' | 'edge-run' | 'zigzag';
export type StitchCommandType = 'stitch' | 'jump' | 'trim' | 'color-change';

export interface ThreadColor {
  hex: string;
  name?: string;
  code?: string;
}

export interface StitchCommand {
  x: number;
  y: number;
  type: StitchCommandType;
  layer?: 'underlay' | 'top';
  threadHex?: string;
  initialThread?: boolean;
}

export interface StitchRegionSettings {
  stitchType: StitchType;
  density: number;
  angle: number;
  underlay: UnderlayType;
  pullCompensation: number;
  stitchLength: number;
  color: ThreadColor;
}

export interface StitchRegion {
  id: string;
  sourceObjectId: string;
  sourceType: VectorObject['type'];
  name: string;
  visible: boolean;
  settings: StitchRegionSettings;
  commands: StitchCommand[];
  bounds: { x: number; y: number; width: number; height: number };
  geometryQuality: 'exact' | 'approximate';
  geometryNote?: string;
}

export interface HoopSettings {
  name: string;
  widthMm: number;
  heightMm: number;
  centerX?: number;
  centerY?: number;
}

export interface ExporterCapability {
  format: string;
  available: boolean;
  machineReady: boolean;
  description: string;
}

export interface EmbroideryDesign {
  regions: StitchRegion[];
  hoop: HoopSettings;
  threadPalette: ThreadColor[];
  exporters: ExporterCapability[];
}

export interface ViewSettings {
  showRealistic: boolean;
  showDirection: boolean;
  showUnderlay: boolean;
  showJumps: boolean;
  showTrims: boolean;
  showOrder: boolean;
}

export interface EmbroideryMetrics {
  totalStitches: number;
  jumps: number;
  trims: number;
  colorChanges: number;
  colorCount: number;
  threadLengthM: number;
  sewTimeMins: number;
  widthMm: number;
  heightMm: number;
  longestJumpMm: number;
}

export interface PreflightWarning {
  severity: 'info' | 'warning' | 'error';
  message: string;
  recommendation: string;
}

export class EmbroideryGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbroideryGenerationError';
  }
}

type Point = { x: number; y: number };

export const EMBROIDERY_EXPORTERS: ExporterCapability[] = [
  { format: 'SVG', available: true, machineReady: false, description: 'Inspectable stitch-path preview.' },
  { format: 'JSON', available: true, machineReady: false, description: 'Editable stitch-plan commands and metadata.' },
  ...['DST', 'PES', 'JEF', 'EXP', 'VP3', 'XXX'].map(format => ({
    format,
    available: false,
    machineReady: false,
    description: 'Machine exporter not installed.',
  })),
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const rotate = (point: Point, center: Point, degrees: number): Point => {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
};

const parsePointPairs = (value = ''): Point[] => {
  const numbers = value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  const points: Point[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ x: numbers[index], y: numbers[index + 1] });
  }
  return points;
};

const polygonPoints = (object: VectorObject): Point[] => {
  if (object.type === 'star') {
    const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
    const outer = Math.min(object.width, object.height) / 2;
    return Array.from({ length: 10 }, (_, index) => {
      const radius = index % 2 === 0 ? outer : outer * 0.382;
      const angle = index * Math.PI / 5 - Math.PI / 2;
      return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    });
  }
  const parsed = parsePointPairs(object.points);
  if (parsed.length >= 3) return parsed;
  const centerX = object.x + object.width / 2;
  const centerY = object.y + object.height / 2;
  return [
    { x: centerX, y: object.y },
    { x: object.x + object.width, y: centerY },
    { x: centerX, y: object.y + object.height },
    { x: object.x, y: centerY },
  ];
};

const pointInPolygon = (point: Point, polygon: Point[]) => {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
};

const containsObjectPoint = (object: VectorObject, worldPoint: Point, pullPx: number) => {
  const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  const point = rotate(worldPoint, center, -object.rotation);
  if (object.type === 'ellipse') {
    const rx = object.width / 2 + pullPx;
    const ry = object.height / 2 + pullPx;
    return ((point.x - center.x) / Math.max(rx, 0.1)) ** 2 + ((point.y - center.y) / Math.max(ry, 0.1)) ** 2 <= 1;
  }
  if (object.type === 'polygon' || object.type === 'star') {
    const scale = 1 + pullPx / Math.max(object.width, object.height, 1);
    const expanded = polygonPoints(object).map(vertex => ({
      x: center.x + (vertex.x - center.x) * scale,
      y: center.y + (vertex.y - center.y) * scale,
    }));
    return pointInPolygon(point, expanded);
  }
  if (object.type === 'path') {
    const pathPoints = object.nodes?.map(node => ({ x: node.x, y: node.y })) ?? parsePointPairs(object.points);
    if (object.closed && pathPoints.length >= 3) {
      const scale = 1 + pullPx / Math.max(object.width, object.height, 1);
      return pointInPolygon(point, pathPoints.map(vertex => ({
        x: center.x + (vertex.x - center.x) * scale,
        y: center.y + (vertex.y - center.y) * scale,
      })));
    }
  }
  return point.x >= object.x - pullPx
    && point.x <= object.x + object.width + pullPx
    && point.y >= object.y - pullPx
    && point.y <= object.y + object.height + pullPx;
};

const appendTravel = (commands: StitchCommand[], start: Point, layer: StitchCommand['layer']) => {
  const previous = commands.at(-1);
  if (previous && distance(previous, start) > 12 * EMBROIDERY_PX_PER_MM) {
    commands.push({ x: previous.x, y: previous.y, type: 'trim', layer });
  }
  commands.push({ ...start, type: 'jump', layer });
};

const resamplePolyline = (points: Point[], stitchLengthPx: number, closed: boolean): Point[] => {
  if (points.length < 2) return points;
  const source = closed ? [...points, points[0]] : points;
  const output: Point[] = [source[0]];
  for (let index = 1; index < source.length; index += 1) {
    const start = source[index - 1];
    const end = source[index];
    const segmentLength = distance(start, end);
    const steps = Math.max(1, Math.ceil(segmentLength / stitchLengthPx));
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      output.push({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
      if (output.length > MAX_REGION_COMMANDS) {
        throw new EmbroideryGenerationError(`This running path exceeds the ${MAX_REGION_COMMANDS.toLocaleString()} command preview limit. Increase stitch length or simplify the path.`);
      }
    }
  }
  return output;
};

const outlinePoints = (object: VectorObject): { points: Point[]; closed: boolean; quality: StitchRegion['geometryQuality']; note?: string } => {
  const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  if (object.type === 'line') {
    return {
      points: [
        rotate({ x: object.x, y: object.y }, center, object.rotation),
        rotate({ x: object.x + object.width, y: object.y + object.height }, center, object.rotation),
      ],
      closed: false,
      quality: 'exact',
    };
  }
  if (object.type === 'rect') {
    return {
      points: [
        { x: object.x, y: object.y },
        { x: object.x + object.width, y: object.y },
        { x: object.x + object.width, y: object.y + object.height },
        { x: object.x, y: object.y + object.height },
      ].map(point => rotate(point, center, object.rotation)),
      closed: true,
      quality: 'exact',
    };
  }
  if (object.type === 'ellipse') {
    return {
      points: Array.from({ length: 48 }, (_, index) => {
        const angle = index / 48 * Math.PI * 2;
        return rotate({
          x: center.x + Math.cos(angle) * object.width / 2,
          y: center.y + Math.sin(angle) * object.height / 2,
        }, center, object.rotation);
      }),
      closed: true,
      quality: 'exact',
    };
  }
  if (object.type === 'polygon' || object.type === 'star') {
    return {
      points: polygonPoints(object).map(point => rotate(point, center, object.rotation)),
      closed: true,
      quality: object.points || object.type === 'star' ? 'exact' : 'approximate',
      note: object.points || object.type === 'star' ? undefined : 'Default polygon outline reconstructed from bounds.',
    };
  }
  if (object.type === 'path') {
    const points = object.nodes?.map(node => ({ x: node.x, y: node.y })) ?? parsePointPairs(object.points);
    return {
      points,
      closed: Boolean(object.closed),
      quality: 'approximate',
      note: 'Path curves are sampled from anchors; control-curve extrema may differ.',
    };
  }
  return { points: [], closed: false, quality: 'approximate', note: 'Unsupported source geometry.' };
};

const generateRunning = (object: VectorObject, settings: StitchRegionSettings, layer: StitchCommand['layer'] = 'top') => {
  const geometry = outlinePoints(object);
  const points = resamplePolyline(geometry.points, clamp(settings.stitchLength, 0.8, 8) * EMBROIDERY_PX_PER_MM, geometry.closed);
  if (!points.length) return [];
  return [
    { ...points[0], type: 'jump' as const, layer },
    ...points.slice(1).map(point => ({ ...point, type: 'stitch' as const, layer })),
  ];
};

const generateFill = (object: VectorObject, settings: StitchRegionSettings, layer: StitchCommand['layer'] = 'top') => {
  const commands: StitchCommand[] = [];
  const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  const angle = object.rotation + settings.angle;
  const radians = angle * Math.PI / 180;
  const direction = { x: Math.cos(radians), y: Math.sin(radians) };
  const normal = { x: -direction.y, y: direction.x };
  const diagonal = Math.hypot(object.width, object.height) + settings.pullCompensation * EMBROIDERY_PX_PER_MM * 2;
  const rowSpacing = clamp(settings.density, 0.2, 2) * EMBROIDERY_PX_PER_MM;
  const sampleStep = clamp(settings.stitchLength, 0.8, 8) * EMBROIDERY_PX_PER_MM;
  const pullPx = clamp(settings.pullCompensation, 0, 1.5) * EMBROIDERY_PX_PER_MM;
  const projectedChecks = Math.ceil(diagonal / rowSpacing) * Math.ceil(diagonal / sampleStep);
  if (projectedChecks > 500_000) {
    throw new EmbroideryGenerationError(`This region would require ${projectedChecks.toLocaleString()} geometry samples. Increase row spacing or stitch length, or reduce the artwork size.`);
  }
  let reverse = false;

  for (let offset = -diagonal / 2; offset <= diagonal / 2; offset += rowSpacing) {
    const runs: Point[][] = [];
    let run: Point[] = [];
    for (let along = -diagonal / 2; along <= diagonal / 2; along += sampleStep) {
      const point = {
        x: center.x + normal.x * offset + direction.x * along,
        y: center.y + normal.y * offset + direction.y * along,
      };
      if (containsObjectPoint(object, point, pullPx)) {
        run.push(point);
      } else if (run.length) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length) runs.push(run);
    const orderedRuns = reverse ? runs.reverse().map(points => [...points].reverse()) : runs;
    orderedRuns.filter(points => points.length >= 2).forEach(points => {
      appendTravel(commands, points[0], layer);
      commands.push(...points.slice(1).map(point => ({ ...point, type: 'stitch' as const, layer })));
      if (commands.length > MAX_REGION_COMMANDS) {
        throw new EmbroideryGenerationError(`This region exceeds the ${MAX_REGION_COMMANDS.toLocaleString()} command preview limit. Increase row spacing or reduce the artwork size.`);
      }
      reverse = !reverse;
    });
  }
  return commands;
};

const generateUnderlay = (object: VectorObject, settings: StitchRegionSettings) => {
  if (settings.underlay === 'none' || settings.stitchType === 'running') return [];
  if (settings.underlay === 'edge-run') return generateRunning(object, { ...settings, stitchLength: Math.max(2.5, settings.stitchLength) }, 'underlay');
  const adjusted = {
    ...settings,
    density: settings.underlay === 'zigzag' ? Math.max(1.2, settings.density * 3) : Math.max(2, settings.density * 5),
    angle: settings.underlay === 'zigzag' ? settings.angle + 90 : settings.angle,
    pullCompensation: 0,
  };
  return generateFill(object, adjusted, 'underlay');
};

export const getGeometryQuality = (object: VectorObject) => outlinePoints(object);

export function generateStitches(object: VectorObject, settings: StitchRegionSettings): StitchCommand[] {
  const normalized: StitchRegionSettings = {
    ...settings,
    density: clamp(Number(settings.density) || 0.4, 0.2, 2),
    stitchLength: clamp(Number(settings.stitchLength) || 2.5, 0.8, 8),
    pullCompensation: clamp(Number(settings.pullCompensation) || 0, 0, 1.5),
    angle: ((Number(settings.angle) || 0) % 360 + 360) % 360,
  };
  const top = normalized.stitchType === 'running'
    ? generateRunning(object, normalized)
    : generateFill(object, normalized.stitchType === 'satin'
      ? { ...normalized, angle: normalized.angle + 90 }
      : normalized);
  const underlay = generateUnderlay(object, normalized);
  const commands = [...underlay, ...top];
  if (commands.length > MAX_REGION_COMMANDS) {
    throw new EmbroideryGenerationError(`This region exceeds the ${MAX_REGION_COMMANDS.toLocaleString()} command preview limit. Increase row spacing or simplify the artwork.`);
  }
  const last = commands.at(-1);
  if (last) commands.push({ x: last.x, y: last.y, type: 'trim', layer: last.layer });
  if (commands.length > MAX_REGION_COMMANDS) {
    throw new EmbroideryGenerationError(`This region exceeds the ${MAX_REGION_COMMANDS.toLocaleString()} command preview limit. Increase row spacing or simplify the artwork.`);
  }
  return commands;
}

export const commandsBounds = (commands: StitchCommand[]) => {
  const points = commands.filter(command => command.type === 'stitch' || command.type === 'jump');
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

export const buildThreadPalette = (regions: StitchRegion[]) => {
  const seen = new Set<string>();
  return regions.filter(region => region.visible).flatMap(region => {
    const key = region.settings.color.hex.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [region.settings.color];
  });
};

export const normalizeRegionSequence = (regions: StitchRegion[]) => {
  let previousColor = '';
  let previousEnd: StitchCommand | undefined;
  return regions.map(region => {
    const commands = region.commands.filter(command => command.type !== 'color-change');
    const color = region.settings.color.hex.toLowerCase();
    const first = commands[0];
    if (region.visible && first && (!previousColor || previousColor !== color)) {
      const marker = previousEnd ?? first;
      commands.unshift({
        x: marker.x,
        y: marker.y,
        type: 'color-change',
        threadHex: color,
        initialThread: !previousColor,
      });
    }
    if (region.visible) {
      previousColor = color;
      previousEnd = commands.at(-1);
    }
    return { ...region, commands };
  });
};

export function computeMetrics(design: EmbroideryDesign): EmbroideryMetrics {
  const regions = design.regions.filter(region => region.visible);
  let totalStitches = 0;
  let jumps = 0;
  let trims = 0;
  let colorChanges = 0;
  let threadPx = 0;
  let longestJumpPx = 0;
  const commandColors = new Set<string>();
  const allCommands: StitchCommand[] = [];
  let previous: StitchCommand | null = null;
  regions.flatMap(region => region.commands).forEach(command => {
    if (command.type === 'stitch') {
      totalStitches += 1;
      if (previous && previous.type !== 'trim' && previous.type !== 'color-change') threadPx += distance(previous, command);
    } else if (command.type === 'jump') {
      jumps += 1;
      if (previous) longestJumpPx = Math.max(longestJumpPx, distance(previous, command));
    } else if (command.type === 'trim') {
      trims += 1;
    } else if (command.type === 'color-change') {
      if (!command.initialThread) colorChanges += 1;
      if (command.threadHex) commandColors.add(command.threadHex);
    }
    previous = command;
    allCommands.push(command);
  });

  const bounds = commandsBounds(allCommands);
  const sewSeconds = totalStitches / 700 * 60 + trims * 2 + colorChanges * 20;
  return {
    totalStitches,
    jumps,
    trims,
    colorChanges,
    colorCount: commandColors.size,
    threadLengthM: threadPx / EMBROIDERY_PX_PER_MM / 1000 * 1.15,
    sewTimeMins: Math.max(0, Math.ceil(sewSeconds / 60)),
    widthMm: bounds.width / EMBROIDERY_PX_PER_MM,
    heightMm: bounds.height / EMBROIDERY_PX_PER_MM,
    longestJumpMm: longestJumpPx / EMBROIDERY_PX_PER_MM,
  };
}

const overlaps = (a: StitchRegion['bounds'], b: StitchRegion['bounds']) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function inspectEmbroidery(design: EmbroideryDesign): PreflightWarning[] {
  const regions = design.regions.filter(region => region.visible);
  const metrics = computeMetrics(design);
  const warnings: PreflightWarning[] = [];
  if (!regions.length) {
    return [{ severity: 'info', message: 'No stitch regions exist.', recommendation: 'Select supported vector artwork in Design mode, then digitize it.' }];
  }
  const allCommands = regions.flatMap(region => region.commands);
  const bounds = commandsBounds(allCommands);
  const hoopWidthPx = design.hoop.widthMm * EMBROIDERY_PX_PER_MM;
  const hoopHeightPx = design.hoop.heightMm * EMBROIDERY_PX_PER_MM;
  const hoopCenterX = design.hoop.centerX ?? bounds.x + bounds.width / 2;
  const hoopCenterY = design.hoop.centerY ?? bounds.y + bounds.height / 2;
  const outsideHoop = bounds.x < hoopCenterX - hoopWidthPx / 2
    || bounds.y < hoopCenterY - hoopHeightPx / 2
    || bounds.x + bounds.width > hoopCenterX + hoopWidthPx / 2
    || bounds.y + bounds.height > hoopCenterY + hoopHeightPx / 2;
  if (outsideHoop) {
    warnings.push({ severity: 'error', message: `Plan is ${metrics.widthMm.toFixed(1)} × ${metrics.heightMm.toFixed(1)} mm; the hoop is ${design.hoop.widthMm} × ${design.hoop.heightMm} mm.`, recommendation: 'Choose a larger hoop or resize the source artwork.' });
  }
  regions.forEach(region => {
    const minDimensionMm = Math.min(region.bounds.width, region.bounds.height) / EMBROIDERY_PX_PER_MM;
    if (minDimensionMm < 1.5) warnings.push({ severity: 'warning', message: `${region.name} contains detail under 1.5 mm.`, recommendation: 'Enlarge or simplify this region before machine digitizing.' });
    if (region.settings.density < 0.3) warnings.push({ severity: 'warning', message: `${region.name} uses dense ${region.settings.density.toFixed(2)} mm row spacing.`, recommendation: 'Test for puckering and thread buildup on the target fabric.' });
    if (region.settings.density > 0.8 && region.settings.stitchType !== 'running') warnings.push({ severity: 'warning', message: `${region.name} uses sparse ${region.settings.density.toFixed(2)} mm row spacing.`, recommendation: 'Inspect coverage and reduce spacing if fabric shows through.' });
    if (region.geometryQuality === 'approximate') warnings.push({ severity: 'info', message: `${region.name} uses approximate source geometry.`, recommendation: region.geometryNote || 'Inspect the stitch preview closely.' });
    if (region.settings.stitchType === 'satin' && Math.max(region.bounds.width, region.bounds.height) / EMBROIDERY_PX_PER_MM > 12) warnings.push({ severity: 'warning', message: `${region.name} exceeds a conservative 12 mm satin span.`, recommendation: 'Use a fill stitch or split the satin column.' });
  });
  if (metrics.longestJumpMm > 12) warnings.push({ severity: 'warning', message: `Longest jump is ${metrics.longestJumpMm.toFixed(1)} mm.`, recommendation: 'Reorder regions or add a trim before long travel.' });
  if (metrics.colorCount > 8) warnings.push({ severity: 'warning', message: `${metrics.colorCount} thread colors create frequent setup changes.`, recommendation: 'Consolidate similar colors where the artwork permits.' });
  const commandCount = regions.reduce((total, region) => total + region.commands.length, 0);
  if (commandCount > MAX_PLAN_COMMANDS * 0.8) warnings.push({ severity: 'warning', message: `The preview contains ${commandCount.toLocaleString()} commands, near its safety limit.`, recommendation: 'Increase row spacing or split the design before adding more regions.' });
  if (regions.some(region => region.settings.stitchType === 'satin')) warnings.push({ severity: 'info', message: 'Satin-style regions use an experimental perpendicular scan approximation.', recommendation: 'Inspect span and direction carefully; use dedicated rail-based digitizing software before machine production.' });
  for (let first = 0; first < regions.length; first += 1) {
    for (let second = first + 1; second < regions.length; second += 1) {
      if (overlaps(regions[first].bounds, regions[second].bounds)) {
        warnings.push({ severity: 'info', message: `${regions[first].name} overlaps ${regions[second].name}.`, recommendation: 'Confirm the stitch order prevents unwanted edge buildup.' });
        first = regions.length;
        break;
      }
    }
  }
  return warnings;
}