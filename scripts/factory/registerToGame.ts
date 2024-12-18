const hre = require("hardhat");
const config = require("../../scripts.json");

export default async function registerToGame() {
  console.log("network", hre.network.name);

  // Obtenir les signers pour utiliser plusieurs adresses
  const signers = await hre.ethers.getSigners();

  // Utilisateurs à enregistrer dans la partie
  const users = [
    { signer: signers[1], name: "Jona" },
    { signer: signers[2], name: "Bob" },
  ];

  // ABI de l'événement pour le décodage
  const abi = ["event PlayerRegistered(address indexed gameAddress, address indexed player)"];
  const iface = new hre.ethers.Interface(abi);

  // Boucle pour enregistrer chaque utilisateur
  for (const user of users) {
    console.log(
      `Registering ${user.name} with address: ${user.signer.address} to game: ${config.factory.firstGame}...`
    );

    // Instance du contrat ChessFactory avec un signer différent
    const chessFactory = await hre.ethers.getContractAt(
      "ChessFactory",
      config.factory.chessFactoryAddress,
      user.signer
    );

    // Appeler la méthode `registerToGame` pour chaque utilisateur
    const tx = await chessFactory.registerToGame(config.factory.firstGame);

    console.log(`Transaction sent for ${user.name}. Waiting for confirmation...`);

    // Attendre la confirmation de la transaction
    const receipt = await tx.wait();
    console.log(`Transaction receipt for ${user.name}:`, receipt);

    // Rechercher et décoder l'événement `PlayerRegistered`
    const playerRegisteredEvent = receipt.logs.find((log) => {
      try {
        const parsedLog = iface.parseLog(log);
        return parsedLog.name === "PlayerRegistered";
      } catch (error) {
        return false;
      }
    });

    if (playerRegisteredEvent) {
      // Décoder l'événement
      const parsedEvent = iface.parseLog(playerRegisteredEvent);

      // Convertir les `BigInt` en chaînes pour affichage
      const eventDetails = JSON.stringify(
        parsedEvent,
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      );

      console.log("PlayerRegistered Event Details:");
      console.log(eventDetails);

      // Afficher les arguments principaux séparément
      const { gameAddress, player } = parsedEvent.args;
      console.log(`Game Address: ${gameAddress}`);
      console.log(`Player Address: ${player}`);
    } else {
      console.error(`PlayerRegistered event not found for ${user.name}.`);
    }
  }

  console.log("All users registered to the game successfully!");
}

registerToGame().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
