const hre = require("hardhat");
const config = require("../../scripts.json");

const fileMap = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };

// Fonction pour encoder une case d'échiquier
const encodeSquare = (square) => {
  const file = fileMap[square[0]];
  const rank = parseInt(square[1], 10) - 1;
  const encoded = (rank << 3) | file;

  if (encoded < 0 || encoded > 63) throw new Error(`Invalid square: ${square}`);
  return encoded;
};

// Fonction pour encoder un mouvement
const encodeMove = (from, to) => {
  const encodedMove = (encodeSquare(from) << 6) | encodeSquare(to);
  if (encodedMove > 0xffff) throw new Error(`Encoded move out of bounds: ${encodedMove}`);
  return encodedMove;
};

// Vérifie si un contrat existe à une adresse donnée
async function isContractDeployed(address) {
  const code = await hre.ethers.provider.getCode(address);
  return code !== "0x"; // Si "0x", aucun contrat n'est déployé à cette adresse
}

// Interagit avec le contrat pour jouer un mouvement
async function interactWithContract(chessTemplate, move) {
  console.log("Playing the first move...");
  const tx = await chessTemplate.playMove([move]);
  const receipt = await tx.wait();

  console.log(`Move played successfully! Transaction Hash: ${tx.hash}`);
  return receipt;
}

// Fonction pour jouer un mouvement
async function playMove(move) {
  const player1 = (await hre.ethers.getSigners())[1];
  const contractAddress = config.factory.firstGame;

  console.log(`Using ChessTemplate at address: ${contractAddress}`);

  // Vérifie si un contrat est déployé à l'adresse
  const exists = await isContractDeployed(contractAddress);
  if (!exists) {
    throw new Error("No contract deployed at this address.");
  }

  const chessTemplate = await hre.ethers.getContractAt("ChessTemplate", contractAddress, player1);

  // Vérifie l'état du jeu
  const isActive = await chessTemplate.isGameActive();
  console.log(`Game active status: ${isActive}`);

  if (!isActive) {
    console.error("Game is not active. Aborting playMove.");
    return;
  }

  // Joue le mouvement
  const receipt = await interactWithContract(chessTemplate, move);

  // Décodage de l'événement `MovePlayed`
  const abi = ["event MovePlayed(address indexed player, uint16 move)"];
  const iface = new hre.ethers.Interface(abi);

  const movePlayedEvent = receipt.logs.find((log) => {
    try {
      const parsedLog = iface.parseLog(log);
      return parsedLog.name === "MovePlayed";
    } catch (error) {
      return false;
    }
  });

  if (movePlayedEvent) {
    const parsedEvent = iface.parseLog(movePlayedEvent);

    console.log("MovePlayed Event Details:");
    console.log(`Player: ${parsedEvent.args.player}`);
    console.log(`Move: ${parsedEvent.args.move}`);
  } else {
    console.error("MovePlayed event not found in transaction logs.");
    console.log("Logs:", receipt.logs);
  }
}

// Exécution principale
(async () => {
  try {
    const firstMove = encodeMove("e2", "e4");
    console.log(`First move encoded: ${firstMove}`);
    await playMove(firstMove);
  } catch (error) {
    console.error("Error:", error.message);
    if (error.data) console.error("Revert reason:", error.data);
    process.exitCode = 1;
  }
})();
