import { expect } from "chai";
import { ethers } from "hardhat";
import { CredentialAnchor } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("CredentialAnchor Smart Contract", function () {
  let anchorContract: CredentialAnchor;
  let owner: HardhatEthersSigner;
  let otherAccount: HardhatEthersSigner;

  const dummyCommitment = ethers.keccak256(ethers.toUtf8Bytes("demo_credential_commitment_1"));
  const dummyCommitment2 = ethers.keccak256(ethers.toUtf8Bytes("demo_credential_commitment_2"));

  beforeEach(async function () {
    [owner, otherAccount] = await ethers.getSigners();
    const CredentialAnchorFactory = await ethers.getContractFactory("CredentialAnchor");
    anchorContract = await CredentialAnchorFactory.deploy();
    await anchorContract.waitForDeployment();
  });

  it("sets deployer as contract owner", async function () {
    expect(await anchorContract.owner()).to.equal(owner.address);
  });

  it("anchors a valid commitment and emits CredentialAnchored event", async function () {
    await expect(anchorContract.anchor(dummyCommitment))
      .to.emit(anchorContract, "CredentialAnchored")
      .withArgs(dummyCommitment, owner.address, (await ethers.provider.getBlock("latest"))!.timestamp + 1);

    expect(await anchorContract.isValid(dummyCommitment)).to.be.true;
    const [exists, isRevoked] = await anchorContract.getAnchorInfo(dummyCommitment);
    expect(exists).to.be.true;
    expect(isRevoked).to.be.false;
  });

  it("rejects duplicate anchor attempt for same commitment", async function () {
    await anchorContract.anchor(dummyCommitment);
    await expect(anchorContract.anchor(dummyCommitment)).to.be.revertedWith(
      "CredentialAnchor: credential already anchored"
    );
  });

  it("rejects zero-hash commitment", async function () {
    await expect(anchorContract.anchor(ethers.ZeroHash)).to.be.revertedWith(
      "CredentialAnchor: commitment cannot be empty"
    );
  });

  it("revokes an anchored credential and marks it invalid", async function () {
    await anchorContract.anchor(dummyCommitment);
    expect(await anchorContract.isValid(dummyCommitment)).to.be.true;

    await expect(anchorContract.revoke(dummyCommitment))
      .to.emit(anchorContract, "CredentialRevoked");

    expect(await anchorContract.isValid(dummyCommitment)).to.be.false;
    const [exists, isRevoked] = await anchorContract.getAnchorInfo(dummyCommitment);
    expect(exists).to.be.true;
    expect(isRevoked).to.be.true;
  });

  it("rejects revoke on unknown (non-anchored) commitment", async function () {
    await expect(anchorContract.revoke(dummyCommitment2)).to.be.revertedWith(
      "CredentialAnchor: credential not found"
    );
  });

  it("rejects double revoke on already-revoked commitment", async function () {
    await anchorContract.anchor(dummyCommitment);
    await anchorContract.revoke(dummyCommitment);

    await expect(anchorContract.revoke(dummyCommitment)).to.be.revertedWith(
      "CredentialAnchor: credential already revoked"
    );
  });

  it("enforces owner-only access for anchor and revoke", async function () {
    const contractFromOther = anchorContract.connect(otherAccount);

    await expect(contractFromOther.anchor(dummyCommitment)).to.be.revertedWith(
      "CredentialAnchor: caller is not the owner"
    );

    await anchorContract.anchor(dummyCommitment);

    await expect(contractFromOther.revoke(dummyCommitment)).to.be.revertedWith(
      "CredentialAnchor: caller is not the owner"
    );
  });
});
