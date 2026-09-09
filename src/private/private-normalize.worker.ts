/// <reference lib="webworker" />
import { PrivateTransportError } from './models';
import { normalizePrivateDetail } from './normalize';
import type { NormalizationRequest, NormalizationResponse } from './normalizer';

const worker = self as DedicatedWorkerGlobalScope;
worker.onmessage = (event: MessageEvent<NormalizationRequest>) => {
  const request = event.data;
  try {
    worker.postMessage({ requestId: request.requestId, record: normalizePrivateDetail(request.input, request.item, request.namespace, request.fetchedAt) } satisfies NormalizationResponse);
  } catch (error) {
    worker.postMessage({ requestId: request.requestId, code: error instanceof PrivateTransportError ? error.code : 'NORMALIZATION_FAILED' } satisfies NormalizationResponse);
  }
};
export {};
