const hre = require("hardhat");

const fileMap = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };

// Fonction pour encoder une case
const encodeSquare = (square) => {
    const file = fileMap[square[0]];
    const rank = parseInt(square[1], 10) - 1;
    return (rank << 3) | file; // Rangée en poids fort, colonne en poids faible
};

// Fonction pour encoder un mouvement
const encodeMove = (from, to) => {
    const fromPos = encodeSquare(from);
    const toPos = encodeSquare(to);
    const encodedMove = (fromPos << 6) | toPos;
    console.log(
        `Encoded move: from=${from} (${fromPos}), to=${to} (${toPos}), move=${encodedMove}`
    );
    return BigInt(encodedMove) & BigInt(0xFFFF);
};

async function validateAndPlayMove(gameAddress, from, to) {
    console.log("network", hre.network.name);

    const signers = await hre.ethers.getSigners();
    const jona = signers[1]; // Joueur 1

    console.log(`Jona's address: ${jona.address}`);

    const chessTemplate = await hre.ethers.getContractAt(
        "ChessTemplate",
        gameAddress,
        jona
    );

    // Vérification de l'état de l'échiquier avant le mouvement
    const gameState = await chessTemplate.getGameState();
    const rawGameState = gameState._gameState;

    const fromPos = encodeSquare(from);
    const pieceAtFrom = (rawGameState >> BigInt(fromPos * 4)) & BigInt(0xF);

    console.log(`Piece at ${from}: ${pieceAtFrom}`);

    if (pieceAtFrom !== BigInt(1)) {
        throw new Error(
            `No white pawn at ${from}. Piece found: ${pieceAtFrom.toString()}`
        );
    }

    // Encoder le mouvement
    const move = encodeMove(from, to);

    console.log(`Jona is playing the move: ${move}...`);

    const tx = await chessTemplate.playMove(move);
    const receipt = await tx.wait();

    console.log("Transaction receipt:", receipt);
    console.log(`Move played successfully! Transaction Hash: ${tx.hash}`);
}

// Adresse de la partie en cours
const gameAddress = "0xd8058efe0198ae9dD7D563e1b4938Dcbc86A1F81";

// Validation et mouvement : e2 -> e4
validateAndPlayMove(gameAddress, "e2", "e4").catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
