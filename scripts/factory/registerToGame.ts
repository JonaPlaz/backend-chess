const hre = require("hardhat");
const config = require("../../scripts.json");

export default async function registerToGame() {
    console.log('network', hre.network.name);

    // Obtenir les signers pour utiliser plusieurs adresses
    const signers = await hre.ethers.getSigners();

    // Utilisateurs à enregistrer dans la partie
    const users = [
        { signer: signers[1], name: "Jona" },
        { signer: signers[2], name: "Bob" }
    ];

    // Boucle pour enregistrer chaque utilisateur
    for (const user of users) {
        console.log(`Registering ${user.name} with address: ${user.signer.address} to game: ${config.factory.firstGame}...`);

        // Instance du contrat ChessFactory avec un signer différent
        const chessFactory = await hre.ethers.getContractAt(
            "ChessFactory",
            config.factory.chessFactoryAddress,
            user.signer
        );

        // Appeler la méthode `registerToGame` pour chaque utilisateur
        const tx = await chessFactory.registerToGame(config.factory.firstGame);

        console.log(`Transaction sent for ${user.name}. Waiting for confirmation...`);

        console.log(`${user.name} registered successfully! Transaction Hash: ${tx.hash}`);
    }

    console.log("All users registered to the game successfully!");
}

registerToGame().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
