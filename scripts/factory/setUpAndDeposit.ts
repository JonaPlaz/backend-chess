const hre = require("hardhat");
const config = require("../../scripts.json");

export default async function setUpAndDeposit() {
  const chessFactory = await hre.ethers.getContractAt("ChessFactory", config.factory.chessFactoryAddress);
  const chessToken = await hre.ethers.getContractAt("ChessToken", config.factory.chessTokenAddress);

  console.log("Setting Chess Token in Chess Factory...");
  await chessFactory.setChessToken(chessToken.target);

  const amountToDeposit = hre.ethers.parseUnits(config.factory.amountToDeposit, 18);

  console.log("Approving tokens for Chess Factory...");
  await chessToken.approve(chessFactory.target, amountToDeposit);

  console.log("Depositing tokens...");
  await chessFactory.depositTokens(amountToDeposit);

  console.log("Setup and deposit complete!");
}

setUpAndDeposit().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
