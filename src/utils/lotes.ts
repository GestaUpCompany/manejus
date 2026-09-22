export function usaCurral(sistema: string | null | undefined): boolean {
  return sistema === 'Confinamento' || sistema === 'TIP'
}
