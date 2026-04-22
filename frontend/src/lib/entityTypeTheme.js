export const ENTITY_TYPE_LABELS = {
  PROD: 'PRODUCTION',
  SUPPORT: 'SUPPORT',
  TDEV: 'DEVELOPMENT',
}

const ENTITY_TYPE_TONES = {
  PROD: {
    solid: 'bg-slate-700 text-slate-50',
    soft: 'bg-slate-100 text-slate-700',
  },
  SUPPORT: {
    solid: 'bg-slate-200 text-slate-800',
    soft: 'bg-slate-50 text-slate-600',
  },
  TDEV: {
    solid: 'bg-slate-500 text-slate-50',
    soft: 'bg-slate-100 text-slate-600',
  },
}

export function getEntityTypeTone(type, variant = 'soft') {
  return ENTITY_TYPE_TONES[type]?.[variant] || 'bg-muted text-muted-foreground'
}
