export interface OfflineVerificationResult {
  allPassed: boolean;
  results: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
}

export function verifyOfflineBundle(bundle: {
  presentation: any;
  issuerPublicKeyPem: string;
  holderPublicKeyPem: string;
}): OfflineVerificationResult;
