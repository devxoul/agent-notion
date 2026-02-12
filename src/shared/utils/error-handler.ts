import { APIErrorCode, ClientErrorCode, isNotionClientError } from '@notionhq/client'

export function handleError(error: Error): void {
  if (isNotionClientError(error)) {
    const hint = getNotionErrorHint(error.code)
    const message = hint ? `${error.message} — ${hint}` : error.message
    console.error(JSON.stringify({ error: message, code: error.code }))
  } else {
    console.error(JSON.stringify({ error: error.message }))
  }
  process.exit(1)
}

function getNotionErrorHint(code: string): string | undefined {
  switch (code) {
    case APIErrorCode.ObjectNotFound:
      return 'The resource was not found. Check that the integration has been shared with the page/database.'
    case APIErrorCode.RateLimited:
      return 'Rate limited by Notion API. Wait and retry.'
    case APIErrorCode.Unauthorized:
      return 'Invalid NOTION_TOKEN. Check your integration token.'
    case ClientErrorCode.RequestTimeout:
      return 'Request timed out. Try again.'
    default:
      return undefined
  }
}
