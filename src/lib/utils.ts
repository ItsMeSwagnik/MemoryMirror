import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Resolves API paths — uses VITE_API_BASE when deployed (e.g. on Vercel pointing to Railway/Render)
export const api = (path: string) => `${import.meta.env.VITE_API_BASE ?? ""}${path}`;
