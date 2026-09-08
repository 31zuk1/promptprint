import { analyzeConversations } from '../analysis/pipeline';
import { DEFAULT_ANALYSIS_SETTINGS } from '../domain/models';
import { createDemoConversations } from './demoConversations';

describe('synthetic demo', () => {
  it('uses the real pipeline and produces the intended language portrait', () => {
    const conversations = createDemoConversations();
    const result = analyzeConversations(conversations, DEFAULT_ANALYSIS_SETTINGS);
    const labels = result.layout.map((term) => term.display);

    expect(conversations).toHaveLength(12);
    expect(result.summary).toMatchObject({
      conversationCount: 12,
      userMessageCount: 24,
      assistantMessageCount: 24,
      providers: ['demo'],
    });
    expect(labels).toEqual(expect.arrayContaining(['ロボット', '研究', '要件', 'リスク', '交絡要因']));
    expect(labels).not.toEqual(expect.arrayContaining([
      'たい', 'しましょう', 'でき', 'しょう', 'しま', 'だけ', '作り',
      'すく', 'ごと', 'なく', 'なり', 'にし', 'すると', '付け', '決め',
    ]));
    expect(result.insights.adoption.map((term) => term.display)).toContain('交絡要因');
  });
});
