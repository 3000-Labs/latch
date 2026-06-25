import type { Network } from "@/lib/sign-demo/types";

export interface OpenSignRequestParams {
  network: Network;
  account: string;
  callback: string;
  requestId: string;
  xdr?: string;
  payloadRef?: string;
  submit?: boolean;
  origin?: string;
}

export interface LatchProvider {
  isConnected(): Promise<boolean>;
  getPublicKey(): Promise<string>;
  getNetwork(): Promise<Network>;
  signTransaction(request: {
    xdr: string;
    network: Network;
    accountToSign: string;
  }): Promise<{
    txHash?: string;
    signedAuthEntry?: string;
    signedTxXdr?: string;
    signedXdr?: string;
  }>;
  openSignRequest(params: OpenSignRequestParams): Promise<void>;
}

declare global {
  interface Window {
    latch?: LatchProvider;
  }
}

export {};
