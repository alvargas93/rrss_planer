export type MotionPreference = 'system' | 'on' | 'off'

/** Decide si se reducen las animaciones. Pura, para poder probarla. */
export function shouldReduceMotion(preference: MotionPreference, systemReduces: boolean): boolean {
  if (preference === 'system') return systemReduces
  return preference === 'on'
}
