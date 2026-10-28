// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title CredentialAnchor
 * @notice Privacy-preserving cryptographic anchor registry for VeriPass credentials.
 * @dev Stores only 32-byte cryptographic hashes (commitments). Zero personal data is stored on-chain.
 */
contract CredentialAnchor {
    address public owner;

    struct AnchorRecord {
        uint256 timestamp;
        bool exists;
        bool isRevoked;
    }

    mapping(bytes32 => AnchorRecord) private anchors;

    event CredentialAnchored(bytes32 indexed commitment, address indexed indexedBy, uint256 timestamp);
    event CredentialRevoked(bytes32 indexed commitment, address indexed revokedBy, uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "CredentialAnchor: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "CredentialAnchor: new owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Anchors a 32-byte credential commitment on-chain.
     * @param commitment The sha256 or keccak256 hash of the canonical credential.
     */
    function anchor(bytes32 commitment) external onlyOwner {
        require(commitment != bytes32(0), "CredentialAnchor: commitment cannot be empty");
        require(!anchors[commitment].exists, "CredentialAnchor: credential already anchored");

        anchors[commitment] = AnchorRecord({
            timestamp: block.timestamp,
            exists: true,
            isRevoked: false
        });

        emit CredentialAnchored(commitment, msg.sender, block.timestamp);
    }

    /**
     * @notice Revokes a previously anchored credential commitment.
     * @param commitment The 32-byte commitment to revoke.
     */
    function revoke(bytes32 commitment) external onlyOwner {
        AnchorRecord storage record = anchors[commitment];
        require(record.exists, "CredentialAnchor: credential not found");
        require(!record.isRevoked, "CredentialAnchor: credential already revoked");

        record.isRevoked = true;
        emit CredentialRevoked(commitment, msg.sender, block.timestamp);
    }

    /**
     * @notice Checks if a credential commitment is active and valid (anchored and not revoked).
     */
    function isValid(bytes32 commitment) external view returns (bool) {
        AnchorRecord storage record = anchors[commitment];
        return record.exists && !record.isRevoked;
    }

    /**
     * @notice Returns detailed status for a given commitment.
     */
    function getAnchorInfo(bytes32 commitment) external view returns (bool exists, bool isRevoked, uint256 timestamp) {
        AnchorRecord storage record = anchors[commitment];
        return (record.exists, record.isRevoked, record.timestamp);
    }
}
