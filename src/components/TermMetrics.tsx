import type { TermStats } from '../domain/models';
import { messageRateLabel, tokenRateLabel } from '../analysis/presentation';

export function TermMetrics({ term }: { term: TermStats }) {
  return (
    <div className="term-metrics">
      <table>
        <caption>その語を含む発言の割合</caption>
        <thead><tr><th scope="col">指標</th><th scope="col">あなた</th><th scope="col">AI</th></tr></thead>
        <tbody>
          <tr><th scope="row">発言出現率</th>
            <td>{messageRateLabel(term.rateUser, term.userMessageCount)}</td>
            <td>{messageRateLabel(term.rateAssistant, term.assistantMessageCount)}</td></tr>
          <tr><th scope="row">出現発言 / 全発言</th>
            <td>{term.dfUser} / {term.userMessageCount}</td><td>{term.dfAssistant} / {term.assistantMessageCount}</td></tr>
          <tr><th scope="row">1,000トークンあたり</th>
            <td>{tokenRateLabel(term.per1000TokensUser)}{term.per1000TokensUser === null ? '' : '回'}</td>
            <td>{tokenRateLabel(term.per1000TokensAssistant)}{term.per1000TokensAssistant === null ? '' : '回'}</td></tr>
          <tr><th scope="row">出現回数 / トークン数</th>
            <td>{term.tokenFrequencyUser} / {term.tokenTotalUser}</td><td>{term.tokenFrequencyAssistant} / {term.tokenTotalAssistant}</td></tr>
        </tbody>
      </table>
      <p>トークン＝前処理・品詞解析後の内容語と構成語。複合語は同じ語列内の出現回数を数えます。表示の選び方を変えても分母は同じです。</p>
      <dl><div><dt>会話カバー</dt><dd>{term.conversationCoverage}件</dd></div></dl>
    </div>
  );
}
