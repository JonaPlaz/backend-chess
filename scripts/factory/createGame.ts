const hre = require("hardhat");
const config = require("../../scripts.json");

export default async function createGame() {
    console.log('network', hre.network.name);

    // Instance du contrat ChessFactory
    const chessFactory = await hre.ethers.getContractAt("ChessFactory", config.factory.chessFactoryAddress);

    // Montant du pari
    const betAmount = hre.ethers.parseUnits(config.factory.betAmount, 18);

    // Définir le timestamp de début
    const startTime = Math.floor(new Date(config.factory.startTime).getTime() / 1000);

    console.log(`Creating a new game with betAmount: ${betAmount} and startTime: ${startTime}...`);

    // Appeler la méthode `createGame` sur le contrat ChessFactory
    const tx = await chessFactory.createGame(betAmount, startTime);
    console.log("Transaction sent. Waiting for confirmation...");

    // Attendre que la transaction soit minée
    const receipt = await tx.wait();
    console.log("Transaction receipt:", receipt);

    // Rechercher l'événement `GameCreated` dans les logs
    const gameCreatedEvent = receipt.logs.find(
        log => log.fragment && log.fragment.name === "GameCreated"
    );

    if (gameCreatedEvent) {
        const gameAddress = gameCreatedEvent.args.gameAddress;
        console.log(`Game created successfully at address: ${gameAddress}`);
        console.log(`Transaction Hash: ${tx.hash}`);
    } else {
        console.error("GameCreated event not found in transaction logs.");
    }
}

createGame().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
