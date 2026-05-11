import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    galileo: {
      url: process.env.RPC_URL || "https://evmrpc-testnet.0g.ai",
      chainId: 16602,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    og_mainnet: {
      url: process.env.MAINNET_RPC_URL || "https://evmrpc.0g.ai",
      chainId: 16661,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      galileo: process.env.ETHERSCAN_API_KEY || "0G_CHAINSCAN_API_KEY",
    },
    customChains: [
      {
        network: "galileo",
        chainId: 16602,
        urls: {
          apiURL: "https://explorer-api-testnet.0g.ai/api",
          browserURL: "https://chainscan-galileo.0g.ai",
        },
      },
    ],
  },
};

export default config;
