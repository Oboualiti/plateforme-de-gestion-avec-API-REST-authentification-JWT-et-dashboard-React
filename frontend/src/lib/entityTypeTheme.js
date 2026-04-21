export const ENTITY_TYPE_LABELS = {
  PROD: 'PRODUCTION',
  SUPPORT: 'SUPPORT',
  TDEV: 'DEVELOPMENT',
}

const ENTITY_TYPE_TONES = {
  PROD: {
    solid: 'bg-primary text-primary-foreground',
    soft: 'bg-amber-100 text-amber-800',
  },
  SUPPORT: {
    solid: 'bg-secondary text-secondary-foreground',
    soft: 'bg-indigo-100 text-indigo-800',
  },
  TDEV: {
    solid: 'bg-cyan-700 text-cyan-50',
    soft: 'bg-cyan-100 text-cyan-800',
  },
}

export function getEntityTypeTone(type, variant = 'soft') {
  return ENTITY_TYPE_TONES[type]?.[variant] || 'bg-muted text-muted-foreground'
}
