// Supabase > Project Settings > API (mesmos valores do painel web)
export const SUPABASE_URL = 'https://ftswxxdhxjkwufdagkzd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0c3d4eGRoeGprd3VmZGFna3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4ODQxMTksImV4cCI6MjExMDQ2MDExOX0.VD2-2rIO9mjgQ0YzJgMRTkn3YvUv0W5VM7qFDvv8jWA';

export const TERMO_VERSAO = 'v1-2026-11';

export const CORES = {
  fundo: '#000000',
  painel: '#111318',
  borda: '#3a3d45',
  texto: '#f2f2f2',
  mutado: '#9aa0aa',
  vermelho: '#e10600',
  vermelhoEscuro: '#8a0000',
  verde: '#22c55e',
  amarelo: '#f59e0b',
};

export const configurado = !SUPABASE_URL.startsWith('COLE_');
