const hre = require("hardhat");
const config = require("../../scripts.json");

async function playFirstMove() {
  console.log("Network:", hre.network.name);

  // Obtenir les signers pour utiliser plusieurs adresses
  const signers = await hre.ethers.getSigners();

  // Le joueur 1 effectuant le mouvement
  const player1 = signers[1];

  // Définir les mouvements à jouer (exemple de mouvements au format uint16)
  const moves = [796];

  console.log(`Player 1 Address: ${player1.address}`);

  // Charger le contrat de jeu Chess
  const chessClone = await hre.ethers.getContractAt(
    "ChessTemplate", // Nom du contrat du jeu
    config.factory.firstGame, // Adresse de la première partie (extraite de la config)
    player1 // Signer avec le joueur 1
  );
  console.log(`Calling ChessTemplateClone#playMove on clone at: ${chessClone.target}`);
  console.log("Playing move for Player 1...");

  try {
    // Appeler la fonction playMove avec les mouvements
    const tx = await chessClone.playMove([796]);

    console.log("Transaction sent. Waiting for confirmation...");

    // Attendre la confirmation de la transaction
    const receipt = await tx.wait();

    console.log("Transaction confirmed:", receipt);

    // Vérifier les événements pour MovePlayed
    const abi = ["event MovePlayed(address indexed player, uint16 move)"];
    const iface = new hre.ethers.Interface(abi);

    const movePlayedEvent = receipt.logs.find((log) => {
      try {
        // Si le log est déjà décodé
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
      const { player, move } = movePlayedEvent.args;
      console.log(`Player Address: ${player}`);
      console.log(`Move: ${move}`);
    } else {
      console.error("MovePlayed event not found.");
    }
  } catch (error) {
    console.error("Error playing move:", error);
  }
}

playFirstMove().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
