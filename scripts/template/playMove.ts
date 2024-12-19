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
  if (encodedMove > 0xffff)
    throw new Error(`Encoded move out of bounds: ${encodedMove}`);
  return encodedMove;
};

// Vérifie si un contrat existe à une adresse donnée
async function isContractDeployed(address) {
  const code = await hre.ethers.provider.getCode(address);
  return code !== "0x"; // Si "0x", aucun contrat n'est déployé à cette adresse
}

// Fonction pour jouer un mouvement
async function player1Move(move) {
  console.log("network", hre.network.name);

  const player1 = (await hre.ethers.getSigners())[1];
  const player2 = (await hre.ethers.getSigners())[2];

  const abi = ["event MovePlayed(address player, uint16 move)"];
  const iface = new hre.ethers.Interface(abi);

  console.log(`Using ChessTemplate at address: ${config.factory.firstGame}`);

  // Vérifie si un contrat est déployé à l'adresse
  const exists = await isContractDeployed(config.factory.firstGame);
  if (!exists) {
    throw new Error(
      `No contract deployed at address : ${config.factory.firstGame}.`
    );
  }

  const chessTemplate = await hre.ethers.getContractAt(
    "ChessTemplate",
    config.factory.firstGame,
    player1
  );

  const tx = await chessTemplate.playMove([move]);

  console.log(
    `Move is playing at game address: ${config.factory.firstGame}...`
  );

  const receipt = await tx.wait();
  console.log("Transaction receipt:", receipt);

  const isActive = await chessTemplate.isGameActive();
  console.log(`Game active status: ${isActive}`);

  if (!isActive) {
    console.error("Game is not active.");
    return;
  }

  const movePlayedEvent = receipt.logs.find((log) => {
    try {
      if (log.fragment && log.fragment.name === "MovePlayed") {
        console.log("Log already decoded:", log);
        return true;
      }
      const parsedLog = iface.parseLog(log);
      return parsedLog.name === "MovePlayed";
    } catch (error) {
      console.error("Error parsing log:", error.message);
      return false;
    }
  });

  if (movePlayedEvent) {
    const parsedEvent = iface.parseLog(movePlayedEvent);
    console.log("MovePlayed Event Details:");
    console.log(`Player: ${parsedEvent.args.player}`);
    console.log(`Move: ${parsedEvent.args.move}`);
  } else {
    console.error("MovePlayed event not found.");
  }

  console.log(`Move played successfully! Transaction Hash: ${tx.hash}`);
}

const move = encodeMove("d7", "d6");

player1Move(move).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
