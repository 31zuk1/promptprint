import { isRecord, timestampValue } from '../importers/detect';
import { PrivateTransportError } from './models';
import type { PrivateIdentity, PrivateListPage, PrivateTransport } from './models';

interface ChromeApi {
  tabs: { query(query: { url: string }): Promise<{ id?: number }[]> };
  scripting: { executeScript(options: {
    target: { tabId: number }; world: 'MAIN';
    func: typeof readChatGpt; args: [ReadCommand];
  }): Promise<{ result?: ReadResult }[]> };
}
interface ReadCommand {
  kind: 'identity' | 'list' | 'detail';
  identity: PrivateIdentity | null;
  offset: number;
  conversationId: string;
}
interface ReadResult {
  ok: boolean;
  status: number | null;
  code: string;
  retryAfterMs: number | null;
  data?: unknown;
}

/** Serialized into the permitted ChatGPT tab. Secrets never leave this invocation. */
export async function readChatGpt(command: ReadCommand): Promise<ReadResult> {
  if (location.origin !== 'https://chatgpt.com') return {ok:false,status:403,code:'wrong-origin',retryAfterMs:null};
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 45_000);
  const get = async (path: string, headers: Record<string, string> = {}): Promise<ReadResult> => {
    try {
      const response = await fetch(path, { method:'GET', credentials:'include', redirect:'error',
        cache:'no-store', headers, signal:abort.signal });
      const after = response.headers.get('retry-after');
      const retryAfterMs = after === null ? null : /^\d+(?:\.\d+)?$/.test(after)
        ? Number(after) * 1000 : Math.max(0, Date.parse(after) - Date.now());
      if (!response.ok) return {ok:false,status:response.status,code:'http',
        retryAfterMs:retryAfterMs !== null && Number.isFinite(retryAfterMs) ? retryAfterMs : null};
      if (!response.headers.get('content-type')?.includes('application/json')) {
        return {ok:false,status:403,code:'challenge-or-non-json',retryAfterMs:null};
      }
      const reader = response.body?.getReader();
      if (!reader) return {ok:false,status:null,code:'empty-response',retryAfterMs:null};
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      let bytes = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 32 * 1024 * 1024) {
          await reader.cancel();
          return {ok:false,status:413,code:'response-size-limit',retryAfterMs:null};
        }
        chunks.push(decoder.decode(part.value,{stream:true}));
      }
      chunks.push(decoder.decode());
      return {ok:true,status:200,code:'ok',retryAfterMs:null,data:JSON.parse(chunks.join(''))};
    } catch {
      return {ok:false,status:null,code:'network-or-schema',retryAfterMs:null};
    }
  };
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  try {
    const session = await get('/api/auth/session');
    if (!session.ok) return session;
    if (!record(session.data) || !record(session.data.user) ||
        typeof session.data.user.id !== 'string' || typeof session.data.user.email !== 'string' ||
        typeof session.data.accessToken !== 'string' || session.data.accessToken.length === 0) {
      return {ok:false,status:401,code:'authentication-required',retryAfterMs:null};
    }
    const user = session.data.user;
    if (command.identity && (user.id !== command.identity.accountId ||
        (user.email as string).toLowerCase() !== command.identity.email.toLowerCase())) {
      return {ok:false,status:403,code:'account-changed',retryAfterMs:null};
    }
    const headers: Record<string, string> = { Authorization:`Bearer ${session.data.accessToken}` };
    if (command.kind === 'identity') {
      const response = await get('/backend-api/accounts/check/v4-2023-04-27', headers);
      if (!response.ok) return response;
      if (!record(response.data) || !record(response.data.accounts)) {
        return {ok:false,status:null,code:'accounts-schema',retryAfterMs:null};
      }
      // The service can return the same account under its ID and a `default`
      // alias. Deduplicate verified IDs, not workspaces with different IDs.
      const personal = new Map<string, Record<string, unknown>>();
      for (const value of Object.values(response.data.accounts)) {
        if (!record(value) || !record(value.account) || value.account.structure !== 'personal' ||
            value.account.is_deactivated === true) continue;
        const account = value.account;
        if (typeof account.account_id !== 'string' || !account.account_id.trim()) {
          return {ok:false,status:403,code:'personal-workspace-unverified',retryAfterMs:null};
        }
        personal.set(account.account_id, account);
      }
      if (personal.size !== 1) {
        return {ok:false,status:403,code:'personal-workspace-ambiguous',retryAfterMs:null};
      }
      const account = [...personal.values()][0]!;
      if (typeof account.account_id !== 'string' || !account.account_id.trim()) {
        return {ok:false,status:403,code:'personal-workspace-unverified',retryAfterMs:null};
      }
      const plan = typeof account.plan_type === 'string' ? account.plan_type : 'unknown';
      return {ok:true,status:200,code:'ok',retryAfterMs:null,data:{
        accountId:user.id,workspaceId:account.account_id,email:user.email,plan,personal:true,
      }};
    }
    if (!command.identity?.personal || !command.identity.workspaceId) {
      return {ok:false,status:403,code:'identity-required',retryAfterMs:null};
    }
    headers['Chatgpt-Account-Id'] = command.identity.workspaceId;
    if (command.kind === 'list') {
      if (!Number.isSafeInteger(command.offset) || command.offset < 0 || command.offset > 100_000) {
        return {ok:false,status:null,code:'cursor-invalid',retryAfterMs:null};
      }
      return await get(`/backend-api/conversations?offset=${command.offset}&limit=50&order=updated`,headers);
    }
    if (!/^[a-zA-Z0-9-]{1,160}$/.test(command.conversationId)) {
      return {ok:false,status:null,code:'conversation-id-invalid',retryAfterMs:null};
    }
    return await get(`/backend-api/conversation/${encodeURIComponent(command.conversationId)}`,headers);
  } finally {
    clearTimeout(timer);
  }
}

