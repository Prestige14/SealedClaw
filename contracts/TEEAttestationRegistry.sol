// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TEEAttestationRegistry
 * @notice Stores authorized TEE enclave measurements (MRENCLAVE, MRSIGNER).
 *         Used by PolicyVault to verify attestation quotes.
 *         In a real 0G deployment, this would interface with the 0G 
 *         Attestation Verifier protocol.
 */
contract TEEAttestationRegistry is Ownable {
    // Authorized enclave measurements
    mapping(bytes32 => bool) public authorizedEnclaves; // mrenclave hash
    mapping(bytes32 => bool) public authorizedSigners;  // mrsigner hash

    event EnclaveAuthorized(bytes32 indexed mrenclave);
    event EnclaveRevoked(bytes32 indexed mrenclave);
    event SignerAuthorized(bytes32 indexed mrsigner);
    event SignerRevoked(bytes32 indexed mrsigner);

    constructor() Ownable(msg.sender) {}

    function authorizeEnclave(bytes32 mrenclave) external onlyOwner {
        authorizedEnclaves[mrenclave] = true;
        emit EnclaveAuthorized(mrenclave);
    }

    function revokeEnclave(bytes32 mrenclave) external onlyOwner {
        authorizedEnclaves[mrenclave] = false;
        emit EnclaveRevoked(mrenclave);
    }

    function authorizeSigner(bytes32 mrsigner) external onlyOwner {
        authorizedSigners[mrsigner] = true;
        emit SignerAuthorized(mrsigner);
    }

    function revokeSigner(bytes32 mrsigner) external onlyOwner {
        authorizedSigners[mrsigner] = false;
        emit SignerRevoked(mrsigner);
    }

    /**
     * @notice Verifies if the given measurements are authorized.
     */
    function verifyMeasurements(bytes32 mrenclave, bytes32 mrsigner) external view returns (bool) {
        return authorizedEnclaves[mrenclave] && authorizedSigners[mrsigner];
    }
}
