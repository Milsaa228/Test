export const colors = {
  bg: '#F2F3F5',
  card: '#FFFFFF',
  text: '#1C1C1E',
  muted: '#8A8A8E',
  border: '#E4E5E9',
  accent: '#FFDD2D',
  accentText: '#1C1C1E',
  danger: '#D93025',
  ok: '#2E9E4F',
  zone: 'rgba(255, 170, 0, 0.18)',
  zoneStroke: 'rgba(230, 140, 0, 0.8)',
};

export const card = {
  backgroundColor: colors.card,
  borderRadius: 20,
  padding: 16,
  marginBottom: 12,
} as const;

/** Эмодзи-категории для заметок. */
export const CATEGORIES = [
  { emoji: '📍', label: 'Место' },
  { emoji: '🍔', label: 'Еда' },
  { emoji: '☕', label: 'Кафе' },
  { emoji: '🛒', label: 'Купить' },
  { emoji: '🔑', label: 'Код' },
  { emoji: '💡', label: 'Идея' },
  { emoji: '❤️', label: 'Любимое' },
  { emoji: '⚠️', label: 'Осторожно' },
];
