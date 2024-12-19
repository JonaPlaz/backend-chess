const hre = require("hardhat");
const config = require("../../scripts.json");

async function advanceTime(seconds) {
  await hre.network.provider.send("evm_increaseTime", [seconds]);
  await hre.network.provider.send("evm_mine");
  console.log(`Time advanced by ${seconds} seconds.`);
}

export default async function joinGame() {
  console.log("network", hre.network.name);

  // Obtenir les signers pour sélectionner l'adresse de Jona
  const signers = await hre.ethers.getSigners();
  const jona = signers[1]; // Adresse de Jona

  const abi = [
    "event GameStarted(address indexed gameAddress, address indexed player1, address indexed player2, uint256 betAmount, uint256 startTime)",
  ];
  const iface = new hre.ethers.Interface(abi);

  // Instance du contrat ChessFactory avec le signer de Jona
  const chessFactory = await hre.ethers.getContractAt("ChessFactory", config.factory.chessFactoryAddress, jona);

  // Avancer le temps pour atteindre le startTime
  const secondsToAdvance = 7200; // Exemple : avancer de 1 heure
  await advanceTime(secondsToAdvance);

  const tx = await chessFactory.joinGame(config.factory.firstGame);

  console.log(`Jona is joining the game at address: ${config.factory.firstGame}...`);

  const receipt = await tx.wait();
  console.log("Transaction receipt:", receipt);

  // Rechercher et décoder l'événement `GameStarted`
  const gameStartedEvent = receipt.logs.find((log) => {
    try {
      // Si le log est déjà décodé
      if (log.fragment && log.fragment.name === "GameStarted") {
        console.log("Log already decoded:", log);
        return true;
      }
      const parsedLog = iface.parseLog(log);
      return parsedLog.name === "GameStarted";
    } catch (error) {
      console.error("Error parsing log:", error.message);
      return false;
    }
  });

  if (gameStartedEvent) {
    const { gameAddress, player1, player2, betAmount, startTime } = gameStartedEvent.args;
    console.log(`Game Address: ${gameAddress}`);
    console.log(`Player 1 Address: ${player1}`);
    console.log(`Player 2 Address: ${player2}`);
    console.log(`Bet Amount: ${betAmount}`);
    console.log(`Start Time: ${startTime}`);
  } else {
    console.error("GameStarted event not found.");
  }

  console.log(`Jona joined the game successfully! Transaction Hash: ${tx.hash}`);
}

joinGame().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
