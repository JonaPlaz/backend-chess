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

// Fonction pour jouer un mouvement
async function playMove(move) {
  const player1 = (await hre.ethers.getSigners())[1];
  const chessTemplate = await hre.ethers.getContractAt("ChessTemplate", config.factory.firstGame, player1);

  console.log("Playing the first move...");
  const tx = await chessTemplate.playMove([move]);
  await tx.wait();
  console.log(`Move played successfully! Transaction Hash: ${tx.hash}`);
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
