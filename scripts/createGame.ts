const hre = require("hardhat");

async function createGame() {
    console.log('network', hre.network.name);
  // Adresse du contrat ChessFactory
  const chessFactoryAddress = "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9";

  // Instance du contrat ChessFactory
  const chessFactory = await hre.ethers.getContractAt("ChessFactory", chessFactoryAddress);

  // Montant du pari
  const betAmount = hre.ethers.parseUnits("50", 18);

  // Définir le timestamp de début
  const startTime = Math.floor(new Date("2024-12-12T21:00:00Z").getTime() / 1000);

  console.log(`Creating a new game with betAmount: ${betAmount} and startTime: ${startTime}...`);

  // Appeler la méthode `createGame` sur le contrat ChessFactory
  const tx = await chessFactory.createGame(betAmount, startTime);
  console.log("Transaction sent. Waiting for confirmation...");

  // Attendre que la transaction soit minée
  const receipt = await tx.wait();
  console.log("Transaction receipt:", receipt);

  console.log(`Game created successfully! Transaction Hash: ${tx.hash}`);
}

createGame().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
