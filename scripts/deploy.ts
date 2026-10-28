import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying CredentialAnchor with account:", deployer.address);

  const CredentialAnchor = await ethers.getContractFactory("CredentialAnchor");
  const anchor = await CredentialAnchor.deploy();
  await anchor.waitForDeployment();

  const address = await anchor.getAddress();
  console.log("CredentialAnchor successfully deployed to:", address);
  console.log("Save this address in server/.env as CHAIN_CONTRACT_ADDRESS=" + address);
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
