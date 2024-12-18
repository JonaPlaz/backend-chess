require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");

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
  },
};
