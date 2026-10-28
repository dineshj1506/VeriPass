import { ethers } from "ethers";
import { canonical, sha256 } from "./crypto.js";
// ABI for CredentialAnchor
const ANCHOR_ABI = [
    "function anchor(bytes32 commitment) external",
    "function revoke(bytes32 commitment) external",
    "function isValid(bytes32 commitment) external view returns (bool)",
    "event CredentialAnchored(bytes32 indexed commitment, address indexed indexedBy, uint256 timestamp)",
    "event CredentialRevoked(bytes32 indexed commitment, address indexed revokedBy, uint256 timestamp)",
];
export function computeCredentialCommitment(credential) {
    // 32-byte commitment is sha256 of canonical credential doc plus its proof signature
    const preimage = canonical({
        id: credential.id,
        issuer: credential.issuer,
        subject: credential.subject,
        issuedAt: credential.issuedAt,
        claimDigests: credential.claimDigests,
        proofValue: credential.proof.proofValue,
    });
    return "0x" + sha256(preimage);
}
export async function checkOnChainStatus(commitment) {
    const rpcUrl = process.env.CHAIN_RPC_URL;
    const contractAddress = process.env.CHAIN_CONTRACT_ADDRESS;
    if (!rpcUrl || !contractAddress) {
        return { configured: false };
    }
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(contractAddress, ANCHOR_ABI, provider);
        const isValid = await contract.isValid(commitment);
        return {
            configured: true,
            contractAddress,
            isAnchored: true,
            isValid: Boolean(isValid),
        };
    }
    catch (err) {
        return {
            configured: true,
            contractAddress,
            isAnchored: false,
            isValid: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
export async function anchorOnChain(commitment) {
    const rpcUrl = process.env.CHAIN_RPC_URL;
    const contractAddress = process.env.CHAIN_CONTRACT_ADDRESS;
    const privateKey = process.env.CHAIN_PRIVATE_KEY;
    if (!rpcUrl || !contractAddress || !privateKey) {
        return { error: "Chain environment variables not fully configured" };
    }
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = new ethers.Contract(contractAddress, ANCHOR_ABI, wallet);
        const tx = await contract.anchor(commitment);
        await tx.wait();
        return { txHash: tx.hash };
    }
    catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
export async function revokeOnChain(commitment) {
    const rpcUrl = process.env.CHAIN_RPC_URL;
    const contractAddress = process.env.CHAIN_CONTRACT_ADDRESS;
    const privateKey = process.env.CHAIN_PRIVATE_KEY;
    if (!rpcUrl || !contractAddress || !privateKey) {
        return { error: "Chain environment variables not configured" };
    }
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = new ethers.Contract(contractAddress, ANCHOR_ABI, wallet);
        const tx = await contract.revoke(commitment);
        await tx.wait();
        return { txHash: tx.hash };
    }
    catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
