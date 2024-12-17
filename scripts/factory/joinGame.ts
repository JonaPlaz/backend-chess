const hre = require("hardhat");
const config = require("../../scripts.json");

async function advanceTime(seconds) {
    await hre.network.provider.send("evm_increaseTime", [seconds]);
    await hre.network.provider.send("evm_mine");
    console.log(`Time advanced by ${seconds} seconds.`);
}

export default async function joinGame() {
    console.log('network', hre.network.name);

    const chessFactoryAddress = "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9";

    // Obtenir les signers pour sélectionner l'adresse de Jona
    const signers = await hre.ethers.getSigners();
    const jona = signers[1]; // Adresse de Jona

    console.log(`Jona's address: ${jona.address}`);

    // Instance du contrat ChessFactory avec le signer de Jona
    const chessFactory = await hre.ethers.getContractAt(
        "ChessFactory",
        chessFactoryAddress,
        jona
    );

    // Avancer le temps pour atteindre le startTime
    const secondsToAdvance = 7200; // Exemple : avancer de 1 heure
    await advanceTime(secondsToAdvance);

    console.log(`Jona is joining the game at address: ${config.factory.firstGame}...`);
    const tx = await chessFactory.joinGame(config.factory.firstGame);
    const receipt = await tx.wait();

    console.log("Transaction receipt:", receipt);
    console.log(`Jona joined the game successfully! Transaction Hash: ${tx.hash}`);
}

joinGame().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
