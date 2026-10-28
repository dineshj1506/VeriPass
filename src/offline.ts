export interface OfflineBundle {
  presentation: any;
  issuerPublicKeyPem: string;
  holderPublicKeyPem: string;
  exportedAt: string;
}

export function downloadOfflineBundle(bundle: {
  presentation: any;
  issuerPublicKeyPem: string;
  holderPublicKeyPem: string;
}) {
  const exportData: OfflineBundle = {
    ...bundle,
    exportedAt: new Date().toISOString(),
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `veripass-offline-bundle-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
