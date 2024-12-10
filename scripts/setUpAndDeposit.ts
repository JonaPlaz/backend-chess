const hre = require("hardhat");

async function setUpAndDeposit() {
    const chessFactory = await hre.ethers.getContractAt("ChessFactory", "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9");
    const chessToken = await hre.ethers.getContractAt("ChessToken", "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0");

    console.log("Setting Chess Token in Chess Factory...");
    await chessFactory.setChessToken(chessToken.target);

    const amountToDeposit = hre.ethers.parseUnits("10000", 18);

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
