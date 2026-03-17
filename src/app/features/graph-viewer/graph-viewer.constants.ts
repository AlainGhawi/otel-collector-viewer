import { ComponentType } from '../../core/models';

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 52;
export const COLUMN_GAP = 260;   // horizontal space between receiver → processor → exporter
export const ROW_GAP = 80;       // vertical space between nodes in the same column
export const PADDING_X = 80;
export const PADDING_Y = 80;

/** Column order for the graph layout (left → right) */
export const COLUMN_ORDER: ComponentType[] = ['extension', 'receiver', 'processor', 'exporter', 'connector'];

export const PIPELINE_COLORS = [
  '#f472b6', // pink
  '#38bdf8', // cyan
  '#4ade80', // green
  '#fb923c', // orange
  '#a78bfa', // purple
  '#facc15', // yellow
  '#f87171', // red
  '#2dd4bf', // teal
];
