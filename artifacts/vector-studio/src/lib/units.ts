import { UnitType } from './types';

const PX_PER_UNIT: Record<UnitType, number> = {
  px: 1,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
  pt: 96 / 72,
};

export const pxToUnit = (value: number, unit: UnitType) => value / PX_PER_UNIT[unit];
export const unitToPx = (value: number, unit: UnitType) => value * PX_PER_UNIT[unit];
export const formatUnit = (value: number, unit: UnitType) => {
  const converted = pxToUnit(value, unit);
  return unit === 'px' ? Math.round(converted).toString() : converted.toFixed(converted >= 10 ? 1 : 2);
};