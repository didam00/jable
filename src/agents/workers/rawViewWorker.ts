/// <reference lib="webworker" />

import { compressToToon, decompressFromToon } from '../compression/toon';
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from '../compression/lzString';
import { exportToJSON, parseJSON } from '../parser';
import type {
  RawViewWorkerAction,
  RawViewWorkerActionMap,
  RawViewWorkerRequest,
  RawViewWorkerResponse,
} from './rawViewWorker.types';

type WorkerResult<T extends RawViewWorkerAction> = RawViewWorkerActionMap[T]['result'];

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<RawViewWorkerRequest>) => {
  const { id, action, payload } = event.data;

  try {
    const result = executeAction(action, payload);
    postResponse({ id, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 워커 오류가 발생했습니다.';
    postResponse({ id, error: message });
  }
};

function executeAction<TAction extends RawViewWorkerAction>(
  action: TAction,
  payload: RawViewWorkerActionMap[TAction]['payload'],
): WorkerResult<TAction> {
  switch (action) {
    case 'compressToon':
      return compressToToon(payload) as WorkerResult<TAction>;
    case 'exportJSON':
      return exportToJSON(payload) as WorkerResult<TAction>;
    case 'compressURI':
      return compressToEncodedURIComponent(payload) as WorkerResult<TAction>;
    case 'decompressURI':
      return decompressFromEncodedURIComponent(payload) as WorkerResult<TAction>;
    case 'decompressToon':
      return decompressFromToon(payload) as WorkerResult<TAction>;
    case 'parseJSON':
      return parseJSON(payload) as WorkerResult<TAction>;
    default:
      throw new Error(`지원하지 않는 작업입니다: ${action satisfies never}`);
  }
}

function postResponse(message: RawViewWorkerResponse): void {
  ctx.postMessage(message);
}

