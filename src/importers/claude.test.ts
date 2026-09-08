import claudeFixture from '../test/fixtures/claude-representative.json';
import { analyzeConversations } from '../analysis/pipeline';
import { DEFAULT_ANALYSIS_SETTINGS } from '../domain/models';
import { extractClaudeText, parseClaudeExport } from './claude';
import { createImportBudget } from './limits';

describe('parseClaudeExport', () => {
  it('conservatively maps representative Claude role and content variants', () => {
    const result = parseClaudeExport(claudeFixture, 'claude-export.json');

    expect(result.diagnostics.errors).toEqual([]);
    expect(result.conversations).toHaveLength(2);
    expect(result.conversations[0]?.provider).toBe('claude');
    expect(result.conversations[0]?.title).toBe('Claude代表形式');
    expect(result.conversations[0]?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(result.conversations[0]?.messages[1]?.originalText).toBe('安全に形式を確認します');
    expect(result.conversations[1]?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(result.diagnostics.warnings.some((item) => item.code === 'CLAUDE_EXPERIMENTAL'))
      .toBe(true);
  });

  it('supports bounded nested textual blocks and ignores non-text content', () => {
    expect(extractClaudeText({
      content: [
        { type: 'text', text: '安全な本文' },
        { type: 'image', source: { data: 'RAW_PRIVATE_SENTINEL' } },
        { content: { type: 'text', value: 'ネストした本文' } },
      ],
    })).toBe('安全な本文\n\nネストした本文');
  });

  it('bounds nested content item visits and stops before an adversarial array tail', () => {
    const ignoredAssets = Array.from(
      { length: 4_200 },
      () => ({ type: 'image', source: { data: 'private-binary-placeholder' } }),
    );
    const result = parseClaudeExport({ chats: [{ messages: [{
      role: 'user',
      content: ['保持される本文', ...ignoredAssets, 'UNREACHABLE_PRIVATE_SENTINEL'],
    }] }] }, 'claude-bounded.json');

    expect(result.conversations[0]?.messages[0]?.originalText).toBe('保持される本文');
    expect(JSON.stringify(result)).not.toContain('UNREACHABLE_PRIVATE_SENTINEL');
    expect(result.diagnostics.warnings.some((item) => item.code === 'CLAUDE_TEXT_TRUNCATED'))
      .toBe(true);
  });

  it('excludes assistant-shaped tool, execution, control, and recipient records', () => {
    const result = parseClaudeExport({ chats: [{ messages: [
      { role: 'user', content: '通常の質問' },
      { role: 'assistant', type: 'tool_result', text: 'secrettoolpayload executiondump' },
      { role: 'assistant', type: 'system', text: 'secret system context' },
      { role: 'assistant', recipient: 'python', content: 'secret recipient payload' },
      { role: 'assistant', content: { type: 'computer_output', text: 'secret computer output' } },
    ] }] }, 'claude-controls.json');

    expect(result.conversations[0]?.messages.map((message) => message.originalText))
      .toEqual(['通常の質問']);
    expect(JSON.stringify(result.conversations)).not.toMatch(/secret|executiondump/);
    expect(result.diagnostics.recordsSkipped).toBe(4);
  });

  it('applies the shared message budget incrementally across Claude conversations', () => {
    const budget = createImportBudget({ maxConversations: 5, maxMessages: 2 });
    const result = parseClaudeExport({ chats: [
      { id: 'first', messages: [
        { role: 'user', content: '一つ目' },
        { role: 'assistant', content: '二つ目' },
        { role: 'user', content: '予算外' },
      ] },
      { id: 'second', messages: [{ role: 'assistant', content: '後続会話' }] },
    ] }, 'claude-budgeted.json', budget);

    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0]?.messages).toHaveLength(2);
    expect(JSON.stringify(result.conversations)).not.toMatch(/予算外|後続会話/);
    expect(budget).toMatchObject({
      remainingConversations: 4,
      remainingMessages: 0,
      droppedConversations: 1,
      droppedMessages: 1,
    });
  });

  it('keeps long-prefix source, conversation, and message identities collision-resistant', () => {
    const sourcePrefix = 'claude-source-directory/'.repeat(12);
    const conversationPrefix = 'claude-conversation-identity-'.repeat(6);
    const messagePrefix = 'claude-message-identity-'.repeat(7);
    const input = { chats: [
      {
        uuid: `${conversationPrefix}alpha`,
        messages: [
          { uuid: `${messagePrefix}alpha`, role: 'user', content: 'collisionprobe' },
          { uuid: `${messagePrefix}beta`, role: 'user', content: 'collisionprobe' },
        ],
      },
      {
        uuid: `${conversationPrefix}beta`,
        messages: [
          { uuid: `${messagePrefix}alpha`, role: 'user', content: 'collisionprobe' },
          { uuid: `${messagePrefix}beta`, role: 'user', content: 'collisionprobe' },
        ],
      },
    ] };
    const first = parseClaudeExport(input, `${sourcePrefix}alpha.json`);
    const second = parseClaudeExport(input, `${sourcePrefix}beta.json`);
    const repeated = parseClaudeExport(input, `${sourcePrefix}alpha.json`);
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

  it('does not expose raw values in unsupported-shape diagnostics', () => {
    const result = parseClaudeExport(
      { account: { transcript: 'RAW_PRIVATE_SENTINEL' } },
      'claude-unknown.json',
    );
    const rendered = JSON.stringify(result.diagnostics);

    expect(result.conversations).toEqual([]);
    expect(result.diagnostics.errors[0]?.code).toBe('CLAUDE_UNSUPPORTED_SHAPE');
    expect(rendered).not.toContain('RAW_PRIVATE_SENTINEL');
    expect(rendered).toContain('キー: account');
  });
});
