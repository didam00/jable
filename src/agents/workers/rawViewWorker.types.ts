import type { TableData } from '../store';

export type RawViewWorkerActionMap = {
  compressToon: { payload: TableData; result: string };
  exportJSON: { payload: TableData; result: string };
  compressURI: { payload: string; result: string };
  decompressURI: { payload: string; result: string };
  decompressToon: { payload: string; result: TableData };
  parseJSON: { payload: string; result: TableData };
};

export type RawViewWorkerAction = keyof RawViewWorkerActionMap;

export type RawViewWorkerRequest<TAction extends RawViewWorkerAction = RawViewWorkerAction> = {
  id: string;
  action: TAction;
  payload: RawViewWorkerActionMap[TAction]['payload'];
};

export type RawViewWorkerResponse = {
  id: string;
  result?: RawViewWorkerActionMap[keyof RawViewWorkerActionMap]['result'];
  error?: string;
};

