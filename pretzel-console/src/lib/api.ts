export const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.['VITE_API_BASE'])
  ? (import.meta.env['VITE_API_BASE'] as string)
  : 'http://localhost:3000'
