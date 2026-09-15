declare module '@quickbite/testing-data' {
  export const demoApi: import('@/lib/types').QuickBiteApi | undefined
  export const demoMeta: Record<
    number,
    {
      cuisine: import('@/lib/presentation').Category
      description: string
      image: string
      tag: string
    }
  >
}
