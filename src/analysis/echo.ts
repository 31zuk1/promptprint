import type { EchoInsight } from '../domain/models';
import type { AnalysisDocument } from './statistics';

const uniqueWordTerms = (document: AnalysisDocument): Set<string> =>
  new Set(document.words.map((token) => token.term));

export const echoConfidence = (eligiblePairs: number): EchoInsight['confidence'] => {
  if (eligiblePairs === 0) return 'insufficient';
  if (eligiblePairs < 5) return 'low';
  if (eligiblePairs < 15) return 'medium';
  return 'high';
};

/**
 * Weighted lexical reuse in immediately adjacent user -> assistant messages.
 * The value is descriptive only; it is not an answer-quality score.
 */
export const calculateEchoRate = (documents: AnalysisDocument[]): EchoInsight => {
  const globalDocumentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const term of uniqueWordTerms(document)) {
      globalDocumentFrequency.set(term, (globalDocumentFrequency.get(term) ?? 0) + 1);
    }
  }

  const totalDocuments = documents.length;
  let weightedEcho = 0;
  let totalPairWeight = 0;
  let eligiblePairs = 0;
  const conversationDocuments = new Map<string, Array<{ document: AnalysisDocument; sequence: number }>>();

  documents.forEach((document, sequence) => {
    const list = conversationDocuments.get(document.conversation.id) ?? [];
    list.push({ document, sequence });
    conversationDocuments.set(document.conversation.id, list);
  });

  for (const conversation of conversationDocuments.values()) {
    conversation.sort((left, right) =>
      left.document.message.order - right.document.message.order || left.sequence - right.sequence);

    for (let index = 0; index < conversation.length - 1; index += 1) {
      const userDocument = conversation[index]?.document;
      const assistantDocument = conversation[index + 1]?.document;
      if (!userDocument || !assistantDocument) continue;
      if (userDocument.message.role !== 'user' || assistantDocument.message.role !== 'assistant') continue;

      const userTerms = uniqueWordTerms(userDocument);
      const assistantTerms = uniqueWordTerms(assistantDocument);
      // One surviving token is often a greeting or command fragment and is too noisy.
      if (userTerms.size < 2 || assistantTerms.size === 0) continue;

      let echoedWeight = 0;
      let userWeight = 0;
      for (const term of userTerms) {
        const documentFrequency = globalDocumentFrequency.get(term) ?? 0;
        const idf = Math.log((totalDocuments + 1) / (documentFrequency + 1)) + 1;
        userWeight += idf;
        if (assistantTerms.has(term)) echoedWeight += idf;
      }
      if (userWeight === 0) continue;

      const pairEcho = echoedWeight / userWeight;
      const pairWeight = Math.sqrt(userTerms.size);
      weightedEcho += pairEcho * pairWeight;
      totalPairWeight += pairWeight;
      eligiblePairs += 1;
    }
  }

  return {
    rate: eligiblePairs === 0 || totalPairWeight === 0 ? null : weightedEcho / totalPairWeight,
    eligiblePairs,
    confidence: echoConfidence(eligiblePairs),
  };
};

export const computeEchoInsight = calculateEchoRate;

