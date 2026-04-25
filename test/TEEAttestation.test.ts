import { expect } from "chai";
import { ethers } from "hardhat";

describe("TEEAttestation", function () {
    let agentNFT: any;
    let vault: any;
    let registry: any;
    let owner: any;
    let user: any;

    const MOCK_MRENCLAVE = ethers.keccak256(ethers.toUtf8Bytes("enclave-v1"));
    const MOCK_MRSIGNER = ethers.keccak256(ethers.toUtf8Bytes("signer-v1"));

    before(async function () {
        [owner, user] = await ethers.getSigners();

        const SealedClawAgent = await ethers.getContractFactory("SealedClawAgent");
        agentNFT = await SealedClawAgent.deploy(0n);
        await agentNFT.waitForDeployment();

        const TEEAttestationRegistry = await ethers.getContractFactory("TEEAttestationRegistry");
        registry = await TEEAttestationRegistry.deploy();
        await registry.waitForDeployment();

        const PolicyVault = await ethers.getContractFactory("PolicyVault");
        vault = await PolicyVault.deploy(await agentNFT.getAddress(), owner.address, await registry.getAddress());
        await vault.waitForDeployment();
    });

    it("should authorize enclave measurements", async function () {
        await registry.authorizeEnclave(MOCK_MRENCLAVE);
        await registry.authorizeSigner(MOCK_MRSIGNER);
        expect(await registry.verifyMeasurements(MOCK_MRENCLAVE, MOCK_MRSIGNER)).to.be.true;
    });

    it("should prevent updating key without authorized attestation", async function () {
        await agentNFT.connect(user).mintAgent("meta", { value: 0 });
        const tokenId = 0;
        const newKey = user.address;

        const fakeMrenclave = ethers.ZeroHash;
        await expect(vault.connect(user).updateAgentTeeKey(tokenId, newKey, fakeMrenclave, MOCK_MRSIGNER))
            .to.be.revertedWith("Invalid TEE attestation");
    });

    it("should allow updating key with authorized attestation", async function () {
        const tokenId = 0;
        const newKey = user.address;

        await expect(vault.connect(user).updateAgentTeeKey(tokenId, newKey, MOCK_MRENCLAVE, MOCK_MRSIGNER))
            .to.emit(vault, "TeeKeyRotated");
            
        expect(await vault.agentTeeKeys(tokenId)).to.equal(newKey);
    });
});
