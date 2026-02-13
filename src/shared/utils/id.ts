export function formatNotionId(id: string): string {
  const hex = id.replace(/-/g, '')
  if (hex.length !== 32 || !/^[0-9a-f]+$/i.test(hex)) {
    return id
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
