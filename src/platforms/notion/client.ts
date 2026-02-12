let activeUserId: string | undefined

export function setActiveUserId(userId: string | undefined): void {
  activeUserId = userId
}

export function getActiveUserId(): string | undefined {
  return activeUserId
}

export async function internalRequest(
  tokenV2: string,
  endpoint: string,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    cookie: `token_v2=${tokenV2}`,
  }

  if (activeUserId) {
    headers['x-notion-active-user-header'] = activeUserId
    headers.cookie += `; notion_user_id=${activeUserId}`
  }

  const response = await fetch(`https://www.notion.so/api/v3/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Notion internal API error: ${response.status}`)
  }

  return response.json()
}
