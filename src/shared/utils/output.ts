export function formatOutput(data: unknown, pretty?: boolean): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
}
