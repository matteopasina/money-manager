/** Reorder, hide or move cards without changing their data or presentation. */
export type HomeSectionId = 'portfolio' | 'month' | 'flow' | 'attention' | 'recent' | 'assistant'
export interface HomeSection { id: HomeSectionId; width: 'wide' | 'side'; mobileOrder: number }
export const homeSections: readonly HomeSection[] = [
  { id: 'portfolio', width: 'wide', mobileOrder: 2 },
  { id: 'month', width: 'side', mobileOrder: 1 },
  { id: 'flow', width: 'wide', mobileOrder: 4 },
  { id: 'attention', width: 'side', mobileOrder: 3 },
  { id: 'recent', width: 'wide', mobileOrder: 5 },
  { id: 'assistant', width: 'side', mobileOrder: 6 },
]
