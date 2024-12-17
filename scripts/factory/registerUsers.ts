const hre = require("hardhat");
const config = require("../../scripts.json");

export default async function registerUsers() {
  console.log("network", hre.network.name);

  // Obtenir des signers pour tester avec différentes adresses
  const signers = await hre.ethers.getSigners();

  // Définir les noms des utilisateurs à enregistrer
  const users = [
    { signer: signers[1], name: config.factory.userNames[0] },
    { signer: signers[2], name: config.factory.userNames[1] },
    { signer: signers[3], name: config.factory.userNames[2] },
  ];

  // Boucler pour enregistrer chaque utilisateur
  for (const user of users) {
    console.log(`Registering user: ${user.name} with address: ${user.signer.address}...`);

    // Instance du contrat ChessFactory avec un signer différent
    const chessFactory = await hre.ethers.getContractAt(
      "ChessFactory",
      config.factory.chessFactoryAddress,
      user.signer
    );

    // Appeler la méthode `registerUser` pour chaque utilisateur
    const tx = await chessFactory.registerUser(user.name);
    console.log(`Transaction sent for ${user.name}. Waiting for confirmation...`);

    // Attendre la confirmation de la transaction
    const receipt = await tx.wait();
    console.log(`User ${user.name} registered successfully! Transaction Hash: ${tx.hash}`);
  }

  console.log("All users registered successfully!");
}

registerUsers().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
