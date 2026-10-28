declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export const isMetaMaskFeatureEnabled =
  import.meta.env.VITE_ENABLE_METAMASK === "true" ||
  import.meta.env.VITE_ENABLE_METAMASK === true;

export interface ConnectedWallet {
  address: string;
  signature?: string;
  linkedMessage?: string;
}

export async function connectMetaMaskWallet(holderDid: string): Promise<ConnectedWallet> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "MetaMask is not installed. Please install the MetaMask browser extension or use standard DID mode."
    );
  }

  // Request user account access
  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("No Ethereum account authorized by user.");
  }

  const address = accounts[0];
  const linkedMessage = `VERIPASS Identity Binding:\nLink Ethereum account ${address}\nto Self-Sovereign DID: ${holderDid}\nTimestamp: ${new Date().toISOString()}`;

  // Request signature to cryptographically bind EVM address to DID without exposing private keys
  const signature = (await window.ethereum.request({
    method: "personal_sign",
    params: [linkedMessage, address],
  })) as string;

  return {
    address,
    signature,
    linkedMessage,
  };
}
