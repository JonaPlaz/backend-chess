const hre = require("hardhat");
const config = require("../../scripts.json");

export default async function createGame() {
  console.log("network", hre.network.name);

  // Instance du contrat ChessFactory
  const chessFactory = await hre.ethers.getContractAt("ChessFactory", config.factory.chessFactoryAddress);

  // Montant du pari
  const betAmount = hre.ethers.parseUnits(config.factory.betAmount, 18);

  // Définir un temps de départ (dans 1 ou 2 minutes pour l’exemple)
  const startTime = Math.floor(Date.now() / 1000) + 120;

  console.log(`Creating a new game with betAmount: ${betAmount} and startTime: ${startTime}...`);

  // Appeler la méthode `createGame` sur le contrat ChessFactory
  const tx = await chessFactory.createGame(betAmount, startTime);
  console.log("Transaction sent. Waiting for confirmation...");

  // Attendre que la transaction soit minée
  const receipt = await tx.wait();
  console.log("Transaction receipt:", receipt);

  // Définir l'ABI de l'événement pour le décodage
  const abi = ["event GameCreated(address indexed gameAddress, uint256 betAmount, uint256 startTime)"];

  const iface = new hre.ethers.Interface(abi);

  // Parcourir les logs et rechercher l'événement `GameCreated`
  const gameCreatedEvent = receipt.logs.find((log) => {
    try {
      const parsedLog = iface.parseLog(log);
      return parsedLog.name === "GameCreated";
    } catch (error) {
      return false;
    }
  });

  if (gameCreatedEvent) {
    // Décoder l'événement complet
    const parsedEvent = iface.parseLog(gameCreatedEvent);

    // Convertir BigInt en chaîne pour JSON.stringify
    const eventDetails = JSON.stringify(
      parsedEvent,
      (key, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    );

    console.log("GameCreated Event Details:");
    console.log(eventDetails); // Afficher l'événement complet avec les BigInt convertis

    // Afficher les arguments principaux séparément
    const { gameAddress, betAmount, startTime } = parsedEvent.args;
    console.log(`Game created successfully at address: ${gameAddress}`);
    console.log(`Bet Amount: ${betAmount}`);
    console.log(`Start Time: ${startTime}`);
  } else {
    console.error("GameCreated event not found in transaction logs.");
  }
}

createGame().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
