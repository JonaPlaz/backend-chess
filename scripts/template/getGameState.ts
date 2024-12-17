const hre = require("hardhat");

async function getGameState(gameAddress) {
    console.log("network", hre.network.name);

    const signers = await hre.ethers.getSigners();
    const jona = signers[1];

    console.log(`Jona's address: ${jona.address}`);

    const chessTemplate = await hre.ethers.getContractAt(
        "ChessTemplate",
        gameAddress,
        jona
    );

    const gameState = await chessTemplate.getGameState();
    console.log("Current Turn Black:", gameState[4]); // Doit être false

    console.log("Game State:");
    console.log(`Current Turn Black: ${gameState[4]}`);
    console.log(`Game State (raw): ${gameState[5].toString()}`);

    const gameStateRaw = BigInt(gameState[5]);
    const pieceAtPosition = (gameState, pos) => {
        return Number((gameState >> BigInt(pos * 4)) & BigInt(0xf));
    };

    const isPieceWhite = (piece) => (piece & 0x8) === 0;

    // Vérification de la position e2
    const fromPos = 52; // e2
    const piece = pieceAtPosition(gameStateRaw, fromPos);

    console.log(`Piece at e2 (pos 52): ${piece}`);
    console.log(`Is piece white? ${isPieceWhite(piece)}`);
}

const gameAddress = "0xd8058efe0198ae9dD7D563e1b4938Dcbc86A1F81";
getGameState(gameAddress).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
