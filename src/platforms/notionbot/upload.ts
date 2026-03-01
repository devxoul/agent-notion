import fs from 'node:fs'
import { isImageType, resolveFileInfo } from '@/shared/upload/detect-type'
import type { NotionClient } from './client'

type FileUploadResult = {
  fileUploadId: string
  url: string
  contentType: string
}

type UploadedBlock = {
  id: string
  type: 'image' | 'file'
  url: string
}

type AppendResult = {
  results?: Array<{
    results?: Array<{
      id?: string
    }>
  }>
}

export async function uploadFileOnly(client: NotionClient, filePath: string): Promise<FileUploadResult> {
  const fileInfo = resolveFileInfo(filePath)

  const createResponse = await client.fileUploads.create({
    mode: 'single_part',
    filename: fileInfo.name,
    content_type: fileInfo.contentType,
  })
  const fileUploadId = createResponse.id

  const fileBuffer = fs.readFileSync(fileInfo.path)
  await client.fileUploads.send({
    file_upload_id: fileUploadId,
    file: {
      data: fileBuffer,
      filename: fileInfo.name,
    },
    part_number: 1,
  } as any)

  return {
    fileUploadId,
    url: `https://www.notion.so/file-uploads/${fileUploadId}`,
    contentType: fileInfo.contentType,
  }
}

export async function uploadFile(
  client: NotionClient,
  parentId: string,
  filePath: string,
  afterId?: string,
  beforeId?: string,
): Promise<UploadedBlock> {
  const upload = await uploadFileOnly(client, filePath)

  const blockType: UploadedBlock['type'] = isImageType(upload.contentType) ? 'image' : 'file'
  const blockObject =
    blockType === 'image'
      ? {
          type: 'image' as const,
          image: {
            type: 'file_upload' as const,
            file_upload: { id: upload.fileUploadId },
          },
        }
      : {
          type: 'file' as const,
          file: {
            type: 'file_upload' as const,
            file_upload: { id: upload.fileUploadId },
          },
        }

  let positionArgs: Record<string, unknown> = {}
  if (beforeId) {
    const resolved = await client.resolveBeforePosition(parentId, beforeId)
    positionArgs = resolved
  } else if (afterId) {
    positionArgs = { after: afterId }
  }

  const appendResponse = (await client.blocks.children.append({
    block_id: parentId,
    children: [blockObject],
    ...positionArgs,
  })) as AppendResult

  const blockId = appendResponse.results?.[0]?.results?.[0]?.id
  if (!blockId) {
    throw new Error('Failed to append uploaded file block')
  }

  return {
    id: blockId,
    type: blockType,
    url: upload.url,
  }
}
