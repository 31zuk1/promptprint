import activeBranchFixture from '../test/fixtures/chatgpt-active-branch.json';
import directMessagesFixture from '../test/fixtures/chatgpt-direct-messages.json';
import { analyzeConversations } from '../analysis/pipeline';
import { DEFAULT_ANALYSIS_SETTINGS } from '../domain/models';
import { extractChatGptText, parseChatGptExport } from './chatgpt';
import { createImportBudget } from './limits';

describe('parseChatGptExport', () => {
  it('uses only the selected current branch and excludes system/tool/output records', () => {
    const result = parseChatGptExport(activeBranchFixture, 'conversations.json');

    expect(result.diagnostics.errors).toEqual([]);
    expect(result.conversations).toHaveLength(1);
    const conversation = result.conversations[0];
    expect(conversation?.title).toBe('分岐のある会話');
    expect(conversation?.createdAt).toBe(1_725_148_800_000);
    expect(conversation?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(conversation?.messages.map((message) => message.order)).toEqual([0, 1, 2]);
    expect(conversation?.messages.map((message) => message.originalText).join(' '))
      .not.toContain('DISCARDED_BRANCH_SENTINEL');
    expect(conversation?.messages.map((message) => message.originalText).join(' '))
      .not.toContain('hidden output');

    const analysis = analyzeConversations(result.conversations, {
      ...DEFAULT_ANALYSIS_SETTINGS,
      includePhrases: false,
      minDocumentFrequency: 1,
      termLimit: 120,
    });
    expect(JSON.stringify({ terms: analysis.terms, layout: analysis.layout }))
      .not.toMatch(/DISCARDED_BRANCH_SENTINEL/i);
  });

  it('falls back deterministically to the branch with the most recent usable message', () => {
    const fixture = structuredClone(activeBranchFixture) as unknown as Record<string, unknown>[];
    const conversation = fixture[0];
    if (conversation) delete conversation.current_node;

    const result = parseChatGptExport(fixture, 'conversations.json');

    expect(result.conversations[0]?.messages.map((message) => message.originalText).join(' '))
      .toContain('DISCARDED_BRANCH_SENTINEL');
    expect(result.diagnostics.warnings.some((item) => item.code === 'CHATGPT_BRANCH_FALLBACK'))
      .toBe(true);
  });

  it('caps aggregate work while evaluating many fallback graph branches', () => {
    const mapping: Record<string, unknown> = {
      root: { parent: null, message: null },
    };
    let parent = 'root';
    for (let index = 0; index < 499; index += 1) {
      const id = `shared-${index}`;
      mapping[id] = { parent, message: null };
      parent = id;
    }
    for (let index = 0; index < 1_001; index += 1) {
      mapping[`leaf-${index}`] = {
        parent,
        message: {
          role: 'assistant',
          create_time: 1_700_000_000 + index,
          content: `候補 ${index}`,
        },
      };
    }

    const result = parseChatGptExport([{ id: 'branch-heavy', mapping }], 'branches.json');

    expect(result.conversations).toHaveLength(1);
    expect(result.diagnostics.warnings.some((item) => item.code === 'CHATGPT_FALLBACK_WORK_LIMIT'))
      .toBe(true);
  });

  it('reports fallback leaf candidates omitted beyond the deterministic cap', () => {
    const mapping: Record<string, unknown> = {
      root: { parent: null, message: null },
    };
    for (let index = 0; index < 5_001; index += 1) {
      mapping[`leaf-${index}`] = {
        parent: 'root',
        message: {
          role: 'assistant',
          create_time: 1_700_000_000 + index,
          content: index === 5_000 ? 'OMITTED_NEWEST_SENTINEL' : `候補 ${index}`,
        },
      };
    }

    const result = parseChatGptExport([{ id: 'too-many-leaves', mapping }], 'leaves.json');
    const warning = result.diagnostics.warnings
      .find((item) => item.code === 'CHATGPT_FALLBACK_CANDIDATE_LIMIT');

    expect(result.conversations[0]?.messages[0]?.originalText).toBe('候補 4999');
    expect(JSON.stringify(result.conversations)).not.toContain('OMITTED_NEWEST_SENTINEL');
    expect(warning?.message).toContain('1件を探索対象外');
    expect(warning?.message).toContain('先頭5,000件');
    expect(result.diagnostics.warnings.find((item) => item.code === 'CHATGPT_BRANCH_FALLBACK')?.message)
      .toContain('安全上限内');
  });

  it('supports direct messages and extracts only textual rich-content blocks', () => {
    const result = parseChatGptExport(directMessagesFixture, 'direct.json');
    const messages = result.conversations[0]?.messages ?? [];

    expect(messages).toHaveLength(2);
    expect(messages[0]?.originalText).toBe('文章ブロック一\n\n文章ブロック二');
    expect(messages[0]?.createdAt).toBe(Date.parse('2026-01-02T03:04:05.000Z'));
    expect(messages[1]?.originalText).toBe('直接形式の回答');
    expect(messages.map((message) => message.originalText).join(' ')).not.toContain('秘密の実行結果');
    expect(result.diagnostics.recordsSkipped).toBe(3);
  });

  it('keeps long-prefix source, conversation, and message identities collision-resistant', () => {
    const sourcePrefix = 'source-directory/'.repeat(16);
    const conversationPrefix = 'conversation-identity-'.repeat(8);
    const messagePrefix = 'message-identity-'.repeat(10);
    const input = [
      {
        id: `${conversationPrefix}alpha`,
        messages: [
          { id: `${messagePrefix}alpha`, role: 'user', content: 'collisionprobe' },
          { id: `${messagePrefix}beta`, role: 'user', content: 'collisionprobe' },
        ],
      },
      {
        id: `${conversationPrefix}beta`,
        messages: [
          { id: `${messagePrefix}alpha`, role: 'user', content: 'collisionprobe' },
          { id: `${messagePrefix}beta`, role: 'user', content: 'collisionprobe' },
        ],
      },
    ];
    const first = parseChatGptExport(input, `${sourcePrefix}alpha.json`);
    const second = parseChatGptExport(input, `${sourcePrefix}beta.json`);
    const repeated = parseChatGptExport(input, `${sourcePrefix}alpha.json`);
    const conversations = [...first.conversations, ...second.conversations];
    const conversationIds = conversations.map((conversation) => conversation.id);
    const messageIds = conversations.flatMap((conversation) =>
      conversation.messages.map((message) => message.id));

    expect(first.conversations[0]?.sourceFile).toBe(second.conversations[0]?.sourceFile);
    expect(new Set(conversationIds).size).toBe(4);
    expect(new Set(messageIds).size).toBe(8);
    expect(first.conversations.map((conversation) => conversation.id))
      .toEqual(repeated.conversations.map((conversation) => conversation.id));

    const analysis = analyzeConversations(conversations, {
      ...DEFAULT_ANALYSIS_SETTINGS,
      includePhrases: false,
      minDocumentFrequency: 1,
      termLimit: 120,
    });
    const probe = analysis.terms.find((term) => term.term === 'collisionprobe');
    expect(probe?.dfUser).toBe(8);
    expect(probe?.conversationCoverage).toBe(4);
  });

  it('never normalizes more messages than a shared aggregate parser budget', () => {
    const budget = createImportBudget({ maxConversations: 2, maxMessages: 3 });
    const result = parseChatGptExport([
      {
        id: 'first',
        messages: [
          { role: 'user', content: '一つ目' },
          { role: 'assistant', content: '二つ目' },
        ],
      },
      {
        id: 'second',
        messages: [
          { role: 'user', content: '三つ目' },
          { role: 'assistant', content: '予算外A' },
          { role: 'user', content: '予算外B' },
        ],
      },
      { id: 'third', messages: [{ role: 'user', content: '後続会話' }] },
    ], 'budgeted.json', budget);

    expect(result.conversations).toHaveLength(2);
    expect(result.conversations.flatMap((conversation) => conversation.messages)).toHaveLength(3);
    expect(JSON.stringify(result.conversations)).not.toMatch(/予算外|後続会話/);
    expect(budget).toMatchObject({
      remainingConversations: 0,
      remainingMessages: 0,
      droppedConversations: 1,
      droppedMessages: 2,
    });
  });

  it('reports an exact aggregate-limit diagnostic when used as a standalone parser', () => {
    const result = parseChatGptExport(
      Array.from({ length: 20_001 }, () => null),
      'too-many-conversations.json',
    );
    const limitWarnings = result.diagnostics.warnings
      .filter((item) => item.code === 'IMPORT_AGGREGATE_LIMIT');

    expect(limitWarnings).toHaveLength(1);
    expect(limitWarnings[0]?.message).toContain('会話候補1件');
    expect(limitWarnings[0]?.message).toContain('メッセージ候補0件');
  });

  it('extracts strings, parts, and text objects without including asset pointers', () => {
    expect(extractChatGptText({
      content: {
        content_type: 'multimodal_text',
        parts: [
          '先頭',
          { type: 'text', text: '本文' },
          { type: 'image_asset_pointer', asset_pointer: 'private://asset' },
        ],
      },
    })).toBe('先頭\n\n本文');
  });

  it('bounds nested content item visits and stops before an adversarial array tail', () => {
    const ignoredAssets = Array.from(
      { length: 4_200 },
      () => ({ type: 'image_asset_pointer', asset_pointer: 'private://asset' }),
    );
    const result = parseChatGptExport([{
      messages: [{
        role: 'user',
        content: {
          content_type: 'multimodal_text',
          parts: ['保持される本文', ...ignoredAssets, 'UNREACHABLE_PRIVATE_SENTINEL'],
        },
      }],
    }], 'bounded.json');

    expect(result.conversations[0]?.messages[0]?.originalText).toBe('保持される本文');
    expect(JSON.stringify(result)).not.toContain('UNREACHABLE_PRIVATE_SENTINEL');
    expect(result.diagnostics.warnings.some((item) => item.code === 'CHATGPT_TEXT_TRUNCATED'))
      .toBe(true);
  });

  it('returns safe diagnostics for an unsupported shape', () => {
    const result = parseChatGptExport({ privatePayload: 'RAW_PRIVATE_SENTINEL' }, 'unknown.json');
    const rendered = JSON.stringify(result.diagnostics);

    expect(result.conversations).toEqual([]);
    expect(result.diagnostics.errors[0]?.code).toBe('CHATGPT_UNSUPPORTED_SHAPE');
    expect(rendered).not.toContain('RAW_PRIVATE_SENTINEL');
  });
});
