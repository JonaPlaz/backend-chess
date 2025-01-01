require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const { INFURA_API_KEY, METAMASK_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Réduire davantage si nécessaire, mais 200 est un bon équilibre entre taille et coût du gas
      },
    },
  },
  networks: {
    localhost: {
      url: "http://localhost:8545",
      chainId: 31337,
      loggingEnabled: true,
    },
    holesky: {
      url: `https://rpc.holesky.ethpandaops.io/${INFURA_API_KEY}`,
      accounts: METAMASK_PRIVATE_KEY ? [`0x${METAMASK_PRIVATE_KEY}`] : [],
      chainId: 17000,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  },
};