/** Cancel the local consumer promptly; executeScript itself may still settle later. */
const awaitBrowserOperation = <T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    // Observe both late outcomes even after abort, so neither data nor rejection escapes.
    void operation.then((value) => {
      cleanup();
      if (signal.aborted) abort();
      else resolve(value);
    }, (error: unknown) => {
      cleanup();
      if (signal.aborted) abort();
      else reject(error);
    });
    if (signal.aborted) abort();
  });
};

export const PRIVATE_SOURCE_READ_LOCK = 'promptprint-chatgpt-read-v1';
let fallbackReadTail: Promise<void> = Promise.resolve();
const serializeSourceRead = async <T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
  const execute = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return operation();
  };
  if (navigator.locks) {
    // Unlike the UI/data lock, this lock lives until the physical MAIN-world
    // invocation settles, even when its local consumer has already cancelled.
    // Repeated pause/resume across tabs therefore cannot stack source GETs.
    return navigator.locks.request(PRIVATE_SOURCE_READ_LOCK, signal ? { signal } : {}, execute);
  }
  // Non-Chromium unit environments have no Web Locks; serialize within this
  // context too. The shipped Chrome extension uses the origin-global lock above.
  const queued = fallbackReadTail.then(execute);
  fallbackReadTail = queued.then(() => {}, () => {});
  return queued;
};

export function createChromeTransport(): PrivateTransport {
  let identity: PrivateIdentity | null = null;
  let tabId: number | null = null;
  const call = async (kind: ReadCommand['kind'], signal?: AbortSignal, offset = 0, conversationId = ''): Promise<unknown> => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const chrome = (globalThis as unknown as { chrome?: ChromeApi }).chrome;
    if (!chrome?.scripting || !chrome.tabs) throw new PrivateTransportError('extension-required');
    if (tabId === null) {
      const tabs = await awaitBrowserOperation(chrome.tabs.query({url:'https://chatgpt.com/*'}), signal);
      tabId = tabs.find(tab => typeof tab.id === 'number')?.id ?? null;
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (tabId === null) throw new PrivateTransportError('chatgpt-tab-required',401);
    let results: { result?: ReadResult }[];
    try {
      const sourceTabId = tabId;
      results = await awaitBrowserOperation(serializeSourceRead(() => chrome.scripting.executeScript({
        target:{tabId:sourceTabId},world:'MAIN',func:readChatGpt,
        args:[{kind,identity,offset,conversationId}],
      }), signal), signal);
    } catch {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      tabId = null;
      throw new PrivateTransportError('browser-connection');
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const result = results[0]?.result;
    if (!result) throw new PrivateTransportError('empty-browser-response');
    if (!result.ok) throw new PrivateTransportError(result.code,result.status,result.retryAfterMs);
    return result.data;
  };
  return {
    async identity(signal) {
      const value = await call('identity', signal);
      if (!isRecord(value) || typeof value.accountId !== 'string' || typeof value.workspaceId !== 'string' ||
          typeof value.email !== 'string' || typeof value.plan !== 'string' || value.personal !== true) {
        throw new PrivateTransportError('identity-schema',403);
      }
      identity = {accountId:value.accountId,workspaceId:value.workspaceId,email:value.email,plan:value.plan,personal:true};
      return identity;
    },
    async list(cursor, signal): Promise<PrivateListPage> {
      const offset = cursor === null ? 0 : Number(cursor);
      if (!Number.isSafeInteger(offset) || offset < 0) throw new PrivateTransportError('cursor-invalid');
      const value = await call('list',signal,offset);
      if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 100) {
        throw new PrivateTransportError('list-schema');
      }
      const items = value.items.map(item => {
        if (!isRecord(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,160}$/.test(item.id)) {
          throw new PrivateTransportError('list-item-schema');
        }
        return {id:item.id,createdAt:timestampValue(item.create_time),updatedAt:timestampValue(item.update_time)};
      });
      const ordered = items.length > 0 && items.every((item,index) => item.updatedAt !== null &&
        (index === 0 || (items[index-1]?.updatedAt ?? -Infinity) >= item.updatedAt));
      // Observed live responses use total as a look-ahead value (limit N => N+1),
      // not a verified account-history total. Even a short page must be followed
      // by an empty page before declaring this supported listing exhausted.
      // The terminal offset counts listing rows encountered, not all account history.
      return {items,total:items.length === 0 ? offset : null,order:ordered?'updated':'unknown',
        nextCursor:items.length === 0 ? null : String(offset+items.length)};
    },
    async detail(id,signal) { return call('detail',signal,0,id); },
  };
}
