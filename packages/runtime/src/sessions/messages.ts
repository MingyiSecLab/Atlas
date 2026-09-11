import type { MastraDBMessage } from '@mastra/core/agent-controller';
import type {
  RuntimeSessionAttachment,
  RuntimeSessionMessage,
  RuntimeSessionMessageBlock,
  RuntimeSessionToolStatus,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object'
    ? (value as UnknownRecord)
    : undefined;
}

function printable(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(
      value,
      (_key, nested) =>
        typeof nested === 'bigint' ? nested.toString() : nested,
      2,
    );
  } catch {
    return String(value);
  }
}

function toolStatus(invocation: UnknownRecord): RuntimeSessionToolStatus {
  const state = invocation.state;
  if (state === 'approval-requested') return 'waiting_approval';
  if (state === 'output-denied') return 'denied';
  if (state === 'output-error' || invocation.isError === true) return 'error';
  if (state === 'result') return 'success';
  if (state === 'partial-call') return 'pending';
  return 'running';
}

function mapToolInvocation(part: UnknownRecord): RuntimeSessionMessageBlock | null {
  const invocation = asRecord(part.toolInvocation);
  if (!invocation) return null;
  return {
    type: 'tool',
    id: String(invocation.toolCallId ?? ''),
    name: String(invocation.toolName ?? 'tool'),
    input: printable(invocation.args ?? invocation.rawInput),
    output: printable(
      invocation.result ?? invocation.errorText ?? invocation.approval,
    ),
    status: toolStatus(invocation),
  };
}

function dataUrl(data: unknown, mediaType: string): string | undefined {
  if (typeof data !== 'string' || !data) return undefined;
  if (data.startsWith('data:')) return data;
  return `data:${mediaType};base64,${data}`;
}

function mapAttachment(
  messageId: string,
  part: UnknownRecord,
  index: number,
): RuntimeSessionAttachment | null {
  const mediaType =
    typeof part.mediaType === 'string'
      ? part.mediaType
      : typeof part.mimeType === 'string'
        ? part.mimeType
        : 'application/octet-stream';
  if (part.type !== 'file' && !mediaType.startsWith('image/')) return null;
  const url = dataUrl(part.data, mediaType);
  if (!url) return null;
  return {
    id: `${messageId}-file-${index}`,
    name:
      typeof part.filename === 'string' ? part.filename : `attachment-${index + 1}`,
    mediaType,
    ...(typeof part.data === 'string'
      ? { sizeBytes: Math.floor((part.data.length * 3) / 4) }
      : {}),
    dataUrl: url,
  };
}

export function toRuntimeSessionMessage(
  message: MastraDBMessage,
  modelName?: string,
): RuntimeSessionMessage | null {
  if (message.role !== 'user' && message.role !== 'assistant') return null;

  const blocks: RuntimeSessionMessageBlock[] = [];
  const attachments: RuntimeSessionAttachment[] = [];
  const pendingLegacyTools = new Map<string, { name: string; args: unknown }>();

  // Extract raw parts defensively from message.content
  let rawParts: unknown[] = [];
  if (typeof message.content === 'string') {
    blocks.push({ type: 'text', text: message.content });
  } else if (message.content && typeof message.content === 'object') {
    const contentObj = message.content as Record<string, unknown>;
    if (Array.isArray(contentObj.parts)) {
      rawParts = contentObj.parts;
    } else if (typeof contentObj.content === 'string' && contentObj.content) {
      blocks.push({ type: 'text', text: contentObj.content });
    } else if (typeof contentObj.text === 'string' && contentObj.text) {
      blocks.push({ type: 'text', text: contentObj.text });
    }
  }

  for (const [index, rawPart] of rawParts.entries()) {
    const part = asRecord(rawPart);
    if (!part || typeof part.type !== 'string') continue;
    const attachment = mapAttachment(message.id, part, index);
    if (attachment) attachments.push(attachment);

    if (part.type === 'text' && typeof part.text === 'string') {
      blocks.push({ type: 'text', text: part.text });
      continue;
    }
    if (part.type === 'reasoning') {
      const text =
        typeof part.reasoning === 'string'
          ? part.reasoning
          : typeof part.text === 'string'
            ? part.text
            : '';
      if (text) blocks.push({ type: 'reasoning', text });
      continue;
    }
    if (part.type === 'tool-invocation') {
      const tool = mapToolInvocation(part);
      if (tool) blocks.push(tool);
      continue;
    }
    if (part.type === 'tool-call') {
      const id = String(part.toolCallId ?? '');
      pendingLegacyTools.set(id, {
        name: String(part.toolName ?? 'tool'),
        args: part.args,
      });
      continue;
    }
    if (part.type === 'tool-result') {
      const id = String(part.toolCallId ?? '');
      const call = pendingLegacyTools.get(id);
      blocks.push({
        type: 'tool',
        id,
        name: String(part.toolName ?? call?.name ?? 'tool'),
        input: printable(call?.args),
        output: printable(part.result),
        status: part.isError === true ? 'error' : 'success',
      });
      pendingLegacyTools.delete(id);
    }
  }

  for (const [id, call] of pendingLegacyTools) {
    blocks.push({
      type: 'tool',
      id,
      name: call.name,
      input: printable(call.args),
      status: 'running',
    });
  }

  let createdAtIso: string;
  try {
    if (message.createdAt instanceof Date) {
      createdAtIso = message.createdAt.toISOString();
    } else if (typeof message.createdAt === 'string' && message.createdAt) {
      createdAtIso = message.createdAt;
    } else if (typeof message.createdAt === 'number') {
      createdAtIso = new Date(message.createdAt).toISOString();
    } else {
      createdAtIso = new Date().toISOString();
    }
  } catch {
    createdAtIso = new Date().toISOString();
  }

  return {
    id: message.id,
    role: message.role,
    blocks,
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(message.role === 'assistant' && modelName ? { modelName } : {}),
    createdAt: createdAtIso,
  };
}
