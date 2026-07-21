// Folder color tags. Client-safe (no DB import): shared by the API validation,
// the folder picker, and the dashboard dots. The class strings are written out
// literally so Tailwind's scanner keeps them in the build.

export const FOLDER_COLORS = {
  slate: { label: "Slate", dot: "bg-slate-400", ring: "ring-slate-400" },
  red: { label: "Red", dot: "bg-red-500", ring: "ring-red-500" },
  amber: { label: "Amber", dot: "bg-amber-500", ring: "ring-amber-500" },
  green: { label: "Green", dot: "bg-emerald-500", ring: "ring-emerald-500" },
  blue: { label: "Blue", dot: "bg-blue-500", ring: "ring-blue-500" },
  violet: { label: "Violet", dot: "bg-violet-500", ring: "ring-violet-500" },
  pink: { label: "Pink", dot: "bg-pink-500", ring: "ring-pink-500" },
} as const;

export type FolderColor = keyof typeof FOLDER_COLORS;

export const FOLDER_COLOR_KEYS = Object.keys(FOLDER_COLORS) as FolderColor[];

export const DEFAULT_FOLDER_COLOR: FolderColor = "slate";

export function isFolderColor(x: unknown): x is FolderColor {
  return typeof x === "string" && x in FOLDER_COLORS;
}

// Falls back to the default color's dot class for unknown/legacy values.
export function folderDot(color: string): string {
  return (FOLDER_COLORS as Record<string, { dot: string }>)[color]?.dot ??
    FOLDER_COLORS[DEFAULT_FOLDER_COLOR].dot;
}

export const MAX_FOLDER_NAME = 40;
