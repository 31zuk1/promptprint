import type {
  MessageRole,
  NormalizedConversation,
  NormalizedMessage,
} from '../domain/models';

interface DemoTurn {
  role: MessageRole;
  text: string;
  day: number;
}

const topics: Array<{ title: string; turns: DemoTurn[] }> = [
  {
    title: '全方向ロボットの試作',
    turns: [
      { role: 'user', day: 1, text: 'ロボットの全方向移動機構を実装したい。研究用のデータも取りたい。' },
      { role: 'assistant', day: 1, text: 'まず要件と制約を整理し、実装リスクを小さくする検証計画を作りましょう。' },
      { role: 'user', day: 2, text: 'ロボットの車輪配置と制御実装の可能性を比較して。' },
      { role: 'assistant', day: 2, text: '優先順位は安全性、制御精度、検証可能性です。データ取得の要件も定義します。' },
    ],
  },
  {
    title: '北朝鮮の公開情報研究',
    turns: [
      { role: 'user', day: 5, text: '北朝鮮について公開データだけで研究する方法を考えたい。' },
      { role: 'assistant', day: 5, text: '情報源の制約と偏りが大きいため、交絡要因と検証手順を明示する必要があります。' },
      { role: 'user', day: 6, text: '北朝鮮の時系列データを実装に使える形で整理して。' },
      { role: 'assistant', day: 6, text: '出典ごとの信頼性、欠損リスク、比較の要件を表にして検証しましょう。' },
    ],
  },
  {
    title: '海外大学院への留学準備',
    turns: [
      { role: 'user', day: 9, text: '留学してロボット研究を続けたい。大学院選びのデータがほしい。' },
      { role: 'assistant', day: 9, text: '研究テーマ、費用、応募要件の優先順位を決めると比較しやすくなります。' },
      { role: 'user', day: 10, text: '留学先で実装中心の研究ができる可能性を調べたい。' },
      { role: 'assistant', day: 10, text: '候補校ごとに制約とリスクを記録し、公式データで検証してください。' },
    ],
  },
  {
    title: '新規事業の仮説検証',
    turns: [
      { role: 'user', day: 14, text: 'ロボットを使う事業の可能性を顧客データから研究したい。' },
      { role: 'assistant', day: 14, text: '事業仮説を要件へ分解し、需要リスクを小さな実験で検証しましょう。' },
      { role: 'user', day: 15, text: '事業の価値を確かめる実装を一週間で作りたい。' },
      { role: 'assistant', day: 15, text: '機能の優先順位を絞り、成功条件と制約を先に決めるのが有効です。' },
    ],
  },
  {
    title: '京都の調査旅行',
    turns: [
      { role: 'user', day: 19, text: '京都旅行でロボット展示と研究施設を回りたい。移動データもまとめて。' },
      { role: 'assistant', day: 19, text: '開館時間という制約を確認し、移動リスクを含めて旅程を検証します。' },
      { role: 'user', day: 20, text: '展示を見る優先順位より、研究者と話せる可能性を重視したい。' },
      { role: 'assistant', day: 20, text: '予約要件を確認し、代替案を含む実装可能な計画にします。' },
    ],
  },
  {
    title: '政治データの比較設計',
    turns: [
      { role: 'user', day: 24, text: '北朝鮮と周辺国の公開データを比較する研究設計を相談したい。' },
      { role: 'assistant', day: 24, text: '交絡要因を統制できない制約があるので、因果ではなく関連として検証します。' },
      { role: 'user', day: 25, text: '交絡要因を明記して北朝鮮研究のデータ表を実装しよう。' },
      { role: 'assistant', day: 25, text: '列の要件、欠損リスク、出典の優先順位を決めると再検証できます。' },
    ],
  },
  {
    title: 'ロボット制御ログの可視化',
    turns: [
      { role: 'user', day: 29, text: 'ロボットの制御データを見やすくする実装を研究している。' },
      { role: 'assistant', day: 29, text: '表示要件を絞り、異常値のリスクと検証方法を設計しましょう。' },
      { role: 'user', day: 30, text: '交絡要因も表示して、ロボット実験の可能性を誤読させたくない。' },
      { role: 'assistant', day: 30, text: '注釈の優先順位と色の制約を決め、実データで検証します。' },
    ],
  },
  {
    title: '留学応募ポートフォリオ',
    turns: [
      { role: 'user', day: 34, text: '留学応募でロボット研究と実装経験を伝える文章を作りたい。' },
      { role: 'assistant', day: 34, text: '読み手の要件に合わせ、成果と検証結果を優先して示しましょう。' },
      { role: 'user', day: 35, text: '研究の可能性を誇張せず、データで説明したい。' },
      { role: 'assistant', day: 35, text: '主張ごとの根拠、制約、残るリスクを短く添えると信頼性が上がります。' },
    ],
  },
  {
    title: '小規模事業インタビュー',
    turns: [
      { role: 'user', day: 39, text: '事業の顧客インタビューから共通データを集めたい。' },
      { role: 'assistant', day: 39, text: '質問の要件をそろえ、誘導によるリスクと交絡要因を記録します。' },
      { role: 'user', day: 40, text: '交絡要因を分けて事業の可能性を検証する実装にしたい。' },
      { role: 'assistant', day: 40, text: '優先順位の高い仮説から検証し、判断の制約も残しましょう。' },
    ],
  },
  {
    title: '研究発表の構成',
    turns: [
      { role: 'user', day: 44, text: 'ロボット研究の発表で実装データを中心に見せたい。' },
      { role: 'assistant', day: 44, text: '目的、要件、検証、結果、リスクの順にすると伝わりやすいです。' },
      { role: 'user', day: 45, text: '北朝鮮研究にも使える発表構成の可能性はある？' },
      { role: 'assistant', day: 45, text: '対象の制約は異なりますが、データと検証範囲を示す構造は共有できます。' },
    ],
  },
  {
    title: '週末の実装スプリント',
    turns: [
      { role: 'user', day: 49, text: '週末にロボット事業のデモ実装を完成させたい。' },
      { role: 'assistant', day: 49, text: '必須要件だけに優先順位を付け、技術リスクを早めに検証しましょう。' },
      { role: 'user', day: 50, text: '研究データを読み込む可能性までデモに含めたい。' },
      { role: 'assistant', day: 50, text: '入力の制約と失敗時の要件を決めれば、安全に実装できます。' },
    ],
  },
  {
    title: '成果の振り返り',
    turns: [
      { role: 'user', day: 54, text: '留学、研究、事業、ロボット実装の会話データを振り返りたい。' },
      { role: 'assistant', day: 54, text: 'テーマ別の頻度だけでなく、要件やリスクの変化も検証すると有益です。' },
      { role: 'user', day: 55, text: '交絡要因に注意しながら、言葉の変化と可能性を見たい。' },
      { role: 'assistant', day: 55, text: '時系列の制約を明記し、因果ではない観測結果として優先順位を付けましょう。' },
    ],
  },
];

const BASE_TIME = Date.UTC(2026, 0, 1, 9, 0, 0);

const makeMessage = (
  conversationId: string,
  turn: DemoTurn,
  index: number,
): NormalizedMessage => {
  const text = turn.text.normalize('NFKC');
  return {
    id: `${conversationId}-m${index + 1}`,
    conversationId,
    provider: 'demo',
    role: turn.role,
    createdAt: BASE_TIME + turn.day * 86_400_000 + index * 60_000,
    order: index,
    originalText: text,
    analysisText: text,
  };
};

export const createDemoConversations = (): NormalizedConversation[] =>
  topics.map((topic, index) => {
    const id = `demo-${String(index + 1).padStart(2, '0')}`;
    const messages = topic.turns.map((turn, messageIndex) => makeMessage(id, turn, messageIndex));
    return {
      id,
      provider: 'demo',
      title: topic.title,
      createdAt: messages[0]?.createdAt ?? null,
      updatedAt: messages.at(-1)?.createdAt ?? null,
      messages,
      sourceFile: '合成デモ',
    };
  });
