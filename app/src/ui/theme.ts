/** HoldProof visual identity: deep ink, a warm "held" amber, and a clear released green. */
export const colors = {
  ink: '#0E1A2B',
  inkSoft: '#2B3A52',
  slate: '#5B6B82',
  mist: '#8C9AB0',
  line: '#E3E8EF',
  paper: '#F6F4EF',
  card: '#FFFFFF',
  amber: '#E8A33D',
  amberSoft: '#FCF1DE',
  green: '#1F9D6B',
  greenSoft: '#E1F4EC',
  coral: '#D9534F',
  coralSoft: '#FBE7E6',
  blue: '#2F6FDE',
  blueSoft: '#E5EEFC',
  violet: '#6B5BD2',
  violetSoft: '#EEEBFB',
  white: '#FFFFFF',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

export const type = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.8, color: colors.ink },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.ink },
  heading: { fontSize: 16, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, lineHeight: 21, color: colors.inkSoft },
  small: { fontSize: 13, lineHeight: 18, color: colors.slate },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.1, color: colors.slate, textTransform: 'uppercase' as const },
  mono: { fontFamily: 'monospace', fontSize: 12, color: colors.inkSoft },
};

export const shadow = {
  shadowColor: '#0E1A2B',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
