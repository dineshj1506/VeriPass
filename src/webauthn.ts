import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";
import { api } from "./api";

export async function checkWebAuthnSupport(): Promise<{
  supported: boolean;
  platformAvailable: boolean;
  message?: string;
}> {
  const supported = browserSupportsWebAuthn();
  if (!supported) {
    return {
      supported: false,
      platformAvailable: false,
      message: "WebAuthn is not supported in this browser environment. Ensure HTTPS or localhost is used.",
    };
  }

  const platformAvailable = await platformAuthenticatorIsAvailable();
  return {
    supported: true,
    platformAvailable,
    message: platformAvailable
      ? "Platform biometric authenticator (TouchID / FaceID / Windows Hello) ready."
      : "WebAuthn supported, but platform biometric authenticator is unavailable on this device.",
  };
}

export async function registerBiometrics(did: string): Promise<{ success: boolean; credentialId?: string }> {
  const options = await api.getWebAuthnRegisterOptions(did);
  const regResponse = await startRegistration({ optionsJSON: options });
  const verifyResult = await api.verifyWebAuthnRegister(did, regResponse);
  return { success: verifyResult.verified, credentialId: verifyResult.credentialId };
}

export async function authenticateBiometrics(did: string): Promise<{ success: boolean; unlockedAt?: string }> {
  const options = await api.getWebAuthnAuthenticateOptions(did);
  const authResponse = await startAuthentication({ optionsJSON: options });
  const verifyResult = await api.verifyWebAuthnAuthenticate(did, authResponse);
  return { success: verifyResult.verified, unlockedAt: verifyResult.unlockedAt };
}
