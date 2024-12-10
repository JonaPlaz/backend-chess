require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");

module.exports = {
  solidity: "0.8.27",
  networks: {
    localhost: {
      url: "http://localhost:8545",
      chainId: 31337,
    },
  },
};
